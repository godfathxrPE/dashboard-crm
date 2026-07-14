# Attio CRM — комплексный анализ и инсайты для dashboard-crm

**Дата:** 2026-07-12  
**Метод:** парсинг attio.com, Help Center, Changelog (июнь 2026), docs.attio.com, сопоставление с кодовой базой dashboard-crm.  
**Связанные документы:** `CRM-EVOLUTION-PLAN.md` (Attio уже был бенчмарком UX), `improvements/hubspot-analysis-2026-07-12.md`.

---

## 0. Как читать этот документ

| Символ | Значение |
|--------|----------|
| ✅ | Паритет или сильная альтернатива |
| 🟡 | Частично / другая модель |
| ❌ | Нет |
| ➕ | Есть у нас, у Attio нет «из коробки» или слабее |
| 🔒 | Требует платного tier Attio |

**Контекст:** Attio — **AI-native CRM** для GTM-команд стартапов и scale-ups (Granola, Linear, Railway, Modal). dashboard-crm — **вертикальная CRM** под продажи и внедрения маркировки (1С:ERP, Честный Знак). Attio ближе к нам по UX-философии, чем HubSpot — но заточен под SaaS/inbound, не под project delivery.

---

## 1. Attio в 2026 — позиционирование и архитектура

### 1.1 Слоган и стратегия

Attio позиционируется как **«The system for agentic revenue»** — CRM, где AI-агенты работают 24/7: prospecting, follow-up, scoring, churn risk, expansion.

