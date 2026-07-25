# Ревью: Sprint W3 — Масштабирование данных

**Дата:** 2026-07-19  
**Ревьюер:** Grok (верификация по коду `main` @ `999a538`; shell layout, CommandPalette, TextNavSidebar, EventReminder, ActivityDrawer, list-хуки, use-last-touch, use-realtime, consumers, schema/architecture/learnings crm-architect, HANDOFF-2026-07-18)  
**Объект:** `_analysis/sprint-w3-scale.md` — count/window вместо org-fetch · ленивый серверный ⌘K · view `contact_last_touch` (060) · infinite list hooks · DataErrorBadge  
**Контекст:** W1 (`054–056b`) и W2 (`057`) в репо; миграции `058`/`059` заняты (invite/role); цепочка до `067`; слот **060 свободен** (между 059 и 061) — HANDOFF-2026-07-18 явно резервирует 060 под W3. Предыдущее ревью того же файла (миграция «должен быть 058») **устарело по номеру**; блокеры B1/B2/B3 по blast radius **не сняты**.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Проблема org-fetch в shell реальна | ✅ layout L67 + CommandPalette L98–104 + sidebar/reminder/drawer |
| Порядок «сначала consumers 1–3, потом лимиты 4» | ✅ верный принцип |
| count-паттерн `dashboard-content` | ✅ L29–43 `head: true` / `count: 'exact'` |
| ⌘K `enabled` + server ilike limit 10 | ✅ направление; сейчас без `enabled` |
| View + `security_invoker = true` | ✅ обязательно (RLS underlying) |
| last_touch → view + realtime invalidate | ✅ дыра реальна; фикс нужен |
| Номер миграции 060 | ✅ свободен; обоснован HANDOFF (058–059 заняты) |
| W1/W2 prerequisite | ✅ оба в репо |
| Семантика бейджа задач + shell calls/leads | 🟡 **B3** (в задаче 1 не закрыто) |
| Smoke «холодный / Сегодня без contacts…» | ❌ **B1** — TodayView сам org-fetch |
| `useContacts`/`useCompanies`/`useCalls` → `useInfiniteQuery` | ❌ **B2** — ломает не-табличных потребителей; `mapInfinitePages` чинит только форму кеша |
| Модалки-комбобоксы на full lists | ❌ **B2** (CallModal/TaskModal/…) |
| crm-architect (миграция/гейт/RLS view) | ✅ при security_invoker + GRANT + docs |

**Оценка: 5.5/10.** Верная P0-цель и сильные задачи 1–3/5; задача 4 в текущей формулировке — архитектурный regression-risk; критерий cold-entry противоречит `TodayView`.  
**Рекомендация:** **не запускать в CC как есть** — сначала правки B1–B2 (и желательно B3/W*) в текст спринта.

---

## Статус (репо)

| Заход | В репо |
|-------|--------|
| layout монтирует CommandPalette + EventReminder + ActivityDrawer всегда | ✅ `src/app/(dashboard)/layout.tsx` L64–67 (`QuickActionModals`/`GlobalModals` уже dynamic — W4a; palette **статика**) |
| CommandPalette: 7 entity-хуков без `enabled` | ✅ L98–104; `open = commandPaletteOpen` (L77) |
| TextNavSidebar: `useTasks` + `useCalls` + `useLeads` full | ✅ L83–85, badges L99–110 |
| EventReminder: full calls/meetings/tasks |# Ревью: Sprint W3 — Масштабирование данных

