# Linear — комплексный анализ и инсайты для dashboard-crm

**Дата:** 2026-07-12  
**Метод:** парсинг linear.app (product, peek docs, pricing, changelog 2026), shortcuts.design, сопоставление с кодовой базой dashboard-crm и `CHANGES-waves-1-2.md` (спринты W2a–W2d).  
**Связанные документы:** `CRM-EVOLUTION-PLAN.md` (волна 2 — скорость, концепт «Мостик»), `improvements/crm-benchmark-candidates-2026-07-12.md`, `improvements/close-analysis-2026-07-12.md`, `INTEGRATION.md`.

---

## 0. Как читать этот документ

| Символ | Значение |
|--------|----------|
| ✅ | Паритет или сильная альтернатива |
| 🟡 | Частично / другая модель |
| ❌ | Нет |
| ➕ | Есть у нас, у Linear нет «из коробки» или слабее |
| 🔒 | Требует платного tier Linear |

**Контекст:** Linear — **не CRM**. Это **issue tracking / product development system** («purpose-built for planning and building products», AI era). dashboard-crm бенчмаркит Linear **только как эталон productivity UX**: command menu, keyboard nav, peek, скорость UI. **Волна 2 уже реализована** (W2a–W2d, июль 2026). Этот анализ фиксирует: **что закрыто**, **где Linear всё ещё впереди**, **что добрать без превращения CRM в трекер задач**.

---

## 1. Linear в 2026 — позиционирование и архитектура

### 1.1 Слоган и стратегия

Linear позиционируется как **«The product development system for teams and agents»** — система от roadmap до release, с AI-агентами в ядре workflow.

