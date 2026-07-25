# Ревью пакета Grok (gap-анализ 15 CRM) + консолидированный roadmap

**Дата:** 2026-07-14
**Вход:** `improvements/` — 15 разборов CRM (`CRMs/*.md`) + 3 сводных документа (`crm-benchmark-candidates`, `PM-GROWTH-ZONES`, `CRM-ROADMAP-projects-deals`)
**Метод:** полное прочтение всех 18 файлов (15 CRM — 4 параллельных субагента, 3 сводных — вручную) + сверка ключевых фактов с живой прод-БД `uoiavcabxgdjugzryrmj`
**Стек:** неизменен — Next.js 15 + TS + Tailwind + Supabase

---

## 0. TL;DR — вердикт по пакету

Пакет Grok **качественный и его стоит использовать**, но с двумя поправками:

1. **Объём ≠ сигнал.** 15 разборов CRM дают ~80% дублирования. Реальный actionable-сигнал сходится к **~8 темам**. Ценность 15 файлов не в 15 разных идеях, а в том, что одни и те же 8 тем всплывают независимо у 5-7 CRM — это высокая уверенность, а не разнообразие. Не читай 15 файлов как 15 бэклогов.

2. **`CRM-ROADMAP-projects-deals.md` — это не «список доработок», это 6-9-месячная продуктовая программа (12-16 спринтов).** Как стратегия — сильная и в основном верная. Как план на ближайшее — переусложнена: P1 у Grok = ~4 спринта с Gantt и workflow-движком внутри. Ниже я его пересеквенирую: сначала дешёвая волна «быстрых побед» (1 спринт, максимум воспринимаемой ценности), потом Gantt, потом автоматизация.

**Что Grok переоценил** (мой pushback — детали в §6): Gantt на `gantt-task-react` через 9 тем (налог на стилизацию), workflow engine в P1 (дорого и рано), «won/lost reasons» как новая работа (`lost_reason` уже есть), aging/dwell как требующие миграции (`stage_entered_at` уже есть).

**Что Grok недооценил или пропустил:** дешевизна портфельных/aging-фич (данные уже в схеме), асимметрия won/lost (won не пишется), риск legacy `projects.stage` (техдолг блокирует всё на сделках).

---

## 1. Что подтверждено по живой БД (факты, не пересказ)

Сверял то, на чём держится весь roadmap:

| Утверждение Grok | Факт по проду | Вывод |
|---|---|---|
| Нет дат start/end на задачах | `tasks`: есть только `deadline`. Нет `start_date`/`end_date`/`duration`/`parent_task_id`/`wbs_code` | ✅ верно — Gantt требует миграции |
| `parent_deal_id` есть, UI слабый | `projects.parent_deal_id` ✅ | ✅ Deal Hub — чистый UI поверх готового FK |
| Нужен `stage_entered_at` для aging | **`projects.stage_entered_at` уже есть** | ⚠️ Grok не заметил — aging/dwell/rotting-per-stage дешевле на порядок, миграция не нужна |
| Won/Lost reasons отсутствуют | `lost_reason` ✅ есть, `won_reason` ❌ нет | ⚠️ сделано наполовину — работа = добавить только `won_reason` (S), не пара полей |
| S29 automation = 1×1 | `automation_rules`: `trigger_type` + `action_type`, по одному | ✅ верно |
| legacy `projects.stage` — техдолг | enum `stage` жив рядом с `stage_id` | ✅ верно — два источника истины |
| quotes/segments/deps — новые | Ни `quotes`, ни `segments`, ни `task_dependencies`, ни `stage_playbooks`, ни `project_checklists` в БД нет | ✅ все net-new, аддитивно |
| Есть: templates, gates, members, runs | `delivery_templates`, `stage_requirements`, `project_members`, `automation_runs`, `project_columns` ✅ | ✅ фундамент готов |

**Итог сверки:** фактура Grok надёжна. Две правки в его пользу удешевляют работу (`stage_entered_at`, `lost_reason` уже есть).

---

