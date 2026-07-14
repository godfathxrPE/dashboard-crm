# Clay — комплексный анализ и инсайты для dashboard-crm

**Дата:** 2026-07-12  
**Метод:** парсинг clay.com (product, signals, CRM enrichment, audiences, pricing), university.clay.com (plans, signals setup), blog (GTM infrastructure, wake-the-dead, closed-lost mining), сопоставление с кодовой базой dashboard-crm.  
**Связанные документы:** `improvements/crm-benchmark-candidates-2026-07-12.md` (приоритет #4 relationship intelligence), `CRM-EVOLUTION-PLAN.md` (волна 2.2 reconnect), `CHANGES-waves-1-2.md`, `improvements/close-analysis-2026-07-12.md`.

---

## 0. Как читать этот документ

| Символ | Значение |
|--------|----------|
| ✅ | Паритет или сильная альтернатива |
| 🟡 | Частично / другая модель |
| ❌ | Нет |
| ➕ | Есть у нас, у Clay нет «из коробки» или слабее |
| 🔒 | Требует платного tier Clay |

**Контекст:** Clay — **не CRM**. Это **GTM orchestration / data intelligence layer**, который работает **поверх** HubSpot/Salesforce: enrichment → scoring → signals → execution (sequencer, ads, webhooks). dashboard-crm — **вертикальная CRM** под продажи и внедрения маркировки (1С:ERP, Честный Знак). В бенчмарке Clay стоит за **relationship intelligence и reconnect** — но в `CRM-EVOLUTION-PLAN.md` reconnect уже реализован (Sprint W2b). Этот анализ уточняет: **что мы закрыли**, **что Clay делает иначе**, **что стоит добрать без превращения CRM в Clay**.

---

## 1. Clay в 2026 — позиционирование и архитектура

### 1.1 Слоган и стратегия

Clay позиционируется как **«GTM infrastructure»** / **«Build systems to grow revenue»** — платформа, на которой GTM-инженеры строят data-driven plays, а не место хранения сделок.

Ключевые концепции (с [clay.com](https://www.clay.com), [GTM infrastructure blog](https://www.clay.com/blog/gtm-infrastructure)):

```
Четыре слоя GTM infrastructure (Clay 2026)
├── Data — 200+ providers, Waterfall, Claygent (AI web research)
├── Orchestration — Tables, Formulas, Signals, Audiences
├── Execution — Sequencer, Ads, CRM push, Webhooks, Slack
└── Agents — Sculptor, Claygent Builder, MCP, Agent plugin

Поверх:
├── CRM Enrichment — always-on sync HubSpot/Salesforce ↔ Clay
├── Signals — job changes, funding, web intent, custom triggers
├── Audiences — CRM + DWH + signals без лимита строк (2026)
├── Wake the Dead — closed-lost re-engagement play
└── Lead scoring — fit + engagement + contract value (3-score)
```

**Главное отличие от CRM:** Clay не ведёт pipeline, не хранит timeline звонков, не заменяет сделки. Clay **обогащает, детектирует сигналы и запускает действия** — CRM остаётся system of record.

**Метафора из кейсов (Figma, Rippling):** «Salesforce для записей, Snowflake для product data, **Clay для превращения всего в automated action**».

### 1.2 Масштаб (заявленный, 2026)

| Метрика | Значение |
|---------|----------|
| GTM teams | 500,000+ (marketing) |
| ARR | $100M+ (заявлено в blog) |
| Valuation | ~$5B tender offer (NYT, янв. 2026) |
| Data providers | 150–200+ в marketplace |
| Клиенты-референсы | OpenAI, Anthropic, Intercom, Vanta, Rippling, Figma |

### 1.3 Ценовая модель (2026)

Clay использует **двойной метр**: **actions** (оркестрация) + **data credits** (покупка данных у провайдеров). Источник: [university.clay.com/docs/plans-and-billing](https://university.clay.com/docs/plans-and-billing).

| Plan | От | Actions/mo | Data credits/mo | Для кого |
|------|-----|------------|-----------------|----------|
| **Trial** | Free 14 дней | — | 1,000 | Exploration |
| **Launch** | **$185/mo** | 15,000 | 2,500–10,000 | <1,000 records/mo |
| **Growth** | **$495/mo** | 40,000 | 6,000–100,000 | 1K–10K records/mo |
| **Enterprise** | Custom | 100,000+ | 100,000+ | 10K+ records, bulk enrichment, SSO |

- Полная enrichment одной записи: **6–20 data credits** (company + person + email + phone + AI)
- Credits rollover: до 2× monthly limit (monthly plans)
- 🔒 CRM integrations, web intent signals, Audiences — **Growth+**

**Инсайт для позиционирования:** Clay — инструмент **RevOps/GTM engineering** ($185–495/mo workspace, не per-seat CRM). Для команды 5–15 человек под маркировку/1С **полный Clay-стек = overkill и отдельный бюджет**. dashboard-crm даёт **native reconnect без credit-metered enrichment**.

---

## 2. «Объектная модель» Clay (не CRM objects)

Clay не имеет deals/contacts как first-class CRM. Вместо этого:

| Clay сущность | Назначение | Аналог в dashboard-crm |
|---------------|------------|------------------------|
| **Workbook** | Контейнер workflows | — |
| **Table** | Spreadsheet-строки (leads, accounts) | нет (таблицы = UI views) |
| **Column** | Enrichment / formula / signal / action | computed fields |
| **Signal** | Event trigger (job change, funding…) | ❌ |
| **Audience** | Unified CRM+DWH+signals layer | ❌ |
| **Function** | Reusable GTM logic block | automation_rules (узко) |
| **Template** | Copy-paste workflow | — |

**CRM sync pattern (CRM Enrichment use case):**
```
HubSpot/Salesforce record
  → Clay Table (pull on schedule or webhook)
  → Waterfall enrich (150+ providers)
  → Formula score (ICP fit)
  → Signal monitor (job change at account)
  → Push back to CRM + trigger Sequencer/Slack
```

**У нас:** contacts/companies/projects — **native objects** с RLS, timeline, stage gates. Clay бы **сидел сбоку** и обогащал — мы этого не делаем и не должны без явной потребности.

---

## 3. Signals — главный продукт Clay для «reconnect»

### 3.1 Что такое Signals

Из [clay.com/signals](https://www.clay.com/signals) и [University: Setting up Signals](https://university.clay.com/lessons/setting-up-signals-in-clay):

| Тип сигнала | Пример | Источник |
|-------------|--------|----------|
| **Job change** | Champion ушёл / новый ЛПР | LinkedIn, providers |
| **New hire** | Наняли IT Director | Job postings |
| **Funding** | Раунд / M&A | Crunchbase, Beauhurst |
| **Web intent** | Посетили pricing page | 6sense, RB2B |
| **Tech stack** | Появился конкурент | HG Insights |
| **Custom** | «Компания в реестре ЧЗ» | Claygent / HTTP API |

**Flow:** Signal fires → enrich context → route to rep / sequencer / Slack → update CRM field.

### 3.2 Сравнение с нашим reconnect (W2b)

| Аспект | Clay Signals | dashboard-crm `last_touch` |
|--------|--------------|------------------------------|
| **Триггер** | Внешний рынок (job, funding, intent) | Внутренняя тишина (нет call/meeting) |
| **Источник** | 200+ data providers | `useCalls()` + `useMeetings()` |
| **Scope** | Любой account в CRM/TAM | Только контакты **активных сделок** |
| **Порог** | Настраиваемый per signal | `RECONNECT_THRESHOLD_DAYS = 21` |
| **Уровни** | Signal strength / score | `ok` / `cooling` / `cold` (2× порог) |
| **UI** | Table + automation | TodayView «Остывают», фильтр в Contacts/Companies |
| **Действие** | Auto email / task / Slack | Primary: «Запланировать звонок» (W2d) |

**Ключевой инсайт:** Clay и мы решаем **разные задачи reconnect**:

- **Мы:** «Мы перестали общаться с ЛПР по живой сделке» — **activity silence** (Pipedrive/Close/folk паттерн).
- **Clay:** «В мире что-то изменилось — пора выйти на контакт» — **market trigger** (outbound GTM).

Для B2B внедрений с длинным циклом **оба нужны**, но Clay-подход требует data budget и GTM engineer. Наш W2b закрывает **базовый Clay/folk use case** из `CRM-EVOLUTION-PLAN.md`.

### 3.3 Реализация W2b в коде (верифицировано)

```typescript
// src/lib/constants/reconnect.ts
export const RECONNECT_THRESHOLD_DAYS = 21;

// src/lib/hooks/use-last-touch.ts — derived, без миграций
// Касание = call status 'done' | meeting date <= today

// src/components/today/TodayView.tsx — секция «Остывают»
// Фильтр: контакты active deals / companies с active deals
// days === null || days > RECONNECT_THRESHOLD_DAYS
// Primary action: openModal('call', { contactId, companyId })
```

Дополнительно:
- `ContactsTable` / `CompaniesTable` — saved filter `cooling`
- `ContactPeekContent` / `ContactDetailHub` — touch indicator (yellow/red dot)
- Keyboard nav `d` на cooling row → запланировать звонок

---

## 4. CRM Enrichment и Audiences

### 4.1 CRM Enrichment ([use case](https://www.clay.com/use-cases/crm-enrichment))

| Возможность | Clay | dashboard-crm |
|-------------|------|---------------|
| Waterfall 150+ providers | ✅ | ❌ |
| Always-on CRM sync | ✅ HubSpot/SF | ❌ |
| Bulk enrich millions | 🔒 Enterprise | ❌ |
| AI research (Claygent) | ✅ | 🟡 AI Hub (нишевые пресеты) |
| Deduplication | ✅ | 🟡 вручную |
| ИНН / ЕГРЮЛ / отрасль РФ | 🟡 через API/Claygent | 🟡 поля company, ручной ввод |

**Кейсы:** Anthropic 40%→80% fill rate; Vanta — cross-reference providers; Intercom — firmographics + niche signals (support team size).

### 4.2 Audiences ([product](https://www.clay.com/audiences), 2026)

- Объединяет CRM + data warehouse + signals **без лимита 50K rows**
- Unlimited people/company searches
- Enterprise beta → GA 2026

**У нас:** нет отдельного «audience layer» — фильтры в URL + saved views (W2c). Для команды 5–15 человек **достаточно**.

---

## 5. Plays: Wake the Dead и closed-lost mining

### 5.1 Wake the Dead Play

Из [blog: wake-the-dead-play](https://www.clay.com/blog/wake-the-dead-play):

```
Closed-lost deals in CRM
  → Pull lost_reason, close_date, transcript (Gong)
  → Claygent: что изменилось у компании с момента loss
  → ChatGPT: personalized re-engagement email
  → Sequencer / manual send
```

**Цель:** реактивировать **проигранные** сделки, не «остывающие» активные.

### 5.2 Closed-lost mining (internal Clay playbook)

Из [how-clay-uses-clay-for-closed-lost-deals](https://www.clay.com/blog/how-clay-uses-clay-for-closed-lost-deals):

- Gong transcripts → product insights + voice of customer
- Сегментация loss reasons → targeted plays
- Re-engagement когда появился новый trigger

### 5.3 У нас

| Возможность | Статус |
|-------------|--------|
| `status = 'lost'` + `lost_reason` | ✅ в schema |
| Saved view «проигранные» | 🟡 фильтр по stage |
| Re-engagement queue | ❌ |
| AI draft письма по loss context | ❌ (AI Hub не заточен) |
| Transcript mining для lost | 🟡 transcripts в AI Hub, нет lost play |

**Gap:** Clay **Wake the Dead** — отдельный контур от W2b reconnect. У нас есть данные (`lost_reason`, `actual_close_date`), нет **playbook UX**.

---

## 6. Lead scoring и tier-1 accounts

Из [how-clay-identifies-tier-1-accounts](https://www.clay.com/blog/how-clay-identifies-tier-1-accounts), [lead-scoring-in-clay](https://www.clay.com/blog/lead-scoring-in-clay):

**Трёхкомпонентный score:**
1. **Fit** — ICP (employee count, industry, tech stack)
2. **Engagement** — email opens, meetings, product usage
3. **Contract value** — ACV potential

Formula в Clay Table → route to AE / ABM / nurture.

**У нас:**
- `probability` по стадии — не ICP score
- `deal-health` / rotting — activity-based, не fit
- Нет unified account tier

**Инсайт:** для вертикали маркировки fit = **«подлежит ЧЗ» + ERP 1С»** — это **domain signal**, не ZoomInfo employee count. Имеет смысл lightweight scoring по нашим полям (`direction`, `kind`, company attributes), не Clay waterfall.

---

## 7. Agents layer (2025–2026)

| Продукт | Назначение | Релевантность нам |
|---------|------------|-------------------|
| **Sculptor** | NL → workflow | ❌ overkill |
| **Claygent Builder** | NL → AI research agent | 🟡 аналог — AI Hub presets |
| **Clay MCP** | Reps вызывают Clay из Claude/Codex | ❌ |
| **Agent plugin** | Code agent builds in Clay | ❌ |
| **Functions** | Reusable GTM logic | 🟡 automation_rules |

Clay's AI = **GTM research + copy at scale**. Наш AI Hub = **SPIN-анализ звонков, протокол встречи, аналит. записка** — **другая ниша**, сильнее для внедрений.

---

## 8. Gap-матрица: dashboard-crm vs Clay

### 8.1 Где dashboard-crm **сильнее** Clay

| Возможность | Почему |
|-------------|--------|
| **Native CRM** (deals, stages, gates) | Clay не CRM — нужен HubSpot/SF рядом |
| **Reconnect на active deals** | Native TodayView + last_touch без credits |
| **Vertical pipeline** (ЧЗ, ERP, experiment) | Clay — generic GTM |
| **Stage gates** (DB enforcement) | Clay — нет sales process |
| **Delivery contour** (templates, phases) | Clay — нет PSA |
| **Domain AI** (SPIN, протокол) | Clay — generic research/copy |
| **Стоимость владения** | Нет $185–495/mo data layer |
| **Ручные B2B продажи** (звонки, встречи) | Clay заточен под outbound email/TAM |

### 8.2 Relationship intelligence

| Возможность | Clay | dashboard-crm | Gap |
|-------------|------|---------------|-----|
| Activity silence reconnect | 🟡 через CRM last activity field | ➕ **W2b native** | **паритет** для нашего кейса |
| External signals (job change…) | ✅ core | ❌ | gap (опционально) |
| Closed-lost re-engagement | ✅ Wake the Dead | ❌ | **gap** |
| Relationship scoring (email/calendar) | 🟡 | ❌ | Affinity ближе; вне домена |
| CRM enrichment waterfall | ✅ | ❌ | сознательно |
| Lead/account scoring | ✅ formulas | 🟡 probability + deal-health | gap (domain-specific) |
| Suggested next action | 🟡 via automation | ➕ next_action + TodayView | паритет |

### 8.3 Execution

| Возможность | Clay | dashboard-crm | Gap |
|-------------|------|---------------|-----|
| Email sequencer | ✅ native + integrations | ❌ | вне домена |
| Ads audience sync | ✅ | ❌ | вне домена |
| Webhooks / HTTP API | ✅ | 🟡 automation S29 partial | частичный |
| Slack alerts on signal | ✅ | ❌ | опционально |
| Auto CRM writeback | ✅ | N/A (we are CRM) | — |

---

## 9. Архитектурное сравнение

```
Clay GTM Stack                      dashboard-crm
──────────────                      ─────────────
HubSpot/SF (system of record)       contacts, companies, projects (native)
  ↕ sync                              ↕
Clay Tables ────────────────        ❌ нет enrichment layer
  ├── Waterfall enrich              companies.inn, direction (manual)
  ├── Signals (external)            last_touch (internal derived)
  ├── Formulas (ICP score)          deal-health, probability
  └── Execution                     TodayView actions (call, task)
        ├── Sequencer               ❌
        ├── Ads                     ❌
        └── Slack                   ❌

Reconnect semantics:
  Clay:  "мир изменился" → outbound play
  Мы:    "мы замолчали" → TodayView «Остывают» → звонок
```

**Ключевой архитектурный инсайт:** Clay в `crm-benchmark-candidates` указан как «relationship intelligence» — но **W2b уже закрыл folk/Clay паттерн internal silence**. Оставшийся Clay-value для нас — **Wake the Dead**, **domain signals** (ЧЗ/1С), **не** полный GTM stack.

---

## 10. Приоритеты для dashboard-crm

Отфильтровано под домен (продажи маркировки + внедрения 1С/ЧЗ). Пересечения с Close/Pipedrive/HubSpot отмечены.

### P0 — Reconnect UX: signal → action (~0.2 спринта)

**Референс Clay:** Signal fires → routed action (Slack, task, sequencer).

У нас список «Остывают» есть, но **нет suggested action** на карточке контакта:
- Показать связанную active deal + `next_action` сделки
- CTA: «Позвонить» (есть) + «Обновить next_step сделки»
- Badge cold (42+ дней) — визуально отделить от cooling

*Частично в close-analysis (context hover).*

### P1 — Wake the Dead: lost-deal segment + AI draft (~0.5 спринта)

**Референс Clay:** [wake-the-dead-play](https://www.clay.com/blog/wake-the-dead-play), closed-lost mining.

```
Saved view «Мёртвые сделки»:
  status=lost AND actual_close_date < NOW() - 90 days
  → TodayView секция или отдельная queue (низкий приоритет)
  → AI Hub preset: draft re-engagement по lost_reason + company context
  → HITL: создать call/task, НЕ auto-email
```

Не копировать sequencer — у нас нет email outbound machine.

### P2 — Domain signals lite (~0.5 спринта, go/no-go)

**Референс Clay Signals:** custom signal via HTTP/Claygent.

Вертикальные триггеры без ZoomInfo:
- Компания в реестре маркировки / статус ЧЗ (ручной флаг или import)
- Поле «версия 1С» / «срок внедрения ERP» обновлено
- Alert в TodayView: «У клиента X изменился статус ЧЗ»

Это **Clay Signals analog для домена**, не data marketplace.

### P3 — Company enrichment lite (~0.3 спринта)

**Референс Clay:** CRM enrichment без waterfall.

- ИНН → подтянуть название/ОКВЭД (API ФНС / ручной import)
- Не строить credit-metered enrichment
- Поля уже в `companies` — добавить import CSV + validation

### P4 — Настраиваемый порог reconnect (~0.1 спринта)

**Референс:** `CRM-EVOLUTION-PLAN.md` упоминал 14/30 дней; сейчас hardcoded 21.

- Tenant setting или user preference
- Saved view «Тихо >N дней» (W2c) с параметром

### Отложить / не копировать

- Waterfall enrichment (150+ providers)
- Audiences / unlimited row searches
- Native sequencer / cold email at scale
- Ads audience sync (LinkedIn/Meta/Google)
- TAM sourcing / list building
- Clay MCP / GTM engineering layer
- Credit-based pricing model
- Full relationship scoring из email (→ Affinity, если понадобится)

---

## 11. Clay vs Affinity vs folk vs Close — что брать от кого

| Паттерн | Лучший референс | Почему |
|---------|----------------|--------|
| Internal silence reconnect | **Мы (W2b)** + folk | Уже реализовано; Clay — другой триггер |
| External market signals | **Clay** | Job change, funding — не наш W2b |
| Closed-lost re-engagement | **Clay** | Wake the Dead; у нас gap |
| Email/calendar relationship score | **Affinity** | Clay слабее в «кто с кем общается» |
| Reconnect → action в inbox | **Close** + **Clay** | TodayView primary action есть; context — gap |
| CRM enrichment | **Clay** | Не нужно целиком; P3 lite |
| Domain scoring (ЧЗ/1С) | **Мы** (сами) | Clay ICP formulas не про маркировку |

---

## 12. Что сознательно НЕ копировать

- GTM engineering как отдельная функция (Clay Cup, GTME job board)
- Credit-metered data marketplace (Lusha, ZoomInfo, Apollo waterfalls)
- Outbound sequencer / cold email automation at scale
- Ads + ABM orchestration
- Audiences как DWH replacement
- «CRM поверх CRM» — мы и есть CRM
- $185–495/mo enrichment layer для команды <15 человек

**Стратегия:** Clay — **эталон signal→action и lost-deal plays**, не замена CRM. Брать **Wake the Dead pattern, domain signals, reconnect UX polish** — не GTM infrastructure целиком. **W2b reconnect уже на уровне folk/Close** для internal silence.

---

## 13. Итоговый вывод

**Clay в бенчмарке (#4) — частично закрыт:** `CRM-EVOLUTION-PLAN.md` волна 2.2 (Clay/folk reconnect) **реализована в Sprint W2b**. Clay остаётся релевантен как **внешний слой intelligence**, не как CRM для копирования.

**Где мы уже на уровне (для нашего домена):**
- `last_touch` derived без миграций
- TodayView «Остывают» с фильтром по active deals
- Cooling filter в Contacts/Companies tables
- Primary action «запланировать звонок» + keyboard nav
- Touch levels (ok/cooling/cold) в ContactDetailHub

**Оставшиеся разрывы (по убыванию ценности):**
1. **Wake the Dead** (P1) — lost deals без re-engagement play
2. **Reconnect context** (P0) — deal link + suggested action на cooling contact
3. **Domain signals** (P2) — ЧЗ/1С triggers, не ZoomInfo
4. **Configurable threshold** (P4) — 21 день hardcoded

**Конкурентные преимущества сохранять:**
- Native CRM без HubSpot+Clay stack
- Vertical sales + delivery в одном графе
- Activity-based TodayView (не spreadsheet orchestration)
- Domain AI (SPIN, протокол) vs generic Claygent copy
- Нулевой data credit budget

**Стратегия:** Бенчмарк Clay **подтверждает правильность W2b**. Следующий шаг — **P0–P1: operationalize reconnect и lost-deal play** внутри CRM, без отдельного Clay workspace. Affinity — отдельный бенчмарк, если понадобится email-native relationship scoring.

---

## 14. Источники

### Clay (официальные, спарсено 2026-07-12)

- [Homepage](https://www.clay.com/)
- [Signals](https://www.clay.com/signals)
- [CRM Enrichment use case](https://www.clay.com/use-cases/crm-enrichment)
- [Audiences](https://www.clay.com/audiences)
- [Pricing](https://www.clay.com/pricing)
- [Plans & billing (University)](https://university.clay.com/docs/plans-and-billing)
- [Setting up Signals (University)](https://university.clay.com/lessons/setting-up-signals-in-clay)
- [GTM infrastructure (4 layers)](https://www.clay.com/blog/gtm-infrastructure)
- [Wake the Dead play](https://www.clay.com/blog/wake-the-dead-play)
- [Closed-lost deals mining](https://www.clay.com/blog/how-clay-uses-clay-for-closed-lost-deals)
- [Introducing new pricing](https://www.clay.com/blog/introducing-clays-new-pricing)
- [Sculpt 2025 product launches](https://www.clay.com/blog/sculpt-2025-product-launches)
- [Tier-1 account scoring](https://www.clay.com/blog/how-clay-identifies-tier-1-accounts)

### Контекст рынка

- [NYT: Clay $5B valuation tender](https://www.nytimes.com/2026/01/28/business/dealbook/clay-start-up-tender-offers.html) — янв. 2026

### dashboard-crm (репозиторий)

- `improvements/crm-benchmark-candidates-2026-07-12.md` — Clay как приоритет #4
- `CRM-EVOLUTION-PLAN.md` — волна 2.2 reconnect (Clay/folk)
- `CHANGES-waves-1-2.md` — Sprint W2b deliverables
- `_archive/sprints/SPRINT-W2b-reconnect.md` — архитектурное решение last_touch
- `src/lib/constants/reconnect.ts` — `RECONNECT_THRESHOLD_DAYS`
- `src/lib/hooks/use-last-touch.ts` — derived map
- `src/components/today/TodayView.tsx` — секция «Остывают»
- `src/components/contacts/ContactsTable.tsx` — filter `cooling`
- `improvements/close-analysis-2026-07-12.md` — reconnect в TodayView vs Close Inbox