# Roadmap #2 — dashboard-crm после западных бенчмарков

**Дата:** 2026-07-26  
**Режим:** продуктовая стратегия + deep synthesis 16 CRM-анализов  
**Аудитория:** владелец продукта, РП, разработка  
**Связанные артефакты:**
- Roadmap #1: `improvements/CRM-ROADMAP-projects-deals.md` (2026-07-13)
- PM-зоны: `improvements/PM-GROWTH-ZONES.md`
- Эволюция UX: `CRM-EVOLUTION-PLAN.md` (волны 1–2)
- Бенчмарки: `improvements/CRMs/*-analysis-2026-07-12.md` (16 систем)
- Очередь бенчмарков: `improvements/crm-benchmark-candidates-2026-07-12.md`

---

## 0. Executive Summary

**Roadmap #1 закрыл «PM-tool для одного проекта и портфеля».**  
По коду на 2026-07-26 реализованы почти все эпики P1–P2 и существенная часть P3:

| Эпик Roadmap #1 | Статус |
|-----------------|--------|
| Даты задач + Gantt (read-only → drag/resize) | ✅ `GanttTimeline`, `046`, drag/resize |
| FS-зависимости + стрелки | ✅ + **SS/FF/SF**, lag, cascade, CPM float |
| WBS (`parent_task_id`, `wbs_code`) | ✅ `052` |
| Delivery health + Portfolio | ✅ `delivery-health.ts`, `PortfolioView`, risk widget |
| Deal Delivery Hub | ✅ `DealDeliveryHub` |
| Quotes / КП | ✅ `053`, `QuotesTab` |
| Workflow Engine MVP | ✅ `050` + `051 task_overdue` + Settings UI |
| Spawn UX / Win Wizard | ✅ `SpawnWizard` |
| Won → notify | ✅ `045` |
| Baselines | ✅ `074` |
| Task analytics (throughput/cycle) | ✅ `072`, `TasksAnalytics` |
| Chat / files / videos / recurring | ✅ `055–069` |

**Roadmap #2 — не «ещё один Gantt».** Это переход от *рабочего места РП* к *операционной системе команды 5–15 человек* в нише маркировки (1С / Честный ЗНАК):

1. **Guided process** — переходы стадий и handoff, как у Zoho Blueprint / Accelo Progressions (у нас уже есть DB-гейты; не хватает UX).  
2. **Intelligence layer** — HITL AI после звонка/встречи + relationship strength lite (без email-sync).  
3. **Operational polish** — Smart Views server-side, Today triage, pipeline prioritization, 360° company.  
4. **Close quality** — sign-off чеклисты ДО, resource load lite, internal parity.  
5. **Integration readiness** — webhooks, DO read-only sync, enterprise checklist (audit, approvals lite).

**Принцип отбора (жёсткий фильтр):**

> Берём только то, что экономит часы **на каждом** запуске ЧЗ/1С или снимает боль **продажника/РП/руководства** в команде 5–15.  
> Не берём PSA-финансы, marketing hub, email sequences, agentic SDR, visual workflow canvas, full CPQ.

Оценка полной программы Roadmap #2: **~14–18 спринтов (7–10 месяцев при 1 спринт / 2 недели)**.  
Каждая фаза самостоятельно ценна — можно остановиться после R2-P1 и уже получить «взрослый» process UX.

---

## 1. Контекст продукта (AS-IS 2026-07-26)

### 1.1 Кто мы

| Параметр | Значение |
|----------|----------|
| Домен | Продажа + внедрение маркировки (IIoT / ERP / 1С / ЧЗ) |
| Команда | 5–15: менеджер, внедренец, монтажник, админ |
| Система-запись delivery | **1С:Документооборот** (планы, папки, приёмки) |
| Роль CRM | Единая панель sales + lightweight PM + AI domain, **не** замена ДО |
| Модель данных | Одна таблица `projects` (`client` / `delivery` / `internal`) — осознанная сила |
| Сильные стороны vs рынок | Stage gates (S27 DB), deal rotting/next action, TodayView, delivery templates из ДО, Gantt+CPM+cascade, domain AI Hub, multi-tenant RLS |

### 1.2 Ступень зрелости (обновление PM-GROWTH-ZONES)

```
Ступень 0  Задачи + фазы + spawn + milestone gate     ✅ закрыта (2026-07)
Ступень 1  Даты + Gantt + delivery health + Deal Hub  ✅ закрыта
Ступень 2  Зависимости + Portfolio + spawn wizard     ✅ закрыта (+ CPM/baseline)
Ступень 3  Sign-off + ERP parity + internal templates  ⬜ Roadmap #2
Ступень 4  DO sync + analytics cycle (deal) + process UX ⬜ Roadmap #2
Ступень 5  Intelligence (HITL AI + RI lite) + team ops   ⬜ Roadmap #2
```

**Вывод:** CRM уже **сильнее** Pipedrive/Close по activity-selling + **сильнее** Monday по domain delivery + **слабее** Zoho/Accelo по guided transitions и **слабее** Affinity/Clay по relationship intelligence. Roadmap #2 закрывает именно эти разрывы, не перестраивая ядро.

---

## 2. Методология синтеза бенчмарков

Прочитаны **16 анализов** (июль 2026) + кандидаты + PM-зоны + код/миграции 040–075.