**Дата:** 2026-07-19  
**Ревьюер:** Grok (верификация по коду `main` @ `999a538`; shell layout, CommandPalette, TextNavSidebar, EventReminder, ActivityDrawer, list-хуки, use-last-touch, use-realtime, consumers, schema/architecture/learnings crm-architect)  
**Объект:** `_analysis/sprint-w3-scale.md` — count/window вместо org-fetch · ленивый серверный ⌘K · view `contact_last_touch` (060) · infinite list hooks · DataErrorBadge  
**Контекст:** W1 (`054–056b`) и W2 (`057`) в репо; миграции **058–059, 061–067** уже заняты; слот **060 свободен** (осознанный gap по handoff 2026-07-18). Предыдущее ревью (07-18) устарело по номеру миграции; **B1/B2/B3 по blast radius и cold-entry smoke не сняты**.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Проблема org-fetch в shell реальна | ✅ layout L51–67 + CommandPalette L98–104 + sidebar/reminder/drawer |
| Порядок «сначала consumers 1–3, потом лимиты 4» | ✅ верный принцип |
| count-паттерн `dashboard-content` | ✅ L29–43 `head: true` / `count: 'exact'` |
| ⌘K `enabled` + server ilike limit 10 | ✅ направление верное; сейчас без `enabled` |
| View + `security_invoker = true` | ✅ обязательно (RLS underlying) |
| last_touch → view + realtime invalidate | ✅ дыра реальна; фикс нужен |
| Номер миграции 060 | ✅ слот свободен (058/059/061+ заняты) |
| W1/W2 prerequisite | ✅ оба в репо |
| Семантика бейджа задач + shell calls/leads | 🟡 **B3** (в задаче 1 не закрыто) |
| Smoke «холодный / Сегодня без contacts…» | ❌ **B1** — TodayView сам org-fetch |
| `useContacts`/`useCompanies`/`useCalls` → `useInfiniteQuery` | ❌ **B2** — ломает не-табличных потребителей; `mapInfinitePages` чинит только форму кеша |
| Модалки-комбобоксы на full lists | ❌ **B2** (CallModal/TaskModal/…) |
| crm-architect (миграция/гейт/RLS view) | ✅ при security_invoker + GRANT + docs |

**Оценка: 5.5/10.** Верная P0-цель и сильные задачи 1–3/5; задача 4 в текущей формулировке — архитектурный regression-risk; критерий cold-entry противоречит `TodayView`.  
**Рекомендация:** **не запускать в CC как есть** — сначала правки B1–B2 (и желательно B3/W*) в текст спринта.

---

## Статус (репо)

| Заход | В репо |
|-------|--------|
| layout монтирует CommandPalette + EventReminder + ActivityDrawer всегда | ✅ `src/app/(dashboard)/layout.tsx` L64–67 (QuickAction/GlobalModals — dynamic, W4a; palette **статика**) |
| CommandPalette: 7 entity-хуков без `enabled` | ✅ L98–104 (`useTasks`…`useLeads`); `open = commandPaletteOpen` L77 |
| TextNavSidebar: `useTasks` + `useCalls` + `useLeads` full | ✅ L83–85, badges L99–110 |
| EventReminder: full calls/meetings/tasks | ✅ L24–26; окно **15 мин**, tasks 9–10h |
| ActivityDrawer Calendar/Stats: full hooks | ✅ Calendar L114–116; Stats L203–206 (+ `useProjects`) |
| `useLastTouchMap` из full calls+meetings | ✅ `use-last-touch.ts` L47–71 |
| `contact_last_touch` view / 060 | ❌ нет |
| `useTaskBadgeCount` / palette lazy / DataErrorBadge | ❌ |
| `mapInfinitePages` / infinite list hooks | ❌ |
| `useAlerts` | ⚪ orphan (определение есть; consumers **нет**) |
| W1 mig 054–056b | ✅ |
| W2 mig 057 | ✅ |
| Следующий свободный номер для W3 | **060** (gap 059→061) |

---

## Разведка (верификация утверждений спринта)

| Утверждение спринта | Live |
|---------------------|------|
| Shell грузит все сущности через palette | ✅ 7 хуков в `CommandPalette.tsx` L98–104 |
| list-хуки без limit | ✅ calls/meetings/contacts/companies/tasks — без `.limit`; leads converted — limit 100 |
| count-паттерн в dashboard-content | ✅ L29–43 |
| `PROJECT_COLUMNS` образец | ✅ `use-projects.ts` L141+ |
| `select('*')` в calls/meetings | 🟡 фактически `SELECT_WITH_JOINS = \`*, joins\`` (`use-calls.ts` L49–54, meetings аналогично) — `*` + join, не голый `select('*')` |
| last_touch consumers | ✅ ContactsTable, CompaniesTable, TodayView, ContactDetailHub |
| Client touch: call `done`; meeting `date ≤ today` | ✅ L59–68; meeting: `m.date.slice(0,10) > todayKey` skip; **time игнор** |
| `localDateKey` (зависимость W2) | ✅ уже в `date-helpers.ts`; W2 057 merged |
| Activity feed limit 50 | 🟡 global `use-activity-log` `.limit(50)`; drawer зовёт `useRecentActivity(5)` L245 |
| `useRealtimeSync` инвалидирует префикс | ✅ RQ partial match: `['tasks']` → `['tasks','badge-count']`; **но** `['calls']` **не** матчит `['contact-last-touch']` |
| Миграция 060 | ✅ свободна; handoff явно резервирует 060 для W3 |