## 2. Консенсус-карта: что сходится по всем источникам

Отсортировано по числу независимых источников (сила сигнала) × применимость к домену. `[N]` = сколько CRM/докладов независимо указали.

| # | Тема | Источники | Что уже есть | Что делать | Effort |
|---|---|---|---|---|---|
| **К1** | **Sales→Delivery handoff wizard** (осознанный выбор контура при won: новый delivery / добавить к существующему / только отметить; выбор шаблона по direction; owner; copy files) | Accelo, Monday, Insightly, Productive (Win Wizard — лучший референс), Teamwork, HubSpot, Zoho **[7]** | `spawn_delivery_project` RPC + templates — «голая» кнопка | Модалка-wizard поверх RPC + опц. авто-триггер на won (HITL) | M |
| **К2** | **Connected deal↔delivery card / Deal Delivery Hub** (на won-сделке — все дочерние внедрения, их health, прогресс, `do_url`; обратно на delivery — origin-сделка) | Monday, Teamwork, Zoho (360°), Productive, Insightly **[5]** | `parent_deal_id` FK | UI-агрегат на карточке сделки + бейдж на delivery | M |
| **К3** | **Quote/КП как объект CRM** (тонкая связь КП со сделкой: статус draft/sent/accepted, сумма, ссылка на doc из kp-master) | Accelo, HubSpot, Insightly, Productive, Salesforce, Zoho **[6]** | КП живёт вне CRM (kp-master skill) | Таблица `quotes` (тонкая, НЕ CPQ) + вкладка на сделке | M |
| **К3.5** | **Post-meeting AI HITL** (Smart Deal Progression: transcript → предложить обновить поля сделки/next_step/задачи, человек подтверждает) | Attio, HubSpot, Pipedrive, Productive, Salesforce, Zoho **[6]** | `transcripts`, `ai_runs`, `AiWorkspaceModal`, доменные пресеты | Write-back слой поверх AI Hub | M |
| **К4** | **Generic Workflow Engine breadth** (типизированные триггеры × условия × действия + run-log) | Attio, HubSpot, Close, Insightly, Twenty, Zoho, Productive **[7]** | S29 = 1×1 (`automation_rules`/`runs`) | Расширить типы триггеров/действий (БЕЗ visual canvas) | **L** |
| **К5** | **Временное планирование** (даты задач → Gantt → зависимости → WBS) | projects-deals roadmap, Monday, Accelo, Productive, Pipedrive **[5]** | только `deadline`, `is_milestone` | Миграция дат → Gantt read-only → deps | M+L |
| **К6** | **Delivery health + Portfolio Dashboard** (health-score для внедрений; портфельный экран, aging, красная зона) | Accelo, Productive, projects-deals, PM-growth **[4]** | `deal-health.ts` только для sales; `stage_entered_at` есть | Health-score для delivery + сводный экран | M |
| **К7** | **Server-side segments** (динамические сохранённые виды с пересчётом, шаринг в org) | Close (Smart Views), HubSpot, Twenty **[3]** | `use-saved-views` (localStorage, не шарятся) | Таблица `segments` + RLS + пересчёт | M |
| **К8** | **Дешёвый bundle polish** (Notes в timeline; peek на companies/leads; TodayView snooze/done; context-rich queue rows; per-stage rotting; default sort by next-action; won_reason) | ~все **[10+]** | частично | Пачка мелких gap-close | S каждый |

**Всё остальное из 15 файлов** — либо уже сделано у нас сильнее (stage gates в БD > UI-required-fields; доменные шаблоны; TodayView; deal-health), либо осознанно вне домена (см. §7).

---

## 3. Фильтр: полезное vs шум

**Бери без раздумий (высокий ROI, ложится на готовое):** К1, К2, К8-bundle, К6. Это максимум ценности при S-M усилиях, всё поверх существующих таблиц.

**Бери, но обособленной волной (дорого/рискованно, нужен фокус):** К5 (Gantt), К4 (workflow).

