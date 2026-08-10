# Architecture Reference

---

## File Structure

```
~/Downloads/dashboard-crm/
├── src/
│   ├── app/
│   │   ├── layout.tsx                — Root layout (fonts, providers, <html class="t-aura"> + theme-init FOUC-скрипт)
│   │   ├── globals.css               — CSS variables, 7 тем, animations, global styles
│   │   └── (dashboard)/             — route group (все страницы дашборда)
│   │       ├── page.tsx              — Home «/» → TodayView (action inbox, Sprint W1b)
│   │       ├── dashboard-content.tsx
│   │       ├── layout.tsx            — Shell: TextNavSidebar + ActivityDrawer, data-section
│   │       ├── overview/page.tsx     — KPI-обзор (DashboardHome): cards, charts, feed
│   │       ├── tasks/page.tsx        — рендерит `<TasksView/>` (раздел пересобран,
│   │       │                           S-TASKS-RESTRUCTURE-1: стрим по датам + Таблица;
│   │       │                           S-TASKS-BOARD-1: третий вид «Доска» — канбан по
│   │       │                           срокам; lane-борд `KanbanBoard` выведен из
│   │       │                           дефолта — легаси)
│   │       ├── deals/                — **КЛИЕНТСКИЕ СДЕЛКИ** (воронка продаж)
│   │       │   ├── page.tsx          — Kanban + table view, chip filters
│   │       │   └── [id]/page.tsx     — ProjectDetail: chevron pipeline, files, единая Активность (EntityTimeline)
│   │       ├── projects/             — **ПРОЕКТЫ ВНЕДРЕНИЯ + internal** (delivery-борд, Гант-таб)
│   │       │   ├── page.tsx          — Kanban + table view
│   │       │   └── [id]/page.tsx     — Delivery/ProjectDetail: фазовая доска + таб «Гант» (GanttTimeline)
│   │       ├── leads/page.tsx        — Лиды + конверсия (LeadModal/LeadConversionModal)
│   │       ├── contacts/
│   │       │   ├── page.tsx          — Contact table, search, bulk actions
│   │       │   └── [id]/page.tsx     — Contact 360° Hub: bento layout, activity timeline
│   │       ├── companies/
│   │       │   ├── page.tsx          — Company table, Excel import
│   │       │   └── [id]/page.tsx     — CompanyDetail: связи (контакты/проекты) + Активность (EntityTimeline)
│   │       ├── calls/page.tsx        — Call journal: table, status badges
│   │       ├── meetings/page.tsx     — Meeting list
│   │       ├── calendar/page.tsx     — Full calendar: month grid, day event panel
│   │       ├── analytics/page.tsx    — Charts (Recharts), export, funnel drill-down
│   │       └── settings/page.tsx     — Theme picker (7 тем), data migration, preferences
│   │
│   ├── components/
│   │   ├── today/                   — Sprint W1b: экран «Сегодня» (action inbox)
│   │   │   ├── TodayView.tsx         — очередь действий (звонки/задачи/сделки/встречи)
│   │   │   ├── TodayFocus.tsx        — «Фокус дня» (localStorage focus-<dateKey>)
│   │   │   └── QueueRow.tsx          — строка очереди: тело→переход, primary+secondary
│   │   │
│   │   ├── layout/
│   │   │   ├── TextNavSidebar.tsx    — Единый sidebar: t-aura → текстовый капс-нав,
│   │   │   │                           остальные 6 тем → icon-nav (Sidebar.tsx/Header.tsx удалены, AUDIT C)
│   │   │   ├── ContentHeader.tsx     — Page header (theme-aware; бывш. ScandiContentHeader)
│   │   │   ├── AuraOrbs.tsx          — Атмосферные орбы (только t-aura, fixed z-0)
│   │   │   ├── ActivityDrawer.tsx    — Right drawer: clock, mini calendar, stats, activity feed
│   │   │   ├── NotificationBell.tsx  — Колокольчик + unread-бейдж
│   │   │   ├── PageHeader.tsx / PageTransition.tsx / EventReminder.tsx
│   │   │   └── QueryProvider.tsx / ThemeProvider.tsx
│   │   │
│   │   ├── (МОДАЛКИ — по фиче-папкам, НЕ в components/modals/! сверяй find):
│   │   │   ├── tasks/TaskModal.tsx          — Create/edit task (+defaultText/defaultDeadline)
│   │   │   ├── projects/ProjectModal.tsx    — Create/edit project
│   │   │   ├── calls/CallModal.tsx          — Create/edit call (ТОЛЬКО данные; AI вынесен в AiWorkspaceModal)
│   │   │   ├── meetings/MeetingModal.tsx    — Create/edit meeting (ТОЛЬКО данные; AI вынесен в AiWorkspaceModal)
│   │   │   ├── contacts/ContactModal.tsx    — Create/edit contact
│   │   │   ├── companies/CompanyModal.tsx   — Create/edit company
│   │   │   └── leads/LeadModal.tsx, leads/LeadConversionModal.tsx
│   │   │
│   │   ├── ai/                        — AI Hub (S-AI-1)
│   │   │   ├── AiWorkspaceModal.tsx   — отдельная модалка «AI-анализ» (точка входа = иконка Sparkles); AiSummaryPanel + AiRunPanel
│   │   │   ├── AiRunPanel.tsx         — транскрипт + пресеты + лента прогонов (в AiWorkspaceModal)
│   │   │   └── renderers/             — рендерер на пресет (Protocol/AnalyticNote/SpinReview) + AiResultRenderer-диспетчер
│   │   │
│   │   ├── chat/                      — Чат-хаб (S-CHAT-HUB-1a…1f; ≠ чат проекта)
│   │   │   ├── ChatView.tsx           — двухпанельный шелл /chat (список ↔ тред, ?c=id)
│   │   │   ├── ChannelList.tsx        — каналы: DM, группы, каналы сущностей
│   │   │   ├── MessageThread.tsx      — тред (самый большой файл модуля ~70 КБ)
│   │   │   ├── MessageBody.tsx / MessageAttachments.tsx / EntityChip.tsx
│   │   │   ├── GroupModal.tsx         — произвольная группа (только через RPC create_group_conversation)
│   │   │   └── TaskFromMessageCard.tsx— задача из сообщения (S-CHAT-TASK-1)
│   │   │
│   │   ├── analytics/
│   │   │   └── Charts.tsx            — Recharts wrappers, theme-aware colors
│   │   │
│   │   ├── companies/                 — Company 360 (S-R2-CO360-1 / S-FIX-CO360-1)
│   │   │   ├── CompanyDetail.tsx      — карточка: полоса фактов → сделки → внедрения → люди → лента
│   │   │   ├── CompanyHighlights.tsx  — полоса фактов (открытые сделки, внедрения, последний контакт, ЧЗ)
│   │   │   ├── CompanyDealsCard.tsx / CompanyDeliveriesCard.tsx / CompanyContactsCard.tsx
│   │   │   ├── CompanySidebar.tsx     — справочное: реквизиты, контакты компании, ЧЗ, заметки
│   │   │   └── CompanyPeekContent.tsx / CompaniesTable.tsx / ExcelImport.tsx
│   │   │
│   │   ├── projects/                  — (кроме ProjectDetail/модалок)
│   │   │   ├── DealStakeholders.tsx   — ЛПР/влияющие по сделке (миграция 092)
│   │   │   ├── QuotesTab.tsx / QuoteModal.tsx — КП сделки (053)
│   │   │   ├── DealFocusPanel.tsx     — «следующий шаг / закреплено / здоровье»
│   │   │   └── StackedPipeline.tsx    — чевроны стадий + полоса «Пройдено N%»
│   │   │
│   │   ├── settings/
│   │   │   ├── WebhooksSection.tsx    — исходящие вебхуки (эпик B2)
│   │   │   ├── webhooks/              — WebhookCreateModal / WebhookDeliveriesModal / WebhookSecretModal
│   │   │   ├── AutomationsSection.tsx / automation/ — правила (S29, 050/051)
│   │   │   ├── ChecklistTemplatesSection.tsx + ChecklistTemplateEditorModal.tsx — sign-off (083/084)
│   │   │   ├── GatesSection.tsx / OrgSettingsSection.tsx / TeamSection.tsx
│   │   │   └── SettingsContent.tsx    — пикер тем (свотчи 7 тем), профиль
│   │   │
│   │   ├── ui/                       — **Кастомные** UI-примитивы (НЕ Radix): inputs, badges, chips, SavedViewChips
│   │   │   └── InlineConfirm.tsx     — ЕДИНСТВЕННЫЙ способ подтвердить опасное действие
│   │   │                               (`window.confirm`/`alert`/`prompt` запрещены eslint'ом)
│   │   │
│   │   └── shared/                   — Reusable components
│   │       ├── Modal.tsx             — **Кастомный шелл модалок** (viewport-fit + isDirty-guard); НЕ Radix Dialog
│   │       ├── AssigneeSelect.tsx / Combobox.tsx — порталённые дропдауны (z-1100, use-anchored-rect)
│   │       ├── PhoneFields.tsx / PhoneList.tsx — мультителефон (phones jsonb, useFieldArray)
│   │       └── EntityTimeline.tsx    — Переиспользуемая лента активности (contact/company/project); см. Hook Patterns

│   │   (полный список папок components/: ai, analytics, calendar, calls, companies,
│   │    contacts, dashboard, layout, leads, meetings, migration, projects, settings,
│   │    shared, tasks, today, ui, widgets)
│   │
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts             — Browser Supabase client (createBrowserClient)
│   │   │   └── server.ts             — Server Supabase client (createServerClient)
│   │   │
│   │   ├── hooks/
│   │   │   ├── use-tasks.ts          — CRUD + optimistic updates for tasks
│   │   │   ├── use-projects.ts       — CRUD for projects, stage mutations
│   │   │   ├── use-contacts.ts       — CRUD for contacts
│   │   │   ├── use-companies.ts      — CRUD for companies
│   │   │   ├── use-calls.ts          — CRUD for calls
│   │   │   ├── use-meetings.ts       — CRUD for meetings
│   │   │   ├── use-activity-log.ts   — Read activity log (per-project or global)
│   │   │   ├── use-entity-timeline.ts— Per-entity серверный фильтр (.eq col) → TimelineEvent[]; см. Hook Patterns
│   │   │   ├── use-realtime.ts       — Supabase Realtime subscription → React Query invalidation
│   │   │   ├── use-chip-filter.ts    — Чип-фильтры, URL-backed (?f=key1,key2, router.replace)
│   │   │   ├── use-saved-views.ts    — Сохранённые виды (localStorage 'saved-views', useSyncExternalStore)
│   │   │   ├── use-project-schedule.ts — Gantt-селектор (board+columns → swimlane по фазе column_id, Волна 2)
│   │   │   ├── use-conversations.ts / use-messages.ts / use-conversation-members.ts
│   │   │   ├── use-message-reactions.ts / use-message-attachments.ts / use-tasks-by-message.ts — чат-хаб
│   │   │   ├── use-webhook-endpoints.ts — вебхуки (+ edge `webhook-dispatch`, cron-джоба `webhook-retry`)
│   │   │   ├── use-deal-stakeholders.ts — стейкхолдеры сделки (primary тянется из projects.contact_id)
│   │   │   ├── use-quotes.ts          — КП (canEditQuotes ≠ canManage)
│   │   │   ├── use-recurring-tasks.ts — повторяющиеся задачи (069)
│   │   │   ├── use-company-team-touch.ts / use-contact-strength.ts — Company 360, тонкие: агрегация в lib/domain
│   │   │   └── use-company-lookup.ts  — реквизиты по ИНН/ОКВЭД (edge `company-lookup`)
│   │   │
│   │   ├── stores/
│   │   │   └── theme-store.ts        — Zustand persist (key 'dashboard-theme'): THEMES/DEFAULT_THEME/LEGACY_THEMES
│   │   │
│   │   ├── validators/
│   │   │   ├── task.ts               — Zod schema for task form
│   │   │   ├── project.ts            — Zod schema for project form
│   │   │   ├── contact.ts            — Zod schema for contact form
│   │   │   ├── company.ts            — Zod schema for company form
│   │   │   ├── call.ts               — Zod schema for call form
│   │   │   └── meeting.ts            — Zod schema for meeting form
│   │   │
│   │   ├── timeline/
│   │   │   └── adapters.ts           — Чистые адаптеры Row→TimelineEvent (call/meeting/task/project)
│   │   │
│   │   ├── domain/                   — Чистая логика: ноль запросов, «сейчас» параметром
│   │   │   ├── relationship-strength.ts — сила связи с контактом (recency/frequency/upcoming)
│   │   │   ├── company-touch.ts      — агрегации Company 360 (aggregateTeamTouch / aggregateContactStrength)
│   │   │   ├── deal-completeness.ts  — ЕДИНСТВЕННАЯ формула полноты сделки (правила + веса + цена пустоты)
│   │   │   ├── segment-eval.ts       — вычислитель сегментов: предикат на клиенте + VIRTUAL_FIELDS
│   │   │   ├── stage-transition.ts / apply-progression.ts
│   │   │   └── (правило: если функция тестируема — её место здесь, не в queryFn хука)
│   │   │
│   │   └── utils/
│   │       ├── csv-export.ts         — CSV export with BOM for Cyrillic
│   │       ├── activity-events.ts    — describeEvent + isNoteEvent (заметка = только comment_added)
│   │       ├── recurring.ts          — раскрытие правила повторения в даты
│   │       └── date-helpers.ts       — Date formatting + Gantt-бакеты (zoom day/week/month на UTC-полдне) + mskDateKey + daysSince(iso, now)
│   │
│   └── types/
│       ├── database.ts               — Single file: all Row/Insert/Update types
│       └── timeline.ts               — TimelineEvent / TimelineKind (общая модель ленты)
│
├── supabase/
│   ├── migrations/                   — SQL-файлы: CC пишет и коммитит, применяет ГЕЙТ (не CC, не CLI)
│   └── functions/                    — Edge: ai-run, ai-summarize, webhook-dispatch, company-lookup
│
├── public/                           — Static assets
├── next.config.ts                    — ignoreBuildErrors: false
├── tailwind.config.ts                — Custom fonts, extended theme
└── package.json
```