| CRM | Роль в синтезе | Главный вклад в Roadmap #2 |
|-----|----------------|----------------------------|
| **Pipedrive** | Sales mechanics (уже закрыт 80%) | Per-stage rotting, pipeline sort by next action |
| **Close** | Action queue (TodayView ≈ Inbox) | Server Smart Views, snooze/triage, Next-in-queue |
| **HubSpot** | Platform + SDP | Smart Deal Progression HITL, notes/timeline polish |
| **Attio** | AI-native objects/views | Timeline filters, segments, Ask CRM lite |
| **Accelo** | PSA / sales→delivery | Progression modal, tickets lite, **не** finances |
| **Monday** | Deal→project handoff UX | Expanded deal card polish, auto-handoff automation |
| **Productive** | Agency PSA + proposals | Win wizard (уже ✅), deal aging automations |
| **Teamwork** | Lead→project pipeline | Pre-won tentative delivery, activity prioritization |
| **Insightly** | Light CRM+PM | Activity Sets (stage playbooks), convert wizard polish |
| **Zoho** | Blueprint + automation stack | **Transition modal**, After-actions, stage escalation |
| **Salesforce** | Enterprise expectations only | Quotes (✅), field audit, approval lite, API contract |
| **Clay** | Signals / reconnect | Wake-the-dead lost deals, domain signals hook |
| **Affinity** | Relationship scoring | Strength score CRM-only, stakeholder map, who-knows |
| **Linear** | Productivity UX | Peek polish, next-after-action (частично W2) |
| **Twenty** | Architecture reference | Webhooks, workflow breadth (не fork) |
| **folk** | IA simplification | **Не берём** сейчас (11 разделов работают) |

### 2.1 Сводная матрица «что брать / у кого»

| Паттерн | Лучший референс | Берём в R2? | Почему |
|---------|-----------------|-------------|--------|
| Always next action / rotting | Pipedrive + мы | Частично (per-stage) | Next-action уже ✅; добавить dwell-по-стадии |
| Action inbox | Close + мы | Polish | TodayView сильнее Close; triage/snooze |
| Smart Views server-side | Close / Attio | **Да** | localStorage ломает multi-device / onboarding |
| Stage hard gates | **Мы** ← Zoho | Уже ✅ | Не копировать UI-only gates Accelo |
| Transition modal / During | **Zoho Blueprint** | **Да (P0)** | DB-гейты без guided UX = friction |
| Workflow breadth | HubSpot / Twenty / Zoho | **Да (incremental)** | Engine есть; actions/triggers расширить |
| Win → project handoff | Productive / Monday / мы | Polish | SpawnWizard ✅; auto-suggest + notify already |
| Phase board | Monday + мы | Уже ✅ | Не перестраивать |
| Gantt / deps / CPM | Monday + Accelo (без PSA) | Уже ✅ + сверх | Cascade/CPM — наше преимущество |
| Quotes lite | Accelo / SF / Productive | Уже ✅ | CPQ full — нет |
| Delivery health / portfolio | Accelo lite | Уже ✅ | |
| Sign-off checklists | Accelo + 1С:ДО | **Да** | Формальное закрытие = domain value |
| Relationship strength | Affinity (CRM-only) | **Да (lite)** | Без email; на calls/meetings |
| Reconnect / wake dead | Clay + мы W2b | **Да** | Lost-deal play + action from signal |
| Smart Deal Progression | HubSpot / Attio | **Да** | AI Hub foundation есть; HITL write-back |
| Cadences / email sequences | Close / Zoho | **Нет** | Нет email-контура; task sequences — опционально |
| PSA time/billing | Accelo / Productive | **Нет** | 1С |
| Client portal | Accelo | **Нет** (go/no-go later) | B2B industrial; low demand |
| Custom objects runtime | Twenty / Attio | **Нет** | Vertical schema via migrations |
| Marketing Hub / Breeze | HubSpot | **Нет** | Вне домена |
| Agentforce / autonomous SDR | SF / HubSpot | **Нет** | HITL only |
| Visual workflow canvas | Attio / HubSpot | **Нет** | JSON rules + Settings UI достаточно |
| Dual CRM+PM apps | Teamwork | **Нет** | Collapsed model — сила |
| Fork open-source CRM | Twenty | **Нет** | Domain already deeper |

---

## 3. Полный реестр фич: ВЗЯТЬ / НЕ ВЗЯТЬ

Ниже — **все значимые идеи** из 16 анализов, сгруппированные.  
Формат: **решение → аргумент → источник → effort**.

### 3.1 Блок A — Process UX (продажи)

#### A1. Blueprint v2 — Transition Modal ✅ ВЗЯТЬ — **R2-P0**

| | |
|--|--|
| **Что** | При смене стадии: модалка с unmet gates + обязательные поля + comment + preview automation |
| **Источник** | Zoho Blueprint During, Accelo Progressions, Monday P6 |
| **Почему брать** | У нас гейты **в БД** (сильнее рынка), но UX — toast/error. Guided transition снимает «почему не двигается?» и обучает процесс. Главный remaining gap Zoho-анализа. |
| **Почему не «ещё один StageReadiness»** | StageReadiness — диагностика; modal — **момент решения** с During-inputs |
| **Effort** | 0.5 спринта |
| **Зависимости** | `stage_requirements`, automation preview |

#### A2. Stage playbooks / Activity Sets ✅ ВЗЯТЬ — **R2-P1**

| | |
|--|--|
| **Что** | JSONB-чеклист действий на `stage_id` (не hard gate): «на стадии КП: отправить КП, follow-up +3д»; кнопка «создать задачи из playbook» |
| **Источник** | Insightly Activity Sets, Zoho Cadences (task-only), Pipedrive project templates |
| **Почему брать** | S29 создаёт 1 задачу; playbook = **операционная память** «что делать на стадии». Дешевле full cadence engine. |
| **Почему не full Cadence/email** | Нет email; multi-step delay sequences — R2-P2 опционально |
| **Effort** | 0.4 спринта |

#### A3. Per-stage rotting + stage dwell escalation ✅ ВЗЯТЬ — **R2-P1**

| | |
|--|--|
| **Что** | Порог «дней на стадии» per `stage_id` → badge + TodayView + optional `notify` automation |
| **Источник** | Pipedrive rotting (per-stage inactivity), Zoho state_escalation, Productive deal aging |
| **Почему брать** | Next-action rotting ловит «нет шага»; dwell ловит «шаг есть, но сделка **застряла**». Два сигнала дополняют, не заменяют (Pipedrive KB: future activity ≠ не гниёт). |
| **Effort** | 0.3–0.4 спринта |

#### A4. Pipeline default sort / activity prioritization ✅ ВЗЯТЬ — **R2-P1**