### Diagnostic greps (live)

```
CommandPalette: useTasks/Projects/Companies/Contacts/Calls/Meetings/Leads (L98–104)
TextNavSidebar: useTasks/Calls/Leads (L83–85)
EventReminder: useCalls/Meetings/Tasks (L24–26)
ActivityDrawer: useCalls/Meetings/Tasks/Projects (L114–116, L203–206)
useLastTouchMap: ContactsTable, CompaniesTable, TodayView, ContactDetailHub
limit( in hooks: activity-log, ai-run, entity-timeline, leads(converted), notifications — НЕ list core
useAlerts consumers: нет (только StatusBeacon type + use-alerts.ts)
useCalls(): ~20 call-sites (Today, Calendar, Dashboard, analytics, widgets, shell, modals, last-touch)
useContacts(): tables + 6+ modals combobox + Today + CompaniesTable allContacts + Export
```

---

## С чем согласен полностью

### 1. Проблема реальна и P0
Любой заход в `(dashboard)` поднимает CommandPalette с семью full-list query — org-fetch × N таблиц + realtime refetch. На команде с историей — деградация.

### 2. Порядок задач 1→3, затем 4
Правильный: сначала убрать неявных shell-потребителей, потом резать list-API. Иначе виджеты «молча» едят урезанный кеш.

### 3. ⌘K: lazy + server search limit 10
Направление верное. Секции Действия/Виды/Навигация — статичны, не трогать. v1: calls по связанным именам не искать — ок. Поля поиска (`tasks.text`, `projects.name`, `leads.title`, contacts first/last, `meetings.title`, `companies.name`) совпадают с live labels в palette L178–266.

### 4. View `contact_last_touch` + `security_invoker = true`
Единственно безопасный вариант: underlying RLS calls/meetings. Без invoker — tenant leak. Partial-индексы уместны (поверх уже существующих `idx_calls_contact` / `idx_meetings_contact`). Гейт: advisors + паритет 3–5 контактов.

### 5. Realtime → ключ view
`useRealtimeSync` (`use-realtime.ts` L105–115) инвалидирует **один** `queryKey`. Ключ `['contact-last-touch']` **не** префикс `['calls']`. Явная доп. инвалидация обязательна (см. W5).

### 6. `ai_summary` out of list select + detail hooks
`AiWorkspaceModal.tsx` L27–36 берёт summary из `useCalls()`/`useMeetings()` по id — после урезания колонок сломается. `useCallDetail` / `useMeetingDetail` — правильный путь. (У contacts уже есть `useContact(id)` L155 — паттерн есть; у calls detail-хука **нет**.)

### 7. Не пагинировать deals/tasks boards
Борды и Today зависят от полного/окна активного набора — согласен.

### 8. DataErrorBadge вместо silent zeros
QueryProvider тостит мутации; query errors на KPI/Today/⌘K маскируются нулями — inline badge уместен. Политика «не тост на query» сохраняется. CSS: только `var(--*)`.

### 9. Миграцию не apply из CC
Гейт Cowork + `docs/schema.md` + skill — по learnings. W1/W2 уже прошли этот контракт.

### 10. `mapInfinitePages` — частичный учёт
Спринт честно фиксирует optimistic-регрессию infinite-кеша (`getQueryData<T[]>` в contacts/companies/calls). Это **необходимо**, но **недостаточно** (см. B2).

### 11. Номер 060 корректен
В отличие от ревью 07-18: 058 (`accept_invitation`), 059 (`membership_role_guard`) уже в репо; 061+ заняты; **060 — правильный свободный слот**.

---

## Блокеры (критично — исправить до запуска)

### B1. Smoke cold-entry «Сегодня» противоречит `TodayView`

Спринт ПРОВЕРКА:

> НЕТ запросов contacts/companies/leads (палитра закрыта)

Live `TodayView.tsx` L45–52 **на `/` всегда**:

- `useCalls()`, `useLeads()`, `useTasks()`, `useMeetings()`, `useProjects()`, `useContacts()`, `useLastTouchMap()` (ещё раз calls+meetings до view)

Даже при идеальном lazy ⌘K + count-shell холодный вход на «Сегодня» **обязан** тянуть contacts/leads/projects/calls/meetings/tasks. Критерий смоука **ложный** → CC «пройдёт» смоук только если сломает Today, или зафейлит его честно.

