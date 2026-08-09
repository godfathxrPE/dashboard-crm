# Learnings & Gotchas

Hard-won knowledge from 40+ спринтов. **Read before every sprint prompt.**

---

## Supabase

### ❌ Never override `storageKey` or `flowType` in Supabase client
**What happens**: browser/server session mismatch → infinite redirect loops on auth.
**Fix**: use default Supabase client config. No overrides.
**Correction (2026-06-12)**: ранее запись называла `flowType: 'pkce'` причиной —
мисдиагноз. Default в @supabase/ssr — `'pkce'`, и он корректен. Ломает именно
override, в частности `flowType: 'implicit'` (рушит server-side code exchange).
Не переопределяй flowType вообще.

### ❌ Never use generic trigger functions for multiple tables
**What happens**: `OLD.column_name` references resolve at parse time, not runtime.
A trigger function that branches on `TG_TABLE_NAME` and references `OLD.name`
will fail on tables that don't have a `name` column — even inside an
`IF TG_TABLE_NAME = 'projects'` block.
**Fix**: one trigger function per table (migration 011).

### ❌ Never clean up FK references client-side on DELETE
**What happens**: RLS blocks the client from updating rows in other tables
(e.g., setting `project_id = NULL` on tasks when deleting a project).
**Fix**: use `ON DELETE SET NULL` or `ON DELETE CASCADE` at the database level.
The DB handles FK cleanup before RLS is evaluated.

### ❌ Never use `supabase db push` or CLI migration tools
**What happens**: schema drift, migration conflicts, broken state.
**Fix**: **apply — операция гейта через Supabase MCP** (`apply_migration` → gen-types →
advisors → ролевые смоки), не CLI и не ручной прогон в SQL Editor. Claude Code пишет
`supabase/migrations/0NN_name.sql`, коммитит и на этом останавливается.
_(До 2026-08-05 здесь стоял до-гейтовый реликт — «прогнать SQL руками в дашборде», —
прямо противоречивший действующему контракту. Заменён.)_

### ✅ Always add `IF NOT EXISTS` to ALTER TABLE / CREATE INDEX
Prevents errors when re-running migrations or when column already exists.

### ✅ Always make new FK columns nullable with `ON DELETE SET NULL`
Unless it's a junction table (CASCADE) or owned resource (CASCADE).
Non-nullable FKs cause delete failures when parent is removed.

### ✅ activity_log.project_id must be nullable
Deleted entities have no project. Entity-deletion log entries need `project_id = NULL`.

### ⚠️ Дефолтные model-строки в edge — сверять с docs на гейте; смена через env
Хардкод `model: 'claude-…'` в edge-функции устаревает молча. Дефолт держи через
`Deno.env.get('AI_…_MODEL') ?? '<строка>'`, а саму строку **сверяй с актуальным списком
моделей на гейте перед деплоем** (S-AI-1: `claude-sonnet-4-6 → claude-sonnet-5` поправили
именно на гейте). Смена модели в проде — через env-переменную секрета, **не редеплой**
функции. Так же сделано в S28 (`AI_SUMMARY_MODEL`).

---

## Multi-tenancy & RLS (фаза 1, S23–S26)

### ❌ Self-referencing RLS policy → infinite recursion (42P17)
Политика на таблице, чей `USING` делает подзапрос к **той же** таблице
(`memberships` проверяет членство через `memberships`), падает с
`infinite recursion detected in policy` — RLS применяется и к подзапросам внутри
политик. **Fix**: выносить проверку в `SECURITY DEFINER` helper (`is_org_member`),
который RLS обходит (021).

### ✅ Initplan-паттерн: оборачивай вызовы в `( SELECT ... )`
`( SELECT auth.uid() )`, `( SELECT public.current_org_role() )` — no-arg STABLE
функции планировщик вычисляет **один раз** на запрос (initplan), а не per-row.
Голый `current_org_role()` или параметризованный `shares_org_with(id)` —
вычисляется на каждую строку. Все org-политики используют обёртку (023).

### ✅ Hardening-конвенция для КАЖДОЙ новой функции
`SECURITY DEFINER SET search_path = public, pg_temp` + адресный ACL:
- **RLS/RPC-helpers** (зовёт клиент): `REVOKE anon`, `GRANT authenticated, service_role`.
- **Триггерные** (зовёт только триггер): `GRANT service_role` только — EXECUTE
  проверяется при `CREATE TRIGGER`, не при срабатывании, поэтому authenticated
  не нужен. Без `search_path` advisors ругается (mutable search_path).

### ❌ Service-контекст: `auth.uid()` = NULL → `current_org_id()` = NULL
В SQL Editor / MCP / фоне JWT нет → helpers возвращают NULL. Триггеры, пишущие
в NOT NULL `org_id`, обязаны наследовать его из строки:
`org_id = COALESCE(OLD.org_id, current_org_id())` (delete-логи),
`COALESCE(NEW.org_id, ...)` (stage-sync). Иначе `NOT NULL` роняет запись — а под
`EXCEPTION WHEN OTHERS` лог **молча теряется** (инцидент S24, фикс 024).

### ✅ `trg_set_org_id` заполняет `org_id` только при NULL
Явно переданное значение (из OLD/NEW в definer-триггере) переживает BEFORE INSERT.
На org-инфру (invitations/notifications) триггер НЕ вешается — org_id всегда явный.

### ⚠️ Member-гард в SECURITY DEFINER функции — только для auth-контекста
Гард владения/членства (`IF NOT is_org_member(...) THEN RAISE 42501`) в
SECURITY DEFINER функции оборачивай в `auth.uid() IS NOT NULL AND ...`. Иначе в
service-контексте (`auth.uid() IS NULL`: бэкфиллы, MCP/SQL Editor, автоматизация,
служебные операции) гард ложно срабатывает и роняет легитимную операцию `42501`.
Поймали на гейте 027 (S27): member-гард в `check_stage_requirements` падал бы на
ЛЮБОМ служебном UPDATE стадии. **Ключевое:** гард защищает только RPC-поверхность
(чужие org через прямой вызов) — сами бизнес-проверки должны идти ПОСЛЕ гарда и
выполняться для всех контекстов (в service-режиме доверяем вызывающему коду).
Симметрично записи org_id: там `COALESCE(..., current_org_id())` (см. выше) —
service-контекст обрабатывается явно, не через отказ.

### ❌ SECURITY DEFINER: сравнение с `current_org_id()`/`current_org_role()` — ТОЛЬКО NULL-safe
В императивной SECURITY DEFINER-функции гард вида `IF v_row.org_id <> current_org_id()
THEN RAISE 42501` **дырявый**: при `current_org_id() IS NULL` (authenticated без
membership — существуют в invite-flow S26; service-контекст) сравнение `<> NULL` даёт
`NULL` → `IF NULL` не срабатывает → **оба гарда молча пропускают**, чужак проходит.
Аналогично `current_org_role() NOT IN (...)`: `NULL NOT IN (...)` = `NULL` → пропуск.
**Fix**: NULL-safe и явный отказ без org-контекста:
```sql
IF public.current_org_id() IS NULL
   OR v_row.org_id IS DISTINCT FROM public.current_org_id() THEN
  RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END IF;
IF COALESCE(public.current_org_role(), '') NOT IN ('owner','admin') AND ... THEN ...
```
Поймали на гейте PCT-1: дыра в `delete_project_column` **подтверждена направленным
смоком** (чужак удалял пустую не-последнюю колонку любого тенанта) и **закрыта в 033**.
**Отличие от RLS-политик**: там NULL в `USING` = deny (безопасно по умолчанию) — дыра
специфична ИМПЕРАТИВНЫМ проверкам в функциях. Симметрично member-гарду выше: NULL-контекст
обрабатывай явно, не полагайся на «само отсечётся».
**Ещё раз в S-DEPS-1 B1 (048):** DEFINER-валидатор `check_task_dependency_valid()` читает
`tasks` в обход RLS — обе задачи ребра обязаны быть `= current_org_id()` вызывающего, под
`auth.uid() IS NOT NULL`, NULL-safe. Иначе cross-tenant ребро между задачами разных орг по
известным UUID. Тот же паттерн, новое место — DEFINER + чтение чужих строк = всегда явный org-гард.

### ⚠️ EXCEPTION-политика: валидатор НЕ глотает, исполнитель глотает (S27 ↔ S29)
Противоположные политики `EXCEPTION` для двух классов триггеров на одной таблице:
- **BEFORE-валидатор** (гейт `aa_enforce_stage_gate`, S27) — **НЕ глотает**:
  его работа — заблокировать операцию (`RAISE ... ERRCODE`). Глотание убило бы
  смысл гейта.
- **AFTER-исполнитель** (автоматизация `run_stage_automations`, S29) — **глотает
  всё**: побочное действие (создать задачу) НИКОГДА не должно ронять исходную
  операцию (переход стадии). Два уровня: внешний `EXCEPTION WHEN OTHERS THEN
  RETURN NEW` (весь исполнитель) + вложенный `BEGIN/EXCEPTION` на каждый элемент
  цикла (падение одного правила не гасит остальные).
Симметрично: `notify_*`-триггеры (S26) — тоже AFTER-исполнители, тоже глотают.
**Композиция вместо дублирования**: S29 не пишет уведомление руками — задача с
`assigned_to` триггерит `notify_task_assigned` (S26). Строй новую механику как
INSERT, дёргающий уже существующий триггерный конвейер.

### ✅ Порядок триггеров именем: `aa_` — первым, `zz_` — последним
Postgres вызывает триггеры одного события в алфавитном порядке имени. Гейт S27 —
`trg_aa_enforce_stage_gate` (отклонить ДО синков). Автоматизация S29 —
`trg_zz_run_automations` (сработать ПОСЛЕ всех BEFORE-синков и AFTER-логов, по
финальным `NEW`). Префикс — сознательный инструмент упорядочивания.

### ❌ Живое тело функции ≠ файл миграции в репо
`CREATE OR REPLACE FUNCTION` бери из `pg_get_functiondef(oid)` (там реальные
`SECURITY DEFINER`/`search_path`/тело), меняй минимально. `convert_lead` в репо
ссылался на `companies/contacts/projects.user_id` — колонок нет (владение через
`owner_id`/`created_by`), **прод был сломан** (42703), поймали только на гейте
применения 024. Всегда сверяй тело интроспекцией перед правкой.

### ❌ Volatile-функция с side effects: изменения не видны подзапросам того же statement
Postgres statement видит снапшот на начало. `UPDATE ... RETURNING` внутри CTE +
проверочный `SELECT` в том же запросе → SELECT не увидит изменений. Проверочные
чтения (`apply_pending_invites` идемпотентность) — **отдельным** запросом.

### ⚠️ projects: `direction`/`pipeline_id`/`stage_id` — NOT NULL только для `type='client'` (с 032)
До PCT-1 (032) все три были NOT NULL — вставки в projects падали без них. **С 032**
они **nullable**, но связаны CHECK-инвариантом `projects_type_pipeline_chk`:
`type='client'` → все три NOT NULL; `type='internal'` → `pipeline_id`/`stage_id` NULL
(internal-проект вне воронки). Sid/smoke клиентских сделок по-прежнему передают все три;
internal — передают `type='internal'` + стадийные поля `null` (иначе инвариант падает).
Legacy `stage` у internal зануляет `trg_ab_null_internal_stage` (DEFAULT `new_lead`
сохранён ради convert_lead).

### ❌ Перенос сортировки из JS в SQL: `getTime()` режет до миллисекунд, Postgres считает микросекунды
`new Date(ts).getTime()` **отбрасывает** разряды мельче миллисекунды, поэтому две записи
одной транзакции (Δ ≈ 100–600 мкс) для JS — ничья, и стабильный `Array#sort` оставляет
их в порядке источников. `order by ts desc` в SQL видит разницу и меняет их местами.
На S-TL-1 это разошлось в трёх парах `task`/`activity` из ста — и нашлось только потому,
что эталон снимался ДО правок. **Переносишь сортировку в БД — переноси и разрешение:**
`order by date_trunc('milliseconds', ts) desc, <ранг источника>, <позиция внутри источника>`,
где ранг повторяет порядок конкатенации массивов в прежнем JS. Тот же класс, что ключ
идемпотентности из `timestamptz`: разница представлений времени, а не логики.

