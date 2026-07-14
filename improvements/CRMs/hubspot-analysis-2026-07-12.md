# HubSpot CRM — комплексный анализ и инсайты для dashboard-crm

**Дата:** 2026-07-12  
**Метод:** парсинг официальных страниц HubSpot, Knowledge Base (обновления июль 2026), INBOUND 2025, сопоставление с кодовой базой dashboard-crm.  
**Предыдущая версия gap-анализа:** `_analysis/hubspot-map-and-gap-v2.md` (v2.1, 2026-07-10).

---

## 0. Как читать этот документ

| Символ | Значение |
|--------|----------|
| ✅ | Паритет или сильная альтернатива |
| 🟡 | Частично / другая модель |
| ❌ | Нет |
| ➕ | Есть у нас, у HubSpot нет «из коробки» или слабее |
| 🔒 | Требует платного tier HubSpot |

**Контекст:** HubSpot — горизонтальная CRM для inbound-маркетинга + sales + service. dashboard-crm — **вертикальная CRM** под продажи и внедрения маркировки (1С:ERP, Честный Знак). Рекомендации отфильтрованы под этот домен.

---

## 1. HubSpot CRM в 2026 — архитектура продукта

HubSpot перестроился вокруг **Smart CRM™** — единого AI-ядра, к которому подключаются 6 хабов:

```
                 ┌─────────────── Breeze AI (слой поверх всего) ───────────────┐
   Marketing  ·  Sales  ·  Service  ·  Content  ·  Data  ·  Revenue   ← 6 Hub'ов
                 └──────────────── Smart CRM (единое ядро: объекты · свойства · связи) ─┘
```

**Ключевая идея:** все хабы пишут в **один граф объектов**. Сделка, контакт, тикет, email — одна запись, одна timeline.

### 1.1 Стратегия INBOUND 2025 (200+ релизов)

| Направление | Что запустили | Статус |
|-------------|---------------|--------|
| **Data Hub** | Data Studio, Data Quality, синк внешних источников | Beta |
| **Breeze Agents** | 20+ агентов (Prospecting, Customer, Data Agent) | Studio & Marketplace — public beta |
| **The Loop** | Express → Tailor → Amplify → Evolve (новый growth playbook) | Available |
| **Sales Hub** | Smart Deal Progression, AI Guided Selling, Deal Scores | Beta / GA |
| **Revenue Hub** | AI-powered CPQ, Closing Agent, Flexible Approvals | Beta |
| **Smart CRM** | Flexible Views, Conversational Enrichment, AI Insights | Beta |

### 1.2 Ценовая модель (2026)

| Tier | Smart CRM | Sales Hub | Что locked |
|------|-----------|-----------|------------|
| **Free** | Contacts, Deals, Pipeline, Breeze Assistant | Track deals, meetings | Workflows, Leads, Forecasting |
| **Starter** | $15–20/seat | Enrichment, permissions | Workflows, Playbooks |
| **Professional** | $50–60/seat | **$120/seat** — Workflows, Leads, Forecasting, Playbooks | Custom objects |
| **Enterprise** | $75–90/seat | **$150/seat** — Quotas, approvals, call trends | — |

**Инсайт для позиционирования:** Leads, Workflows, Forecasting у HubSpot только с Sales Pro ($120/seat). Для команды 5–15 человек — экономия $600–1800/мес. У нас эти возможности без tier-ограничений.

---

## 2. Объектная модель HubSpot (верифицировано, KB 16.06.2026)

| Категория | Объекты | Tier / активация |
|-----------|---------|------------------|
| **Foundational** | Contacts, Companies | все планы |
| **Sales** | Deals, Leads, Calls, Meetings, One-to-one emails | Leads — 🔒 Sales Pro+ |
| **Marketing** | Marketing events, Campaigns, Notes, Communications | SMS — 🔒 Marketing Pro+ |
| **Service** | Tickets, Conversations, Appointments, Courses | Help Desk — 🔒 Service Pro+ |
| **Commerce/Revenue** | Products, Quotes, Invoices, Subscriptions, Orders, Carts | Quotes — Revenue Hub |
| **Other** | **Projects**, Tasks, Custom Objects | Projects — Super Admin activation; Custom — 🔒 Enterprise |