---

## Tech Stack / UI deps

- **Next 15** (App Router, route group `(dashboard)`) + **React 19** + TypeScript
  (`next.config.ts` — `ignoreBuildErrors: false`).
- **Supabase** (`@supabase/ssr`) + **@tanstack/react-query** (server-state, optimistic).
- **@dnd-kit** (`core`/`sortable`/`utilities`) — drag-and-drop (Kanban, lanes).
- **lucide-react** — иконки (единственная icon-либа, без эмодзи в UI).
- **react-hook-form** + **zod** — формы/валидация. **sonner** — тосты.
- **Recharts** — графики. **SheetJS (xlsx)** — Excel-импорт.
- **Radix НЕ в стеке.** Модалки — кастомный `shared/Modal.tsx`; `components/ui/` —
  кастомные примитивы (не Radix Dialog/Dropdown). Дропдауны — свой `Combobox`/
  `AssigneeSelect` + портал (`use-anchored-rect`).

---

## Key Components

### TextNavSidebar (`layout/TextNavSidebar.tsx`)
- Единый sidebar: `t-aura` → текстовый капс-нав (`isAura`, иконки прячет CSS
  `.t-aura .nav-ico`); остальные 6 тем → icon-nav. Пункты — русские сокращения,
  иконки Lucide. (Отдельные `Sidebar.tsx`/`Header.tsx` удалены в AUDIT C.)

### PM-Гант (Волна 2, WRITE)
- **WRITE**: drag-to-resize/move дат, drag из «Без дат» → проставление дат, удаление
  задач/фаз в Ганте (S-GANTT-UX-2). Write-действия за `canManage`.
- `components/tasks/GanttTimeline.tsx` — таб «Гант» на ProjectDetail. Кастомный
  **CSS-grid без Gantt-либы** (под 7 тем не дефолтим стороннюю либу).
- `lib/hooks/use-project-schedule.ts` — селектор board+columns; **swimlane по фазе =
  `column_id` → колонка `category='phase'`** (`isPhaseBoard`), НЕ `phase_group` пайплайна.
- Бакет-хелперы в `lib/utils/date-helpers.ts` (zoom day/week/month на UTC-полдне);
  тултип через `position: fixed` (иначе клиппится в `overflow-x-auto`); фильтр
  open/all/milestones; milestone = rotate-45 ромб.

### ProjectVideos (S-VIDEO-EMBED-1) — видео-материалы проекта
`components/projects/ProjectVideos.tsx` (рядом с ProjectFiles, все типы проектов) + `use-project-videos.ts` + `lib/utils/video-embed-helpers.ts` (parseVideoUrl → embed из id, provider youtube/vk/rutube/other). Embed на рендере из parseVideoUrl(url) — stored provider не доверяем. Гейт canManage на write.