Ключевые концепции (с [linear.app](https://linear.app/), [features](https://linear.app/features)):

```
Linear Platform (2026)
├── Plan — Initiatives, Projects, Documents, roadmaps
├── Build — Issues, Cycles, Agents, Git automations, Diffs
├── Monitor — Pulse, Insights, Dashboards
├── Intake — Triage, Customer Requests, Linear Asks (Slack/email)
└── AI — Linear Agent, Triage Intelligence, Coding Sessions, MCP

UX DNA (не отдельный модуль — сквозная философия):
├── Keyboard-first — каждое действие без мыши
├── Command menu (⌘K) — навигация + действия + preview
├── Peek (Space) — Quicklook-превью без перехода
├── Speed — optimistic UI, минимум chrome, instant transitions
└── Views — один датасет → list / board / timeline
```

**Главное отличие от CRM:** Linear оптимизирует **поток инженерной работы** (issue → PR → ship), не **relationship selling** (лид → звонок → сделка → внедрение). Переносим **механику скорости**, не объектную модель.

**2026 pivot:** «teams and agents» — Linear Agent создаёт issues из Slack, пишет код (Coding Sessions), Triage Intelligence маршрутизирует входящие. Для CRM это **аналог AI Hub + workflow**, не копирование coding agents.

### 1.2 Масштаб (заявленный, 2026)

| Метрика | Значение |
|---------|----------|
| Компании | 33,000+ product teams |
| Референсы | OpenAI, Ramp, Opendoor |
| Позиционирование | High-performance product teams |

### 1.3 Ценовая модель (2026)

Источник: [linear.app/pricing](https://linear.app/pricing).

| Plan | Цена | Ключевое |
|------|------|----------|
| **Free** | $0 | Unlimited members, 250 issues, 2 teams |
| **Basic** | **$10/user/mo** | Unlimited issues, admin roles |
| **Business** | **$16/user/mo** | Triage Intelligence, Insights, private teams |
| **Enterprise** | Custom | SAML/SCIM, audit log, IP restrictions |

**Инсайт:** Linear дешевле enterprise CRM ($10–16 vs $175+ Salesforce), но **не заменяет CRM** — команда 10 человек может использовать Linear для **внутренней разработки** параллельно с dashboard-crm для **продаж**. Наш PCT-1 (`internal` projects) — лёгкий аналог Linear внутри CRM без второго инструмента.

---

## 2. «Объектная модель» Linear (не CRM objects)

| Linear сущность | Назначение | Аналог в dashboard-crm |
|-----------------|------------|------------------------|
| **Issue** | Атом работы | `tasks` |
| **Project** | Контейнер delivery | `projects(type=internal\|delivery)` |
| **Cycle** | Time-boxed sprint | ❌ (не нужно для sales) |
| **Initiative** | Strategic theme | ❌ |
| **Team** | Ownership scope | 🟡 org + project_members |
| **Triage** | Inbox входящих | 🟡 TodayView (другая семантика) |
| **Label / Priority** | Metadata | 🟡 tags, deal-health |
| **Status** | Workflow state | `pipeline_stages`, task lanes |

**Паттерн из PCT-1:** Linear «custom statuses + status category» → наш `project_columns` + `ColumnCategory` (Todo/Doing/Done) поверх разнородных lane-ов задач.

**Паттерн My Issues vs Project view:** у нас — личный task board (`/tasks`) vs project board (`ProjectBoard`) — **паритет intent**.

---

## 3. Productivity UX — главный предмет бенчмарка

### 3.1 Command Menu (⌘K)

Linear: единая точка входа — поиск issues/projects, навигация, создание, **preview при стрелках** ([peek in command menu](https://linear.app/docs/peek)).

| Аспект | Linear | dashboard-crm (W2a) |
|--------|--------|---------------------|
| ⌘K / Ctrl+K | ✅ | ✅ `CommandPalette` |
| Fuzzy search all entities | ✅ | ✅ scoreItem + все сущности |
| Create actions | ✅ C, templates | ✅ секция «Действия» + T/C/P/M |
| Navigation shortcuts | ✅ G+X sequences | ✅ G+D/T/L/P… (`Hotkeys.tsx`) |
| Saved views in menu | 🟡 favorites | ✅ секция «Виды» (W2c) |
| Preview while navigating | ✅ auto peek | ❌ |
| Actions-only mode | 🟡 | ✅ `N` → `paletteActionsOnly` |
| Shortcut hints in UI | ✅ | ✅ kbd в footer палитры |

**Реализовано в `CommandPalette.tsx`:** 6 create actions, saved views, navigation, scoring, quick keys T/C/P/M при пустом query, закрытие на route change.

### 3.2 Keyboard navigation (j/k)

Linear: j/k (или ↑↓) по спискам; Enter — открыть; Esc — сброс.

| Контекст | Linear | dashboard-crm (W2d) |
|----------|--------|---------------------|
| List views | ✅ everywhere | 🟡 DataTable only |
| Board/kanban | ✅ | ❌ |
| Today queue | 🟡 | ✅ j/k/Enter/`d` |
| Layout-agnostic (e.code) | ✅ | ✅ ru/en раскладка |
| Block when modal open | ✅ | ✅ ui-store gate |
| G-prefix conflict guard | ✅ | ✅ 600ms debounce на `D` |

**Охват таблиц с j/k + peek:**
- ✅ `ProjectsTable` (deals)
- ✅ `ContactsTable`
- ❌ `CompaniesTable` — j/k есть (DataTable), peek нет
- ❌ `LeadsView` table — j/k есть, peek нет
- ❌ Kanban (deals, leads, tasks, delivery board)

### 3.3 Peek preview (Space)

Из [linear.app/docs/peek](https://linear.app/docs/peek):

| Поведение | Linear | dashboard-crm |
|-----------|--------|---------------|
| Space toggle peek | ✅ | ✅ |
| **Hold Space** — временный peek | ✅ | ❌ |
| ↑↓ с открытым peek — смена preview | ✅ | ✅ peek follows j/k |
| Peek в command menu | ✅ | ❌ |
| Mouse launch peek | ❌ keyboard only | ✅ click row + Space |
| Esc закрыть peek | ✅ | ✅ |
| Inline edit в peek | 🟡 limited | ➕ DealFocusPanel compact в deal peek |

**Наш PeekPanel** (`440px`, z-40): сделка — `ProjectPeekContent` + timeline snippet; контакт — `ContactPeekContent` + last_touch.

### 3.4 Global shortcuts (Hotkeys)

| Shortcut | Linear (типично) | dashboard-crm |
|----------|------------------|---------------|
| ⌘K | Command menu | ✅ |
| ? | Shortcut help | ✅ overlay |
| / | Focus search | ✅ `[data-search-input]` |
| G then X | Go to view | ✅ G+D/T/L/P/C/M/N/O/A |
| N / C | Create | ✅ N → actions palette |
| Space | Peek | ✅ |

**Документация для пользователя:** `Hotkeys.tsx` + footer палитры + `GO-LIVE.md` чеклист.

### 3.5 Speed & chrome

Linear: минимальный UI, optimistic updates, instant view switches, «designed for speed».

| Аспект | Linear | dashboard-crm |
|--------|--------|---------------|
| Optimistic mutations | ✅ native | 🟡 React Query partial |
| View transition speed | ✅ эталон | 🟡 Next.js navigation |
| Zero-chrome mode | 🟡 focus mode | ❌ sidebar always visible |
| Status bar / pilot HUD | ❌ | 🟡 концепт «Мостик» (не внедрён) |
| Prefetch on hover | ✅ | ❌ |

---

## 4. Linear AI & agents (2026) — что релевантно CRM

| Linear AI | Назначение | dashboard-crm аналог |
|-----------|------------|----------------------|
| **Linear Agent** | Create/triage issues from Slack | ❌ |
| **Triage Intelligence** | Auto-label, route, prioritize | 🟡 TodayView sections |
| **Coding Sessions** | Agent writes code in repo | ❌ вне домена |
| **Agent-assisted project updates** | Summary from issues | 🟡 AI summary сделки (волна 3) |
| **MCP** | External tool context | ❌ |

**Инсайт:** Linear AI = **операционная автоматизация product work**. Наш AI Hub = **sales intelligence**. Пересечение — **post-meeting HITL** (Smart Deal Progression), не coding agents.

---

## 5. Что уже реализовано — сводка W2a–W2d

По `CHANGES-waves-1-2.md` (верифицировано в коде):

| Sprint | Linear-паттерн | Статус | Ключевые файлы |
|--------|------------------|--------|----------------|
| **W2a** | Command palette 2.0 | ✅ | `CommandPalette.tsx`, `ui-store.ts`, `GlobalModals` |
| **W2c** | Saved views в палитре | ✅ | `use-saved-views.ts`, `useChipFilter` |
| **W2d** | j/k + peek | ✅ partial | `use-keyboard-nav.ts`, `DataTable.tsx`, `PeekPanel.tsx` |
| **W2d** | Today keyboard queue | ✅ | `TodayView.tsx`, `QueueRow.tsx` |
| **W1b** | Action inbox (не Linear, Close) | ✅ | `TodayView` — complement |

**Вывод:** **ядро Linear-бенчмарка из `CRM-EVOLUTION-PLAN.md` волна 2.1 + 2.4 закрыто на ~75%**. Оставшееся — polish и расширение охвата, не новый фундамент.

---

## 6. Gap-матрица: dashboard-crm vs Linear (productivity only)

### 6.1 Где dashboard-crm **сильнее** Linear (для нашего домена)

| Возможность | Почему |
|-------------|--------|
| **CRM objects** (leads, deals, calls, meetings) | Linear — issues only |
| **Sales pipeline + stage gates** | Linear — status workflows для engineering |
| **TodayView action queue** | Linear Triage ≠ sales inbox |
| **Vertical deal stages** (ЧЗ, ERP) | Linear — generic issue states |
| **Reconnect / deal health** | Нет в Linear |
| **Domain AI** (SPIN, протокол) | Linear — coding/triage AI |
| **Delivery contour** | Linear projects ≠ PSA/delivery templates |
| **Peek с inline deal edit** | DealFocusPanel в peek — CRM-specific win |

### 6.2 Productivity gaps (Linear → мы)

| Возможность | Linear | dashboard-crm | Gap |
|-------------|--------|---------------|-----|
| ⌘K command menu | ✅ | ✅ W2a | **паритет** |
| Entity search in palette | ✅ | ✅ | паритет |
| Palette item preview | ✅ | ❌ | gap |
| G+X navigation | ✅ | ✅ | паритет |
| j/k list nav | ✅ all views | 🟡 tables + Today | gap на kanban |
| Space peek | ✅ | 🟡 deals + contacts | gap companies/leads |
| Hold Space temp peek | ✅ | ❌ | minor gap |
| Peek + ↑↓ in cmd menu | ✅ | ❌ | gap |
| Keyboard on kanban | ✅ | ❌ | gap |
| Zero-chrome «Мостик» | 🟡 philosophy | ❌ planned | design gap |
| Instant optimistic UI | ✅ | 🟡 | polish gap |
| Cycles / sprints | ✅ | ❌ | сознательно N/A |

### 6.3 CRM features Linear не имеет (не gap)

Leads, calls, meetings, rotting deals, reconnect, analytics по воронке, AI Hub, Excel import, multi-tenant RLS — **вне скоупа Linear**.

---

## 7. Архитектурное сравнение (UX layer)

```
Linear UX stack                 dashboard-crm (W2)
──────────────                  ──────────────────
⌘K Command Menu        ←→      CommandPalette (W2a) ✅
G+X Go to              ←→      Hotkeys GO_ROUTES ✅
j/k List focus         ←→      useKeyboardNav + DataTable 🟡
Space Peek             ←→      PeekPanel (deals/contacts) 🟡
Hold Space             ←→      ❌
Cmd menu preview       ←→      ❌
Saved filters          ←→      useSavedViews + chip URL (W2c) ✅
Triage inbox           ←→      TodayView (Close pattern) ➕
Zero chrome            ←→      «Мостик» concept (CRM-EVOLUTION §3A) ❌

Data layer (не копируем):
Issues/Cycles/Agents            tasks/projects/calls/deals
```

**Ключевой инсайт:** Linear и Close **дополняют друг друга** в нашем стеке: Close дал **что делать** (TodayView), Linear дал **как быстро перемещаться** (⌘K, j/k, peek). Волна 2 объединила оба.

---

## 8. Приоритеты для dashboard-crm

Отфильтровано: **productivity polish**, не issue tracking. Большинство — малый effort после W2d.

### P0 — Peek на Companies + Leads (~0.2 спринта)

**Референс Linear:** peek на любом list view.

- `CompanyPeekContent` — ИНН, отрасль, active deals count, last_touch
- `LeadPeekContent` — статус, source, convert CTA
- Подключить `peek` prop в `CompaniesTable`, `LeadsView` table mode

### P1 — Hold Space для временного peek (~0.1 спринта)

**Референс:** [linear.app/docs/peek](https://linear.app/docs/peek) — hold to preview, release to close.

В `use-keyboard-nav.ts`: `keydown` Space → open peek; `keyup` Space → close если режим hold (не toggle).

### P2 — Command palette preview (~0.3 спринта)

**Референс Linear:** preview issue при навигации в ⌘K.

При `selectedIdx` в палитре — мини-панель справа (или expanded row): sub, stage, next_action для deals. Без полного PeekPanel — lightweight.

### P3 — Keyboard nav на kanban (~0.4 спринта)

**Референс Linear:** j/k на board columns.

Минимум: `StageBoard` / leads kanban — arrow keys между карточками, Enter open, Space peek. Самый дорогой пункт после W2d — **go/no-go** если команда живёт в kanban.

### P4 — «Следующий в очереди» после action (~0.2 спринта)

**Референс:** Linear flow state — после действия курсор на следующий item.

- TodayView: после `d` (primary) → `activeIndex + 1`
- DataTable: после bulk action — сохранить focus

*Пересекается с close-analysis P4.*

### P5 — Концепт «Мостик» — design sprint (~1 спринт, опционально)

**Референс:** `CRM-EVOLUTION-PLAN.md` §3A — command-first, zero-chrome.

Только после P0–P3 стабилизации keyboard:
- Collapsible sidebar → ⌘K primary nav
- Status strip: «N просрочено · M остывает · K без шага»
- Peek вместо full page для 80% операций

**Не начинать без metrics:** % переходов list→detail vs peek.

### P6 — Optimistic UI polish (~0.3 спринта)

**Референс Linear:** instant feedback на status change, assign.

- `useUpdateProject` / `useUpdateTask` — onMutate cache patch (уже частично)
- Skeleton → content без layout shift на table sort

### Отложить / не копировать

- Issues/Cycles/Initiatives model
- Git integrations, Diffs, Coding Sessions
- Linear Agent / Triage Intelligence для engineering
- Slack Asks / email intake
- Insights dashboards (у нас analytics достаточно)
- SAML tier как единственная цель (→ salesforce-analysis P5 если RFP)
- Замена CRM на Linear для sales

---

## 9. Linear vs Close vs Attio — что брать от кого (UX)

| Паттерн | Лучший референс | Статус у нас |
|---------|----------------|--------------|
| Action inbox | **Close** | ✅ TodayView |
| ⌘K + shortcuts | **Linear** | ✅ W2a |
| j/k + peek | **Linear** | 🟡 W2d partial |
| Saved views | **Close/Attio** | ✅ W2c |
| Object views (table/kanban) | **Attio** | 🟡 |
| Flat IA | **folk** | ❌ optional |
| Zero-chrome pilot | **Linear** philosophy | ❌ «Мостик» |

---

## 10. Что сознательно НЕ копировать

- Issue tracking semantics (estimates, cycles, triage rules)
- Engineering agents (code PR, MCP coding)
- GitHub/GitLab automations
- Product roadmap / initiatives hierarchy
- Customer Requests portal
- Replace sidebar with Linear-style minimal chrome **без** keyboard foundation (уже есть)
- Second tool for team — `internal` projects покрывают лёгкий PM

**Стратегия:** Linear — **эталон скорости интерфейса**. W2a–W2d уже дали **80% ценности**. Дальше — **P0–P2 polish** (peek coverage, hold-space, palette preview), не реплатформинг.

---

## 11. Итоговый вывод

**Linear в бенчмарке `CRM-EVOLUTION-PLAN`** — **в значительной степени закрыт** спринтами W2a, W2c, W2d. dashboard-crm имеет **рабочий Linear-style productivity layer** поверх vertical CRM — редкость для custom CRM в домене маркировки/1С.

**Где мы на уровне Linear:**
- ⌘K command palette с search, actions, views, shortcuts
- G+X global navigation
- j/k + Enter + Space + Esc в таблицах сделок и контактов
- Peek panel с follow-focus и inline deal edit
- TodayView keyboard queue (`d` = primary)
- Help overlay (`?`)

**Оставшиеся UX-разрывы (по убыванию ROI):**
1. **Peek на companies/leads** (P0)
2. **Palette preview** (P2)
3. **Hold Space** (P1)
4. **Kanban keyboard** (P3) — optional
5. **«Мостик» zero-chrome** (P5) — design sprint

**Конкурентное преимущество сохранять:**
- CRM + productivity в одном продукте (не Linear + HubSpot)
- Peek с sales context (DealFocusPanel), не issue description
- TodayView как домашний экран, не Linear My Issues
- Vertical speed: от лида до delivery без смены инструмента

**Связка с другими бенчмарками:** Pipedrive/Close закрыли **механику сделки**; Linear закрыл **скорость работы**; Salesforce — **enterprise expectations**; следующий UX-кандидат вне очереди — **folk** (уплощение IA) или polish P0–P2 из этого документа.

---

## 12. Источники

### Linear (официальные, спарсено 2026-07-12)

- [Homepage — product development system](https://linear.app/)
- [Features](https://linear.app/features)
- [Peek preview (docs)](https://linear.app/docs/peek)
- [Pricing](https://linear.app/pricing)
- [Changelog 2026](https://linear.app/changelog) — Agent-assisted updates, Coding Sessions, Initiative properties

### Shortcuts reference

- [shortcuts.design — Linear](https://shortcuts.design/tools/toolspage-linear/)

### dashboard-crm (репозиторий)

- `CRM-EVOLUTION-PLAN.md` — волна 2, концепт «Мостик»
- `CHANGES-waves-1-2.md` — W2a–W2d deliverables
- `_archive/sprints/SPRINT-W2a-command-palette.md`
- `_archive/sprints/SPRINT-W2b-reconnect.md`
- `_archive/sprints/SPRINT-W2c-saved-views.md`
- `_archive/sprints/SPRINT-W2d-keyboard-peek.md` (если есть)
- `src/components/shared/CommandPalette.tsx`
- `src/components/shared/Hotkeys.tsx`
- `src/lib/hooks/use-keyboard-nav.ts`
- `src/components/shared/PeekPanel.tsx`
- `src/components/shared/DataTable.tsx`
- `INTEGRATION.md` — Cmd+K setup