# Productive.io PSA — комплексный анализ и инсайты для dashboard-crm

**Дата:** 2026-07-12  
**Метод:** парсинг productive.io (homepage, pricing, sales, project-management, productive-ai, IT Services vertical), Help Center (sales, projects, budgets, automations, proposals, deal aging, workflows, templates), developer.productive.io (API v2, CRM domain), сопоставление с кодовой базой dashboard-crm.  
**Связанные документы:** `improvements/CRMs/crm-benchmark-candidates-2026-07-12.md` (Tier 3 — agency PSA), `improvements/accelo-analysis-2026-07-12.md`, `improvements/CRMs/monday-analysis-2026-07-12.md`, `improvements/hubspot-analysis-2026-07-12.md`, `_analysis/architecture-delivery-p2.md`.

---

## 0. Как читать этот документ

| Символ | Значение |
|--------|----------|
| ✅ | Паритет или сильная альтернатива |
| 🟡 | Частично / другая модель |
| ❌ | Нет |
| ➕ | Есть у нас, у Productive нет «из коробки» или слабее |
| 🔒 | Требует платного tier Productive |

**Контекст:** Productive.io — **PSA + CRM** для агентств, IT-интеграторов и консалтинга (10–150 человек). dashboard-crm — **вертикальная CRM** под продажи и внедрения маркировки (1С:ERP, Честный Знак). Productive — **ближайший бенчмарк по связке «сделка → бюджет → проект» с шаблонами и финансовым контуром**, сильнее Monday по quote-to-delivery, легче Accelo по UX и pricing.

---

## 1. Productive в 2026 — позиционирование и архитектура

### 1.1 Слоган и стратегия

Productive позиционируется как **«Run Resources, Projects, Finances — in One Platform»** (релиз **Productive 5.0**, «New Standard of Work») — единая PSA для professional services с agentic AI (Marble engine).