### ❌ `x = any((select arr from cte))` — это ANY(**subquery**), а не ANY(array)
Вынес список литералов в CTE, чтобы не дублировать его по веткам, — и получил
`42883 operator does not exist: text = text[]`. Причина не в типах CTE: Postgres видит
подзапрос в аргументе `any()` и выбирает форму «сравни с каждой СТРОКОЙ результата», а
строка там одна и она типа `text[]`. Лечится кастом, который превращает подзапрос в
выражение: `= any((select arr from cte)::text[])` — либо формой `in (select u from cte,
lateral unnest(arr) u)`. Ошибка парсится до выполнения, поэтому ловится первым же
прогоном тела функции как обычного SELECT — но только если такой прогон вообще делается.

### ✅ Границу видимости в «глобальном» режиме RPC держит RLS, а не второй предикат
У функции ленты появился режим `p_entity_type='org'`, где предикат сущности снимается
целиком. Соблазн дописать `and org_id = current_org_id()` силён и неверен: это копия
предиката политики, которая разойдётся с ней при первом изменении RLS, и разойдётся
молча — лента покажет лишнее. Правильный ответ — `SECURITY INVOKER` и ничего сверх
него; проверяется ролевым смоком (`manager`-не-участник не видит чужих задач в
org-режиме). Тот же принцип, по которому в проекте не заводится вторая функция
`org_timeline()` с копией тела: копия — это будущее расхождение с оригиналом.

### ❌ Отсечка курсора СНАРУЖИ union держится на запасе кандидатов — фильтр её убивает
Keyset-пагинация по union нескольких источников: ветка отбирает свои топ-N по **грубой**
отсечке (`ts <= p_before`), точная — по паре `(ts, id)` — стоит снаружи. Пока веток
много, выброшенное снаружи покрывается запасом (6 × 50 кандидатов против 50 в выдаче),
и схема выглядит рабочей. **Первый же параметр, сужающий выборку до одной ветки
(`p_kinds`), запас снимает:** если курсор попал в середину блока строк с одинаковым `ts`,
снаружи отбрасывается всё отобранное, страница выходит короче лимита — и клиент,
у которого «неполная страница = дно», встаёт **на живом хвосте**, без ошибки и без
признака. На S-TL-3 это стоило бы 30 задач из 40 у одной сделки (вторая страница
приходила пустой). **Правило: точная отсечка живёт ВНУТРИ каждой ветки, рядом с грубой.**
Грубая остаётся ради index scan, внешняя — страховкой на случай новой ветки без
внутренней. Обе половины пары — на той же оси, что и `ts` ветки (у `meetings` — по
UTC-выражению, хотя `order by` идёт по сырой `date` ради индекса). Проверяется только
прогоном по страницам до пустой: одиночный вызов выглядит корректным.

### ❌ `const f = client.method` отрывает `this` — и React Query делает сбой немым
Обход отсутствующего типа через `const rpc = supabase.rpc as unknown as F` ломает
рантайм: методы supabase-js читают `this.rest`, оторванный вызов бросает TypeError
**до сети**. React Query ловит бросок из `queryFn` и по умолчанию молчит — экран
показывает пустое состояние, консоль чиста, логи БД чисты, запроса в сети нет.
Диагностика уходит в серверную часть, где всё исправно (на S-TL-1 функция в проде
отдавала честные 100 строк, RLS и порядок были проверены — а лента была пуста).
**Правило: кастуй объект (`createClient() as unknown as { rpc: F }`), никогда не
метод.** И: пустое состояние компонента обязано отличаться от состояния ошибки —
иначе класс дефектов «queryFn бросил» не имеет симптома вовсе. Тест на чистый
адаптер такое не ловит по построению: дефект в вызове, а не в разборе ответа —
мок клиента должен читать `this` так же, как настоящий
(`tests/unit/entity-timeline-rpc-this.test.tsx`).

### ✅ Ownership — через `owner_id`/`created_by`, НЕ `user_id`
companies/contacts/projects/tasks/calls/meetings/activities владеют через
`owner_id`/`created_by` (→ profiles). `user_id` (→ auth.users) остался только у
leads, activity_log, project_files, dashboard_sync. Не пиши `.user_id` для CRM-ядра.

---

## Процесс DB-спринтов (контракт фазы 1 — работает, сохранять)

### ✅ Миграции ≠ источник истины — разведка живой БД обязательна
Перед каждым спринтом с DB-изменениями: интроспекция через Supabase MCP
(read-only) — `information_schema`, `pg_policies`, `pg_get_functiondef`,
`pg_enum`, `pg_publication_tables`, `supabase_migrations.schema_migrations`.
Папка `supabase/migrations/` теряла объекты (dashboard_sync, ENUM, hardening).

### ✅ Разделение ответственности: CC пишет, Cowork применяет
Claude Code пишет миграции + код, коммитит, **НЕ применяет**. Гейт Cowork:
ревью → `apply_migration` (атомарно, без BEGIN/COMMIT, пишется в history) →
smoke → `get_advisors`.

### ✅ Smoke через симуляцию ролей
```sql
SELECT set_config('request.jwt.claims', json_build_object('sub', '<uuid>')::text, true);
SET LOCAL ROLE authenticated;
```
Чужак = случайный uuid; tamper = явный чужой `org_id` в запросе. Проверяй
владельца / чужака / tamper. После — вернуть роль, прогнать advisors.

### ✅ schema.md обновляется тем же заходом, что применяется миграция
И репозиторный `docs/schema.md`, и этот скилл. Не откладывать — иначе дрейф
(как перед этой синхронизацией: skill описывал 013, реальность — 026).

### ❌ Счётчика миграций в памяти НЕТ — и заводить его снова не надо
Здесь стоял «последняя 068, следующая 069 (2026-07-21)». К 2026-08-05 реальность ушла на
104, а счётчик так и звал писать `069_*`. Любое число в памяти устаревает быстрее, чем его
успевают править, и превращается в ловушку.

**Номер следующей миграции берётся запросом к `supabase_migrations.schema_migrations`** —
не из памяти, не из `ls supabase/migrations/`. В папке номера теряются (047 и 088a
применены без файла: 65 файлов при последнем номере 104), а версии **069–073** записаны в
ledger **без числового префикса** — греп по номеру их не находит, сверять надо целиком.
На этом дважды делался ложный вывод «миграция не применена» про применённую.
**060 зарезервирована и не занята** — идти вперёд.

---

## Auth & Session

### ❌ Never override Supabase auth defaults
No `storageKey`, no `flowType`, no custom `storage` adapter.
The defaults work. Overrides cause redirect loops.

### ✅ Use `createBrowserClient()` for client components
### ✅ Use `createServerClient()` for server components / API routes
Never mix them. The browser client uses cookies; the server client reads headers.

---

## CSS & Themes

### ℹ️ Тем 7, дефолт `t-aura` (AUDIT C + M1)
`scandi`/`paper`/`sand` **удалены**. Живые темы (`THEMES` в `lib/stores/theme-store.ts`):
`t-aura` (дефолт, light, орбы), `t-washi`, `t-fuji`, `t-minimal` (light, нейтральный, Inter),
`t-frost`/`t-aurora`/`t-tidal` (dark glass).
Persisted/неизвестное legacy-значение → миграция на `t-aura`. Подробности — `theme-system.md`.

### ❌ Never use Tailwind color classes for dynamic colors
`bg-gray-100`, `text-blue-500` etc. bypass the theme system.
Always use `var(--token)` (реальные имена: `--bg`/`--surface`/`--text`/`--accent`/…, НЕ `--color-*`).

### ❌ Never hardcode hex colors in components
Breaks on theme switch. Use CSS variables.

### ❌ Never use rgba for chevron pipeline colors
Semi-transparent fills bleed through on dark themes.
Use solid opaque hex per theme.

### ❌ Never apply font changes globally — только через `--font-app`
`:root` задаёт `--font-app: var(--font-manrope)`, `html` применяет; темы **переопределяют
переменную** (`t-aura` → Onest, `t-fuji` → IBM Plex). Прямой `font-family` на тема-селекторе
перебивает `html` и ломает каскад — запрещён.

### ℹ️ Store value = CSS class (с префиксом `t-`)
Значение стора совпадает с классом на `<html>`: `theme === 't-aura'` (НЕ короткое `'aura'`).
Старая ловушка «store `'scandi'` ≠ class `'t-scandi'`» больше не актуальна — темы хранятся
полным именем класса.

### ⚠️ Тултип/поповер внутри `overflow-x-auto` клиппится
`overflow-x: auto` ⇒ `overflow-y` перестаёт быть `visible` → всплывашка обрезается.
Fix: `position: fixed` (или портал). Поймано на Gantt-тултипе (Волна 2).

### ℹ️ Декор-скобки `「 」` убраны глобально (Sprint UI-D1)
Реликт удалённой scandi. Класс `.bracket` и bracket-псевдоэлементы больше не используются.

### ℹ️ Токен-волна: геометрия · тени · type (2026-07-21, S-TOKENS-GEOM + S-TYPO-TOKENS)
Полностью — `theme-system.md` §«Геометрия, тени, type-токены». Грабли:
- `tailwind.config borderRadius`: `rounded-md` **удалён** (был дублем `rounded`); `rounded-xl = calc(var(--radius-l) + 2px)` фиксит инверсию `xl<lg`. `extend` deep-мержится с дефолтом TW — порядок мержа важен. `t-minimal` острее (`--radius-l: 8px`).
- Канон теней: floating-слои → `--elevation-3`, чарт-тултипы → `--elevation-2`, **карточки → `--shadow-card` (НЕ elevation)**. **`hover:elevation-N` НЕ работает** (утилита `.elevation-*` не реагирует на `hover:`) → `hover:shadow-[var(--elevation-N)]`.
- fontSize-токены `text-meta` (0.6875rem/11px) · `text-body` (0.8125rem/13px), rem-scalable, **без lineHeight** (0 сдвига). Примитивы (Card/Table/Button/Input) → `text-body`.
- **Грабля синхронности:** переименование `text-[11px]`→`text-meta` ОБЯЗАНО синхронно править `.t-washi/.t-fuji aside .text-meta` в `globals.css` — тема-контраст-фиксы нав-подписей таргетят сам класс, иначе контраст молча откатывается к WCAG-fail.
- НЕ трогать (blast): `text-xs` (12px, 690×), `text-sm` (14px, 302×), `text-[10px]` (badge), карточные тени, прямые `font-size` в globals.

### ℹ️ Дедлайн-кап `>90д` живёт в ТРЁХ местах (F-16, S-UI-POLISH-1)
Форматтеры дней дедлайна независимы: `deadlineUrgency` (DashboardHome), `getUrgency` (DeadlineRadar), IIFE в `ProjectCard.tsx`. Кап дальних сроков (`if (d > 90) return '>90д'`) добавлять во **все три** — иначе рассинхрон (`/overview` показывал `>90д`, карточка `/deals` — `389д`). При правках форматирования дат искать все три пути, не первый греп.

---

## Z-Index

### ❌ Never set overlay z-index below sticky headers
If header is z-50 and overlay is z-49, header punches through the modal blur.
**Fix**: overlay z-999, modal z-1000. Headers at z-35-40.

### ❌ Never forget dropdown z-index
Theme picker and select dropdowns need z-50 minimum to appear above
ActivityDrawer widgets (z-30).

### ✅ Z-index hierarchy
```
Content: auto  |  Sidebar: 20  |  Drawer: 30  |  Headers: 35-40
Dropdowns: 50  |  Overlay: 999  |  Modal: 1000
```

---

## React / Next.js