### ProjectChat (S-CHAT-1) — чат проекта (отдельный модуль, ≠ Активность)
`components/projects/ProjectChat.tsx` (таб «Чат» в ProjectDetail, все типы) + `use-project-messages.ts` (live через общий `useRealtimeSync('project_messages')`, optimistic + dedupe по id). Лента + composer (Enter — отправить, Shift+Enter — перенос), правка/удаление своих, admin модерирует. body как текст (XSS-контур). Пишет ВСЯ команда проекта (participant RLS), не только canManage. Граница locked: не трогает activity_log/EntityTimeline/ActivityComposer.
Табы ProjectDetail: `activity/board/timeline/quotes` + **`'chat'` («Чат»)**.

### Чат-хаб (`/chat`, S-CHAT-HUB-1a…1f) — НЕ то же, что ProjectChat

Отдельная подсистема поверх `conversations` / `messages` (миграции **094–101**): личные
диалоги, произвольные группы и каналы сущностей в одном месте. `ProjectChat` (выше) —
чат ОДНОГО проекта во вкладке карточки; чат-хаб — общий раздел приложения.

- Шелл `chat/ChatView.tsx`: две панели, активный канал в URL (`?c=<id>`); на узком экране
  видно что-то одно. Высота — `h-[calc(100dvh-7rem)]` (не `100vh`).
- **Сообщение висит на `conversations`, не на проекте.** Канал произвольной группы
  создаётся ТОЛЬКО через RPC `create_group_conversation`; админ, не входящий в группу, её
  не видит — осознанное решение.
- Вложения — бакет `chat-files`, путь строится **от канала, не от юзера** (не own-path);
  доступ через `is_conversation_member`. ⚠️ Удаление канала делает вложения бакета
  неудаляемыми навсегда — чистить ДО удаления.
- Задача из сообщения — `TaskFromMessageCard` + `lib/utils/task-intent.ts`
  (`matchTaskCommand`); связь `source_message_id` держит unique-индекс.
- Хуки: `use-conversations`, `use-messages`, `use-conversation-members`,
  `use-message-reactions`, `use-message-attachments`, `use-tasks-by-message`.
- Бейдж непрочитанного смокается только отправкой из СКРЫТОЙ вкладки.

### Webhooks (эпик B2, миграции 088–091)

Исходящие вебхуки организации: `settings/WebhooksSection.tsx` + `settings/webhooks/*`
(создание, журнал доставок, показ секрета), хук `use-webhook-endpoints`, таблицы
`webhook_endpoints` / `webhook_deliveries`, edge-функция **`webhook-dispatch`** и минутная
cron-джоба `webhook-retry` (`dispatch_webhooks_tick()`). Транспорт — `pg_net`,
зарегистрированный `with schema extensions` (в `public` его ловит advisor). Шестое
`action_type='webhook'` в движке автоматизаций. Подпись — HMAC, SSRF-фильтр отбивает
резолв в приватные адреса. `vault` через PostgREST недоступен — секрет читается иначе.

### Лиды (`leads/LeadsView.tsx` + `LeadModal.tsx`, миграции 016/018 + **117–119**)

Канбан 4 колонок + таблица, конверсия через RPC `convert_lead`, полоса
«Конвертированы». С S-LEAD-CORE-1 лид — рабочая сущность, а не плоский триаж:

- **Ownership переехал с `user_id` на `owner_id` → profiles** (117, бэкфилл + DEFAULT
  `auth.uid()`). `user_id` остался NOT NULL и его читает legacy-ветка гарда
  `convert_lead`; клиент колонку больше не пишет вовсе. RLS: `leads_update`/`leads_delete`
  — на `owner_id`, `leads_insert` **впервые проверяет роль** (owner/admin/manager;
  до 117 viewer мог создать лид вопреки UI).
- **Поля работы**: `next_step` / `next_action_date` / `temperature` / `estimated_value`
  (КОПЕЙКИ, как `projects.budget`) — язык сделок, чтобы лид читался тем же взглядом.
  Квалификация: `pain` / `budget_status` / `decision_role` / `chz_groups` /
  `regulatory_deadline`. Штампы `first_contacted_at` / `qualified_at` ставит триггер.
- **Лид вошёл в граф активностей** (118): `lead_id` у `calls`/`tasks`/`activity_log`,
  журнал смены статуса (`lead_status_changed`) и удаления (`log_delete_lead`).
  В `CallModal` — либо лид, либо CRM-связи: двойную привязку UI создать не даёт.
- **Авто-прогресс `new → contacted` по состоявшемуся звонку живёт в КЛИЕНТЕ**
  (`use-calls.ts`, условный UPDATE `.eq('status','new')`), не в триггере — каскады
  статусов из триггеров в этом проекте признаны граблей.
- **Конверсия переносит историю** (119): звонки и задачи лида получают
  contact/company/project созданных сущностей, квалификация — в `pinned_note` сделки
  (только если та пуста). `lead_id` не зануляется: жизнь до сделки остаётся видимой.

### Стейкхолдеры сделки (`projects/DealStakeholders.tsx`, миграция 092)

Люди со стороны клиента с ролью в сделке (ЛПР / влияющий / пользователь) —
`use-deal-stakeholders`, словарь ролей `lib/constants/stakeholders.ts`. **Primary-контакт
не хранится в таблице стейкхолдеров** — он тянется из `projects.contact_id` и
показывается в списке как «основной».

### КП / quotes (`projects/QuotesTab.tsx` + `QuoteModal.tsx`, миграция 053)

Коммерческие предложения по сделке: вкладка `quotes` в ProjectDetail, `use-quotes`,
`validators/quote.ts`. ⚠️ Право на КП — **`canEditQuotes`, это НЕ `canManage`**: наборы
ролей разные, не подменять одно другим.

### Повторяющиеся задачи (`RecurringTemplatesModal`, миграция 069)

Шаблон повторения → раскрытие в конкретные даты: `use-recurring-tasks`,
`lib/utils/recurring.ts`. Грабля модуля: `database.ts` и `supabase.gen.ts` разошлись
именно здесь — при правке сверять оба.

### Company 360 (`companies/CompanyDetail.tsx`, S-R2-CO360-1 / S-FIX-CO360-1)

Карточка компании как рабочий экран, а не справка: **полоса фактов → деньги (сделки) →
работа (внедрения) → люди → лента**; справочное (реквизиты, контакты, ЧЗ, заметки)
уехало в `CompanySidebar`.

- `CompanyHighlights` — четыре факта: открытые сделки, внедрения, последний контакт
  («знают N» — кто в организации общался с компанией), маркировочный профиль ЧЗ.
- `use-company-team-touch` — касания по **`company_id`** (у половины звонков контакт не
  проставлен, а компания есть); `use-contact-strength` — по **`contact_id`**. Ни один срез
  не выводится из другого. Оба хука тонкие: агрегация — в `lib/domain/company-touch.ts`
  (`aggregateTeamTouch` / `aggregateContactStrength`, «сейчас» параметром), сила связи —
  в `lib/domain/relationship-strength.ts`.
- Общее: `lib/utils/avatar.ts` (инициалы/цвет), `shared/ChzBadge.tsx`.
- ⚠️ Заводя новый React-Query ключ (`company-team-touch`, `contact-strength`), сразу
  пройти по мутациям, которые меняют его данные: лента после звонка обновлялась, а
  виджеты над ней — нет, потому что ключи никто не инвалидировал.

### Сегменты / Smart Views (`shared/SegmentsBar.tsx`, миграции 077 · 086 · 105)

Именованный предикат над сущностью. **Считается на КЛИЕНТЕ** (`lib/domain/segment-eval.ts`)
поверх уже загруженного списка — таблица `segments` хранит только определение, не результат.
v1: только `deals`, только конъюнкция (AND). Порог пересмотра в пользу SQL-RPC записан в
шапке `segment-eval.ts` — ~5 000 строк на сущность.

**Вычисляемые поля (S-R3-TRUST-1).** `VIRTUAL_FIELDS` в `segment-eval.ts` — реестр полей,
которых в БД нет: читается РАНЬШЕ `row[field]`, поэтому реальная колонка вычисляемое поле
не перекроет. Первое и пока единственное — `completeness_score` (считает
`deal-completeness.ts`). Реестр **глобальный, не по сущности**: то же имя поля в whitelist
другой сущности посчиталось бы по правилам сделок — при добавлении второго вычисляемого
поля это первое, обо что споткнёшься.