Ключевые концепции (с [attio.com](https://attio.com), [Universal Context™](https://attio.com/context)):

```
Universal Context™ (ядро данных)
├── Particle — гибкий graph-relational data model
├── Semantic search + full-text (без отдельного vector DB)
├── External Consistency — embeddings всегда синхронны с source of truth
└── Schema as context — агенты понимают shape данных

Поверх:
├── Ask Attio — AI chat (HITL) на всём workspace
├── Workflows + Custom Agents — автоматизация с code blocks
├── App SDK (TypeScript/React) + REST API + MCP + SQL
└── 15+ prebuilt agents (Follow-Up, Briefing, Churn Risk…)
```

**Главное отличие от HubSpot:** Attio строился **agent-first**, не «добавили AI к legacy CRM». HubSpot — horizontal platform; Attio — flexible data model + agents.

### 1.2 Масштаб (заявленный на сайте, 2026)

| Метрика | Значение |
|---------|----------|
| Клиенты | 30,000+ |
| MCP calls/month | 2.6M |
| API calls/week | 400M |
| Active customer agents | 76k |
| Emails synced/day | 15M |

### 1.3 Ценовая модель

| Plan | Цена (annual) | Ключевое |
|------|---------------|----------|
| **Free** | €0 | до 3 seats, 3 objects, 50k records, 100 seat credits/mo |
| **Plus** | €29/seat | 5 objects, 250k records, workflows, 500 seat credits |
| **Pro** | €69/seat | 12 objects, custom objects, Call Intelligence, sequences, 1000 seat credits |
| **Enterprise** | Custom | Unlimited objects, SSO/SCIM, unlimited reports |

**Credits:** AI и workflow automations потребляют workspace credits (250–10,000/mo) + seat credits для Ask Attio. Доп. пакеты от €70/mo за 5,000 credits.

**Инсайт:** Attio монетизирует AI через credits. У нас AI в доменных пресетах — можно оставить без metered billing (внутренний инструмент).

---

## 2. Объектная модель Attio

### 2.1 Три слоя: Objects → Lists → Views

Это **главный UX-паттерн Attio**, уже заложенный в `CRM-EVOLUTION-PLAN.md`:

| Слой | Назначение | Пример |
|------|------------|--------|
| **Objects** | Типы записей (сущности) | Companies, People, Deals, Custom |
| **Lists** | Подмножество записей + **list-specific attributes** | «Recruiting», «Target accounts» |
| **Views** | Отображение одного датасета | Table, Kanban, фильтры, сортировка |

> «Один датасет → table/kanban/calendar» — не отдельные «модули», а views на одних данных.

Источник: [Define your data model](https://attio.com/help/reference/attio-101/attios-data-model/define-your-data-model-objects-lists-and-views).

### 2.2 Standard objects

| Object | Назначение | Активация |
|--------|------------|-----------|
| **Companies** | Организации (по domain) | Default |
| **People** | Контакты (по email) | Default |
| **Deals** | Sales pipeline | Enable в settings |
| **Users** | Пользователи вашего продукта (SaaS) | Enable |
| **Workspaces** | Аккаунты клиентов в продукте | Enable |
| **Custom objects** | Свои сущности (Projects, Invoices…) | 🔒 Pro+ |

**Auto-populate:** при sync email/calendar Companies и People создаются автоматически.

**Communication intelligence** (enriched, read-only):
- First/Last/Next interaction (when / with)
- Connection strength
- Strongest connection
- Next due task

### 2.3 Deals object — системные атрибуты

| Attribute | Описание |
|-----------|----------|
| Deal name, owner, stage | Required |
| Deal value | Monetary |
| Associated company / people | M:N relationships |
| Next due task | Derived, read-only |
| List Entries | Для фильтров |

**Нет отдельного Projects object** — для delivery Attio рекомендует **custom object «Projects»** (community guide) или Lists.

### 2.4 Маппинг на dashboard-crm

| Attio | dashboard-crm | Комментарий |
|-------|---------------|-------------|
| Companies | `companies` | ✅ |
| People | `contacts` | ✅ |
| Deals | `projects` WHERE `type='client'` | 🟡 схлопнуто с internal |
| Custom Projects object | `projects` WHERE `type='internal'` + `project_columns` | ➕ канбан задач сильнее |
| Lists | ❌ (нет list-entry pattern) | gap |
| Views (table/kanban на одном объекте) | 🟡 saved views + URL filters | частично |
| Users / Workspaces | ❌ | вне домена (не SaaS) |
| Leads | `leads` + convert | ➕ без tier |

---

## 3. Workflows и Agents

### 3.1 Workflow builder (июнь 2026)

Типовой flow с [attio.com/platform/workflows](https://attio.com/platform/workflows):

```
Trigger: Record created
  → Web Agent: Enrich with web research
  → Custom Agent: Score for ICP fit
  → IF/ELSE: Route by segment
      → True: Enroll Enterprise sequence
      → False: Enroll SMB sequence
```

**Возможности (changelog 29.06.2026):**
- Custom Agents со **structured outputs** (schema → следующий block)
- **Loop** over arrays of objects
- Integration blocks: Notion, Linear, Fin, Lemlist, Typeform, Webflow
- **Custom JS** + App SDK + MCP
- Run log на каждой записи (что agent прочитал, решил, сделал)
- Pause / rerun single run
- Permissions: workflow наследует права assigned user

### 3.2 Prebuilt Agents (каталог 2026)

| Agent | Задача | Релевантность для нас |
|-------|--------|----------------------|
| **Follow-Up Agent** | Recap call → update deal → draft next move | 🟡 **P0** — почти наш AI Hub |
| **Briefing Agent** | Prep before call | 🟡 |
| **Onboarding Agent** | Customer to first value | 🟡 PCT templates |
| **Churn Risk Agent** | Spot cooling accounts | 🟡 reconnect |
| **Coaching Agent** | Review calls, flag moments | 🟡 spin_review |
| **Prospecting Agent** | Find next customers | ❌ вне домена |
| **Web/Enrichment Agent** | Waterfall enrichment | ❌ |
| **Outbound Agent** | Email sequences | ❌ (нет email) |
| **Pipeline Review Agent** | Leadership report | 🟡 analytics |

### 3.3 У нас (S29)

```
trigger_type: 'stage_entered'  →  action_type: 'create_task'
```

**Главный разрыв** — тот же, что с HubSpot: workflow engine.

---

## 4. Ask Attio vs AI Hub

### 4.1 Ask Attio ([Help Center](https://attio.com/help/reference/attio-ai/ask-attio/chat-with-ask-attio))

Generic AI chat на всём workspace:
- Search records, calls, notes, emails
- SQL queries («weighted pipeline by stage», «avg days-to-close»)
- Create/update records, tasks, notes (HITL — approve before apply)
- Draft emails (HITL — manual send)
- Build workflows from natural language
- Web research
- Saved prompts (`/dailybrief`, `/follow-up email`)
- ⌘K → Ask Attio (tab key)

**Credits:** 100–2500 seat credits/mo по плану.

### 4.2 Сравнение с dashboard-crm

| Возможность | Attio | dashboard-crm |
|-------------|-------|---------------|
| Generic AI chat | ✅ Ask Attio | 🟡 CommandPalette (поиск, не chat) |
| HITL apply changes | ✅ | ✅ `AiWorkspaceModal` |
| Domain presets | ❌ generic | ➕ SPIN, протокол, аналит. записка |
| Post-meeting deal update | ✅ Follow-Up Agent | 🟡 AI Hub на transcript |
| SQL / natural language reports | ✅ | ❌ |
| Workflow from NL | ✅ | ❌ |
| Call transcript analysis | ✅ Call Intelligence (Pro) | ✅ `transcripts`, `ai_runs` |

**Инсайт:** Attio **Follow-Up Agent** = HubSpot **Smart Deal Progression** = наша эволюция **AI Hub P0**. Три конкурента сошлись на одном паттерне в 2026.

---

## 5. Record page и Timeline

### 5.1 Layout Attio (из CRM-EVOLUTION-PLAN)

```
┌─────────────────────────────────────────┐
│  Highlight widgets (connection, value)  │
├──────────┬──────────────────────────────┤
│ Attributes│  Timeline (center)            │
│ (sidebar) │  + task events               │
│           │  + filter by event type      │
└──────────┴──────────────────────────────┘
```

**Changelog 29.06.2026 — New activity timeline:**
- Task events (overdue, upcoming, completed) в timeline записи
- Filter by event type, remembered per object

### 5.2 У нас

| Аспект | Статус |
|--------|--------|
| EntityTimeline | ✅ calls, meetings, tasks, projects |
| Task events в timeline | 🟡 tasks есть, overdue/upcoming badges — нет |
| Filter timeline by type | ❌ |
| Highlight widgets на карточке | 🟡 deal-health, focus panel частично |
| Notes в timeline | ❌ (`activities` не подключены) |
| Sidebar attributes | ✅ |

---

## 6. Self-building CRM и auto-capture

Attio: **«Connect inbox and calendar → Attio builds itself»**
- Auto-create People/Companies from email/calendar
- Communication intelligence attributes
- Data enrichment (logo, ARR, employee count, funding)
- Auto-labeling, auto-summaries on emails

**У нас:** ручной ввод звонков/встреч/задач. Auto-capture через email sync **вне домена** (B2B промышленные продажи, не inbound SaaS).

**Что взять без email sync:**
- Derived `last_interaction` / `next_due_task` на карточках (у нас: `last_touch`, `next_action_date`, `deal-health.ts`) — ✅ уже реализовано
- «Created by» attribution (user / automation / AI) — 🟡 `activity_log` частично

---

## 7. Developer platform

| Surface | Attio | dashboard-crm |
|---------|-------|---------------|
| REST API | ✅ | ✅ Supabase + RLS |
| Webhooks | ✅ | ❌ |
| MCP server | ✅ | ❌ |
| SQL on workspace data | ✅ | 🟡 прямой SQL в Supabase |
| App SDK (TS/React embed) | ✅ | ❌ (мы и есть app) |
| Custom workflow JS | ✅ | ❌ |

**Инсайт:** MCP для dashboard-crm — отложить. Webhooks — часть P1 workflow engine.

---

## 8. Gap-матрица: dashboard-crm vs Attio

### 8.1 Где dashboard-crm **сильнее**

| Возможность | Почему |
|-------------|--------|
| **Stage gates** (блокировка перехода) | У Attio pipeline rules soft; у нас hard enforcement |
| **Vertical AI presets** (SPIN, протокол, аналит. записка) | Attio — generic Ask Attio |
| **Project-centric delivery** (internal boards, columns) | Attio — custom object или list workaround |
| **TodayView action inbox** | Attio — Home + Ask Attio, не единая очередь |
| **Deal health scoring** | Attio — deal risk через AI agents, не native score |
| **Multi-tenant RLS** | Attio — workspace-level, не org-level как у нас |
| **9 themes** | Attio — single design system |
| **Leads + convert без tier** | Attio — нет отдельного lead object |

### 8.2 Ядро CRM

| Возможность | Attio | dashboard-crm | Gap |
|-------------|-------|---------------|-----|
| Flexible objects | ✅ standard + custom (Pro) | ➕ миграции Supabase | мы гибче, но без UI-конфига |
| Objects + Lists + Views | ✅ | 🟡 entities + saved views | нет Lists pattern |
| Table + Kanban same data | ✅ | ✅ PipelineBoard + table | паритет |
| Timeline + filters | ✅ (июнь 2026) | 🟡 без filters | gap |
| Notes | ✅ | ❌ в timeline | gap |
| Email/calendar sync | ✅ core | ❌ | сознательно |
| Enrichment | ✅ auto | ❌ | вне домена |
| Communication intelligence | ✅ | 🟡 last_touch derived | частичный паритет |

### 8.3 Автоматизация и AI

| Возможность | Attio | dashboard-crm | Gap |
|-------------|-------|---------------|-----|
| Workflow engine | ✅ visual + agents + code | 🟡 S29: 1×1 | **главный разрыв** |
| Ask CRM (NL chat) | ✅ Ask Attio | 🟡 Cmd+K | gap |
| Follow-Up Agent | ✅ | 🟡 AI Hub | **P0 быстрая победа** |
| Autonomous agents 24/7 | ✅ 15+ | ❌ | не копируем |
| NL → SQL reports | ✅ | ❌ | отложить |
| HITL record updates | ✅ | ✅ AiWorkspaceModal | паритет |

### 8.4 UX и скорость (Attio = главный бенчмарк в CRM-EVOLUTION-PLAN)

| Возможность | Attio | dashboard-crm | Статус |
|-------------|-------|---------------|--------|
| Always next action | 🟡 Next due task (derived) | ➕ `next_step` + rotting | **реализовано** |
| Action inbox | Home meetings + Ask | ➕ TodayView | **реализовано** |
| Reconnect cooling | Connection strength | ➕ last_touch + Today | **реализовано** |
| Saved views | ✅ per object/list | ➕ `use-saved-views` (localStorage) | **реализовано** |
| Cmd+K | ✅ + Ask Attio | ➕ CommandPalette | **реализовано** |
| Keyboard j/k + peek | 🟡 | 🟡 частично | gap |
| Record page layout | highlight + timeline center | 🟡 | gap (косметика) |

**Вывод:** волны 1–2 из `CRM-EVOLUTION-PLAN.md` **уже закрыли** основной UX-gap с Attio. Остались workflow, AI follow-up, timeline filters, Lists pattern.

---

## 9. Архитектурное сравнение

```
Attio                               dashboard-crm
─────                               ─────────────
Objects (Deals, People…)            tables (projects, contacts…)
Lists (workflow subsets)            ❌ нет list-entry layer
Views (table/kanban/filters)        saved views + URL query
Universal Context + Ask Attio       Supabase + AI Hub (niche)
Workflows + 15 Agents               automation_rules (1×1)
Email/calendar auto-capture         manual calls/meetings
Custom objects (Pro)                migrations (free, no UI)
```

---

## 10. Приоритеты для dashboard-crm

Отфильтровано под домен маркировки + внедрения. Пересечения с HubSpot-анализом отмечены.

### P0 — Follow-Up Agent / Smart Deal Progression (~0.5 спринта)

**Референс Attio:** Follow-Up Agent — «Recaps every call, updates the deal, drafts the next move».

Расширить AI Hub:
1. После встречи/звонка → AI предлагает обновить поля сделки, tasks, next_step
2. HITL в `AiWorkspaceModal`
3. Доменные пресеты (протокол внедрения, не generic follow-up)

*Также в hubspot-analysis P0.*

### P1 — Generic Workflow Engine (~1.5–2 спринта)

**Референс Attio:** visual workflows + branches + loops + structured agent outputs.

MVP без visual canvas:
- Триггеры: `stage_entered`, `field_changed`, `task_overdue`, `record_created`, `time_based`
- Действия: `create_task`, `set_field`, `notify`, `create_activity`, `webhook`
- Условия: JSONB predicate
- Run log на `automation_runs` (как Attio «every run on the record»)

*Также в hubspot-analysis P1.*

### P2 — Timeline filters + task events (~0.3 спринта)

**Референс Attio:** changelog «New activity timeline» (июнь 2026).

- Фильтр EntityTimeline по типу события
- Badges overdue/upcoming на task events в ленте
- Remember filter per entity type (localStorage)

### P3 — Notes в EntityTimeline (~0.2 спринта)

Подключить `activities.type='note'` к `use-entity-timeline.ts`.

### P4 — Server-side saved views / segments (~0.5 спринта)

Эволюция `use-saved-views` (localStorage) → server-side `segments` с пересчётом.  
Attio Lists pattern — альтернатива, но для нас достаточно dynamic segments на objects.

### P5 — Project templates при выигрыше (~0.7 спринта)

**Референс Attio:** Onboarding Agent + custom Projects object.  
У нас: automation `client won → internal project + columns + tasks`.

### P6 — «Ask CRM» lite в CommandPalette (~0.5 спринта)

Не полный Ask Attio, а:
- NL query → поиск по CRM (существующий search)
- «Что по сделке X?» → summary из timeline (AI Hub preset)
- Saved prompts: `/протокол`, `/spin`, `/brief`

### P7 — Record page layout polish (~0.3 спринта)

Attio-паттерн: highlight widgets сверху (deal health, next action, value), timeline в центре. Косметика, но улучшает parity.

### Отложить

- Email/calendar sync и auto-populate
- Web/Waterfall enrichment agents
- 15+ autonomous agents
- Users/Workspaces objects (SaaS)
- App SDK / MCP server
- Credit-based AI billing
- NL → SQL report builder
- Lists с list-entry attributes (сложно при нашей схлопнутой модели)

---

## 11. Attio vs HubSpot — что брать от кого

| Паттерн | Лучший референс | Почему |
|---------|----------------|--------|
| Workflow engine | HubSpot (зрелее) + Attio (agents + code) | HubSpot — больше action types; Attio — agent blocks |
| AI post-meeting HITL | Все трое (одинаковый тренд 2026) | Реализуем один раз в AI Hub |
| Objects + flexible views | **Attio** | Ближе к нашему CRM-EVOLUTION-PLAN |
| Project delivery | HubSpot Projects + наш PCT-1 | Attio — custom object workaround |
| Stage enforcement | **Мы** | Ни HubSpot, ни Attio не блокируют |
| Domain AI (SPIN, протокол) | **Мы** | Ни у кого нет |
| Action inbox | **Мы** (TodayView) | Attio — fragmented; HubSpot — Sales Workspace (Pro+) |
| Marketing/sequences | HubSpot | Вне домена |
| Data sync / ETL | HubSpot Data Hub | Будущий 1С-контур |

---

## 12. Что сознательно НЕ копировать

- Agentic revenue stack целиком (15+ agents, 24/7 autonomous)
- Email/calendar как primary data source
- Credit-metered AI (внутренний инструмент — без биллинга)
- SaaS Users/Workspaces/product analytics objects
- Web enrichment и prospecting agents
- Lists pattern с list-entry attributes (пока схлопнутая модель projects работает)
- App SDK marketplace (мы — product, не platform)

---

## 13. Итоговый вывод

**Attio — ближайший UX-бенчмарк** для dashboard-crm (уже зафиксирован в `CRM-EVOLUTION-PLAN.md`). Волны 1–2 (next action, TodayView, reconnect, saved views, Cmd+K, deal health) **закрыли основной gap**.

**Оставшиеся разрывы:**
1. **Workflow engine** (P1) — главный, как и с HubSpot
2. **Follow-Up Agent** (P0) — быстрая победа на базе AI Hub
3. **Timeline filters + Notes** (P2–P3) — низкий effort, высокий UX parity
4. **Server-side segments** (P4) — эволюция saved views

**Конкурентные преимущества сохранять:**
- Stage gates (hard enforcement)
- Vertical AI (SPIN, протокол, аналит. записка)
- Project-centric delivery (internal boards)
- TodayView как единая action queue
- Multi-tenant без tier-ограничений

**Стратегия:** брать у Attio **паттерны data model (views), timeline UX и AI-HITL follow-up**, не agentic revenue platform целиком. Комбинировать с HubSpot-паттернами **project templates** и **workflow actions**.

---

## 14. Источники

### Attio (официальные, спарсено 2026-07-12)

- [Homepage — agentic revenue](https://attio.com)
- [Universal Context™](https://attio.com/context)
- [Workflows & Agents](https://attio.com/platform/workflows)
- [Pricing](https://attio.com/pricing)
- [Plans and features](https://attio.com/help/reference/workspace-settings-billing/attio-plans-and-features)
- [Objects, Lists, Views](https://attio.com/help/reference/attio-101/attios-data-model/define-your-data-model-objects-lists-and-views)
- [Standard objects](https://attio.com/help/reference/managing-your-data/objects/manage-standard-objects)
- [Ask Attio](https://attio.com/help/reference/attio-ai/ask-attio/chat-with-ask-attio)
- [Changelog: Workflows (29.06.2026)](https://attio.com/changelog/2026/what-s-new-in-workflows)
- [Changelog: Activity timeline (29.06.2026)](https://attio.com/changelog/2026/new-activity-timeline)
- [Developer docs](https://docs.attio.com/docs/overview)

### dashboard-crm (репозиторий)

- `CRM-EVOLUTION-PLAN.md` — Attio как UX-бенчмарк
- `improvements/hubspot-analysis-2026-07-12.md` — пересекающиеся приоритеты
- `src/lib/hooks/use-saved-views.ts`, `use-entity-timeline.ts`, `use-automation-rules.ts`
- `src/components/today/TodayView.tsx`
- `src/lib/utils/deal-health.ts`