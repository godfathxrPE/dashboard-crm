# Monday Sales CRM — комплексный анализ и инсайты для dashboard-crm

**Дата:** 2026-07-12  
**Метод:** парсинг monday.com/crm, pricing, features, marketplace templates, what's-new (июль 2026), developer API (validation rules, MCP), CRM.org review, flowfam setup guide, сопоставление с кодовой базой dashboard-crm.  
**Связанные документы:** `improvements/crm-benchmark-candidates-2026-07-12.md` (Tier 3 — deal→project handoff), `improvements/accelo-analysis-2026-07-12.md`, `improvements/hubspot-analysis-2026-07-12.md`, `_analysis/architecture-delivery-p2.md` (Monday-аналогия фазовой доски).

---

## 0. Как читать этот документ

| Символ | Значение |
|--------|----------|
| ✅ | Паритет или сильная альтернатива |
| 🟡 | Частично / другая модель |
| ❌ | Нет |
| ➕ | Есть у нас, у Monday нет «из коробки» или слабее |
| 🔒 | Требует платного tier Monday |

**Контекст:** Monday Sales CRM (официально **monday CRM**) — **board-native CRM** на платформе monday Work OS. Сильна в **визуальном pipeline + post-sales project boards** для professional services. dashboard-crm — **вертикальная CRM** под продажи и внедрения маркировки (1С:ERP, Честный Знак). Monday — **главный бенчмарк по UX фазовой доски и handoff «выиграли → внедряем»**, не по sales AI или enterprise PSA.

---

## 1. monday CRM в 2026 — позиционирование и архитектура

### 1.1 Слоган и стратегия

Monday позиционирует CRM как **«The only AI-first CRM your team will love»** — no-code CRM на Work OS с агентами, автоматизациями и единым контуром **pre- → post-sales**.