### ❌ Never use `ignoreBuildErrors: true` in next.config
Masks TypeScript errors that break in production. Fix the errors instead.
(Was temporarily enabled, then disabled in sprint fix.)

### ❌ Stale closures in useEffect event handlers
Event handlers registered in `useEffect` capture state at registration time.
**Fix**: use `useRef` to hold current state, read `ref.current` in handler.

### ✅ Optimistic updates on all mutations
Every create/update/delete mutation should:
1. `cancelQueries` for the entity
2. Save previous data
3. Optimistically update cache
4. Rollback on error
5. Invalidate on settled

### ✅ React Query key convention
```
['tasks']           — all tasks
['projects']        — all projects
['project', id]     — single project
['activity-log', projectId]  — activity for project
```

### ✅ Realtime sync
`useRealtimeSync('tableName')` in page components.
Accepts optional second parameter (unused, for signature compatibility).

### ❌ Эффект с DOM-измерением + setState → рантайм-луп (tsc/build НЕ ловят)
`useLayoutEffect`, который меряет DOM (`getBoundingClientRect`) и делает `setState`(новый
объект) каждый прогон, + нестабильные deps (напр. `filteredSwimlanes` — новый ref каждый
рендер) → «Maximum update depth exceeded». tsc/build зелёные — ловится ТОЛЬКО рантайм-смоком.
**Fix**: (1) дедуп setState — функц. апдейт, возвращающий `prev` при идентичном результате
(React бейлит, re-render не идёт); (2) стабильная сигнатура в deps (строка `depSig` вместо
объекта). Поймано Chrome-смоком S-DEPS-1 (0463596 → фикс 4a5eeab). **УРОК: Gantt/DOM-measure
фичи — обязателен рантайм-смок, не только tsc/build.**

### ⚠️ Серия HMR-правок бьёт `.next` dev-cache
После нескольких быстрых правок dev-сервер может словить «Cannot find module
'./vendor-chunks/*.js'» / «`__webpack_modules__`[id] is not a function». Это не баг кода —
рассинхрон `.next`. **Fix**: `rm -rf .next && npm run dev`. При странных webpack/module-ошибках
на dev — первым делом чистый ребилд, не диагностика кода.

### ℹ️ `window.confirm` — конвенция проекта (25+ сайтов), не дефект
Удаление везде через `window.confirm`/`confirm()` (нет кастомного `ConfirmDialog`:
calls/tasks/leads/projects/contacts/meetings/companies). Замена на кастомный confirm —
отдельный app-wide эпик (`useConfirm` + миграция всех сайтов), не точечно (иначе одно место
непоследовательно). При добавлении delete-действия — следовать конвенции `window.confirm`.

### ℹ️ Триггер-функции: `authenticated=X` авто-грантится Supabase default privileges
`revoke public/anon` НЕ снимает `authenticated` — Supabase раздаёт EXECUTE через ALTER DEFAULT
PRIVILEGES. Поэтому 0029-advisor (function search_path / definer surface) шумит на всех
definer-функциях, даже trigger-returning: их **нельзя вызвать напрямую** (Postgres запрещает
`SELECT trigger_fn()`) → не эксплойт, шум. Чтобы убрать из 0029 — **явно** `revoke execute
FROM authenticated` (как в `run_stage_automations` 050). `check_task_dependency_valid` 048 —
оставлен с `authenticated=X` осознанно (как `notify_deal_won`): trigger-returning, не вызываем.

### ✅ Ролевой смок триггер-движка: транзакция + `ROLLBACK`
Для триггеров/DEFINER-функций (S-WF-2A) проверка ролями без порчи данных: одна txn →
`set_config('request.jwt.claims', '{"sub":...,"role":"authenticated"}', true)` +
`SET LOCAL ROLE authenticated` → INSERT правила + UPDATE `projects` (провоцирует триггер) +
верификация side-effects (task/notification/activity/automation_runs) → **`ROLLBACK`**.
Прогоняет backward-compat, идемпотентность, re-entrancy, swallow — на живой БД, откатывая всё.

---

## CSV Export

### ✅ Always add BOM prefix for Cyrillic
```typescript
const BOM = '\uFEFF';
const csvContent = BOM + csvString;
```
Without BOM, Excel shows кракозябры (mojibake) for Russian text.

---

## Волна 2 — Delivery · Win · Gantt (2026-07-16, origin/main)

### ℹ️ Radix НЕ в стеке
Модалки — кастомный `shared/Modal.tsx`; `components/ui/` — кастомные примитивы (не Radix
Dialog/Dropdown). Дропдауны — свой `Combobox`/`AssigneeSelect` + портал. UI-либы:
`@dnd-kit`, `lucide-react` (Next 15 / React 19).

### ⚠️ Gantt-фаза = `column_id` → колонка `category='phase'`, НЕ `phase_group`
Swimlane Gantt/фазовой доски **data-driven** от колонок проекта (`isPhaseBoard`), а НЕ от
`phase_group` пайплайна продаж. `use-project-schedule.ts` селектит board+columns.

### ⚠️ Календарные вычисления из `timestamptz` на клиенте — фиксируй TZ
- `mskDateKey` — ключ дня из timestamptz через `Intl` (`en-CA`, `Europe/Moscow`), НЕ
  browser-local/UTC (иначе deadline у пограничных часов уезжает на сутки).
- Бакеты/инкремент дня Gantt — на **UTC-полдне** (`T12:00:00Z`), иначе off-by-one на
  переходах суток/DST.

### ⚠️ Типы сущностей derived — аддитивная колонка = только regen
`entities.ts` выводится из `supabase.gen.ts` (генерируемый). Аддитивная колонка →
**только регенерация типов**, руками `entities`/`database` не трогать (искл. hand-authored
union). Грабли:
- Реген может затипить jsonb-поле как `Json` вместо доменного типа → tsc-ошибки; фикс
  точечным `as unknown as <T>` / `as never` (не глобально).
- `.refine()` на Zod-схеме → `ZodEffects`, теряет `.shape`/`.extend` (используй superRefine
  или refine на самом внешнем уровне).
- `''::date` невалиден в Postgres → на date-инпутах `setValueAs: v => v === '' ? null : v`.

### ⚠️ `AFTER UPDATE OF <col>` не фичит derived-by-BEFORE-trigger колонки
Если `<col>` проставляется BEFORE-триггером (напр. `status` дерайвится из `stage_id`),
то `AFTER UPDATE OF status` **не сработает** (в момент постановки события старого UPDATE OF
ещё нет изменения). Решение: plain `AFTER UPDATE` + явный `WHEN`. И помни: `EXCEPTION WHEN
OTHERS` в теле молча **маскирует** нарушение CHECK/constraint — фичу гейтить смоуком, а
коммит — по `git show --stat` (2 бага Cowork'а в 045 нашлись именно смоуком: `OF status`
не фичил + `notifications_type_check` не пускал `deal_won`).

---

## Sprint Prompt Writing

### ✅ Always start with РАЗВЕДКА
Diagnostic bash/grep commands BEFORE any code changes.
Verify file exists, check current content, confirm column names.

### ✅ Use exact column/table names from database.ts
Never guess. Always verify against schema.md.

### ❌ Модалки лежат в фиче-папках, НЕ в `components/modals/`
`CallModal`→`calls/`, `MeetingModal`→`meetings/`, `TaskModal`→`tasks/`,
`ProjectModal`→`projects/`, `ContactModal`→`contacts/`, `CompanyModal`→`companies/`,
`LeadModal`/`LeadConversionModal`→`leads/`. `architecture.md` исторически врал (единый
`modals/`), грабли ловились дважды (промахи `git add`/`grep` по несуществующему пути).
Перед вставкой пути модалки в промпт или команду — `find src -name "*Modal.tsx"`, не
доверяй памяти/дереву.

### ✅ Include commit message
Every sprint prompt ends with a git commit command.

### ✅ One concern per task block
Don't mix UI changes with DB migrations in the same task section.
DB changes first (migration), then types, then hooks, then components.

### ✅ Migration → Types → Validator → Hook → Component
This is the dependency order. Always follow it.

---

## Common Patterns to Reuse

### Pre-filling modals from context
When opening a modal from a detail page (e.g., creating a call from
Company detail), pass pre-fill values:
```tsx
<CallModal
  defaultValues={{ company_id: company.id }}
  onSuccess={() => refetch()}
/>
```

### Clickable entity badges
Task cards show project name and company name as clickable badges
that route to the entity detail page:
```tsx
<Link href={`/projects/${task.project_id}`}>
  <Badge>{task.projects?.name}</Badge>
</Link>
```

### Empty state pattern
When a list/table has no items, show a centered illustration + message +
CTA button. Never show an empty table with just headers.

## Волна 2 добор — Gantt-UX · Импорт · Видео · Чат (2026-07-18)

### ⚠️ Pointer-хендлеры высокой частоты — истина в `useRef`, не в state-замыкании
Быстрый свайп: pointer-события приходят пачкой ДО ре-рендера → guard по state-замыканию теряет `pointermove`, короткий свайп открывает edit вместо дропа (S-GANTT-UX-2, drag из «Без дат»). Fix: источник правды drag → `useRef`, `state` только для рендера призрака. Класс = stale-closure в useEffect-хендлерах. **Ловится ТОЛЬКО рантайм-смоком** (tsc/build не видят).

### ⚠️ Delivery-задачи: `lane = 'next'` («Не начата»), НЕ `'now'` («В работе»)
Фазовая доска/шаблоны создают задачи с `lane:'next'` (ProjectBoard phaseMode, ProjectDetail defaultLane, copy_delivery_template 036); `'now'` = «В работе»; progress (037) считает по lane. Массовое создание (импорт плана) обязано ставить `'next'` — иначе весь план мгновенно «В работе». **Источник истины — delivery-путь (ProjectBoard/template), НЕ общий TaskModal/CallLog.** Урок: при сборке промпта сверять delivery-специфичные дефолты по delivery-пути, не по первому грепу (ловилось в D и E как «B1»).

### ✅ Новую RLS на project-scoped таблице — ЗЕРКАЛИТЬ с политики видимости проекта
`project_videos_select`/`project_messages_select` = точная копия `projects_select` + `projects_select_member` (owner/admin OR project ownership OR is_project_member; **без manager**). Не изобретать role-список: «кто видит проект — видит его видео/чат». Если добавить manager (которого нет в projects_select) — дочерняя запись виднее родителя (ловилось в F2 как «B1»; забыть ownership-ветку — владелец-не-member не видит свои данные).

### ⚠️ canManage — UI-гейт; RLS бэкапит АСИММЕТРИЧНО
- tasks_update/delete: RLS строже-или-равно UI (owner/admin OR assigned/created) — manager-не-owner deny.
- **tasks_insert: RLS ШИРЕ UI** — пускает любого org-manager (org owner/admin/manager). canManage для создания задач — только UI-гейт (импорт плана E: org-manager может лить задачи в любой проект org). project_columns/project_videos — RLS согласован с canManage (owner/admin OR ownership). **Чат project_messages INSERT — намеренно ВСЯ команда** (participant), не canManage.

### ⚠️ Overflow клиппит не только тултип — hover-Trash на full-width баре
Gantt full-width bar → hover-кнопка удаления уезжает за `overflow`-контейнер (тот же класс, что тултип в overflow-x-auto). Fallback: удаление такой задачи с доски «План». Known-issue (не блокер).

### ✅ Migration-спринт: мёрж в main ТОЛЬКО после apply; ветки эпиков — от main
Прод-код обратится к несуществующей таблице, если смёржить до apply миграции. Ветки эпиков заводить от main (независимые PR — F2/F1 так). Типы до apply — ручной stub в supabase.gen.ts (паттерн quotes) + alias в entities.ts; regen после apply снимает stub (сдифить — не потерять RelaxOrgId hand-edits).

---

## Сквозные грабли, перенесённые из журнала Claude Code (S-MEM-SYNC-1, 2026-08-05)

