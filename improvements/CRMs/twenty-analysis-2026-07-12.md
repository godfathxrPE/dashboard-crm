# Twenty CRM — комплексный анализ и инсайты для dashboard-crm

**Дата:** 2026-07-12  
**Метод:** парсинг twenty.com, docs.twenty.com (data model, workflows, apps, API, permissions, billing), GitHub twentyhq/twenty (README, PRODUCT.md, v2.20.0), closed-won automations guide, сопоставление с кодовой базой dashboard-crm.  
**Связанные документы:** `improvements/CRMs/crm-benchmark-candidates-2026-07-12.md` (Tier 2 — open-source flexible objects), `improvements/CRMs/attio-analysis-2026-07-12.md`, `improvements/CRMs/insightly-analysis-2026-07-12.md`, `improvements/CRMs/monday-analysis-2026-07-12.md`.

---

## 0. Как читать этот документ

| Символ | Значение |
|--------|----------|
| ✅ | Паритет или сильная альтернатива |
| 🟡 | Частично / другая модель |
| ❌ | Нет |
| ➕ | Есть у нас, у Twenty нет «из коробки» или слабее |
| 🔒 | Требует платного tier Twenty |

**Контекст:** Twenty — **#1 open-source CRM на GitHub** (52.9k stars, июль 2026), «open alternative to Salesforce, designed for AI». Это **платформа для сборки CRM**, а не готовый vertical product. dashboard-crm — **уже собранная вертикальная CRM** (маркировка, 1С:ERP, Честный Знак). Twenty — **главный бенчмарк по архитектуре flexible objects + schema-driven API**, не по delivery/PSA (там сильнее Accelo/Insightly/Monday).

---

## 1. Twenty в 2026 — позиционирование и архитектура

### 1.1 Слоган и стратегия

Twenty позиционируется как **«Build your Enterprise CRM at AI Speed»** — production-ready building blocks, которые technical teams собирают, версионируют и расширяют как обычный код.