Ключевые концепции (с [productive.io](https://productive.io), [sales](https://productive.io/sales), [project-management](https://productive.io/project-management)):

```
Productive PSA Lifecycle
├── CRM / Sales
│   ├── Companies, Contacts (People)
│   ├── Deals — pipeline stages, services, proposals
│   ├── Deal Templates — predefined services + pricing
│   └── Deal aging, funnel reports, lost reasons
├── Financials
│   ├── Budgets — fixed / T&M / hybrid / recurring / retainer
│   ├── Budget Templates
│   ├── Origin Deal link (briefcase icon)
│   └── Invoicing → Xero / QuickBooks / Sage…
├── Projects
│   ├── Tasks, Task Lists, Folders, Dependencies
│   ├── Workflows (status columns, 3 stages)
│   ├── Project Templates (+ embedded automations Beta)
│   └── 7 layouts: List, Board, Table, Gantt, Timeline, Calendar, Workload
├── Resource Management
│   ├── Bookings (tentative → confirmed)
│   ├── Placeholders, Skills
│   └── Utilization / capacity forecasts
├── Time Tracking
│   ├── Timer, timesheets, AI time suggestions
│   └── Billable approvals 🔒 Pro+
└── AI layer (Productive 5.0)
    ├── Agents, Skills, Connectors, MCP Server
    ├── Notetaker → tasks
    ├── Report Intelligence, Pipeline/Project summaries
    └── AI Automation builder (NL → rule draft)
```

**Главное отличие от HubSpot/Attio:** Productive — не Smart CRM, а **quote-to-cash PSA** с встроенным CRM-слоем. Продажа = Deal с services; исполнение = Budget + Project.

**Главное отличие от Monday:** Monday — board-centric handoff без финансов; Productive — **deal → budget → project wizard** с переносом services, time, bookings.

**Главное отличие от Accelo:** Productive — **публичные цены**, современный UX, Template Center; Accelo — progressions, tickets, opaque enterprise PSA. Productive активно позиционируется как **Accelo alternative** (блог дек 2025, кейс Contra Agency).

### 1.2 Заявленные метрики (маркетинг, 2026)

| Метрика | Значение |
|---------|----------|
| Клиенты | 1,800+ companies |
| Uptime | 100% (заявлено за год) |
| Кейсы | +10% billable utilization (Hike One), 50%→70% performance (Dot Control) |
| Compliance | SOC 2 Type II, GDPR |
| Integrations | Slack, HubSpot, Jira, Zapier, 10+ accounting/HRIS |

### 1.3 Ценовая модель (2026)

Источник: [productive.io/pricing](https://productive.io/pricing) (спарсено 2026-07-12).

| Plan | Цена (annual) | Ключевое |
|------|---------------|----------|
| **Essential** | $10/seat/mo | Budgeting, PM, time, expenses, reporting, 5 custom fields, API, AI Assistant, AI time tracking |
| **Professional** | $25/seat/mo | Rate cards, recurring budgets, deal templates 🔒, advanced reports, billable approvals, 3 pipelines |
| **Ultimate** | $33/seat/mo | Revenue forecasting, Scenario Builder, HubSpot sync, webhooks, Agents, Connectors, 5 pipelines |

**Ограничения:**
- Минимум **3 seats** на всех планах (команда 5 = $50/mo Essential annual)
- 14-day trial, no free tier
- **Deal templates** — 🔒 Professional+
- **Deal proposals** (e-sign, link share) — 🔒 Professional+; analytics — 🔒 Ultimate
- **HubSpot integration** — 🔒 Ultimate
- **Automations:** 100 / 1,000 / 5,000 actions/mo
- **Workflows:** 2 / 5 / 10 per org
- **Pipelines:** 1 / 3 / 5
- Клиенты в workspace — **бесплатно** (не считаются в seats)

**Инсайт для позиционирования:** команда 5 на Professional = $125/mo + 3-seat floor. dashboard-crm — внутренний инструмент без seat minimum, tier-gating и PSA-оверхода.

### 1.4 Вертикаль IT Services

[IT Services page](https://productive.io/industries/it-project-management-software) явно таргетирует **IT-интеграторов**:
- Allocate by skills & availability
- Deliver on time and under budget
- Scenario building для SOW
- Billable utilization, budget usage, forecasted revenue reports

**Релевантность для нас:** ближе к домену 1С/внедрений, чем generic agency CRM, но без вертикали ERP/маркировки.

---

## 2. Объектная модель Productive

### 2.1 CRM-слой

Верифицировано по Help Center Sales + [API CRM domain](https://developer.productive.io/reference/categories/crm):

| Productive объект | Назначение |
|-------------------|------------|
| **Companies** | Клиентские организации + invoicing defaults |
| **People / Contacts** | Люди, contact entries |
| **Deals** | Sales pipeline record |
| **Pipelines** | До 5 pipeline configs (stages, won/lost) |
| **Deal Statuses** | Stage + probability defaults |
| **Lost Reasons** | Аналитика проигрышей |
| **Services** (на deal) | Scope + pricing (rate card / manual) |
| **Proposals** | PDF / email / e-sign / analytics |

**Deal ≠ Project.** Deal живёт в CRM до won; после won — опциональный spawn Project и/или Budget.

### 2.2 Financial spine: Deal → Budget → Project

Из [Understanding the Link Between Deals and Budgets](https://help.productive.io/en/articles/9819347-understanding-the-link-between-deals-and-budgets), [Winning a Deal](https://help.productive.io/en/articles/2179570-winning-a-deal):

```
Company
  └── Deal (pipeline)
        ├── Services (scope, hours, rates)
        ├── Proposals (КП внутри CRM)
        ├── Deal Overview (revenue / time / cost до won)
        ├── Activities, BCC emails
        └── [Won] → Win Wizard:
              ├── Create NEW Project + Budget
              ├── Add Budget to EXISTING Project
              ├── Standalone Budget (no project)
              └── Do nothing (mark won only)
                    └── Transfer: services, time entries, expenses, bookings
```

**Origin Deal:** budget несёт ссылку на deal (briefcase icon). Feed tab = **Sales** + **Production** секции. Deal settings (time approvals, cost rates) копируются в budget.

**Retainer path:** retainer deal → recurring budgets по периодам (май 2026).

### 2.3 Projects: tasks, не phase boards

Productive **не использует Monday-модель** «group = фаза, status = состояние карточки». Вместо этого:

| Уровень | Возможности |
|---------|-------------|
| **Project** | Tabs: Tasks, Docs, Budgets, Time, Dashboards |
| **Task Lists / Folders** | Структура внутри проекта (аналог эпиков/фаз) |
| **Tasks** | Workflow status (Not started / Started / Closed) |
| **Workflows** | До 10 кастомных status sets per org |
| **Dependencies** | Между задачами в template и проекте |
| **Milestones** | Через task dates + Gantt/Timeline layouts |

**Board view** группирует по **workflow status**, не по фазе-доставки. Фазы внедрения = **task lists** или folder structure в project template.

### 2.4 Template Center — тройная система шаблонов

Из [Project Templates](https://help.productive.io/en/articles/2179607-project-templates), [Deal Templates](https://help.productive.io/en/articles/6080967-deal-templates):

| Template type | Содержимое | Tier |
|---------------|------------|------|
| **Deal Template** | Services, pricing, retainer settings, doc templates | 🔒 Pro+ |
| **Budget Template** | Financial structure | Pro+ |
| **Project Template** | Tasks, lists, folders, dependencies, workflows, custom fields, **project automations (Beta)** | All |

**Project template wizard:** client, PM, copy options (everything / cherry-pick), share members, optional budget attach.

**Save as template:** из живого deal или project (budgets/invoices/time **не** копируются).

### 2.5 Маппинг на dashboard-crm

| Productive | dashboard-crm | Комментарий |
|------------|---------------|-------------|
| Companies | `companies` | ✅ |
| People / Contacts | `contacts` | ✅ |
| Deals | `projects` WHERE `type='client'` | 🟡 одна таблица vs deal object |
| Services на deal | ❌ / `projects.value` | gap — нет line items |
| Proposals | ❌ (kp-master вне CRM) | **главный gap** |
| Won → Project | `spawn_delivery_project` RPC | 🟡 у них wizard, у нас modal |
| Won → Budget | ❌ (1С контур) | сознательно нет |
| Project (delivery) | `projects` WHERE `type='delivery'` | ✅ intent |
| Task Lists / Folders | `project_columns` `category='phase'` | 🟡 **другая модель** |
| Workflow status | `tasks.lane` | 🟡 похожий intent, другой UX |
| Project Template | `delivery_templates` + `copy_delivery_template` | ➕ domain 1С:ДО |
| Deal Template | ❌ | gap |
| Origin deal link | `parent_project_id` / FK | 🟡 частично |
| Deal aging | `deal-health.ts` | ➕ native без automations tier |
| Automations | `automation_rules` (S29) | 🟡 1×1 vs When/Check/Then |
| TodayView / action inbox | ❌ (deals + reports) | ➕ **единая очередь** |
| Stage gates (DB) | ❌ | ➕ **hard enforcement** |

---

## 3. Deal → Project handoff (ключевой для нашего домена)

### 3.1 Как Productive решает «выиграли → внедряем»

**Проблема** (та же): post-close delivery в sales pipeline портит forecast и смешивает контуры.

**Решение Productive** ([Winning a Deal](https://help.productive.io/en/articles/2179570-winning-a-deal), [sales page](https://productive.io/sales)):

1. Deal progresses через pipeline (board/table/kanban layouts)
2. На стадии Won (кнопка, drag-drop, bulk, или stage mapped to Won)
3. **Win Wizard** — обязательный UX-шаг (не fully silent automation):
   - **New project + budget** — services → budget, tasks из template
   - **Budget to existing project** — для повторных фаз/этапов
   - **Standalone budget** — без PM-контура
   - **Do nothing** — только mark won
4. Опции transfer: time entries, expenses, future bookings
5. Origin deal сохраняется на budget; project linked через budget/project tabs

**Post-won homepage promise:** «Once your deal is won, Productive handles the rest: AI creates tasks and views, automations handle coordination.»

**Критический инсайт:** handoff **не silent** — guided wizard с выбором контура. Это **HITL-by-design**, не bug. У нас `spawn_delivery_project` — тот же intent, но **слабее UX** (нет wizard с опциями «добавить к существующему» / «только budget»).

### 3.2 Proposals как промежуточный слой (сильнее Monday и нас)

[Deal Proposals overview](https://help.productive.io/en/articles/12741741-overview-of-deal-proposals-in-productive) (дек 2025):

| Tier | Proposals |
|------|-----------|
| Essential | 1 PDF proposal per deal |
| Professional | Email send, public link, e-sign (1 per deal) |
| Ultimate | Multiple proposals + engagement analytics |

Цепочка: **Deal + Services → Proposal → Client sign → Won → Project/Budget**.

**У нас:** КП (kp-master) вне CRM. Productive закрывает gap **quote layer** нативнее Monday (May 2026 quotes link) и Accelo (quote convert).

### 3.3 Сравнение handoff-паттернов

| Аспект | Productive | Monday | Accelo | dashboard-crm |
|--------|------------|--------|--------|---------------|
| Триггер won | Wizard on mark won | Automation create board item | Quote convert / Create Related | Manual RPC |
| Финансовый слой | Budget from services | ❌ / billable hours 🔒 | Quote → Job budget | ❌ (1С) |
| Шаблон delivery | Project template | Managed template / duplicate board | Job Type | `delivery_templates` |
| Фазовая модель | Task lists + workflow | Groups + status column | Milestones | phase columns + `lane` |
| HITL | Built-in wizard | Automation setup | Manual + quote | Modal spawn |
| Silent skip | «Do nothing» option | — | — | — |

### 3.4 У нас (delivery P1–P3)

```
companies
  └── projects(type='client') — sales pipeline, stage gates
        └── [won] → spawn_delivery_project RPC (ручной, HITL)
              └── projects(type='delivery')
                    ├── project_columns (category='phase')
                    ├── delivery_templates (ERP/IIoT × launch/experiment)
                    └── tasks + is_milestone gates
```

**Сходство с Productive:** разделение sales/delivery + template spawn + parent link.  
**Разрывы:** (1) нет win wizard с опциями, (2) нет proposals/services layer, (3) нет origin-deal UI на delivery card, (4) spawn не на stage_entered automation.

---

## 4. Deal mechanics и pipeline health

### 4.1 Deal Overview (financial snapshot до won)

[Deal Overview Tab](https://help.productive.io/en/articles/13001867-the-deal-overview-tab) (март 2026):

| Секция | Метрики |
|--------|---------|
| **Revenue** | Deal value, projected revenue (× probability), expected at 100% |
| **Time** | Budgeted / estimated / scheduled hours |
| **Cost** | Time entry cost, expenses, scheduled cost |
| Charts | Forecasting + profitability (permission-gated) |

**Инсайт:** deal card = **мини-P&L до закрытия**. Для нас релевантна **лёгкая версия**: value + probability + expected close + linked КП status — без cost rates.

### 4.2 Deal aging (фев 2026) — rotting native

[Deal Aging Fields](https://help.productive.io/en/articles/13742417-how-to-use-deal-aging-fields):

| Field | Назначение |
|-------|------------|
| **Days in Current Stage** | Stuck in stage (rot по стадии) |
| **Deal Age** | Total cycle time |
| **Days Since Last Activity** | Inactivity (≈ reconnect) |

Использование: reports, filters, **automations** (daily Find Object → Slack), **Pulse** scheduled reports.

**У нас:** `deal-health.ts` + TodayView + `use-last-touch` — ➕ **native без tier**, но ❌ нет automation triggers на aging fields.

### 4.3 Pipeline configuration

- Multiple pipelines (1/3/5 by tier)
- Default probability per stage
- Projected revenue distribution (even / custom across time)
- Lost reasons analytics
- Funnel report + sales rep leaderboard

### 4.4 HubSpot sync 🔒 Ultimate

Deals sync из HubSpot pipeline at certain stage → Productive deal + contact + client. Для команд с HubSpot sales + Productive delivery.

---

## 5. Project execution и phase model

### 5.1 Layouts vs наша фазовая доска

Productive предлагает **7 layouts** на одном task dataset. Для delivery релевантны:

| Layout | Use case |
|--------|----------|
| **Board** | Kanban по workflow status |
| **Timeline / Gantt** | Фазы, dependencies, milestones |
| **Workload** | Кто перегружен |
| **Table** | Bulk edit |

**Различие с P2a:** у нас `project_columns(category='phase')` + `tasks.lane` = **фаза ≠ статус** (Monday-контракт). Productive разделяет через **folders/lists** (фаза) и **workflow status** (прогресс задачи) — **концептуально близко**, но UI другой.

### 5.2 Task workflows

[Workflows](https://help.productive.io/en/articles/5813154-creating-and-managing-workflows):
- 3 macro-stages: Not started / Started / Closed
- Custom statuses внутри stages
- 2/5/10 workflows per plan
- Per-project workflow assignment + status mapping on switch

**Нет DB-enforced milestone gates** как наш `check_delivery_completion` + `is_milestone`.

### 5.3 Project templates — глубина

Project template включает (июнь 2026):
- Task lists, folders, dependencies
- Custom fields (per-project 2/5/15)
- Task templates library (auto-copied)
- **Project automations (Beta)** — копируются в spawn
- Tabs config (apply to existing projects — фев 2026)

**У нас:** `delivery_templates` — фазы + tasks + milestones в DB, `copy_delivery_template` RPC. ➕ **domain-specific** (1С:ДО, ERP pptx), ➕ **org-scoped UNIQUE(direction, kind)**.

### 5.4 Client portal

Clients free in workspace — comment on tasks, see budget status. Для промышленных B2B — низкий приоритет, но паттерн **delivery visibility**.

---

## 6. Automations и Workflows

### 6.1 Модель автоматизаций

[Automations General Overview](https://help.productive.io/en/articles/8564582-automations-general-overview) + [Examples](https://help.productive.io/en/articles/8822365-automations-examples-and-best-practices) (янв 2026):

```
When (trigger: create/update/delete/comment/time)
  → Check if (optional conditions)
  → Then (actions)
```

**Расширения:**
- **Find Object** — cron (e.g. Monday 6AM: deals inactive 30d → create to-do)
- **Relative date/person fields**
- Context-specific: 🤖 Automate icon on Project/Budget/Deal/Form
- **AI Automation builder (Beta)** — NL → draft rule
- Cross-project task automations

**Лимиты:** 100 / 1,000 / 5,000 actions/mo.

**Категории best practices:**
1. Additional Actions (assign, move status, deliver budget, create invoice)
2. Notifications (Slack won deal 🎉, milestone resolved)
3. Alerts (missing due date, budget without end date, no time logged on closed task)

### 6.2 Deal-specific automations

- Won/Lost/Updated → Slack с emoji
- Recurring follow-up to-dos on deal
- Deal aging → daily alerts (Days Since Last Activity > 7)
- New deal → comment «review services»

**Главный разрыв с нами:** нет `stage_entered(won) → spawn_delivery`, но есть **зрелая библиотека** deal/budget/project automations + Find Object для rotting.

### 6.3 У нас (S29)

```
trigger_type: 'stage_entered'  →  action_type: 'create_task'
```

**Productive шире** по объектам (deal, budget, invoice, form) и по **scheduled Find Object**. **Мы сильнее** на DB stage gates — Productive не имеет аналога `check_stage_requirements()`.

---

## 7. AI-стратегия Productive vs AI Hub

| Productive (2026) | dashboard-crm | Вердикт |
|-----------------|---------------|---------|
| **Marble AI engine** — agentic PSA | AI Hub — 3 доменных пресета | Разный фокус |
| **Agents / Skills** — custom virtual assistants | ❌ | Overkill |
| **Notetaker** → tasks | `transcripts`, `ai_runs` | 🟡 паритет на звонках |
| **Pipeline Summary** — sales AI | 🟡 deal-health | ➕ native rotting без credits |
| **Project Summary** — delivery AI | ❌ delivery health | gap (accelo P3) |
| **AI Automation builder** | ❌ | gap низкий приоритет |
| **Report Intelligence** — NL → insights | analytics pages | gap |
| **MCP Server** — Claude/ChatGPT ↔ Productive | ❌ | опционально |
| **Expense autofill** | ❌ | вне домена |
| **AI time tracking** | ❌ | 1С:ДО |

**Инсайт:** Productive AI = **operational** (reports, time, automations). Наш AI Hub = **domain sales** (SPIN, протокол). Не конкурируют напрямую; пересечение — **Notetaker → CRM fields HITL** (hubspot P0, monday P4).

---

## 8. Sales Workspace vs TodayView

| Аспект | Productive | dashboard-crm |
|--------|------------|---------------|
| Единая очередь действий | 🟡 Deals + to-dos + automations | ➕ TodayView (`/`) |
| Deal rotting | ✅ Deal aging + Find Object automations | ➕ `deal-health.ts` native |
| Reconnect | ✅ Days Since Last Activity | ➕ `use-last-touch` |
| Sales sequences | 🟡 Recurring deal to-dos | ❌ |
| Post-won wizard | ✅ Win flow | 🟡 spawn modal |
| Cmd+K | ❌ (Smart Search AI) | ➕ CommandPalette |
| Cross-team notify | ✅ Slack automations | 🟡 delivery spawn only |
| Financial deal view | ✅ Deal Overview | 🟡 value + stage only |

**Вывод:** Productive сильнее в **win wizard, proposals, deal financial overview, aging automations**. Мы сильнее в **единой action queue** и **native deal health без tier**.

---

## 9. Gap-матрица: dashboard-crm vs Productive

### 9.1 Где dashboard-crm **сильнее** Productive

| Возможность | Почему |
|-------------|--------|
| **Stage gates (DB enforcement)** | Productive — UI/workflows; у нас trigger + RPC |
| **TodayView + reconnect** | Native sales queue |
| **Vertical pipeline** (ЧЗ, ERP, experiment) | Productive — horizontal PSA |
| **Delivery templates по 1С:ДО / ERP** | Productive — generic project templates |
| **Domain AI** (SPIN / протокол) | Productive — operational AI |
| **Phase board contract** (P2a) | Monday-aligned; Productive — folders + workflow |
| **Milestone gates** | `is_milestone` + `check_delivery_completion` |
| **Без PSA-оверхода** | Нет budgets/invoicing/time tracking |
| **Без 3-seat minimum** | Productive min 3 seats |

### 9.2 Ядро CRM

| Возможность | Productive | dashboard-crm | Gap |
|-------------|------------|---------------|-----|
| Contacts / Companies | ✅ | ✅ | паритет |
| Deals / Pipeline | ✅ multi-pipeline | ✅ `projects(client)` | паритет |
| Разделение sales / delivery | ✅ deal vs project | ✅ `type=client\|delivery` | **паритет intent** |
| Activity timeline | ✅ BCC email + feed | 🟡 EntityTimeline | gap email |
| Proposals / КП | ✅ in-deal | ❌ kp-master | **главный gap** |
| Deal services / line items | ✅ | ❌ | gap |
| Deal financial overview | ✅ Overview tab | 🟡 value only | gap |
| Deal aging / rotting | ✅ 3 fields + automations | ➕ deal-health | automations gap |
| Lost reasons | ✅ | 🟡 | низкий |

### 9.3 Delivery / project execution

| Возможность | Productive | dashboard-crm | Gap |
|-------------|------------|---------------|-----|
| Phase ≠ status model | 🟡 lists + workflow | ✅ phase columns + `lane` | **мы точнее для ERP** |
| Template spawn on won | ✅ win wizard + project template | 🟡 `spawn_delivery_project` | **UX gap** |
| Deal ↔ delivery link UI | ✅ origin deal on budget | 🟡 `parent_project_id` | expanded card gap |
| Task dependencies | ✅ | ❌ | отложить |
| Gantt / Timeline | ✅ | ❌ | отложить |
| Budget / profitability | ✅ real-time | ❌ (1С) | сознательно |
| Delivery health | 🟡 project summary AI | ❌ | accelo P3 |
| Client portal | ✅ free clients | ❌ | опционально |

### 9.4 Automations и templates

| Возможность | Productive | dashboard-crm | Gap |
|-------------|------------|---------------|-----|
| No-code automations | ✅ 100–5000/mo | 🟡 S29: 1×1 | **главный разрыв** |
| Scheduled Find Object | ✅ cron rotting | ❌ | P1 workflow |
| Deal + Project templates | ✅ Template Center | ➕ DB `delivery_templates` | ➕ domain depth |
| Deal templates | ✅ 🔒 Pro+ | ❌ | низкий (vertical pipelines) |
| Project automations in template | ✅ Beta | ❌ | низкий |
| AI automation builder | ✅ Beta | ❌ | отложить |

---

## 10. Архитектурное сравнение

```
Productive (PSA)                     dashboard-crm (relational)
────────────────                     ──────────────────────────
Companies ─────────────              companies
People / Contacts ─────              contacts
Deals (pipeline) ────────┐           projects (type=client)
  Services               │           ❌ line items
  Proposals              │           ❌ КП external
                         │ [Won] Win Wizard
Budgets (financial) ─────┤           ❌ (1С)
  Origin Deal link       │
Projects (delivery) ─────┘           projects (type=delivery)
  Task Lists / Folders               project_columns (phase)
  Workflow statuses                  tasks.lane
  Project Templates                  delivery_templates + spawn RPC

Template Center                      delivery_templates tables
Automations (When/Check/Then)        automation_rules (1×1)
Deal aging fields                    deal-health.ts
Deal Overview (P&L)                  project detail (partial)
```

**Ключевой архитектурный инсайт:** Productive подтверждает **трёхслойную модель** Accelo/HubSpot: **Deal (sales) → Quote/Proposal → Delivery (project)**. У нас есть слой 1 и 3; **слой 2 (КП/proposal) — системный gap**. Productive добавляет **Budget как financial spine** между deal и project — нам не нужен (1С), но **win wizard UX** и **origin deal visibility** — да.

**Phase model:** наш P2a (Monday-контракт) **лучше подходит** для ERP-внедрений с gate-фазами, чем Productive task lists. Productive сильнее в **dependencies + Gantt**, не в milestone gates.

---

## 11. Приоритеты для dashboard-crm

Отфильтровано под домен (продажи маркировки + внедрения 1С/ЧЗ). Пересечения с accelo/monday/hubspot отмечены.

### P0 — Win wizard: guided spawn при won (~0.4 спринта)

**Референс Productive:** [Winning a Deal](https://help.productive.io/en/articles/2179570-winning-a-deal) — wizard с опциями.

При `stage → won` показать модалку:
```
1. «Запустить внедрение» → выбор delivery_template → spawn_delivery_project
2. «Добавить фазу к существующему delivery» (если 1:N) — link, не новый spawn
3. «Только отметить выигранной» — skip spawn
4. Notify delivery owner (+ optional finance/legal)
```

*Дублирует accelo P0, monday P0, hubspot P2 — но Productive даёт **лучший UX-референс wizard**.*

### P1 — Proposal/КП linked to deal (~0.5 спринта)

**Референс Productive:** Deal Proposals (Essential = PDF, Pro = e-sign).

Минимальный объект в CRM:
- `proposals` или JSON на `projects(client)`: status, amount, doc_url, sent_at, signed_at
- Связь с kp-master output
- На Overview deal card: КП status + CTA

*Сильнее monday P3 (quotes link) — Productive native proposals.*

### P2 — Expanded deal card: sales + delivery + КП context (~0.4 спринта)

**Референс Productive:** Origin deal on budget + Deal Overview tab.

На `projects(client)` detail:
- Linked `projects(delivery)` + прогресс X/Y, текущая фаза
- КП status (mirror Productive Overview lite)
- CTA win wizard если won без delivery

*Дублирует monday P1, accelo expanded view.*

### P3 — Deal aging → automation triggers (~0.3 спринта)

**Референс Productive:** [Deal Aging Fields](https://help.productive.io/en/articles/13742417-how-to-use-deal-aging-fields) + Find Object.

Расширить S29 / TodayView:
```
days_in_stage > N  → create_task / notify
days_since_activity > N  → TodayView reconnect (уже есть) + optional notify
```

Маппинг: `deal-health.ts` metrics → `automation_rules` conditions.

### P4 — Delivery health badge (~0.4 спринта)

**Референс Productive:** Project Summary AI + budget % alerts.

Лёгкая версия без time/budget:
- Stalled phase > N days
- Overdue `is_milestone`
- Badge на delivery card + TodayView «Delivery at risk»

*Дублирует accelo P3.*

### P5 — Template spawn polish (~0.3 спринта)

**Референс Productive:** Project template wizard — cherry-pick copy, share members.

Улучшить `spawn_delivery_project` modal:
- Preview фаз/задач из template
- Выбор owner delivery
- Optional: copy assignees from deal owner

### P6 — Progression transition modal (~0.5 спринта)

**Референс Productive:** Deal creation from template + service review comment on new deal.

*Дублирует accelo P1 — guided stage change с `stage_requirements`.*

### P7 — Smart Deal Progression / Notetaker HITL (~0.5 спринта)

**Референс Productive Notetaker → tasks.**

*Дублирует hubspot P0, monday P4.*

### Отложить

- Budgets / invoicing / rate cards / retainers (1С)
- Time tracking / billable hours / AI time
- Resource planning / bookings / placeholders
- Gantt / task dependencies
- Scenario Builder / revenue forecasting
- HubSpot sync (у нас CRM = primary)
- Client portal
- Agents / Skills / MCP / Connectors
- 7 project layouts
- Deal templates с services (vertical pipelines достаточно)
- Full Template Center UI (шаблоны в БД достаточно)

---

## 12. Productive vs Accelo vs Monday — что брать от кого

| Паттерн | Лучший референс | Почему |
|---------|----------------|--------|
| Win wizard (guided handoff) | **Productive** | 4 опции на won; лучший UX среди PSA |
| Proposal/КП in CRM | **Productive** > Monday > Accelo > мы | Native proposals + e-sign |
| Phase board (фаза ≠ статус) | **Monday** + мы | Productive — folders, не phase columns |
| Delivery templates (domain) | **Мы** | 1С:ДО vs generic |
| Budget / financial spine | **Productive** ≈ Accelo | Нам не нужно (1С) |
| Deal aging + scheduled rotting | **Productive** | Find Object automations |
| Deal financial overview | **Productive** | Overview tab до won |
| Stage enforcement | **Мы** | DB gates |
| Action inbox | **Мы** (TodayView) | Productive fragmented |
| Workflow engine breadth | Productive > Monday > мы | When/Check/Then + Find Object |
| AI post-meeting HITL | Все (2026) | Один раз в AI Hub |
| Cross-team handoff notify | Monday ≈ Productive | Slack automations |

---

## 13. Что сознательно НЕ копировать

- PSA financial stack (budgets, invoicing, rate cards, overhead, scenario builder)
- Time tracking / billable utilization (1С:ДО)
- Resource planning / bookings / skills matrix (команда 5–15)
- 3-seat minimum и per-seat PSA pricing
- Task-list phase model вместо P2a phase columns (ERP gates)
- Deal templates с services/rate cards (vertical pipelines + КП достаточно)
- Client portal с budget visibility
- Agents / Skills / MCP / Connectors ecosystem
- HubSpot as primary CRM + Productive delivery split
- Gmail BCC as primary activity capture
- Gantt-first project management
- Retainer/recurring budget machinery

**Стратегия:** брать у Productive **win wizard, proposals layer, deal overview lite, deal aging automations, origin deal↔delivery UI** — не PSA целиком. Phase board и milestone gates — **свой P2a контракт** (Monday-aligned). Financial execution — **1С**, не Productive budgets.

---

## 14. Итоговый вывод

**Productive.io — эталон #2 по PSA handoff после Accelo**, с **лучшим UX win wizard** и **нативными proposals**. В `crm-benchmark-candidates` указана сила: **Agency PSA + CRM, шаблоны проектов, бюджеты, этапы**. Анализ уточняет: для dashboard-crm наиболее ценны **не бюджеты**, а **связка deal → proposal → win wizard → project template** и **deal aging automations**.

**Где мы уже на уровне Productive:**
- Разделение `client` / `delivery` projects
- Delivery templates + spawn RPC (➕ domain depth)
- Deal health / rotting (➕ native)
- Stage gates (➕ сильнее)
- TodayView как sales queue (➕)

**Оставшиеся разрывы (приоритет):**
1. **КП/Proposals в CRM** (P1) — Productive Essential уже даёт PDF per deal
2. **Win wizard на won** (P0) — guided spawn vs ручной RPC
3. **Expanded deal↔delivery↔КП card** (P2) — Origin deal + Overview
4. **Aging → automations** (P3) — Find Object pattern для rotting
5. **Workflow engine** (сквозной) — When/Check/Then + scheduled
6. **Delivery health** (P4) — project summary без PSA metrics

**Конкурентные преимущества сохранять:**
- Вертикальные воронки маркировки (ЧЗ, ERP, experiment)
- Phase board P2a (фаза ≠ lane) — точнее Productive task lists для ERP
- Stage gates в PostgreSQL
- Domain AI (SPIN, протокол)
- `delivery_templates` из методологии 1С:ДО
- Лёгкость vs PSA (без budgets/time/invoicing)

**Стратегия:** Productive — **мост между Accelo (financial PSA) и Monday (phase UX)**. Брать **win wizard + proposals + deal overview + aging automations**; phase model и gates — **оставить свой**. Комбинировать с Monday (**handoff notify, phase board polish**) и Accelo (**milestone progression UX, delivery health semantics**).

---

## 15. Источники

### Productive.io (официальные, спарсено 2026-07-12)

- [Homepage](https://productive.io)
- [Productive 5.0](https://productive.io/5-0)
- [Pricing](https://productive.io/pricing)
- [Sales & CRM](https://productive.io/sales)
- [Project Management](https://productive.io/project-management)
- [Productive AI](https://productive.io/productive-ai)
- [IT Services vertical](https://productive.io/industries/it-project-management-software)
- [Automations](https://productive.io/automations)
- [Accelo alternatives (comparison)](https://productive.io/blog/accelo-alternatives) (дек 2025)

### Help Center (ключевые статьи)

- [Winning a Deal](https://help.productive.io/en/articles/2179570-winning-a-deal) (май 2026)
- [Understanding the Link Between Deals and Budgets](https://help.productive.io/en/articles/9819347-understanding-the-link-between-deals-and-budgets)
- [Project Templates](https://help.productive.io/en/articles/2179607-project-templates) (июнь 2026)
- [Deal Templates](https://help.productive.io/en/articles/6080967-deal-templates) (май 2026)
- [Overview of Deal Proposals](https://help.productive.io/en/articles/12741741-overview-of-deal-proposals-in-productive)
- [The Deal Overview Tab](https://help.productive.io/en/articles/13001867-the-deal-overview-tab) (март 2026)
- [How to Use Deal Aging Fields](https://help.productive.io/en/articles/13742417-how-to-use-deal-aging-fields) (фев 2026)
- [Automations: General Overview](https://help.productive.io/en/articles/8564582-automations-general-overview) (май 2026)
- [Automations: Examples and Best Practices](https://help.productive.io/en/articles/8822365-automations-examples-and-best-practices) (янв 2026)
- [Creating and Managing Workflows](https://help.productive.io/en/articles/5813154-creating-and-managing-workflows)

### API

- [Developer portal](https://developer.productive.io)
- [CRM domain](https://developer.productive.io/reference/categories/crm)

### dashboard-crm (репозиторий)

- `improvements/CRMs/crm-benchmark-candidates-2026-07-12.md` — Tier 3 Productive.io
- `improvements/accelo-analysis-2026-07-12.md` — PSA baseline
- `improvements/CRMs/monday-analysis-2026-07-12.md` — phase board + handoff
- `_analysis/architecture-delivery-p2.md` — P2a phase contract
- `supabase/migrations/20260712230000_baseline.sql` — `spawn_delivery_project`, `check_delivery_completion`
- `src/lib/utils/deal-health.ts` — rotting native
- `src/components/today/TodayView.tsx` — action inbox