**HOW в спринт:**  
- либо сузить smoke: «shell-only layout mount без children / маршрут без Today-данных / Network filter: palette-query отсутствуют пока ⌘K закрыт»;  
- либо добавить задачу **Today windows** (pending calls date-window, tasks open lanes, meetings today, reconnect через view — **без** full `useContacts` scan), и только тогда обещать отсутствие full contacts/companies/leads.

### B2. Задача 4: shared `useInfiniteQuery` ломает не-табличных потребителей

Спринт предлагает заменить **общие** `useContacts` / `useCompanies` / `useCalls` на infinite + `mapInfinitePages` для optimistic. Таблицы (ContactsTable, CompaniesTable, CallLog) — малая часть consumers. `mapInfinitePages` чинит **форму** кеша `{pages}`, но **не** семантику «полный справочник / полный inbox».

**`useCalls()` live (не CallLog):**  
TodayView, CalendarView, DashboardHome, analytics (`CallsChart`, `WeeklyReview`, `ExportPanel`, `OverviewCharts`), ContactDetailHub (`allCalls`), EventReminder/ActivityDrawer, TextNavSidebar, CallTracker, widgets (`WeeklyHeatmap`, `StatsWidget`, `TasksSidebar`), AiWorkspaceModal, use-last-touch, use-alerts.

**`useContacts()` / `useCompanies()`:**  
**все модалки-комбобоксы** — CallModal L64, MeetingModal L34, TaskModal L42, ProjectModal L40, ContactModal L38, LeadConversionModal L31; TodayView reconnect; CompaniesTable `allContacts`; CompanyDetail; ContactDetailHub `allCompanies`; ExportPanel; widgets.

После `.range(0,49)`:

- комбобокс «Контакт» видит 50 из N → **silent data loss** при создании звонка/сделки;  
- Today «просроченные звонки» / календарь / analytics — урезанная выборка;  
- ContactDetailHub «все звонки контакта» — дыры, если звонок не в первой странице global order.

**HOW (выбрать один контракт, вписать в спринт явно):**

| Вариант | Суть |
|---------|------|
| **A (рекомендуется)** | Оставить `useContacts`/`useCompanies`/`useCalls` как full (или scoped) query; добавить **отдельные** `useContactsInfinite` / `useCallsInfinite` только для таблиц + optimistic на их queryKey |
| **B** | Infinite по умолчанию, но **до** этого: combobox → server `ilike`+limit; Today/Calendar/Dashboard → window/count hooks; ContactDetail → `useEntityTimeline` / `.eq('contact_id')` |

Без A или B задачу 4 **нельзя** отдавать в CC.

### B3. Задача 1 не закрывает shell org-fetch calls/leads; формулировка badge tasks неверна

**Badge tasks live** (`TextNavSidebar.tsx` L99–108):

```ts
overdueTasks = lane≠done && deadline < today
activeTasks  = lane === 'now' || lane === 'next'
badges.tasks = overdueTasks || activeTasks  // если overdue=0 → active now+next
```

Спринт: «фильтр просроченных/сегодняшних» — **не совпадает** с active now/next (без «сегодня»). `useTaskBadgeCount` с wrong filter → неверный бейдж.

**Кроме tasks:** sidebar **полный** `useCalls()` + `useLeads()` для badges (L84–85, L102–109):

- calls: `overdueCalls || pendingCalls` (pending + overdue)
- leads: `status new|contacted`

В задаче 1 — только tasks. После task1+palette cold shell **всё ещё** тянет full calls и full leads.

**HOW:**  
1. Зафиксировать SQL/count 1:1 с live: overdue OR (fallback) count now+next.  
2. Добавить `useCallBadgeCount` / `useLeadBadgeCount` (или один badge-хук) — иначе smoke «calls только окна/каунты» невыполним даже без Today.

---

## Предупреждения (желательно исправить)

### W1. `use-alerts.ts` — мёртвый контур, но опасный trap

`useAlerts` **нигде не импортируется** (StatusBeacon orphan после AUDIT C). Задача «перевести на count/window» — либо **вычеркнуть** (N/A orphan), либо micro-wire. Если оставить: stale-deals по `calls.find(project_id)` **не** сводится к простому count — нужен aggregate/RPC. Иначе CC тратит время на dead code **или** вернёт org-fetch через «фикc» orphan.

### W2. View parity: meetings `touch_at` vs клиент