Контекст `SegmentEvalContext` — пятый позиционный параметр `matchSegment`/`applySegment`
со значением по умолчанию `{}`: старые вызовы работают без правки, без контекста правила
падают на `DEFAULT_RULES`. Контекст обязан приходить во ВСЕ места фильтрации одной сущности
(`ProjectsView`, `ProjectsTable`, `PipelineBoard`, `StageBoard`) — иначе счётчики чипов
разойдутся со списками.

### Полнота сделки (`lib/domain/deal-completeness.ts`, S-R3-TRUST-1)

Полнота — заполненность карточки. **Не путать с `calculateDealHealth`** (0–8,
`utils/deal-health.ts`): та про динамику работы. Правило: полнота **ничего не блокирует** —
принуждение живёт в `check_stage_requirements` (078) и только там.

- `DEFAULT_RULES` — правило = `{key, label, weight, cost, appliesTo?, appliesToType?}`,
  где `cost` — **цена пустоты**: что именно не работает без этого поля (текст продукта,
  в настройки не выносится, рисуется в поповере бейджа).
- `score = floor(100 × вес заполненных / вес ПРИМЕНИМЫХ)`. Применимость по статусу
  (`loss_reason` только у `lost`) и по типу (`stage_id`, исходы — только `type='client'`).
- Веса переопределяет org: `organizations.settings.completeness_rules {key:{weight 0..10}}`,
  `weight 0` = правило выключено (исчезает и из `total`, и из `missing`). Резолвер
  `resolveRules` — зеркало `resolveDwellThreshold`, при пустых настройках возвращает **ту же
  ссылку** на `DEFAULT_RULES` (иначе ломается мемоизация у потребителей).
- Хук — `useCompletenessRules()` в `lib/hooks/use-org-settings.ts`.
- SQL-аналога (`entity_completeness()` / view) намеренно НЕТ — см. learnings.md.

### Sidebar (legacy note)
- Old icon `Sidebar.tsx` удалён — см. `TextNavSidebar` выше.
- Sidebar items use Russian abbreviations
- Sliding indicator animation: active item has a pill that slides between items
- Icons: Lucide React

### TodayView (`today/TodayView.tsx`) — Sprint W1b/W2b
- Home screen at `/` (Close CRM «action inbox» pattern). KPI-дашборд переехал на `/overview`.
- Секции сверху вниз (пустые скрываются): Фокус дня → Просроченные звонки →
  Звонки сегодня → Задачи в работе (lane 'now', просроченные наверх) →
  Сделки без шага (`getDealHealth() !== 'ok'`, W1a) → **Остывают** (reconnect, W2b) →
  Встречи сегодня.
- Каждая строка (`QueueRow`): клик по телу → переход; primary-действие
  (звонок «Выполнен»→status done, задача «Готово»→lane done,
  сделка «Запланировать шаг»→ProjectModal с `focusNextAction`,
  контакт «Запланировать звонок»→`openModal('call', undefined, { contactId })`); secondary
  «На завтра» (звонки/задачи). Все мутации — существующие optimistic-хуки.
- Empty state: «Всё разобрано» + ссылка на /overview.