Эти правила жили только в журнале CC (`~/.claude/projects/…/memory/project-gotchas.md`),
которого Cowork на гейте не видит. Переехали сюда — им место в общей памяти.

### ❌ `команда > боевой_файл` усекает цель ДО запуска команды
`npx supabase gen types … > supabase.gen.ts` обнулил файл: `npx` спросил «Ok to proceed?»
в stdout, а редирект уже усёк цель. Плюс сам `db:gen-types` когда-то писал в **рукописный**
`database.ts`. Теперь только `scripts/gen-types.sh` (mktemp → санити-проверка → `mv`,
`npx -y`). Правило шире реген-типов: любая генерация — во временный файл, потом `mv`.

### ⚠️ Реген типов через MCP ≠ реген через CLI
MCP не отдаёт блок `graphql_public`, который отдаёт CLI → в диф приезжают ~28 ложных
удалений. Сдифить перед коммитом. `src/types/supabase.gen.ts` и `database.ts` руками не
правятся вообще — только регенерация.

### ✅ Стаб таблицы до применения миграции — `type`, не `interface`
И класть его в `database.ts` интерсекшеном к `Tables`, **не** в `supabase.gen.ts`
(иначе следующий реген его сотрёт вместе с hand-edits). `_`-префикс НЕ глушит eslint
`no-unused-vars`.

**Причина, а не суеверие:** postgrest-js требует `Row extends Record<string, unknown>`.
`interface` неявной индексной сигнатуры не получает, констрейнт `GenericTable` не
выполняется, и `.delete()` / `.rpc()` схлопываются в `never` / `undefined` — с сообщением,
которое на индексную сигнатуру не намекает никак. Час в S-R2-SIGNOFF-1, повторено в S-TG-1.

**Снимать стаб — полностью.** После apply + регена уходят и временный `DatabaseWith*`, и
обёртка-клиент, и приведения типов в запросах: доменный тип становится алиасом
`Database['public']['Tables'][…]['Row']`, а `createClient()` зовётся напрямую. Оставленная
обёртка переживает миграцию молча и продолжает врать про схему.

### ⚠️ Гранты: `information_schema` врёт, склейка `relacl` врёт вдвойне
`information_schema.role_table_grants` **не показывает `MAINTAIN`** (вью стандарта SQL,
привилегия нестандартная) — фильтр по ней всегда вернёт 0. `array_to_string(relacl,',')
like '%authenticated=%m%'` жадно матчит через запятую и находит букву в правах *соседней*
роли. Единственный верный способ — `lateral unnest(coalesce(relacl,'{}'::aclitem[]))` +
`split_part`. `pg_get_functiondef()` падает на агрегатах (42809, текст ошибки не связан с
запросом) — любой фильтр по телу функции только с `p.prokind='f'`.

### ℹ️ Серверной пагинации в проекте нет
`useInfiniteQuery` / `.range` — ноль вхождений: списки тянутся целиком, режет клиентский
`DataTable` (`pageSize=20`). Планируя работу со списком, не рассчитывать на серверный
срез — его придётся вводить.

### ✅ «Клик не сработал» — сначала смотреть, КТО СВЕРХУ
`document.elementsFromPoint(x,y)`. Слои мерить `getComputedStyle`, а не читать классы:
`globals.css` даёт `[data-modal*]` 999/1000 поверх Tailwind `z-50`. Шкала — `docs/Z-INDEX.md`.
Peek живёт на `/companies`, `/contacts`, `/deals`, `/leads`, `/tasks` — **НЕ** на `/projects`.