| | |
|--|--|
| **Что** | Default sort колонок PipelineBoard: overdue next_action → no action → today → future; 4-color activity status на карточке |
| **Источник** | Pipedrive next activity sort, Teamwork auto-prioritization |
| **Почему брать** | 0.2 спринта, ежедневный эффект; данные уже есть |
| **Effort** | 0.2–0.3 спринта |

#### A5. Progression modal: Lost/Won reason (polish) ✅ ВЗЯТЬ (в A1)

| | |
|--|--|
| **Что** | Won/Lost reason в transition modal (поля уже есть: `won_reason`, `loss_reason`) |
| **Источник** | Insightly, Accelo |
| **Почему брать** | Данные есть, UX разрознен; собрать в один момент перехода |
| **Effort** | входит в A1 |

#### A6. Email / SMS sequences / dialer ❌ НЕ БРАТЬ

| | |
|--|--|
| **Источник** | Close, Zoho Cadences, HubSpot Sequences |
| **Почему нет** | Нет email-контура; outbound volume ≠ модель (длинный B2B цикл, 1–3 касания/неделя). Dialer — другая инфраструктура. |
| **Альтернатива** | Task-based sequences (A2) + AI draft для reconnect (Clay) |

#### A7. Lead scoring ML ❌ НЕ БРАТЬ (пока)

| | |
|--|--|
| **Источник** | HubSpot, Clay, Freshsales |
| **Почему нет** | Малая база; domain score (budget × stage × health) уже в weighted forecast + deal-health. ML — шум. |

---

### 3.2 Блок B — Automation & Integration

#### B1. Workflow breadth v2 ✅ ВЗЯТЬ — **R2-P0/P1**

| | |
|--|--|
| **Что** | Расширить triggers: `days_in_stage`, `deal_won` (явный), `time_based` (pg_cron); actions: `spawn_delivery_suggest` (HITL notify + deep link), `webhook` |
| **Источник** | Twenty workflows, Zoho Workflow, HubSpot, Attio |
| **Почему брать** | Engine `050`/`051` уже production; gap — **ширина**, не архитектура. `spawn_delivery` auto без HITL — **нет** (решение Олега: РП выбирает kind). |
| **Effort** | 0.5–0.8 спринта (по частям) |

#### B2. Webhooks outbound ✅ ВЗЯТЬ — **R2-P2**

| | |
|--|--|
| **Что** | На record change → HTTP POST (1С, Telegram bot, n8n) |
| **Источник** | Twenty, Zoho, Salesforce |
| **Почему брать** | Дешёвый мост к 1С/мессенджерам без full DO sync |
| **Effort** | 0.3 спринта |

#### B3. 1С:ДО status sync (read-only) ✅ ВЗЯТЬ — **R2-P3** (не раньше)

| | |
|--|--|
| **Что** | `do_external_id` + poll/webhook → update `stage_id`/`status` + `do_synced_at` |
| **Источник** | Accelo integrations, Roadmap #1 P4 |
| **Почему брать** | Двойной ввод — главный operational риск; **только read-only** |
| **Почему не сейчас** | Сначала process UX + plan quality; иначе синхронизируем хаос |
| **Effort** | 1.5–2 спринта |

#### B4. Visual workflow canvas ❌ НЕ БРАТЬ

| | |
|--|--|
| **Источник** | Attio, HubSpot, Zoho CommandCenter |
| **Почему нет** | Дорого; Settings table + JSON достаточно для <50 rules; CommandCenter overkill для <15 человек |

#### B5. Full AppConnect / Zapier marketplace ❌ НЕ БРАТЬ

| | |
|--|--|
| **Источник** | Insightly AppConnect, SF AppExchange |
| **Почему нет** | Webhook (B2) покрывает 90% кейсов без $3K setup |

---

### 3.3 Блок C — AI Intelligence (HITL)

#### C1. Smart Deal Progression ✅ ВЗЯТЬ — **R2-P0**

| | |
|--|--|
| **Что** | После call/meeting: AI предлагает обновить `next_step`, поля сделки, создать tasks; пользователь confirm в `AiWorkspaceModal` |
| **Источник** | HubSpot Smart Deal Progression, Attio Follow-Up Agent, Monday Notetaker, Zoho Zia, Salesforce Automated Opp Updates |
| **Почему брать** | **Самый повторяемый gap** почти во всех sales-анализах. AI Hub + transcripts + `suggested_next_step` уже есть — не хватает **write-back path**. Domain-пресеты (SPIN, протокол) — наше УТП vs generic Chloe/Breeze. |
| **Почему не autonomous agents** | HITL only; Breeze/Agentforce — no-go (§3.3 C-out) |
| **Effort** | 0.5–0.7 спринта |

#### C2. Meeting prep brief ✅ ВЗЯТЬ — **R2-P1**

| | |
|--|--|
| **Что** | Preset AI Hub: timeline + deal + delivery status + last touch → brief перед встречей |
| **Источник** | Affinity MCP meeting prep, Attio, Close Lead Summary |
| **Почему брать** | Высокая value/effort; данные уже в EntityTimeline |
| **Effort** | 0.4–0.5 спринта |

#### C3. Lead / Deal Summary preset ✅ ВЗЯТЬ — **R2-P1** (вместе с C2)

| | |
|--|--|
| **Источник** | Close Chloe Lead Summary |
| **Effort** | 0.2 (preset поверх C1/C2) |

#### C4. «Ask CRM» lite в Cmd+K 🟡 ОПЦИОНАЛЬНО — **R2-P3**

| | |
|--|--|
| **Источник** | Attio Ask, Insightly Copilot |
| **Почему опционально** | Cmd+K search уже есть; NL→summary = C2 + deep link. Полный NL→SQL — нет. |
| **Effort** | 0.5 |

#### C5. Autonomous SDR / Breeze Agents / Zia Agents ❌ НЕ БРАТЬ

| | |
|--|--|
| **Почему нет** | Outbound volume не наш; риск hallucination на B2B-контрактах; credit billing antithetical to internal tool |

#### C6. MCP write-back / Cloud agents ❌ НЕ БРАТЬ (пока)

| | |
|--|--|
| **Источник** | Affinity MCP, Twenty MCP |
| **Почему нет** | AI Hub внутри app достаточнее и безопаснее; MCP read-only — later если Cursor-workflow нужен |