Ключевые концепции (с [monday.com/crm](https://monday.com/crm), [features](https://monday.com/crm/features)):

```
monday Work OS (платформа)
├── Boards — первичная абстракция (не «объекты CRM»)
│   ├── Groups — фазы / секции внутри board
│   ├── Items — записи (deal, task, contact…)
│   ├── Columns — атрибуты (status, connect, mirror, formula…)
│   └── Views — table / kanban / timeline / gantt / chart
├── Connect Boards + Mirror — граф связей между boards
├── Automations — when → then (no-code)
├── Emails & Activities — unified comms timeline
├── Dashboards — widgets (funnel, leaderboard, forecast)
└── monday AI layer
    ├── Sidekick — context-aware assistant
    ├── Notetaker — transcript → action items → autofill
    ├── Agents (Lead Sourcing, Calling…)
    └── Vibe — NL → apps, widgets, workflows

Продуктовый контур:
monday CRM · Work Management · Service · Dev · Campaigns
```

**Главное отличие от HubSpot/Attio:** Monday — не object-centric Smart CRM, а **board-centric Work OS**. CRM = набор связанных boards (Leads, Contacts, Accounts, Deals) + опционально project boards из Work Management. Delivery — **отдельный board**, связанный через Connect Boards, а не отдельный object type.

**Главное отличие от Accelo:** Monday не PSA (нет time→invoice quote-to-cash). Handoff = **создать project board из шаблона**, не convert quote→job.

### 1.2 Заявленные метрики (маркетинг, 2026)

| Метрика | Значение |
|---------|----------|
| Клиенты | 250,000+ |
| G2 reviews | 1,000+ |
| Opportunity capture | +80% (кейс EAC) |
| ROI от accurate data | 26× (кейс Freedom) |
| Hours saved (automations) | 3,500+ (кейс Cenversa) |
| Integrations | 200+ native, 500+ через marketplace/Zapier |

### 1.3 Ценовая модель (2026)

Источник: [monday.com/crm/pricing](https://monday.com/crm/pricing), [CRM.org review](https://crm.org/news/monday-crm-review) (май 2026).

| Plan | Цена (annual) | Ключевое |
|------|---------------|----------|
| **Basic** | €12/seat | 1k contacts/deals, 5 columns/board, 1 dashboard, 20 quotes/mo, custom automations |
| **Standard** | €17/seat | 10k records, 15 columns, 250 automations/mo, **Emails & Activities hub** |
| **Pro** | €28/seat | 100k records, 75 columns, 25k automations/mo, forecasting dashboards |
| **Ultimate** | Custom | Unlimited, enterprise security, HIPAA, advanced log rules |

**Ограничения:**
- Минимум **3 seats** на всех планах (solo-команда платит ×3)
- Нет free tier — только 14-day trial
- **AI credits** metered отдельно (Sidekick, Notetaker, Agents)
- Data Validation Rules — 🔒 Pro/Enterprise ([API docs](https://developer.monday.com/api-reference/docs/validation-rules-guide.md))

**Инсайт для позиционирования:** команда 5 человек на Pro = €140/mo минимум + AI credits. dashboard-crm — внутренний инструмент без seat minimum и tier-gating на automations/leads/forecasting.

---

## 2. Модель данных monday CRM

### 2.1 Boards вместо Objects

Monday CRM **не использует классическую object model** (Contacts, Deals как типы записей). Вместо этого — **набор специализированных boards**, связанных колонками Connect Boards.

Верифицировано по [Comprehensive Sales Pipeline template](https://monday.com/crm/marketplace/template/comprehensive-sales-pipeline-management), [Consulting Sales CRM](https://monday.com/crm/marketplace/template/consulting-sales-crm-template), [flowfam setup guide](https://flowfam.co/monday-com-crm-setup/) (март 2026):

| Board | Назначение | Ключевые columns |
|-------|------------|------------------|
| **Leads** | Top-of-funnel | Status, Company, Title, Email, Phone, Last interaction, Create contact action |
| **Contacts** | Люди | Name, Email, Phone, Title, Connect→Accounts, Connect→Deals, Deals value (mirror), Priority, Type |
| **Accounts** | Компании | Name, Domain, Industry, HQ, Connect→Contacts, Connect→Deals, Deals (mirror) |
| **Deals** | Sales pipeline | Stage (status), Owner, Value, Expected close, Close probability, Forecast value (formula), Connect→Contact/Account, Last interaction |
| **Activities** | Calls/meetings | Type, Owner, Start/End, Status, Related item (connect) |
| **Client Projects** | Post-sales delivery | Groups=фазы, Items=задачи, Status=state задачи, Connect→Deal, Timeline, Billable hours 🔒 |

**Connect Boards** — центральный паттерн: deal связан с contact и account; project board связан с deal. **Mirror columns** показывают агрегаты с связанных boards без дублирования.

### 2.2 Views — один dataset, много представлений

| View | Использование |
|------|---------------|
| **Table** | Bulk edit, фильтры |
| **Kanban** | Pipeline по stage/status |
| **Timeline** | Close dates, renewals |
| **Chart** | Pipeline value by stage |
| **Gantt** | Project phases 🔒 Pro+ |
| **Calendar** | Activities |

**Expanded item view** (deal card): Emails & Activities timeline + connected accounts, contacts, **projects** в одном экране ([deal management blog](https://monday.com/blog/crm-and-sales/deal-management/), апр 2026).

### 2.3 Паттерн delivery board (ключевой для нашего домена)

Из [CRM.org review](https://crm.org/news/monday-crm-review), [architecture-delivery-p2.md](_analysis/architecture-delivery-p2.md), monday homepage «pre- to post-sales»:

```
Board = проект (Client Projects)
├── Groups = фазы (Kickoff · Setup · Testing · Sign-off)
├── Items = задачи
└── Status column = состояние задачи (≠ группа/фаза)

Deal (Closed Won)
  → Automation: create item in Client Projects board
  → OR: duplicate board from Managed Template
  → Connect Boards: project ↔ deal ↔ account ↔ contacts
  → Notify legal/finance/ops на нужных стадиях
```

> **Критический инсайт:** фаза — контейнер (group), статус — атрибут карточки (status column). DnD между groups меняет фазу, не статус. Это **точное совпадение** с решением P2a dashboard-crm (`project_columns category='phase'` + `tasks.lane`).

### 2.4 Маппинг на dashboard-crm

| monday CRM | dashboard-crm | Комментарий |
|------------|---------------|-------------|
| Leads board | `leads` + convert | ➕ convert без tier |
| Contacts board | `contacts` | ✅ |
| Accounts board | `companies` | ✅ |
| Deals board | `projects` WHERE `type='client'` | 🟡 одна таблица vs отдельный board |
| Client Projects board | `projects` WHERE `type='delivery'` | ✅ разделение sales/delivery |
| Groups (phases) | `project_columns` `category='phase'` | ✅ **архитектурный паритет** |
| Items (tasks) | `tasks` | ✅ |
| Status column | `tasks.lane` | ✅ **lane = истина на phase board** |
| Connect Boards | FK (`company_id`, `parent_project_id`…) | 🟡 реляционный граф vs board links |
| Mirror columns | 🟡 computed в UI / aggregations | gap |
| Activities board | `calls` + `meetings` + `activities` | 🟡 без Emails & Activities |
| Emails & Activities | ❌ (план comms) | gap |
| Dashboards | overview + analytics pages | 🟡 нет drag-drop widget builder |
| Managed Templates | `delivery_templates` + `copy_delivery_template` | ➕ domain-specific (1С:ДО, ERP) |

---

## 3. Deal → Project handoff

### 3.1 Как Monday решает «выиграли → внедряем»

**Проблема** (та же, что у HubSpot KB): post-close delivery в deal pipeline портит воронку и forecast.

**Решение Monday** (консенсус CRM.org, flowfam, consulting templates, homepage):

1. **Deals board** — только sales stages до Closed Won/Lost
2. При **Closed Won** → automation:
   - Создать item на **Client Projects board**
   - Или **duplicate board** из Managed Template (onboarding checklist)
   - Заполнить Connect Boards: project → deal → account → owner
   - Notify delivery/ops/legal stakeholders
3. **Client Projects board** — groups как фазы, items как задачи
4. Deal остаётся в archive/won group; delivery живёт отдельно, но **связан** через Connect

**Post-sales на той же платформе** ([deal management blog](https://monday.com/blog/crm-and-sales/deal-management/)):
- Onboarding progress tracking
- Renewals & upsells boards
- Billable hours на project board 🔒
- Collection tracking

**Категория marketplace:** [Onboarding & Handoff](https://monday.com/crm/marketplace/category/onboarding-handoff) — заявлен use case, но **шаблонов в каталоге нет** (пустая категория на 2026-07-12). Handoff — community/consultant pattern, не packaged template.

### 3.2 Managed Templates (май 2026)

Из [what's-new](https://monday.com/crm/whats-new) (17.05.2026):
- **Managed Templates** — до 1000 instances per template
- **Data validation** на managed columns в child boards
- Удаление unused labels в managed status columns

**Аналог у нас:** `delivery_templates` + `UNIQUE (org_id, direction, kind)` + `spawn_delivery_project` → `copy_delivery_template`.

**Различие:** Monday spawn = duplicate **целого board**; у нас spawn = новый `projects(type='delivery')` row + фазовые колонки из template tables.

### 3.3 Quotes → Deal → Project (май 2026)

[What's new 17.05.2026](https://monday.com/crm/whats-new): **Link deals to Quotes & Invoices** — auto-fill recipient/product from deal.

Цепочка Monday: Proposal board → Quote linked to deal → Won → Project board.

**У нас:** КП (kp-master) вне CRM; `spawn_delivery_project` без quote-объекта. Gap подтверждён и в accelo-analysis P2.

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

**Сходство с Monday:** разделение sales/delivery + фазовая доска + template spawn.  
**Разрывы:** (1) spawn не автоматический на won, (2) нет quote-слоя, (3) нет mirror «все проекты сделки» на карточке deal (если 1:N).

---

## 4. Automations и Workflows

### 4.1 No-code automations

Типовой flow ([CRM automation blog](https://monday.com/blog/crm-and-sales/crm-automation/), flowfam):

```
Trigger: Status changes to "Closed Won"
  → Create item in "Client Projects" board
  → Connect to deal + account
  → Notify project owner
  → Set due date from Expected Close
```

**Возможности:**
- When → Then recipes (status, date, person, email events)
- **Sequences** — email + task + call reminders в цепочке
- **Emails & Activities triggers** (17.05.2026) — on portal message / email / call logged
- Delays, notifications, item creation, column updates
- **MCP Block** (09.07.2026) — actions на 3rd party apps с public MCP server
- **Sidekick/MCP manage automations** (09.07.2026) — CRUD automations без UI

**Ограничения** (CRM.org): нет multi-branch IF/ELSE; порядок при конфликтующих automations не контролируется; сложные flows → Make.com/Zapier.

### 4.2 Data Validation Rules (май 2026)

[Validation Rules API](https://developer.monday.com/api-reference/docs/validation-rules-guide.md) (API 2026-07):

```
IF status = "Proposal Sent"
THEN budget column IS_NOT_EMPTY AND expected_close IS_NOT_EMPTY
```

Enforced в UI **и** API (422 `DATA_VALIDATIONS_ERROR`). 🔒 Pro/Enterprise.

**У нас:** `stage_requirements` + `check_stage_requirements()` trigger — **hard enforcement в DB**, не только UI. ➕ **сильнее Monday** на stage gates.

### 4.3 У нас (S29)

```
trigger_type: 'stage_entered'  →  action_type: 'create_task'
```

**Главный разрыв** — тот же, что с HubSpot/Accelo: нет `Closed Won → spawn_delivery` automation.

---

## 5. AI-стратегия monday CRM vs AI Hub

| monday CRM (2026) | dashboard-crm | Вердикт |
|-------------------|---------------|---------|
| **Sidekick** — generic CRM assistant | AI Hub — 3 доменных пресета | Разный фокус |
| **Notetaker** — transcript → action items → autofill fields | `transcripts`, `ai_runs`, `AiWorkspaceModal` | 🟡 паритет на звонках |
| **Autofill with AI** — columns (text, status, people…) | ❌ | Gap (низкий приоритет) |
| **Deal insights** — inactivity, disengaged buyers | `deal-health.ts`, TodayView | ➕ **native rotting без AI credits** |
| **Meeting prep brief** | 🟡 частично в AI Hub | Gap |
| **Lead Sourcing / Calling Agents** | ❌ | Сознательно не копируем |
| **Vibe** — NL → apps, widgets, Office export | ❌ | Overkill |
| **AI credits billing** | ❌ | Внутренний инструмент — без metered AI |

### Notetaker → CRM fields (июнь 2026)

[What's new 01.06.2026](https://monday.com/crm/whats-new): Vibe + Notetaker — surface action items, query transcripts, **auto-fill CRM fields after every call**.

**Референс = HubSpot Smart Deal Progression = наш P0.** Monday подтверждает тренд 2026; у нас фундамент (`transcripts`, `ai_runs`) уже есть.

---

## 6. Sales Workspace vs TodayView

| Аспект | monday CRM | dashboard-crm |
|--------|------------|---------------|
| Единая очередь действий | 🟡 Activities board + dashboards | ➕ TodayView (`/`) |
| Deal rotting / stale | 🟡 automations + deal insights AI | ➕ Native `deal-health.ts` |
| Reconnect cooling contacts | 🟡 Last interaction column | ➕ `use-last-touch` + Today |
| Email-open triggers | ✅ automation | ❌ |
| Cross-functional handoff alerts | ✅ notify legal/finance/ops | 🟡 только delivery spawn |
| Cmd+K | ❌ (Sidekick chat) | ➕ CommandPalette |
| Mobile sales | ✅ dedicated CRM mobile | 🟡 web responsive |

**Вывод:** Monday сильнее в **post-won cross-team notifications** и **email-triggered automations**. Мы сильнее в **единой action queue** и **native deal health** без tier/credits.

---

## 7. Gap-матрица: dashboard-crm vs monday CRM

### 7.1 Где dashboard-crm **сильнее** monday

| Возможность | Почему |
|-------------|--------|
| **Stage gates (DB enforcement)** | Monday — UI/API validation rules 🔒 Pro+; у нас trigger + RPC |
| **TodayView + reconnect** | Native action inbox, не board-fragmented |
| **Deal health / rotting** | Native, не AI credits |
| **AI: SPIN / протокол / аналит. записка** | Доменные пресеты |
| **Delivery templates по 1С:ДО / ERP pptx** | Monday — generic consulting templates |
| **Vertical pipeline** (ЧЗ, ERP, experiment) | Monday — horizontal Work OS |
| **Leads без tier / без 3-seat minimum** | Monday Basic ограничен, min 3 seats |
| **Единая схема через миграции** | Monday — board sprawl, consultant setup |
| **Milestone gates на delivery** | `is_milestone` + `check_delivery_completion` — domain-specific |

### 7.2 Ядро CRM

| Возможность | monday CRM | dashboard-crm | Gap |
|-------------|------------|---------------|-----|
| Contacts / Companies | ✅ boards | ✅ tables | паритет |
| Leads | ✅ Leads board | ✅ + `convert_lead` | ➕ |
| Deals / Pipeline | ✅ Deals board + kanban | ✅ `projects(client)` + PipelineBoard | паритет |
| Разделение sales / delivery | ✅ separate boards | ✅ `type=client\|delivery` | **паритет intent** |
| Activity timeline | ✅ Emails & Activities | 🟡 EntityTimeline | gap email |
| Notes | ✅ в timeline | 🟡 не в ленте | gap (P3 hubspot) |
| Quotes | ✅ linked to deals (05.2026) | ❌ КП вне CRM | gap |
| Файлы на сделке | ✅ | ✅ `project_files` | паритет |
| Excel-импорт | ✅ | ✅ ExcelImport | паритет |

### 7.3 Delivery / project execution

| Возможность | monday CRM | dashboard-crm | Gap |
|-------------|------------|---------------|-----|
| Phase board (group ≠ status) | ✅ Groups + Status column | ✅ phase columns + `tasks.lane` | **паритет** |
| Template spawn on won | 🟡 automation (manual setup) | 🟡 `spawn_delivery_project` RPC | оба не fully auto |
| Managed / domain templates | ✅ Managed Templates | ➕ `delivery_templates` | ➕ domain depth |
| Gantt / Timeline | ✅ 🔒 Pro+ | ❌ | отложить |
| Billable hours | ✅ 🔒 Pro+ | ❌ (1С:ДО) | сознательно нет |
| Portfolio across projects | ✅ Portfolio API/skills | 🟡 per-org projects list | gap на scale |
| Delivery health AI | 🟡 Sidekick charts | ❌ | accelo-analysis P3 |
| Client portal | 🟡 monday service | ❌ | опционально |

### 7.4 Automations и UX

| Возможность | monday CRM | dashboard-crm | Gap |
|-------------|------------|---------------|-----|
| No-code automations | ✅ 250–25k/mo | 🟡 S29: 1×1 | **главный разрыв** |
| Sequences (email flows) | ✅ | ❌ | нужен email |
| Data validation on stage | 🟡 🔒 Pro+ | ➕ DB stage gates | **мы сильнее** |
| Expanded record view | ✅ item + connected boards | 🟡 project detail page | UX gap |
| Mirror / rollup fields | ✅ Mirror columns | ❌ | низкий приоритет |
| Dashboard builder | ✅ drag-drop widgets | 🟡 fixed pages | gap (мала команда) |
| Saved views | ✅ per board | ➕ saved views + URL | паритет+ |

---

## 8. Архитектурное сравнение

```
monday CRM (boards)                  dashboard-crm (relational)
───────────────────                  ──────────────────────────
Leads board ─────────────            leads
Contacts board ──────────            contacts
Accounts board ──────────            companies
Deals board ─────────────┐           projects (type=client)
                         │ Closed Won automation / RPC
Client Projects board ───┘           projects (type=delivery)
  Groups = phases                      project_columns (category=phase)
  Items = tasks                        tasks (lane = status)
  Status column                        tasks.lane

Connect Boards                       FK: company_id, parent_project_id
Mirror columns                       ❌ / computed UI
Emails & Activities                  EntityTimeline (partial)
Automations (when→then)              automation_rules (1×1)
Managed Templates                    delivery_templates + copy RPC
```

**Ключевой архитектурный инсайт:** `_analysis/architecture-delivery-p2.md` **уже заложил Monday-контракт** для фазовой доски. Monday **подтверждает** правильность P2a. Оставшийся gap — **автоматизация handoff** и **quote-слой**, не модель фаз.

---

## 9. Приоритеты для dashboard-crm

Отфильтровано под домен (продажи маркировки + внедрения 1С/ЧЗ). Пересечения с accelo/hubspot отмечены.

### P0 — Auto-spawn delivery при won (~0.3 спринта)

**Референс Monday:** `Closed Won → create item in Client Projects + connect to deal`.

Сейчас `spawn_delivery_project` — ручной RPC. Добавить:
```
stage_entered (won) → automation:
  1. Предложить шаблон по direction+kind
  2. HITL confirm (модалка)
  3. spawn_delivery_project + link parent
  4. Notify delivery owner (+ optional legal/finance)
```

*Дублирует accelo-analysis P0, hubspot-analysis P2.*

### P1 — Expanded deal card: sales + delivery context (~0.4 спринта)

**Референс Monday:** Expanded item view — deal + connected projects + timeline.

На странице `projects(client)` показать:
- Связанные `projects(delivery)` (mirror Accelo/Monday connect)
- Краткий прогресс delivery (X/Y tasks, текущая фаза)
- CTA «Запустить внедрение» если нет delivery

### P2 — Cross-functional handoff notifications (~0.2 спринта)

**Референс Monday homepage:** involve legal, finance, ops at the right time.

При переходе на стадии «Договор» / «Выиграна»:
- `notify` action в automation (роли owner/admin + delivery manager)
- Не email-маркетинг — in-app / Telegram позже

### P3 — Quote/КП linked to deal (~0.5 спринта)

**Референс Monday (05.2026):** Quotes linked to deals, auto-fill.

*Дублирует accelo P2, hubspot P4.*

### P4 — Smart Deal Progression / Notetaker HITL (~0.5 спринта)

**Референс Monday Notetaker + HubSpot SDP:** transcript → suggest fields + tasks.

*Дублирует hubspot P0, attio P0.*

### P5 — Delivery health badge (~0.4 спринта)

**Референс Monday Sidekick charts + Accelo health:** stalled phases, overdue milestones.

*Дублирует accelo P3.*

### P6 — Progression transition modal (~0.5 спринта)

**Референс Monday Data Validation + Accelo Progressions:** guided stage change.

*Дублирует accelo P1.*

### Отложить

- Board sprawl / multiple pipelines per rep
- Gantt / Timeline / Portfolio API
- Billable hours / invoicing (1С)
- Lead Sourcing / Calling Agents
- Vibe / custom widget builder
- monday Campaigns / Service Hub
- Mirror columns как first-class feature
- Managed Templates UI для admins (шаблоны в БД достаточно)

---

## 10. Monday vs Accelo vs HubSpot — что брать от кого

| Паттерн | Лучший референс | Почему |
|---------|----------------|--------|
| Phase board (group ≠ status) | **Monday** + мы | Monday — UX-эталон; мы — DB-контракт P2a |
| Deal → project handoff | **Monday** (board spawn) + Accelo (quote→job) | Monday проще; Accelo глубже financially |
| Delivery templates | **Мы** + Monday Managed Templates | Domain 1С:ДО vs generic |
| Stage enforcement | **Мы** | DB gates > Monday validation rules |
| Quote layer | Accelo > Monday > мы | Тройной gap |
| PSA / billing | Accelo | Нам не нужно |
| Workflow engine breadth | HubSpot > Monday > мы | Monday — when/then без branches |
| AI post-meeting HITL | Все трое (2026) | Один раз в AI Hub |
| Action inbox | **Мы** (TodayView) | Monday — fragmented boards |
| Cross-team handoff notify | **Monday** | legal/finance/ops pattern |
| Email sequences | Monday / HubSpot | Вне домена пока |

---

## 11. Что сознательно НЕ копировать

- Work OS board sprawl (4–7 boards для CRM — overhead для команды 5–15)
- 3-seat minimum и AI credits billing
- Generic consulting/marketplace templates (у нас domain ERP/ЧЗ)
- Lead Sourcing / Calling Agents (outbound SDR)
- Vibe / NL → app builder / Office export
- Billable hours + invoicing на project board
- Gantt-first project management
- monday Campaigns (marketing hub)
- Make.com dependency для сложных workflows
- «CRM как конструктор без guardrails» — у нас vertical CRM с миграциями

---

## 12. Итоговый вывод

**Monday Sales CRM — эталон #1 по UX паттерну «deal → project board» и фазовой доски** для professional services. В `crm-benchmark-candidates` указана сила: **Deal → project handoff, boards**. Анализ **подтверждает**: решение P2a dashboard-crm (phase columns + `tasks.lane`) **архитектурно совпадает** с Monday.

**Где мы уже на уровне Monday:**
- Разделение `client` / `delivery` projects
- Фазовая доска (колонка ≠ статус)
- Delivery templates + spawn RPC
- Stage gates (сильнее Monday validation rules)

**Оставшиеся разрывы:**
1. **Auto-spawn на won** (P0) — Monday делает через automation, мы — ручной RPC
2. **Connected context на deal card** (P1) — Monday Expanded item view
3. **Quote/КП в CRM** (P3) — Monday связал в мае 2026
4. **Workflow engine** (сквозной P1 hubspot/accelo) — Monday проще HubSpot, но шире нашего S29
5. **Cross-team handoff notify** (P2) — Monday homepage explicit

**Конкурентные преимущества сохранять:**
- Вертикальные воронки маркировки (ЧЗ, ERP, experiment)
- Stage gates в PostgreSQL
- Domain AI (SPIN, протокол)
- TodayView как sales queue
- `delivery_templates` из 1С:ДО / методологии ERP
- Без PSA-оверхода и board-sprawl

**Стратегия:** брать у Monday **handoff automation, expanded deal↔delivery view, cross-team notifications, phase-board UX polish** — не Work OS целиком. Комбинировать с Accelo (**quote→project, delivery health**) и HubSpot (**workflow breadth, AI HITL**).

---

## 13. Источники

### monday CRM (официальные, спарсено 2026-07-12)

- [monday CRM homepage](https://monday.com/crm)
- [Features](https://monday.com/crm/features)
- [Pricing](https://monday.com/crm/pricing)
- [What's new](https://monday.com/crm/whats-new) (релизы до 09.07.2026)
- [Comprehensive Sales Pipeline template](https://monday.com/crm/marketplace/template/comprehensive-sales-pipeline-management)
- [Consulting Sales CRM template](https://monday.com/crm/marketplace/template/consulting-sales-crm-template)
- [Consulting Client Management CRM](https://monday.com/crm/marketplace/template/consulting-client-management-crm)
- [Marketplace categories](https://monday.com/crm/marketplace/categories)
- [Onboarding & Handoff category](https://monday.com/crm/marketplace/category/onboarding-handoff)
- [CRM automation blog](https://monday.com/blog/crm-and-sales/crm-automation/) (15.03.2026)
- [Deal management software 2026](https://monday.com/blog/crm-and-sales/deal-management/) (20.04.2026)
- [Automations feature](https://monday.com/features/automations)
- [Validation Rules API guide](https://developer.monday.com/api-reference/docs/validation-rules-guide.md) (API 2026-07)
- [Platform MCP / developer docs](https://developer.monday.com/llms.txt)

### Сторонние обзоры и гайды

- [CRM.org — Monday CRM Review 2026](https://crm.org/news/monday-crm-review) (14.05.2026)
- [FlowFam — monday.com CRM Setup Guide](https://flowfam.co/monday-com-crm-setup/) (март 2026)

### dashboard-crm (репозиторий)

- `improvements/crm-benchmark-candidates-2026-07-12.md` — Tier 3 Monday
- `improvements/accelo-analysis-2026-07-12.md` — PSA handoff
- `improvements/hubspot-analysis-2026-07-12.md` — Projects object pattern
- `_analysis/architecture-delivery-p2.md` — Monday-аналогия фазовой доски
- `supabase/migrations/036_delivery_phase_board_templates.sql` — spawn v2
- `src/lib/utils/deal-health.ts` — rotting native
- `src/components/today/TodayView.tsx` — action inbox