# Accelo PSA — комплексный анализ и инсайты для dashboard-crm

**Дата:** 2026-07-12  
**Метод:** парсинг accelo.com, Help Center (glossary, sales, projects, progressions, tickets, Power BI), API docs (api.accelo.com), сопоставление с кодовой базой dashboard-crm.  
**Связанные документы:** `improvements/crm-benchmark-candidates-2026-07-12.md` (приоритет #3 PSA/delivery), `improvements/hubspot-analysis-2026-07-12.md`, `improvements/pipedrive-analysis-2026-07-12.md`, `_analysis/handoff-delivery-p1.md`.

---

## 0. Как читать этот документ

| Символ | Значение |
|--------|----------|
| ✅ | Паритет или сильная альтернатива |
| 🟡 | Частично / другая модель |
| ❌ | Нет |
| ➕ | Есть у нас, у Accelo нет «из коробки» или слабее |
| 🔒 | Требует платного tier Accelo |

**Контекст:** Accelo — **PSA (Professional Services Automation)** для IT-интеграторов, digital-агентств и консалтинга (15–150 человек). dashboard-crm — **вертикальная CRM** под продажи и внедрения маркировки (1С:ERP, Честный Знак). Accelo — **главный бенчмарк по delivery-контуру** после выигрыша сделки: sales → quote → project → tickets → billing. HubSpot/Attio/Pipedrive сильнее в sales UX; Accelo сильнее в **исполнении внедрения**.

---

## 1. Accelo в 2026 — позиционирование и архитектура

### 1.1 Слоган и стратегия

Accelo позиционируется как **«AI-Powered PSA Software»** — единая операционная система professional services, где AI предсказывает исходы, а не только фиксирует прошлое.

Ключевые концепции (с [accelo.com](https://www.accelo.com), [PSA features](https://www.accelo.com/features/workflow-automation)):

```
PSA Lifecycle (единый граф)
├── Sales (Prospects) — pipeline, weighted forecast, quotes
├── Jobs (Projects) — milestones, tasks, Gantt, budgets
├── Issues (Tickets) — short-term billable work, SLA
├── Contracts (Retainers) — recurring engagements
├── Activities — emails, calls, meetings, notes + time tracking
├── Financials — time, expenses, invoicing, margin
└── AI layer — predictive health, resourcing, margin guard, MCP

Поверх:
├── Progressions & Actions — status flow + enforced steps
├── Triggers — time/condition-based automation
├── Client Portal — self-service для клиента
├── Power BI — полный data export
└── Forecast (acquired 2025) — capacity planning (отдельный продукт)
```

**Главное отличие от HubSpot/Pipedrive:** Accelo не «CRM + add-on projects». Это **quote-to-cash platform** — продажа, планирование, исполнение и биллинг в одном графе объектов.

**Связка с Forecast (июль 2025):** Accelo приобрёл [Forecast](https://www.accelo.com/blog/forecast-accelo-brand-website-integration) для AI capacity planning. Продукты пока раздельны (отдельный login), но стратегия — unified PSA + forecasting.

### 1.5 Заявленные метрики (маркетинг, 2026)

| Метрика | Значение |
|---------|----------|
| Отзывы | 1,000+ (G2, Capterra, GetApp) |
| Revenue leakage recovered | 3–7% |
| Admin time savings | 30–35% |
| Margin erosion reduction | 12–18% |
| Billable utilization increase | 5–8% |

### 1.3 Ценовая модель (2026)

| Аспект | Значение |
|--------|----------|
| Публичные цены | ❌ Нет — custom quote через sales |
| Планы (Help Center) | Mix and Match, Elite, Premium |
| Ориентир (user-reported) | ~$69/user/mo Premium ([TrustRadius](https://www.trustradius.com/products/accelo/reviews)) |
| Free tier | ❌ |
| Implementation | Self-Starter / Account Setup / Full Implementation (quote) |
| Billing | Monthly, quarterly, yearly |

**Инсайт для позиционирования:** Accelo — enterprise-lite PSA с opaque pricing и тяжёлым onboarding. Для команды 5–15 человек под маркировку/1С custom PSA = $345–1035/mo + implementation. dashboard-crm даёт **delivery-контур без PSA-оверхода** (time tracking, invoicing, retainers).

---

## 2. Объектная модель Accelo

### 2.1 Модули и API-объекты

Accelo использует **модульную PSA-модель** с отдельными объектами на каждый этап lifecycle. Верифицировано по [API Reference](https://api.accelo.com/docs/) и [Glossary](https://help.accelo.com/get-started/accelo-glossary/):

| Accelo модуль | API object | Назначение |
|---------------|------------|------------|
| **Companies** | `company` | Клиентские организации |
| **Contacts** | `contact` + `affiliation` | Люди + связь contact↔company (email/phone на affiliation) |
| **Sales** | `prospect` | Sales pipeline (Opportunity) |
| **Quotes** | quote (в sales flow) | Estimate → proposal → client approval |
| **Projects** | `job` | Delivery: milestones, tasks, budget |
| **Milestones** | `milestone` | Фазы проекта с budget/dates/tasks |
| **Tasks** | `task` | Работа + checklists + time |
| **Tickets** | `issue` | Short-term support/enhancement work |
| **Retainers** | `contract` | Recurring engagements |
| **Activities** | `activity` | Email, call, meeting, note, postal |
| **Invoices** | `invoice` | Billing |
| **Expenses** | `expense` | Materials, reimbursements |
| **Assets** | `asset` | Client credentials, configs (custom fields) |
| **Requests** | request | Pre-ticket inbox (team inbox) |

**Types:** каждый модуль конфигурируется через **Types** (Sale Type, Job Type, Issue Type) — отдельные status flows, progressions, profile fields.

### 2.2 Паттерн Sales → Delivery (ключевой для нашего домена)

Из [Sales module](https://help.accelo.com/guides/user/modules/sales/), [Close a Sale](https://help.accelo.com/guides/user/modules/sales/close-a-sale/), [Quote to Project](https://help.accelo.com/guides/user/modules/sales/quotes/convert-quote-to-project/):

```
Company
  └── Sale (Prospect) — pipeline, progress %, weighted value
        ├── Activities (calls, meetings, emails, notes)
        ├── Quote (Estimate) — milestones, tasks, budgets, services
        │     └── [Convert to Project] — one click
        └── Create Related → Project | Ticket | Retainer
              └── Job linked to Sale (full client lifecycle)
```

**Рекомендуемый Accelo flow для внедрений:**
1. Sale progresses through sales statuses (с Progress % для forecast)
2. На стадии «Proposal» → Special Action **Create Project Quote** (estimate с milestones/tasks)
3. Quote approved клиентом → **Convert to Project** (milestones, tasks, budgets копируются)
4. Или после Won → **Create Related → Project** вручную
5. Project Manager назначает work, логирует time, approve → invoice

**У нас (delivery P1–P3):**
```
companies
  └── projects(type='client') — sales pipeline, stage gates
        └── [won] → spawn_delivery_project RPC
              └── projects(type='delivery') — фазовая доска
                    ├── project_columns(category='phase')
                    ├── delivery_templates (ERP launch / experiment / IIoT)
                    └── tasks + is_milestone gates
```

**Сходство:** оба разделяют sales и delivery. **Различие:** у Accelo quote — обязательный промежуточный артефакт с budget; у нас КП (kp-master) вне CRM, spawn — из won-сделки по шаблону.

### 2.3 Projects: Milestones, Tasks, Budget

Из [Projects module](https://help.accelo.com/guides/user/modules/projects/), [View a Milestone](https://help.accelo.com/guides/user/modules/projects/view-a-milestone/):

| Уровень | Возможности |
|---------|-------------|
| **Job (Project)** | Gantt, portfolio view, rate cards, signoffs, project plan |
| **Milestone** | Budget, start/due (planned/actual/forecast), manager, Insights tab |
| **Task** | Checklists, assignee, time budget, auto-scheduled time |
| **Stream** | Activities timeline per milestone/project |

**Project health (2026 AI):** planned vs actual time/expenses, scope creep detection, forecasted completion, margin risk.

**У нас:**
| Accelo | dashboard-crm | Статус |
|--------|---------------|--------|
| Milestones | `project_columns(category='phase')` | 🟡 колонки = фазы, не nested milestones |
| Milestone budget | ❌ | gap |
| Task checklists | ❌ | gap |
| Gantt / dependencies | ❌ | gap |
| `is_milestone` gate | `check_delivery_completion()` | ➕ domain-specific |
| Phase board (kanban) | `ProjectBoard mode='phase'` | ✅ |
| Delivery templates | `delivery_templates` + `copy_delivery_template` | ✅ |
| Project members (roles) | `project_members` (manager/implementer/installer) | ✅ P2b |

### 2.4 Tickets vs Projects

Из [Tickets module](https://help.accelo.com/guides/user/modules/tickets/):

| Критерий | Tickets (Issues) | Projects (Jobs) |
|----------|------------------|-----------------|
| Длительность | Short-term, one phase | Long-term, multi-milestone |
| Milestones | ❌ | ✅ |
| Зависимости задач | ❌ | ✅ |
| Use case | Bug fix, training, consulting session | Website build, ERP implementation |

**Для нас:** post-delivery поддержка (вопросы по ЧЗ, доработки 1С) ближе к **Tickets**, чем к Projects. Сейчас ❌ — потенциальный P6.

### 2.5 Маппинг на dashboard-crm

| Accelo | dashboard-crm | Комментарий |
|--------|---------------|-------------|
| Companies | `companies` | ✅ |
| Contacts + Affiliations | `contacts` | 🟡 нет affiliation layer |
| Sales / Prospects | `projects(type='client')` | 🟡 схлопнуто с internal/delivery в одной таблице |
| Quotes | ❌ (КП в kp-master) | gap |
| Jobs (Projects) | `projects(type='delivery'|'internal')` | ➕ 3 типа + domain templates |
| Milestones | `project_columns(phase)` | 🟡 плоская модель |
| Tasks | `tasks` + `project_columns` | ✅ |
| Issues (Tickets) | ❌ | gap |
| Retainers | ❌ | вне домена |
| Activities | `calls`, `meetings`, `activities` | 🟡 без email sync |
| Time tracking | ❌ | сознательно (1С/ДО) |
| Invoices / Billing | ❌ (1С) | сознательно |
| Assets | ❌ | опционально (credentials) |
| Profile/Extension fields | migrations + custom columns | ➕ гибче, без UI |

---

## 3. Progressions & Actions — workflow-движок Accelo

### 3.1 Концепция

Из [Progressions & Actions](https://help.accelo.com/guides/settings-and-configuration-guide/triggers-and-business-processes/business-processes/progressions/):

```
Status (box) ──Progression (arrow)──> Status (box)
                      │
                      └── Actions (on transition):
                            ├── Update Field (required/hidden)
                            ├── Upload File
                            ├── Create Task
                            ├── Create Activity
                            └── Special Process (invoice, work done, create quote…)
```

**Ключевые правила:**
- Progressions работают только при смене статуса через **View screen** (не Edit screen)
- Actions выполняются в порядке: Field → File → Task → Activity → Special → Webhook
- **Required** actions блокируют переход без заполнения
- **Hidden** actions — фоновая автоматизация (metrics, emails)
- Sales: Progress % на progression → weighted forecast
- Projects: **Workflow required** — нельзя прогрессировать без завершения milestone workflow

### 3.2 Sale-specific Special Actions

Из [Sale Actions](https://help.accelo.com/guides/settings-and-configuration-guide/triggers-and-business-processes/business-processes/progressions/special-process-actions-2/sale-actions/):

| Action | Когда | Что делает |
|--------|-------|------------|
| **Work Done** | Won | Auto-complete all sale tasks |
| **Work Canceled** | Lost | Cancel all sale tasks |
| **Cancel Outstanding Tasks** | Canceled | Cancel remaining tasks |
| **Create Project Quote** | Proposal stage | Navigate to estimate builder |

### 3.3 Triggers (отдельно от Progressions)

**Triggers** — event/time-based rules (не привязаны к view progression):
- Ticket age > N days → escalate priority
- No activity on project → notify manager
- Reminder emails before close

Источник: [Tickets Triggers](https://help.accelo.com/guides/user/modules/tickets/), [process automation](https://www.accelo.com/features/process-automation).

### 3.4 Сравнение с dashboard-crm

| Возможность | Accelo | dashboard-crm | Gap |
|-------------|--------|---------------|-----|
| Status progressions | ✅ per Type, visual flow | 🟡 pipeline_stages | нет UI-конфигуратора |
| Required fields on transition | ✅ Progression Actions | ➕ `stage_requirements` + `check_stage_requirements()` | **мы сильнее** (hard DB gate) |
| Auto-create tasks on transition | ✅ Create Task action | 🟡 S29 `stage_entered → create_task` | разрыв |
| Auto-create project on won | 🟡 Create Related (manual) + quote convert | 🟡 `spawn_delivery_project` (manual RPC) | оба не fully auto |
| Hidden background actions | ✅ | ❌ | gap |
| Time-based triggers | ✅ | ❌ | gap (часть P1 workflow) |
| Workflow required (milestone gate) | ✅ | ➕ `is_milestone` + `check_delivery_completion` | **паритет по intent** |
| Run log | 🟡 progression history | 🟡 `automation_runs` | частичный |

**Инсайт:** Accelo Progressions ≈ наш `stage_requirements` + `automation_rules`, но с **интерактивным UI** (prompt user on transition) и **большим каталогом special actions**. У нас enforcement сильнее (DB trigger), у Accelo — богаче UX перехода.

---

## 4. AI-стратегия Accelo vs AI Hub

| Accelo AI (2026) | dashboard-crm | Вердикт |
|------------------|---------------|---------|
| **Native ML** — learns from delivery patterns | ❌ | Не копируем |
| **Project health / margin risk** | 🟡 deal-health только для sales | gap на delivery |
| **Predictive completion dates** | ❌ | gap |
| **AI resourcing** (skill, availability) | ❌ | вне домена (команда мала) |
| **MCP** — NL queries в Claude/ChatGPT | ❌ | отложить |
| **In-app agentic assistants** | ❌ | отложить |
| **Margin Guard / Early Issue Detection** | ❌ | 🟡 можно lightweight health |
| **Meeting/call AI** | ❌ | ➕ AI Hub (SPIN, протокол) **сильнее в нише** |

**Инсайт:** Accelo AI заточен под **profitability и capacity** (PSA-метрики). Наш AI Hub — под **sales intelligence** (звонки, SPIN, протоколы внедрения). Пересечение — **post-meeting HITL** (Smart Deal Progression / Follow-Up Agent), уже в приоритетах HubSpot/Attio.

---

## 5. Reporting и Client Portal

### 5.1 Power BI (встроенные отчёты)

Из [Power BI Integration](https://help.accelo.com/guides/integrations-guide/power-bi/):

| Report | Назначение |
|--------|------------|
| Sales Pipeline | Breakdown by stage, weighted value |
| Sales Forecast | Expected revenue by month |
| Won/Lost Sales | By salesperson and type |
| Billing Revenue | Billed vs outstanding |
| Project Budget Monitor | Service/material budgets |
| Timesheet Report | Time by person, rate, status |
| Open Tickets / Open Tasks | Operational queues |

**У нас:** `overview` + `analytics` + `WeeklyReview` — паритет для sales, **слабее** для delivery financials.

### 5.2 Client Portal

[Client Portal](https://help.accelo.com/guides/user/client-portal/) — клиент видит Sales, Quotes, Projects, Tickets, Invoices, Requests, Assets. Self-service requests, invoice payment.

**У нас:** ❌. Для B2B промышленных клиентов (ЧЗ, 1С) — опционально, не P0.

---

## 6. Gap-матрица: dashboard-crm vs Accelo

### 6.1 Где dashboard-crm **сильнее** Accelo

| Возможность | Почему |
|-------------|--------|
| **Stage gates** (hard DB enforcement) | Accelo — required fields в UI; мы — `check_stage_requirements()` + trigger |
| **Vertical pipeline** (ЧЗ, ERP, experiment) | Accelo — generic PSA types |
| **Domain AI** (SPIN, протокол, аналит. записка) | Accelo — generic operational AI |
| **TodayView + reconnect** | Accelo — dashboards, не единая sales queue |
| **Deal health / rotting** | Accelo — sales progress %, не activity-based rotting |
| **Leads + convert** | Accelo — sales against company only |
| **Delivery templates по 1С:ДО** | Accelo — generic project templates |
| **Milestone gate по домену** | `is_milestone` + `check_delivery_completion` под ERP/IIoT фазы |
| **Без PSA-оверхода** | Нет необходимости в time tracking, invoicing, rate cards |
| **Multi-tenant RLS** | Accelo — deployment-level |

### 6.2 Sales-контур

| Возможность | Accelo | dashboard-crm | Gap |
|-------------|--------|---------------|-----|
| Sales pipeline | ✅ Prospects + Types | ✅ `projects(client)` | 🟡 |
| Weighted forecast | ✅ Progress % per status | 🟡 `probability` в STAGE_CONFIG | паритет |
| Quotes / proposals | ✅ integrated | ❌ (kp-master) | **gap** |
| Sale → project link | ✅ Create Related | ✅ `parent_project_id` / spawn | паритет |
| Sale activities | ✅ unified Activities | ✅ calls/meetings/tasks | 🟡 без email |
| Auto tasks on won/lost | ✅ Special Actions | 🟡 automation S29 | разрыв |

### 6.3 Delivery-контур (главная зона бенчмарка)

| Возможность | Accelo | dashboard-crm | Gap |
|-------------|--------|---------------|-----|
| Project templates | ✅ Job Types | ➕ `delivery_templates` | **паритет** |
| Quote → project convert | ✅ one-click | 🟡 spawn from won (без quote) | gap |
| Phase/milestone board | ✅ Milestones | ✅ phase columns | 🟡 |
| Milestone budgets | ✅ | ❌ | gap |
| Gantt / dependencies | ✅ | ❌ | отложить |
| Project health score | ✅ AI predictive | ❌ | **gap** |
| Assign work (bulk) | ✅ Assign Work tool | 🟡 project_members | gap |
| Signoffs / approvals | ✅ | ❌ | опционально |
| Time tracking | ✅ core PSA | ❌ | сознательно (1С) |
| Invoicing | ✅ Xero/QBO | ❌ (1С) | сознательно |
| Tickets (post-delivery) | ✅ Issues | ❌ | gap (опционально) |
| Client portal | ✅ | ❌ | опционально |
| Retainers | ✅ Contracts | ❌ | вне домена |

### 6.4 Автоматизация

| Возможность | Accelo | dashboard-crm | Gap |
|-------------|--------|---------------|-----|
| Progressions + Actions | ✅ visual per Type | 🟡 stage_requirements + S29 | UX gap |
| Triggers (time-based) | ✅ | ❌ | часть P1 workflow |
| Workflow required | ✅ on projects | ➕ `is_milestone` gate | паритет intent |
| Webhooks | ✅ | ❌ | часть P1 |

---

## 7. Архитектурное сравнение

```
Accelo PSA                           dashboard-crm
──────────                           ─────────────
Companies ────────────────           companies
Contacts + Affiliations ──           contacts
Sales (Prospects) ────────┐          projects (type=client)
                          │ won
Quotes (Estimates) ───────┤          ❌ КП вне CRM
                          ▼
Jobs (Projects) ──────────┐          projects (type=delivery)
Milestones ───────────────┤          project_columns (phase)
Tasks ────────────────────┘          tasks + is_milestone
Issues (Tickets) ────────            ❌
Activities (unified) ────            calls + meetings + activities
Time + Invoices ─────────            ❌ (1С контур)

Progressions (per Type)              stage_requirements (hard)
Triggers (time/event)                automation_rules (1×1)
AI: margin/capacity                  AI Hub: sales/discovery
```

**Ключевой архитектурный инсайт:** Accelo подтверждает нашу ставку **разделять sales и delivery** (как HubSpot Projects, Pipedrive Projects). Наша модель `projects.type = client | delivery | internal` — **ближе к PSA**, чем схлопывание у HubSpot. Риск: без quote-слоя теряется budget handoff.

---

## 8. Приоритеты для dashboard-crm

Отфильтровано под домен (продажи маркировки + внедрения 1С/ЧЗ). Пересечения с HubSpot/Pipedrive отмечены.

### P0 — Auto-spawn delivery при won (~0.3 спринта)

**Референс Accelo:** Won Sale → Create Related Project / Quote Convert.

Сейчас `spawn_delivery_project` — **ручной RPC** после won. Добавить:
```
stage_entered (won) → automation:
  1. Предложить шаблон (ERP launch / experiment) по direction+kind
  2. HITL confirm → spawn_delivery_project
  3. Link delivery к client deal (parent_project_id)
```

Зависит от P1 workflow или hardcoded trigger. *Также в hubspot-analysis P2, pipedrive-analysis.*

### P1 — Progression-style transition UI (~0.5 спринта)

**Референс Accelo:** Required Update Field + Create Task при progression.

При смене стадии сделки показывать **модалку перехода** (не только toast ошибки гейта):
- Обязательные поля из `stage_requirements`
- Опционально: создать task из шаблона
- Hidden actions → automation_rules

У нас гейт уже сильнее Accelo (DB). Не хватает **UX guided transition**.

### P2 — Quote/КП как объект CRM (~0.5 спринта)

**Референс Accelo:** Quote → Estimate → Convert to Project.

Привязать КП (kp-master) к `projects(client)`:
- Статус: draft / sent / approved / rejected
- Сумма, дата, ссылка на документ
- При approved → default template для spawn

*Также в hubspot-analysis P4.*

### P3 — Delivery health score (~0.4 спринта)

**Референс Accelo:** Project Health — budget variance, overdue milestones, stalled phases.

Лёгкая версия без time tracking:
- Фазы без движения > N дней
- Milestone tasks incomplete past due
- Нет activity на delivery > N дней
- Badge на delivery card + TodayView section «Delivery at risk»

Не копировать AI margin guard — domain-specific health.

### P4 — Milestone gate UX polish (~0.2 спринта)

**Референс Accelo:** Workflow required before progression.

У нас `check_delivery_completion` + `is_milestone` уже есть (P3). Добавить:
- UI сообщение «Завершите веху X перед переходом фазы»
- Progress X/Y на phase column header (P2b partial)

### P5 — Post-delivery Tickets lite (~1 спринт, go/no-go)

**Референс Accelo:** Issues для short-term support.

Только если теряются клиентские вопросы после внедрения:
- Объект «Запрос/инцидент» linked to delivery project
- Статусы: open → in progress → resolved
- Без billing/time tracking

*Также в hubspot-analysis P6.*

### P6 — Client portal lite (опционально, ~1.5 спринта)

**Референс Accelo:** Client Portal — project status, files.

Для промышленных B2B — низкий приоритет. Если нужно — read-only view статуса внедрения.

### Отложить

- Time tracking / timesheets (1С:ДО)
- Invoicing / rate cards / retainers
- Gantt / task dependencies
- Resource scheduling / capacity (Forecast)
- AI margin guard / MCP / agentic replanning
- Power BI integration
- Email/calendar auto-capture
- Full PSA financial stack

---

## 9. Accelo vs HubSpot vs Pipedrive — что брать от кого

| Паттерн | Лучший референс | Почему |
|---------|----------------|--------|
| Sales → delivery handoff | **Accelo** + HubSpot Projects | Accelo — quote→project; HubSpot — workflow create project |
| Delivery templates | **Accelo** + мы | Accelo — Job Types; мы — `delivery_templates` по 1С:ДО |
| Phase/milestone gates | **Мы** + Accelo | Оба имеют; наш `is_milestone` domain-specific |
| Progression UX | **Accelo** | Guided transition modal |
| Project financials | **Accelo** | PSA-native; нам не нужно (1С) |
| Sales activity inbox | **Мы** (TodayView) | Accelo — dashboards |
| Stage hard gates | **Мы** | Accelo — UI required fields |
| Quotes | **Accelo** | Integrated estimate; у нас — kp-master |
| Post-delivery support | **Accelo** (Tickets) | У нас нет |
| AI sales intelligence | **Мы** (AI Hub) | Accelo — operational AI |

---

## 10. Что сознательно НЕ копировать

- Time tracking / timesheets / rate cards (учёт в 1С:ДО)
- Invoicing / billing / retainers (учёт в 1С)
- Resource scheduling / utilization dashboards (команда 5–15, не agency)
- Gantt charts / task dependencies (overkill для фазового kanban)
- Full PSA financial stack (margin guard, revenue leakage AI)
- Client portal с invoice payment
- Forecast capacity planning (отдельный продукт, heavy)
- Email-first activity model (B2B промышленные продажи — ручной ввод)
- Opaque enterprise PSA pricing model

**Стратегия:** Accelo — **эталон delivery lifecycle**, не замена CRM. Брать **quote→project pattern, progression UX, delivery health, tickets contour** — не PSA целиком.

---

## 11. Итоговый вывод

**Accelo — ближайший бенчмарк по PSA/delivery** для dashboard-crm (приоритет #3 в `crm-benchmark-candidates`). Для домена **маркировка + внедрение 1С/ЧЗ** Accelo релевантнее HubSpot/Attio/Pipedrive в контуре **после выигрыша сделки**.

**Где мы уже на уровне Accelo:**
- Разделение sales / delivery (`client` → `delivery`)
- Delivery templates с фазами (ERP launch, experiment)
- Phase board + milestone gates
- Project members с ролями

**Оставшиеся разрывы:**
1. **Quote/КП в CRM** (P2) — Accelo не отпускает estimate из sales
2. **Auto-spawn на won** (P0) — Accelo тоже частично manual, но UX лучше
3. **Progression transition UI** (P1) — guided modal vs сухой DB gate
4. **Delivery health** (P3) — Accelo AI health vs наш null на delivery
5. **Tickets** (P5) — post-delivery support

**Конкурентные преимущества сохранять:**
- Stage gates (hard enforcement)
- Vertical pipeline (ЧЗ, ERP, experiment)
- Domain AI (SPIN, протокол)
- TodayView как sales action queue
- Delivery templates по 1С:ДО (не generic PSA)
- Лёгкость vs PSA-оверход

**Стратегия:** Accelo подтверждает правильность delivery-архитектуры (PCT + delivery P1–P3). Следующий шаг — **замкнуть won → КП → spawn → health** без превращения CRM в PSA. Комбинировать с HubSpot/Pipedrive паттернами **workflow engine** и **AI post-meeting HITL**.

---

## 12. Источники

### Accelo (официальные, спарсено 2026-07-12)

- [Homepage — AI-Powered PSA](https://www.accelo.com/)
- [PSA Features / Workflow Automation](https://www.accelo.com/features/workflow-automation)
- [AI Platform](https://www.accelo.com/ai)
- [Pricing / How to Buy](https://www.accelo.com/how-to-buy)
- [Forecast integration](https://www.accelo.com/blog/forecast-accelo-brand-website-integration)
- [Glossary](https://help.accelo.com/get-started/accelo-glossary/)
- [Sales Module](https://help.accelo.com/guides/user/modules/sales/)
- [Close a Sale / Create Related Work](https://help.accelo.com/guides/user/modules/sales/close-a-sale/)
- [Quote to Project Conversion](https://help.accelo.com/guides/user/modules/sales/quotes/convert-quote-to-project/)
- [Sale Special Actions](https://help.accelo.com/guides/settings-and-configuration-guide/triggers-and-business-processes/business-processes/progressions/special-process-actions-2/sale-actions/)
- [Progressions & Actions](https://help.accelo.com/guides/settings-and-configuration-guide/triggers-and-business-processes/business-processes/progressions/)
- [Projects Module](https://help.accelo.com/guides/user/modules/projects/)
- [View a Milestone](https://help.accelo.com/guides/user/modules/projects/view-a-milestone/)
- [Tickets Module](https://help.accelo.com/guides/user/modules/tickets/)
- [Power BI Integration](https://help.accelo.com/guides/integrations-guide/power-bi/)
- [API Reference](https://api.accelo.com/docs/)

### Контекст рынка

- [Accelo Pricing 2026 (checkthat.ai)](https://checkthat.ai/brands/accelo/pricing) — ориентир ~$69/user/mo Premium
- [G2 Accelo Reviews](https://www.g2.com/products/accelo/reviews) — 4.4/5, 522 reviews

### dashboard-crm (репозиторий)

- `improvements/crm-benchmark-candidates-2026-07-12.md` — Accelo как приоритет #3
- `improvements/hubspot-analysis-2026-07-12.md` — Projects pattern
- `improvements/pipedrive-analysis-2026-07-12.md` — deal won → project
- `_analysis/handoff-delivery-p1.md`, `_analysis/sprint-delivery-p2a.md` — delivery architecture
- `src/lib/validators/project.ts` — STAGE_CONFIG, delivery types
- `src/types/database.ts` — ProjectType, ColumnCategory
- `supabase/migrations/` — 032_project_boards, 035_delivery, 036_phase_board