---

### 3.4 Блок D — Relationship Intelligence

#### D1. Relationship strength v1 (CRM-only) ✅ ВЗЯТЬ — **R2-P1**

| | |
|--|--|
| **Что** | Score 0–100 / strong·warm·cold из recency+frequency calls/meetings (90 дней); UI на contact/company |
| **Источник** | Affinity strength (адаптация **без email**) |
| **Почему брать** | W2b reconnect = binary silence; strength = **градация** «кого звать первым». Без 152-ФЗ email ingestion. |
| **Почему не full Affinity** | Email/calendar firm-wide, warm-intro graph, Pitchbook — overkill + legal |
| **Effort** | 0.4 спринта |

#### D2. Org-wide last touch + «кто знает» ✅ ВЗЯТЬ — **R2-P1**

| | |
|--|--|
| **Что** | На company: last contact + actor; top-3 teammates by recent activity |
| **Источник** | Affinity collective network (lite) |
| **Почему брать** | Данные в calls/meetings; 0.3 спринта; team already multi-user |
| **Effort** | 0.3 спринта |

#### D3. Stakeholder map на deal ✅ ВЗЯТЬ — **R2-P2**

| | |
|--|--|
| **Что** | Contacts компании сделки + last_touch + role (IT / CFO / производство) |
| **Источник** | Affinity multi-thread deals |
| **Почему брать** | Длинный цикл 1С: 3–7 стейкхолдеров; сейчас «один contact_id» |
| **Effort** | 0.5 спринта |

#### D4. Configurable reconnect threshold ✅ ВЗЯТЬ — **R2-P0** (quick win)

| | |
|--|--|
| **Что** | `org.settings.reconnect_days` (default 21) |
| **Источник** | Affinity, Clay |
| **Effort** | 0.1 спринта |

#### D5. Wake the Dead (lost deals) ✅ ВЗЯТЬ — **R2-P2**

| | |
|--|--|
| **Что** | Segment lost + N months + AI draft reconnect; queue в TodayView |
| **Источник** | Clay Wake the Dead |
| **Почему брать** | Lost уже в CRM; повторные продажи ЧЗ — реальный цикл |
| **Effort** | 0.5 спринта |

#### D6. Domain external signals (реестр ЧЗ) 🟡 GO/NO-GO — **R2-P3**

| | |
|--|--|
| **Источник** | Clay Signals |
| **Почему go/no-go** | Нужен источник данных (API реестра). Если есть — hook в TodayView. Если нет — skip. |
| **Effort** | 0.5+ |

#### D7. Firm-wide email sync / Pathfinder / warm intro graph ❌ НЕ БРАТЬ

| | |
|--|--|
| **Источник** | Affinity core |
| **Почему нет** | 152-ФЗ, инфраструктура, другой ICP (VC/PE); команда 5–15 не платит $2K/user |

#### D8. Clay workspace / enrichment waterfall ❌ НЕ БРАТЬ

| | |
|--|--|
| **Почему нет** | Кредитная модель; enrichment для РФ-B2B industrial слабо; company enrichment lite — только если появится надёжный source |

---

### 3.5 Блок E — Delivery / PM (после Ступени 2)

#### E1. Sign-off чеклисты (ДО) ✅ ВЗЯТЬ — **R2-P1**

| | |
|--|--|
| **Что** | `project_checklists` (doc_review / handover_support) + items JSONB; gate перед completed |
| **Источник** | Accelo workflows, xlsx ДО, Roadmap #1 B8, PM-GROWTH-ZONES §5 |
| **Почему брать** | Milestone tasks закрывают «задачи»; чеклист — **ритуал приёмки** (документы, передача на поддержку). Domain moat. |
| **Effort** | 0.6 спринта |

#### E2. Resource load lite ✅ ВЗЯТЬ — **R2-P2**

| | |
|--|--|
| **Что** | Вид «кто на скольких open delivery / open tasks»; conflict hint (внедренец на 2 launch) |
| **Источник** | Accelo Forecast (без timesheet), Productive capacity lite, PM-GROWTH §6 |
| **Почему брать** | Команда растёт к 10+; timesheet — в 1С, count — в CRM |
| **Почему не full capacity** | Нет hours/day model; overkill |
| **Effort** | 0.5–0.7 спринта |

#### E3. Internal templates + portfolio parity ✅ ВЗЯТЬ — **R2-P2**

| | |
|--|--|
| **Что** | `internal_templates` (колонки + задачи); health/progress; участие в portfolio-like view |
| **Источник** | PM-GROWTH §7, Monday boards |
| **Почему брать** | Internal сейчас «второй сорт»; онбординг CRM, маркетинг, доработки — реальная работа |
| **Effort** | 0.5–0.6 спринта |

#### E4. ERP spawn/template parity polish ✅ ВЗЯТЬ — **R2-P1**

| | |
|--|--|
| **Что** | Довести ERP launch template UX до IIoT (чеклисты приёмки по 6 этапам, spawn preview «НЕ ТРЕБУЕТСЯ») |
| **Источник** | PM-GROWTH §4, SpawnWizard partial |
| **Почему брать** | ERP ~50% зрелости vs IIoT ~80% planning |
| **Effort** | 0.4–0.5 (если шаблон уже в БД — UI) |

#### E5. Tentative delivery pre-won 🟡 GO/NO-GO — **R2-P3**

| | |
|--|--|
| **Что** | `status='tentative'` delivery на стадии «Договор» для capacity |
| **Источник** | Teamwork / HubSpot path |
| **Почему go/no-go** | Ценно при 8+ параллельных ERP; до команды <8 — шум. Решать после E2. |
| **Effort** | 0.5 |

#### E6. Post-delivery Tickets lite 🟡 GO/NO-GO — **R2-P3**

| | |
|--|--|
| **Источник** | Accelo Issues, Teamwork Desk |
| **Почему go/no-go** | Только если «вопросы клиента теряются» после completed. Иначе 1С:ДО/почта. |
| **Effort** | 1 спринт |

#### E7. Client portal ❌ НЕ БРАТЬ

