# Salesforce — комплексный анализ и инсайты для dashboard-crm

**Дата:** 2026-07-12  
**Метод:** парсинг salesforce.com (Sales Cloud, Agentforce, Revenue Cloud), pricing (official + tech.co 2026), ecosystem news (Salesforce Ben, pricing update 2025), сопоставление с кодовой базой dashboard-crm и предыдущими бенчмарками (HubSpot, Accelo, Clay).  
**Связанные документы:** `improvements/crm-benchmark-candidates-2026-07-12.md` (приоритет #5 — **enterprise expectations only**), `improvements/hubspot-analysis-2026-07-12.md`, `improvements/accelo-analysis-2026-07-12.md`, `_analysis/architecture-delivery-projects.md`.

---

## 0. Как читать этот документ

| Символ | Значение |
|--------|----------|
| ✅ | Паритет или сильная альтернатива |
| 🟡 | Частично / другая модель |
| ❌ | Нет |
| ➕ | Есть у нас, у Salesforce нет «из коробки» или слабее |
| 🔒 | Требует платного edition / add-on Salesforce |

**Контекст:** Salesforce — **эталон enterprise CRM platform**, не конкурент по размеру команды. dashboard-crm — **вертикальная CRM** (5–15 человек, маркировка + внедрения 1С/ЧЗ). Этот анализ отвечает на вопрос: **что enterprise-клиент и его IT/закупки ожидают увидеть**, когда сравнивают нас с «у нас всё в Salesforce» — и **что имеет смысл закрыть для credibility**, не строя второй Salesforce.

**Не цель:** копировать Clouds, AppExchange, Data 360, CPQ+, Agentforce 1 Editions.

---

## 1. Salesforce в 2026 — позиционирование и архитектура

### 1.1 Слоган и стратегия

Salesforce позиционируется как **#1 AI CRM** / **Customer 360 platform** — единая операционная система revenue + service + marketing на общем data layer, с **Agentforce** как agentic-слоем поверх всего.

Ключевые концепции (с [salesforce.com/sales](https://www.salesforce.com/sales/), [Agentforce](https://www.salesforce.com/sales/ai-sales-agent/)):

```
Customer 360 Platform (2026)
├── Sales Cloud — Leads, Opportunities, Forecasting, Sales Workspace
├── Service Cloud — Cases, Omni-channel, Knowledge, SLA
├── Marketing Cloud — Journeys, campaigns (отдельный контур)
├── Revenue Cloud — CPQ, contracts, billing, subscription lifecycle
├── Data 360 (бывш. Data Cloud) — unified customer profile, analytics
└── Agentforce — autonomous + suggestive AI agents (sales, service, quoting)

Поверх:
├── AppExchange — 9,000+ apps / integrations
├── Flow / Process Builder — enterprise automation
├── Approval Processes — multi-step sign-off
├── Einstein — predictive scoring, forecasting, conversation intelligence
└── Slack + Salesforce Channels — CRM в collaboration layer
```

**Главное отличие от HubSpot/Pipedrive/Close:** Salesforce — **platform play** с edition-gating, SI-экосистемой (Deloitte, Accenture) и **годами implementation**. Не «CRM для репа», а **операционная система компании** с отдельным бюджетом на администрирование.

**Стратегический pivot 2025–2026:** Einstein → **Agentforce**; Flex Credits / Conversations pricing; **+6%** на Enterprise/Unlimited editions (авг. 2025); Agentforce 1 Editions ($550/user/mo).

### 1.2 Масштаб (заявленный, 2026)

| Метрика | Значение |
|---------|----------|
| Fortune 500 penetration | Доминирующий enterprise CRM |
| AppExchange | 9,000+ приложений |
| Agentforce ARR | $100M+ (Q1 FY26 earnings, cited) |
| Клиенты-референсы | Siemens, Volkswagen Group, Crexi, BACA Systems |

### 1.3 Ценовая модель (2026)

Источники: [salesforce.com/sales/pricing](https://www.salesforce.com/sales/pricing/), [Agentforce pricing](https://www.salesforce.com/agentforce/pricing/), [tech.co breakdown](https://tech.co/crm-software/salesforce-pricing-how-much-does-salesforce-cost) (июль 2026).

| Edition | Цена (list, annual) | Ключевое |
|---------|---------------------|----------|
| **Free Suite** | $0 | 2 users, basic pipeline |
| **Starter Suite** | **$25/user/mo** | Sales + service + marketing lite |
| **Pro Suite** | **$100/user/mo** | Lead scoring, AppExchange |
| **Enterprise** | **$175/user/mo** | Workflows, approvals, advanced pipeline, API |
| **Unlimited** | **$350/user/mo** | Einstein forecasting, conversation intelligence |
| **Agentforce 1 Sales** | **$550/user/mo** | Unmetered Agentforce + Data 360 credits bundle |

**Add-ons (ориентир):**
| Add-on | Цена |
|--------|------|
| Agentforce add-on | $125/user/mo |
| CPQ | $105/user/mo (+ CPQ+ $210) |
| Sales Contracts (CLM) | $70/user/mo |
| Flex Credits | $500 / 100k credits |

**Инсайт для позиционирования:** команда 10 человек на **Sales Cloud Enterprise** = **$1,750/mo** list + implementation ($50k–500k типично для mid-market) + admin FTE. **Agentforce + CPQ** легко удваивает TCO. dashboard-crm для внутренней команды интегратора — **на порядки дешевле**, но enterprise-клиент сравнивает не цену, а **зрелость процессов**: audit, approvals, formal quotes, API, SSO.

---

## 2. Объектная модель Salesforce

### 2.1 Standard objects (Sales + Service)

| Salesforce object | Назначение | dashboard-crm |
|-------------------|------------|---------------|
| **Lead** | Pre-qualification, conversion | ✅ `leads` + `convert_lead` RPC |
| **Account** | Company | ✅ `companies` |
| **Contact** | Person + Account relation | ✅ `contacts` + company links |
| **Opportunity** | Deal pipeline | ✅ `projects(type=client)` |
| **Opportunity Team** | Roles on deal | 🟡 `project_members` (delivery-focused) |
| **Case** | Support ticket | ❌ |
| **Task / Event** | Activities | ✅ `tasks`, `calls`, `meetings` |
| **Quote / Quote Line** | CPQ artifact | ❌ (kp-master вне CRM) |
| **Contract** | CLM | ❌ |
| **Project** (PSA) | Post-sale delivery | ✅ `projects(type=delivery)` |
| **Custom Object** | Extensibility | ➕ миграции Supabase (дешевле) |

### 2.2 Opportunity stages — паттерн, который мы уже используем

Наш `STAGE_CONFIG` и 4-phase kanban явно референсят Salesforce Opportunity Board:

```46:51:src/lib/validators/project.ts
// Архитектурное решение: 14 стадий — слишком много для горизонтального Kanban.
// Решение по опыту Salesforce Opportunity Board:
// группируем в 4 фазы, внутри каждой — детальный прогресс на карточке.
```

**Salesforce:** много stage values + **collapsed path** на board + probability per stage.  
**Мы:** 14 domain-specific stages (`cz_approval`, `experiment_setup`…) → 4 phases (`attract/develop/negotiate/close`) + `probability` в STAGE_CONFIG.

**Инсайт:** вертикальная воронка ЧЗ/1С **глубже** типичного SF Opportunity path — это **конкурентное преимущество**, не gap.

### 2.3 Deal → Delivery (PSA pattern)

Из `_analysis/architecture-delivery-projects.md`:

| Платформа | Паттерн |
|-----------|---------|
| **Salesforce** | Opportunity (Closed Won) → Project (PSA/Milestones или custom object), lookup, 1:N |
| **HubSpot** | Deal won → Projects object |
| **Мы** | `client` won → `spawn_delivery_project`, `parent_deal_id`, `delivery_kind` |

**Паритет intent** с Salesforce PSA. У SF — через PSA Cloud / custom objects + SI; у нас — native `type=delivery` + templates.

---

## 3. Sales Cloud — что enterprise ожидает

### 3.1 Pipeline & forecasting

| Возможность | Salesforce | dashboard-crm |
|-------------|------------|---------------|
| Weighted pipeline | ✅ Einstein / manual | 🟡 `probability` × amount |
| Team forecast | 🔒 Unlimited + add-ons | ❌ |
| Quota management | 🔒 Sales Planning $70/user | ❌ |
| Opportunity scoring | 🔒 Unlimited / add-on | 🟡 `deal-health`, rotting |
| Pipeline inspection | ✅ advanced reports | 🟡 `PipelineBoard`, analytics |
| Stage skip prevention | 🟡 validation rules | ➕ **hard gates** `check_stage_requirements()` |

**Enterprise expectation:** CFO/директор видит **forecast dashboard** по менеджерам. У нас `overview` + `analytics` — **достаточно для команды 5–15**, слабо для enterprise procurement review.

### 3.2 Approval processes

Salesforce **Approval Processes** — multi-step sign-off (скидка >15%, контракт >X млн, переход на стадию «Contract»).

| Аспект | SF | Мы |
|--------|-----|-----|
| Discount approval | ✅ CPQ + approval | ❌ |
| Stage transition approval | 🟡 optional | ➕ DB gate (другая модель — enforcement, не sign-off) |
| Contract legal review | ✅ CLM add-on | ❌ |
| Audit who approved | ✅ field history | 🟡 `activity_log` |

**Инсайт:** наши **stage gates** сильнее для **process compliance** («нельзя перейти без КП»). Salesforce approvals сильнее для **matrix sign-off** («директор согласовал скидку»). Для промышленных B2B **оба** могут понадобиться на поздних стадиях (`contract_review`).

### 3.3 Sales Workspace + Agentforce pipeline management

[Agentforce Sales](https://www.salesforce.com/sales/ai-sales-agent/) (2026):
- **Automated Opportunity Updates** — AI из calls/emails → stage, next steps
- **Suggestive vs Autonomous mode** — HITL или auto
- **Sales Workspace** — rep + agent единая очередь, quota chart
- **Conversation → structured fields** — аналог HubSpot Smart Deal Progression

| Аспект | SF Agentforce | dashboard-crm |
|--------|---------------|---------------|
| Post-meeting field updates | ✅ Enterprise+ | 🟡 AI Hub (звонки/встречи), HITL |
| Autonomous stage change | ✅ | ❌ сознательно |
| Action inbox | Sales Workspace | ➕ **TodayView** |
| Domain coaching (SPIN) | Generic Sales Coach | ➕ **spin_review** preset |
| Prospecting agent (SDR) | ✅ | ❌ вне домена |

**Вывод:** Agentforce = generic enterprise AI + outbound. Наш AI Hub = **vertical intelligence**. Enterprise client спросит «а AI обновляет сделку после встречи?» — gap закрывается **P0 Smart Deal Progression** из hubspot-analysis, не Agentforce clone.

---

## 4. Revenue Cloud / CPQ — главный enterprise gap

[Revenue Lifecycle Management](https://www.salesforce.com/sales/revenue-lifecycle-management/) (2026):

```
Quote-to-Cash (Salesforce)
├── Product Catalog + Constraint Builder
├── CPQ — configure, price, discount rules
├── Contract Lifecycle Management — templates, redlining, e-sign
├── Order orchestration → billing → revenue recognition
└── Agentforce Quoting — NL → quote generation
```

| Возможность | Salesforce | dashboard-crm |
|-------------|------------|---------------|
| Product catalog | ✅ | ❌ (услуги внедрения, не SKU) |
| Formal Quote object | ✅ + PDF | ❌ kp-master HTML/PDF вне CRM |
| Discount rules / guardrails | ✅ CPQ | ❌ |
| Contract generation | ✅ CLM | ❌ |
| Quote → Opportunity link | ✅ native | 🟡 сумма на project, нет статуса КП |
| E-signature | ✅ | ❌ |
| Integration с ERP (1С) | MuleSoft / partners | 🟡 планируется `do_url`, sync |

**Enterprise expectation:** «Где КП №47 от 12.03? Кто согласовал цену?» — без quote-объекта мы выглядим как «табличка», не revenue system. **P4 Quotes в CRM** (hubspot/accelo) — **главный enterprise-readiness пункт**, не report builder.

---

## 5. Service Cloud — post-sale expectations

| Возможность | Salesforce Service Cloud | dashboard-crm |
|-------------|--------------------------|---------------|
| Case / Ticket | ✅ core | ❌ |
| SLA + escalation | ✅ | ❌ |
| Knowledge Base | ✅ | ❌ |
| Omni-channel (email/chat) | ✅ | ❌ |
| Customer portal | ✅ Experience Cloud | ❌ |
| Post-delivery support | Cases linked to Account | 🟡 Accelo-style tickets (P5 optional) |

**Для домена маркировка/1С:** после внедрения вопросы клиента часто идут в **1С:ДО / Telegram**, не в CRM. Service Cloud **не копируем** — но enterprise RFP может требовать «единая точка обращений». Минимальный ответ: **лёгкий ticket** (Accelo P5) или явная интеграция с ДО.

---

## 6. Automation & governance — platform maturity

### 6.1 Flow / Process Builder vs наш S29

| Аспект | Salesforce Flow | dashboard-crm |
|--------|-----------------|---------------|
| Visual builder | ✅ | ❌ |
| Triggers | record-triggered, scheduled, platform events | 🟡 `stage_entered` only |
| Actions | 50+ (email, apex, subflow, approval) | `create_task` |
| Branching | complex | ❌ |
| Time-based | ✅ | ❌ |
| Run history | ✅ | 🟡 `automation_runs` |

**Enterprise expectation:** «Настройте workflow без разработчика». У SF — да (но нужен certified admin). У нас — **код + миграции**. Для внутренней команды это ОК; для **productized CRM** — gap. **P1 Workflow Engine** (hubspot-analysis) закрывает 80% без Flow canvas.

### 6.2 Security & compliance (что спрашивает enterprise IT)

| Требование | Salesforce | dashboard-crm |
|------------|------------|---------------|
| SSO (SAML/OIDC) | ✅ | 🟡 Supabase Auth (OAuth), нет SAML out of box |
| Field-level security | ✅ | 🟡 RLS row-level |
| Role hierarchy | ✅ complex | 🟡 owner/admin/manager/viewer |
| Audit trail | ✅ Field History Tracking | 🟡 `activity_log` (events, не field-level) |
| Data residency | Hyperforce regions | 🟡 Supabase region |
| SOC 2 / ISO | ✅ trust.salesforce.com | 🟡 Supabase + Netlify certs |
| Sandbox / staging | ✅ full copy | 🟡 preview deploys |
| API access | REST/SOAP/Bulk | 🟡 Supabase REST + Edge Functions |

**Где мы уже enterprise-grade:**
- **Multi-tenant RLS** (`organizations` + `memberships`, org_id на всех таблицах)
- **Hard stage enforcement** (редко в SF без custom dev)
- **PII-aware AI** (AI-HUB-CONCEPT: private bucket, no transcript in logs)

**Где enterprise procurement упрётся:**
- Нет **SSO/SAML** → «не пройдём IT security review»
- Нет **field-level audit** → «кто изменил сумму сделки?»
- Нет **public API contract** для 1С → «как интегрировать с нашим ландшафтом?»

---

## 7. Agentforce & Einstein — AI layer (2026)

### 7.1 Продуктовые блоки

| Блок | Назначение | Релевантность нам |
|------|------------|-------------------|
| **Prospecting Agent** | Autonomous SDR, signal scores | ❌ outbound |
| **Pipeline Management Agent** | Auto-update Opportunity | 🟡 → Smart Deal Progression |
| **Sales Coach** | Role-play, pitch feedback | 🟡 → SPIN review сильнее в нише |
| **Quoting Agent** | NL → CPQ quote | ❌ без CPQ |
| **Service Agent** | Case deflection | ❌ |
| **Flex Credits** | Usage-based AI meter | ❌ не копируем |

### 7.2 Сравнение с AI Hub

| AI capability | Agentforce | dashboard-crm AI Hub |
|---------------|------------|----------------------|
| Transcript analysis | ✅ Conversation Intelligence | ✅ `transcripts`, `ai_runs` |
| Meeting protocol | 🟡 generic summary | ➕ `meeting_protocol` |
| SPIN call review | ❌ | ➕ `spin_review` |
| Analytic note (внедрение) | ❌ | ➕ `analytic_note` |
| HITL apply to CRM | ✅ suggestive mode | 🟡 manual copy |
| Autonomous agents | ✅ | ❌ сознательно |
| Pricing | $125–550/user + credits | Flat (Anthropic API) |

**Стратегия:** на вопрос «у вас есть AI как в Salesforce?» отвечаем **domain AI + HITL progression**, не Agentforce SDR.

---

## 8. Gap-матрица: dashboard-crm vs Salesforce

### 8.1 Где dashboard-crm **сильнее** Salesforce (для нашего домена)

| Возможность | Почему |
|-------------|--------|
| **Vertical pipeline** (ЧЗ, ERP, experiment) | SF — generic Opportunity stages |
| **Hard stage gates** | SF — validation rules, обходимы admin'ом |
| **Delivery native** (templates, phases, milestones) | SF — PSA Cloud / custom project, heavy SI |
| **TodayView action queue** | SF — tasks spread, Workspace только top editions |
| **Deal rotting / reconnect** | SF — через reports/lists, не first-class |
| **Domain AI** (SPIN, протокол, аналит. записка) | SF — generic Einstein |
| **TCO для малой команды** | SF Enterprise 10 users ≈ $21k/yr list |
| **Schema agility** | Миграции vs change sets / metadata API |
| **Speed of UI** | Linear-inspired UX vs classic SF Lightning |

### 8.2 Enterprise readiness gaps (что клиент с SF привык видеть)

| Возможность | Salesforce | dashboard-crm | Gap severity |
|-------------|------------|---------------|--------------|
| Formal Quotes / CPQ | ✅ Revenue Cloud | ❌ | **HIGH** |
| Approval workflows (discount/contract) | ✅ | ❌ | **MEDIUM** |
| Team forecasting | ✅ | 🟡 weighted only | **MEDIUM** |
| Case / ticket management | ✅ Service Cloud | ❌ | LOW–MED |
| Field-level audit history | ✅ | 🟡 activity_log | **MEDIUM** |
| SSO / SAML | ✅ | ❌ | **HIGH** (if selling to enterprise IT) |
| Public integration API | ✅ REST/SOAP | 🟡 Supabase direct | **MEDIUM** |
| Report builder | ✅ | ❌ | LOW (мала команда) |
| CLM / e-sign | ✅ add-on | ❌ | LOW |
| App marketplace | ✅ AppExchange | ❌ | N/A |

### 8.3 Уже на паритете

| Возможность | Статус |
|-------------|--------|
| Lead → Account → Contact → Opportunity | ✅ convert_lead |
| Activity tracking (calls, meetings, tasks) | ✅ |
| Files on deal | ✅ project_files |
| Multi-tenant + roles | ✅ RLS + memberships |
| Pipeline board + probability | ✅ |
| Won → delivery project | ✅ spawn (manual/HITL) |
| Automation on stage | 🟡 S29 |
| AI on conversations | 🟡 AI Hub |

---

## 9. Архитектурное сравнение

```
Salesforce Customer 360              dashboard-crm
──────────────────────              ───────────────
Lead ──convert──► Account            leads ──convert_lead──► companies
                      │                                      contacts
                      └── Opportunity ◄───                  projects (client)
                              │ won
                              ├── Quote (CPQ)               ❌ КП вне CRM
                              ├── Contract (CLM)            ❌
                              └── Project (PSA)             projects (delivery)

Flow (visual automation)            automation_rules (1×1)
Approval Process (sign-off)           stage_requirements (hard gate)
Field History                         activity_log (event-level)
Agentforce (generic AI)               AI Hub (domain presets)
Service Case                          ❌
AppExchange + MuleSoft                Edge Functions + будущий 1С API
```

**Ключевой архитектурный инсайт:** Salesforce разделяет **Opportunity / Quote / Project / Case** — мы схлопнули sales+delivery в `projects`, но **потеряли quote-layer**. HubSpot, Accelo и Salesforce **сходятся**: formal estimate/КП — отдельный артефакт на пути won → delivery.

---

## 10. Приоритеты для dashboard-crm

Отфильтровано: **enterprise credibility для B2B промышленных клиентов**, не platform parity. Пересечения с HubSpot/Accelo/Clay — не дублировать работу.

### P0 — Smart Deal Progression (HITL) (~0.5 спринта)

**Референс SF:** Agentforce Pipeline Management — suggestive mode, conversation → fields.

Ответ на enterprise demo: «AI предлагает обновить сделку после звонка, rep подтверждает».  
*Также hubspot-analysis P0.*

### P1 — Quote/КП как объект CRM (~0.5 спринта)

**Референс SF:** Opportunity ↔ Quote (CPQ lite без product catalog).

Минимум для enterprise:
- `quotes` или поля на project: status (draft/sent/approved/rejected), amount, sent_at, document_url
- Связь с kp-master output
- Показ в ProjectDetail + timeline event

*Также accelo P2, hubspot P4. **Главный SF-driven gap.***

### P2 — Field-level audit для критичных полей (~0.4 спринта)

**Референс SF:** Field History Tracking.

Для `projects.budget`, `stage_id`, `status`, `lost_reason`:
- Триггер → `activity_log` с `{field, old, new, actor}`
- UI: «История изменений» на карточке сделки

Закрывает procurement question «кто менял сумму?».

### P3 — Approval lite на поздних стадиях (~0.5 спринта, go/no-go)

**Референс SF:** Approval Process на Opportunity.

Только для `contract_review` / discount:
- Запрос согласования → статус `pending_approval` → admin approve/reject
- Без visual Flow builder

Не путать со stage gates (уже есть).

### P4 — Integration API contract для 1С/ДО (~1 спринт)

**Референс SF:** REST API + MuleSoft patterns.

Публичный контракт (не Supabase raw):
- `GET /api/v1/deals/:id`, `PATCH stage`, webhook `deal.won`
- API keys per org, rate limit
- Документация OpenAPI

Enterprise IT спрашивает это раньше, чем UI polish.

### P5 — SSO / SAML (~0.7 спринта, если RFP требует)

**Референс SF:** Identity SSO.

Supabase SAML 2.0 SSO (Pro plan) или OAuth через корп. IdP.  
Триггер: первый enterprise RFP с security checklist.

### P6 — Team forecast view (~0.3 спринта)

**Референс SF:** Forecasting (Unlimited).

Простая таблица: менеджер × weighted pipeline × quota (manual).  
Достаточно для совета директоров клиента, не Einstein.

### Отложить / не копировать

- Full CPQ + product catalog + constraint builder
- Service Cloud / Cases / Knowledge / Experience Cloud
- Marketing Cloud / Journey Builder
- Data 360 / Customer Data Platform
- Agentforce autonomous agents / Flex Credits pricing
- AppExchange / ISV marketplace
- MuleSoft / full iPaaS
- Sales Planning / territory carving
- CLM + e-sign (до объёма договоров)
- Lightning UI paradigm / hundreds of admin settings
- Sandbox full-copy environments

---

## 11. Salesforce vs HubSpot vs Accelo — что брать от кого

| Паттерн | Лучший референс | Для enterprise gap |
|---------|----------------|---------------------|
| Platform breadth | **Salesforce** | Не копируем — знаем scope |
| Quote-to-cash | **Salesforce** Revenue Cloud | P1 Quotes lite |
| Approval matrix | **Salesforce** | P3 approval lite |
| AI conversation → CRM | **SF Agentforce** + **HubSpot** SDP | P0 HITL |
| Delivery PSA | **Accelo** + SF PSA | Уже есть |
| Stage enforcement | **Мы** | Преимущество vs SF |
| Action inbox | **Мы** (TodayView) | Преимущество |
| Workflow depth | **HubSpot** / **SF Flow** | P1 engine (hubspot) |
| SMB speed | **Pipedrive/Close** | Уже внедрено |

---

## 12. Что сознательно НЕ копировать

- Customer 360 как «всё в одном» (marketing + service + commerce + data)
- Per-seat enterprise pricing model ($175–550/user)
- Agentforce SDR / autonomous prospecting
- CPQ+ с product rules engine
- SI-зависимый implementation (6–18 месяцев)
- Admin-certification ecosystem
- Lightning component framework
- Org limits / storage overage billing
- «Salesforce для интегратора» — мы строим **vertical CRM**, SF — **horizontal OS**

**Стратегия:** Salesforce в бенчмарке — **чеклист enterprise expectations**, не roadmap на 3 года. Закрыть **Quotes, audit, API, (опционально) SSO и approvals** — достаточно, чтобы разговаривать с заводом/холдингом на равных, сохраняя vertical speed.

---

## 13. Итоговый вывод

**Salesforce (#5) завершает слой «enterprise»** в матрице бенчмарков. HubSpot дал platform+AI, Accelo — delivery, Clay — signals, Pipedrive/Close — activity selling. Salesforce отвечает: **«что спросит закупка и IT у крупного клиента»**.

**Где мы уже enterprise-capable:**
- Multi-tenant RLS + role model
- Audit events (`activity_log`)
- Hard stage gates (сильнее типичного SF org)
- Lead-to-deal-to-delivery lifecycle
- Vertical process (ЧЗ/ERP) как configured product
- AI Hub с HITL на транскриптах

**Критические enterprise gaps (по ROI):**
1. **Quote/КП объект** (P1) — без него не revenue system
2. **Field-level audit** (P2) — compliance question
3. **Smart Deal Progression** (P0) — AI credibility vs Agentforce demo
4. **Public API** (P4) — 1С/ERP интеграция
5. **SSO** (P5) — при первом RFP

**Конкурентная позиция vs Salesforce:**

| Вопрос клиента | Ответ |
|----------------|-------|
| «Почему не Salesforce?» | Vertical CRM под маркировку/1С, в 10× быстрее и дешевле для команды интегратора |
| «У нас внутри Salesforce» | Мы даём **специализированный контур внедрения** + API sync, не заменяем ваш SF |
| «Есть ли CPQ/AI/audit?» | Quotes lite + domain AI + audit trail — roadmap P0–P2 |

**Бенчмарк-очередь исчерпана** по приоритетному списку `crm-benchmark-candidates`. Следующие кандидаты вне очереди: **Insightly** (PSA alt), **Affinity** (relationship scoring), **folk** (IA simplification).

---

## 14. Источники

### Salesforce (официальные, спарсено 2026-07-12)

- [Sales Cloud](https://www.salesforce.com/sales/)
- [Sales Cloud pricing](https://www.salesforce.com/sales/pricing/)
- [Agentforce Sales / AI Sales Agent](https://www.salesforce.com/sales/ai-sales-agent/)
- [Agentforce pricing](https://www.salesforce.com/agentforce/pricing/)
- [Revenue Lifecycle Management](https://www.salesforce.com/sales/revenue-lifecycle-management/)
- [Pricing update 2025 (official news)](https://www.salesforce.com/news/stories/pricing-update-2025/)

### Контекст рынка

- [Salesforce pricing breakdown 2026 (tech.co)](https://tech.co/crm-software/salesforce-pricing-how-much-does-salesforce-cost)
- [6% price increase + Agentforce editions (Salesforce Ben, июнь 2025)](https://www.salesforceben.com/salesforce-announces-6-pricing-increase-and-unlimited-agentforce-licenses/)

### dashboard-crm (репозиторий)

- `improvements/crm-benchmark-candidates-2026-07-12.md` — SF как приоритет #5
- `improvements/hubspot-analysis-2026-07-12.md` — workflow, SDP, quotes
- `improvements/accelo-analysis-2026-07-12.md` — PSA delivery
- `improvements/clay-analysis-2026-07-12.md` — GTM layer (works on SF)
- `_analysis/architecture-delivery-projects.md` — SF Opportunity → Project pattern
- `src/lib/validators/project.ts` — SF Opportunity Board phase grouping
- `supabase/migrations/20260712230000_baseline.sql` — `check_stage_requirements`, `convert_lead`
- `AI-HUB-CONCEPT.md` — PII, HITL, audit constraints