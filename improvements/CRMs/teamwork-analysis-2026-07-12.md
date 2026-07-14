# Teamwork CRM — комплексный анализ и инсайты для dashboard-crm

**Дата:** 2026-07-12  
**Метод:** парсинг support.teamwork.com/crm (Getting Started, Integrations, Mail, Reports, Settings, Glossary), Teamwork.com pricing/features (июль 2026), HubSpot integration docs, project templates docs, developer portal, сопоставление с кодовой базой dashboard-crm.  
**Связанные документы:** `improvements/CRMs/crm-benchmark-candidates-2026-07-12.md` (Tier 3 — Lead → project pipeline), `improvements/CRMs/monday-analysis-2026-07-12.md`, `improvements/CRMs/accelo-analysis-2026-07-12.md`, `improvements/CRMs/insightly-analysis-2026-07-12.md`, `_analysis/architecture-delivery-p2.md`.

---

## 0. Как читать этот документ

| Символ | Значение |
|--------|----------|
| ✅ | Паритет или сильная альтернатива |
| 🟡 | Частично / другая модель |
| ❌ | Нет |
| ➕ | Есть у нас, у Teamwork нет «из коробки» или слабее |
| 🔒 | Требует платного tier / отдельного продукта |

**Контекст:** Teamwork CRM — **отдельное sales-приложение** в экосистеме Teamwork (наряду с Teamwork.com PSA, Desk, Spaces). Сильна в **явном handoff deal → Teamwork.com project** с двусторонней связью и sync company/contact. dashboard-crm — **вертикальная CRM** под продажи и внедрения маркировки (1С:ERP, Честный Знак). Teamwork — **бенчмарк по «лёгкому» CRM+PM handoff без PSA-оверхода**, ближе к Insightly/Monday, чем к Accelo.

---

## 1. Teamwork CRM в 2026 — позиционирование и архитектура

### 1.1 Два продукта, один бренд

Teamwork — **не единый монолит**, а продуктовый switcher:

```
Teamwork Ecosystem (2026)
├── Teamwork CRM          ← sales: leads, opportunities, pipelines, mail
│   └── crm.teamwork.com / support.teamwork.com/crm
├── Teamwork.com          ← PSA: projects, time, budgets, profitability, AI
│   └── teamwork.com (Optimize 2026: quotes, CRM pipeline → projects)
├── Teamwork Desk         ← tickets ↔ CRM deals (sidebar)
├── Teamwork Spaces       ← docs (coming soon в CRM)
└── Integrations layer
    ├── Native: CRM ↔ Teamwork.com (project/task/deal link)
    ├── HubSpot ↔ Teamwork.com (workflow auto-create projects)
    ├── Zapier, Webhooks, Gmail add-on
    └── API: apidocs.teamwork.com (Projects API; CRM API не выделен отдельно)
```