| | |
|--|--|
| **Почему нет** | Industrial B2B; клиенты не ждут SaaS portal; do_url + status email достаточны |

#### E8. Time tracking / billing / margin / EVM ❌ НЕ БРАТЬ

| | |
|--|--|
| **Источник** | Accelo, Productive, Insightly |
| **Почему нет** | 1С — SoR финансов; PSA $69/user — antithetical |

#### E9. Full MS Project / multi-baseline EVM ❌ НЕ БРАТЬ

| | |
|--|--|
| **Почему нет** | Baseline v1 уже есть; EVM — только если ГОЗ-тендер потребует |

#### E10. Cascade shift / CPM / multi-dep types — уже ✅

Не в Roadmap #2 как новые эпики (поддерживать, polish UI critical path highlight — minor).

---

### 3.6 Блок F — Views, IA, Productivity

#### F1. Server-side Smart Views / segments ✅ ВЗЯТЬ — **R2-P0**

| | |
|--|--|
| **Что** | Таблица `segments` (name, entity, predicate JSONB, owner/org); seed: «Тихо >14», «Без next_step», «ERP», «Health red» |
| **Источник** | Close Smart Views, Attio Lists/views, HubSpot active lists |
| **Почему брать** | localStorage `use-saved-views` не шарится, не переживает device, не onboarding-friendly. **Главный remaining Close gap.** |
| **Effort** | 0.5–0.7 спринта |

#### F2. TodayView triage (Snooze / Done) ✅ ВЗЯТЬ — **R2-P1**

| | |
|--|--|
| **Источник** | Close Inbox |
| **Почему брать** | HANDOFF-07-18 уже пометил как daily-use; low effort high friction relief |
| **Effort** | 0.3 спринта |

#### F3. Next-in-queue after action ✅ ВЗЯТЬ — **R2-P1**

| | |
|--|--|
| **Источник** | Close Next Lead, Linear flow state |
| **Effort** | 0.2 спринта |

#### F4. Context-rich QueueRow ✅ ВЗЯТЬ — **R2-P1** (с F2)

| | |
|--|--|
| **Источник** | Close |
| **Effort** | 0.2 |

#### F5. Peek polish (Companies, Leads) ✅ ВЗЯТЬ — **R2-P2**

| | |
|--|--|
| **Источник** | Linear W2d remainder |
| **Effort** | 0.2 |

#### F6. 360° Company card (sales + delivery) ✅ ВЗЯТЬ — **R2-P1**

| | |
|--|--|
| **Что** | На company detail: open deals + deliveries + health + last touch + who-knows |
| **Источник** | Zoho Account 360, Monday expanded card, Insightly Related |
| **Почему брать** | Company уже грузит projects; не хватает delivery health rollup. Единый экран для «как дела у ОМК». |
| **Effort** | 0.4 спринта |

#### F7. Уплощение IA (folk: 5 разделов) ❌ НЕ БРАТЬ сейчас

| | |
|--|--|
| **Источник** | folk, CRM-EVOLUTION-PLAN optional |
| **Почему нет** | 11 разделов работают; merge leads+deals — UX risk без user signal. Пересмотреть после 1–2 мес real team use. |

#### F8. Концепт «Мостик» (zero-chrome) 🟡 DESIGN ONLY — later

| | |
|--|--|
| **Источник** | Linear + CRM-EVOLUTION-PLAN |
| **Почему не build** | Требует keyboard foundation (есть) + process UX (A1). Design sprint после R2-P1 adoption. |

#### F9. Custom objects UI / Metadata API ❌ НЕ БРАТЬ

| | |
|--|--|
| **Источник** | Twenty, Attio, SF |
| **Почему нет** | Vertical CRM = migrations; citizen-dev sprawl — антипаттерн для 5–15 |

---

### 3.7 Блок G — Enterprise readiness (lite)

#### G1. Field-level audit trail (critical fields) ✅ ВЗЯТЬ — **R2-P2**

| | |
|--|--|
| **Что** | activity_log already partial; ensure budget, stage_id, owner_id, status always logged with from/to names |
| **Источник** | Salesforce Field History |
| **Почему брать** | Enterprise question «кто изменил сумму»; фундамент почти есть |
| **Effort** | 0.3–0.4 |

#### G2. Approval lite (поздние стадии) 🟡 GO/NO-GO — **R2-P3**

| | |
|--|--|
| **Что** | stage_requirements type=approval (owner/admin must confirm) на «Договор»/won |
| **Источник** | Salesforce Approvals |
| **Когда** | Если появляется второй менеджер + обязательный контроль КП |
| **Effort** | 0.5 |

#### G3. Integration API contract docs ✅ ВЗЯТЬ — **R2-P2** (docs, not code)

| | |
|--|--|
| **Что** | Документ: entities, webhooks (B2), auth, idempotency for 1С partners |
| **Источник** | Salesforce API expectations |
| **Effort** | 0.2 |

#### G4. SSO/SAML 🟡 ONLY IF RFP

| | |
|--|--|
| **Почему** | Не нужно internal team; блокирует enterprise sale — тогда да |

#### G5. Territory management / multi-currency / full CPQ ❌ НЕ БРАТЬ

---

### 3.8 Блок H — Analytics

#### H1. Deal cycle + stage conversion analytics ✅ ВЗЯТЬ — **R2-P2**

| | |
|--|--|
| **Что** | Median days per stage, conversion stage→stage, win→spawn lag (parent_deal) |
| **Источник** | HubSpot reports, Pipedrive insights, Roadmap #1 F1/F2 |
| **Почему брать** | Task analytics ✅; sales funnel aging report — gap for leadership |
| **Effort** | 0.5 |

#### H2. Delivery analytics (portfolio cycle) ✅ ВЗЯТЬ — **R2-P2** (частично есть)

| | |
|--|--|
| **Что** | initiated→completed median, bottleneck phase, win→spawn lag |
| **Effort** | 0.4 (если RPC нет — добавить) |

#### H3. Full report builder ❌ НЕ БРАТЬ

| | |
|--|--|
| **Почему** | Малая команда; fixed widgets + export CSV достаточны |

