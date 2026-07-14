# Affinity CRM — комплексный анализ и инсайты для dashboard-crm

**Дата:** 2026-07-12  
**Метод:** парсинг affinity.co (homepage, CRM, Relationship Intelligence, AI/MCP, Affinity Data, Analytics, Extensions, Pricing, deal-flow LP), blog (relationship intelligence deep dive, warm introductions July 2026), Attio vs Affinity comparison 2026, сопоставление с кодовой базой dashboard-crm (W2b reconnect, deal-health, TodayView, Clay/Attio analyses).  
**Связанные документы:** `improvements/CRMs/crm-benchmark-candidates-2026-07-12.md` (Tier 2 — relationship scoring), `improvements/clay-analysis-2026-07-12.md`, `improvements/attio-analysis-2026-07-12.md`, `CRM-EVOLUTION-PLAN.md` (волна 2.2 reconnect).

---

## 0. Как читать этот документ

| Символ | Значение |
|--------|----------|
| ✅ | Паритет или сильная альтернатива |
| 🟡 | Частично / другая модель |
| ❌ | Нет |
| ➕ | Есть у нас, у Affinity нет «из коробки» или слабее |
| 🔒 | Требует платного tier Affinity |

**Контекст:** Affinity — **relationship intelligence CRM для private capital** (VC/PE/IB/CRE). В `crm-benchmark-candidates` указана сила: **relationship scoring из email/calendar, deal flow**. Для dashboard-crm (B2B внедрения 1С/ЧЗ, команда 5–15, длинный цикл) Affinity — **эталон #1 по глубине relationship graph и warm-intro pathing**, но **не по pipeline/delivery** (там Monday/Accelo/Zoho). Clay закрывает **market signals**; Affinity — **communication graph внутри фирмы**.

**Критический инсайт до анализа:** у нас уже есть **reconnect v1 (W2b)** — это **recency-слой** Affinity (один из трёх сигналов warm intro), но **без firm-wide graph, strength score и email auto-capture**.

---

## 1. Affinity в 2026 — позиционирование и архитектура

### 1.1 Слоган и стратегия

Affinity позиционируется как **«The CRM for Private Capital»** — **«Your next deal is in your network»**. Продукт = CRM + **relationship intelligence layer**, построенный на **автоматическом захвате email/calendar** всей команды.

