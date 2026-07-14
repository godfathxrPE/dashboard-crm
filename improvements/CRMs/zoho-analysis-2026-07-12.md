# Zoho CRM — комплексный анализ и инсайты для dashboard-crm

**Дата:** 2026-07-12  
**Метод:** парсинг zoho.com/crm (homepage, features, pricing, complete-feature-list, Blueprint/Workflow/Cadence/CPQ/CommandCenter/Zia docs), Blueprint API v8, Zenatta Blueprint Tutorial 2026, TechnoMap Workflows vs Blueprints, Digital Applied Agentic CRM Playbook 2026, Amazing Business Results Q1 2026 updates, Zoho Projects↔CRM integration, сопоставление с кодовой базой dashboard-crm (S27 Blueprint v1, S29 automation, delivery P1–P3).  
**Связанные документы:** `improvements/CRMs/crm-benchmark-candidates-2026-07-12.md` (Tier 1 — automation без tier-ада), `_analysis/sprint-27-stage-gates.md` (прямой референс Blueprint), `improvements/CRMs/monday-analysis-2026-07-12.md`, `improvements/hubspot-analysis-2026-07-12.md`, `improvements/accelo-analysis-2026-07-12.md`.

---

## 0. Как читать этот документ

| Символ | Значение |
|--------|----------|
| ✅ | Паритет или сильная альтернатива |
| 🟡 | Частично / другая модель |
| ❌ | Нет |
| ➕ | Есть у нас, у Zoho нет «из коробки» или слабее |
| 🔒 | Требует платного tier Zoho |

**Контекст:** Zoho CRM — **модульная SMB/enterprise CRM** в экосистеме Zoho (40+ приложений). В `crm-benchmark-candidates` указана сила: **дёшево, модули, automation, project-like deals**. Для dashboard-crm Zoho — **главный бенчмарк по стеку автоматизации (Workflow → Blueprint → Journey → Agents) и по stage gates (Blueprint)**, а не по delivery UX (там сильнее Monday/Accelo) или AI-native UX (Attio/HubSpot).

**Уникальная связь с нашим кодом:** Sprint 27 (`stage_requirements`) **явно назван «паттерн Zoho Blueprint, урезанный до v1»** — это не абстрактный бенчмарк, а **уже частично реализованный контракт**.

---

## 1. Zoho CRM в 2026 — позиционирование и архитектура

### 1.1 Слоган и стратегия

Zoho позиционирует CRM как **«It's easy to grow»** — контекстная AI (Zia) + продуманный UI, 360°-вид клиента, масштабирование sales без enterprise-оверхода.