---

## 4. Что уже закрыто (не тащить в Roadmap #2)

Чтобы не дублировать Roadmap #1:

| Фича | Доказательство в коде |
|------|----------------------|
| Next action + rotting + Focus panel | `deal-health.ts`, `DealFocusPanel` |
| TodayView + reconnect | `TodayView`, `use-last-touch` |
| Cmd+K, keyboard, peek deals | W2a–W2d |
| Stage gates S27 | `stage_requirements`, `check_stage_requirements` |
| Workflow engine base | `050`, `051`, `AutomationsSection` |
| Spawn + Win wizard | `SpawnWizard`, `spawn_delivery_project` |
| Gantt + deps + cascade + CPM | `GanttTimeline`, `gantt-schedule.ts` |
| WBS, baselines, recurring | `052`, `074`, `069` |
| Quotes | `QuotesTab`, `053` |
| Deal Hub + Portfolio + health | `DealDeliveryHub`, `PortfolioView` |
| Chat, files, videos | `067`, `055`, `066` |
| Won reason / loss reason | fields + UI |
| Multi-tenant RLS hardening | `054–059` |

---

## 5. Roadmap #2 по фазам

### R2-P0 — «Process feel» (3–4 недели) — **начать немедленно**

**Цель:** менеджер **чувствует** взрослый CRM на каждом переходе стадии; views не теряются; AI начинает закрывать follow-up.

| # | Epic | Effort | Источник | KPI |
|---|------|--------|----------|-----|
| 1 | **A1** Transition Modal (Blueprint v2) | 0.5 | Zoho / Accelo | % stage moves via modal ≥ 90% |
| 2 | **F1** Server-side segments | 0.6 | Close / Attio | ≥3 shared segments used weekly |
| 3 | **C1** Smart Deal Progression HITL | 0.6 | HubSpot / Attio | ≥50% calls with accepted AI update |
| 4 | **D4** Configurable reconnect_days | 0.1 | Affinity | — |
| 5 | **B1a** Action `notify`+`spawn_suggest` polish / days_in_stage trigger | 0.4 | Zoho / Twenty | rules fired / week > 0 |

**Demo P0:** перетащил сделку → modal с гейтами + won reason; после звонка AI предложил next_step; Smart View «Застряли >14д» виден у коллеги.

**Итого P0:** ~2.5 спринта.

---

### R2-P1 — «Operational muscle» (6–8 недель)

**Цель:** ежедневная очередь и отношения; закрытие delivery как ритуал; company 360.

| # | Epic | Effort | Источник |
|---|------|--------|----------|
| 1 | **A2** Stage playbooks | 0.4 | Insightly |
| 2 | **A3** Per-stage dwell / rotting | 0.3 | Pipedrive / Zoho |
| 3 | **A4** Pipeline activity sort | 0.25 | Teamwork / Pipedrive |
| 4 | **F2–F4** Today triage + next + context rows | 0.5 | Close / Linear |
| 5 | **D1–D2** Relationship strength + who-knows | 0.6 | Affinity |
| 6 | **F6** Company 360 (deals+delivery) | 0.4 | Zoho / Monday |
| 7 | **E1** Sign-off checklists | 0.6 | Accelo / ДО |
| 8 | **C2–C3** Meeting prep + Deal summary presets | 0.5 | Affinity / Close |
| 9 | **E4** ERP template/spawn parity | 0.4 | PM-GROWTH |

**Demo P1:** company ОМК — deals + red delivery; contact strength «cold»; checklist перед completed; playbook создал 3 задачи на стадии КП.

**Итого P1:** ~4 спринта.

---

### R2-P2 — «Team scale» (6–8 недель)

**Цель:** команда 10+ не тонет; leadership видит funnel; integration surface.

| # | Epic | Effort | Источник |
|---|------|--------|----------|
| 1 | **E2** Resource load lite | 0.6 | Accelo lite |
| 2 | **E3** Internal templates + parity | 0.5 | PM-GROWTH |
| 3 | **D3** Stakeholder map on deal | 0.5 | Affinity |
| 4 | **D5** Wake the Dead lost play | 0.5 | Clay |
| 5 | **H1–H2** Sales + delivery analytics | 0.7 | HubSpot / Roadmap1 |
| 6 | **B2** Outbound webhooks | 0.3 | Twenty |
| 7 | **G1** Critical field audit polish | 0.3 | Salesforce |
| 8 | **F5** Peek companies/leads | 0.2 | Linear |
| 9 | **G3** Integration contract doc | 0.2 | SF expectations |
| 10 | **B1b** time_based / webhook actions | 0.4 | Zoho / Twenty |

**Итого P2:** ~4 спринта.

---

### R2-P3 — «SoR bridges & optional» (по сигналу)

| # | Epic | Условие go | Effort |
|---|------|------------|--------|
| 1 | **B3** DO read-only sync | РП жалуется на dual entry | 1.5–2 |
| 2 | **E5** Tentative pre-won delivery | 8+ параллельных ERP | 0.5 |
| 3 | **E6** Tickets lite | Потеря support-вопросов | 1 |
| 4 | **G2** Approval lite | Второй контролёр КП | 0.5 |
| 5 | **D6** Domain signals (ЧЗ registry) | Есть API/источник | 0.5+ |
| 6 | **C4** Ask CRM lite | Cmd+K friction from team | 0.5 |
| 7 | **F8** Design «Мостик» | Process UX stable | 1 design |

---

## 6. Приоритизация: матрица impact × effort

```
                    HIGH IMPACT
                         │
   C1 Smart Progression  │  A1 Transition Modal
   F1 Server segments    │  E1 Sign-off checklists
   D1 Strength + F6 360  │  A2 Playbooks
                         │
  ───────────────────────┼───────────────────────
   A4 Pipeline sort      │  E2 Resource load
   F2 Today triage       │  D5 Wake the Dead
   D4 reconnect cfg      │  B3 DO sync
                         │  E6 Tickets
                    LOW IMPACT
         LOW EFFORT ─────┴───── HIGH EFFORT
```

**Must-ship top-7 (если резать scope до 3 месяцев):**

