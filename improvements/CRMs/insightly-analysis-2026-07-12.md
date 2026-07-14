# Insightly CRM — комплексный анализ и инсайты для dashboard-crm

**Дата:** 2026-07-12  
**Метод:** парсинг insightly.com/crm, pricing, features, support.insight.ly Help Center (projects, pipelines, activity sets, workflow automation, quotes, AI Copilot), API v3.1 docs, Best Practices for Consulting, сопоставление с кодовой базой dashboard-crm.  
**Связанные документы:** `improvements/CRMs/crm-benchmark-candidates-2026-07-12.md` (Tier 4 — PSA alt, «CRM + projects в одном продукте»), `improvements/CRMs/accelo-analysis-2026-07-12.md`, `improvements/CRMs/monday-analysis-2026-07-12.md`, `_analysis/architecture-delivery-p2.md`.

---

## 0. Как читать этот документ

| Символ | Значение |
|--------|----------|
| ✅ | Паритет или сильная альтернатива |
| 🟡 | Частично / другая модель |
| ❌ | Нет |
| ➕ | Есть у нас, у Insightly нет «из коробки» или слабее |
| 🔒 | Требует платного tier Insightly |

**Контекст:** Insightly — **mid-market CRM с нативным project management** в одном продукте (не PSA как Accelo, не board-native как Monday). Сильна в **Convert Opportunity → Project** и consulting/delivery workflow для команд 10–100 человек. dashboard-crm — **вертикальная CRM** под продажи и внедрения маркировки (1С:ERP, Честный Знак). Insightly — **главный бенчмарк по «лёгкому» CRM+PM без PSA-оверхода**, альтернатива Accelo в матрице `Accelo/Insightly ●●● Delivery/PSA`.

---

## 1. Insightly в 2026 — позиционирование и архитектура

### 1.1 Слоган и стратегия

Insightly позиционируется как **«Modern CRM teams love»** — affordable, scalable cloud CRM для fast-growing компаний с нативным **project management**, workflow automation и AI Copilot (Professional+).