Ключевые концепции (с [zoho.com/crm](https://www.zoho.com/crm/), [features](https://www.zoho.com/crm/features.html)):

```
Zoho CRM (ядро)
├── Стандартные модули (org-level)
│   ├── Leads · Contacts · Accounts · Deals (Potentials)
│   ├── Activities (Tasks, Calls, Meetings)
│   ├── Products · Quotes · Sales Orders · Invoices  🔒 Pro+
│   └── Cases · Solutions  🔒 Pro+
├── Процессный слой
│   ├── Workflow Rules — when → then (реактивная автоматизация)
│   ├── Blueprint — states + transitions + Before/During/After  🔒 Pro+
│   ├── Cadences — multi-channel follow-up sequences  🔒 Standard+
│   ├── CommandCenter — cross-module journeys  🔒 Enterprise+
│   └── Approval / Review Process  🔒 Enterprise+
├── Кастомизация
│   ├── Custom Modules · Page Layouts · Canvas (drag-drop UI)
│   ├── Multiple Pipelines (Deals)  🔒 Standard: 5, Ent: 50
│   └── Validation Rules · Lookup fields · Kiosk Studio
├── AI (Zia)
│   ├── Scoring · Prediction · Anomaly · Enrichment  🔒 Enterprise+
│   ├── Call transcription · Email intelligence
│   └── Agentic AI (SDR, Deal Analyzer, Quote Generator…)  🔒 Enterprise+
└── Zoho Suite integrations
    ├── Zoho Projects — deal → project handoff
    ├── Zoho Books / Inventory — quote-to-cash
    ├── Zoho Desk — support cases
    └── Zoho Flow / Marketplace — 1000+ apps
```

**Главное отличие от HubSpot:** Zoho — не Smart CRM platform-first, а **модульная CRM + отдельные tier-gated process layers**. Blueprint и Workflow — разные инструменты с разной философией (см. §4).

**Главное отличие от Monday:** Zoho — **object-centric** (Leads/Deals/Contacts), delivery через **отдельное приложение Zoho Projects**, не board-native Work OS.

**Главное отличие от Accelo:** Zoho не PSA; quote→project есть через модули + интеграции, но нет time→invoice в одном контуре.

### 1.2 Заявленные метрики (маркетинг, 2026)

| Метрика | Значение |
|---------|----------|
| Пользователи (экосистема) | 100M+ «superheroes» (вся Zoho, не только CRM) |
| Клиенты CRM | 250,000+ businesses |
| Gartner MQ 2024 | Visionary — SFA Automation Platforms |
| Nucleus Research 2024 | Leader, SFA Technology Value Matrix |
| ROI (internal survey) | 27% productivity · 50% faster implementation · 71% license savings |
| Integrations | 1000+ (Marketplace) |

### 1.3 Ценовая модель (2026)

Источники: [pricing](https://www.zoho.com/crm/pricing.html), [complete-feature-list](https://www.zoho.com/crm/complete-feature-list.html) (INR, июль 2026; USD-эквиваленты из partner summaries ~$14/$23/$40/$52 annual).

| Plan | Цена (annual, INR) | USD (partner est.) | Ключевое |
|------|-------------------|-------------------|----------|
| **Free** | ₹0, 3 users | $0 | Leads, documents, mobile; 5K records |
| **Standard** | ₹800/user/mo | ~$14 | Workflows, Cadences, Canvas, 5 pipelines, bulk email |
| **Professional** | ₹1,400/user/mo | ~$23 | **Blueprint**, CPQ, Inventory, Validation Rules, Webhooks |
| **Enterprise** | ₹2,400/user/mo | ~$40 | **Full Zia**, CommandCenter, Territories, Sandbox |
| **Ultimate** | ₹2,600/user/mo | ~$52 | Extended AI, data prep, highest limits |

**Team Users** (CRM for Everyone, add-on): ₹2,600/team user — частичный доступ для legal/finance/marketing без full CRM seat.

**Ограничения vs dashboard-crm:**
- Blueprint 🔒 Professional+ ($23/user) — у нас stage gates **без tier**
- Zia agents 🔒 Enterprise+ ($40/user)
- CommandCenter journeys 🔒 Enterprise+
- Workflow limits: 2500 org-wide, но 5–150 active rules/module по tier
- Data storage caps (10GB Enterprise) — у нас Postgres без record caps

**Инсайт для позиционирования:** команда 5 на Zoho Professional (нужен Blueprint) = ~$115/mo; Enterprise (Zia) = ~$200/mo. dashboard-crm — внутренний инструмент: **Blueprint-уровень гейтов и automation без seat tax**.

---

## 2. Модель данных Zoho CRM

### 2.1 Стандартные модули

| Zoho Module | API name | Назначение | Ключевые поля/связи |
|-------------|----------|------------|---------------------|
| **Leads** | Leads | Top-of-funnel | Lead_Status, scoring, conversion |
| **Contacts** | Contacts | Люди | Account lookup, Activities |
| **Accounts** | Accounts | Компании | Parent/child hierarchy, Deals rollup |
| **Deals** | Potentials | Pipeline | Stage, Amount, Pipeline, Probability |
| **Activities** | Tasks/Calls/Events | Действия | Related To (polymorphic) |
| **Quotes** | Quotes | КП | Quote_Stage, line items, link to Deal 🔒 Pro+ |
| **Products** | Products | Каталог | CPQ rules 🔒 Pro+ |
| **Projects** | (Zoho Projects app) | Delivery | Tasks, milestones, linked Deal |

**Multiple Pipelines** (Deals only): Standard 5 · Professional 10 · Enterprise 20 · Ultimate 50. Каждый pipeline — свой набор stages; Blueprint может быть **per pipeline** ([Blueprint API](https://www.zoho.com/crm/developer/docs/api/v8/blueprints.html): `pipeline` object in config).

### 2.2 Custom Modules и layouts

- **Custom Modules:** Pro 10 · Enterprise 200 · Ultimate 500
- **Page Layouts:** per module, per process (Enterprise 6 layouts/module)
- **Lookup fields:** связь модулей (аналог FK + related lists)
- **Subforms:** line items в Quotes, nested data

**У нас:** фиксированная схема через миграции — **➕ schema truth**, не admin-sprawl. Zoho гибче для citizen developers, **слабее для vertical domain** (1С:ДО, ЧЗ).

### 2.3 360° Account View

Из [deal-management](https://www.zoho.com/crm/deal-management.html): Account card агрегирует **contacts, deals, projects** — «bigger picture, not just pixels».

**Маппинг:** `companies` detail + related `projects(client)` + `projects(delivery)` — **🟡 паритет intent**, gap в unified 360° card (см. monday-analysis P1).

### 2.4 Маппинг на dashboard-crm

| Zoho CRM | dashboard-crm | Комментарий |
|----------|---------------|-------------|
| Leads | `leads` + `convert_lead` | ➕ convert без tier |
| Contacts | `contacts` | ✅ |
| Accounts | `companies` | ✅ |
| Deals (Potentials) | `projects` WHERE `type='client'` | 🟡 одна таблица vs модуль Deals |
| Multiple Pipelines | `pipelines` by `direction` (ЧЗ/ERP/IIoT) | ✅ **паритет** |
| Pipeline Stages | `pipeline_stages` | ✅ |
| Activities | `tasks` + `calls` + `meetings` | 🟡 раздельные таблицы |
| Quotes / CPQ | ❌ (КП вне CRM) | gap |
| Zoho Projects | `projects` WHERE `type='delivery'` | ✅ intent; Zoho — отдельное app |
| Custom Modules | ❌ | сознательно |
| Lookup / Related lists | FK + UI sections | 🟡 |
| Canvas detail views | project detail page | UX gap |

---

## 3. Blueprint — ядро процессного контроля

### 3.1 Что такое Blueprint

[Blueprint](https://www.zoho.com/crm/blueprint.html) — **визуальный процесс**, привязанный к **picklist-полю** (обычно Deals → Stage). Заменяет свободное изменение stage на **transition buttons**.

```
Blueprint (например "Deal Process")
├── Entry criteria — какие deals входят (Deal Type = New Business)
├── States — значения picklist (Qualification, Proposal, Closed Won…)
├── Transitions — рёбра между states
│   ├── Before — кто видит кнопку (owner, role, criteria)
│   ├── During — что ввести при клике (fields, tasks, attachments, checklist)
│   └── After — автоматизация (field update, email, task, webhook, function)
├── Common Transitions — из любого state (Closed Lost)
├── State Escalation — SLA alerts если record застрял в state
└── Continuous mode — для Quote Stage (непрерывный процесс)
```

**Критический UX-инсайт** ([Zenatta 2026](https://zenatta.com/zoho-crm-blueprints-2026/)): при входе в Blueprint поле Stage **блокируется** — rep не может «перетащить» deal мимо процесса. Transition names — **глаголы** («Start Discovery»), не названия стадий.

### 3.2 During inputs — типы (API v8)

`during_inputs` в [Blueprint API](https://www.zoho.com/crm/developer/docs/api/v8/blueprints.html):

| Type | Назначение |
|------|------------|
| `field` | Обязательные/опциональные поля |
| `related_list` | Связанные записи |
| `attachment` | Файлы |
| `checklist` | Blueprint-only чеклист (≠ CRM task) |
| `notes` | Заметка при переходе |
| `task` | Создать задачу |
| `widget` / `kiosk` | Advanced UI 🔒 |

**Validation:** `validation_filter` + `validation_message` — блокирует transition.

### 3.3 After actions — типы

| Action | Пример |
|--------|--------|
| `field_updates` | Stamp Proposal Date = Today+45 |
| `tasks` | Стандартный follow-up task |
| `email_notifications` | Notify legal/finance |
| `webhooks` | Вызов Zoho Projects API → create project |
| `functions` | Deluge custom code |
| `convert` | Lead → Contact/Deal |

### 3.4 Workflows vs Blueprints

Консенсус [TechnoMap 2025](https://www.technomap.org/blogs/post/workflows-vs-blueprints-in-zoho-crm-when-to-automate-and-when-to-guide):

| | Workflow | Blueprint |
|---|----------|-----------|
| **Триггер** | Record event, date, score | Human clicks transition |
| **Контроль** | Автоматически | Guided + mandatory |
| **Лучше для** | Nurturing, reminders, routing | Stage movement, qualification, QC |
| **Риск** | «Set and forget» | Over-engineering → «spiderweb» |

**Рекомендация Zoho-партнёров:** гибкий процесс (skip stages норма) → Workflow on stage change; строгий процесс → Blueprint.

### 3.5 Наш Blueprint v1 (S27) — что уже есть

Из `_analysis/sprint-27-stage-gates.md` и `docs/schema.md`:

```
stage_requirements (org-scoped config)
  → check_stage_requirements(project_id, target_stage_id)
  → trg_aa_enforce_stage_gate (BEFORE UPDATE on projects)
```

| Zoho Blueprint | dashboard-crm S27 | Gap |
|----------------|-------------------|-----|
| States = picklist values | `pipeline_stages` | ✅ |
| During: required fields | `requirement_type='field'` | ✅ |
| During: attachments | `requirement_type='file'` | ✅ |
| Before: owner/role | ❌ (все с правом edit) | gap v2 |
| During: transition modal | 🟡 toast + peek checklist | UX gap |
| After: auto actions | 🟡 S29 `create_task` only | **главный gap** |
| Common transition (Lost) | is_lost stages | 🟡 |
| State escalation / SLA | 🟡 `deal-health.ts` rotting | другая модель |
| Stage field lock | 🟡 DB trigger blocks | ✅ enforcement |
| Blueprint per pipeline | per `pipeline_id` in config | ✅ |
| Work Queue for transitions | ➕ TodayView | другой паттерн |

**Вывод:** S27 — **аутентичный Blueprint subset**: гейты на вход в стадию с DB enforcement. Не хватает **transition UX** (During modal) и **After automation breadth**.

---

## 4. Стек автоматизации — четыре уровня

По [Digital Applied Agentic Playbook 2026](https://www.digitalapplied.com/blog/zoho-agentic-crm-automation-2026-smb-playbook) — лучшая карта Zoho automation:

```
Tier 1: Workflow Rules + Assignment Rules     🔒 Standard+
  → reactive: on create/edit/date/score
  → instant + scheduled actions
  → webhooks, functions (Enterprise)

Tier 2: Blueprint                             🔒 Professional+
  → process enforcement on picklist
  → Before/During/After per transition

Tier 3: CommandCenter (Journey Builder)       🔒 Enterprise+
  → cross-module states, signal triggers
  → email opens, web visits, deadlines per transition

Tier 4: Zia Agents (Agent Studio)             🔒 Enterprise+
  → autonomous: SDR, Deal Analyzer, Quote Generator
  → digital employee identity in Zoho Directory
  → 700+ actions, token billing above free tier
```

### 4.1 Workflow Rules — детали

[Workflow rules](https://www.zoho.com/crm/workflow-rules.html):

- **Triggers:** create/edit/delete, date/time, score change, recommendation, notes
- **Conditions:** 5 (Std/Pro) · 10 (Ent/Ult) per rule
- **Actions:** email, task, field update, webhook, assign owner, create record, convert
- **Scheduled actions:** до 5 per condition; date rules — 5000 records/10 min
- **Limits:** 2500 rules org-wide; active per module: 5→100 by tier
- **Zia assist:** «Ask Zia» — NL → workflow config; macro suggestions from audit logs

**У нас (S29):**
```
trigger: stage_entered → action: create_task (1×1, no UI builder)
```

**Gap:** Zoho Std+ даёт **полноценный workflow builder** без Enterprise. Наш S29 — **~5% от Zoho Workflow**.

### 4.2 Cadences — sales sequences

[Cadences](https://www.zoho.com/crm/cadences.html) — multi-channel follow-up (email + call + task):

| Tier | Limits |
|------|--------|
| Standard | 9 cadences, 6 emails + 3 task follow-ups |
| Professional | 15 cadences |
| Enterprise | 150 cadences |
| Ultimate | 300 cadences |

Q1 2026: **WhatsApp в Cadences** ([ABR Q1 2026](https://www.amazingbusinessresults.com/zoho-q1-2026-updates/)).

**У нас:** ❌ sequences (нет email-контура). Close/HubSpot сильнее; Zoho — **affordable reference**.

### 4.3 CommandCenter

[CommandCenter](https://www.zoho.com/crm/commandcenter/): PathFinder (discover journeys) + Journey Builder (visual cross-module). Deadline enforcement per transition — **чего нет в Blueprint**.

**Для нас:** overkill для команды 5–15; инсайт — **cross-module nurture** если появится marketing.

### 4.4 Zia Agents (2025–2026)

[Agentic AI](https://www.zoho.com/crm/zia/agentic-ai.html) — prebuilt agents:

| Agent | Функция |
|-------|---------|
| SDR Agent | Nurture leads, objections, schedule meetings |
| Deal Analyzer | Win probability, next best action |
| Follow-up Scheduler | Stalled deals outreach |
| Quote Generator | Instant quotes from deal context |
| Sales Coach | Train/test reps |
| Lost Deal Analyzer | Top-3 loss reasons report |
| Closure Reminder | Summary 3 days before close |

**Zia LLM** (July 2025): 1.3B/2.6B/7B on Zoho servers; Agent Studio prompt-based; MCP server published.

**У нас:** AI Hub — **➕ доменные пресеты** (SPIN, протокол, аналит. записка), не generic SDR agents. **➕ без token billing**. Gap: **post-call field suggest HITL** (все бенчмарки 2026).

---

## 5. Deal → Project handoff (delivery)

### 5.1 Zoho Projects интеграция

[Project management](https://www.zoho.com/crm/project-management.html):

1. **Deal closed** → workflow/Blueprint After action → create project in Zoho Projects
2. **Bidirectional sync:** CRM calls/meetings → project feed; project status visible on Account
3. **Client portal:** customers as project users
4. **Account 360:** sales sees all client projects + progress

Community pattern ([help.zoho.com topics](https://help.zoho.com/portal/en/community/topic/creating-zoho-project-when-a-deal-is-won)): Workflow on Deal Stage = Closed Won → **Create Project** + map fields + notify PM.

**Отличие от Monday:** Zoho — **два приложения** (CRM + Projects), связь через integration/workflow; Monday — board spawn на той же платформе.

**Отличие от нас:** Zoho Projects — generic PM (tasks, timesheets, forums); у нас — **domain delivery board** (phase columns, `tasks.lane`, `delivery_templates` 1С:ДО/ERP).

### 5.2 CPQ / Quotes layer

[CPQ](https://www.zoho.com/crm/cpq.html) 🔒 Professional+ (Early Access 2026):

- Product rules, volume pricing, line-item automation
- Quotes dashboard: stalled quotes, closing soon
- Native modules: Products → Quotes → Sales Orders → Invoices

**У нас:** КП (kp-master) вне CRM — **тройной gap** (HubSpot, Monday, Zoho, Accelo).

### 5.3 У нас (delivery P1–P3)

```
companies
  └── projects(type='client') — pipeline + stage gates (Blueprint v1)
        └── [won] → spawn_delivery_project RPC (ручной HITL)
              └── projects(type='delivery')
                    ├── project_columns (category='phase')
                    ├── delivery_templates
                    └── tasks + is_milestone gates
```

| Паттерн | Zoho | dashboard-crm |
|---------|------|---------------|
| Разделение sales/delivery | CRM + Projects apps | `type=client\|delivery` | ✅ intent |
| Auto-create on won | Workflow (настраивается) | 🟡 ручной RPC | gap P0 |
| Domain templates | Generic PM templates | ➕ `delivery_templates` | ➕ |
| Phase ≠ status | Zoho Projects milestones | phase columns + `tasks.lane` | ✅ |
| Quote before delivery | CPQ native | ❌ | gap |

---

## 6. AI-стратегия Zoho vs AI Hub

| Zoho (2026) | dashboard-crm | Вердикт |
|-------------|---------------|---------|
| Zia scoring/prediction | 🟡 `deal-health.ts` | ➕ native rotting без 75-lead minimum |
| Lead/deal scoring ML | ❌ | Gap (низкий приоритет при малой базе) |
| Call transcription → fields | `transcripts`, `ai_runs` | 🟡 паритет foundation |
| Email intelligence | ❌ | Gap (нет email) |
| SDR / Calling agents | ❌ | Сознательно не копируем |
| Quote Generator agent | ❌ (КП вне CRM) | Gap |
| Generative AI (Canvas, modules) | ❌ | Overkill |
| Domain presets (SPIN, протокол) | AI Hub | ➕ **уникально** |
| Token billing | ❌ | Внутренний инструмент |

**Q1 2026 Zia updates** ([ABR](https://www.amazingbusinessresults.com/zoho-q1-2026-updates/)): conversation summaries, Smart Prompts, faster Blueprint UI, data enrichment refresh.

---

## 7. Sales Workspace vs TodayView

| Аспект | Zoho CRM | dashboard-crm |
|--------|----------|---------------|
| Work Queue (Blueprint jobs) | ✅ per transition | 🟡 нет explicit queue |
| Today / action inbox | 🟡 Activities + dashboards | ➕ TodayView (`/`) |
| Deal rotting | Zia + workflows | ➕ `deal-health.ts` native |
| Cadences / sequences | ✅ 🔒 Standard+ | ❌ |
| Cmd+K | 🟡 Zia chat / search | ➕ CommandPalette |
| Reconnect | Zia best time to contact | ➕ `use-last-touch` + Today |
| Mobile CRM | ✅ native apps | 🟡 responsive web |
| Team Users (legal/finance) | ✅ partial CRM access | 🟡 roles owner/admin/manager/viewer |

---

## 8. Gap-матрица: dashboard-crm vs Zoho CRM

### 8.1 Где dashboard-crm **сильнее** Zoho

| Возможность | Почему |
|-------------|--------|
| **Stage gates без tier** | Zoho Blueprint 🔒 Pro $23+; у нас с S27 для всех |
| **DB enforcement гейтов** | Zoho — UI/API validation; у нас `trg_aa_enforce_stage_gate` |
| **Vertical pipelines** (ЧЗ, ERP, experiment) | Zoho — generic multi-pipeline |
| **Delivery templates 1С:ДО/ERP** | Zoho Projects — generic PM |
| **TodayView action queue** | Zoho — fragmented modules/dashboards |
| **Domain AI presets** | Zoho — generic Zia |
| **Schema через миграции** | Zoho — admin-config sprawl |
| **No seat minimum / storage caps** | Zoho Free 3 users, storage tiers |
| **Milestone gates delivery** | `is_milestone` + `check_delivery_completion` |

### 8.2 Ядро CRM

| Возможность | Zoho CRM | dashboard-crm | Gap |
|-------------|----------|---------------|-----|
| Leads + convert | ✅ | ✅ | ➕ |
| Contacts / Companies | ✅ | ✅ | паритет |
| Deals / Pipeline | ✅ multi-pipeline | ✅ `projects(client)` | паритет |
| Stage enforcement | ✅ Blueprint | ✅ stage_requirements | **➕ сильнее на tier** |
| Activity model | ✅ unified Activities | 🟡 split tables | низкий |
| Email in CRM | ✅ | ❌ | gap |
| Quotes / CPQ | ✅ 🔒 Pro+ | ❌ | gap |
| Files on deal | ✅ | ✅ `project_files` | паритет |
| 360° account view | ✅ | 🟡 | UX gap |

### 8.3 Automation

| Возможность | Zoho CRM | dashboard-crm | Gap |
|-------------|----------|---------------|-----|
| Workflow builder | ✅ 30–150 rules/module | 🟡 S29: 1×1 | **главный разрыв** |
| Blueprint transitions UI | ✅ During modal | 🟡 toast + checklist | UX gap |
| After transition actions | ✅ 10+ action types | 🟡 create_task | gap |
| Cadences / sequences | ✅ | ❌ | нужен email |
| Webhooks | ✅ 🔒 Pro+ | ❌ | средний |
| State escalation SLA | ✅ Blueprint | 🟡 deal-health | другая модель |
| CommandCenter journeys | ✅ 🔒 Ent | ❌ | не нужно v1 |
| Zia workflow suggestions | ✅ | ❌ | низкий |

### 8.4 Delivery

| Возможность | Zoho CRM | dashboard-crm | Gap |
|-------------|----------|---------------|-----|
| Deal → project | ✅ Zoho Projects | 🟡 `spawn_delivery_project` | auto-spawn |
| Phase board | ✅ Projects tasks | ✅ phase + lane | паритет |
| Domain templates | ❌ generic | ➕ delivery_templates | ➕ |
| CPQ → project | ✅ | ❌ | gap |
| Client portal | ✅ Projects | ❌ | опционально |
| PSA / billing | 🟡 Books | ❌ (1С) | сознательно |

---

## 9. Архитектурное сравнение

```
Zoho CRM (modular SaaS)              dashboard-crm (relational vertical)
──────────────────────              ─────────────────────────────────
Leads ───────────────────            leads
Contacts ────────────────            contacts
Accounts ────────────────            companies
Deals (Potentials) ──────┐           projects (type=client)
  Blueprint on Stage     │ won
  Workflow on Stage      │
Zoho Projects (app) ─────┘           projects (type=delivery)
  tasks/milestones                     project_columns (phase)
                                       tasks (lane)

Workflow Rules (when→then)           automation_rules (stage_entered→task)
Blueprint (transition graph)         stage_requirements + enforce trigger
CommandCenter (journeys)             ❌
Zia Agents                           AI Hub (domain presets)
Quotes/CPQ                           ❌ (kp-master external)
```

**Ключевой архитектурный инсайт:** dashboard-crm **уже реализует Blueprint v1** (S27). Zoho подтверждает: **отдельный process layer поверх stage picklist** — правильная архитектура. Следующий шаг — не «внедрить Blueprint», а **расширить до Blueprint v2/v3** (transition UX + After actions) и **Workflow breadth** (S29+).

---

## 10. Приоритеты для dashboard-crm

Отфильтровано под домен (продажи маркировки + внедрения 1С/ЧЗ). Пересечения с hubspot/monday/accelo отмечены.

### P0 — Automation v2: расширить action types (~0.5 спринта)

**Референс Zoho:** Blueprint After + Workflow actions.

Расширить `automation_rules` beyond `create_task`:
```
action_type: notify | update_field | spawn_delivery (HITL)
```

Priority: `stage_entered(won) → suggest spawn_delivery` (*дублирует monday P0, accelo P0*).

### P1 — Blueprint v2: Transition Modal (~0.4 спринта)

**Референс Zoho:** Blueprint During — modal с fields, attachments, checklist.

При смене стадии в PipelineBoard:
1. Показать `StageReadiness` checklist (уже есть)
2. **Добавить transition modal** для обязательных полей (не только toast на блок)
3. Common transition «Проиграна» с reason field

*Дублирует accelo P1 (Progression modal), monday P6.*

### P2 — Stage escalation / dwell alerts (~0.3 спринта)

**Референс Zoho:** Blueprint `state_escalation` — notify manager if deal in stage > N days.

Расширить `deal-health.ts`:
```
stage_dwell_exceeded(stage_id, days) → TodayView + optional notify
```

### P3 — Workflow trigger breadth (~0.5 спринта)

**Референс Zoho Tier 1:** не только `stage_entered`, но `field_changed`, `deal_stale`.

Без visual builder — 3–5 typed triggers в `automation_rules`:
- `stage_entered` (есть)
- `days_in_stage`
- `deal_won`

### P4 — Quote/КП record linked to deal (~0.5 спринта)

**Референс Zoho CPQ:** Quotes module linked to Deal.

*Дублирует hubspot P4, monday P3, accelo P2.*

### P5 — Smart progression / transcript HITL (~0.5 спринта)

**Референс Zoho:** call transcription → field suggestions.

*Дублирует hubspot P0, attio P0.*

### P6 — 360° company card: sales + delivery (~0.4 спринта)

**Референс Zoho Account view:** deals + projects в одном экране.

*Дублирует monday P1.*

### P7 — Cadence-like task sequences (без email) (~0.3 спринта)

**Референс Zoho Cadences:** упрощённо — цепочка `create_task` с delays при входе в стадию (task day 0, +3, +7).

Только task-based до появления email-контура.

### Отложить

- CommandCenter / Journey Builder
- Zia Agents (SDR, Quote Generator)
- Canvas drag-drop UI builder
- Custom Modules / citizen development
- Zoho Projects parity (timesheets, forums, client portal)
- Full CPQ product rules
- Webhooks to external apps (пока нет интеграций)
- Team Users licensing model
- Territory management
- Sandbox / multi-layout per module

---

## 11. Zoho vs HubSpot vs Monday — что брать от кого

| Паттерн | Лучший референс | Почему |
|---------|----------------|--------|
| Stage gates / Blueprint | **Мы** ← Zoho | S27 уже в коде; Zoho — UX-эталон transition |
| Workflow engine breadth | **HubSpot** > Zoho > мы | Zoho Std+ щедрее нашего S29 |
| After-transition automation | **Zoho Blueprint** | During/After — лучший гайд для S29+ |
| Deal → project handoff | Monday > Zoho > мы | Monday board spawn; Zoho — workflow→Projects |
| Delivery phase board | **Мы** + Monday | Domain templates |
| Quote/CPQ layer | Zoho ≈ Accelo > Monday > мы | Zoho CPQ 🔒 Pro |
| Sales sequences | Close > Zoho Cadences > мы | Zoho affordable reference |
| AI post-meeting HITL | Все (2026) | Один раз в AI Hub |
| Action inbox | **Мы** (TodayView) | Zoho Work Queue — другой паттерн |
| Process tier progression | **Zoho** (4-tier stack) | Карта зрелости automation |
| Enterprise expectations | Salesforce > HubSpot | Zoho — SMB sweet spot |

---

## 12. Что сознательно НЕ копировать

- Zoho ecosystem lock-in (CRM + Projects + Books + Desk + Flow)
- 2500 workflow rules / Blueprint spiderweb (Zenatta warning)
- Blueprint lock-down если процесс реально гибкий (skip stages) — у нас experiment pipeline
- Zia SDR / autonomous outbound agents
- CommandCenter для команды <15
- Tier gating как продуктовая модель (Blueprint Pro, Zia Enterprise)
- Canvas / Kiosk / Custom Modules admin-sprawl
- Storage caps и record limits
- Team Users как отдельная лицензия (у нас roles в memberships)
- Timesheets / invoicing в Projects (1С:ДО)
- «CRM как конструктор» — у нас vertical CRM с миграциями

---

## 13. Итоговый вывод

**Zoho CRM — эталон #1 по stage-gate процессу (Blueprint) и по карте зрелости automation** для SMB без HubSpot-бюджета. В `crm-benchmark-candidates` указана сила: **automation без tier-ада, project-like deals**. Анализ **подтверждает и углубляет**: S27 `stage_requirements` — **не случайный выбор**, а осознанный Blueprint v1.

**Где мы уже на уровне Zoho (или сильнее):**
- Stage gates с DB enforcement (S27) — **сильнее** (нет 🔒 Pro)
- Multiple pipelines по направлениям
- Delivery templates + phase board (глубже Zoho Projects generic)
- TodayView + native deal health
- Domain AI Hub

**Оставшиеся разрывы (по убыванию ROI):**
1. **Automation breadth** (S29 → v2/v3) — Zoho Std даёт 30–80 workflow rules/module; у нас 1×1
2. **Blueprint transition UX** (During modal) — Zoho блокирует stage и ведёт через кнопки
3. **After-transition actions** — notify, field stamp, spawn_delivery
4. **Auto-spawn delivery on won** — Zoho через Workflow→Projects (*monday P0*)
5. **Quote/КП в CRM** — Zoho CPQ 🔒 Pro (*сквозной gap*)
6. **Cadences** — при появлении email

**Стратегия:** брать у Zoho **Blueprint During/After как roadmap для S27+S29**, **4-tier automation map как план зрелости**, **CPQ/Quotes как контракт объекта КП** — не Zoho ecosystem целиком. Delivery handoff и phase UX — по-прежнему Monday; workflow breadth — HubSpot; PSA — Accelo.

**Следующий кандидат в очереди бенчмарков (вне этого анализа):** folk (IA), Affinity (relationship scoring), Productive.io (agency PSA) — по `crm-benchmark-candidates`.

---

## 14. Источники

### Zoho CRM (официальные, спарсено 2026-07-12)

- [Zoho CRM homepage](https://www.zoho.com/crm/)
- [Features](https://www.zoho.com/crm/features.html)
- [Pricing](https://www.zoho.com/crm/pricing.html)
- [Complete feature list / edition comparison](https://www.zoho.com/crm/complete-feature-list.html)
- [Blueprint](https://www.zoho.com/crm/blueprint.html)
- [Workflow rules](https://www.zoho.com/crm/workflow-rules.html)
- [Deal / Pipeline management](https://www.zoho.com/crm/deal-management.html)
- [Cadences](https://www.zoho.com/crm/cadences.html)
- [CPQ](https://www.zoho.com/crm/cpq.html)
- [CommandCenter](https://www.zoho.com/crm/commandcenter/)
- [Project management + Zoho Projects](https://www.zoho.com/crm/project-management.html)
- [Zia / AI hub](https://www.zoho.com/crm/zia.html)
- [Zia Agentic AI](https://www.zoho.com/crm/zia/agentic-ai.html)
- [Release notes](https://www.zoho.com/crm/whats-new/release-notes.html)
- [Blueprint API v8](https://www.zoho.com/crm/developer/docs/api/v8/blueprints.html)

### Сторонние обзоры и гайды

- [Zenatta — Zoho CRM Blueprint Tutorial 2026](https://zenatta.com/zoho-crm-blueprints-2026/) (март 2026)
- [TechnoMap — Workflows vs Blueprints](https://www.technomap.org/blogs/post/workflows-vs-blueprints-in-zoho-crm-when-to-automate-and-when-to-guide) (май 2025)
- [Digital Applied — Zoho Agentic CRM Automation 2026 SMB Playbook](https://www.digitalapplied.com/blog/zoho-agentic-crm-automation-2026-smb-playbook) (июнь 2026)
- [Amazing Business Results — Zoho Q1 2026 Updates](https://www.amazingbusinessresults.com/zoho-q1-2026-updates/)
- [SaaS CRM Review — Zoho CRM 2026](https://saascrmreview.com/zoho-crm-review/)

### dashboard-crm (репозиторий)

- `improvements/CRMs/crm-benchmark-candidates-2026-07-12.md` — Tier 1 Zoho
- `_analysis/sprint-27-stage-gates.md` — Blueprint v1 prompt
- `_analysis/sprint-29-automation.md` — automation v1
- `docs/schema.md` — stage_requirements, automation_rules, spawn_delivery_project
- `improvements/CRMs/monday-analysis-2026-07-12.md` — delivery handoff
- `improvements/hubspot-analysis-2026-07-12.md` — workflow breadth
- `improvements/accelo-analysis-2026-07-12.md` — PSA / quote→project
- `src/lib/utils/deal-health.ts` — rotting native
- `src/components/today/TodayView.tsx` — action inbox