### ✅ Правила браузерного смока
- `computer type` с `\n` шлёт Enter — в чате это ОТПРАВЛЯЕТ сообщение.
- `window.confirm` / `window.print()` блокируют автоматизацию (в проекте `confirm`
  запрещён eslint'ом, подтверждение — `ui/InlineConfirm.tsx`).
- В dev `/overview` и `/calls` показывают скелет 3–5 с — норма, проверять вторым скриншотом.
- **Тема — zustand-БЛОБ, не строка:** `localStorage['dashboard-theme']` =
  `{"state":{"theme":"t-minimal"},"version":0}`, значения с префиксом `t-`. Простая строка
  не падает — `ThemeProvider` молча сбрасывает на `t-aura`, и смок «в минимале» идёт в ауре.
  Проверять `document.documentElement.className`, а не своё намерение. Запись затирает
  выбор владельца — предупреждать в отчёте.
- **Живой `next dev` протухает:** многочасовой процесс отдаёт 404/503 на собственные
  `_next/static/chunks/main-app.js`, страница вечно крутит спиннер, консоль чистая.
  Диагноз — `read_network_requests`, лечение — рестарт; к своим правкам отношения не имеет.
- `npm run build` при живом `next dev` убивает dev-сервер — билд гонять последним.

---

## Уроки 2026-08-04/05 (Company 360, minimal, тема-селекторы)

### ❌ Тема-правило на голом теге ломает чужие компоненты
`.t-washi aside` / `.t-fuji aside` / `.t-aura aside` красили в sumi/индиго с `!important`
ЛЮБОЙ `<aside>` — карточку компании, чат и drawer вместе с текстом. **Тема-селектор обязан
целиться в конкретный элемент через data-атрибут:** `aside[data-app-nav]` (навигация),
`aside[data-drawer]` (правый ящик). Признак «от противного» (`:not([aria-label])`) —
такой же баг с отсрочкой: ломается от первого же улучшения доступности.
Массовую замену селекторов делать НЕ `sed`-ом по подстроке: правка `.t-* aside` сузила
52 правила из 54, а два оставшихся (про `.bracket` внутри ящика) должны были остаться
широкими — их пришлось возвращать руками.

### ❌ Акцент темы, не проверенный на конфликт hue, читается как семантика
Терракота `#C05A2E` (hue 46°) стояла в 15° от `--red` (30°) — интерфейс выглядел тревожным,
а причина списывалась на вкусовщину. **Проверка нового акцента: Δhue ≥ 30° до всех
семантических цветов + контрасты `scripts/audit-contrast.py`, не на глаз.** Подробности и
свободная зона палитры — `theme-system.md`.

### ❌ Новый React-Query ключ = новая запись в инвалидации
`['company-team-touch']` и `['contact-strength']` не инвалидировал никто: лента после
звонка обновлялась, виджеты над ней — нет. **Заводя ключ, сразу пройти по всем мутациям,
которые меняют его данные.** Смежное: `contact_id` для инвалидации брать из СТРОКИ ОТВЕТА
мутации, а не из payload (в payload его может не быть).

### ❌ Шаблонная строка съедает `null`
`` `${first_name} ${last_name}` `` при пустой фамилии печатает «Svetlana null» — в JSX
React отрисовал бы пустоту, а в строке `null` становится текстом. Склейка имён — только
`[first, last].filter(Boolean).join(' ')`.

### ❌ Путь теста, не совпавший с `vitest.config.ts`, даёт ложный «passed»
`include` — **только `tests/unit/**`**. Тест, положенный рядом с исходником в `src/`,
молча не запускается, а прогон рапортует зелёным. Класс шире: «зелёный прогон» ничего не
значит, пока не видно, что файл в него ВОШЁЛ.

### ✅ Чистая логика — в `lib/domain/`, «сейчас» параметром
Агрегация внутри `queryFn` не тестируется иначе как руками в браузере. Вынос в чистую
функцию (`aggregateTeamTouch(calls, meetings, now)`) сразу дал 17 кейсов на правила,
которые до того держались на комментарии. Правило: **никаких `Date.now()` внутри домена** —
«сейчас» приходит аргументом, иначе тест зависит от часов и TZ прогона. Один `now` на
проход хука: серверный фильтр (`deadline > now`) и агрегация обязаны смотреть на одну
границу.

---

## Уроки 2026-08-05 (ось «Слой достоверности», S-R3-TRUST-1)

### ❌ Серверная формула не питает клиентский фильтр
Роадмап обещал `entity_completeness()` + `v_deal_completeness`, а сегменты считаются **на
клиенте** поверх загруженного списка. View их не питает: клиент грузит `projects`, не view —
значит обещание «`completeness_score < 60` становится обычным предикатом» через SQL не
выполняется вовсе. Правило шире архитектуры полноты: **прежде чем класть вычисление в SQL,
проверь, кто его читает.** Если единственный потребитель клиентский — вторая формула в SQL
даст дрейф, а не пользу. Серверная версия пишется тогда, когда появляется серверный
потребитель, и один раз под него.

### ⚠️ Сделка — это `projects.type = 'client'`, НЕ `'deal'`
Роутинг (`/deals/[id]`), UI и разговорная речь говорят «сделка», а колонка хранит `client`.
Запрос с `type='deal'` возвращает **ноль строк без ошибки** — самая тихая поломка разведки.
Типы: `client` (сделка) · `delivery` (внедрение) · `internal` (внутренний/пресейл).

### ❌ `loss_reason` ≠ `lost_reason` — в `projects` живут обе
Живая колонка — **`loss_reason`** (её пишет `StageTransitionModal`). `lost_reason` —
legacy, пуста у всех проигранных, но из схемы не удалена. Правило: две похожие колонки =
проверь по ДАННЫМ, какая заполнена, а не по имени, которое звучит правильнее.

### ⚠️ Порог сегмента, не сверенный с данными, даёт вечно пустой чип
Сегмент «Полнота <60%» на момент apply не возвращал ни одной строки: минимальный score
среди открытых сделок — 61 %. Порог придумали в промпте до того, как посчитали реальные
значения. Чип при этом появляется в полосе и выглядит сломанным. Правило: **любой числовой
порог в сиде сначала прогнать по живой БД** — «сколько строк сюда попадёт сегодня». Ноль —
осознанное решение (сигнальный сегмент), но оно должно быть решением, а не сюрпризом.
Подгонять порог под данные тоже нельзя: порог обязан означать «плохо», а не «покажи хоть
что-нибудь».

### ✅ Порог — в ИМЕНИ сегмента, а не в подразумеваемой настройке
Предикат сегмента про `organizations.settings` не знает. Имя «Неполные сделки» обещало бы
согласованность с настройкой весов, которой нет; «Полнота <60%» — честно. Тот же приём уже
стоял в 086 («Залипли >14 дней»), и это конвенция, а не разовое решение.

### ✅ Настройка организации — готовый паттерн, повторять целиком
`organizations.settings` (jsonb, 076) + Zod с `.passthrough()` + запись **merge'ом** +
резолвер `настройка → дефолт → фолбэк` + пустое поле формы НЕ пишет ключ. Образец —
`stage_dwell_defaults` (`resolveDwellThreshold`), копия — `completeness_rules`
(`resolveRules`). Три правила, которые ломаются, если отступить: неизвестный ключ при
чтении игнорируется, а не роняет разбор; ключ будущей версии переживает правку соседнего;
при пустых настройках резолвер возвращает **ту же ссылку** на дефолт (иначе новый массив
на каждый рендер убивает мемоизацию потребителей).

### ✅ Ключ настройки может не быть в `OrgSettings` — и это нормально
`src/types/database.ts` руками не правится, поэтому новый ключ живёт в `.passthrough()`,
читается адресной функцией (`readCompletenessOverrides`), а пишется патчем, который уже
имеет тип `OrgSettings`. Ждать регена типов ради jsonb-ключа не нужно.

### ⚠️ Реестр вычисляемых полей глобален, whitelist — по сущности
`VIRTUAL_FIELDS` в `segment-eval.ts` не знает, для какой сущности его позвали. Пока поле
одно и стоит только в `deals` — безопасно; второе вычисляемое поле обязано либо получить
привязку к сущности, либо иметь имя, уникальное во всех whitelist'ах.

## Уроки 2026-08-07 (расшифровка аудио, S-R3-VOICE-1)

### ✅ Внешний бинарник в edge — `FormData` через `functions.invoke`, а не base64
`supabase.functions.invoke` принимает `Blob`/`ArrayBuffer`/`FormData`/строку и сам
выставляет Content-Type (у `FormData` — не выставляет вовсе, чтобы браузер поставил
boundary; проверено по телу `@supabase/functions-js`, не по документации). Значит чанк
аудио едет как есть, без base64 (+33 % к телу и перекодировка на обеих сторонах).
Побочный выигрыш: **Content-Type годится дискриминатором действий** — одна функция,
multipart = «распознать», JSON = «вычитать», без параметра в URL.

### ⚠️ Лимит 4.5 МБ на тело — вериселев, а не провайдерский
Код, приехавший из приложения на Vercel, несёт в себе пороги под чужую платформу.
В `trans-app` 4.5 МБ выглядели как «лимит Groq», хотя Groq принимает 25 МБ. Перенося
чужой модуль, **каждую числовую константу опознать: чья это граница**. Следствие для
`transcribe`: порог поднят до 20 МБ, и нарезка по тишине включается только на файлах
тяжелее — часовая запись с телефона в opus (≈14 МБ) уходит одним запросом.

### ⚠️ Домен CHECK'а расширяется миграцией, а рукописный union — нет
`transcripts.source` в `src/types/database.ts` — рукописный `'paste' | 'file'`, а файл
руками не правится (правило 2). Третье значение живёт в отдельном типе рядом с местом
записи (`TranscriptSource` в `use-ai-run.ts`), а типы сходятся потому, что клиент
Supabase типизирован автогенерацией, где `source?: string`. Цена решения:
`TranscriptRow['source']` на чтении **уже, чем живой домен** — при следующем регене
типов union стоит привести к CHECK'у.

### ✅ Зеркало клиент ↔ edge держится побайтовым тестом, а не поведенческим
Deno не импортирует из `src/`, поэтому глоссарий и промпт вычитки продублированы
(как `chz-groups` в `ai-run`). Но там зеркало проверялось поведением, а здесь львиная
доля файла — **текст промпта**: поведенческий тест правку в нём не заметит. Сверка —
`readFileSync` + `toBe`, а шапка-комментарий сделана одинаковой в обеих копиях, чтобы
файлы совпадали байт в байт.

### ⚠️ Оценка стоимости вычитки ≠ оценка стоимости пресета
`estimateRunCostRub` считает выход фиксированным (~2К токенов структурированного
ответа) — для сводки это верно. Вычитка возвращает **тот же текст целиком**, поэтому
выходные токены равны входным, а у sonnet выход в 5 раз дороже входа: час разговора —
это десятки рублей, а не единицы. Прогноз, скопированный из соседнего домена без
проверки формы ответа, врёт на порядок.

### ⚠️ Нет паузы в окне поиска — рез уезжает к НАЧАЛУ окна, а не к номиналу
`findChunkBounds` берёт первый строгий минимум энергии (`<`, не `<=`). На сплошной
речи все окна равны, и побеждает первое — граница встаёт на `nominal - searchSpan`,
то есть на 15 секунд раньше. Не баг (чанк просто короче), но описывать поведение как
«фолбэк на номинальную границу» неверно — тест обязан проверять то, что код делает.

## Уроки 2026-08-07 (первый боевой прогон расшифровки, S-FIX-VOICE-1)

### ⛔ Шлюз Supabase рвёт синхронный вызов примерно на 90 секундах
Не `AbortSignal` функции, не таймаут провайдера — **шлюз**, и отдаёт он 502 **без нашего
тела**: `error.context.json()` падает, человек видит пустую ошибку. Два следствия,
которые надо закладывать в любую синхронную edge-функцию с LLM: собственный таймаут
ставить **заведомо ниже** шлюзового (75 с при 90), а размер единицы работы подбирать
так, чтобы ответ укладывался с запасом втрое. Блок вычитки 5000 символов давал ~90 с —
ровно граница; 1800 даёт ~30 с.

### ⛔ Дорогой этап не имеет права быть отменён дешёвым
37 успешных вызовов Groq сгорели из-за одного 502 на вычитке: `run()` возвращал `null`,
UI показывал тост и очищался. Правило: **как только получен результат, за который уже
заплачено, он фиксируется и не может быть отменён последующим сбоем.** Технически —
отдельная фаза `partial` (не `error`), падение единицы работы не прерывает цикл (в
результат идёт сырой вход), а повтор второго этапа не трогает первый.

### ⚠️ Тост — не место для сообщения, требующего решения
Владелец пропустил `toast.error` и решил, что интерфейс «сбросился». Сообщение, после
которого человек должен что-то ВЫБРАТЬ, живёт в панели рядом с кнопками выбора и не
исчезает само. Тост оставляем дублем, а не единственным носителем.

### ⚠️ Прогресс без подписи читается как «всё закончилось»
Растущий текст в превью выглядит готовым результатом. На блоке 1 из 7 владелец решил,
что процесс завершён. Плюс подсказка «вставьте текст, чтобы включить пресеты» верна
технически и ровно в этот момент подтверждает ложный вывод. Черновик подписывать
черновиком, а подсказки соседних режимов на время работы гасить.

### ⚠️ Whisper на тишине выдаёт субтитровые штампы — и сам себя разгоняет
`whisper-large-v3` обучен на субтитрах: на паузе выдаёт «Продолжение следует…»,
«Субтитры сделал …». Опасен не мусор, а **петля**: штамп попадает в накопленный текст,
из него собирается `previousTail`, хвост уходит в prompt следующего фрагмента. Чинится
в двух местах сразу — фильтр штампов И сборка хвоста только из очищенного; второе
важнее. Надёжнее не полагаться на порядок вызовов в цикле, а **встроить чистку в саму
функцию сборки хвоста** — тогда правка рядом не может разорвать инвариант.

### ⚠️ Фильтр по подстроке выкусывает живую речь — нужны два режима сверки
«Подписывайтесь на канал в телеграме» и «продолжение следует из договора» — нормальные
фразы делового разговора. Штамп считается артефактом, только если он занимает
предложение целиком (`exact`); режим `prefix` — для субтитровых подписей с именем
автора, которых в разговоре не бывает вовсе.

### ⚠️ Инициалы ломают разбиение на предложения
«Редактор субтитров А.Синецкая» распадалось на «Редактор субтитров А.» + «Синецкая…»:
штамп выкусывался, мусор оставался. Точка — конец предложения, только если за ней
пробел или конец строки. Смотреть **вперёд**, а не назад: lookbehind не поддерживает
Safari до 16.4, а мобильный сценарий здесь основной. Поймано тестом, не прогоном.

### ⚠️ Одна константа на два смысла — всегда долг
`DIRECT_UPLOAD_LIMIT = MAX_CHUNK_BYTES` смешало «потолок одного запроса» (транспорт) и
«порог, ниже которого не режем» (качество). Итог: файл до 20 МБ уходил целиком, то есть
без `previousTail` между фрагментами — терялся контекст, который держит термины. Равные
на сегодня числа не повод объявлять их одной константой.

### ⚠️ Новый раздел приложения = ШЕСТЬ точек правки, а не одна
Контракт пункта меню выглядит самодостаточным (`TextNavSidebar`), но раздел живёт
размазанным по шести местам. Забытая точка даёт **не поломку, а тихую деградацию**:
экран работает, просто «немного не такой», и это замечают через недели.

| Что | Файл | Пропустил ⇒ |
|---|---|---|
| Страница | `src/app/(dashboard)/<раздел>/page.tsx` | 404 (заметно сразу) |
| Пункт меню | `layout/TextNavSidebar.tsx` (+`jpLabel` — тема `washi` его показывает) | раздела нет в навигации |
| Секция пути | `lib/section-colors.ts` | молча падает в `'dashboard'` — чужой цвет секции |
| Заголовок | `layout/ContentHeader.tsx` | заголовок страницы **пустой** |
| Орбы `t-aura` | `layout/AuraOrbs.tsx` + `globals.css` `[data-section="…"]` | фолбэк на чужую пару цветов |
| ⌘K | `shared/CommandPalette.tsx` — **дважды**: карта заголовков И пункт «Навигация» | раздел не находится поиском |

Все промахи, кроме первого, — с молчаливым фолбэком: ни ошибки, ни предупреждения.
Проверено на `/transcripts` (S-AI-VIS-2): промпт спринта называл только `TextNavSidebar`,
остальные пять пришлось доискивать по факту сломанного вида.

**В спринт-промпт на новый раздел эту таблицу вставлять целиком** — дешевле, чем
потом объяснять, почему у раздела чужой цвет и пустая шапка.


---

## Уроки 2026-08-08 (Telegram, S-TG-1)

Уроки не про Telegram — про любую интеграцию с общим секретом и внешним транспортом.

### ❌ Секрет, который вводится руками в двух местах, разойдётся

За один гейт это случилось **дважды**: `TELEGRAM_WEBHOOK_SECRET` (Function Secrets ↔
Telegram) и `TELEGRAM_SEND_KEY` (Function Secrets ↔ Vault). Оба раза — раунд отладки на
ровном месте, и оба раза симптом был один и тот же неинформативный `401`.

**Правило: общий секрет генерируется в ПЕРЕМЕННУЮ и подставляется в оба места из одного
скрипта.** Человек значение не набирает и не копирует нигде. Проверять глазами бесполезно:
64 hex-символа с лишним пробелом на конце выглядят идентично правильным.

Смежное, стоившее отдельного раунда: после `supabase secrets set` секрет доезжает до
рантайма функции **не мгновенно**. Перед проверкой ждать ~30 секунд — иначе получишь тот же
`401` и будешь искать его не там.

Готовые скрипты ротации — `docs/TELEGRAM-SETUP.md` § 3.

### ❌ `read` внутри вставляемого блока съедает следующую строку

`read -s TG_TOKEN` в многострочной вставке **не ждёт человека**: на стандартном вводе уже
лежит остаток вставленного текста, и переменной достаётся следующая строка скрипта.

В нашем случае токен бота стал строкой `curl -s "https://api.telegram.org/…`, URL собрался
из мусора, Telegram ответил `404 Not Found` — **симптом не имел ничего общего с причиной**,
и это худший класс багов.

Лечится запуском через файл:
```bash
cat > /tmp/x.sh <<'EOF' … EOF; bash /tmp/x.sh; rm -f /tmp/x.sh
```
Внутри скрипта `read` читает терминал. **Кавычки в `<<'EOF'` обязательны**, иначе переменные
подставятся при записи файла и в скрипт приедут пустые строки.

### ✅ `net._http_response` — первое место при сбое `pg_net` → edge

Таблица `pg_net` хранит ответ **дословно, включая тело**:
```sql
select status_code, left(content,120), created
from net._http_response where created > now() - interval '10 minutes'
order by created desc limit 5;
```
За секунду отличает «функция не вызвана» от «вызвана и вернула 401». Логи edge для этого
читать долго, и они шумят. Приём общий для `webhook-dispatch` (089) и `telegram-send` (107).

### ✅ Очередь с захватом переживает поломку транспорта без потерь

401 отбивается **до** `claim_telegram_outbox`, поэтому `attempts` не растёт и строка не
деградирует до `error`. Сообщение пролежало `pending` **412 секунд**, пока чинили ключ, и
ушло первым исправным тиком.

Это аргумент за очередь против fire-and-forget: при том же сбое `pg_net` без очереди
сообщение было бы потеряно **молча**. И это же — причина не «чинить» очередь руками:
чинить надо ключ, очередь дождётся.

### ⚠️ «НЕ ПРИМЕНЕНА» переживает применение — статус меняет гейт, не спринт

Спринт-PR пишется **до** apply, и в момент коммита строка «НАПИСАНА, НЕ ПРИМЕНЕНА» честна.
Статус меняется на гейте, а гейт своего следа в `docs/schema.md` не оставлял: правило
«schema.md тем же PR, что миграция» покрывает появление раздела, но не его переход в
`applied`. Механизм сработал трижды — **104** (поймано на выносе копии схемы из скилла,
2026-08-05), **107** и **098** (обе 2026-08-08, причём 098 противоречила шапке того же
файла: в ledger applied, в заголовке раздела нет).

Цена не в опечатке, а в выводе: следующий спринт читает «не применена» и либо планирует
apply уже применённого, либо занимает её номер. Ровно так дважды делался ложный вывод
про применённую миграцию.

**Правило: `apply_migration` и правка статуса — одна операция, до вердикта гейта.**
Версия берётся из `schema_migrations`, а не из имени файла. В чеклисте гейта — отдельной
строкой (`SKILL.md`, «Что проверяет гейт»).

### ❌ Состояние вне репозитория — источник всех трёх сбоев эпика Telegram

Три инцидента за два дня, все одинаковой формы: **код верен, миграция применена, тесты зелёные,
не работает**. Причина каждый раз лежала там, куда не смотрят ни git, ни CI:
`TELEGRAM_WEBHOOK_SECRET` ≠ `secret_token`, `TELEGRAM_SEND_KEY` ≠ Vault, и — худший —
`allowed_updates: ["message"]` у Telegram.

Последний стоил дороже двух первых вместе. У него **нет симптома**: `getWebhookInfo` показывал
`ok`, `pending_update_count = 0`, `last_error_message` пуст; в логах edge — ноль вызовов, даже
401 не было. Апдейт `callback_query` отбрасывался на стороне Telegram, и наблюдаемая картина
не отличалась от «пользователь не нажимал кнопку». Отдельная ловушка: **повторный `setWebhook`
без `allowed_updates` сохраняет прежний список**, а не открывает всё, — то есть дефект
самовоспроизводится при любой честной перерегистрации.

Правило для любой интеграции с внешним провайдером: у неё есть **состояние на чужой стороне**,
и оно должно быть (1) перечислено в runbook, (2) прочитано обратно после каждой записи.
Для Telegram это `getWebhookInfo` после каждого `setWebhook` — на все поля, а не на `ok: true`.
Для 1С:ДО, почты и n8n будет свой аналог, и вопрос при проектировании ставится так же:
«что мы записали туда, куда не смотрит ни один тест, и чем это читается назад».

Симптоматика и таблица — `docs/TELEGRAM-SETUP.md` § 6.

### ⚠️ Автогенерация типов описывает СХЕМУ, а не права

После регена в `supabase.gen.ts` видны все четыре таблицы 107 и все её функции — включая
те, у которых `revoke all from authenticated` и RLS без политик. **Тип, который
компилируется, не означает запрос, который выполнится.**

Отсюда: закрытость таблицы держится ревью и комментарием в хуке, а не тайпчеком. Писать это
словами рядом с клиентом — иначе следующий спринт добавит «удобный» запрос к `telegram_outbox`,
и он упадёт только в рантайме у пользователя.

---

## Уроки 2026-08-08 (Telegram, S-TG-2 — напоминания и кнопка)

### ❌ Спринт-промпт не заменяет разведку по схеме — три имени из четырёх были неверны

Промпт S-TG-2 содержал готовый черновик RPC. В нём:

- `memberships.user_id` — **такой колонки нет**, в таблице `profile_id`. Скопированный
  как есть, гард упал бы `42703` на первом же нажатии кнопки;
- `tasks.title` — **нет**, поле называется `text`;
- «в проде 609 задач из 640 без исполнителя» — на деле **551 незакрытая, исполнитель
  у восьми**. Вывод (нужен `coalesce(assigned_to, created_by)`) верный, число — нет.

Цифры и имена в промпте — иллюстрация замысла, а не факт. **Живая БД остаётся источником
истины даже когда промпт выглядит как готовый код** (правило 4 CLAUDE.md — оно и про это).

### ❌ `valueAsNumber` в RHF отдаёт NaN на пустой строке, и Zod его отвергает

`register('remind_min', { valueAsNumber: true })` на `<select>` с `<option value="">`:
RHF возвращает `NaN`, `z.number()` даёт `invalid_type`, форма молча не сабмитится —
**если ошибку этого поля нигде не рендерят, симптом ровно один: кнопка не работает**.

Баг прожил в `TaskModal` с 004 и не проявлялся только потому, что нетронутый select
оставляет значение из `defaultValues`; ломалось лишь «выбрал 15 минут → передумал →
Не напоминать».

**Правило: для select'а с пустой опцией — `setValueAs: v => v === '' ? null : Number(v)`,
никогда `valueAsNumber`.** В проекте так уже сделан `parent_task_id` — сверяться с ним.

### ⚠️ Тип возврата функции нельзя изменить через `create or replace`

`RETURNS TABLE (…)` — часть типа возврата. Добавление колонки требует
`drop function` + `create` («cannot change return type of existing function»).

Ловушка 42725 (перегрузка при новом параметре) здесь **не срабатывает**: сигнатура
аргументов не меняется, старые вызовы находят ту же функцию. Поэтому такой дроп
безопасен на живой БД — в отличие от дропа ради нового параметра.

Смежное и полезное: клиент supabase-js читает ответ RPC как JSON и **лишние поля молча
игнорирует**. Это делает порядок «apply миграции → потом редеплой edge» безопасным:
старая функция получит расширенный ответ и не заметит.

### ⚠️ Ключ идемпотентности относится к СОБЫТИЮ, а не к строке навсегда

`tasks.reminded_at` дедуплицирует напоминания — но задача с перенесённым на неделю
дедлайном без сброса не напомнит о себе **никогда**, и это читается как «фича не
работает», а не как «сработала один раз, как обещано».

Отсюда: любой флаг «уже сделано» на изменяемой строке обязан иметь ответ на вопрос
**«что его сбрасывает»**. Здесь — `trg_ab_reset_reminded_at` на `deadline`/`remind_min`.
Тот же вопрос стоит задать `stage_entered_at`, `do_synced_at` и любому будущему
`*_at`-маркеру.

### ⚠️ `editMessageText` в Telegram нельзя слать с тем же `parse_mode`, что и оригинал

`message.text` в апдейте приходит **уже разрисованным**: разметка вынесена в `entities`,
а `&`, `<`, `>` вернулись в исходном виде. Отправить этот текст обратно с
`parse_mode: 'HTML'` — уронить правку на первом же «ООО «Ромашка & Ко»».

Варианты: (а) редактировать без `parse_mode`, потеряв жирный заголовок (выбрано —
сообщение уже отработано, читаемость важнее), (б) восстанавливать разметку из `entities`
(дорого и хрупко). Экранировать повторно **нельзя** — получатся `&amp;amp;`.

### ✅ `answerCallbackQuery` обязателен во ВСЕХ ветках, включая отказные

Без ответа кнопка у человека крутится до таймаута Telegram, и он жмёт её повторно —
то есть отсутствие ответа на ошибку порождает повторные запросы. Ветки «не ваша задача»,
«профиль не привязан» и «не удалось» отвечают так же обязательно, как успех.

Смежное: **актор резолвится по `callback_query.from.id`, а не по `message.chat.id`.**
В личном чате они совпадают — и именно поэтому расхождение не всплывёт на смоке. Кнопку
можно нажать в пересланном сообщении: там `chat` чужой, а `from` всегда тот, кто нажал.

### ⚠️ Фича может молчать по ДАННЫМ, а не по коду — это часть отчёта

На момент спринта из 551 незакрытой задачи `deadline` стоял у **3**, `remind_min` — у
**1**, обе вместе — **ни у одной**. То есть после apply и редеплоя сквозной смок нужно
ставить **на специально созданной задаче**, а «ничего не пришло» на проде — ожидаемый
результат, а не регресс.

Разведочный запрос по данным (не по схеме!) стоит одного `select` и снимает целый класс
ложных выводов на гейте. Делать его до, а не после.

## Уроки 2026-08-08 (Telegram, S-TG-3 — быстрый ввод из бота)

### ❌ `\b` в JS не существует рядом с кириллицей — правило молча не работает

`\b` определён через `\w` = `[A-Za-z0-9_]`. Кириллица в `\w` не входит, значит границы
слова рядом с ней НЕТ, и `/\b(ооо|ао|зао|…)\b/g` не срезает ОПФ **никогда**: «ООО Ромашка»
и «Ромашка» дублями не считались. Правило жило в трёх копиях и было сломано во всех трёх —
полтора года, без единого симптома, потому что дедуп молчит одинаково и когда дубля нет, и
когда он есть, но не нашёлся.

**Признак класса:** любая эвристика, которая при поломке возвращает «ничего не нашлось»,
не имеет естественного симптома. Такие вещи проверяются тестом на ПОЛОЖИТЕЛЬНЫЙ исход
(«эти пять написаний — одна компания»), а не на отрицательный.

**Лечение:** сравнение целыми токенами (`split(/\s+/)` + `Set`), а не регуляркой с `\b`.
Второе появление той же грабли — первое было в S-CHAT-TASK-1.

### ✅ Общий модуль вместо зеркала: один файл, два специфера

Deno-функция и Next-бандл могут читать ОДИН файл, если он самодостаточен (ни одного
импорта): Deno импортирует его с расширением `../_shared/x.ts`, TS — без расширения
`../../../supabase/functions/_shared/x` (без `allowImportingTsExtensions` расширение он не
берёт, а Deno без расширения не резолвит). `exclude: ["supabase/functions"]` в tsconfig
этому не мешает — он фильтрует только поиск по `include`, импортированный файл в программу
попадает всегда.

Так закрывается выбор «дублировать или нет», который в проекте раз за разом решался
дублированием (зеркала промптов, `WEBHOOK_EVENT_BY_TRIGGER`, `telegram-message.ts`).
⚠️ Дублирование остаётся неизбежным только там, где второй потребитель — **plpgsql**:
из SQL импортировать неоткуда.

### ✅ `verify_jwt = true` требует ПРОЕКТНЫЙ jwt, а не пользовательскую сессию

Развилка «пройдёт ли service-ключ через шлюз к функции с `verify_jwt = true`» решается
одним curl и не требует секретов: POST с заведомо невалидным телом. **400** от тела функции
значит, что шлюз пропустил; **401** — что не пропустил. Ключ проекта (anon, service_role) —
один класс токенов, подписанный одним секретом.

Вывод общий: соседнюю edge-функцию можно звать `functions.invoke` от service-клиента, не
ослабляя её `verify_jwt`. Ослабление ради вызова изнутри — почти всегда лишнее.

### ⚠️ Промпт спринта может противоречить сам себе — разрешать в пользу инварианта

Промпт S-TG-3 задавал `kind CHECK (contact|company)` и тут же требовал ветку
`intent='unclear'` с кнопками выбора. До нажатия ветка НЕ выбрана, и записать её значением,
которого человек не выбирал, — это и есть «гадать за него», запрещённое инвариантом фичи.
Разрешается в пользу инварианта (третье значение `unclear`), а не в пользу буквы схемы:
инвариант объясняет, ЗАЧЕМ фича, а колонка — только КАК.

## Уроки 2026-08-08 (S-TG-3-INN-DUP — дубль по ИНН)

### ❌ Кнопка, которая не может сработать, — дефект интерфейса, а не мелочь

`tg_apply_capture` вставляла компанию без обработки 23505 при живом partial-unique
`uq_companies_org_inn`. Итог: на дубле по ИНН бот рисовал «Всё равно создать», которая
**не могла выполниться никогда** — исключение откатывало функцию вместе с
`status='applied'`, человек получал «Не удалось, откройте CRM» (про ИНН ни слова), кнопка
оставалась живой и на второе нажатие давала то же самое.

**Правило:** уникальный индекс — это ещё и утверждение об ИНТЕРФЕЙСЕ. Заводя его,
проверять, не осталось ли в UI действия, которое он делает невозможным. Честный ответ от
БД (`duplicate_inn`) кнопку не оправдывает: её убирают, а не объясняют.

**Как отличать:** совпадение по ИНН и по названию — разные исходы. По названию «всё равно
создать» законно (два юрлица с похожими названиями и разными ИНН — обычное дело), по ИНН —
нет. Значит, дедуп обязан возвращать не только «нашлось», но и **по чему** нашлось
(`matchedBy`); без этого признака интерфейс не может принять правильное решение.

### ✅ `exception` вешать на ОПЕРАЦИЮ, а не на тело функции

`begin … exception when unique_violation … end` вокруг конкретного INSERT ловит ровно тот
констрейнт, о котором ветка знает. Тот же обработчик вокруг всей функции поймал бы и
будущие констрейнты — и соврал бы про причину пользователю.

Побочно: вложенный блок в plpgsql — это SAVEPOINT, откатывается только он. Поэтому UPDATE
внутри обработчика (закрыть черновик как `applied`) сохраняется, и повторное нажатие даёт
тот же ответ вместо новой заведомо падающей попытки.

### ❌ Текст ошибки не должен предлагать действие, которое не может помочь

При исчерпанном балансе Claude API бот отвечал «Не удалось разобрать текст. Попробуйте
прислать его ещё раз» — человек полчаса переформулировал сообщение, пытаясь угодить
системе, которой нечем было отвечать. Совет перевёл нашу проблему в разряд
пользовательских.

**Правило общее, не про Telegram:** сбой на нашей стороне и «не поняли ввод» — разные
сообщения. Первое говорит «это на нашей стороне, сообщите администратору», второе
предлагает повтор. Признак различения обычно уже есть в коде (здесь — `invokeJson`
возвращает `null` только на сбое вызова, а пустой разбор приходит валидным объектом);
склейка двух исходов в одну строку — не экономия, а дезинформация.

## Уроки 2026-08-09 (S-COST-TRUTH-1 — цена прогона и ссылка на задачу)

### ❌ `like '%foo_bar%'` по `prosrc` находит то, чего нет: `_` — ВАЙЛДКАРД

Проверка «есть ли в БД функция, пишущая `task_created`» дала одно совпадение —
`tg_complete_task`. Функция про `task_created` ничего не знает: в её теле есть
`v_task.created_by`, и `_` в шаблоне LIKE матчит точку. Вывод «событие пишет и триггер
тоже» был бы ложным, и половина правки уехала бы не туда.

Тот же класс, что `relacl` через `array_to_string`: строковый поиск по машинному
представлению врёт, потому что у языка поиска своя грамматика. Проверять `position('foo_bar'
in prosrc) > 0`, либо `like ... escape` с экранированием `\_`. Дешёвый признак ложного
срабатывания: `position()` возвращает 0 там, где `like` сказал «есть».

### ✅ Диапазон-оценка обязана НАКРЫВАТЬ факт → округление наружу, а не к ближайшему

`estimateWebRunCostRub` отдаёт `{min, max}`, и рядом в карточке показывается фактическая
цена завершённого прогона. На курсе 85 верхний замер стоил 43.2 ₽, а `Math.round` давал
`max = 43` — прогноз, который живой прогон уже опроверг, причём в соседней строке экрана.
`Math.floor` низу и `Math.ceil` верху; тест проверяет не «красивое число», а что оба
крайних замера попадают внутрь `[min, max]`.

### ✅ Курс валюты и любой внешний коэффициент — снапшот С ДАТОЙ, а не константа

`USD_RUB = 100` держался с 2026-08-03 и завышал на четверть **и прогноз, и факт** (обе
функции считают по одной константе). Заметить это нельзя: цена выглядит правдоподобно
всегда — нет ни исключения, ни пустого экрана. Та же природа, что справочники ЧЗ: значение
без даты сверки не устаревает, а тихо врёт. В комментарии — дата, источник и что именно
ломается при протухании.

Побочно: замер эмпирики — тоже снапшот. `WEB_RUN` описывал «одна попытка против ретрая»,
хотя после S-COMPANY-AI-1c ретрая почти не бывает, а вход гуляет втрое. Диапазон отвечал
не на тот вопрос — правильный вопрос находится перезамером в проде, а не подгонкой чисел.

### ❌ Поле, которого нет в payload события, не восстанавливается никогда

`activity_log.task_created` писал `title` и `priority` без `task_id` — 478 событий, из
которых нельзя открыть задачу. Бэкфилл невозможен: заголовки не уникальны (у шаблонов
внедрения они повторяются буквально). Правка идёт только вперёд, и каждый день ожидания
добавляет немых событий.

**Правило:** событие журнала обязано нести идентификатор сущности, о которой оно, даже если
сегодня его никто не читает. Человекочитаемое поле — для показа, не для связи.

### ✅ Разбор payload — работа представления, не RPC

`entity_timeline` про содержимое `payload` ничего не знает и знать не должен: `ref_type` /
`ref_id` у `activity` приходят как null. Клик по событию журнала про задачу собирается в
`rpc-adapter.ts` (`task_id` → `sourceId` + `refType='task'`) и открывается в `open-event.ts`
ТЕМ ЖЕ путём, что `kind='task'` — общей функцией, а не второй копией выборки: две ветки
«открыть задачу» разъехались бы при первой правке.

⚠️ У `kind='activity'` payload источника лежит ВЛОЖЕННО (`{event_type, payload}` — так его
ждёт `describeEvent`), поэтому чтение верхнего уровня всегда вернуло бы null.

---

## Уроки 2026-08-09 (S-UI-SEMANTIC-1 — семантические токены состояния)

### ❌ Переменная, объявленная в ОДНОЙ теме, читается всеми семью

`--danger` / `--success` / `--warning` / `--info` были объявлены только в `.t-fuji` (там их
завели как «fuji-specific tokens»), а девять мест в коде уже читали их инлайном: просроченный
срок (`TasksTable`, `TaskStream`, `TaskStreamRow`), критичный/важный приоритет
(`TaskStreamRow`, `calendar/grid-core`), линия текущего времени (`WeekGrid`, `TeamDayGrid`).
В шести темах из семи — включая **minimal, рабочую тему владельца** — переменной не было.

Коварство в том, что отсутствующая CSS-переменная **не падает, а меняет поведение по типу
свойства**:

| Свойство | `var(--x)` не резолвится | Что видит владелец |
|---|---|---|
| `color` (наследуемое) | наследует цвет родителя | текст на месте, но сигнала нет — читается как «не просрочено» |
| `border-top: 1px solid var(--x)` | вся декларация невалидна на этапе computed-value → `border-style: none` | **элемента нет вовсе** |

Линии «сейчас» в видах «Неделя» и «Команда» не существовало ни в одной теме, кроме fuji,
и это дожило до владельца.

**Правило:** тема-специфичный токен — тот, который читает только эта тема (`--gold`,
`--accent-foam`, `--sidebar-*`). Как только на переменную ссылается компонент, она обязана
быть объявлена там, где её видят все темы. Проверка перед тем как завести токен внутри
`.t-*`: «может ли на него сослаться `src/components/**`?» — если да, место не здесь.

### ✅ Alias-слой на `:root` работает потому, что класс темы висит на `<html>`

```css
:root {
  --danger:  var(--red);   --danger-l: var(--red-l);  --danger-text: var(--red-text, var(--red));
  --success: var(--green); ...
}
```

`.t-*` вешается на `document.documentElement` (`layout.tsx` + `ThemeProvider`) — тот же
элемент, что и `:root`. Поэтому `var(--red)` внутри alias резолвится уже с активной темой:
тема правит палитру, семантика едет следом сама, второй блок в теме не нужен и означал бы,
что тема разошлась с собственной палитрой. **Если бы класс темы висел на `<body>`, приём бы
не работал** — alias на `html` брал бы палитру дефолтной темы.

`var(--red-text, var(--red))` — fallback на случай, когда тема не объявила затемнённый
вариант (у `:root`-дефолта и frost есть только `--yellow-text`).

### ⚠️ Этот класс дефекта не ловится ни tsc, ни линтом, ни тестами

`tsc --noEmit` чист, lint ровно baseline, 1102 теста зелёные — и до правки, и после.
Недостающая CSS-переменная невидима для всей автоматики: JSDOM не считает computed style,
а строка `'var(--danger)'` типизирована как обычный `string`. **Единственная проверка —
переключить тему и посмотреть глазами.** Отсюда практика: визуальный смок гнать не только
в minimal, но и хотя бы раз в теме, отличной от той, в которой писался код.

### ✅ Палитровое ≠ семантическое: массовую замену НЕ делать

Палитровые утилиты (`text-red`, `bg-green`, …) используются **614 раз**. Замена всех на
`text-danger` была бы заменой одной неточности на другую: в большинстве мест `red` означает
домен (приоритет задачи, стадия сделки, статус), а не «опасность». Семантический слой взят
там, где цвет означает **состояние операции** — ошибка загрузки, успех, просрочка. Границу
держать: `--danger` про сбой, `--red` про то, что просто красное.

---

## Уроки 2026-08-09 (S-CAL-LANES-1 — неделя как лента, гейт)

### ❌ Инвариант, проверенный не в тех единицах, — это отсутствие проверки

Упаковка чипов дорожки держала инвариант «в ряду нет пересечений» и имела на него
шесть зелёных юнит-тестов. Инвариант держался **в минутах оси**. Виден он —
**в пикселях**.

Чип имеет ширину в rem (иконка + `HH:MM` + название до 11rem), а `CHIP_NOMINAL_MIN`
описывал его как 100 минут оси. Замер в Chromium: полный чип **250px**, на
минимальной ширине контейнера (56rem → дорожка 752px, ось 900 минут) это **300 минут**.
Звонок 10:10 и задача 12:00 расходятся на 110 минут — по алгоритму не пересекаются,
на экране накладываются на **158px**.

Корень глубже занижённой константы: **величина, связывающая rem и минуты оси, не
может быть константой** — соотношение зависит от ширины дорожки, то есть от вьюпорта
и от размера корневого шрифта (вёрстка проекта на rem именно ради того, чтобы
пользователь мог его увеличить). Любое число здесь верно ровно для одной ширины окна.

Лечение — `chipSpanMinutes(laneWidthPx, axisMin, rootFontPx)` + `ResizeObserver` на
обёртку; константы остались fallback'ом до первого замера.

**Правило:** если величина живёт в двух системах координат (время ↔ пиксели,
проценты ↔ rem), инвариант проверять в той, в которой его видит пользователь.
Тест, написанный в удобных единицах, зелёный и бесполезный.

**Как ловить дешево:** отрендерить компонент в headless-браузере и померить
`getBoundingClientRect()` — на гейте это заняло десять минут и дало точное число
вместо «кажется, тесновато». Прикидка на глаз тут не работает в принципе: ошибка
была втрое, а выглядела как разумная константа.

### ⚠️ «На живых данных не воспроизводится» — не «не воспроизводится»

Двухрядная раскладка и сжатие не проверялись вживую: в проде нет ни одного дня с
пересечением. После фикса номинал на узком экране стал 297 минут — второй ряд
теперь возникает у **любых двух событий в пределах пяти часов**, то есть ровно на
тех данных, что уже есть. Ветка из непроверяемой стала проверяемой глазом сразу.

Это общий приём: если ветка кода не достаётся живыми данными, стоит проверить, не
слишком ли редко она включается по вине неверной константы.

### ⚠️ Токен, подписанный «цвет иконки», нельзя брать для текста

`KIND_META.fg` в `lib/timeline/kind-meta.ts` документирован как **цвет иконки** и
подобран под графику (WCAG: ≥3:1). Лента недели покрасила им время на чипе — текст
11px, которому нужно 4.5:1. Факт (contrast.py, тема minimal): встреча `text-green`
**3.9:1**, задача `text-yellow` **3.84:1**; на дорожке «сегодня» ещё ниже (3.55 и
3.49) — там тинт чипа ложится на тинт фона дорожки, и оба полупрозрачные.

Лечение — разделение ролей внутри чипа: **цвет вида несёт иконка, текст берёт
`--text`** (15:1 во всех семи темах). Кодировка вида сохраняется иконкой, тинтом
фона и бордером — цветного текста для неё не требуется.

Тот же приём стоит помнить при любом наложении тинтов: `bg-*-l` на `--accent-l`
съедает 0.3–0.4 контраста, и пара, проходящая на `--surface`, может не пройти на
подсвеченной строке.

---

## Уроки 2026-08-09 (S-CAL-MONTH-1 — месяц с чипами, гейт)

### ❌ `repeat(N, 1fr)` — это `minmax(auto, 1fr)`, и `auto` ломает равные колонки

Сетка месяца объявлена `grid-template-columns: repeat(7, 1fr)`. Пока в ячейке жила
одна цифра, колонки были равными. Чипы событий принесли в ячейку текст в одну строку
(`nowrap` + `ellipsis`), и колонка с длинным названием **перестала сжиматься**:
`1fr` — сокращение от `minmax(auto, 1fr)`, а `auto` у grid item равен его
**min-content**, то есть ширине неразрывного содержимого.

Замер в Chromium (viewport 1280): колонка с чипами **242px против 163px** у соседних.
Дни разной ширины — и это лишь половина беды. Шапка `Пн…Вс` — отдельная сетка **без
содержимого**, её колонки остались равными, поэтому подписи перестали стоять над
своими столбцами: смещение до **17px**, «Чт» уезжает на «Пт».

Лечение — `repeat(7, minmax(0, 1fr))`: нижняя граница снимается, лишнее уходит в
`ellipsis`, как и задумано. После фикса смещение подписей 0px по всем семи.

⚠️ Второй множитель той же ошибки: **`gap` должен быть одинаковым у шапки и у сетки**.
Тело имело `gap: 2`, шапка — нет; даже с `minmax(0, 1fr)` это давало расхождение
~1.7px на колонку, накопительно до 12px к воскресенью.

**Правило:** любая сетка с текстовым содержимым внутри ячеек — `minmax(0, 1fr)`,
а не `1fr`. И если шапка колонок живёт отдельной сеткой, у неё обязаны совпадать
и трек-функция, и `gap` — иначе выравнивание держится случайно.

**Как ловить:** отрендерить в headless-браузере и сравнить центры подписей с центрами
столбцов (`getBoundingClientRect`). Глазами на живых данных дефект не виден, пока не
попадётся день с длинным названием события — а он попадётся у владельца, не на смоке.

### ✅ Портал в SSR — флаг `mounted`, а не `typeof document === 'undefined'`

`PeekPanel` рисовала портал по ветке `typeof document === 'undefined' ? null : createPortal(…)`.
Пока панель открывалась только кликом, в серверный рендер она не попадала и дефект
спал. Peek дня месяца открыт уже в первом рендере (`?date=…`) — и разошёлся markup
сервера и клиента, то есть **гидрация всей страницы**.

Симптом обманывал: React выбрасывал дерево, но в DOM оставалась панель от неудавшейся
гидрации — на экране висел паспорт 8 июля при `?date=2026-07-15` в адресе и верном
`dateKey` внутри дерева React.

**Правило:** порталы монтируются через `const [mounted, setMounted] = useState(false)`
+ `useEffect(() => setMounted(true), [])`. Ветка по `typeof document` даёт разный
markup **по построению** и ждёт своего часа до первого SSR-рендера с открытой панелью.

---

## Уроки 2026-08-09 (S-CAL-MONTH-2 — hairline-сетка, гейт)

### ❌ Инлайновый стиль отменяет ЛЮБОЕ правило темы без `!important`

Спринт переносил ховер ячейки дня из `.t-aura` в общий слой — и правило
`.cal-day:hover { background: var(--surface2) }` не сработало бы **ни в одной
теме**: `MonthGrid` ставил `background` инлайном на каждой ячейке, хотя бы
`transparent`. Инлайн бьёт таблицу стилей по специфичности, поэтому у прежнего
аура-правила и стоял `!important` — он был не «на всякий случай», а обязателен.

Лечение — не добавлять `!important`, а **убрать инлайн**: фон дня переехал в CSS
вместе с ховером, порядок правил стал значимым (`[data-selected]` последним, иначе
ховер подменяет акцентное кольцо выбранного дня). Побочный выигрыш: аура-правило
со специфичностью (0,3,0) снова выигрывает у общего (0,2,0), и в Aura вернулось
фирменное фиолетовое кольцо вместо акцентного.

**Правило:** прежде чем объявлять состояние (`:hover`, `:focus-visible`) в CSS,
проверь, не ставит ли компонент это же свойство инлайном. Если ставит — сначала
инлайн убирается, иначе правило пишется в пустоту и это не видно ни тестам, ни tsc.

### ⚠️ `--border2` НЕ значит «линия темнее» — в washi он светлее `--border`

`--border2` в темах не имеет общего смысла: в washi это `#E5DFD5` при `--border`
`#D8D2C8`, то есть **светлее**. Контур ховера на нём давал 1.08:1 — в washi ховера
опять не было бы. Для рамки интерактивного элемента брать `--border-input`: он в
каждой теме подписан «≥3:1 к surface» и это подтверждено замером (2.92–4.27:1 по семи).

### ❌ Токен границы, рассчитанный на `--surface`, тонет на `--surface2`

Hairline-линии сетки месяца взяли `--border`. На обычном фоне ячейки это 1.23–1.47:1 —
достаточно. Но **внутри блока выходных** линия идёт по двум ячейкам с заливкой
`--surface2`, и там падает до **1.11–1.23:1** в пяти светлых темах. Сб и Вс
продолжали читаться одной плашкой — тот самый дефект, ради которого спринт делался,
просто переехал внутрь выходных.

Введён отдельный токен:

```css
:root { --cal-line: color-mix(in srgb, var(--border) 75%, var(--text-mute)); }
```

`--text-mute` контрастен к фону в любой теме по построению, поэтому подмешивание
работает одним общим правилом, без тема-специфичных: 1.71–2.05:1 на обычном фоне,
1.48–1.71:1 между выходными. Пропорция 75/25 — «видно везде, но всё ещё hairline»;
55/45 давало явную таблицу и спорило с эстетикой minimal.

**Правило:** токен границы подобран под ОДИН фон. Если линия ложится на другой
(тинт, заливка выходных, подсвеченная строка) — проверь контраст там же, а не
только на `--surface`.

### ⚠️ `getComputedStyle` сразу после подмены темы отдаёт цвет посреди transition

Смок семи тем в браузере выдал семь одинаковых строк и выглядел как «правило не
применяется». Причина — замер в момент перехода. Пауза длиннее `--duration-fast`
между сменой класса темы и чтением стилей обязательна.

---

## Уроки 2026-08-09 (S-FIX-BATCH-1 — контакты, поповеры, мусор импорта)

### ❌ Память проекта декларировала soft delete, которого в схеме НЕТ

Спека спринта требовала чистить данные через `deleted_at` — «физическое удаление
не входит». Опиралась она на контракт проекта («Soft delete MUST be the default
for business CRM records»). Разведка: **колонки `deleted_at` нет ни у одной
таблицы**, весь проект на hard delete.

То есть правило было записано как действующее, а фактически не реализовано —
и спека, написанная по памяти, поставила невыполнимое требование. Спринт был
вынужден его нарушить, чтобы вообще что-то сделать.

**Правило:** контракт, который не проверяется по схеме, со временем расходится с
ней и начинает вводить в заблуждение — именно тем, что выглядит проверенным.
Либо привести схему к контракту (миграция с `deleted_at` для бизнес-таблиц), либо
исправить контракт на фактическое «hard delete, чистка только через гейт». Пока
решение не принято — обе стороны считают, что правы, а спринты платят.

### ✅ «Дубли в списке» бывают дефектом ИМПОРТА, а не фильтра

Симптом: список «Личное» забит строками плана, часть по три раза. Очевидная
гипотеза (и посылка спеки) — виноват фильтр, надо прятать строки плана. Разведка
опровергла: `wbs_code is not null ⇒ project_id is not null` без исключений, то
есть у мусора из «Личного» признака плана нет вовсе, и никакой фильтр его не
поймает — WBS-номер у него зашит в ТЕКСТ («1.1. Подготовительный этап»).

Настоящая причина — `MigrationTool`: шаг `projects` писал в `projects.stage`,
которой нет с переезда на воронки, и падал каждый прогон; независимый шаг `tasks`
при этом проходил и наливал план личными задачами. Пять прогонов → 398 строк,
каждая ровно в трёх копиях.

**Правило:** прежде чем прятать данные фильтром, проверить, откуда они взялись.
Фильтр поверх мусора маскирует симптом и оставляет источник работать: следующий
прогон нальёт ещё. И шаги импорта, зависящие друг от друга, обязаны быть
последовательными — независимые шаги с общими данными дают ровно этот класс.

### ⚠️ Гвард по КОЛИЧЕСТВУ строк не защищает состав набора

Миграция 116 удаляет 398 строк с проверкой `if v_count <> 398 then raise`. Это
верный приём (и он поймает большинство расхождений), но он не идемпотентен по
составу: если между разведкой и применением одну строку набора удалить руками,
а одну новую создать в тот же календарный день — счёт сойдётся, а удалится не то.

Для наборов, отобранных по дате, окно между разведкой и `apply` должно быть
коротким, а `SELECT` из шапки миграции — прогнан непосредственно перед ней.
Надёжнее гвардить по `max(id)`/списку id, если набор небольшой.

---

## Уроки 2026-08-09 (S-TASKS-FIX-2 — поиск компании, удаление выполненных)

### ✅ Точечное и массовое удаление — РАЗНЫЕ права, и это не перестраховка

`lib/domain/task-delete.ts` держит два предиката вместо одного:

- `canDeleteTask` — зеркало RLS `tasks_delete` (проверено по `baseline.sql:3648`:
  `org_id = current_org_id() AND (role IN ('owner','admin') OR created_by = auth.uid())`).
  Показывать иконку шире политики нельзя — клик даст 403 «в пустоту»; уже́ —
  отнимет у владельца право убрать чужой мусор поштучно.
- `bulkDeleteSet` — строго уже: плюс «только мои» и «не строки плана». У owner'а
  RLS **разрешает** снести выполненные задачи всей команды, и именно поэтому
  массовая кнопка так не делает: человек в режиме «Все» жмёт «Удалить
  выполненные», и чужая закрытая работа исчезает без отката.

**Правило:** право на одну строку и право на набор — разные вопросы. Осознанный
клик по конкретной задаче и сгребание N строк одной кнопкой отличаются ценой
ошибки, а не механикой. Массовое действие всегда сужается относительно RLS.

⚠️ Отдельно: `assigned_to` даёт право на `UPDATE`, но НЕ на `DELETE`. Предикат
«Мои» задачу включает, предикат удаления — нет. Поэтому набор пересекает оба,
а не полагается на один: иначе счётчик на кнопке соврал бы, а сервер отверг часть.

### ⚠️ Счётчик на кнопке удаления считается от НАБОРА, а не от готового doneCount

`doneCount` в `TasksView` игнорирует поиск и ничего не знает о правах. Кнопка
«Удалить выполненные (N)» обязана показывать длину того самого массива, который
уйдёт в запрос, — иначе число на кнопке и число удалённых разойдутся, и заметит
это человек уже после необратимого действия.

### ⚠️ Смок компонентов с TTL: браузерные тулы медленнее, чем окно подтверждения

`InlineConfirm` в inline-режиме сам откатывается через `CONFIRM_TTL_MS` (5 с).
Round-trip браузерных инструментов длиннее, поэтому «клик по подтверждению»
попадал уже в строку под ним — дважды выглядело как «`stopPropagation` не
работает». Такие сценарии проверять ОДНИМ скриптом в пределах TTL, а не серией
вызовов.

### 🐛 Известный дефект (вне скоупа): Esc в Combobox внутри Modal закрывает оба

Открытый `Combobox` внутри `Modal` по Esc схлопывает и список, и саму модалку —
поведение общее с `CallModal`. Ожидаемое: первый Esc закрывает список, второй —
модалку. Ловится любым вводом в поле с последующим Esc: набранный текст уезжает
в никуда вместе с формой.