**Бери позже / go-no-go:** К3 (quotes — ценно, но не срочно), К3.5 (AI write-back — сильное доменное преимущество, но требует аккуратного HITL), К7 (segments — localStorage хватает для 5-15 человек).

**Шум пакета (не трать время):**
- Повторный разбор одной темы в 6 файлах — не 6 задач, а 1.
- Enterprise-чеклист из Salesforce (SSO/SAML, Approval matrix, Field-level audit, public API) — Grok сам метит большинство LOW; для внутреннего инструмента команды 5-15 это преждевременно. Field-level audit брать только при реальном запросе закупки клиента «кто менял сумму».
- Весь communication-контур (dialer, email/SMS sequences, mail sync, Close Chloe) — вне домена ручных B2B-продаж, сознательно в 1С.
- Платформенные фичи (custom objects UI, metadata API, MCP-серверы, credit billing, autonomous SDR-агенты) — мы vertical product, а не meta-CRM.

---

## 4. Консолидированный roadmap (пересеквенированный)

Принцип: **сначала дёшево и заметно, потом дорого и структурно.** Привязка к вашему процессу спринтов (S-*, как в projects-deals §13).

### Волна 1 — «Быстрые победы» (1–1.5 спринта, всё S, поверх готовой схемы)
> v2: срок уточнён с «1 спринт» → «1–1.5» (Deal Hub и delivery health не тривиальны под 9 тем). В 1 спринт влезет, только если health ужать до бейджа без факторов.
Максимум воспринимаемой ценности за минимум риска. Ничего из этого не требует тяжёлых миграций.

| Epic | Что | Опора | Effort |
|---|---|---|---|
| S-DEAL-HUB-1 | Deal Delivery Hub на won-сделке (К2) | `parent_deal_id` | S-M |
| S-NOTES-TIMELINE-1 | Notes (`activities.type='note'`) в EntityTimeline (К8) | `activities` есть | S |
| S-WON-REASON-1 | Добавить `won_reason` (симметрия к `lost_reason`) + enum в модалке won (К8) | `lost_reason` шаблон | S |
| S-AGING-1 | Stage-aging/dwell бейджи + per-stage rotting + default-sort by next-action (К8) | **`stage_entered_at` уже есть** | S |
| S-DLV-HEALTH-1 | Delivery health score + бейджи на `DeliveryPipelineBoard` (К6) | `deal-health.ts` как шаблон | M |

**Демо В1:** won-сделка показывает все внедрения с health; доска delivery подсвечивает красные; залипшие сделки всплывают по aging; заметки в ленте.

### Волна 2 — «Handoff + план во времени» (2-3 спринта)

| Epic | Что | Effort | Зависимости |
|---|---|---|---|
| S-WIN-WIZARD-1 | Win Wizard: осознанный spawn (новый/добавить/отметить) + выбор шаблона + owner + copy files (К1). Лучший референс — Productive | M | — |
| S-WON-AUTO-1 | Хардкод-автоматизация `won → notify РП + предложить spawn` (подмножество К4, БЕЗ движка) | S | — |
| S-GANTT-DATES-1 | Миграция `tasks.start_date`/`end_date` (fallback на `deadline`) (К5) | S | блокер Gantt |
| S-GANTT-V0-1 | **v0: таблица-таймлайн** (задача × неделя, без библиотеки, 2-3 дня) — уже «план во времени» | S | dates |
| S-GANTT-VIEW-1 | Gantt read-only после **spike по стеку** (1-2 дня: gantt-task-react vs visx/SVG под 9 тем), группировка по фазе, milestone-ромбы, зум (К5). **Scope жёсткий v1** (см. §6) | M | v0, spike |
| S-LEGACY-STAGE-1 | Миграция читателей `projects.stage` → `stage_id`, deprecate enum (техдолг) | M | — |

**Демо В2:** win → wizard с выбором контура; delivery открывается в режиме «Доска \| Гант»; РП видит план во времени.

### Волна 3 — «Управлять портфелем + автоматизация» (3-4 спринта)