Ключевые концепции (с [affinity.co](https://www.affinity.co/), [CRM product](https://www.affinity.co/product/crm)):

```
Affinity Platform
├── Relationship Intelligence (ядро)
│   ├── Auto-capture: email + calendar → people/org records
│   ├── Relationship Strength Score (0–100, recency × frequency × two-way)
│   ├── Collective network graph (firm-wide, не per-user)
│   ├── Warm intro paths — ranked introducer to target
│   ├── Inferred connections (shared work history)  🔒 Scale+
│   └── Triggers: score drops below threshold → alert
├── CRM (dealflow)
│   ├── Smart Lists (people, orgs, opportunities)
│   ├── Deal pipeline (kanban: New → Reviewing → DD…)
│   ├── Activity timeline (auto-logged emails, meetings)
│   └── Notes, files, one-click updates
├── Affinity Data (enrichment)
│   ├── 40+ sources (Pitchbook, Crunchbase, Dealroom…)
│   ├── Firmographic, funding, employee growth
│   └── API import proprietary data
├── Affinity Sourcing (2025)
│   └── Deal discovery beyond existing network
├── AI Layer (2025–2026)
│   ├── MCP → Claude/ChatGPT/Copilot/Gemini (read + write CRM)
│   ├── Meeting prep, Notetaker  🔒 Advanced+
│   ├── File Analyzer, Industry Insights
│   └── Write-back: notes, fields, tags from AI tools
├── Extensions
│   ├── Pathfinder (Chrome + Gmail)  🔒 Scale+
│   ├── Outlook add-in  🔒 Scale+
│   ├── Mobile (iOS/Android)  🔒 Scale+
│   └── Affinity Meetings (Zoom context)  🔒 Scale+
├── Analytics  🔒 Scale+
│   ├── Deal sourcing by channel
│   ├── Team activity / win rates
│   └── Introduction summary reports (LP/portco)
└── Alliances
    └── Share network slices with portcos, co-investors, LPs
```

**Главное отличие от HubSpot/Salesforce:** Affinity — не platform CRM, а **network graph CRM**. System of record = **кто с кем общался**, не только «сделка на стадии X».

**Главное отличие от Attio:** Attio — flexible Smart CRM с connection strength из inbox; Affinity — **deeper proprietary scoring + warm-intro pathing + VC-shaped pipeline** ([Attio vs Affinity 2026](https://www.automationjinn.com/blog/attio-vs-affinity): Attio $828/user/yr vs Affinity Advanced $2,700).

**Главное отличие от Clay:** Clay — **внешние market signals** (job change, funding); Affinity — **внутренний communication graph** (кто в фирме знает CFO).

### 1.2 Заявленные метрики (маркетинг + кейсы, 2026)

| Метрика | Значение |
|---------|----------|
| Organizations | 3,000+ deal-making firms |
| Top firms | «Over half of top firms» (homepage) |
| Hours saved | 188–220 h/person/year (manual data entry) |
| Contacts auto-created | 300+ per user |
| Launch time | 72 hours |
| Deal flow lift | +25% pipeline, close 25% faster (RI guide) |
| Warm intro speed | Close deals 25% faster via warm paths |
| Seaside Equity | 15+ deals closed post-Affinity |
| Motive Partners | +66% deals reviewed annually |
| 8VC | −50% deal flow process time |
| BDC Capital | 5× orgs/contacts tracked (32K orgs, 105K contacts) |
| Notion Capital | +50% companies screened/year |

### 1.3 Ценовая модель (2026)

Источник: [affinity.co/product/affinity-pricing](https://www.affinity.co/product/affinity-pricing) (опубликовано 2026; annual only, demo-first).

| Plan | Цена (annual) | Ключевое |
|------|---------------|----------|
| **Essential** | $2,000/user/yr | RI, auto-capture, pipeline, Affinity Data basic |
| **Scale** | $2,300/user/yr | + MCP, analytics, Pathfinder, inferred connections |
| **Advanced** | $2,700/user/yr | + Notetaker, premium enrichment, bulk email |
| **Enterprise** | Custom | + SSO, full API, data governance |

**Tier gates (критично):**
- API / MCP: ❌ Essential → ✅ Scale ($2,300)
- Pathfinder, Outlook, Mobile: ❌ Essential → ✅ Scale
- Analytics: ❌ Essential → ✅ Scale
- Notetaker, premium enrichment: 🔒 Advanced ($2,700)
- Inferred connections: 🔒 Scale+

**Инсайт:** команда 5 на Scale = **$11,500/yr** минимум. dashboard-crm — **$0 seat tax**, reconnect native.

**Нет:** free tier, self-serve trial (demo + sales call).

---

## 2. Relationship Intelligence — ядро продукта

### 2.1 Три компонента (официальная модель)

Из [What is relationship intelligence](https://www.affinity.co/why-affinity/what-is-relationship-intelligence) и [deep dive blog](https://www.affinity.co/blog/relationship-intelligence) (обновлено 15.06.2026):

```
1. Data collection — «data exhaust»
   email headers/bodies, calendar invites, meeting metadata
   → auto-create/update people & org records

2. Data analysis — algorithms on communication patterns
   → relationship strength, warm paths, decay detection

3. Actionable insights
   → who to ask for intro, when to reconnect, meeting prep
```

### 2.2 Relationship Strength Score

Из [product/relationship-intelligence](https://www.affinity.co/product/relationship-intelligence), [warm introductions blog](https://www.affinity.co/blog/which-relationships-drive-warm-introductions) (02.07.2026):

| Сигнал | Как измеряется | Пример UI |
|--------|----------------|-----------|
| **Strength** | Frequency + two-way engagement | Score 88/100 к Martin Smith |
| **Recency** | Time since last interaction | «Last Contact» на company profile |
| **Mutual context** | Shared deals, topics, work history | Inferred connections (Scale+) |

**Три сигнала успешного warm intro** (Affinity methodology):
1. Introducer has **strong, two-way** tie to target
2. Relationship is **recent**, not dormant
3. **Mutual context** exists (not cold forward)

**Triggers:** когда score падает ниже порога → alert «relationship lagging» → nurture.

### 2.3 Collective Network vs Individual CRM

Ключевой паттерн Affinity — **firm-wide graph**:

```
User A's inbox ──┐
User B's calendar ──┼──► Affinity Graph ──► «Who knows CEO at TargetCo?»
User C's email ──┘         Ranked by strength + recency
```

На карточке контакта: **«1 person you know · 12 people your team knows»** — видимость **организационного**, не личного CRM.

**У нас:** `owner_id` на сделке, `created_by` на активностях — **🟡 нет агрегации «кто в org последний общался с контактом»**.

### 2.4 Warm Introduction Paths

Workflow:
1. Target company/person в Pathfinder или CRM search
2. Affinity показывает **ranked colleagues** с strongest path
3. Recommended introduction с score + relationship history
4. Introducer sends; CRM logs activity auto

**Кейс 8VC:** Pathfinder на сайте клиента → «мы знаем их» → intro → сделка.

**Для нашего домена (1С/ЧЗ):** warm intro = «кто в Cleverence знает IT-директора завода» — **релевантно**, но источник данных у нас **звонки/встречи в CRM**, не email всей фирмы.

---

## 3. Модель данных Affinity

### 3.1 Сущности

| Affinity Entity | Назначение | Аналог dashboard-crm |
|-----------------|------------|----------------------|
| **People** | Контакты (auto + manual) | `contacts` |
| **Organizations** | Компании | `companies` |
| **Opportunities** | Сделки / deals in pipeline | `projects(type='client')` |
| **Smart Lists** | Dynamic segments | 🟡 saved views + filters |
| **Activities** | Emails, meetings (auto) | `calls` + `meetings` + 🟡 notes |
| **Notes** | Free-form + AI-generated | 🟡 не в EntityTimeline |
| **Alliances** | Shared network slices | ❌ |
| **Relationship edges** | Person↔Person, Person↔Org strength | ❌ (нет graph) |

**Dealflow stages** (типичный VC pipeline из LP): New → Reviewing → Due diligence → Closed. **У нас:** `pipeline_stages` per direction (ЧЗ/ERP/IIoT) — **➕ vertical**, не generic VC.

### 3.2 Auto-capture pipeline

```
Email/Calendar sync (per user, firm-wide aggregate)
  → Parse participants
  → Match/create People + Organizations
  → Log interaction on timeline
  → Update relationship strength
  → Enrich from Affinity Data (40+ providers)
```

**Selected Email Sync** (privacy): можно ограничить какие ящики синхронизируются.

**У нас:** **manual-first** — rep логирует call/meeting в CRM. **➕ data quality control** для vertical; **❌ auto-capture burden**.

### 3.3 Affinity Data (enrichment)

[product/affinity-data](https://www.affinity.co/product/affinity-data):

| Категория | Примеры полей |
|-----------|---------------|
| Firmographic | Industry, employees, location, year founded |
| Funding | Last round, investors, stage |
| Growth | Employee hires/departures 3mo, YoY % |
| Biographic | Job title, seniority, education, LinkedIn |

Источники: Affinity proprietary + Pitchbook + Crunchbase + Dealroom (+40).

**У нас:** `companies` fields вручную / Excel import — **❌ нет Crunchbase-layer**. Для РФ: **➕ ИНН/отрасль/ЧЗ-реестр** релевантнее Pitchbook.

### 3.4 Маппинг на dashboard-crm

| Affinity | dashboard-crm | Комментарий |
|----------|---------------|-------------|
| People | `contacts` | ✅ |
| Organizations | `companies` | ✅ |
| Opportunities | `projects(client)` | 🟡 |
| Relationship strength | ❌ | **главный gap** |
| Last contact (auto) | 🟡 `last_touch` derived | только CRM calls/meetings |
| Team network visibility | ❌ | gap |
| Warm intro path | ❌ | gap |
| Activity timeline (email) | 🟡 EntityTimeline | без email |
| Smart Lists | ➕ saved views | паритет+ |
| Pipeline kanban | ✅ PipelineBoard | паритет |
| Stage gates | ➕ `stage_requirements` | Affinity нет Blueprint |
| Delivery projects | ❌ (нет PSA) | ➕ `projects(delivery)` |
| Enrichment 40+ | ❌ | Clay/Affinity Data overkill |

---

## 4. Extensions и «CRM там, где работают»

### 4.1 Pathfinder (Chrome + Gmail)

[Extensions](https://www.affinity.co/product/extensions):

- На LinkedIn / сайте компании: **кто в фирме знает** org
- Capture notes, update pipeline **без переключения в CRM**
- 8VC: «see who we know without opening Affinity»

**Аналог у нас:** нет browser extension; **➕ CommandPalette** как in-app entry.

### 4.2 Outlook / Mobile / Zoom

- **Outlook:** recipient context + Affinity Data в sidebar
- **Mobile:** meeting prep, pipeline updates on-the-go
- **Affinity Meetings:** RI context inside Zoom

**У нас:** responsive web, без native apps / email sidebar.

### 4.3 MCP + AI write-back

[AI product](https://www.affinity.co/product/artificial-intelligence) (2026):

```
MCP (Scale+):
  Claude / ChatGPT / Copilot / Gemini
    → search deals, prep meetings, summarize notes
    → WRITE: create notes, update fields, add tags, change stages
```

**«System of action, not just record»** — обновления CRM из AI-инструмента, где rep уже работает.

**У нас:** AI Hub (domain presets) + `transcripts`/`ai_runs` — **➕ SPIN/протокол**; **🟡 нет MCP write-back**.

---

## 5. Analytics, Sourcing, Alliances

### 5.1 Analytics 🔒 Scale+

[Analytics](https://www.affinity.co/product/analytics):

- Win rates by person/team/region/industry
- Deal sourcing categories over time
- Introduction reports for LPs/portcos
- Dashboard alerts on activity drops

**У нас:** overview pages fixed — **gap** для малой команды низкий приоритет.

### 5.2 Affinity Sourcing (May 2025)

Press: **Affinity Sourcing** — deal discovery beyond existing network (integrated with CRM). Расширяет TAM за пределы «кого знаем».

**У нас:** leads + Excel import — **не comparable**; Clay signals ближе по intent (external triggers).

### 5.3 Alliances

Share relationship slices with **portfolio companies, co-investors, LPs** — permission-based lists + enrichment.

**Для нас:** нет LP/portco модели; **не копируем**.

---

## 6. Сравнение трёх слоёв «relationship intelligence»

| Слой | Affinity | Attio | Clay | dashboard-crm |
|------|----------|-------|------|---------------|
| **Источник** | Email/calendar (firm) | Inbox/calendar | 200+ data providers | Calls/meetings (manual CRM) |
| **Сигнал** | Strength 0–100, warm path | Connection strength | Job change, funding, intent | Days since last touch |
| **Scope** | Whole firm graph | Team inbox | External market | Active deals only |
| **Действие** | Intro request, alert | Task, workflow | Sequencer, webhook | TodayView → schedule call |
| **Цена** | $2K–2.7K/user/yr | $348–828/user/yr | $800–6K+/workspace | Internal |

### 6.1 Наш reconnect (W2b) vs Affinity RI

| Аспект | Affinity | dashboard-crm |
|--------|----------|---------------|
| **Вопрос** | «Кто лучше всего представит нас?» + «связь остывает?» | «Мы перестали звонить по живой сделке?» |
| **Данные** | Email/calendar auto | `calls(status=done)` + past `meetings` |
| **Порог** | Configurable per relationship | `RECONNECT_THRESHOLD_DAYS = 21` |
| **Уровни** | Score 0–100 + decay | `ok` / `cooling` / `cold` (2× порог) |
| **Scope** | All contacts in network | Contacts **active deals** only |
| **UI** | Profile + triggers | TodayView «Остывают», table filter |
| **Action** | Alert → reach out | `d` → open call modal |
| **Team view** | «12 teammates know X» | ❌ |

**Вердикт:** W2b = **recency-мониторинг для activity-based selling** (Pipedrive/Close/folk). Affinity добавляет **strength + graph + auto-capture** — другой порядок сложности.

### 6.2 Реализация W2b (верифицировано в коде)

```typescript
// src/lib/constants/reconnect.ts
export const RECONNECT_THRESHOLD_DAYS = 21;

// src/lib/hooks/use-last-touch.ts — derived без миграций
// touch = max(done call.date, past meeting.date) per contact

// src/components/today/TodayView.tsx
// coolingContacts: active deal contacts, days > 21 or null
// primary: openModal('call', { contactId, companyId })
```

Дополнительно: `ContactsTable`/`CompaniesTable` filter `cooling`, peek indicators, keyboard `d`.

---

## 7. AI-стратегия Affinity vs AI Hub

| Affinity (2026) | dashboard-crm | Вердикт |
|-----------------|---------------|---------|
| MCP read/write CRM | ❌ | Gap (низкий без email) |
| Meeting prep brief | 🟡 EntityTimeline partial | Gap P4 |
| Notetaker → CRM fields | `transcripts`, `ai_runs` | 🟡 foundation |
| Relationship scoring AI | ❌ | Gap |
| File Analyzer (decks) | ❌ | VC-specific |
| Industry Insights (company lists) | ❌ | Clay-like |
| Domain AI (SPIN, протокол) | AI Hub | ➕ **уникально** |
| Deal health (next action) | `deal-health.ts` | ➕ Pipedrive-native |

---

## 8. Gap-матрица: dashboard-crm vs Affinity

### 8.1 Где dashboard-crm **сильнее** Affinity

| Возможность | Почему |
|-------------|--------|
| **Vertical pipeline** (ЧЗ, ERP, experiment) | Affinity — generic VC/PE dealflow |
| **Stage gates (Blueprint v1)** | Affinity — нет process enforcement |
| **Delivery handoff** (`spawn_delivery_project`) | Affinity — нет PSA/delivery board |
| **TodayView action queue** | Affinity — lists + analytics, не unified inbox |
| **Deal rotting / next action** | `deal-health.ts` — activity-based selling |
| **Domain AI Hub** | Affinity — generic meeting prep |
| **Стоимость** | $0 vs $2K+/seat |
| **152-ФЗ / manual data control** | Affinity требует email ingestion |
| **Delivery templates 1С:ДО** | Вне scope Affinity |

### 8.2 Relationship layer

| Возможность | Affinity | dashboard-crm | Gap |
|-------------|----------|---------------|-----|
| Relationship strength score | ✅ 0–100 | ❌ | **высокий** (v2) |
| Last contact | ✅ auto email | 🟡 `last_touch` manual | источник |
| Cooling / decay alerts | ✅ triggers | 🟡 TodayView section | UX паритет |
| Team «who knows whom» | ✅ collective graph | ❌ | средний |
| Warm intro path ranking | ✅ | ❌ | низкий (мала команда) |
| Inferred connections | ✅ Scale+ | ❌ | не нужно v1 |
| Auto email/calendar capture | ✅ | ❌ | сознательно |
| Reconnect on active deals | 🟡 network-wide | ➕ TodayView scoped | **➕ точнее для sales** |

### 8.3 CRM core

| Возможность | Affinity | dashboard-crm | Gap |
|-------------|----------|---------------|-----|
| Contacts / Companies | ✅ | ✅ | паритет |
| Deal pipeline | ✅ kanban | ✅ PipelineBoard | паритет |
| Activity logging | ✅ auto | 🟡 manual calls/meetings | источник |
| Enrichment | ✅ 40+ sources | ❌ | опционально |
| Analytics | ✅ 🔒 Scale | 🟡 fixed pages | низкий |
| Smart lists / views | ✅ | ➕ saved views | паритет |
| Quotes/CPQ | ❌ | ❌ | оба gap |
| CommandPalette | ❌ | ➕ | ➕ |

---

## 9. Архитектурное сравнение

```
Affinity (graph CRM)                 dashboard-crm (relational vertical)
────────────────────                 ─────────────────────────────────
Email/Calendar ──► auto activities   Manual calls/meetings ──► activities
       │                                      │
       ▼                                      ▼
Relationship Graph                   last_touch (derived per contact)
  strength, paths, decay               deal-health (per deal)
       │                                      │
People / Orgs / Opportunities        contacts / companies / projects(client)
       │ won                                      │ won
       ▼                                      ▼
  (no delivery)                        projects(delivery) + templates

Pathfinder / MCP                     CommandPalette + AI Hub
Affinity Data (40+)                  Excel import, manual fields
```

**Ключевой архитектурный инсайт:** Affinity доказывает, что **relationship layer — отдельный продуктовый слой** поверх CRM records. У нас этот слой **начат** (`last_touch` + TodayView), но **не отделён** как graph/score entity. Следующий шаг — **relationship signals v2 из уже имеющихся CRM-активностей**, не email ingestion.

---

## 10. Приоритеты для dashboard-crm

Отфильтровано под домен (B2B внедрения, длинный цикл, команда 5–15). Пересечения с Clay/Attio отмечены.

### P0 — Org-wide last touch на карточке контакта (~0.2 спринта)

**Референс Affinity:** «Last Contact» + кто из команды последний общался.

На `ContactPeekContent` / company card:
```
last_touch + owner последней activity (call/meeting)
«Последний контакт: Олег, 3 июн — звонок»
```

Данные уже в `calls`/`meetings` — только агрегация + UI.

### P1 — Relationship strength v1 (CRM-only) (~0.4 спринта)

**Референс Affinity:** strength = f(recency, frequency, two-way).

Без email — упрощённая формула на **90 дней**:
```
score = f(days_since_touch, count_done_calls, count_meetings, has_upcoming_meeting)
```

Показать на contact card (0–100 или `strong`/`warm`/`cold`). **Не блокер** — индикатор.

### P2 — Configurable reconnect threshold (~0.1 спринта)

**Референс Affinity:** per-relationship trigger thresholds.

`organizations.settings.reconnect_days` (default 21) вместо hardcoded constant.

### P3 — Relationship decay → notification (~0.3 спринта)

**Референс Affinity:** alert when score drops below threshold.

Расширить `notifications`: «Контакт X по сделке Y — 21+ дней без касания» (не только TodayView).

### P4 — Meeting prep brief (AI Hub) (~0.5 спринта)

**Референс Affinity MCP meeting prep + Attio.**

Перед встречей: EntityTimeline + deal context + **доменный** brief (не generic RI).

*Дублирует hubspot P0, attio P0, zoho P5.*

### P5 — «Кто в команде знает компанию» (~0.4 спринта)

**Референс Affinity:** «12 people your team knows».

На company detail:
```sql
SELECT owner_id, MAX(date) FROM calls/meetings
WHERE company_id = ? GROUP BY owner_id ORDER BY MAX(date) DESC
```

Lightweight **без graph** — top-3 teammates by recent activity.

### P6 — Stakeholder map на deal card (~0.5 спринта)

**Референс Affinity:** multi-threaded deals, connection context.

Все `contacts` связанные с `company_id` сделки + их `last_touch` + role — **для длинного цикла 1С** (IT, финдир, производство).

### P7 — External signal hook (опционально) (~0.5 спринта)

**Референс Clay + Affinity Sourcing** — не Affinity core.

Webhook/ручной флаг «компания появилась в реестре ЧЗ» → TodayView queue.

*Дублирует clay-analysis P2.*

### Отложить

- Firm-wide email/calendar sync (152-ФЗ, инфраструктура)
- Relationship graph visualization
- Warm intro path solver
- Inferred connections (LinkedIn work overlap)
- Affinity Data / Pitchbook enrichment
- Pathfinder browser extension
- MCP write-back to CRM
- Alliances / LP portal
- Analytics dashboards Affinity-scale
- VC-shaped opportunity lists

---

## 11. Affinity vs Clay vs Attio — что брать от кого

| Паттерн | Лучший референс | Почему |
|---------|----------------|--------|
| Activity silence reconnect | **Мы** (W2b) + Pipedrive | Scoped to active deals |
| Relationship strength score | **Affinity** | Эталон формулы (адаптировать без email) |
| Team «who knows whom» | **Affinity** | Collective graph |
| Market/external signals | **Clay** | Не Affinity core |
| Connection strength lite | Attio | Проще Affinity, дешевле |
| Meeting prep AI | Affinity + Attio | Мы — domain variant |
| TodayView action queue | **Мы** | Affinity нет unified queue |
| Auto-capture | Affinity | Нам не нужно v1 |
| Stage gates / delivery | **Мы** + Monday | Вне scope Affinity |
| Pricing sanity | **Мы** | $0 internal vs $2K+ |

---

## 12. Что сознательно НЕ копировать

- Private capital positioning (VC/PE pipeline, LP/portco, Alliances)
- Firm-wide email/calendar ingestion как core
- $2,000+/user/yr pricing model
- Relationship graph как primary navigation
- Pitchbook/Crunchbase enrichment stack
- Affinity Sourcing (external deal discovery)
- Pathfinder / Outlook sidebar (нет email-контура)
- Inferred LinkedIn connections
- «Relationship ChatGPT» для всей сети — overkill для 5–15 человек
- Analytics для LP reporting
- Salesforce overlay (Affinity for Salesforce) — другой продукт

---

## 13. Итоговый вывод

**Affinity CRM — эталон #1 по relationship intelligence для B2B с длинным циклом**: strength score, collective network, warm-intro pathing, auto-capture. В `crm-benchmark-candidates` указана сила: **relationship scoring из email/calendar**. Для dashboard-crm (внедрения 1С/ЧЗ) **прямое копирование Affinity нецелесообразно** — другой домен, нет email-контура, команда мала.

**Где мы уже на уровне Affinity (или сильнее в своём слое):**
- Reconnect / cooling detection на **активных сделках** (W2b)
- TodayView как action queue (Affinity так не делает)
- Deal health + next action (activity-based selling)
- Vertical pipeline + stage gates + delivery
- Domain AI Hub

**Оставшиеся разрывы (по ROI для нашего кейса):**
1. **Relationship strength indicator** (P1) — Affinity 88/100 → наш упрощённый score из CRM activities
2. **Team last-touch visibility** (P0, P5) — «кто в команде общался»
3. **Configurable thresholds + notifications** (P2, P3) — Affinity triggers
4. **Meeting prep brief** (P4) — сквозной AI gap 2026
5. **Stakeholder map на сделке** (P6) — multi-threading для enterprise внедрений

**Стратегия:** брать у Affinity **модель трёх сигналов** (strength, recency, context) и **UI-паттерны** (last contact, team visibility, decay alerts) — строить **на уже имеющихся calls/meetings**, не на email graph. External signals — Clay. Delivery/process — Zoho/Monday. Action queue — наш TodayView.

**Следующий кандидат в очереди бенчмарков:** folk (IA) или Productive.io (agency PSA).

---

## 14. Источники

### Affinity (официальные, спарсено 2026-07-12)

- [Affinity homepage](https://www.affinity.co/)
- [CRM product](https://www.affinity.co/product/crm)
- [Relationship Intelligence](https://www.affinity.co/product/relationship-intelligence)
- [What is relationship intelligence](https://www.affinity.co/why-affinity/what-is-relationship-intelligence)
- [AI & MCP](https://www.affinity.co/product/artificial-intelligence)
- [Affinity Data / enrichment](https://www.affinity.co/product/affinity-data)
- [Analytics](https://www.affinity.co/product/analytics)
- [Extensions / Pathfinder](https://www.affinity.co/product/extensions)
- [Pricing](https://www.affinity.co/product/affinity-pricing)
- [Deal flow management LP](https://www.affinity.co/lp/deal-flow-management)
- [Blog: Relationship intelligence deep dive](https://www.affinity.co/blog/relationship-intelligence) (15.06.2026)
- [Blog: Which relationships drive warm introductions](https://www.affinity.co/blog/which-relationships-drive-warm-introductions) (02.07.2026)
- [Guide: 7 modern workflows 2026](https://www.affinity.co/guide/7-modern-workflows-to-win-deals-faster-in-2026)

### Сторонние обзоры

- [Automation Jinn — Attio vs Affinity 2026](https://www.automationjinn.com/blog/attio-vs-affinity) (июль 2026)
- [SaaS CRM Review — Affinity](https://saascrmreview.com/) (частично)
- [Meridian AI — Affinity alternatives](https://www.meridian-ai.com/blog/affinity-crm-alternatives)
- [ValueAdd VC — Best VC CRM 2026](https://valueaddvc.com/blog/best-vc-crm-tools-ranked-in-2026-affinity-4degrees-folk-pipedrive-compared)

### dashboard-crm (репозиторий)

- `improvements/CRMs/crm-benchmark-candidates-2026-07-12.md` — Tier 2 Affinity
- `improvements/clay-analysis-2026-07-12.md` — external signals vs reconnect
- `improvements/attio-analysis-2026-07-12.md` — connection strength lite
- `CRM-EVOLUTION-PLAN.md` — волна 2.2 reconnect
- `src/lib/constants/reconnect.ts` — threshold 21d
- `src/lib/hooks/use-last-touch.ts` — derived last touch
- `src/components/today/TodayView.tsx` — «Остывают»
- `src/lib/utils/deal-health.ts` — deal-level health