### 2.1 Паттерн HubSpot для delivery (релевантен нашему домену)

Из [Projects KB](https://knowledge.hubspot.com/records/understand-and-use-projects-object) (июль 2026):

> Sales team использовала post-closed-won стадию в deal pipeline для трекинга внедрения → испортили данные воронки. Решение: **отдельный Projects object** + workflow `Deal stage = Closed Won → Create Project`.

**Рекомендуемый workflow HubSpot:**
1. Activate Projects object
2. Настроить pipeline: Kickoff → Setup → Testing → Sign-off
3. Pipeline rule: restrict skipping stages
4. Deal-based workflow: Closed Won → Create Project + associate tasks
5. Gantt view для трекинга delivery

**У нас:** `projects` с `type: client | internal` — **схлопывание Deals + Projects в одну таблицу**. Сила (меньше дублирования) и ограничение (нельзя 1:1 копировать HubSpot UX для deals и projects раздельно).

---

## 3. Workflow Engine — главный «мотор» HubSpot

Workflows (Pro+) — ядро автоматизации. Категории действий ([KB, 13.07.2026](https://knowledge.hubspot.com/workflows/choose-your-workflow-actions)):

| Категория | Примеры |
|-----------|---------|
| **Delays** | Calendar date, date property, event occurrence, time of day, days of week |
| **Branches** | IF/THEN по свойствам, AND/OR, A/B split (Marketing Pro+) |
| **CRM actions** | Edit record, Create record, Enrich, Add line item, Validate phone |
| **Communication** | Email, SMS, WhatsApp, in-app notification, sequences |
| **AI actions** | Breeze agents, enrichment |
| **Data ops** | Webhooks, JS custom code, connected apps, Go to workflow |
| **Pipeline automations** | На стадию (не блокирующие) |

**У нас (S29):** `stage_entered → create_task` — один триггер × одно действие. Таблицы `automation_rules` / `automation_runs` уже есть.

**Главный разрыв с HubSpot** — workflow-движок.

---

## 4. AI-стратегия HubSpot vs AI Hub

| HubSpot (2026) | dashboard-crm | Вердикт |
|----------------|---------------|---------|
| **Breeze Copilot** — generic на всём CRM | AI Hub — 3 доменных пресета | Разный фокус |
| **Smart Deal Progression** (март 2026) — HITL: AI предлагает → rep подтверждает | `AiWorkspaceModal` — тот же паттерн, но только на звонках/встречах | 🟡 расширить |
| **Prospecting Agent** — автономный SDR | ❌ | Сознательно не копируем |
| **Data Agent** — вопросы по CRM + web | ❌ | Отложить |
| **Conversation Intelligence** — coaching из звонков | `spin_review` пресет | ➕ **сильнее в нише** |
| **Predictive lead scoring** | ❌ | Gap (ложится на workflow P1) |
| **Meeting Notetaker + transcript analysis** | `transcripts`, `ai_runs`, Edge `ai-run` | ✅ паритет по звонкам |

### Smart Deal Progression — ключевой референс (март 2026)

[Smart Deal Progression](https://www.hubspot.com/products/sales/smart-deal-progression) анализирует transcript встречи и предлагает:
1. Обновить поля сделки (budget, stage, custom properties)
2. Создать tasks из action items
3. Черновик follow-up email

Rep review → edit → apply одним кликом. Клиенты сообщают об экономии **1.5 часа/день на репа**.

**У нас уже есть:** `transcripts`, `ai_runs`, `AiWorkspaceModal`, пресеты `meeting_protocol`, `analytic_note`, `spin_review`. Это **эволюция, не с нуля**.

---

## 5. Sales Workspace vs TodayView

HubSpot [AI Guided Selling](https://www.hubspot.com/products/sales/ai-guided-selling) — единый workspace (Sales Pro+):
- Suggested tasks по buying signals
- Daily guidance
- Meeting prep + post-meeting follow-up
- Deal insight summaries

| Аспект | HubSpot | dashboard-crm |
|--------|---------|---------------|
| Единая очередь действий | Sales Workspace (Pro+) | ➕ TodayView (`/`) |
| Deal rotting / next action | Через workflows | ➕ Native `deal-health.ts` |
| Reconnect cooling contacts | Через lists | ➕ `use-last-touch` + Today |
| AI-suggested next steps | Smart Deal Progression | 🟡 частично в AI Hub |
| Buying signals / intent | Enrichment + web | ❌ |
| Cmd+K / командный бар | «Find or Ask» (поиск + AI) | ➕ CommandPalette |

**Вывод:** TodayView — аналог Sales Workspace, для малой команды **проще и быстрее**. Не копировать workspace целиком — усилить AI-suggestions в существующую очередь.

---

## 6. Gap-матрица: dashboard-crm vs HubSpot

### 6.1 Где dashboard-crm **сильнее** HubSpot

| Возможность | Почему |
|-------------|--------|
| **Stage gates** (блокировка перехода) | HubSpot — pipeline automation, не enforcement. У нас `check_stage_requirements()` + trigger |
| **TodayView + reconnect** | Native, не через lists/workflows |
| **Deal health / rotting** | Pipedrive-паттерн из коробки |
| **AI: SPIN / протокол / аналит. записка** | Доменные пресеты, у HubSpot — generic |
| **Deals + Projects в одной модели** | Меньше дублирования, проще для внедрений |
| **Custom schema через миграции** | Гибче Enterprise custom objects, бесплатно |
| **Leads без tier-ограничения** | HubSpot Leads — Sales Pro+ ($120/seat) |
| **9 тем оформления** | Косметика, но есть |

### 6.2 Ядро CRM

| Возможность | HubSpot | dashboard-crm | Gap |
|-------------|---------|---------------|-----|
| Единый граф + timeline | ✅ Smart CRM | ✅ Supabase + EntityTimeline | 🟡 без Notes/multichannel |
| Contacts / Companies | ✅ | ✅ | паритет |
| Deals | ✅ отдельный объект | ✅ `projects(client)` | 🟡 архитектурное схлопывание |
| Leads | 🔒 Sales Pro+ | ✅ + convert_lead RPC | ➕ |
| Projects (PM) | Super Admin activation | ✅ PCT-1 internal + columns | ➕ project-centric tasks |
| Tasks | ✅ + task queues | ✅ личный + проектный борд | паритет+ |
| Calls / Meetings | ✅ | ✅ | 🟡 без dialer/scheduler |
| Notes как activity | ✅ | ❌ в timeline | gap |
| Multichannel comms | ✅ Communications | ❌ | gap (план: Telegram/Email) |
| Tickets / SLA / KB | ✅ Service Hub | ❌ | gap (опционально) |
| Quotes / Products | ✅ Revenue Hub | ❌ | gap (КП вне CRM) |
| Custom objects | 🔒 Enterprise | ➕ миграции | ➕ |
| Файлы на сделке | ✅ | ✅ project_files | паритет |
| Excel-импорт | ✅ | ✅ ExcelImport.tsx | паритет |
| Cmd+K | 🟡 «Find or Ask» | ➕ CommandPalette | богаче, но у HubSpot не ❌ |

### 6.3 Sales-автоматизация

| Возможность | HubSpot | dashboard-crm | Gap |
|-------------|---------|---------------|-----|
| Workflow engine | ✅ визуальный конструктор | 🟡 S29: 1 trigger × 1 action | **главный разрыв** |
| Pipeline stage automations | ✅ (не блокирующие) | 🟡 S29 create_task | разрыв |
| Stage **gates** | 🟡 required properties | ➕ S27 enforcement | **мы сильнее** |
| Sequences | 🔒 Sales Pro+ | ❌ | gap (нужен email-контур) |
| Playbooks | 🔒 Sales Pro+ | ❌ | наш аналог — шаблоны внедрения (PCT P3) |
| Lead scoring | ✅ (+ predictive) | ❌ | gap |
| Meeting scheduler | 🔒 Pro+ | ❌ | отложить до Calendar |
| Forecasting | 🔒 Forecast tool | 🟡 weighted в PipelineBoard | частичный паритет |
| Smart Deal Progression | ✅ Sales Pro+ (март 2026) | 🟡 AI Hub на звонках | **быстрая победа** |

### 6.4 Аналитика и UX

| Возможность | HubSpot | dashboard-crm | Gap |
|-------------|---------|---------------|-----|
| Report builder | ✅ | ❌ | gap (команда мала — отложить) |
| Fixed dashboards | ✅ | ✅ overview + analytics | паритет |
| Lists / dynamic segments | ✅ active lists | 🟡 saved views (localStorage) | gap |
| Deal rotting | 🟡 workflows | ➕ native | **мы сильнее** |
| Action inbox | 🟡 tasks hub | ➕ TodayView | **мы сильнее** |

### 6.5 Data / интеграции

| Возможность | HubSpot | dashboard-crm | Gap |
|-------------|---------|---------------|-----|
| Data sync / ETL (100+ apps) | ✅ Data Hub | ❌ | будущий контур 1С/ЧЗ |
| Webhooks из workflows | ✅ | ❌ | часть P1 workflow |
| Импорт CSV/Excel | ✅ | ✅ | паритет |

---

## 7. Архитектурное сравнение

```
HubSpot Smart CRM                    dashboard-crm
─────────────────                    ───────────────
Deals object ─────┐                  projects table
                  │ Closed Won WF         type: client | internal
Projects object ──┘                  (схлопнуто)

Workflow Engine (50+ actions)        automation_rules (1×1)
Breeze AI (generic)                  AI Hub (3 domain presets)
Stage automations (soft)             stage_requirements (hard gates)
Sales Workspace (Pro+)               TodayView (action inbox)
```

---

## 8. Приоритеты для dashboard-crm

Отфильтровано под домен (продажи маркировки + внедрения 1С/ЧЗ) и стек Next.js + Supabase.

### P0 — Smart Deal Progression (быстрая победа, ~0.5 спринта)

HubSpot запустил в марте 2026. Расширить AI Hub с «анализ звонка» на **пост-встречный workflow**:

1. AI анализирует transcript (`transcripts` → `ai_runs`)
2. Предлагает: обновить поля `projects(client)`, создать tasks, черновик follow-up
3. User подтверждает в `AiWorkspaceModal` (HITL)

**Конкурентное преимущество:** доменные пресеты (SPIN, протокол), HubSpot — generic.

**Зависимости:** `transcripts`, `ai_runs`, `AiWorkspaceModal` — уже есть.

### P1 — Generic Workflow Engine (~1.5–2 спринта)

**Сейчас (S29):** hardcoded `stage_entered → create_task`.

**MVP-ядро (не весь HubSpot):**
- **Триггеры:** `stage_entered` (есть) + `field_changed`, `task_overdue`, `deadline_approaching`, `record_created`, `time_based`
- **Действия:** `create_task` (есть) + `set_field`, `notify`, `create_activity`, `webhook`
- **Условия:** JSONB-предикат на правиле (без visual canvas на старте)
- **Задержки:** обобщить `due_in_days` → таблица отложенных jobs + pg_cron

**Фундамент S29 есть** — эволюция, не с нуля.

### P2 — Шаблоны проектов внедрения (~0.7 спринта)

**HubSpot-референс:** `Closed Won → Create Project + columns + tasks`.

**Наша версия:**
```
client project stage = "Выиграна"
  → automation создаёт internal project
  → project_columns: [Обследование, Настройка, Тест, ОЭ]
  → tasks из шаблона по типу внедрения (ERP / ЧЗ / оба)
```

Зависит от P1 (workflow) или hardcoded trigger на стадии.

### P3 — Notes в EntityTimeline (~0.2 спринта)

Таблица `activities` с `type='note'` есть, но не в ленте (`use-entity-timeline.ts`). Низкий effort, закрывает gap с HubSpot Notes.

### P4 — Quotes как лёгкий объект (~0.5 спринта)

Привязать КП (kp-master) к `projects(client)`: статус, сумма, дата отправки/принятия. Без Revenue Hub.

### P5 — Динамические сегменты (~0.5 спринта)

Эволюция saved views: server-side `segments` с пересчётом («сделки без активности >7 дней»).

### P6 — Лёгкий тикетный контур (опционально, ~1 спринт)

Только если теряются вопросы клиентов на внедрении: объект «инцидент/вопрос» на internal-проекте + SLA-таймер. **Go/no-go:** болит ли сейчас?

### Отложить

- Sequences / email-маркетинг
- Meeting scheduler (до Calendar-интеграции)
- Report builder (пока команда мала)
- Breeze Agents / автономный SDR
- Revenue Hub / Stripe / Commerce
- Data Hub / Snowflake sync
- Marketing Hub целиком
- Content Hub (CMS)

---

## 9. Что сознательно НЕ копировать

- Marketing Hub (email-кампании, ads, attribution, forms, landing pages)
- Content Hub (CMS, блог)
- Commerce / Revenue Hub (биллинг в 1С)
- 20+ Breeze Agents / автономный SDR
- Marketing events, Campaigns, Courses, Listings
- Generic «HubSpot для бедных» — строим **вертикальную CRM под маркировку**

---

## 10. Итоговый вывод

**Ядро CRM** (объекты, timeline, пайплайны, права, AI-ниша, PCT-1, stage gates, Today/reconnect) — на уровне или **сильнее** HubSpot в домене продаж и внедрений маркировки. Кастомная схема через миграции гибче Enterprise custom objects.

| Приоритет | Что | Effort | Почему |
|-----------|-----|--------|--------|
| **P0** | Smart Deal Progression на базе AI Hub | ~0.5 спринта | HubSpot только что запустил; у нас фундамент есть |
| **P1** | Workflow Engine | ~1.5–2 спринта | Главный разрыв; фундамент S29 |
| **P2** | Project templates при выигрыше | ~0.7 спринта | Паттерн HubSpot Projects, подтверждён KB |
| **P3** | Notes в timeline | ~0.2 спринта | Быстрый gap-close |
| **P4** | Quotes в CRM | ~0.5 спринта | Связка с kp-master |
| **P5** | Dynamic segments | ~0.5 спринта | Эволюция saved views |

**Стратегия:** брать у HubSpot **паттерны автоматизации, AI-HITL и проектного исполнения**, не маркетингово-контентную обвязку. Сохранять **вертикальную специализацию** (гейты, SPIN, протоколы, маркировочные воронки) как конкурентное преимущество.

---

## 11. Источники

### HubSpot (официальные, спарсено 2026-07-12)

- [Free CRM](https://www.hubspot.com/products/crm)
- [Smart CRM / AI CRM](https://www.hubspot.com/products/crm/ai-crm)
- [Sales Hub](https://www.hubspot.com/products/sales)
- [Smart Deal Progression](https://www.hubspot.com/products/sales/smart-deal-progression)
- [AI Guided Selling](https://www.hubspot.com/products/sales/ai-guided-selling)
- [Understand objects](https://knowledge.hubspot.com/records/understand-objects) (16.06.2026)
- [Projects object](https://knowledge.hubspot.com/records/understand-and-use-projects-object) (02.07.2026)
- [Workflow actions](https://knowledge.hubspot.com/workflows/choose-your-workflow-actions) (13.07.2026)
- [The Loop playbook](https://www.hubspot.com/company-news/loop)

### Контекст рынка

- [INBOUND 2025 — Data Hub, Breeze Agents, The Loop](https://www.cmswire.com/digital-marketing/hubspot-unveils-data-hub-breeze-agents-and-the-loop-at-inbound-2025/) (03.09.2025)

### dashboard-crm (репозиторий)

- `_analysis/hubspot-map-and-gap-v2.md` — предыдущий gap-анализ (v2.1)
- `src/lib/hooks/use-automation-rules.ts` — S29 automation
- `src/lib/hooks/use-entity-timeline.ts` — EntityTimeline
- `src/components/today/TodayView.tsx` — action inbox
- `supabase/migrations/027_stage_gates.sql`, `029_automation.sql`, `032_project_boards.sql`