| Epic | Что | Effort |
|---|---|---|
| S-PORTFOLIO-1 | Portfolio Dashboard (счётчики по фазам, топ-5 красных, aging, split ERP/IIoT) (К6) | M |
| S-WF-2 | Workflow Engine MVP: typed триггеры (`stage_entered`/`field_changed`/`status_changed`/`task_overdue`) × JSONB-условия × действия (`create_task`/`set_field`/`notify`/`create_activity`), run-log, БЕЗ canvas (К4) | **L** |
| S-DEPS-1 | `task_dependencies` (FS) + стрелки на Gantt, валидация DAG, БЕЗ cascade (К5) | M |
| S-QUOTE-1 | `quotes` (тонкий объект-связка с kp-based doc) + вкладка на сделке (К3) | M |
| S-ERP-PARITY-1 | ERP spawn/шаблон до уровня IIoT (PM-growth §4 — асимметрия ERP ~50% vs IIoT ~60%) | M |
| S-SEGMENTS-1 | Server-side `segments` + RLS (К7) — **go/no-go**, а не фикс-epic: localStorage saved-views хватает для 5-15 ещё ~год | M |

### Волна 4 — «Качество закрытия + глубина» (по мере надобности)

| Epic | Что | Effort |
|---|---|---|
| S-AI-WRITEBACK-1 | Post-meeting HITL: transcript → предложение полей сделки (К3.5). **Развилка по цели:** PM-tool → В4; sales-velocity → поднять в В2-В3 (это одна из немногих фич, где мы уже сильнее рынка — доменные пресеты) | M |
| S-WBS-1 | `parent_task_id` + `wbs_code`, tree UI | M |
| S-CHECKLIST-1 | `project_checklists` sign-off (приёмка из xlsx ДО) | M |
| S-INTERNAL-1 | Internal templates + участие в Portfolio (PM-growth §7 — internal сейчас «второй сорт» ~25%) | M |
| S-DEPS-2 | Cascade date shift (opt-in) | M |
| S-WF-3 | Workflow: `time_based`/`deadline_approaching` через pg_cron + `webhook` | M |

### Осознанно отложено / P4+
1С:ДО read-only sync (после стабилизации CRM-плана), analytics cycle-time, Gantt drag-resize, support tickets (go/no-go), client portal, capacity loading.

---

## 5. Матрица приоритизации (одним взглядом)

```
                 ВЫСОКАЯ ЦЕННОСТЬ
                        │
   Deal Hub ●           │      ● Win Wizard
   won_reason ●         │      ● Gantt (dates+view)
   aging/dwell ●        │      ● Delivery health
   notes-timeline ●     │
        ───────────────┼───────────────────  ДОРОГО →
   context rows ○       │      ● Workflow MVP (L)
   per-stage rotting ○  │      ● Portfolio
                        │      ○ quotes / segments / deps
                 НИЗКАЯ ЦЕННОСТЬ / ПОЗЖЕ

   ● = брать   ○ = go/no-go / позже
   Левый-верх = делать первым (В1). Правый-верх = В2. Низ = В3-В4.
```

---

## 6. Глубокий разбор `CRM-ROADMAP-projects-deals.md` (важный файл — детально)

Grok просил проработать его отдельно. Документ **сильный** — верная объектная модель (`projects.type` в 3 роли — согласен, схлопывание правильное для 5-15), верный принцип «CRM зеркалит 1С:ДО, не заменяет», честный SKIP-лист. Но по нему есть конкретный pushback:

**Что оставить как есть (согласен полностью):**
- Принцип «два ортогональных этапа» (`stage_id` = воронка, `column_id` = фаза) — держать железно, любая новая фича обязана уважать.
- «DB enforcement > UI prompts» — ваш S27 сильнее Accelo, не регрессировать в UI-only.
- SKIP-лист (§12): PSA-финконтур, замена ДО, visual canvas v1, marketing/sequences, отдельные таблицы deals/projects. Всё верно.
- Gantt scope v1 (§9.2): жёсткое ограничение read-only, без critical path/baseline/drag — правильно, это главная защита от «Gantt → MS Project».