### Раздел «Задачи» (`tasks/page.tsx` → `TasksView`) — S-TASKS-RESTRUCTURE-1/MYFILTER-1/POLISH-1/BOARD-1
- **`TasksView.tsx`** — контейнер: переключатель Список/Таблица/**Доска** (`?view`:
  отсутствует → `stream`, `table`, `board`; неизвестное молча падает в `stream`), Мои/Все
  (`?who`, дефолт Мои), фильтр источника Сделки/Проекты/Личное (`?src`, дефолт
  `deal,personal` — проекты скрыты за явным «Показать»), чип Выполнено (`?done`),
  локальный поиск (`query`, **НЕ в URL** — сознательно, blast radius), `SavedViewChips`.
  Пустые состояния — 3 причины по приоритету: пустой источник → пустой поиск → нет
  задач, общий `EmptyState`-примитив (`ui/EmptyState.tsx`), не свой на каждый вид.
- **`TaskStream.tsx` / `TaskStreamRow.tsx`** — дефолтный вид: стрим по дедлайну
  (Просрочено→Сегодня→Завтра→Эта неделя→Позже→Без даты, пустые бакеты скрыты);
  «Без даты» — зона триажа (`p-2` дэшед-контейнер с подсказкой). Quick-actions на
  hover (Готово/На завтра/Дата). j/k — см. «Keyboard nav» ниже.
- **`TasksTable.tsx`** — вид «Таблица»: обёртка над `shared/DataTable` (`hideSearch` —
  поиск общий из `TasksView`, не дублируется); колонки Задача/Связь/Срок/
  Приоритет/Исполнитель, метка бакета в «Срок».
- **`TaskBoard.tsx` / `BoardColumn.tsx` / `BoardCard.tsx`** — вид «Доска» (S-TASKS-BOARD-1,
  `?view=board`): канбан ПО СРОКАМ, колонки = дата-бакеты в порядке `BUCKET_ORDER`,
  включая пустые. Получает тот же `queried`, что Список и Таблица — расхождение
  наборов между видами невозможно по построению.
  - **Дроп = запись `deadline`** (одна мутация `useUpdateTask`, optimistic уже внутри).
    `sort_order` **не трогается вовсе**: он lane-scoped, и перемешивание его датами
    сломало бы порядок lane-борда и Ганта. Порядок в колонке — `compareInBucket`.
  - **Часы читаются в `handleDragEnd`, а не берутся пропом `now`** — см. learnings
    «протухший `now`»: проп указывает на вчера во вкладке, открытой через полночь.
  - Колонка-отказ (`deadlineForBucket === null`) остаётся **droppable** и поглощает
    дроп; `useDroppable({disabled})` там запрещён (learnings). Отказ решает
    `onDragEnd`, подсветка `isOver` гасится.
  - Заливка колонок — `--danger-l` (Просрочено) / `--info-l` (Сегодня), остальные
    `--surface2`, «Без даты» — пунктирная зона без заливки. **`--accent-l` запрещён**:
    в washi `--accent === --red`, см. `theme-system.md`.
  - Правую мету карточки определяет **бакет**, а не задача: `overdue` → «N дн.»,
    `later` → дата, датовые колонки → ничего (день назван в шапке).
  - Кап рендера `PAGE = 50` на колонку + кнопка с остатком числом; виртуализации нет.
  - Клавиатура — `use-board-nav` + `lib/domain/board-nav.ts` (S-TASKS-BOARD-2),
    **не** общий `use-keyboard-nav`: тот держит плоскую очередь.
- **`components/tasks/KanbanBoard.tsx`** — старый lane-борд (now/next/wait/done,
  `@dnd-kit`) **выведен из дефолта**, но файл жив (экспортируется из `index.ts`,
  нигде не рендерится) — дешёвый откат при необходимости. **Не путать с `TaskBoard`**:
  тот по срокам и в дефолте, этот по `lane` и мёртв.
- **`lib/utils/task-view.ts`** — чистые хелперы раздела (0 `any`):
  - `taskSource(task) → 'deal'|'project'|'personal'` — из `projects.type`
    (`client`→deal, `internal`|`delivery`→project, нет `project_id`→personal).
  - `taskDateBucket(task, now)` — 6 бакетов, сравнение по MSK (`mskDateKey`);
    `overdue` только при `lane !== 'done'` (у `tasks` нет отдельного `status`).
  - `compareInBucket` / `groupByBucket` — **единственный источник порядка строк**
    для Списка И Таблицы (POLISH-1: раньше расходились — List брал порядок
    выборки, Table сортировал сам); overdue — старейшая (= самая просроченная)
    сверху, будущие бакеты — ближайший срок сверху, `no_date` — порядок выборки.
  - `isMine(task, userId)` — `assigned_to===me` ИЛИ (`assigned_to IS NULL` И
    `created_by===me`) (MYFILTER-1: «Мои» подхватывают мои неназначенные —
    иначе вся просрочка sales-задач с `assigned_to=NULL` выпадает из дефолта).
  - `matchesQuery(task, q)` — поиск по тексту + имени проекта/компании.
  - **`deadlineForBucket(bucket, now) → {deadline} | null`** (BOARD-1) — ОБРАТНАЯ
    функция оси: какой дедлайн положит задачу в этот бакет. `null` = бакет не
    принимает дроп (`overdue` всегда; `this_week` в сб/вс — конец недели там
    схлопывается в сегодня/завтра). `{deadline: null}` = очистить срок (`no_date`).
    Время суток — `mskEndOfDayIso`, конвенция проекта. `later` берёт якорем
    **max(завтра, конец недели) + 1**, а не `eow + 1`: в вс `eow === today`, и
    `+1` попадал бы в `tomorrow` — карточка отскакивала из колонки, куда её бросили.
    **Живёт в этом же файле рядом с `taskDateBucket` намеренно** — разнесённые по
    файлам прямая и обратная функции разойдутся при первой правке границ недели, и
    разойдутся молча. Инвариант round-trip закрыт `tests/unit/task-board-axis.test.ts`.
  - `boardColumns(tasks, now)` — все бакеты в порядке оси, **включая пустые**
    (в отличие от `groupByBucket`, который пустые опускает): колонка-приёмник
    обязана существовать и без карточек.
- **Data-нюанс**: `tasks.lane` не тронут — истина для личных задач + вход
  optimistic-хуков; `TaskModal` поле «Столбец» пишет `lane`. `use-tasks` select
  `+= project:projects(id, name, type), company:companies(id, name)`. Миграций в
  S-TASKS-* НЕ было (классификация построена на существующем `projects.type`).

### Reconnect / last_touch (Sprint W2b)
- **Архитектура (принято): last_touch считается на клиенте** из React Query-кеша calls+meetings. Никаких миграций/view/триггеров.
- `lib/hooks/use-last-touch.ts`: `useLastTouchMap(): Map<contactId, {date, kind}>` (касание = звонок `status==='done'` ИЛИ прошедшая встреча; запланированный звонок — не касание), `daysSince(iso)`, `touchLevel(days) → 'ok'|'cooling'|'cold'` (cold = >2× порога; cooling = >порога ИЛИ касаний нет).
- Порог: `lib/constants/reconnect.ts` → `RECONNECT_THRESHOLD_DAYS = 21` (позже станет настройкой).
- Секция «Остывают» (TodayView): контакты активных сделок ИЛИ компаний с активными сделками (`isProjectActive`), у которых касание старше порога / его нет; топ-5 «холоднее сверху», счётчик общий; «касаний не было»/«N дн. без касания» (yellow, >2× — red).
- Колонка «Касание» в `ContactsTable` (sortable через обогащение строк `last_touch`); индикатор в шапке `ContactDetailHub` (тот же язык, что «Здоровье»).
- `ui-store.openModal(modal, editId?, context?: { contactId?, companyId?, projectId? })` + `modalContext`; `GlobalModals` пробрасывает в `default*Id` пропсы модалок.

### ActivityDrawer (`ActivityDrawer.tsx`)
- Right-side drawer, z-index: 30 (рендерится в text-nav shell, т.е. только для t-aura)
- 4 widgets stacked vertically (после W1b — focus и planned calls убраны в TodayView):
  1. Digital clock
  2. Mini calendar with event markers + quick actions
  3. Stats grid (projects/calls/tasks/meetings counts)
  4. Activity feed (recent activity_log entries)

### Contact 360° Hub (`contacts/[id]/page.tsx` → `contacts/ContactDetailHub.tsx`)
- Two-column bento layout
- Expanding pill actions (CTA pills that open modals with pre-fill)
- Animated border trace via SVG `stroke-dashoffset`
- **Unified activity timeline via `<EntityTimeline entityType="contact" entityId>`** (Sprint
  Contact-Hub-A) — единая лента calls/meetings/tasks/projects; см. «EntityTimeline» ниже.
  `onOpenEvent` открывает модалку по `kind` (call/project — из готовых данных, meeting/task —
  точечная `.eq('id',…).single()`); `renderAction` возвращает AI-Sparkles для звонков.
- Deal-карточка = **все** сделки контакта (счётчик, стадия-чип, `+ещё N`), не только первая.
- Corner bracket decorations on cards
- **Долг:** держит `useCalls()`/`useProjects()` (org-fetch) ради upcomingCall/linkedProjects/
  Deal-карточки — вынести на серверный фильтр позже.

### ProjectDetail (`projects/[id]/page.tsx`)
- Header (title, health dot, completeness badge) → DealProgressBar/StackedPipeline → **DealFocusPanel** → info grid → Files → **единая «Активность»** (Sprint Company/Deal-Hub)
- **Активность** = `<EntityTimeline entityType="project" options={{ includeSystem: true }}>` +
  `ActivityComposer` (заметка) + быстрые кнопки +Задача/+Звонок/+Встреча. Заменила три отдельных
  списка Задачи/Звонки/Встречи (org-fetch `useTasks/useCalls/useMeetings` + useMemo — **сняты**) и
  старую read-ленту `ActivityTimeline`. Клик по событию → `openTimelineEvent` (см. Hook Patterns).
- **DealFocusPanel** (`DealFocusPanel.tsx`, Sprint W1c): рабочая панель «что дальше» под пайплайном, рендерится только для активных сделок (`status === 'open'`). Три зоны (grid, стопка на мобильном): (1) Следующий шаг — `next_step` + `next_action_date` через InlineEdit; overdue → дата красным + «просрочен N дн.»; no-action → жёлтая рамка; кнопка «Шаг сделан» очищает оба поля одним update. (2) Закреплено — `pinned_note` через InlineEdit (`as="textarea"`). (3) Здоровье — HealthDot + дней без активности (из закешированного `useActivityLog`). Блок с hairline границей `border-y` (декор-скобки убраны глобально, Sprint UI-D1).
- Data-completeness checklist включает `next_step` и `next_action_date` («Дата шага»)
- **StackedPipeline** (IIoT, детальная) — multi-track chevron **на `stage_id`** (S29.1):
  треки = `phase_group` из `pipeline_stages` (attraction/working/approval/closing),
  внутри трека — `order_index`; никакого хардкода названий стадий. Клик → `moveToStageId(id,
  stageId)` **без legacy** + гейт-баннер S27 переиспользован. Прогресс — позиция `stage_id`
  среди активных стадий. ERP-аналог — `DealProgressBar` (тот же паттерн, single-track).
- **Legacy `projects.stage`** (enum) выводится из UI: чеврон его больше не пишет; часть
  читателей ещё на нём (ProjectsTable track-фильтры, ContactDetailHub, CommandPalette) —
  план в BACKLOG. Источник истины стадии — `stage_id` → `pipeline_stages`.
- Deal health: `getDealHealth`/`getNextActionOverdueDays` (activity-based selling, `next_action_date` + rotting) в `lib/utils/deal-health.ts`

### Calendar (`calendar/page.tsx`)
- Full month grid view
- Day click → right panel shows events for that day
- Event markers (dots) on days with calls/meetings
- Clickable events route to entity detail pages

---

## Hook Patterns

All entity hooks follow the same pattern:

```typescript
// use-[entity].ts
export function use[Entities]() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  // READ
  const query = useQuery({
    queryKey: ['[entities]'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('[entities]')
        .select('*, companies(*), contacts(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // CREATE (optimistic)
  const create = useMutation({
    mutationFn: async (values: EntityInsert) => {
      const { data, error } = await supabase
        .from('[entities]')
        .insert(values)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onMutate: async (newEntity) => {
      await queryClient.cancelQueries({ queryKey: ['[entities]'] });
      const previous = queryClient.getQueryData(['[entities]']);
      queryClient.setQueryData(['[entities]'], (old) => [newEntity, ...old]);
      return { previous };
    },
    onError: (err, _, context) => {
      queryClient.setQueryData(['[entities]'], context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['[entities]'] });
    },
  });

  // UPDATE, DELETE follow same pattern
  return { ...query, create, update, remove };
}
```

### Realtime Sync

```typescript
// In any page component:
useRealtimeSync('tasks');  // auto-invalidates React Query on Supabase changes
```

### EntityTimeline + per-entity серверный фильтр (Sprint Contact-Hub-A/-B)

Переиспользуемая лента активности сущности (контакт / компания / сделка) — **серверный
фильтр по entity-колонке вместо org-fetch + клиентской фильтрации**. **На всех трёх хабах:**
`ContactDetailHub`, `CompanyDetail` (Активность-секция, фильтр `company_id`), `ProjectDetail`
(заменил три списка Задачи/Звонки/Встречи, `includeSystem` включён — см. ниже).

- `types/timeline.ts` — общий `TimelineEvent { id, kind, title, date, detail?, status?, sourceId,
  icon }`, `TimelineKind ∈ {call,meeting,task,project,activity,ai_run}`.
- `lib/timeline/adapters.ts` — **чистые** адаптеры `callToEvent`/`meetingToEvent`/`taskToEvent`/
  `projectToEvent` (Row→Event, без запросов). `taskToEvent(row, now)`: overdue =
  `deadline < now && lane !== 'done'`. XSS-гигиена — только текст в title/detail.
- `lib/hooks/use-entity-timeline.ts` — `useEntityTimeline(entityType, entityId, {includeSystem})`.
  Колонка фильтра: `contact→contact_id`, `company→company_id`, `project→project_id`.
  Параллельные `useQuery` per-source с **`.eq(col, id)` на СЕРВЕРЕ**, свои queryKey
  `['timeline', kind, entityType, id]`, `staleTime 60s`, `.limit(50)`. Источник `projects`
  пропущен для `project`-хаба (сама сущность). Возврат — `{ events (date desc), isLoading }`.
  `activity_log` (транзитивно через project_id) + `ai_runs` (через call|meeting id) реализованы,
  но за флагом `includeSystem` (default **false** → Sprint B).
- `components/shared/EntityTimeline.tsx` — презентер: группы **Просрочено → Этот месяц → Ранее**,
  клиентские табы по `kind` (фильтр в памяти, без повторных запросов), `renderAction(event)`
  render-prop (держит компонент generic — AI-кнопка живёт в родителе), пустое состояние,
  скролл-контейнер `max-h`. Иконки/цвета — статичная `KIND_META` (без динамических Tailwind-классов).
  Проп `options={{ includeSystem: true }}` включает activity_log/ai_runs.
- `lib/timeline/open-event.ts` — **`openTimelineEvent(event, ctx)`**: ЕДИНЫЙ маппинг kind→действие
  для всех хабов. `project`→`router.push`; `call/meeting/task`→точечная выборка `.eq('id').single()`
  + колбэк хаба (`onCall/onMeeting/onTask`) открывает модалку редактирования; `activity/ai_run`→noop.
  Все три хаба зовут его из `handleOpenEvent` — один источник правды.

**Deal Hub — включённый `includeSystem`:** у сделки `activity_log` (её журнал: стадии, comment_added,
automation_fired) и `ai_runs` (AI-протоколы по её звонкам) — центральны, поэтому лента одна.
`activity`-события рендерятся через `describeEvent` (читаемый текст комментария/стадии, не сырой
event_type). **Один composer заметок** (`ActivityComposer`, пишет `comment_added` в activity_log →
`invalidateQueries(['timeline'])` подтягивает в ленту) + **одна общая лента**, НЕ две разные.

**Learning:** timeline-источники — серверный фильтр по entity-колонке, НЕ тянуть весь org и
фильтровать в `useMemo` (старый антипаттерн `ContactDetailHub`: `useCalls()` → filter). Абстракция
сразу под contact/company/project, чтобы не переписывать под company/deal hub. У сделки — ОДНА
лента (`includeSystem`) + composer в activity_log, не две разные ленты.

**Контракт расширений (S-R2-CO360-1 + S-UI-CLARITY-1) — 5 опциональных props, все выключены
по умолчанию.** Страницы, которые их не передают (`ProjectDetail`, `ContactDetailHub`,
`MessageThread`), рендерятся ровно как раньше — это обязательное условие любой правки ленты:

| Проп | Что делает |
|---|---|
| `kindFilter?: TimelineKind[]` | какие kinds вообще показывать и предлагать чипами; режет УЖЕ загруженные события (запрос не меняется — иначе поедут счётчики относительно `PER_SOURCE_LIMIT`) |
| `splitUpcoming?: boolean` | «Предстоящее» первой группой + «Ранее» ВМЕСТО трёхчастной группировки (две оси в одном списке нечитаемы); внутри «Предстоящего» порядок обратный — ближайшее сверху |
| `filter` + `onFilterChange` | управляемый режим. Работает **только когда переданы оба**: одиночный `filter` дал бы залипший чип |
| `showFilters?: boolean` | скрыть встроенный ряд чипов — родитель рисует свой в другом месте макета |

Экспортируется **`TimelineFilterChips`** — тот же чип-ряд для размещения вне компонента
(карточка компании ставит его НАД композером, лента получает `showFilters={false}`).

**Чипы `activity`: «Система» + производные «Заметки».** `TimelineFilterValue = 'all' |
TimelineKind | 'note'`. `activity` — это `activity_log` ЦЕЛИКОМ (смены стадий, аудит полей,
автоматизации), поэтому чип называется «Система». «Заметки» — производный срез:
`kind==='activity' && isNoteEvent(eventType)`, где заметка = `comment_added` (единственный
тип, который пишет человек). Отдельным kind это не сделать — источник один, и `kindFilter`
всех родителей пришлось бы учить второму имени того же источника. `TimelineEvent.eventType`
берётся из уже существующей колонки селекта — новых запросов нет. Родитель, который
персистит выбор чипа, обязан разрешить значение `note` в своём валидаторе.

**Долг:** `CompanyDetail` для карточек-связей Контакты/Проекты всё ещё держит `useContacts()`/
`useProjects()` (org-fetch + клиентский фильтр) — оставлено, чтобы не раздувать диф; timeline
уже на серверном фильтре. `ProjectDetail` org-fetch хуки (`useTasks/useCalls/useMeetings`) —
**сняты** (не были завязаны на stage-логику).

**Индексы:** migration `031_timeline_fk_indexes.sql` — `idx_calls_contact`, `idx_projects_contact`
(были unindexed FK; meetings/tasks/company-side уже покрыты 012/013/005/003). При добавлении
company/deal-хабов на `<EntityTimeline>` — сверять advisors на unindexed FK по новым колонкам.

---

## Multi-tenancy & Team (S23–S26)

Организация (`organizations`) + членство (`memberships` с ролью) — корень тенанта.
`org_id` на 14 tenant-таблицах проставляет БД (`set_org_id` триггер), клиент его
**не передаёт**. Роль — только из `memberships` (глобальная `profiles.role`
удалена). Детали схемы/RLS — `schema.md`.

### Org / team хуки (`lib/hooks/`)
- **`use-org-role.ts`** → `useOrgRole()`: RPC `current_org_role()` → `OrgRole | null`.
  Гейтит UI (create-кнопки, Team-секцию). `staleTime` 5 мин.
- **`use-team-members.ts`** → `useTeamMembers()`: со-члены org (profiles + роль/
  `membership_id` из memberships вторым запросом). `TeamMember = {id, full_name,
  avatar_url, role, membership_id}`. Плюс мутации `useUpdateMemberRole` /
  `useRemoveMember` (по membership id). RLS сам отдаёт только членов той же org.
- **`use-notifications.ts`** → `useNotifications()` (limit 30, unread-first,
  `useRealtimeSync('notifications')`), `useUnreadCount()`, `useMarkRead(id)`,
  `useMarkAllRead()`.
- **`use-invitations.ts`** → `useInvitations()` (pending, owner/admin),
  `useCreateInvitation({email, role})` → invite-ссылка `${origin}/login?invited=1`
  (org_id берётся из RPC `current_org_id`, т.к. на invitations нет set_org_id-триггера),
  `useRevokeInvitation(id)`, `inviteLink()`.
- Обновлённые CRUD-хуки (use-leads/use-tasks/…): optimistic-объекты включают
  `org_id: ''` заглушкой (реальное значение проставит БД + realtime-инвалидация).

### AI-фичи (S28) — Edge Function под JWT юзера
- **Паттерн Edge Function под JWT юзера** (`supabase/functions/ai-summarize/`):
  функция создаёт supabase-клиент с `Authorization` header вызывающего
  (`createClient(URL, ANON_KEY, {global.headers.Authorization})`) → **RLS решает
  доступ**, функция НЕ проверяет права сама. Сервисный ключ (bypass RLS) НЕ
  используется — минимум привилегий. Не нашлось (RLS) → 404. Ключ Anthropic —
  только в Supabase secrets (`ANTHROPIC_API_KEY`), на клиент никогда. Anti-injection:
  фикс. system-промпт, untrusted-данные только в `<data>…</data>` user-turn, один
  tool `submit_summary` + `tool_choice` force, лимит 8000 симв, вывод рендерится
  только как текст. `verify_jwt = true` в `config.toml`. Событие в activity_log:
  `ai_summary_generated`. **Референс для будущих AI-фич (S29+).**
- **`use-ai-summary.ts`** → `useAiSummary()`: мутация
  `supabase.functions.invoke('ai-summarize', {body:{entity_type, entity_id}})` →
  invalidate `['calls']`/`['meetings']`. `isPending`/`error` для UI; error-тело
  функции (нейтральное сообщение) достаётся из `error.context.json()`.
- **`shared/AiSummaryPanel.tsx`**: кнопка Sparkles + блок результата (summary /
  key_points / risks / suggested_next_step с «Применить» → `onApplyNextStep`).
  Смонтирован в `AiWorkspaceModal` (не в модалках редактирования). «Применить»
  пишет `next_step` напрямую в сущность (`useUpdateCall`/`useUpdateMeeting`), т.к. формы
  редактирования рядом нет. `ai_summary jsonb` / `ai_summary_at` на calls/meetings — тип
  `AiSummary` в `database.ts`.

### AI Hub (S-AI-1) — AI-прогоны пресетов по транскрипту
- **Реестр пресетов — ТОЛЬКО в коде edge** (`supabase/functions/ai-run/`, `PRESETS`):
  meeting_protocol / analytic_note / spin_review — фикс. system + анти-injection + свой
  tool (structured output) + maxInputChars + promptVersion. Промпт в БД/на клиенте НЕ
  живёт. Клиент знает лишь метаданные — `src/lib/constants/ai-presets.ts` (title/описание/
  model/maxInputChars + `estimateRunCostRub`). Модели через env `AI_RUN_MODEL_SONNET/HAIKU`
  (дефолты `claude-sonnet-5` / `claude-haiku-4-5-20251001`) — смена без редеплоя.
- **Edge `ai-run`** — generic, async: INSERT ai_runs(pending) → `{run_id}` → Claude в
  `EdgeRuntime.waitUntil` → done/error (никогда не виснет). Идемпотентность `ux_ai_runs_active`
  + условный CAS-реклейм зомби (10 мин). Наследует security-контур S28 (JWT, RLS, forced
  tool_choice, ключ в secrets). RLS «по сущности» через EXISTS — см. schema.md.
- **`use-ai-run.ts`** → `useTranscript` (последний транскрипт сущности), `useEntityRuns`
  (лента + `useRealtimeSync('ai_runs')` + refetch-страховка при активном прогоне),
  `useStartRun` (upsert транскрипта → `invoke('ai-run')`), `useRunRating` (👍/👎 + feedback_note).
- **`components/ai/AiRunPanel.tsx`** + `renderers/` (ProtocolRenderer / AnalyticNoteRenderer /
  SpinReviewRenderer + `AiResultRenderer`-диспетчер по preset_key): зона транскрипта (paste,
  счётчик, «≈ N ₽ за прогон»), кнопки пресетов (фильтр по `entityTypes`), лента прогонов
  (статус-чип, результат ТОЛЬКО как текст, копирование, повтор при error/зависании).
  Смонтирован в `AiWorkspaceModal`, ниже `AiSummaryPanel`.
- **`components/ai/AiWorkspaceModal.tsx`** — отдельная модалка «AI-анализ · <тип> · <субъект>»
  (`max-h-[85vh] overflow-y-auto`), пропсы `{isOpen,onClose,entityType,entityId,projectId?,
  companyId?,contactId?}`. Точка входа — иконка **Sparkles** рядом с карандашом
  редактирования сохранённой сущности: `CallLog`, `MeetingsList` (MeetingCard),
  `ContactDetailHub` (лента активности), `CalendarView` (события дня). Модалки редактирования
  (`CallModal`/`MeetingModal`) — ТОЛЬКО данные, AI внутри них больше нет. Сущность (ai_summary,
  заметки, связи) читается из `useCalls`/`useMeetings` по id.
- **Killer-фича: action item → задача.** Кнопка у поручения протокола → `TaskModal` с
  `defaultText`/`defaultDeadline` (+ default*Id из сущности). **AI сам в CRM не пишет —
  только предлагает, юзер подтверждает** (injection-защита + доверие); пишет лишь свои
  таблицы `ai_runs`/`transcripts`.

### Org / team компоненты
- **`shared/AssigneeSelect.tsx`**: выбор со-члена org (assigned_to задач /
  owner_id проектов-компаний-контактов). Источник — `useTeamMembers()`.
  В модалках создания/редактирования.
- **`layout/NotificationBell.tsx`**: колокольчик с unread-бейджем + dropdown
  (z-[9999], как theme-меню). Клик по уведомлению → `markRead` + переход
  (task→`/tasks`, project→`/projects/${entity_id}`). Смонтирован в `ContentHeader`
  (единый page-header во всех темах; deal_won → `/deals/${entity_id}`, Волна 2).
- **`settings/TeamSection.tsx`**: в `SettingsContent`, виден только owner/admin
  (`useOrgRole`). Список членов (имя + роль-бейдж / select смены роли; owner
  назначает owner только сам), pending-инвайты (email, роль, копировать ссылку,
  revoke), форма приглашения (email + роль admin/manager/viewer). RLS +
  `protect_last_owner` подстраховывают UI.

### Org data flow
```
User action (insert/update)
  → БД: set_org_id() BEFORE INSERT проставляет org_id = current_org_id()
    → RLS (org-граница + роль/ownership через current_org_role/auth.uid)
      → триггеры (activity_log, notify_*_assigned)
        → Realtime → React Query invalidation → UI

Назначение: UPDATE tasks.assigned_to (или projects.owner_id)
  → AFTER-триггер notify_task_assigned/notify_project_assigned (SECURITY DEFINER)
    → INSERT notifications (не себе; ошибка не блокирует запись)
      → supabase_realtime → useNotifications invalidate → колокольчик (badge)
```

---

## Modal Pattern

All modals use the **custom `shared/Modal.tsx` shell** (НЕ Radix Dialog) + React Hook Form + Zod:

```typescript
// Modals receive optional `defaultValues` for edit mode
// Modals receive optional pre-fill props (e.g., company_id from 360° Hub)
// Form submission calls hook mutation (create or update)
// Modal closes on success
// Optimistic update shows change immediately
```

Общая сигнатура: `{ isOpen, onClose, edit<Entity>: Entity | null, default*? }`.

**Файлы модалок — по фиче-папкам, НЕ в `components/modals/`** (`calls/CallModal`,
`meetings/MeetingModal`, `tasks/TaskModal`, `projects/ProjectModal`, `contacts/`,
`companies/`, `leads/`). Перед вставкой пути в промпт/команду — `find src -name "*Modal.tsx"`,
не доверять памяти (грабли ловились дважды).

**`TaskModal`** _(S-AI-1)_ — к `default*Id` добавлены `defaultText?`/`defaultDeadline?`
(по тому же образцу): префилл текста задачи и дедлайна при создании из action item
AI-протокола. `deadline` режется до `slice(0,16)` под `datetime-local`.

### GlobalModals host (`shared/GlobalModals.tsx`, Sprint W2a)
- Единый host для модалок, открываемых из палитры команд через `openModal(id)` в ui-store (`activeModal: ModalId`, `editingId`, `openModal`/`closeModal`). Монтируется один раз в `(dashboard)/layout.tsx` рядом с `<CommandPalette/>`.
- Маппинг `ModalId → компонент` (task/project/call/meeting/contact/company), каждая с `editX={null}` (создание). Модалки рендерят null при `isOpen=false` → монтирование всех сразу дёшево.
- Esc закрывает открытую из палитры модалку (сами модалки Escape не слушают — закрываются по backdrop/кнопке).
- Локальные инстансы модалок на страницах (свой useState) не конфликтуют — палитра закрывается перед `openModal`.

---

## Command Palette (`shared/CommandPalette.tsx`, ⌘K)

- Open-state в ui-store: `commandPaletteOpen` + `paletteActionsOnly` (`toggleCommandPalette`/`openCommandPalette(actionsOnly?)`/`closeCommandPalette`). Кнопка поиска в `ContentHeader` и ⌘K дёргают этот стор.
- Секции по порядку: **Действия** (создание сущностей → `openModal`, kbd-подсказки T/C/P/M), **Виды** (сохранённые виды всех страниц из `useSavedViews()`, sub = подпись маршрута, выбор → `router.push(route + query)`), **Навигация** (Сегодня `/`, Обзор `/overview`, …), затем сущности (задачи/сделки/компании/контакты/звонки/встречи) из хуков.
- Быстрые клавиши T/C/P/M внутри палитры срабатывают только при пустом query (иначе — ввод текста).
- Глобальный `N` (в `shared/Hotkeys.tsx`, вне инпутов, не перехватывает `G N`) → `openCommandPalette(true)`: палитра в режиме «только Действия».
- Footer-легенда: ↑↓ — навигация · Enter — выбрать · Esc — закрыть · j/k, Space — предпросмотр, d — действие (Сегодня).

---

## Keyboard nav + Peek (Sprint W2d)

### use-keyboard-nav v2 (`lib/hooks/use-keyboard-nav.ts`)
- Roving `activeIndex` по `[data-row-index]`: `j`/`↓` вниз, `k`/`↑` вверх (стоп на краях, без wrap), `Enter` → `onSelect`, `Space` → `onPeek`, `d` → `onAction`, `Escape` → сброс + `onEscape`.
- Буквы через `e.code` (KeyJ/KeyK/KeyD/KeyG) — работает в ru-раскладке; `d` глушится 600мс после `g` (не конфликтует с G-D навигацией Hotkeys).
- Guard: инпуты/contentEditable, модификаторы, `useUiStore.getState()` (activeModal, commandPaletteOpen), опциональный `isActive()` (видимость + арбитраж), `containerRef` скоупит scrollIntoView (block: nearest; smooth только без reduced-motion).
- `activeIndex` сбрасывается при смене `itemCount` (фильтр/страница/подгрузка данных).

### DataTable (`shared/DataTable.tsx`)
- Nav включён при `onRowClick || peek`. Все потребители (Projects/Contacts/Companies/Leads) получают j/k бесплатно.
- Две таблицы на странице: module-level `activeKbdTable`, mouseenter по корню таблицы перехватывает nav (первая смонтированная — по умолчанию, атрибут `data-kbd-active`).
- Проп `peek?: (row) => { title, href, content }`: Space — toggle панели, открытый peek следует за фокусом (j/k) и за кликом по строке (клик при открытом peek = смена содержимого, НЕ переход). Строки: `data-kbd-focused` + `aria-selected`.
- Потребители peek: ProjectsTable → `projects/ProjectPeekContent` (статус-строка + `DealFocusPanel compact` с inline-правкой + компания/контакт + 3 события из уже закешированного `useActivityLog`), ContactsTable → `contacts/ContactPeekContent` (должность, компании, tel/mailto, касание).
- `DealFocusPanel` принимает `compact?: boolean` — одна колонка для панели 440px.
- Форматтеры таймлайна `describeEvent`/`relativeTime` вынесены в `lib/utils/activity-events.ts` (используют ProjectDetail и ProjectPeekContent).
- Проп `hideSearch?: boolean` (POLISH-1) — скрывает встроенную search bar, когда поиск
  поднят в родителя (напр. `TasksTable`, где `TasksView` держит общее состояние поиска
  для Списка и Таблицы).

### TodayView j/k/d
- Плоский массив `flatRows` (порядок = порядок секций), смещения `off*` дают `kbdIndex`/`focused` каждой `QueueRow`; `Enter` = переход по телу строки, `d` = primary-действие («Выполнен»/«Готово»/«Запланировать шаг/звонок»). Без peek.
- Локальный ProjectModal глушится через `isActive: () => !modalOpen` (он не в ui-store).
- `QueueRow`: пропсы `kbdIndex`/`focused`, фокус-визуал `.kbd-focus-row`, secondary-кнопка видима при фокусе.

### TaskStream j/k/d (S-TASKS-POLISH-1)
- Тот же паттерн, что TodayView: плоский массив по всем бакетам (`groups.flatMap`),
  `offsets[]` на группу дают `kbdIndex`/`focused` каждой `TaskStreamRow`; `Enter` →
  `onEdit` (открыть `TaskModal`), `d` → toggle lane done/now. Без peek (Table peek
  получает бесплатно от `DataTable`).
- **Гейт-нюанс**: `TaskModal` сидит на `shared/Modal.tsx`-примитиве, **не** в
  `ui-store` — авто-гейт `useKeyboardNav` по `activeModal` его не видит. Проброшен
  явный `modalOpen` проп из `TasksView` → `isActive: () => !modalOpen` (1:1 с
  TodayView/ProjectModal). Общее правило: любой модал не через
  `ui-store.openModal` требует такого явного проброса рядом с j/k.
- `TaskStreamRow`: пропсы `kbdIndex`/`focused`, фокус-визуал `.kbd-focus-row`,
  quick-actions (На завтра/Дата) видимы при фокусе (F-12-паттерн, не только hover).

---

## URL-фильтры и Saved Views (Sprint W2c)

### Чип-фильтры в URL (`lib/hooks/use-chip-filter.ts`)
- `useChipFilter(data, filters, paramKey = 'f')` — `activeFilters` живёт в searchParams (`?f=key1,key2`), а не в useState. API прежний: `{filtered, activeFilters, counts, toggle, reset}`.
- Запись через `router.replace(..., { scroll: false })` — клики по чипам НЕ создают записей в history (back-button чистый).
- Ключи из URL, отсутствующие в `filters` (устаревший вид, ещё не загруженные динамические чипы вроде `pos_*` в контактах), игнорируются при фильтрации — не обнуляют выборку.
- Потребители: ProjectsTable, CompaniesTable, ContactsTable. Все страницы — dynamic (auth-cookies), поэтому `useSearchParams` не требует Suspense-обёртки; при добавлении на статическую страницу — оборачивать в `<Suspense>`.
- Поисковая строка (`q`) в URL сознательно НЕ переносится (blast radius).

### Saved views (`lib/hooks/use-saved-views.ts`)
- `SavedView { id, label, route, query }`, localStorage key `'saved-views'` (общий массив на все страницы; таблица `user_views` в Supabase — потом).
- `useSavedViews(route?)` → `{ views, saveCurrent(label), remove(id), apply(view) }`. Реактивность через `useSyncExternalStore` (module-level cache + listeners + storage-event для других вкладок).
- Хук сознательно НЕ использует `useSearchParams` (его тянет CommandPalette из layout) — `saveCurrent` снимает `window.location.search` целиком (включая `view=table`, `direction`, `f=…`).
- `apply` = `router.push(route + query)`.

### UI (`ui/SavedViewChips.tsx`)
- Рендерится в строке чипов после `ChipFilter` (обёртка `flex flex-wrap items-center gap-2`): разделитель-точка → чипы видов текущего route (Bookmark 12px, до 8 шт.) → кнопка «Сохранить вид» (BookmarkPlus, dashed border).
- Кнопка видна только при непустом query string; клик → inline-инпут имени (Enter — сохранить, Esc/blur — отмена), не модалка.
- Крестик удаления — на hover чипа (group-hover), без confirm. Активный вид (`view.query === '?' + searchParams`) подсвечен как активный чип.
- Интеграция: ProjectsView (строка direction-чипов — видна во всех трёх режимах), CompaniesTable, ContactsTable.

---

## Drag & Drop

- Library: `@dnd-kit/core` + `@dnd-kit/sortable`
- Used on: Projects kanban — drag between pipeline stages
- **Tasks page — lane-борд (`components/tasks/KanbanBoard.tsx`, now/next/wait/done) выведен
  из дефолта S-TASKS-RESTRUCTURE-1** (2026-07-22); файл жив (index.ts экспортирует, нигде не
  рендерится) для дешёвого отката. Дефолт `/tasks` — `TasksView` (стрим по датам/Таблица, БЕЗ
  drag-and-drop). См. «Раздел «Задачи»» в Key Components.

---

## Data Visualization

- Library: Recharts
- Theme-aware colors via CSS variables (not hardcoded hex)
- Charts: pipeline funnel, task distribution, call stats, activity trends
- Export: PNG via `html2canvas`, CSV with BOM prefix

---

## Excel Import

- Library: SheetJS (xlsx)
- Available on: Companies page, Contacts page
- Smart column mapping: auto-detects Russian column headers
- Validates data before insert
- Creates contact_company links for matched companies
- **План внедрения (S-PLAN-IMPORT-1)**: `components/tasks/PlanImport.tsx` (`PlanImportButton`) —
  импорт плана из Excel в задачи (фазы→project_columns, задачи с lane='next', даты, вехи);
  `lib/utils/plan-import-helpers.ts` (autoDetectPlanMapping, parsePlanDate→localDateKey,
  parseMilestone; 19 vitest). Клиентский skip-and-continue (как companies/ExcelImport),
  гейт canManage.