**Маркетинг teamwork.com/crm** (2026) редиректит на **PSA homepage** («AI-Powered Professional Services Automation»), не на CRM landing. CRM живёт как **satellite product** с собственным Help Center, но стратегически Teamwork **схлопывает контур** в Optimize tier: «Turn CRM pipeline into projects», quotes, tentative projects ([pricing](https://www.teamwork.com/pricing/), июль 2026).

**Главное отличие от Insightly:** Insightly держит Opportunity + Project **в одном CRM UI**. Teamwork — **два приложения** с deep link и product switcher.

**Главное отличие от Monday:** Monday — board-native Work OS; handoff = новый board item. Teamwork — **relational link** deal ↔ project + optional project template, delivery в **полноценном PM** (Gantt, time, budget).

**Главное отличие от Accelo:** Accelo — quote-to-cash PSA в одном графе. Teamwork CRM **не имеет quotes/invoicing**; финансовый контур — только в Teamwork.com PSA (🔒 Optimize+).

### 1.2 Заявленные метрики (Teamwork.com PSA, маркетинг 2026)

| Метрика | Значение |
|---------|----------|
| Businesses on Teamwork.com | 16,000+ |
| New client projects / week | 17,000+ |
| Billable hours tracked / year | 40M+ |
| Billable utilization boost (year 1) | +22% avg |
| Integrations | 150+ native |

*Метрики относятся к PSA-платформе; отдельной публичной статистики Teamwork CRM нет.*

### 1.3 Ценовая модель (2026)

#### Teamwork CRM

Источник: [Feature Comparison](https://support.teamwork.com/crm/pricing-and-billing/teamwork-crm-feature-comparison), [Subscription management](https://support.teamwork.com/crm/pricing-and-billing/adding-or-removing-users-from-your-subscription).

| Plan | Публичная цена | Ключевое |
|------|----------------|----------|
| **Pro** | Не на маркетинговой странице; checkout в CRM Settings | Pipelines, forecast, mail sync, CRM↔Projects, webhooks, Zapier |
| **Enterprise** | Contact / custom | Pro + **SSO** |

**Верифицированные ограничения:**
- Per-user subscription, monthly или annual billing (proration при изменении seats)
- **Нет free tier** для CRM (в отличие от Teamwork.com Free Forever)
- Pro и Enterprise — **идентичный feature set** кроме SSO
- Публичный $/user на сайте **не опубликован** (checkout только из CRM Settings)

#### Teamwork.com PSA (для handoff-контекста)

Источник: [teamwork.com/pricing](https://www.teamwork.com/pricing/) (июль 2026).

| Plan | Цена (annual) | Handoff-relevant |
|------|---------------|------------------|
| Free | $0 | 5 projects, 5 users, 2 templates |
| Basics | $9.99/user | Templates unlimited, billable time |
| Accelerate | $24.99/user | HubSpot, automations 20k/mo, invoices |
| Optimize | Custom | **Quotes**, **CRM pipeline → projects**, tentative projects, profitability AI |
| Enterprise | Custom | SSO, dedicated CSM |

**Project templates из CRM deal:** 🔒 Deliver/Pro+ на Teamwork.com ([creating project from deal](https://support.teamwork.com/crm/integrations/creating-a-project-from-a-lead-or-opportunity)).

**Инсайт для позиционирования:** полный контур Teamwork CRM + PSA Optimize = **два биллинга + seat minimums** (Basics min 3, Accelerate min 5). dashboard-crm — единый инструмент без product switcher и tier-gating handoff.

---

## 2. Модель данных Teamwork CRM

### 2.1 Объекты и жизненный цикл

Верифицировано по [Glossary](https://support.teamwork.com/crm/glossary/teamwork-crm-glossary), Getting Started guides:

| Объект | Назначение | Ключевые атрибуты |
|--------|------------|-------------------|
| **Lead** | Top-of-funnel prospect | Title, company, contact, pipeline+stage, value, products, owner, expected close, custom fields |
| **Opportunity** | Qualified lead с высокой вероятностью | То же; отдельные pipelines |
| **Company** | Target account | Name, industry, address, country, custom fields |
| **Contact** | Point of contact | Name, title, email, phone; **1 company max** |
| **Product** | Каталог offering | Multi-price, multi-currency; attach к deals |
| **Activity** | Sales work item | Email, Call, To-do, Meeting, Event; past/future; reminders |
| **Pipeline** | Sales process template | Stages + **probability %** per stage |
| **Deal** | Umbrella term | = Lead OR Opportunity (раздельные разделы UI) |

**Lifecycle:**

```
Lead pipeline
  ├── Qualified → modal: pick Opportunities pipeline + stage → becomes Opportunity
  ├── Lost → reason + description modal
  └── (optional) Add Project / Add Task → Teamwork.com  ← может быть ДО qualify

Opportunity pipeline
  ├── Won → removed from pipeline; optional won reason
  ├── Lost → reason modal; value removed from forecast
  ├── Disqualified → reverts to Lead (re-enter sales)
  └── Add Project / Add Task → Teamwork.com
```

**Критический инсайт:** project handoff **не привязан к Won**. Deal на любой стадии lead/opportunity может получить linked project ([creating a project](https://support.teamwork.com/crm/integrations/creating-a-project-from-a-lead-or-opportunity)). Это ближе к **tentative engagement**, чем к Monday «только post-won board».

### 2.2 Pipeline UX и auto-prioritization

Из [Default Sorting](https://support.teamwork.com/crm/using-teamwork-crm/default-sorting-for-pipelines), [Glossary Statuses](https://support.teamwork.com/crm/glossary/teamwork-crm-glossary):

**Status icons на карточках (activity-based):**
- 🔴 Red — overdue activity
- 🟡 Yellow — no scheduled activity
- 🟢 Green — activity due today
- ⚪ Gray — all activities in future

**Sort order в колонке:**
1. Overdue → No activity → Due today → Future
2. Tie-break: closest activity → expected close → highest value → alphabetical

**Views:** Board (kanban) + List; bulk edit; custom filters (saved + shared); advanced filter (match any/all).

**Forecast:** stage probability × deal value; timeline columns by expected close / won date ([forecast reports](https://support.teamwork.com/crm/reports/using-forecast-reports)).

### 2.3 Deal detail view — связанный delivery-контекст

Левая панель deal ([integrations overview](https://support.teamwork.com/crm/teamwork/integrating-with-teamwork)):

```
Deal detail (Lead / Opportunity)
├── Core fields (company, contact, value, products, owner…)
├── Project subsection          ← 0..1 linked Teamwork.com project
│   ├── Quick view (overview)
│   ├── Open in Teamwork.com
│   └── Disconnect
├── Tasks subsection            ← 0..N linked tasks (across projects)
│   ├── Complete from CRM sidebar
│   └── Open in Teamwork.com
└── Timeline (right)
    ├── Pinned notes (top)
    ├── Past activities / notes / files
    └── Upcoming activities
```

**Ограничение:** **1 project per deal** (duplicate deal **не копирует** linked project). Multiple tasks — OK.

### 2.4 Маппинг на dashboard-crm

| Teamwork CRM | dashboard-crm | Комментарий |
|--------------|---------------|-------------|
| Leads | `leads` | ✅ |
| Qualify lead → opportunity | `convert_lead` RPC | ✅ явный аналог |
| Opportunities | `projects` WHERE `type='client'` | 🟡 одна таблица vs два раздела |
| Companies | `companies` | ✅ |
| Contacts | `contacts` | ✅ (у нас contact может быть гибче) |
| Products + line-item value | ❌ | gap (низкий приоритет для ЧЗ) |
| Pipelines + stage probability | `pipelines` + `pipeline_stages.probability` | ✅ |
| Activities | `calls` + `meetings` + tasks | 🟡 нет unified activity types |
| Activity status prioritization | `deal-health.ts` + TodayView | ➕ **rotting глубже** (next_step, completeness) |
| Forecast reports | 🟡 analytics pages | gap UI |
| Mail sync (Gmail/IMAP) | ❌ | gap |
| Notes + pin | 🟡 не в EntityTimeline | gap (hubspot P3) |
| Files on deal | ✅ `project_files` | паритет |
| Saved/shared filters | ➕ saved views + URL | паритет+ |
| Deal → Project link | `parent_deal_id` на `projects(delivery)` | 🟡 **1:N у нас**, 1:1 у Teamwork |
| Project template on spawn | `delivery_templates` + `copy_delivery_template` | ➕ **domain ERP/ЧЗ** |
| Task bridge pre-delivery | ❌ | gap (лёгкий handoff) |
| Won → auto project | ❌ (manual Add project) | 🟡 оба ручные; мы — spawn RPC |
| Tentative project (pre-won) | ❌ | gap (HubSpot/Optimize pattern) |
| Desk tickets ↔ deals | ❌ | вне домена |
| CRM automations | 🟡 S29 `automation_rules` | Teamwork CRM — **нет** own automations |
| Stage gates (DB) | ➕ `stage_requirements` trigger | **мы сильнее** |
| Time/budget/profitability | ❌ (1С:ДО) | сознательно нет |

---

## 3. Lead → Project handoff (ключевой паттерн)

### 3.1 Как Teamwork решает «продали → внедряем»

**Проблема:** sales и delivery — разные команды и инструменты; контекст теряется при handoff.

**Решение Teamwork CRM** (консенсус support docs, HubSpot integration, pricing 2026):

```
[Любая стадия Lead/Opportunity]
  → Add project (manual)
      ├── New Project tab
      │   ├── Name (default = deal name)
      │   ├── Description (auto-link back to deal)
      │   └── Optional: Teamwork.com project template 🔒 Pro+
      └── Existing Project tab (link)
  → Sync: company + contact → Teamwork.com People
  → Bidirectional link:
      CRM deal sidebar ←→ Teamwork.com project Dashboard note

[Альтернатива — granular]
  → Add task → pick project + task list → create/link task
  → Task sidebar on deal; CRM Deals section on task in Teamwork.com

[Через HubSpot — automation path]
  HubSpot deal stage change
    → Teamwork.com Workflow: create project (tentative or confirmed)
    → Set budget (fixed/T&M/retainer), owner, dates, template
    → Link deal ↔ project
```

**Won opportunity:** удаляется из pipeline, **но project не создаётся автоматически**. Won reason — optional/mandatory per settings. Handoff остаётся **HITL** в CRM UI или **automation** через HubSpot/Teamwork.com (не native CRM trigger).

**Company/contact sync при handoff:**
- CRM contact → company contact в Teamwork.com
- CRM contact → project contact
- Если contact.company ≠ deal.company → **обе компании** импортируются

### 3.2 Project templates (Teamwork.com)

Из [project templates](https://support.teamwork.com/projects/project-templates/creating-project-templates):

| PSA Plan | Custom templates limit |
|----------|------------------------|
| Free | 2 |
| Starter | 10 |
| Deliver/Pro | 20 |
| Grow/Premium | 50 |
| Scale/Enterprise | Unlimited |

Template может включать: task lists, milestones, board columns, **automations**, budgets. При spawn из CRM — dropdown выбора template.

**Аналог у нас:** `delivery_templates` + `delivery_template_phases/tasks` + `UNIQUE (org_id, direction, kind)` — **domain-specific** (1С:ДО, ERP pptx), не generic agency templates.

### 3.3 2026: схлопывание CRM → PSA (Optimize tier)

Teamwork.com pricing (июль 2026) добавляет на Optimize:
- **Build client ready quotes**
- **Turn quotes into scheduled work**
- **Turn CRM pipeline into tentative projects**
- **Turn CRM pipeline into projects** (native, не только HubSpot)
- AI profitability forecaster (Kash teammate)

**Интерпретация:** Teamwork **эволюционирует от dual-app к unified PSA**, где CRM pipeline — input layer для resource/financial planning. Teamwork CRM как отдельный продукт может стать legacy front-end; handoff-логика мигрирует в Optimize.

**У нас:** `spawn_delivery_project` уже **в одной БД** — архитектурно ближе к будущему Teamwork Optimize, чем текущий dual-app Teamwork CRM.

### 3.4 У нас (delivery P1–P3)

```
companies
  └── projects(type='client') — sales pipeline
        ├── [qualify] convert_lead (leads → client project)
        ├── [won] stage gate + optional spawn (ручной RPC)
        └── projects(type='delivery')
              ├── parent_deal_id (FK)
              ├── delivery_templates → copy_delivery_template
              ├── project_columns (category='phase')
              └── tasks.lane
```

**Сходство с Teamwork:**
- Explicit parent link deal ↔ delivery project
- Template-based spawn
- Delivery отделён от sales pipeline

**Разрывы:**
1. Teamwork позволяет project **до won** (tentative); у нас delivery spawn только из won-сделки
2. Teamwork — **1:1** deal↔project; у нас **1:N** (несколько delivery на сделку — эксперимент + launch)
3. Нет **task-level bridge** из карточки сделки
4. Нет **quick view** linked delivery на deal card (Monday/Teamwork expanded view)
5. Оба — **не auto** на won без доп. automation layer

---

## 4. Activities, Mail и collaboration

### 4.1 Activity model

Типы ([activities overview](https://support.teamwork.com/crm/getting-started/activities-overview)): Email, Call, To-do, Meeting, Event.

- Past + future scheduling
- Reminders per activity
- Quick add с карточки pipeline (+ icon)
- Timeline на deal: notes + activities + files

**Pinned notes** ([adding a note](https://support.teamwork.com/crm/crm-tips/adding-a-note)): auto-save draft 28 days; pin → отдельная секция над timeline.

### 4.2 Mail

[Email sync](https://support.teamwork.com/crm/mail/connecting-your-email-account-to-teamwork-crm):
- Gmail (Google Workspace), IMAP, Exchange
- 1 inbox per user (private)
- Emails linked to deal → visible on deal timeline for all users
- Compose/reply from CRM; signature support

**У нас:** comms вне CRM; EntityTimeline — calls/meetings/stage changes, не email.

### 4.3 Teamwork Desk

[Desk integration](https://support.teamwork.com/crm/integrations/working-with-teamwork-desk): ticket sidebar показывает leads/opportunities контакта; create deal from ticket. Авто-активация при обоих продуктах.

**Релевантность:** support-after-delivery; для пресейла маркировки — низкая.

---

## 5. Reporting и forecasting

| Report | Назначение |
|--------|------------|
| **Company reports** | Team performance: deals + activities over period; bar chart; Excel export |
| **Forecast** | Pipeline-weighted revenue; filter by pipeline/date/custom filters; score = value × stage probability |

**Probability model:** каждая stage имеет % (qualification prob для leads, win prob для opportunities). Forecast column = Σ(open deal value × stage probability) + won actuals.

**У нас:** `pipeline_stages.probability` в схеме есть; dedicated forecast UI — 🟡 partial в analytics.

---

## 6. Integrations и automation surface

### 6.1 Native CRM ↔ Teamwork.com

| Action | Direction | Auto? |
|--------|-----------|-------|
| Create project from deal | CRM → PSA | Manual |
| Link existing project | CRM → PSA | Manual |
| Create/link task | CRM → PSA | Manual |
| View deal from project Dashboard | PSA → CRM | Link only |
| Sync users | PSA → CRM | On CRM enable |
| Import companies/contacts | PSA → CRM | Manual import button |

**Нет native CRM automations** (when stage = won → create project). Automations живут в **Teamwork.com** (project-level) или **HubSpot workflows**.

### 6.2 HubSpot path (эталон auto-handoff для экосистемы Teamwork)

Из [HubSpot integration](https://www.teamwork.com/integrations/hubspot/):

```
HubSpot deal stage change
  → Create Teamwork.com project (with template, budget, owner, dates)
  → OR mark project as tentative (pre-close capacity planning)
  → CRM cards in HubSpot for manual task/project/time
  → Sync project health data back to HubSpot
```

**Паттерн tentative project:** sales pipeline drives **resource planning до подписания** — сильный инсайт для команд с длинным циклом внедрений (1С/ЧЗ).

### 6.3 Teamwork.com automations (PSA)

[Automations](https://www.teamwork.com/product/automations/): project-level triggers (column change, tag, due date) + HubSpot/Slack/Teams. Лимиты: 100 (Free) → 100k (Optimize).

**CRM не участвует** в automation builder напрямую.

### 6.4 У нас (S29)

```
automation_rules: trigger_type='stage_entered' → action_type='create_task'
```

**Разрыв:** нет `stage_entered(won) → spawn_delivery_project`; нет tentative pre-won project. Teamwork CRM тоже не имеет — но HubSpot+Teamwork **имеют** через внешний workflow.

---

## 7. AI и productivity (2026)

| Teamwork (PSA + AI) | Teamwork CRM | dashboard-crm | Вердикт |
|---------------------|--------------|---------------|---------|
| AI Project Wizard | ❌ | ❌ | Overkill |
| AI smart scheduler (Remi) | ❌ | ❌ | Accelo/PSA domain |
| Profitability forecaster (Kash) | ❌ | ❌ | 1С:ДО |
| Scout/Flo teammates | ❌ | ❌ | — |
| MCP + Claude/ChatGPT | PSA only | ❌ | — |
| Activity status colors | ✅ native | ➕ deal-health + rotting | **мы глубже на sales** |
| Pipeline auto-sort | ✅ | 🟡 manual sort | gap UX |
| AI credits (Sep 2026) | Metered | — | Внутренний инструмент — без credits |

**Teamwork CRM — без AI.** Вся AI-стратегия на PSA-стороне. dashboard-crm AI Hub (SPIN, протокол, аналит. записка) — **➕ domain depth**, не в Teamwork CRM.

---

## 8. Sales Workspace vs TodayView

| Аспект | Teamwork CRM | dashboard-crm |
|--------|--------------|---------------|
| Единая action queue | 🟡 Activities area + pipeline sort | ➕ TodayView (`/`) |
| Deal rotting | 🟡 Activity status colors (4 states) | ➕ `deal-health.ts` + `isDealRotting` |
| Reconnect | 🟡 Last interaction via activities | ➕ `use-last-touch` + Today |
| Email in timeline | ✅ Mail sync | ❌ |
| Forecast view | ✅ dedicated report | 🟡 |
| Cmd+K | ❌ | ➕ CommandPalette |
| Quick add (+ menu) | ✅ lead/opp/activity | 🟡 scattered CTAs |
| Pinned notes on deal | ✅ | ❌ |

**Вывод:** Teamwork сильнее в **pipeline-native prioritization** (цвет + sort по activities) и **email-in-CRM**. Мы сильнее в **единой action queue**, **native deal health scoring**, **keyboard UX**.

---

## 9. Gap-матрица: dashboard-crm vs Teamwork CRM

### 9.1 Где dashboard-crm **сильнее** Teamwork

| Возможность | Почему |
|-------------|--------|
| **Unified app** (sales + delivery в одной БД) | Teamwork — product switcher CRM + PSA |
| **Stage gates (DB enforcement)** | Teamwork — нет validation rules на stage transition |
| **TodayView + reconnect** | Teamwork — fragmented Activities + pipeline |
| **Deal health / rotting** | 4-factor score vs 4-color activity status |
| **AI: SPIN / протокол / аналит. записка** | Teamwork CRM — zero AI |
| **Delivery templates 1С:ДО / ERP** | Teamwork — generic PM templates |
| **Vertical pipeline** (ЧЗ, ERP, experiment) | Teamwork — horizontal agency/consulting |
| **1:N delivery per deal** | Teamwork — 1 project per deal max |
| **Leads convert без tier** | Teamwork CRM — paid Pro+ only |
| **Milestone gates на delivery** | `is_milestone` + domain RPC — нет в Teamwork CRM |

### 9.2 Ядро CRM

| Возможность | Teamwork CRM | dashboard-crm | Gap |
|-------------|--------------|---------------|-----|
| Leads | ✅ separate section | ✅ + `convert_lead` | паритет |
| Lead → Opportunity | ✅ qualify modal | ✅ RPC | паритет |
| Opportunities / Pipeline | ✅ kanban + list | ✅ PipelineBoard | паритет |
| Products on deal | ✅ catalog + multi-currency | ❌ | низкий |
| Activity types | ✅ 5 types + reminders | 🟡 calls/meetings/tasks | gap unified model |
| Activity prioritization in kanban | ✅ auto-sort + colors | ❌ | **UX gap** |
| Email sync | ✅ | ❌ | gap |
| Pinned notes | ✅ | ❌ | gap (лёгкий) |
| Forecast | ✅ probability-based | 🟡 | gap UI |
| Custom fields | ✅ | 🟡 project fields | паритет± |
| Bulk edit | ✅ | 🟡 | gap |
| Disqualify opp → lead | ✅ | 🟡 reopen? | мелкий |

### 9.3 Delivery / handoff

| Возможность | Teamwork CRM | dashboard-crm | Gap |
|-------------|--------------|---------------|-----|
| Deal ↔ delivery link | ✅ 1:1 bidirectional | ✅ `parent_deal_id` 1:N | **мы гибче** |
| Spawn from template | 🟡 manual + PSA template | 🟡 `spawn_delivery_project` RPC | оба HITL |
| Pre-won / tentative project | ✅ (any stage + HubSpot tentative) | ❌ | **инсайт Teamwork** |
| Task bridge from deal | ✅ create/link tasks | ❌ | gap (лёгкий) |
| Project quick view on deal | ✅ sidebar + quick view | 🟡 partial on detail page | UX gap (P1) |
| Phase board | ✅ PSA boards/milestones | ✅ P2a phase columns + lane | паритет intent |
| Time/budget/profitability | ✅ PSA 🔒 | ❌ (1С) | сознательно |
| Auto spawn on won | ❌ | ❌ | общий gap |
| Quotes → project | ✅ PSA Optimize | ❌ КП вне CRM | тройной gap |

### 9.4 Automations

| Возможность | Teamwork CRM | dashboard-crm | Gap |
|-------------|--------------|---------------|-----|
| CRM-native automations | ❌ | 🟡 S29 1×1 | оба слабы |
| HubSpot → project auto | ✅ via Teamwork.com | N/A | external only |
| Webhooks / Zapier | ✅ | ❌ | gap на интеграции |
| Stage enforcement | ❌ | ➕ DB gates | **мы сильнее** |

---

## 10. Архитектурное сравнение

```
Teamwork (dual-app)                    dashboard-crm (unified relational)
─────────────────────                  ─────────────────────────────────
Teamwork CRM                           leads
  Leads ──qualify──► Opportunities       convert_lead → projects(client)
  People: Companies, Contacts          companies, contacts
  Pipelines + probability              pipelines, pipeline_stages
       │ manual Add project / HubSpot workflow
       ▼
Teamwork.com PSA                         projects(type='delivery')
  Project (1 per deal)                   parent_deal_id
  Tasks (N per deal)                     tasks + project_columns(phase)
  Templates, time, budget                delivery_templates + copy RPC
  Gantt, profitability                   phase board only

Bidirectional links                      FK graph + RPC
No CRM automations                       automation_rules (minimal)
Desk ↔ deals                             —
```

**Ключевой архитектурный инсайт:** Teamwork **разделяет sales и delivery на уровне продукта** (CRM app vs PSA app), но **связывает через explicit link** раньше, чем Monday/Accelo требуют won. dashboard-crm **схлопнул** объекты в `projects.type`, что ближе к Insightly и к **будущему Teamwork Optimize** (native CRM pipeline → projects), но **позже по UX** в части deal↔delivery quick view и tentative spawn.

---

## 11. Приоритеты для dashboard-crm

Отфильтровано под домен (продажи маркировки + внедрения 1С/ЧЗ). Пересечения с monday/accelo/insightly отмечены.

### P0 — Auto-spawn delivery при won (~0.3 спринта)

**Референс Teamwork:** handoff существует, но manual; HubSpot path — auto на stage change.

*Дублирует monday P0, accelo P0.*

```
stage_entered (won) → automation:
  1. Предложить шаблон по direction+kind
  2. HITL confirm
  3. spawn_delivery_project + link parent
  4. Notify delivery owner
```

### P1 — Expanded deal card: sales + delivery quick view (~0.4 спринта)

**Референс Teamwork:** deal sidebar — Project subsection + quick view + Open in…; Tasks list с complete inline.

На странице сделки (`/deals/[id]`):
- Секция «Проекты внедрения» (1:N) с прогрессом X/Y tasks, текущая фаза
- CTA «Запустить внедрение» если нет delivery
- *Дублирует monday P1.*

### P2 — Activity-status prioritization в PipelineBoard (~0.3 спринта)

**Референс Teamwork:** 4-color status + auto-sort в kanban (overdue → no activity → today → future).

На карточках сделок в PipelineBoard:
- Индикатор по ближайшему `call`/`meeting`/`task` due (или `next_step_date`)
- Default sort в колонке по urgency (дополняет `deal-health`, не заменяет)

*Уникальный инсайт Teamwork — не дублируется в monday/accelo.*

### P3 — Tentative delivery project (pre-won) (~0.5 спринта)

**Референс Teamwork/HubSpot:** project на deal **до** won; tentative status для capacity planning.

```
projects(type='delivery', status='tentative')
  ← создать из стадии «Договор» / «Пилот» (не только won)
  → при won: status='open', полный copy_delivery_template
```

Для длинного цикла 1С/ЧЗ — планирование внедрения до подписания.

### P4 — Pinned notes на сделке (~0.2 спринта)

**Референс Teamwork:** pin note → секция над timeline.

*Дублирует hubspot notes-in-timeline, лёгкая реализация.*

### P5 — Quote/КП linked to deal (~0.5 спринта)

**Референс Teamwork Optimize:** quotes → scheduled work.

*Дублирует accelo P2, monday P3, hubspot P4.*

### P6 — Task bridge из сделки (~0.3 спринта)

**Референс Teamwork:** Add task с карточки deal без полного delivery spawn.

Лёгкие presales-задачи («подготовить демо», «запросить ТЗ») как `tasks` на `projects(client)` без `type=delivery`.

### Отложить

- Dual-app product switcher
- Teamwork Desk / ticket sidebar
- Products catalog + multi-currency line items
- Mail sync (до email-стратегии)
- PSA time tracking / billable hours / invoicing
- HubSpot integration (внешний стек)
- Webhooks/Zapier (мала команда)
- AI teammates (Scout/Flo/Kash)
- 1:1 project-per-deal constraint (наш 1:N правильнее для experiment+launch)

---

## 12. Teamwork vs Monday vs Accelo vs Insightly — что брать от кого

| Паттерн | Лучший референс | Почему |
|---------|----------------|--------|
| Unified CRM+delivery в одной БД | **Мы** + Insightly + Teamwork Optimize (будущее) | Teamwork CRM сейчас — dual-app |
| Deal → project link (bidirectional) | **Teamwork** | Explicit sidebar + quick view; проще Monday boards |
| Pre-won / tentative project | **Teamwork** (HubSpot path) | Уникально для capacity planning |
| Task bridge from deal | **Teamwork** | Granular handoff до full delivery |
| Pipeline activity prioritization | **Teamwork** | 4-color + auto-sort; Pipedrive-like |
| Phase board (group ≠ status) | **Monday** + мы | Monday — UX; мы — DB P2a |
| Auto-spawn on won | Monday (automation) / HubSpot+Teamwork | Все — HITL без automation layer |
| Quote → project | Accelo > Teamwork Optimize > мы | Financial depth |
| PSA / billing | Accelo > Teamwork PSA | Нам не нужно |
| Stage enforcement | **Мы** | DB gates > все бенчмарки |
| Action inbox | **Мы** (TodayView) | Teamwork — pipeline-fragmented |
| Delivery templates (domain) | **Мы** | 1С:ДО vs generic PM templates |
| 1:N delivery per deal | **Мы** | Teamwork — 1 project cap |

---

## 13. Что сознательно НЕ копировать

- Dual-product architecture (CRM app + PSA app + product switcher)
- 1 project per deal constraint
- Отдельный Products catalog (для ЧЗ достаточно direction/kind)
- Teamwork CRM без automations — не оправдание оставить S29 минимальным, но не копировать «ручной всё»
- PSA profitability stack (time sheets, billable rates, invoicing) — 1С:ДО
- HubSpot как обязательный middleware для handoff
- Per-seat CRM billing + отдельный PSA billing
- Teamwork Desk для пресейла
- AI credits model (September 2026)
- Disqualify → lead revert (у нас другая воронка)

---

## 14. Итоговый вывод

**Teamwork CRM — эталон по explicit deal↔project handoff для professional services**, указанный в `crm-benchmark-candidates` как «Lead → project pipeline». Анализ **подтверждает** релевантность для домена 1С/ЧЗ, с уточнением: сила Teamwork не в CRM-механике (она проще HubSpot/Pipedrive), а в **связке sales record ↔ delivery project** с template spawn и **pre-won project creation**.

**Где мы уже на уровне или сильнее Teamwork:**
- Unified schema (`projects.type`) vs dual-app
- `convert_lead` ≈ qualify lead
- `spawn_delivery_project` + domain `delivery_templates`
- Stage gates в PostgreSQL
- TodayView + deal-health
- 1:N delivery per deal (experiment + launch)

**Уникальные инсайты от Teamwork (не полностью покрыты monday/accelo):**
1. **Pre-won / tentative project** на deal (P3) — capacity planning до подписания
2. **Activity-status prioritization** в pipeline kanban (P2) — 4-color + auto-sort
3. **Task bridge** из карточки сделки без full delivery (P6)
4. **Deal sidebar** с project quick view (P1)

**Общие разрывы (сквозные с monday/accelo):**
1. Auto-spawn на won (P0)
2. Quote/КП в CRM (P5)
3. Expanded deal↔delivery context (P1)

**Стратегия:** брать у Teamwork **bidirectional link UX, tentative project, activity-based kanban sort, task bridge** — не dual-app PSA целиком. Комбинировать с Monday (**phase board UX**), Accelo (**quote→project, health**), нашими **stage gates + domain templates + TodayView**.

**Позиция в очереди бенчмарка:** Tier 3 «Lead → project pipeline» — **закрыт**. Следующий кандидат вне очереди по файлу: **folk** (IA) или **Productive.io** (agency PSA).

---

## 15. Источники

### Teamwork CRM (официальные, спарсено 2026-07-12)

- [Teamwork CRM Support Home](https://support.teamwork.com/crm)
- [Glossary — Key Terms](https://support.teamwork.com/crm/glossary/teamwork-crm-glossary)
- [Leads overview](https://support.teamwork.com/crm/getting-started/leads-overview)
- [Opportunities overview](https://support.teamwork.com/crm/getting-started/opportunities-overview)
- [Pipelines overview](https://support.teamwork.com/crm/getting-started/pipelines-overview)
- [Activities overview](https://support.teamwork.com/crm/getting-started/activities-overview)
- [People overview](https://support.teamwork.com/crm/getting-started/people-overview)
- [Products overview](https://support.teamwork.com/crm/getting-started/products-overview)
- [Qualifying a Lead](https://support.teamwork.com/crm/leads/qualifying-a-lead)
- [Marking Opportunity Won/Lost](https://support.teamwork.com/crm/opportunities/marking-an-opportunity-as-won)
- [Default pipeline sorting](https://support.teamwork.com/crm/using-teamwork-crm/default-sorting-for-pipelines)
- [Filters overview](https://support.teamwork.com/crm/using-teamwork-crm/filters-overview)
- [Forecast reports](https://support.teamwork.com/crm/reports/using-forecast-reports)
- [Adding notes + pin](https://support.teamwork.com/crm/crm-tips/adding-a-note)
- [Email sync](https://support.teamwork.com/crm/mail/connecting-your-email-account-to-teamwork-crm)
- [CRM Feature Comparison (Pro/Enterprise)](https://support.teamwork.com/crm/pricing-and-billing/teamwork-crm-feature-comparison)
- [Integrating with Teamwork.com](https://support.teamwork.com/crm/teamwork/integrating-with-teamwork)
- [Creating project from deal](https://support.teamwork.com/crm/integrations/creating-a-project-from-a-lead-or-opportunity)
- [Linking existing project](https://support.teamwork.com/crm/teamwork/linking-an-existing-project-to-a-lead-or-opportunity)
- [Creating task from deal](https://support.teamwork.com/crm/teamwork/creating-a-task-from-a-lead-or-opportunity)
- [Teamwork Desk + CRM](https://support.teamwork.com/crm/integrations/working-with-teamwork-desk)
- [Import companies/contacts from Teamwork.com](https://support.teamwork.com/crm/import/importing-companies-and-contacts-from-teamwork)

### Teamwork.com PSA (handoff + 2026 convergence)

- [Pricing (Basics–Enterprise, Optimize quotes/CRM pipeline)](https://www.teamwork.com/pricing/)
- [HubSpot integration](https://www.teamwork.com/integrations/hubspot/)
- [Automations](https://www.teamwork.com/product/automations/)
- [Project templates](https://support.teamwork.com/projects/project-templates/creating-project-templates)
- [Developer portal](https://www.teamwork.com/developers/)

### dashboard-crm (репозиторий)

- `improvements/CRMs/crm-benchmark-candidates-2026-07-12.md` — Tier 3 Teamwork CRM
- `improvements/CRMs/monday-analysis-2026-07-12.md` — board handoff
- `improvements/CRMs/accelo-analysis-2026-07-12.md` — PSA quote→job
- `improvements/CRMs/insightly-analysis-2026-07-12.md` — unified CRM+PM
- `_analysis/architecture-delivery-p2.md` — phase board contract
- `supabase/migrations/20260712230000_baseline.sql` — `spawn_delivery_project`, `stage_requirements`
- `src/lib/utils/deal-health.ts` — native rotting
- `src/components/today/TodayView.tsx` — action inbox