Ключевые концепции (с [insightly.com](https://www.insightly.com/), [CRM features](https://www.insightly.com/crm/)):

```
Insightly Platform (2026)
├── Insightly CRM (core)
│   ├── Leads → Contacts / Organizations
│   ├── Opportunities (sales pipelines)
│   ├── Projects (post-sale delivery)     ← нативно в Plus ($29)
│   ├── Tasks, Events, Emails, Notes
│   ├── Pipelines + Activity Sets
│   ├── Workflow Automation (Pro+)        ← criteria → triggers → actions
│   ├── Products / Price Books / Quotes   ← 🔒 Enterprise
│   ├── Time Tracking (Pro+)              ← timesheets + approval
│   └── AI: Copilot, email summaries/replies (Pro+)
├── Insightly Marketing (отдельный продукт)
├── Insightly Service (ticketing, SLA)
└── AppConnect (2000+ integrations, Zapier, webhooks, Lambda 🔒 Enterprise)
```

**Главное отличие от HubSpot/Attio:** Insightly — не platform CRM с add-on Projects. **Opportunity и Project — стандартные объекты одного приложения**, связанные через Convert + Links. Delivery не «отдельный board» (Monday) и не «Job в PSA-графе» (Accelo) — это **второй object type в том же CRM UI**.

**Главное отличие от Accelo:** нет quote-to-cash, rate cards, invoicing, retainers, Gantt dependencies. PM = pipelines/milestones + tasks + optional time tracking. **Легче и дешевле** для SMB consulting/integrations.

**Главное отличие от dashboard-crm:** Insightly держит **Opportunity ‖ Project** как раздельные записи; у нас — **схлопнутая таблица** `projects` с `type='client'|'delivery'`. Семантика handoff та же, реализация компактнее.

### 1.2 Заявленные метрики (маркетинг, 2026)

| Метрика | Значение |
|---------|----------|
| Клиенты | «Thousands across nearly every industry» |
| G2 / Capterra / TrustRadius | Buyer's Choice 2026, High Performer, Users Love Us |
| ROI study | Faster go-live + lower TCO vs «two major competitors» |
| Кейсы | Sport Court +242% growth; Sullivan & Stanley 2× revenue |
| Integrations | 2000+ через AppConnect |

### 1.3 Ценовая модель CRM (2026)

Источник: [insightly.com/pricing](https://www.insightly.com/pricing/), [CRM Plan Level Limits](https://support.insight.ly/en-us/Knowledge/article/3595/).

| Plan | Цена (annual) | Ключевое для delivery |
|------|---------------|----------------------|
| **Plus** | $29/user/mo | **Project management**, leads/contacts/opps, kanban, reports, 50 custom fields |
| **Professional** | $49/user/mo | Workflow automation (50/object), lead routing, **AI Copilot (75 queries)**, time tracking, custom page layouts, custom queues |
| **Enterprise** | $99/user/mo | **Quotes/Products/Price Books**, validation rules, sandboxes, audit log, Copilot 100 queries, SAML |

**Критичные tier-ограничения:**

| Фича | Plus | Professional | Enterprise |
|------|------|--------------|------------|
| Convert opp → project | ✅ | ✅ | ✅ |
| Project pipelines + milestones | ✅ | ✅ | ✅ |
| Activity Sets | ✅ | ✅ | ✅ |
| Workflow Automation | ❌ | ✅ (50/object) | ✅ |
| Time tracking | ❌ | ✅ | ✅ |
| Quotes | ❌ | ❌ | ✅ |
| Validation rules | ❌ | ❌ | ✅ (50) |
| Custom objects (billable hours) | ❌ | 25 | 200 |

**Инсайт для позиционирования:** команда 5 человек на Professional = **$245/mo** за CRM+PM+automation. dashboard-crm — внутренний инструмент без seat billing, tier-gating на workflows/quotes/validation.

**Сравнение с Accelo:** Insightly Plus **включает PM за $29**; Accelo — opaque custom quote (~$69/user reported). Insightly **проще onboarding**, Accelo **глубже financially**.

---

## 2. Объектная модель Insightly

### 2.1 Стандартные объекты

Верифицировано по [What are Insightly's standard objects?](https://support.insight.ly/en-us/Knowledge/article/1085/), [API v3.1](https://api.insightly.com/v3.1/Help):

| Insightly object | API endpoint | Назначение |
|------------------|--------------|------------|
| **Organizations** | `/Organisations` | Компании-клиенты |
| **Contacts** | `/Contacts` | Люди, linked to orgs |
| **Leads** | `/Leads` | Top-of-funnel, convert → contact + opp |
| **Opportunities** | `/Opportunities` | Sales pipeline, value, forecast |
| **Projects** | `/Projects` | Post-sale delivery, PM |
| **Tasks** | `/Tasks` | Работа на opp/project/contact |
| **Events** | `/Events` | Календарь, meetings |
| **Emails** | (synced) | Bidirectional inbox sync → Activity tab |
| **Notes** | — | Related tab |
| **Products** | `/Products` | 🔒 Enterprise |
| **Price Books** | `/PriceBooks` | 🔒 Enterprise |
| **Quotations** | `/Quotations` | 🔒 Enterprise (API name ≠ Quote) |

**Типичный sales→delivery граф** (из Help Center diagram):

```
Lead → [convert] → Contact + Organization + Opportunity
                         │
                         │ Pipeline stages + Activity Sets
                         │
                         └── [Convert To Project] → Project
                                    ├── Pipeline XOR Milestones
                                    ├── Tasks (Activity tab)
                                    └── Links back to Opportunity
```

### 2.2 Паттерн Sales → Delivery (ключевой для нашего домена)

Из [Converting an Opportunity Into a Project](https://support.insight.ly/en-us/Knowledge/article/1386/), [Project & Task Management](https://www.insightly.com/crm/project-and-task-management/):

```
Organization
  └── Opportunity — sales pipeline, probability, value
        ├── Activities (emails, calls, tasks, events)
        ├── [Actions → Convert To Project]
        │     ├── Project Name (default = opp name)
        │     ├── Reason for Winning
        │     ├── New Project Owner
        │     └── ☑ Copy Emails, Files, Notes to New Project
        └── Opportunity status → Won + auto-link to Project

Project (new)
  ├── Linked opportunity + contacts + org
  ├── Custom fields (if cloned/mapped from opp)
  └── Pipeline OR Milestones + tasks
```

**Рекомендуемый Insightly flow для consulting** ([Best Practices: Consulting](https://support.insight.ly/en-us/Knowledge/article/1054/)):

1. Lead → qualify → convert to Opportunity (New Business / Upsell / Renewal categories)
2. Opportunity progresses through **Opportunity Pipeline** (Activity Sets на стадиях)
3. Won → **Convert To Project** (one-click из Actions menu)
4. Project получает **Project Pipeline** или Milestones + Activity Sets на стадиях delivery
5. Workflow: «opp value > $25K won → email sales director»; «project In Progress → check-in task +7d»

**У нас (delivery P1–P3):**

```
companies
  └── projects(type='client') — sales pipeline, stage gates
        └── [won] → spawn_delivery_project RPC (ручной, HITL)
              └── projects(type='delivery')
                    ├── parent_project_id → client deal
                    ├── project_columns(category='phase')
                    ├── delivery_templates (ERP/IIoT × launch/experiment)
                    └── tasks + is_milestone gates
```

**Сходство:** оба **разделяют sales и delivery** и **связывают** записи после won.  
**Различия:**
- Insightly: **UI-native convert** с copy emails/files/notes + custom field mapping
- Insightly: opportunity остаётся **отдельной записью** (Won), project — новая
- Мы: **одна таблица** `projects`, spawn создаёт sibling row `type='delivery'`
- Insightly: после convert **нет auto-apply** project pipeline/tasks (нужен Activity Set или workflow)
- Мы: `copy_delivery_template` **сразу** копирует фазы и задачи из шаблона

### 2.3 Projects: Pipeline vs Milestones (критический контракт)

Из [What are Projects?](https://support.insight.ly/en-us/Knowledge/article/1363/), [What are Milestones?](https://support.insight.ly/en-us/Knowledge/article/1371/), [What are Pipelines?](https://support.insight.ly/en-us/Knowledge/article/1408/):

| Режим | Когда использовать | Возможности |
|-------|-------------------|-------------|
| **Pipeline** | Стандартный линейный процесс (onboarding, implementation) | Admin-defined stages, kanban DnD, Activity Set на stage change, default probability (opps) |
| **Milestones** | Нелинейные проекты, несколько команд | Flexible dates, shift future milestones on edit, manual creation, Activity Set → milestone |

**Жёсткое правило Insightly:** проект использует **Pipeline XOR Milestones, не оба**.

**У нас (P2a):** `project_columns category='phase'` + `tasks.lane` — **гибрид**: фаза = колонка (как Monday group), статус = lane (как Monday status column). Плюс `is_milestone` gates — **ближе к Accelo milestones**, чем к Insightly XOR.

| Insightly | dashboard-crm | Вердикт |
|-----------|---------------|---------|
| Project Pipeline stages | `project_columns(phase)` | ✅ intent |
| Milestones subtab | `is_milestone` tasks | 🟡 у нас milestone = task flag, не отдельный объект |
| Pipeline XOR Milestones | phases + milestones together | ➕ **гибче Insightly** |
| Project kanban by pipeline stage | Phase board DnD | ✅ |
| Stage → Activity Set auto | 🟡 S29 stage_entered → create_task (1 правило) | gap breadth |

### 2.4 Activity Sets — шаблоны задач

Из [What are Activity Sets?](https://support.insight.ly/en-us/Knowledge/article/1413/):

```
Activity Set = template instructions → create N tasks/events
  ├── Manual: Actions → Add Activity Set (on lead/opp/project)
  ├── Pipeline-embedded: stage change → auto-trigger
  └── Calculated due dates (relative: +3 days, +5 days…)
```

**Аналог у нас:** `delivery_templates` + `copy_delivery_template` — но **тяжелее** (целый проект с фазами), не lightweight task bundle.

**Инсайт:** Insightly разделяет **Convert** (создать пустой/linked project) и **Activity Set** (наполнить задачами). У нас spawn **объединяет** оба шага. Можно добавить **лёгкий Activity Set** для sales stages отдельно от delivery templates.

### 2.5 Маппинг на dashboard-crm

| Insightly | dashboard-crm | Комментарий |
|-----------|---------------|-------------|
| Organizations | `companies` | ✅ |
| Contacts | `contacts` | ✅ |
| Leads | `leads` + `convert_lead` | ➕ convert без tier |
| Opportunities | `projects(type='client')` | 🟡 схлопнуто в одну таблицу |
| Projects | `projects(type='delivery')` | ✅ разделение intent |
| Convert To Project | `spawn_delivery_project` | 🟡 у них UI+wizard, у нас RPC |
| Opportunity ↔ Project link | `parent_project_id` | ✅ |
| Pipelines (opp + project) | `pipelines` + `pipeline_stages` | 🟡 один sales pipeline, delivery = phase board |
| Activity Sets | `delivery_templates` (тяжелее) | 🟡 разная гранулярность |
| Tasks | `tasks` | ✅ |
| Events | `meetings` + `calls` | 🟡 |
| Emails (bidirectional sync) | ❌ EntityTimeline partial | gap |
| Notes | 🟡 не в ленте | gap |
| Quotes/Products | ❌ (КП kp-master) | gap (оба + Enterprise) |
| Time tracking | ❌ (1С:ДО) | сознательно |
| Custom objects (expenses/hours) | ❌ | consulting BP optional |
| Custom Queues | ➕ TodayView + saved views | разная модель очереди |

---

## 3. Convert Opportunity → Project (детально)

### 3.1 UX wizard Insightly

Из [article 1386](https://support.insight.ly/en-us/Knowledge/article/1386/):

| Шаг | Поле | Поведение |
|-----|------|-----------|
| 1 | Actions → **Convert To Project** | Доступно на opportunity record |
| 2 | Project Name | Default = opportunity name |
| 3 | Reason for Winning | State reason (настраиваемый список) |
| 4 | New Project Owner | Default = current user |
| 5 | Copy Emails, Files, Notes | ☑ по умолчанию; cloud links (Drive/Dropbox) **не** копируются |
| 6 | Submit | Opp → Won; project created; **auto-link** opp↔project |

**Custom fields:** копируются если [cloned + mapped](https://support.insight.ly/en-us/Knowledge/article/1330) opp→project.

### 3.2 Что Insightly НЕ делает при convert

- **Не** применяет Project Pipeline автоматически (выбирается при создании или позже)
- **Не** запускает Activity Set (unless workflow на Won)
- **Не** копирует opportunity **tasks** в project tasks (только emails/files/notes)
- **Не** создаёт quote/КП слой

### 3.3 Consulting playbook (релевантен 1С/внедрениям)

Из [Best Practices: Configuring Insightly for Consulting](https://support.insight.ly/en-us/Knowledge/article/1054/):

```
Won opportunity
  → Convert to Project
  → Category на project (vertical / service type)
  → Project Pipeline (Kickoff → Discovery → Delivery → Sign-off)
  → Activity Sets на стадиях pipeline
  → Custom fields: scope, team, dates
  → Optional: Custom Objects для billable hours/expenses (Related tab)
  → Workflow: notify on high-value won, check-in tasks on In Progress
```

**Прямая аналогия с нашим доменом:** ERP launch / ЧЗ experiment = **Categories + Project Pipeline + Activity Sets**. У нас это `delivery_templates` по `direction × kind` — **domain-specific глубже**.

### 3.4 У нас vs Insightly handoff

| Аспект | Insightly | dashboard-crm |
|--------|-----------|---------------|
| Триггер | Manual Actions menu | Manual RPC / UI button |
| Auto на Won | 🟡 только через Workflow 🔒 Pro+ | ❌ (planned P0) |
| Copy comms/files | ✅ built-in | 🟡 `project_files`, нет email |
| Template tasks | Activity Set (отдельный шаг) | `copy_delivery_template` (в spawn) |
| Won reason | ✅ state reasons | 🟡 `is_won` без reason enum |
| Owner assignment | ✅ в wizard | 🟡 project_members после spawn |
| Opp остаётся в CRM | ✅ Won + linked | ✅ client project stays |

---

## 4. Pipelines, Activity Sets и Workflow Automation

### 4.1 Pipelines (sales + delivery)

Из [What are Pipelines?](https://support.insight.ly/en-us/Knowledge/article/1408/):

- **Opportunity Pipelines:** stages + default **Probability of Winning** per stage
- **Project Pipelines:** stages для delivery kanban
- **One pipeline per record** (нельзя два)
- **Change Pipeline Stage** — quick action на record view
- **Stage duration tracking** на opportunity page layout (article 1354)
- **Smart Alerts** на stage changes (article 1225)

**Opportunity state reasons:** отдельные списки для Won/Lost — аналог audit «почему выиграли/проиграли».

### 4.2 Workflow Automation (Professional+)

Из [Overview of Workflow Automation](https://support.insight.ly/en-us/Knowledge/article/1407/), [crm/workflow-automation](https://www.insightly.com/crm/workflow-automation/):

```
Workflow Process
  └── Criteria (if record matches…)
        └── Time Triggers (optional: +N days after field X)
              └── Actions:
                    ├── Create task
                    ├── Send email
                    ├── Update record / change stage
                    ├── Create new record
                    ├── Webhook
                    └── Lambda function (🔒 Enterprise)
```

**Лимиты:** 50 workflows **per object type**; Workflow Queue + Logs (90 days).

**Релевантные use cases из документации:**

| Trigger | Action | Референс для нас |
|---------|--------|------------------|
| Opp value > $25K **won** | Email sales director | Cross-team notify (monday P2) |
| Project status → In Progress | Check-in task +7d | Delivery health |
| Pipeline stagnant N days | Email via hidden date field | Deal rotting (у нас native) |
| High-value NY opp created | Email manager + follow-up task | Lead routing |

**Сравнение с S29:**

| Возможность | Insightly WFA | dashboard-crm |
|-------------|---------------|---------------|
| No-code builder | ✅ Pro+ | 🟡 `automation_rules` UI |
| Criteria + delayed actions | ✅ time triggers | ❌ |
| Email actions | ✅ | ❌ |
| Webhooks / Lambda | ✅ Enterprise | ❌ |
| Max rules | 50/object | unlimited rows, **1×1 trigger→action** |
| Won → spawn project | 🟡 configurable | ❌ manual RPC |

### 4.3 Automation options (полный стек)

Из [Automation options](https://support.insight.ly/en-us/Knowledge/article/1401/) + pricing:

| Механизм | Tier | Назначение |
|----------|------|------------|
| Activity Sets | Plus+ | Task/event templates |
| Pipeline stage triggers | Plus+ | Auto Activity Set on stage |
| Workflow Automation | Pro+ | Full if/then + delays |
| AppConnect | Add-on | 2000+ integrations |
| Web-to-Lead forms | Plus+ | Inbound capture |

---

## 5. Quotes, Products и интеграции

### 5.1 Quotes layer (🔒 Enterprise)

Из [Guide to Products, Price Books, Quotes](https://support.insight.ly/en-us/Knowledge/article/1358/), API v3.1:

```
Product → Price Book → Opportunity Products
                          └── Quotation (Quote)
                                ├── Quote Products
                                ├── PDF / Merge Document (Word templates)
                                └── Quote sync
```

**Tier:** только Enterprise ($99/user). API: `/Products`, `/PriceBooks`, `/Quotations`.

**У нас:** КП (kp-master) вне CRM — **тройной gap** с Accelo, Monday, Insightly.

### 5.2 Интеграции для consulting

Из Consulting BP + [AppConnect](https://www.insightly.com/appconnect/):

| Integration | Use case |
|-------------|----------|
| **PandaDoc** | Proposal из opportunity fields → recipients from linked contacts |
| **QuickBooks Online** | Customers, invoices view in CRM |
| **DocuSign** | Contract signing |
| **Gmail / Outlook** | Bidirectional email sync |
| **Slack** | Notifications |
| **Zapier** | Custom flows |

**Для 1С/ЧЗ:** Insightly не имеет native 1С connector — аналогично нам; учёт в ERP вне CRM.

### 5.3 Time tracking (Professional+)

Из [Time Tracking for Tasks](https://support.insight.ly/en-us/Knowledge/article/8519/):

- Daily/Weekly timesheets, timers, submit → approve workflow
- Rollup hours per task → reports
- **Не** full PSA billing — нет rate cards/invoicing из коробки (consulting BP предлагает Custom Objects)

**Стратегия для нас:** сознательно **не копировать** — учёт в 1С:ДО.

---

## 6. AI-стратегия Insightly vs AI Hub

| Insightly (2026) | dashboard-crm | Вердикт |
|------------------|---------------|---------|
| **Copilot** — NL queries, create/update records | AI Hub — 3 доменных пресета | Разный фокус |
| Email summaries | 🟡 transcripts | 🟡 |
| Email reply generation | ❌ | Gap (низкий) |
| «Which opps stalled 90 days?» | `deal-health.ts`, TodayView | ➕ **native без query limits** |
| «Create contact/opportunity via chat» | ❌ Cmd+K navigation | разные паттерны |
| Copilot limits | 75 (Pro) / 100 (Ent) queries | ➕ без metered AI |
| Data hygiene prompts | Generic CRM | ➕ domain AI (SPIN, протокол) |
| HITL on record changes | ✅ confirm dialog | 🟡 ai_runs partial |

**Инсайт:** Insightly Copilot — **horizontal CRM assistant** (как Monday Sidekick). Наш AI Hub — **vertical sales/delivery intelligence**. Тренд «transcript → suggest fields» общий (HubSpot SDP, Monday Notetaker) — у нас фундамент есть.

---

## 7. Sales Workspace vs TodayView

| Аспект | Insightly | dashboard-crm |
|--------|-----------|---------------|
| Единая очередь действий | 🟡 Custom Queues 🔒 Pro+ | ➕ TodayView (`/`) |
| Deal rotting | 🟡 WFA + stagnant pipeline hack | ➕ Native `deal-health.ts` |
| Reconnect cooling contacts | 🟡 Copilot query / reports | ➕ `use-last-touch` + Today |
| Email-open triggers | ✅ WFA | ❌ |
| Cross-team won notify | ✅ WFA example | 🟡 |
| Keyboard productivity | 🟡 shortcuts list | ➕ Cmd+K CommandPalette |
| Mobile CRM | ✅ iOS/Android | 🟡 responsive web |
| Bidirectional email | ✅ | ❌ |

**Custom Queues** (Professional): настраиваемые очереди tasks/opps/projects/leads — **фрагментированная альтернатива** TodayView, не unified inbox.

---

## 8. Gap-матрица: dashboard-crm vs Insightly

### 8.1 Где dashboard-crm **сильнее** Insightly

| Возможность | Почему |
|-------------|--------|
| **Stage gates (DB enforcement)** | Insightly validation rules 🔒 Enterprise only; у нас `check_stage_requirements()` |
| **TodayView + reconnect** | Native action queue vs Custom Queues / reports |
| **Deal health / rotting** | Native, не WFA workaround |
| **AI: SPIN / протокол / аналит. записка** | Domain presets vs generic Copilot |
| **Delivery templates 1С:ДО / ERP** | Insightly — generic consulting pipelines |
| **Vertical pipeline** (ЧЗ, ERP, experiment) | Insightly — horizontal CRM |
| **Phases + milestones together** | Insightly XOR pipeline/milestones |
| **Workflows без tier** | Insightly WFA 🔒 Pro+ |
| **Quotes без $99 tier** | N/A — у нас тоже нет, но без vendor lock |
| **Schema via migrations** | Insightly — admin UI config sprawl |

### 8.2 Ядро CRM

| Возможность | Insightly | dashboard-crm | Gap |
|-------------|-----------|---------------|-----|
| Contacts / Organizations | ✅ | ✅ | паритет |
| Leads | ✅ | ✅ + convert | ➕ |
| Opportunities / Pipeline | ✅ + kanban | ✅ PipelineBoard | паритет |
| Разделение sales / delivery | ✅ opp ‖ project objects | ✅ `type=client\|delivery` | **паритет intent** |
| Convert handoff | ✅ UI wizard + copy | 🟡 RPC spawn | **UX gap** |
| Activity timeline | ✅ Emails in Activity tab | 🟡 EntityTimeline | gap email |
| Won/Lost reasons | ✅ state reasons | 🟡 | gap |
| Stage duration tracking | ✅ opp layout | ❌ | низкий |
| Files на сделке | ✅ + copy to project | ✅ `project_files` | 🟡 copy semantics |
| Excel-импорт | ✅ | ✅ ExcelImport | паритет |

### 8.3 Delivery / project execution

| Возможность | Insightly | dashboard-crm | Gap |
|-------------|-----------|---------------|-----|
| Phase board | ✅ Project Pipeline kanban | ✅ phase columns + `tasks.lane` | **паритет** |
| Milestones | ✅ XOR pipeline | ✅ `is_milestone` + gates | ➕ combined model |
| Template spawn | 🟡 Activity Set (manual/auto stage) | ➕ `delivery_templates` RPC | ➕ domain depth |
| Convert copies comms | ✅ emails/files/notes | ❌ email | gap |
| Custom field mapping opp→project | ✅ clone/map | 🟡 shared company_id | gap |
| Project owner in wizard | ✅ | 🟡 members after | UX gap |
| Time tracking | ✅ 🔒 Pro+ | ❌ (1С) | сознательно |
| Billable hours (custom obj) | 🟡 Enterprise custom objects | ❌ | опционально |
| Delivery health | 🟡 WFA + reports | ❌ | accelo P3 |
| Gantt | ❌ | ❌ | — |

### 8.4 Automations и data quality

| Возможность | Insightly | dashboard-crm | Gap |
|-------------|-----------|---------------|-----|
| Activity Sets | ✅ Plus+ | 🟡 delivery_templates only | sales-stage gap |
| Workflow automation | ✅ 🔒 Pro+ | 🟡 S29 | **breadth gap** |
| Pipeline stage → tasks | ✅ Activity Set embed | 🟡 1 rule | gap |
| Validation rules | 🔒 Enterprise | ➕ DB stage gates | **мы сильнее** |
| Approval processes | ✅ Enterprise | ❌ | низкий |
| Audit log | 🔒 Enterprise 18mo | 🟡 Supabase + migrations | разная модель |

---

## 9. Архитектурное сравнение

```
Insightly (multi-object CRM)          dashboard-crm (relational, collapsed)
────────────────────────────          ─────────────────────────────────────
Organizations ─────────────           companies
Contacts ──────────────────           contacts
Leads ─────────────────────           leads
Opportunities ─────────────┐          projects (type=client)
                           │ Convert To Project / spawn_delivery_project RPC
Projects ──────────────────┘          projects (type=delivery)
  Pipeline XOR Milestones               project_columns (phase) + tasks.lane
  Activity Sets                         delivery_templates + copy RPC
  Tasks                                 tasks + is_milestone

Links (Related tab)                   FK: company_id, parent_project_id
Emails (Activity tab)                 EntityTimeline (partial)
Workflow Automation (Pro+)            automation_rules (1×1)
Activity Sets (light templates)       delivery_templates (heavy templates)
```

**Ключевой архитектурный инсайт:** в `crm-benchmark-candidates` Insightly описан как «CRM + projects в одном продукте (как ваша схлопнутая модель)». Точнее: **семантика одного продукта** совпадает, но Insightly — **два object types** (Opportunity + Project), мы — **один table + type discriminator**. Наш подход **компактнее для запросов и FK**; Insightly — **богаче UX convert** и **чище разделение forecast (opps) vs execution (projects)**.

**Сравнение с Monday:** Monday — boards + Connect; Insightly — **classic CRM objects + convert**; мы — **relational collapsed model**. Insightly ближе к Accelo/Salesforce по object mental model, но **без PSA depth**.

---

## 10. Приоритеты для dashboard-crm

Отфильтровано под домен (продажи маркировки + внедрения 1С/ЧЗ). Пересечения с monday/accelo отмечены.

### P0 — Convert wizard + auto-spawn на won (~0.4 спринта)

**Референс Insightly:** Actions → Convert To Project + optional Workflow on Won.

Объединить лучшее:
```
stage_entered (won) → automation:
  1. Модалка convert (как Insightly): owner, won reason, copy files
  2. Предложить delivery_template по direction+kind
  3. HITL confirm → spawn_delivery_project
  4. Notify delivery owner (+ optional finance)
```

*Дублирует monday P0, accelo P0.*

### P1 — Expanded deal card: opp + delivery context (~0.4 спринта)

**Референс Insightly:** Related tab — linked project, contacts, emails, files.

На `projects(client)` detail:
- Связанные `projects(delivery)` через `parent_project_id`
- Прогресс delivery (фаза, X/Y tasks)
- CTA «Запустить внедрение» / «Convert to Project»

*Дублирует monday P1.*

### P2 — Won/Lost reasons + copy semantics (~0.2 спринта)

**Референс Insightly:** Opportunity state reasons; copy emails/files/notes checkbox.

- Enum `won_reason` / `lost_reason` на client project
- При spawn: опция copy `project_files` + notes в delivery

### P3 — Activity Sets lite для sales stages (~0.3 спринта)

**Референс Insightly:** Activity Set на pipeline stage (не только delivery_templates).

Лёгкие шаблоны задач при входе в стадию («КП отправлено» → follow-up +3d) — **отдельно** от тяжёлых delivery_templates.

*Расширяет S29 без полного WFA engine.*

### P4 — Quote/КП linked to deal (~0.5 спринта)

**Референс Insightly Enterprise Quotes** (без копирования tier lock).

*Дублирует accelo P2, monday P3, hubspot P4.*

### P5 — Cross-functional WFA на won (~0.3 спринта)

**Референс Insightly:** «Opp > X won → email director» + «Project In Progress → check-in +7d».

Минимальный набор `automation_rules` с `notify` action.

*Дублирует monday P2.*

### P6 — Delivery health badge (~0.4 спринта)

**Референс Insightly WFA stagnant pipeline pattern + Accelo health.**

*Дублирует accelo P3, monday P5.*

### P7 — Smart Deal Progression HITL (~0.5 спринта)

**Референс Insightly email summaries + HubSpot SDP.**

*Дублирует hubspot P0.*

### Отложить

- Time tracking / timesheets (1С:ДО)
- Custom objects для billable hours
- Insightly Marketing / Service Hub
- Enterprise Quotes/Products (до появления quote в CRM)
- Lambda / AppConnect dependency
- Full WFA engine (50 rules/object) — overkill для 5–15 человек
- Pipeline XOR Milestones constraint — наша гибридная модель лучше
- Copilot generic assistant

---

## 11. Insightly vs Accelo vs Monday — что брать от кого

| Паттерн | Лучший референс | Почему |
|---------|----------------|--------|
| CRM + PM в одном продукте (лёгкий) | **Insightly** | PM в Plus $29; Accelo — heavy PSA |
| Convert opp → project UX | **Insightly** | Wizard + copy comms + link |
| Phase board (фаза ≠ статус) | **Monday** + мы | Monday UX-эталон; мы DB-контракт P2a |
| Template tasks на stage | **Insightly** Activity Sets | Легче delivery_templates |
| Heavy delivery templates | **Мы** | Domain 1С:ДО / ERP |
| Quote → project | **Accelo** > Insightly 🔒 Ent | Financial depth |
| PSA / billing | **Accelo** | Нам не нужно |
| Stage enforcement | **Мы** | DB gates > Insightly validation 🔒 Ent |
| Workflow breadth | Insightly > Monday > мы | Insightly WFA глубже monday when/then |
| Board handoff | **Monday** | Automation create project board |
| Action inbox | **Мы** (TodayView) | Insightly — queues/reports |
| Collapsed data model | **Мы** | Один `projects` table vs opp+project |

---

## 12. Что сознательно НЕ копировать

- Два отдельных object type в UI (Opportunity tab + Project tab) — у нас collapsed model **осознанный**
- Pipeline **XOR** Milestones — наша гибридная фаза+milestone модель гибче
- Time tracking + timesheet approval (1С:ДО)
- Custom objects для expenses/hours без 1С интеграции
- Enterprise tier lock на quotes ($99/user) и validation rules
- Insightly Marketing / Service как отдельные продукты
- AppConnect $249–$1899/mo + $3K setup
- Copilot query limits и generic NL assistant
- Consulting-generic pipelines без domain ERP/ЧЗ templates
- Bidirectional email sync как prerequisite (дорого в поддержке)
- Admin UI config sprawl без migration guardrails

---

## 13. Итоговый вывод

**Insightly — эталон #2 по «лёгкому CRM+PM»** (после Monday по UX фаз, перед Accelo по financial depth). В `crm-benchmark-candidates` указана сила: **CRM + projects в одном продукте**. Анализ **уточняет**: семантика совпадает с нашей, но Insightly использует **раздельные Opportunity/Project**, мы — **схлопнутую `projects` таблицу** — наш подход компактнее, Insightly богаче **convert UX**.

**Где мы уже на уровне Insightly:**
- Разделение sales / delivery
- Фазовая доска delivery
- Delivery templates (глубже domain)
- Stage gates (сильнее Insightly validation)
- TodayView vs Custom Queues

**Оставшиеся разрывы (Insightly-specific):**
1. **Convert wizard** (P0) — copy files, won reason, owner, one-click semantics
2. **Related context на deal card** (P1) — linked delivery + timeline
3. **Activity Sets lite** (P3) — sales-stage task bundles отдельно от delivery spawn
4. **Won/Lost reasons** (P2) — state reasons на client project
5. **Workflow breadth** (P5) — delayed actions, email notify (сквозной gap)
6. **Quote/КП** (P4) — Insightly 🔒 Enterprise, у нас вне CRM

**Конкурентные преимущества сохранять:**
- Collapsed `projects` model с `parent_project_id`
- Вертикальные воронки маркировки
- Stage gates в PostgreSQL
- Domain AI (SPIN, протокол)
- TodayView
- `delivery_templates` из методологии ERP/1С:ДО
- Без PSA/tier оверхода

**Стратегия:** брать у Insightly **convert wizard, Activity Sets для sales stages, won reasons, WFA notify patterns, consulting BP structure** — не весь Insightly stack. Комбинировать с Monday (**phase board UX**), Accelo (**quote layer, delivery health**), нашими **DB gates + domain templates**.

---

## 14. Источники

### Insightly (официальные, спарсено 2026-07-12)

- [Homepage](https://www.insightly.com/)
- [CRM overview](https://www.insightly.com/crm/)
- [Project & Task Management](https://www.insightly.com/crm/project-and-task-management/)
- [Workflow Automation](https://www.insightly.com/crm/workflow-automation/)
- [Validation Rules & Advanced Permissions](https://www.insightly.com/crm/validation-rules-advanced-permissions/)
- [AI CRM](https://www.insightly.com/crm/ai-crm/)
- [Pricing](https://www.insightly.com/pricing/)
- [AppConnect](https://www.insightly.com/appconnect/)
- [API v3.1 Help](https://api.insightly.com/v3.1/Help)

### Insightly Help Center (support.insight.ly/en-us)

- [What are Insightly's standard objects?](https://support.insight.ly/en-us/Knowledge/article/1085/)
- [Converting an Opportunity Into a Project](https://support.insight.ly/en-us/Knowledge/article/1386/)
- [What are Projects?](https://support.insight.ly/en-us/Knowledge/article/1363/)
- [What are Milestones?](https://support.insight.ly/en-us/Knowledge/article/1371/)
- [What are Pipelines?](https://support.insight.ly/en-us/Knowledge/article/1408/)
- [What are Activity Sets?](https://support.insight.ly/en-us/Knowledge/article/1413/)
- [Overview of Workflow Automation](https://support.insight.ly/en-us/Knowledge/article/1407/)
- [Best Practices: Configuring Insightly for Consulting](https://support.insight.ly/en-us/Knowledge/article/1054/)
- [The Guide to Products, Price Books, and Quotes](https://support.insight.ly/en-us/Knowledge/article/1358/)
- [CRM Plan Level Limits](https://support.insight.ly/en-us/Knowledge/article/3595/)
- [Insightly Copilot Overview](https://support.insight.ly/en-us/Knowledge/article/11607/)
- [Time Tracking for Tasks](https://support.insight.ly/en-us/Knowledge/article/8519/)
- [Keyboard shortcuts](https://support.insight.ly/en-us/Knowledge/article/1056/)

### dashboard-crm (репозиторий)

- `improvements/CRMs/crm-benchmark-candidates-2026-07-12.md` — Insightly Tier 4 / PSA alt
- `improvements/CRMs/accelo-analysis-2026-07-12.md` — PSA handoff
- `improvements/CRMs/monday-analysis-2026-07-12.md` — phase board + handoff
- `_analysis/architecture-delivery-p2.md` — фазовая доска
- `supabase/migrations/20260712230000_baseline.sql` — `spawn_delivery_project`, `delivery_templates`
- `src/lib/utils/deal-health.ts` — rotting native
- `src/components/today/TodayView.tsx` — action inbox
- `src/lib/hooks/use-automation-rules.ts` — S29 automation