1. A1 Transition Modal  
2. C1 Smart Deal Progression  
3. F1 Server segments  
4. E1 Sign-off checklists  
5. D1 + D2 Relationship lite  
6. F6 Company 360  
7. A3 Stage dwell + A4 pipeline sort  

---

## 7. Аргументация «почему не копируем запад целиком»

### 7.1 Позиционирование

dashboard-crm — **vertical operating system** для маркировки, не horizontal CRM.

| Западный продукт | Их ICP | Почему 1:1 копия вредна |
|------------------|--------|-------------------------|
| HubSpot | Inbound SMB/mid-market | Marketing Hub = dead weight |
| Salesforce | Enterprise multi-cloud | Platform tax; AppExchange bloat |
| Accelo / Productive | Agency PSA billable hours | 1С owns money |
| Affinity | VC/PE relationship graph | Нет email firm-wide; другой цикл |
| Clay | GTM data ops | Credit economy; US enrichment |
| Close | High-velocity outbound | Dialer/sequences ≠ long B2B |
| Twenty | Flexible open CRM | Мы уже domain-deeper |
| monday | Work OS horizontal | Phase model мы уже взяли; boards-everywhere — no |

### 7.2 Что сознательно **не** строим (единый stop-list)

1. Email 2-way sync / sequences / marketing automation  
2. Built-in dialer / SMS  
3. Time tracking, invoicing, rate cards, retainers  
4. Client portal  
5. Visual workflow canvas / Journey builders  
6. Autonomous AI agents (SDR, quote bots)  
7. Runtime custom objects admin UI  
8. Full CPQ product configurator  
9. Multi-currency, territories, sandboxes  
10. Separate Deals table (anti-pattern к collapsed model)  
11. Fork Twenty / migrate to any SaaS CRM  
12. Уплощение IA без user research  

---

## 8. Модель данных — дельта Roadmap #2

| Объект / колонка | Назначение | Фаза |
|------------------|------------|------|
| `segments` | Server Smart Views | P0 |
| `organizations.settings` JSONB (+ reconnect_days, stage_dwell defaults) | Org prefs | P0 |
| `stage_playbooks` (stage_id, items jsonb) | Sales playbooks | P1 |
| `pipeline_stages.rotting_days` или org map | Per-stage dwell | P1 |
| `project_checklists` | Sign-off ДО | P1 |
| `contacts.relationship_score` (generated/cache) или view | RI lite | P1 |
| `contact_roles` / `deal_stakeholders` | Stakeholder map | P2 |
| `internal_templates` | Internal parity | P2 |
| `webhook_endpoints` + delivery log | Outbound webhooks | P2 |
| `projects.status` + `tentative` или flag | Pre-won delivery | P3 go/no-go |
| `tickets` lite | Post-delivery | P3 go/no-go |
| `do_synced_at` usage | DO sync | P3 (fields already exist) |

**Не добавлять:** `deals` table, `communications` (до email-стратегии), `time_entries`.

---

## 9. Риски Roadmap #2

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|---------|-----------|
| Scope creep «ещё одна CRM-фича с бенчмарка» | Высокая | Высокое | Stop-list §7.2 + top-7 must-ship |
| AI write-back ломает данные сделки | Средняя | Высокое | HITL only; diff preview; audit log |
| Segments predicate engine complexity | Средняя | Среднее | v1: whitelist fields + operators; no arbitrary SQL |
| Relationship score «магический» и игнорируется | Средняя | Низкое | Показывать factors (recency, count), не black box |
| DO sync before process quality | Средняя | Высокое | P3 only; gate on dual-entry complaints |
| Team not using playbooks | Средняя | Среднее | Seed playbooks for ERP/IIoT stages out of the box |
| Over-invest in enterprise (SSO/approvals) pre-RFP | Низкая | Среднее | Go/no-go flags |

---

## 10. Метрики успеха Roadmap #2

### Adoption

| Метрика | Baseline (оценка) | Target P0 | Target P1 |
|---------|-------------------|-----------|-----------|
| % stage changes via Transition Modal | ~0 | 80% | 95% |
| % calls with AI progression accepted | ~0 | 30% | 50% |
| Shared segments used / user / week | 0 | 1 | 3 |
| % completed delivery with sign-off checklist | 0 | — | 70% |
| Contacts with strength score visible | 0 | — | 100% (computed) |

### Operational

| Метрика | Target |
|---------|--------|
| Median stage dwell (bottleneck stage) | −15% за квартал после P1 |
| Deals >30d same stage without activity | −25% |
| Dual-entry complaints (CRM vs ДО) | измерить → снижать после P3 sync |
| Time-to-find «статус ОМК» | < 30s (Company 360) |

### Quality bar (engineering)

- Каждая миграция: RLS org-first, SECURITY DEFINER search_path, schema.md update  
- AI: render text only, HITL confirm, injection tests как S28  
- Нет hardcode colors; theme tokens  

---

## 11. Backlog epics → sprint prompts

Готовые имена для `_analysis/sprint-*.md` / Claude Code:

| Order | Epic ID | Title |
|------:|---------|-------|
| 1 | S-R2-TRANSITION-1 | Blueprint v2 Transition Modal |
| 2 | S-R2-SEGMENTS-1 | Server-side Smart Views |
| 3 | S-R2-SDP-1 | Smart Deal Progression HITL |
| 4 | S-R2-RECONNECT-CFG | org reconnect_days |
| 5 | S-R2-DWELL-1 | Per-stage rotting + Today section |
| 6 | S-R2-PLAYBOOK-1 | Stage playbooks |
| 7 | S-R2-PIPE-SORT-1 | Pipeline activity prioritization |
| 8 | S-R2-TODAY-TRIAGE | Snooze / Done / Next |
| 9 | S-R2-RI-1 | Relationship strength + who-knows |
| 10 | S-R2-CO360-1 | Company 360 sales+delivery |
| 11 | S-R2-SIGNOFF-1 | project_checklists gate |
| 12 | S-R2-MEET-BRIEF | AI meeting prep + deal summary |
| 13 | S-R2-ERP-PARITY | ERP template/spawn polish |
| 14 | S-R2-LOAD-1 | Resource load lite |
| 15 | S-R2-INTERNAL-1 | Internal templates |
| 16 | S-R2-STAKE-1 | Deal stakeholder map |
| 17 | S-R2-WAKE-1 | Wake the Dead lost segment |
| 18 | S-R2-ANALYTICS-2 | Sales cycle + win-spawn lag |
| 19 | S-R2-WEBHOOK-1 | Outbound webhooks |
| 20 | S-R2-DO-SYNC-1 | 1С:ДО read-only (P3) |

