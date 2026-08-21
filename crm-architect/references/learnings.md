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

### ❌ `useRealtimeSync` без таблицы в publication молчит — и молчит ТИХО
У realtime два конца, и клиентский ничего не знает о серверном. `useRealtimeSync('contacts', …)`
открывает канал, канал подключается успешно, ошибки нет ни в консоли, ни в сети — просто
событий не приходит никогда, потому что таблицы нет в `supabase_realtime`. Симптом
неотличим от «в системе ничего не происходит», поэтому дефект живёт годами: подписки
`contacts`/`companies` (S-R2) и `activity_log` (042) были мёртвыми до 122 (S-TAILS-1),
четыре хука. Заметным это стало только по контрасту — после 121 лид на канбане
обновлялся живьём, а контакт рядом нет.

**Правило:** заводя realtime новой сущности, сверять ОБА конца одним запросом —
```sql
select tablename from pg_publication_tables where pubname='supabase_realtime' order by 1;
```
против грепа `useRealtimeSync\(` по `src/`. Расхождение в любую сторону — дефект:
подписка без таблицы молчит, таблица без подписки шлёт трафик в никуда (в проекте
таких четыре: `activities`, `dashboard_sync`, `message_reactions`, `project_members`).

⚠️ Включение таблицы шире, чем кажется по числу хуков: `activity_log` питает ленту
сущности, org-ленту дашборда и правый дровер сразу, а пишут её ещё и триггеры аудита
(087) — чаще, чем люди. Такую строку `alter publication` нужно смочить на частоту
перерисовки, а не только на «событие долетело».

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
- `tailwind.config borderRadius`: `rounded-md` **удалён** (был дублем `rounded`); `rounded-xl = calc(var(--radius-l) + 2px)` фиксит инверсию `xl<lg`. `extend` deep-мержится с дефолтом TW — порядок мержа важен. Острая тема — washi (`--radius: 4px`, `--radius-l: 8px`); у minimal средние 10/14.
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
- ❌ **`date`-колонку нельзя вычитать из локальной полуночи.** `new Date('2026-08-09')`
  — это UTC-полночь, а `new Date(now.toDateString())` — ЛОКАЛЬНАЯ: в MSK разница
  теряет три часа, и `Math.floor(diff / 86400000)` съедает целые сутки. Так
  `getNextActionOverdueDays` показывала «просрочен 0 дн.» на вчерашнем шаге сделки —
  дефект прожил в проде до S-TAILS-1 и нашёлся не глазами, а тестом соседней сущности.
  Разницу календарных дат считать **только ключами дня**: `diffDaysKey(dateKey, localDateKey(now))`.
  ⚠️ Смещение ломает ДЕЛЕНИЕ, но не СРАВНЕНИЕ: `new Date(date) < today` устойчиво
  (граница сдвинута одинаково у обеих дат) — поэтому `getDealHealth` намеренно оставлена
  как была. Не «доводить до единообразия» заодно: это меняет условие попадания в очередь дня.
- ✅ **«Сейчас» — всегда параметр с дефолтом** (`now: Date = new Date()`). Без него
  функция недетерминирована и не тестируется. И передавать его надо ДО САМОГО НИЗА:
  `leadStaleness` параметр принимала, а внутри читала `Date.now()` — тест этого не ловил.

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


---

## Хроника спринтов

Уроки по конкретным спринтам вынесены в [`journal.md`](./journal.md) (S-MEM-1, 2026-08-21).
Здесь — только тематика, переиспользуемая между спринтами.