| | Client (`use-last-touch.ts`) | Draft SQL 060 |
|--|--|--|
| Call | `status==='done'`, `touch = c.date` (timestamptz) | ✅ same |
| Meeting filter | `date ≤ localDateKey()` (user TZ) | `date ≤ (now() AT TIME ZONE 'Europe/Moscow')::date` — лучше UTC; ≠ browser TZ в роуминге |
| Meeting value | **только** `m.date` (date string), time **игнор** | `(date + coalesce(time,'00:00'))::timestamptz` — выше precision, может менять winner kind в один день; cast `timestamp→timestamptz` зависит от session TZ |
| Map `date` | string для `daysSince` | нужен стабильный ISO/date при сборке Map |

**HOW:** для паритета v1 meeting branch: `touch_at = date::timestamptz` (без time) **или** явно принять DB semantics + смоук 3–5 контактов «до/после» как в гейте. `daysSince` через `toDateString()` — при timestamptz проверить off-by-one около полуночи.

### W3. GRANT + types + architecture note

- После `CREATE VIEW` — `GRANT SELECT ON public.contact_last_touch TO authenticated` (и service_role при необходимости); иначе PostgREST 42501. В draft SQL **нет**.  
- Обновление `src/types/database.ts` / gen types — в коммите или гейте.  
- Skill `architecture.md` L194–196: «last_touch **только клиент**, без view» — после W3 **устареет**. Гейт: `docs/schema.md` + architecture/learnings note (спринт пишет только schema).

### W4. ~~Номер миграции 060~~ — снято

Ранее (ревью 07-18) next free был 058. Сейчас 058/059 заняты, 060 — intentional gap (HANDOFF-2026-07-18: «W3 … миграция 060»). **Ок.**

### W5. Realtime: dual `useRealtimeSync` проще mapper'а

Достаточно в `useLastTouchMap`:

```ts
useRealtimeSync('calls', ['contact-last-touch']);
useRealtimeSync('meetings', ['contact-last-touch']);
```

(refcount-менеджер уже multi-callback на таблицу). Расширение `use-realtime.ts` «mapper table→keys» — optional, не блокер. **Важно:** list-хук остаётся `useRealtimeSync('calls', ['calls'])` — оба callback'а должны жить, не заменять единственный.

### W6. EventReminder window ≠ live-логика