**Что переставить (мой главный pushback по последовательности):**
- Grok кладёт в P1: Gantt (0.7-1) + Workflow MVP (1.5) + Deal Hub + health + legacy stage + notes = **~4 спринта**. Это не «волна 1», это квартал. Риск: 2 месяца до первого видимого результата.
- **Разбей P1 на две волны** (мои В1/В2 выше): сначала 1 спринт чистых S-побед (Deal Hub, notes, won_reason, aging, health) — они дают 70% воспринимаемой ценности PM-growth «Ступени 1» почти бесплатно, потому что данные уже в схеме. **Gantt и workflow — отдельными фокусными волнами после**, а не в общей куче.

**Что удешевить (Grok не заметил готовые поля):**
- `stage_entered_at` **уже есть** → его B-блок «дней в состоянии», Z4 escalation, Pipedrive per-stage rotting не требуют миграции. Grok закладывал это как работу — на деле S-фича на готовом поле. Забери в В1.
- `lost_reason` **уже есть** → «won/lost reasons» = добавить только `won_reason` + enum. Полспринта Grok превращается в S.

**Что оспорить по существу:**
- **Gantt-библиотека (§9.2).** Grok рекомендует `gantt-task-react` за 0.7 спринта. Pushback: у вас 9 тем и выстраданная theme-system (aura/washi/fuji/frost...). `gantt-task-react` стилизуется тяжело и потянет за собой чужой DOM/CSS, который придётся укрощать под каждую тему — это скрытый налог, который съест «0.7 спринта». Для read-only v1 (полосы + ромбы + today-line + зум) **custom SVG на visx/чистом SVG** может выйти сопоставимо по времени и полностью в вашей теме, без внешней зависимости. Решение за тобой, но заложи это как явный выбор, а не дефолт «берём готовую либу». Минимум — v1 на нейтральной палитре, тему допилить потом.
- **Workflow engine в P1.** Согласен, что это структурный gap №1 (7 источников). Но не согласен ставить его в первую волну: L-усилия + высокий риск scope creep (Grok сам пишет про это в §10). Вместо этого вытащи **единственное самое ценное правило — `won → notify + предложить spawn` — как хардкод-автоматизацию (S)** в В2, а общий движок делай В3, когда будет понятно, какие ещё правила реально нужны (не спекулятивно).
- **Quotes (A2).** Согласен MEDIUM/позже. Но подчеркну: делать **тонким объектом-связкой** (status + amount + doc_url на kp-master output), НЕ повторять CPQ. Grok это пишет, но в таблице `quotes` у него уже 8 полей — держи минимум, иначе расползётся.

**Чего в файле не хватает (пробелы Grok):**
- **Риск legacy `projects.stage` недооценён по срочности.** Grok ставит A4 в P1, но не связывает: пока два источника истины на стадии живы, *каждая* новая фича на сделках (aging, segments, automation-триггеры по стадии) множит баги рассинхрона. Это не «техдолг когда-нибудь», это **предусловие** для В1-aging и В3-workflow. Подними приоритет — в В2 максимум.
- **Нет явной привязки health-факторов к готовым данным.** Grok даёт формулу delivery-health (§B5), но не отмечает, что все входы (`lane`, `deadline`, `is_milestone`, `stage_entered_at`, timeline) уже в схеме → это чистый вычислительный слой, ноль миграций. Забери в В1.

**Итог по файлу:** стратегия — 9/10, последовательность — 6/10 (перегруженный P1). Бери модель и принципы Grok целиком, но исполняй по волнам В1→В4 выше, а не по P1-монолиту.

---

## 7. Осознанно НЕ берём (SKIP)