Ключевые концепции (с [twenty.com](https://twenty.com/), [Why Twenty](https://docs.twenty.com/getting-started/introduction)):

```
Twenty Platform (2026)
├── Data Model (UI + Metadata API)
│   ├── Standard objects: Companies, People, Opportunities, Tasks, Notes
│   ├── Custom objects + fields (unlimited, no extra charge)
│   └── Relations: M:N, ONE_TO_MANY, junction objects
├── Views & Pipelines
│   ├── Table / Kanban / Calendar на одном dataset
│   ├── Filters (AND/OR), grouping, saved views
│   └── Stage aggregations (avg days in stage)
├── Workflows (visual builder)
│   ├── Triggers: record CRUD, schedule, manual, webhook
│   ├── Actions: CRUD, filter, branch, iterator, delay, email, code, HTTP
│   └── AI Agent actions (roadmap / credits)
├── Apps (twenty-sdk) — schema + logic + UI as TypeScript packages
│   ├── defineObject / defineField / defineView
│   ├── Logic functions (HTTP, cron, DB events)
│   ├── Front components (sandboxed React in Web Workers)
│   └── Skills & Agents
├── APIs (auto-generated per workspace schema)
│   ├── Core API: REST + GraphQL CRUD
│   └── Metadata API: programmatic schema changes
├── Calendar & Email sync (Google / Microsoft)
├── Dashboards (widgets, charts)
├── Permissions (object → field → row-level 🔒 Org)
├── MCP server (Cloud) — Claude/Cursor/ChatGPT OAuth
└── Self-host (Docker) OR Cloud ($9–19/user)
```

**Главное отличие от Attio:** оба — flexible data model + AI-native. Attio — **proprietary SaaS + Universal Context™**; Twenty — **open-source core + Apps as code + self-host**. Attio сильнее в agent catalog и email intelligence; Twenty сильнее в **ownership, schema-as-code, и developer DX**.

**Главное отличие от HubSpot/Salesforce:** Twenty не horizontal platform с AppExchange. Это **lean CRM kernel** — вы сами добавляете объекты, workflows, apps.

**Главное отличие от dashboard-crm:** Twenty — **meta-CRM** (как собрать любую CRM); мы — **domain CRM** с миграциями, stage gates, delivery templates 1С:ДО. Twenty **не знает** про ЧЗ/ERP; мы **зашили** это в schema + RPC.

### 1.2 Масштаб (2026)

| Метрика | Значение |
|---------|----------|
| GitHub stars | 52.9k (#1 open-source CRM) |
| Contributors | 703 |
| Commits | 13,627 |
| Latest release | v2.20.0 (10.07.2026) |
| Клиенты (marketing) | 10k+; République Française, Bayer, PwC |
| Stack | TypeScript 77.9%, NestJS, PostgreSQL, Redis, React, Jotai |

### 1.3 Ценовая модель (2026)

Источник: [twenty.com](https://twenty.com/) FAQ, [Pricing Plans](https://docs.twenty.com/user-guide/billing/capabilities/pricing-plans), [Credits](https://docs.twenty.com/user-guide/billing/capabilities/credits).

| Plan | Цена | Ключевое |
|------|------|----------|
| **Cloud Pro** | **$9/user/mo** (yearly) | Core CRM, email/calendar, workflows, 30-day trial |
| **Cloud Organization** | **$19/user/mo** (yearly) | + SSO, **row-level permissions**, AI usage data |
| **Self-Hosted Free** | $0 | All Pro features, community support |
| **Self-Hosted Organization** | Enterprise key via Stripe | Premium features + Twenty support |

**Credits (workflows + AI):** 1 credit = $1 usage. Included: 5/mo (monthly) or 50/yr (yearly). Standard workflow steps ~$0.0001 each.

**Инсайт:** Twenty **дешевле Attio/Insightly/HubSpot** и **не тарифицирует custom objects**. dashboard-crm — internal, $0 seat; Twenty — reference что **flexible CRM ≠ enterprise pricing**.

---

## 2. Объектная модель Twenty

### 2.1 Standard objects

Верифицировано по [Objects](https://docs.twenty.com/user-guide/data-model/capabilities/objects), [Data Model](https://docs.twenty.com/getting-started/core-concepts/data-model):

| Twenty object | Назначение | Email/calendar sync |
|---------------|------------|---------------------|
| **Companies** | Организации, industry, size | ✅ |
| **People** | Контакты | ✅ |
| **Opportunities** | Deals, pipeline stages, amount | ✅ |
| **Tasks** | To-dos, assignee, due date | 🟡 linked to records |
| **Notes** | Free-form на records | — |

**Критическое ограничение** ([Data Model overview](https://docs.twenty.com/user-guide/data-model/overview)):

> Email and calendar sync **only works with People, Companies, and Opportunities**.

Для delivery нужен **custom object** (Projects) — без native email sync на нём.

### 2.2 Custom objects — паттерн расширения

Из [Create Custom Objects](https://docs.twenty.com/user-guide/data-model/how-tos/create-custom-objects), homepage demo (rockets/launches):

```
Workspace
├── Companies (standard)
├── People (standard)
├── Opportunities (standard) — sales kanban
├── Projects (custom)          ← delivery = DIY
│   ├── fields: Phase (Select), Owner, Direction…
│   ├── relation → Opportunity (MANY_TO_ONE)
│   └── kanban view on Phase field
└── DeliveryTasks (custom) OR use Tasks object
```

**Рекомендация Twenty для Projects** ([Create Kanban for Projects](https://docs.twenty.com/user-guide/views-pipelines/how-tos/create-a-kanban-view-for-projects)):
1. Custom object `Projects` с Select field `Phase`/`Status`
2. Kanban view — DnD меняет Select value
3. Relation Opportunity → Project

**У нас (delivery P1–P3):**
```
projects(type='client')     — sales (не custom, first-class)
projects(type='delivery')   — delivery (не custom, first-class)
project_columns(phase)      — фазы как колонки, не Select field
tasks.lane                  — статус на фазовой доске
delivery_templates          — domain spawn RPC
```

**Сходство:** оба используют **kanban по stage/phase field**.  
**Различие:** у Twenty delivery — **admin-configured custom object**; у нас — **миграции + type discriminator + domain templates**.

### 2.3 Fields — 20+ типов

| Категория | Типы |
|-----------|------|
| Basic | Text, Number, Boolean, Date, Currency, Rating, Select, Multi-Select |
| Composite | Address, Full Name, Links, Phones, Emails |
| Special | Relation, File, JSON, Actor (createdBy) |
| System | id, createdAt, updatedAt, createdBy, position |

**Сравнение:** Twenty — UI-driven schema; мы — PostgreSQL columns + CHECK constraints + triggers. ➕ **мы сильнее на enforcement** (stage gates); Twenty сильнее на **ad-hoc field addition без deploy**.

### 2.4 Views (не Lists как Attio)

Twenty **не имеет Attio Lists**. Вместо этого:

| Слой | Назначение |
|------|------------|
| **Object** | Dataset (Companies, Opportunities, custom Projects) |
| **Views** | Table / Kanban / Calendar + filters + grouping |
| **Pipelines** | Kanban на Opportunities по Stage field |

Один object → много views (как HubSpot, не как Attio Lists).

### 2.5 Маппинг на dashboard-crm

| Twenty | dashboard-crm | Комментарий |
|--------|---------------|-------------|
| Companies | `companies` | ✅ |
| People | `contacts` | ✅ |
| Opportunities | `projects(type='client')` | 🟡 схлопнуто |
| Custom Projects | `projects(type='delivery')` | ➕ first-class, не DIY |
| Tasks | `tasks` | ✅ |
| Notes | 🟡 не в timeline | gap |
| Views / saved views | `use-saved-views` + URL | 🟡 паритет intent |
| Custom objects UI | migrations only | разная философия |
| Relations M:N | FK + junction tables | ✅ relational |
| Leads object | `leads` + convert | ➕ explicit lead layer |

---

## 3. Deal → Delivery handoff

### 3.1 Как Twenty решает post-won (официальный гайд)

Из [Closed Won Automations](https://docs.twenty.com/user-guide/workflows/how-tos/crm-automations/closed-won-automations):

```
Trigger: Opportunity Stage updated → "Closed Won"
  → Filter: stage = Closed Won
  → Update Company: Type = Customer, First Deal Date, Account Owner
  → Create Task: "Onboarding: {opp name}" (CS assignee, +3d)
  → Send Email: notify CS team
  → Send Email: confirm to sales rep
```

**Advanced:** Iterator + Code для multi-step onboarding tasks; HTTP Request для billing system; Filter branches для Enterprise vs SMB.

**Чего НЕТ в официальном closed-won flow:**
- ❌ Create custom Project record
- ❌ Spawn delivery board from template
- ❌ Copy files/comms to delivery
- ❌ Milestone gates

Delivery в Twenty = **отдельная настройка**: custom object Projects + workflow `Create Record` на Projects при Closed Won. Не packaged.

### 3.2 Сравнение handoff-паттернов

| Аспект | Twenty | Insightly | Monday | dashboard-crm |
|--------|--------|-----------|--------|---------------|
| Native convert UI | ❌ (workflow) | ✅ wizard | ✅ automation | 🟡 RPC |
| Create delivery record | 🟡 custom object via workflow | ✅ Convert To Project | ✅ board item | ✅ spawn_delivery |
| Template tasks | 🟡 Iterator/Code | Activity Sets | board template | delivery_templates |
| Copy comms/files | ❌ | ✅ | 🟡 | 🟡 |
| Domain templates | ❌ DIY | ❌ generic | ❌ generic | ➕ 1С:ДО |

**Вывод:** Twenty **слабее Insightly/Monday/нас** в delivery handoff out-of-box. Сильнее как **пример workflow composition** (filter + branch + iterator + HTTP).

### 3.3 Как бы Twenty-модель выглядела для 1С/ЧЗ

По docs data model design + Apps tutorial pattern:

```typescript
// twenty-sdk (гипотетический vertical app)
defineObject({ nameSingular: 'erpLaunch', fields: [
  { name: 'phase', type: FieldType.SELECT, options: ['Kickoff','1C Setup','ЧЗ Pilot','Sign-off'] },
  { name: 'direction', type: FieldType.SELECT },
  { name: 'opportunity', type: FieldType.RELATION, relationType: RelationType.MANY_TO_ONE },
]});
defineLogicFunction({ trigger: 'DATABASE_EVENT', on: 'opportunity.stage', 
  when: 'CLOSED_WON', action: 'createErpLaunchFromTemplate' });
```

У нас это уже **зашито в migrations + spawn_delivery_project** — быстрее для одного домена, но без UI-конфигурации.

---

## 4. Workflows — workflow engine

### 4.1 Архитектура

Из [Workflows overview](https://docs.twenty.com/user-guide/workflows/overview), [Workflow Actions](https://docs.twenty.com/user-guide/workflows/capabilities/workflow-actions):

```
Trigger (record created/updated/deleted | schedule | manual | webhook)
  → Filter (optional)
  → Branch A / Branch B …
  → Actions:
        Create/Update/Delete/Upsert/Search Record
        Iterator (loop arrays)
        Delay
        Send Email
        Code (JavaScript)
        HTTP Request
        Form (HITL input)
        AI Agent (credits)
```

**Примеры из документации:**
- **Stage time tracking** — workflow + Code nodes + custom Date/Number fields per stage ([track-time-in-stage](https://docs.twenty.com/user-guide/views-pipelines/how-tos/track-time-in-stage))
- **Closed won** — multi-action post-win ([closed-won-automations](https://docs.twenty.com/user-guide/workflows/how-tos/crm-automations/closed-won-automations))
- **Stagnant pipeline** — hidden date field + scheduled check (pattern в use cases)

### 4.2 Сравнение с dashboard-crm S29

| Возможность | Twenty | dashboard-crm |
|-------------|--------|---------------|
| Visual builder | ✅ | ❌ |
| Record triggers | ✅ CRUD + field watch | 🟡 `stage_entered` only |
| Branches (IF/ELSE) | ✅ Filter nodes | ❌ |
| Iterator | ✅ | ❌ |
| Delay / schedule | ✅ | ❌ |
| Email actions | ✅ | ❌ |
| Code (JS) | ✅ | ❌ |
| HTTP / webhooks | ✅ | ❌ |
| Test mode | ✅ | ❌ |
| DB-enforced gates | ❌ (workflow only) | ➕ `check_stage_requirements()` |
| Unlimited rules | ✅ (credits metered) | ✅ rows, 1×1 semantics |

**Главный архитектурный инсайт:** Twenty подтверждает, что **workflow breadth** — #1 gap vs всех бенчмарков (HubSpot, Attio, Insightly, Monday). Но Twenty **слабее на hard gates** — stage transition не блокируется в DB.

### 4.3 Stage duration / deal velocity

Twenty решает rotting/stage duration через **workflow + custom fields** (Last Entered X, Days in X), не native score.

**У нас:** `deal-health.ts` — native rotting без 14 custom fields + workflow. ➕ **проще и дешевле в maintenance**.

---

## 5. Apps framework (twenty-sdk) — архитектурный эталон

### 5.1 Концепция

Из [Apps core concepts](https://docs.twenty.com/getting-started/core-concepts/apps), [Apps getting started](https://docs.twenty.com/developers/extend/apps/getting-started/quick-start):

```
npx create-twenty-app my-app
  ├── defineObject / defineField / defineRelation
  ├── defineView (filters, kanban, columns)
  ├── defineLogicFunction (HTTP, cron, DB events)
  ├── defineFrontComponent (sandboxed React)
  ├── defineCommandMenuItem (Cmd+K entries)
  ├── definePageLayout / definePageLayoutTab
  └── defineSkill / defineAgent (AI)
  
yarn twenty dev  → live sync to workspace (<1s)
npx twenty app:publish --private
```

**Ключевые свойства:**
- **AST detection** — no registration boilerplate
- **Version control** — schema as git, not click-ops
- **Sandboxed** — logic functions isolated Node; front components in Web Workers (Remote DOM)
- **Permissions** — app role scopes API access
- **Integration tests** against real Twenty server

### 5.2 Homepage demo: «Scaffold launch-ops CRM»

AI генерирует objects (rocket, launch, payload, launchSite), relations, views, tests — **agentic schema scaffolding**. Это их 2026 AI story (vs наш domain AI в AI Hub).

### 5.3 Что взять для dashboard-crm (архитектурно, не fork)

| Twenty pattern | Применимость у нас |
|----------------|-------------------|
| Schema as code in repo | ✅ уже есть (migrations) |
| `defineView` as code | 🟡 saved views в localStorage — можно seed JSON |
| Logic functions on DB events | 🟡 Supabase triggers + Edge Functions |
| Command menu items from modules | ➕ CommandPalette extensibility |
| Page layout tabs per entity | 🟡 project detail — можно улучшить |
| App publish / marketplace | ❌ single-tenant internal |

**Стратегия:** не становиться Twenty. **Заимствовать** идею «vertical app package» — `delivery_templates` + spawn RPC уже близки к **domain app**, но без SDK абстракции.

---

## 6. API, MCP и developer platform

### 6.1 Schema-per-tenant APIs

Из [API docs](https://docs.twenty.com/developers/extend/api):

| API | Endpoint | Назначение |
|-----|----------|------------|
| **Core REST/GraphQL** | `/rest/`, `/graphql/` | CRUD на все objects (включая custom) |
| **Metadata REST/GraphQL** | `/rest/metadata/` | Programmatic schema changes |
| Rate limit | 100 req/min | |
| Batch | 60 records/call | |

**Уникальность:** API **генерируется из workspace schema** — добавили custom object `Invoice` → сразу `/rest/invoices`. Документация в Settings → API & Webhooks (playground).

**У нас:** Supabase PostgREST + typed `database.ts` — статическая схема, RLS per org. ➕ **RLS hardening**; Twenty ➕ **dynamic schema API**.

### 6.2 MCP, OAuth, Webhooks

| Surface | Twenty | dashboard-crm |
|---------|--------|---------------|
| MCP server | ✅ Cloud native (Claude/Cursor) | ❌ |
| REST + GraphQL | ✅ auto-generated | 🟡 Supabase REST |
| Webhooks on CRUD | ✅ | ❌ |
| OAuth for integrations | ✅ | ❌ |
| Metadata API | ✅ | ❌ (migrations only) |

**Инсайт:** если понадобится **AI assistant с write access** — Twenty MCP pattern (OAuth + role-scoped) релевантнее Attio MCP для reference implementation.

### 6.3 Permissions model

Из [Permissions](https://docs.twenty.com/user-guide/permissions-access/capabilities/permissions):

```
Role
├── Object permissions (see/edit/delete all OR per-object exceptions)
├── Field permissions (see/edit/hidden per field)
├── Row-level permissions 🔒 Organization plan
├── Settings permissions (data model, workflows, API keys…)
├── Action permissions (send email, import/export CSV)
└── Assignable to: Members, API Keys, AI Agents
```

**Сравнение с нашим multi-tenant:**
| Аспект | Twenty | dashboard-crm |
|--------|--------|---------------|
| Tenancy | Workspace | `organizations` + `memberships` |
| Roles | Configurable roles | owner/admin/manager/viewer |
| Field-level | ✅ | ❌ |
| Row-level | 🔒 Org plan | ✅ RLS `org_id` |
| API key scopes | ✅ per role | service_role / anon |
| AI agent permissions | ✅ | 🟡 ai_runs per user |

---

## 7. AI-стратегия Twenty vs AI Hub

| Twenty (2026) | dashboard-crm | Вердикт |
|---------------|---------------|---------|
| **AI Chatbot** (roadmap) | AI Hub presets | Twenty — generic NL; мы — domain |
| **AI Agents in Workflows** | ❌ | Gap (не приоритет) |
| **MCP for external AI** | ❌ | Gap (low) |
| **Agentic schema scaffold** (homepage) | ❌ | Overkill |
| **Skills in Apps** | ❌ | reference only |
| Credits billing | $1/credit metered | ➕ internal, no meter |
| Permissions on agents | ✅ roles | 🟡 |
| Post-meeting HITL | 🟡 roadmap | 🟡 transcripts + ai_runs |

**Инсайт:** Twenty AI = **platform extensibility** (build CRM with AI). Наш AI = **sales intelligence** (SPIN, протокол). Пересечение — **Smart Deal Progression HITL** (все бенчмарки 2026).

---

## 8. UX, productivity, calendar/email

| Аспект | Twenty | dashboard-crm |
|--------|--------|---------------|
| Cmd+K | ✅ + navigation shortcuts (G→P, G→O) | ➕ CommandPalette |
| Table/Kanban/Calendar | ✅ same object | 🟡 pipeline + phase board |
| Email/calendar sync | ✅ Google/Microsoft | ❌ |
| Dashboards builder | ✅ widgets | 🟡 fixed pages |
| Deal rotting | 🟡 workflow + custom fields | ➕ `deal-health.ts` native |
| TodayView action inbox | ❌ | ➕ |
| Themes | single design (Notion-like) | ➕ 9 themes |
| Mobile | 🟡 responsive | 🟡 |

**Twenty UX:** «clean, intuitive, built to feel like Notion» — близко к Attio/folk aesthetic, не к нашему Scandi industrial.

---

## 9. Gap-матрица: dashboard-crm vs Twenty

### 9.1 Где dashboard-crm **сильнее** Twenty

| Возможность | Почему |
|-------------|--------|
| **Vertical domain** (ЧЗ, ERP, experiment) | Twenty — blank canvas |
| **Stage gates (DB)** | Twenty — workflow/validation only |
| **Delivery templates 1С:ДО** | Twenty — DIY custom object |
| **TodayView + reconnect** | Twenty — tasks + views, не unified inbox |
| **Deal health native** | Twenty — 14 fields + workflow hack |
| **Domain AI** (SPIN, протокол) | Twenty — generic AI roadmap |
| **Multi-tenant RLS** | Twenty — workspace, row-level 🔒 paid |
| **Collapsed projects model** | Twenty — separate opp + custom project |
| **Milestone gates** | Twenty — нет `is_milestone` pattern |
| **Leads layer** | Twenty — Person Type field workaround |

### 9.2 Архитектура и extensibility

| Возможность | Twenty | dashboard-crm | Gap |
|-------------|--------|---------------|-----|
| Custom objects (no-code) | ✅ unlimited | migrations only | разная философия |
| Schema-as-code (Apps) | ✅ twenty-sdk | ✅ SQL migrations | паритет intent |
| Dynamic API from schema | ✅ | ❌ static types | gap если нужен public API |
| Workflow engine | ✅ branches/iterator/code | 🟡 S29 1×1 | **breadth gap** |
| Webhooks | ✅ | ❌ | gap |
| MCP | ✅ | ❌ | low priority |
| Field-level permissions | ✅ | ❌ | low (мала команда) |
| Email sync | ✅ | ❌ | сознательно |

### 9.3 Delivery / PSA

| Возможность | Twenty | dashboard-crm | Gap |
|-------------|--------|---------------|-----|
| Sales pipeline | ✅ Opportunities kanban | ✅ PipelineBoard | паритет |
| Delivery object | 🟡 custom Projects | ✅ `type=delivery` | ➕ first-class |
| Phase board | 🟡 kanban on Select | ✅ phase columns + lane | ➕ Monday-contract |
| Template spawn | 🟡 workflow Create Record | ➕ `spawn_delivery_project` | ➕ domain |
| Closed-won automation | ✅ documented pattern | ❌ manual RPC | gap (same as all) |
| PSA / billing | ❌ | ❌ (1С) | — |

---

## 10. Архитектурное сравнение (главная ценность бенчмарка)

```
Twenty (platform)                    dashboard-crm (vertical product)
──────────────────                   ────────────────────────────────
Metadata layer                       supabase/migrations/*.sql
  ├── UI: Settings → Data Model        ├── explicit tables + CHECK
  └── API: /rest/metadata/             └── RPC + triggers

Runtime objects                        tables
  Companies, People, Opportunities     companies, contacts, projects(client)
  Custom: Projects (DIY)               projects(delivery), tasks, leads

Views (per object)                     UI routes + components
  Table/Kanban/Calendar                  PipelineBoard, PhaseBoard, TodayView

Workflows (visual, credits)            automation_rules (DB, 1×1)
  branches, iterator, code               stage_entered → create_task

Apps (twenty-sdk packages)             domain logic in src/ + migrations
  publishable extensions                 delivery_templates = domain "app"

API (generated per schema)             Supabase client + RLS
MCP (Cloud)                              —
```

**Ключевой архитектурный инсайт:** dashboard-crm — это **по сути vertical Twenty app**, но:
1. Schema в **миграциях**, не Metadata API
2. Domain rules в **PostgreSQL triggers**, не workflow nodes
3. UI **hardcoded** под маркировку, не generic object renderer

**Когда смотреть на Twenty:** если нужно **обосновать** решение «почему не fork Twenty» или **заимствовать** patterns (workflow branches, schema-as-code views, MCP, permissions on API keys).

---

## 11. Приоритеты для dashboard-crm

Отфильтровано: Twenty — **architecture reference**, не feature shopping list.

### P0 — Workflow engine breadth (сквозной, ~1 спринт)

**Референс Twenty:** Filter + Branch + Iterator + Delay + Create Record.

Минимальный DAG поверх `automation_rules`:
```
stage_entered(won) → [filter: direction] → spawn_delivery (HITL) → notify
```

*Дублирует monday P0, insightly P0, hubspot P1.*

### P1 — Webhooks на record changes (~0.3 спринта)

**Референс Twenty:** webhook trigger в workflows.

Supabase Database Webhooks или `pg_notify` → external systems (1С, Telegram).

### P2 — Saved views as seed config (~0.2 спринта)

**Референс Twenty:** `defineView` in Apps — columns, filters, kanban field.

Экспорт/импорт saved views JSON per org (сейчас localStorage only).

### P3 — Field-level permissions lite (~0.3 спринта)

**Референс Twenty:** hide margin/ERP cost fields from viewer role.

RLS + column grants или UI-only hide для `viewer`.

### P4 — Stage duration without 14 fields (~0.2 спринта)

**Референс Twenty:** track-time-in-stage (anti-pattern для нас).

У нас достаточно `stage_history` или `entered_stage_at` — **не копировать** Twenty workflow+14 fields approach.

### P5 — MCP read-only для AI (~0.5 спринта, опционально)

**Референс Twenty:** Cloud MCP OAuth.

Только если нужен Cursor/Claude write-to-CRM; иначе AI Hub достаточно.

### Отложить

- Fork Twenty / migrate to Twenty
- Custom objects UI для admins
- Metadata API для runtime schema
- Email/calendar sync (вне домена)
- AI agentic schema scaffold
- Credits billing model
- Generic object renderer (мы vertical)
- Twenty Apps marketplace pattern

---

## 12. Twenty vs Attio vs dashboard-crm — что брать от кого

| Паттерн | Лучший референс | Почему |
|---------|----------------|--------|
| Flexible objects architecture | **Twenty** + Attio | Twenty — open schema-as-code; Attio — Lists layer |
| Agent-first AI | **Attio** | Twenty AI ещё roadmap-heavy |
| Open-source / self-host | **Twenty** | Attio proprietary |
| Workflow branches + code | **Twenty** | Attio близко; мы — S29 |
| DB stage enforcement | **Мы** | Оба flexible CRM — soft |
| Delivery first-class | **Мы** + Insightly | Twenty — custom object DIY |
| Dynamic API | **Twenty** | Schema-generated endpoints |
| Action inbox | **Мы** (TodayView) | Twenty — tasks/views |
| Domain vertical | **Мы** | Twenty — platform |
| MCP integration | **Twenty** | Native Cloud feature |

---

## 13. Что сознательно НЕ копировать

- **Platform-first** mindset — мы уже product, не builder
- **Custom object per entity** — migrations + types достаточно для одного домена
- **14 fields + workflow для stage duration** — native `deal-health` лучше
- **Credits metered automation** — internal tool
- **Email sync prerequisite** — B2B промышленные продажи
- **Generic kanban on Select** — наш phase board (P2a) точнее для delivery
- **Metadata API runtime schema** — ломает vertical guardrails
- **Web Worker front components** — overkill для fixed UI
- **Notion-like single theme** — у нас 9 тем, Scandi default
- **Person Type field вместо Leads** — explicit `leads` table чище

**Стратегия:** Twenty подтверждает, что **dashboard-crm = vertical Twenty app done right** для одного домена. Брать **workflow DAG, webhooks, defineView-as-config, API key roles, MCP pattern** — не платформу целиком.

---

## 14. Итоговый вывод

**Twenty — эталон #1 по open-source CRM architecture** (Tier 2 в `crm-benchmark-candidates`: «flexible objects как Attio, но для архитектуры»). Анализ **подтверждает**: мы уже реализовали **сжатую версию** Twenty vision — custom schema, relations, kanban, automation — но **вертикально** через Supabase migrations, не через Metadata API.

**Где мы уже на уровне Twenty:**
- Object-centric model (companies, contacts, projects/deals, tasks)
- Kanban pipeline + phase board
- Schema versioned in git (migrations ≈ Apps)
- Cmd+K productivity
- Multi-tenant access control

**Оставшиеся разрывы (Twenty-specific):**
1. **Workflow engine breadth** (P0) — branches, iterator, delay
2. **Webhooks** (P1) — event-driven integrations
3. **Dynamic API docs** (N/A internal) — только если public API
4. **Field-level permissions** (P3) — для viewer role
5. **Closed-won → delivery workflow** — у Twenty documented, у нас manual (общий gap)

**Конкурентные преимущества сохранять:**
- Vertical ERP/ЧЗ domain в schema
- Hard stage gates в PostgreSQL
- `delivery_templates` + spawn RPC (domain «app»)
- TodayView + native deal health
- Domain AI Hub
- Не платить complexity tax платформы

**Стратегия:** Twenty — **архитектурное зеркало**, не конкурент для замены. Использовать для **обоснования tech decisions** и заимствования **workflow/webhook/view-config patterns**. Delivery handoff — смотреть Insightly/Monday; AI agents — Attio; PSA — Accelo.

---

## 15. Источники

### Twenty (официальные, спарсено 2026-07-12)

- [Homepage](https://twenty.com/)
- [Documentation index](https://docs.twenty.com/llms.txt)
- [Why Twenty](https://docs.twenty.com/getting-started/introduction)
- [Key Features](https://docs.twenty.com/getting-started/key-features)
- [Data Model overview](https://docs.twenty.com/user-guide/data-model/overview)
- [Objects](https://docs.twenty.com/user-guide/data-model/capabilities/objects)
- [Create Kanban for Projects](https://docs.twenty.com/user-guide/views-pipelines/how-tos/create-a-kanban-view-for-projects)
- [Track Time in Stage](https://docs.twenty.com/user-guide/views-pipelines/how-tos/track-time-in-stage)
- [Closed Won Automations](https://docs.twenty.com/user-guide/workflows/how-tos/crm-automations/closed-won-automations)
- [Workflows overview](https://docs.twenty.com/user-guide/workflows/overview)
- [Apps core concepts](https://docs.twenty.com/getting-started/core-concepts/apps)
- [API](https://docs.twenty.com/developers/extend/api)
- [Permissions](https://docs.twenty.com/user-guide/permissions-access/capabilities/permissions)
- [Pricing Plans](https://docs.twenty.com/user-guide/billing/capabilities/pricing-plans)
- [Credits](https://docs.twenty.com/user-guide/billing/capabilities/credits)
- [AI overview](https://docs.twenty.com/user-guide/ai/overview)

### GitHub

- [twentyhq/twenty](https://github.com/twentyhq/twenty) — README, v2.20.0 (10.07.2026), 52.9k stars
- [PRODUCT.md](https://github.com/twentyhq/twenty/blob/main/PRODUCT.md)

### dashboard-crm (репозиторий)

- `improvements/CRMs/crm-benchmark-candidates-2026-07-12.md` — Tier 2 Twenty
- `improvements/CRMs/attio-analysis-2026-07-12.md` — flexible objects peer
- `improvements/CRMs/insightly-analysis-2026-07-12.md` — delivery handoff peer
- `improvements/CRMs/monday-analysis-2026-07-12.md` — phase board peer
- `src/lib/hooks/use-automation-rules.ts` — S29 automation
- `src/lib/utils/deal-health.ts` — native rotting
- `src/components/shared/CommandPalette.tsx` — Cmd+K
- `supabase/migrations/` — schema-as-code