Live: **следующие 15 минут** (calls pending / meetings with time) + tasks 9–10h today. Окно `today0…tomorrow24` избыточно по payload, но **меняет семантику** (покажет reminder на весь день, не «скоро»). Для `calls.date` (**timestamptz**, schema) фильтровать timestamptz-диапазоном `now()…now()+15m`, не date-only. Joins contact/company для title — обязательны (сейчас title из join'ов list-хука L46).

### W7. ActivityDrawer Stats: `useProjects()` full

Даже после count для calls/tasks/meetings StatsWidget L206–210 тянет **все** projects для `isProjectActive`. Добавить count active client deals (как dashboard-content L34–39) — иначе shell project org-fetch остаётся.

### W8. ilike `%q%` без pg_trgm

Согласен: v1 ok, зафиксировать в PR; trgm — позже. Не блокер.

### W9. Параллель с W4

W4 (`sprint-w4-speed-order.md`): `touchLevel` / «Остывают» **после** merge W3 view; пересечения TodayView/layout — **не** мержить одновременно. Зафиксировать в handoff: W3 merge first для `use-last-touch.ts`.

### W10. CommandPalette: `open`, не `isOpen`

Live: `const open = useUiStore((s) => s.commandPaletteOpen)` L77. В спринте `enabled: isOpen` — косметика, но CC может ввести несуществующую переменную. Писать `enabled: open` / `enabled: commandPaletteOpen`.

### W11. Commit paths неполны

В `git add` нет: `TodayView`/`DashboardHome` (error badge), `AiWorkspaceModal`, `use-realtime` (если трогают), `lib/utils/mapInfinitePages` (или аналог), tests, `docs/schema.md`, types. Дополнить после фикса B1–B2. `layout.tsx` в add есть — сам layout может не меняться (хуки внутри children).

### W12. Meetings list не пагинируется

Спринт пагинирует calls/contacts/companies — **MeetingsList** остаётся full `useMeetings`. Ок, но зафиксировать явно (иначе CC «для симметрии» урежет meetings).

### W13. `calls.date` vs `meetings.date` типы в reminder/window

| Таблица | Колонка | Тип |
|--------|---------|-----|
| calls | `date` | **timestamptz** |
| meetings | `date` | **date** |
| meetings | `time` | **time** nullable |
| tasks | `deadline` | **timestamptz** |

Window-фильтры копипастой `.gte('date', today0)` на calls дадут неверные границы (UTC vs local). Спринт ссылается на `localDateKey` после W2 — ок для calendar keys, но для calls timestamptz нужен ISO-диапазон.

---

## Пропущенные места (grep gaps)

| Файл | Строки / факт | Действие в спринте |
|------|---------------|-------------------|
| `src/components/today/TodayView.tsx` | L45–52 full 6 entities на `/` | B1: windows или честный smoke |
| `src/components/calendar/CalendarView.tsx` | full calls/meetings/tasks | не infinite-shared; month window |
| `src/components/dashboard/DashboardHome.tsx` | full projects/tasks/calls | error badge (task5) + не резать shared без окон |
| `src/components/calls/CallModal.tsx` (+ Task/Meeting/Project/Contact/LeadConversion) | full contacts/companies combobox | B2: не infinite default |
| `src/components/contacts/ContactDetailHub.tsx` | `allCalls` из useCalls L148 | per-contact query / timeline |
| `src/components/analytics/*` + OverviewCharts | full calls/contacts | out of scope **или** оставить full hook |
| `src/components/layout/TextNavSidebar.tsx` | calls/leads badges L84–85, 102–109 | B3 count hooks |
| `src/components/ai/AiWorkspaceModal.tsx` | L27–36 ai_summary из list | useCallDetail/useMeetingDetail |
| `src/lib/hooks/use-alerts.ts` | orphan + full calls | W1: skip или redesign |
| `src/components/widgets/*` | full hooks | out of scope note |
| `src/components/calls/CallTracker.tsx` | useCalls full | out of scope / scoped |

---

## Предлагаемые правки в спринт

1. **B2:** явно: *не* переводить базовые `useContacts`/`useCompanies`/`useCalls` на infinite; ввести `*Infinite` **или** полный consumer-migration plan (таблица выше).  
2. **B1:** переписать ПРОВЕРКА/smoke под реальный `/` **или** добавить задачу Today-window.  
3. **B3:** badge tasks = overdue \|\| (now+next); count-хуки для calls/leads badges.  
4. View: GRANT SELECT; паритет meeting touch (без time или осознанный break); gen types; docs schema + architecture note.  
5. use-alerts: «orphan — не трогать» или вынести.  
6. ActivityDrawer Stats: count active deals, не full projects.  
7. EventReminder: window = 15 мин (live), не today→tomorrow; joins для title.  
8. `enabled: open` (`commandPaletteOpen`), не `isOpen`.  
9. Зафиксировать: MeetingsList full; W4 не параллелить на `use-last-touch`.  
10. Дополнить `git add` / commit paths.  
11. Миграция **060** — оставить (корректно).

---

## Чеклист crm-architect

- [x] Есть РАЗВЕДКА  
- [x] Имена таблиц/колонок из schema (`calls.date` timestamptz, `meetings.date` date, `meetings.time` time, `status` enum, `tasks.text`, `leads.title`)  
- [x] Пути файлов существуют  
- [x] learnings: security_invoker; миграция не из CC; IF NOT EXISTS indexes  
- [x] org boundary через RLS underlying view  
- [ ] **B2** file inventory consumers incomplete  
- [ ] GRANT + types после view (в draft SQL слабо)  
- [ ] schema.md + architecture note (гейт — ок, architecture не упомянут)  
- [x] CSS vars для нового badge (напомнить)  
- [x] Нет `flowType: 'implicit'`  
- [x] Нет client-side DELETE cleanup  
- [x] Номер миграции 060 корректен (gap)

---

## Чеклист перед CC

- [ ] **B1** smoke ↔ TodayView согласованы  
- [ ] **B2** infinite только table-scoped **или** полный plan consumers  
- [ ] **B3** badge semantics + calls/leads counts в shell  
- [ ] View: security_invoker + GRANT + parity smoke 3–5 контактов  
- [ ] Realtime → `['contact-last-touch']` (dual sync или mapper)  
- [ ] AiWorkspaceModal → detail hooks  
- [ ] Не apply миграцию из CC  
- [ ] W4b/`touchLevel` не параллелить на `use-last-touch`  
- [ ] docs/schema.md (+ architecture note) на гейте  
- [ ] EventReminder: 15m window + joins; Stats: projects count  
- [x] Миграция 060 (слот свободен)

**Итог:** направление W3 верное и нужное; W1/W2 prerequisite закрыт; draft view/realtime/`mapInfinitePages`/номер 060 — ок. **Как handoff для CC — не готов** из‑за shared infinite (B2) и ложного cold-entry критерия (B1). После правки контракта list-hooks, smoke и shell badges — можно в CC.
