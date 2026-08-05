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