---

## 12. Карта «источник → решение» (быстрый индекс)

| Источник-анализ | Взято в R2 | Сознательно отвергнуто |
|-----------------|------------|-------------------------|
| **Pipedrive** | A3 per-stage rotting, A4 sort | Email activities unify, full Projects module |
| **Close** | F1 segments, F2–F4 triage | Dialer, sequences, Chloe batch |
| **HubSpot** | C1 SDP | Marketing, Breeze agents, sequences |
| **Attio** | F1, C1, C4 optional, timeline polish | Email sync, 15 agents, Lists attributes |
| **Accelo** | A1 modal, E1 sign-off, E6 tickets go/no-go | Time, billing, portal, AI margin |
| **Monday** | F6 expanded context, handoff notify | Mirror columns, full work OS |
| **Productive** | deal aging→automation (B1), win wizard already | Budgets, financial spine, portal |
| **Teamwork** | A4 prioritization, E5 tentative go/no-go | Dual-app, Desk, mail |
| **Insightly** | A2 Activity Sets, convert polish | Time tracking, XOR pipeline/milestones |
| **Zoho** | **A1 Blueprint v2**, B1 After-actions, A3 escalation | CommandCenter, Zia agents, ecosystem lock-in |
| **Salesforce** | G1 audit, G2 approvals go/no-go, G3 API doc | CPQ full, Agentforce, Flow canvas |
| **Clay** | D5 Wake dead, D6 signals go/no-go | Credit enrichment, waterfall agents |
| **Affinity** | D1–D3 RI lite | Email graph, warm intro, Pathfinder, $2k pricing |
| **Linear** | F3 next, F5 peek | Issue tracker model, agents-first |
| **Twenty** | B1 breadth, B2 webhooks | Fork, custom objects UI, credits |
| **folk** | — | IA flatten (deferred) |

---

## 13. Рекомендации владельцу (итог)

1. **Roadmap #1 выполнен по сути** — не начинать «ещё один Gantt». Ценность теперь в **process feel, intelligence, team ops**.  
2. **Стартовать с R2-P0 без колебаний:** Transition Modal + Server segments + Smart Deal Progression — максимальный perceived maturity.  
3. **Не строить email CRM.** Relationship intelligence — на calls/meetings; reconnect уже есть.  
4. **DO sync — только P3** и только read-only, после стабильного plan quality.  
5. **Каждый «enterprise» пункт** — go/no-go по реальному RFP/боли, не по страху «а вдруг Salesforce».  
6. **Метрика остановки:** если после P1 команда 2 недели не жалуется на «непонятно что делать сегодня / на стадии / с ОМК» — P2 можно растянуть; если жалуется на dual-entry — поднимать B3.  
7. **Связь с live use:** HANDOFF-07-18 правильно требовал неделю реального юза. R2-P0 можно катить **параллельно** онбордингу; R2-P2 — после сигнала команды.

---

## 14. Связанные артефакты

| Документ | Роль |
|----------|------|
| `improvements/CRM-ROADMAP-projects-deals.md` | Roadmap #1 (delivery foundation) — **архив статуса: largely done** |
| `improvements/PM-GROWTH-ZONES.md` | PM-ступени 0–4; R2 закрывает 3–5 |
| `CRM-EVOLUTION-PLAN.md` | UX waves 1–2 — done; «Мостик» deferred |
| `improvements/CRMs/*-analysis-2026-07-12.md` | 16 бенчмарков — source of truth for TAKE/SKIP |
| `improvements/crm-benchmark-candidates-2026-07-12.md` | Очередь анализов — **закрыта** |
| `_analysis/delivery-process-DO.md` | Канон 1С:ДО для sign-off |
| `_analysis/HANDOFF-2026-07-18.md` | Team readiness; triage backlog overlap |

---

## 15. Appendix — краткий «паспорт» каждой из 16 CRM (1 абзац)

**HubSpot** — эталон platform + SDP; брать HITL progression, не marketing.  
**Attio** — AI-native objects/views; брать segments mindset + follow-up agent pattern, не email CRM.  
**Pipedrive** — activity-based selling; 80% уже внедрено; брать per-stage rotting + sort.  
**Close** — action inbox; TodayView ≥ Inbox; брать Smart Views server + triage.  
**Accelo** — PSA sales→delivery; брать progression UX + sign-off, не money.  
**Monday** — deal→project boards; phase model уже наш; брать expanded handoff context.  
**Productive** — agency proposals/win wizard; wizard уже ✅; aging automations.  
**Teamwork** — lead→project; брать activity prioritization; dual-app — нет.  
**Insightly** — light CRM+PM; брать Activity Sets; time tracking — нет.  
**Zoho** — **главный process reference** (Blueprint); A1 = #1 epic R2.  
**Salesforce** — enterprise checklist only; audit/API/approvals lite.  
**Clay** — signals; wake-the-dead + optional domain hooks.  
**Affinity** — RI formula without email; strength + who-knows + stakeholders.  
**Linear** — productivity; peek/next polish.  
**Twenty** — architecture; webhooks/breadth, not fork.  
**folk** — IA simplicity; defer until user signal.

---

*Документ: Roadmap #2. Составлен после полного чтения `improvements/` (вкл. 16 CRM-анализов), сверки с живым кодом (миграции 040–075, components/hooks) и статусом Roadmap #1. Следующий шаг по запросу: превратить R2-P0 epics в sprint prompts для Claude Code (`S-R2-TRANSITION-1`, `S-R2-SEGMENTS-1`, `S-R2-SDP-1`).*