| Категория | Что | Почему |
|---|---|---|
| Communication stack | dialer, email/SMS sequences, mail sync, Close Chloe, Cadences с email | Вне домена ручных B2B-продаж; сознательно в 1С |
| PSA-финконтур | time tracking, invoicing, retainers, rate cards, margin, resource booking | В 1С:ДО; команда 5-15 |
| Enterprise-платформа | SSO/SAML, Approval matrix, public API v1, CPQ, Service Cloud, AppExchange/маркетплейс | Преждевременно для внутреннего инструмента; брать точечно под конкретный RFP |
| Meta-CRM | custom objects UI, metadata API, generic renderer, MCP-серверы, credit billing | Мы vertical product, не конструктор |
| Autonomous agents | Breeze/Agentforce/Zia SDR, auto stage-change | Наш путь — доменный HITL, не автономность |
| Enrichment | Pitchbook/ZoomInfo/waterfall, warm-intro graph | РФ-нерелевантно; ИНН/ЧЗ — отдельная тема |
| Full PM | MS Project EVM, baseline, critical-path v1, replace 1С:ДО | Только под ГОЗ-тендер |

---

## 8. Что делать прямо сейчас

**Следующий спринт = Волна 1** (все S, поверх готовой схемы, ноль тяжёлых миграций): Deal Delivery Hub → delivery health → aging/dwell на `stage_entered_at` → notes в timeline → `won_reason`.

Это закрывает **~60% «Ступени 1»** из PM-GROWTH-ZONES (health, Deal Hub, aging) — но **не всю**: порог «PM-tool для одного проекта» по PM-GROWTH требует ещё Gantt+даты, а это В2. Формула: **Ступень 1 = В1 + Gantt из В2.** В1 даёт понять, стоит ли вкладываться в дорогие В2-В3 — или дешёвых побед уже достаточно.

Каждый epic из §4 готов к превращению в `SPRINT-*.md` для Claude Code через `sprint-prompt-builder` / `crm-architect`.

---

## Verification

```
Факты по схеме:        PASS (сверено с прод-БД uoiavcabxgdjugzryrmj, миграции до 041)
Полнота прочтения:     PASS (18/18 файлов прочитаны целиком)
Применимость к стеку:  PASS (все рекомендации — Next.js+Supabase, аддитивно)
Backward Compatibility: PASS (все предложения — новые таблицы/поля/UI, ничего не ломают)
Runtime Tested:        NOT_VERIFIED (roadmap, не код)
```

---

## 9. Сверка с контр-ревью Grok (v2, 2026-07-14)

Grok оценил это ревью 8.5/10 и дал 6 встречных возражений. Принято 5, по 1 — уточнение акцента. Дельты v2 уже внесены в разделы выше.

| Возражение Grok | Вердикт | Что изменено |
|---|---|---|
| «В1 = 1 спринт» оптимистично | Принято | В1 → 1–1.5 спринта (§4) |
| «В1 закрывает Ступень 1» переоценка (Gantt в Ступени 1) | Принято | §8: Ступень 1 = В1 + Gantt из В2 (~60% в В1) |
| Gantt: не свапать дефолт на дефолт без spike | Принято | В2: добавлен v0 таблица-таймлайн + spike перед v1 |
| Segments в В3 — go/no-go, не фикс | Принято (моя внутр. нестыковка) | В3: помечен go/no-go |
| AI write-back — развести PM-tool vs sales-velocity | Принято | В4: развилка по цели |
| ERP/internal parity не в консенсус-карте | Уточнение | Карта К1-К8 намеренно = cross-CRM консенсус; ERP-parity это тема внутр. доков (PM-GROWTH), у западных CRM её нет → в карте её и не должно быть. Но проминанс в roadmap заслуживает: **ERP-parity перенесён В4→В3** |

**Housekeeping (замечание Grok, вне скоупа плана):** в `_analysis/` две версии этого ревью (короткая `REVIEW-grok-crm-gap` + полная `review-grok-crm-roadmap`) разъедутся при правках. Держать одну (полную) как источник, короткую генерировать из неё или удалить.

**Статус:** консенсус с Grok достигнут. План не опровергнут — доточены сроки В1 и Gantt-путь (v0→spike→v1). Операционный план = волны В1→В4 (v2), стратегия/принципы = `CRM-ROADMAP-projects-deals.md` + `PM-GROWTH-ZONES.md` без изменений.
