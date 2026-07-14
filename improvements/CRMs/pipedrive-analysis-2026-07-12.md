# Pipedrive CRM — комплексный анализ и инсайты для dashboard-crm

**Дата:** 2026-07-12  
**Метод:** парсинг support.pipedrive.com (KB, обновления май–июль 2026), newsroom, pricing-обзоры, сопоставление с кодовой базой dashboard-crm.  
**Связанные документы:** `improvements/crm-benchmark-candidates-2026-07-12.md` (приоритет #1), `CRM-EVOLUTION-PLAN.md`, `CHANGES-waves-1-2.md`, `improvements/hubspot-analysis-2026-07-12.md`, `improvements/attio-analysis-2026-07-12.md`.

---

## 0. Как читать этот документ

| Символ | Значение |
|--------|----------|
| ✅ | Паритет или сильная альтернатива |
| 🟡 | Частично / другая модель |
| ❌ | Нет |
| ➕ | Есть у нас, у Pipedrive нет «из коробки» или слабее |
| 🔒 | Требует платного tier Pipedrive |

**Контекст:** Pipedrive — **activity-based sales CRM** для SMB (100k+ компаний). dashboard-crm — **вертикальная CRM** под продажи и внедрения маркировки (1С:ERP, Честный Знак). Pipedrive — **главный бенчмарк по механике сделки**; волны 1–2 уже перенесли его паттерны. Этот анализ закрывает оставшиеся gaps.

---

## 1. Pipedrive в 2026 — позиционирование и архитектура

### 1.1 Слоган и стратегия

Pipedrive позиционируется как **«easy and intelligent CRM»** для растущих sales-команд SMB. Основа продукта — **activity-based selling**: фокус на действиях, которые реп контролирует, а не на результате сделки.

Ключевые концепции (с [activity-based selling](https://www.pipedrive.com/en/blog/activity-based-selling), KB 2026):

```
Activity-Based Selling (философия основателя Timo Rein)
├── Pipeline view — центр всего (kanban по стадиям)
├── Activities — call · meeting · task · deadline · email · lunch (+ custom)
├── Rotting — визуальный сигнал «сделка застоялась»
├── Focus panel — что требует внимания прямо сейчас
└── Insights — KPI: deals count · deal size · conversion · sales velocity

Поверх (2025–2026):
├── Automations — trigger → conditions → if/else → actions (Growth+)
├── Projects — post-sale delivery (Premium+, май 2026 — Gantt, AI briefs)
├── Sales Assistant — generic AI chat (beta, OpenAI)
├── Scores — custom deal scoring (Premium+)
└── Codex Sales Plugin — CRM context в OpenAI workflows (июнь 2026)
```

**Главное отличие от HubSpot/Attio:** Pipedrive не platform play. Это **pipeline-first sales machine** — один экран, одна очередь действий, минимум модулей.

### 1.2 Масштаб (заявленный, 2026)

| Метрика | Значение |
|---------|----------|
| Клиенты | 100,000+ SMB |
| Основан | 2010, HQ New York |
| Инвесторы | Vista, Bessemer, Insight, Atomico |

### 1.3 Ценовая модель (новые планы, ноябрь 2025)

| Plan | Annual | Monthly | Ключевое |
|------|--------|---------|----------|
| **Lite** | $14/seat | $24/seat | Pipeline, rotting, Leads Inbox, Scheduler |
| **Growth** | $39/seat | $49/seat | 🔒 Email sync, **Automations**, Sequences, Forecast |
| **Premium** | $59/seat | $79/seat | 🔒 Projects, Scores, Required fields, LeadBooster |
| **Ultimate** | $79/seat | $99/seat | Unlimited permissions, phone support |

Маппинг старых планов: Essential→Lite, Advanced→Growth, Professional/Power→Premium, Enterprise→Ultimate.

**Инсайт для позиционирования:** Automations — с Growth ($39/seat). Projects + Scores + Required fields — с Premium ($59/seat). Для команды 5 человек Premium = $295/mo. У нас эти возможности без tier-ограничений.

---

## 2. Объектная модель Pipedrive

### 2.1 Разделение сущностей

| Объект | Назначение | Активация |
|--------|------------|-----------|
| **Deals** | Sales pipeline (kanban) | Default |
| **Leads** | Pre-qualified opportunities | Leads Inbox (отдельно от pipeline) |
| **People** | Контакты | Default |
| **Organizations** | Компании | Default |
| **Activities** | Call, Meeting, Task, Deadline, Email, Lunch | Default + custom types |
| **Projects** | Post-sale delivery | 🔒 Premium+ (add-on на Growth) |
| **Products** | Каталог + line items на сделке | 🔒 Growth+ |

**Ключевой паттерн:** Deals и Projects **разделены**. Deal won → Create Project (или link). Контекст (notes, files, emails) переносится в project.

Источник: [Projects by Pipedrive](https://support.pipedrive.com/en/article/projects-by-pipedrive) (май 2026), [Leads Inbox](https://support.pipedrive.com/en/article/leads-inbox) (февраль 2026).

### 2.2 Activities — сердце activity-based selling

[Activities KB](https://support.pipedrive.com/en/article/activities) (апрель 2026):

| Поле | Описание |
|------|----------|
| **Last activity date** | Дата последней activity, marked as done |
| **Next activity date** | Дата ближайшей незавершённой activity |
| **Marked as done time** | Когда activity завершена (≠ due date) |

Activities линкуются к deal/person/org/lead/project. При link к deal — автоматически к person + org.

**Pipeline default sort:** по **next activity** — сделки без activity или с просроченной activity вверху.

### 2.3 Rotting — отдельная модель от next action

[The Rotting feature](https://support.pipedrive.com/en/article/the-rotting-feature) (май 2026):

| Аспект | Pipedrive | dashboard-crm (W1a) |
|--------|-----------|---------------------|
| Триггер «гниёт» | **Last updated time** на стадии (per-stage threshold в днях) | **Нет next_step** или **просрочен next_action_date** |
| Настройка | Per pipeline stage: «Rotting in (days)» | Глобальная логика в `getDealHealth()` |
| Сброс таймера | Activity done, notes, files, email actions | Обновление next_step / next_action_date |
| Учитывает future activity? | **Нет** — activity через 30 дней не спасает от rotting | Да — если есть future next_action_date → ok |

> «The rotting feature disregards the next activity date, so any deal with an activity scheduled far into the future can still go rotten.»

**Инсайт:** Pipedrive rotting = **«давно не трогали»**, наш rotting = **«нет запланированного шага»**. Это **дополняют**, а не дублируют друг друга. У нас `calculateDealHealth()` уже учитывает `last_contact_date` — частичный паритет с Pipedrive rotting.

### 2.4 Focus panel

[Deal detail view — Focus](https://support.pipedrive.com/en/article/deal-detail-view) (март 2026), [Leads Inbox — Focus](https://support.pipedrive.com/en/article/leads-inbox):

```
Focus section (deal / lead card)
├── Upcoming activities (не done)
├── Pinned notes
├── Email drafts
└── Scheduled emails
```

**У нас:** `DealFocusPanel` — next_step + next_action_date, pinned_note, deal health, «N дн. без активности». ✅ **паритет + расширение** (inline edit, «Шаг сделан ✓»).

### 2.5 Маппинг на dashboard-crm

| Pipedrive | dashboard-crm | Комментарий |
|-----------|---------------|-------------|
| Deals | `projects` WHERE `type='client'` | 🟡 схлопнуто с internal |
| Leads Inbox | `leads` + convert_lead RPC | ➕ без tier |
| People | `contacts` | ✅ |
| Organizations | `companies` | ✅ |
| Activities | `calls` + `meetings` + `tasks` | 🟡 три таблицы, не unified activity |
| Projects | `projects` WHERE `type='internal'` + `project_columns` | ➕ канбан задач; 🟡 другая модель |
| Products | ❌ | gap |
| Rotting (per-stage) | `getDealHealth()` + `calculateDealHealth()` | 🟡 другая модель, но покрыто |
| Focus panel | `DealFocusPanel` | ✅ реализовано W1c |
| Pipeline sort | URL filters + saved views | 🟡 нет default «next activity» sort |

---

## 3. Pipeline UX — главный экран Pipedrive

### 3.1 Pipeline view

[Pipeline view KB](https://support.pipedrive.com/en/article/pipeline-view) (апрель 2026):

| Возможность | Описание |
|-------------|----------|
| Multiple pipelines | Разные процессы (ERP / ЧЗ / …) |
| Deal card customization | 🔒 Lite+: выбор полей на карточке |
| Sort by | Default: **next activity**; также value, close date, owner |
| Rotting | Red tile на карточке |
| Won/Lost | Drag to close; удаление из active view |
| Progress bar | В detail view: дни на каждой стадии |

### 3.2 Required fields vs Stage gates

[Required fields](https://support.pipedrive.com/en/article/required-fields) (июль 2025):

- 🔒 **Premium+** ($59/seat)
- Блокирует создание/редактирование и **переход стадии** без заполнения полей
- Per pipeline + per stage configuration
- **Не работает** через import, bulk edit, API, automations

**У нас:** `stage_requirements` + `check_stage_requirements()` — hard enforcement на уровне DB trigger (S27). ➕ **сильнее**: нельзя обойти через API/import.

### 3.3 Scores (deal prioritization)

[Scores](https://support.pipedrive.com/en/article/scores) (март 2026):

- 🔒 Premium+
- Custom criteria: highly positive (+25), slightly positive (+10), negative (-10)
- Per pipeline, one active score
- Auto-recalculate on deal data change

**У нас:** `calculateDealHealth()` — 4 фактора (lastContact, nextStep, deadline, completeness), native, без tier. ➕ **паритет без Premium**.

---

## 4. Automations — workflow engine

[Automations: first steps](https://support.pipedrive.com/en/article/workflow-automation) (август 2025):

```
Trigger (event or date)
  → Condition(s) [AND/OR]
  → If/else branches (1–10 steps по tier)
  → Action(s): person · org · lead · deal · activity · email · notes · project · webhook
  → Integrations: Slack · Teams · Trello · Asana
```

| Tier | Active automations | If/else steps |
|------|-------------------|---------------|
| Growth | — | 3 |
| Premium | 150 | 10 |
| Ultimate | — | — |

**Триггеры:** deal/person/activity/lead/org/project — added/updated/deleted + date triggers.

**У нас (S29):** `stage_entered → create_task` — один триггер × одно действие.

**Главный разрыв** — тот же, что с HubSpot/Attio: workflow engine.

### 4.1 Project templates + automation (май 2026)

[Projects: templates](https://support.pipedrive.com/en/article/projects-templates) (май 2026):

```
Deal won (automation trigger)
  → Create project from template
  → Tasks + activities + milestones с relative due dates
  → Dependencies: blocking / waiting on
  → AI-generated project brief (newsroom, май 2026)
```

**Референс для нас:** P2 из hubspot-analysis — «Closed Won → internal project + columns + tasks». Pipedrive подтверждает паттерн, добавляет Gantt и dependencies.

---

## 5. AI-стратегия Pipedrive vs AI Hub

| Pipedrive (2026) | dashboard-crm | Вердикт |
|------------------|---------------|---------|
| **Sales Assistant** — generic chat, voice, data queries (beta) | AI Hub — 3 доменных пресета | Разный фокус |
| **AI project briefs** — из sales history (май 2026) | ❌ | Gap (PCT templates) |
| **Scores** — rule-based deal scoring | `calculateDealHealth()` | ➕ native |
| **Codex Sales Plugin** — CRM context в OpenAI | ❌ | Отложить |
| **Workflow health monitoring** (май 2026) | `automation_runs` без dashboard | 🟡 gap |
| **Meeting prep / post-call** | `AiWorkspaceModal`, transcripts | 🟡 расширить (P0 из hubspot) |

### Sales Assistant (январь 2026, beta)

[Sales Assistant KB](https://support.pipedrive.com/en/article/sales-assistant):

- OpenAI-powered, context-aware
- Queries: «Which deals need my attention?», «What's forecasted?»
- How-to answers из Knowledge Base
- Tab-focus на текущий record
- **Не обновляет** deal fields автоматически (в отличие от HubSpot Smart Deal Progression / Attio Follow-Up Agent)

**Инсайт:** Pipedrive AI пока **read-only assistant**, не HITL deal updater. Наш AI Hub с `AiWorkspaceModal` ближе к тренду 2026 (post-meeting HITL), если расширим на deal fields.

---

## 6. Action inbox: Activities list vs TodayView

Pipedrive **не имеет единого action inbox** как Close. Вместо этого:

| Слой | Pipedrive | dashboard-crm |
|------|-----------|---------------|
| Стартовый экран | Pipeline view (deals) | ➕ TodayView (`/`) |
| Очередь действий | Activities tab (list/calendar) | ➕ unified queue в TodayView |
| Sort pipeline | By next activity | 🟡 нет default |
| Reconnect | 🟡 через filters / rotting | ➕ `last_touch` + секция «Остывают» |
| Stale leads | Leads Inbox filters | ➕ stale leads в TodayView |

**Вывод:** по action inbox мы **сильнее Pipedrive** (ближе к Close). Pipedrive силён в pipeline mechanics, не в unified queue.

---

## 7. Gap-матрица: dashboard-crm vs Pipedrive

### 7.1 Где dashboard-crm **сильнее** Pipedrive

| Возможность | Почему |
|-------------|--------|
| **TodayView** (unified action inbox) | Pipedrive — pipeline + activities tab, не единая очередь |
| **Stage gates** (DB-level enforcement) | Pipedrive required fields — Premium+, обходятся через API/import |
| **Deal health scoring** | Native `calculateDealHealth()`, у Pipedrive — Scores на Premium+ |
| **Next action rotting** | Явный next_step + date; Pipedrive rotting не учитывает future activity |
| **Vertical AI** (SPIN, протокол, аналит. записка) | Pipedrive — generic Sales Assistant |
| **Reconnect** | Native last_touch + Today; Pipedrive — через rotting/filters |
| **Deals + Projects схлопнуты** | Меньше handoff friction для малой команды |
| **Leads без tier** | Pipedrive Leads Inbox — все планы, но с лимитами |
| **Cmd+K + saved views + keyboard nav** | Linear-паттерны; у Pipedrive — search + Sales Assistant |
| **9 тем** | Pipedrive — single design |

### 7.2 Ядро CRM

| Возможность | Pipedrive | dashboard-crm | Gap |
|-------------|-----------|---------------|-----|
| Pipeline kanban | ✅ центр продукта | ✅ PipelineBoard | паритет |
| Multiple pipelines | ✅ | ✅ pipelines table | паритет |
| Leads → Deal convert | ✅ Leads Inbox | ✅ convert_lead RPC | паритет |
| Activities unified | ✅ один тип с подтипами | 🟡 calls/meetings/tasks | архитектурный gap |
| Rotting indicator | ✅ per-stage inactivity | ➕ next_action based | 🟡 разные модели |
| Focus panel | ✅ | ➕ DealFocusPanel | **реализовано** |
| Notes в timeline | ✅ | ❌ в EntityTimeline | gap (P3) |
| Email sync | ✅ Growth+ | ❌ | сознательно |
| Products / quotes | ✅ Growth+ | ❌ | gap (КП вне CRM) |
| Files на сделке | ✅ | ✅ project_files | паритет |
| Deal progress bar | ✅ stage duration | ❌ | gap (низкий effort) |
| Per-stage rotting config | ✅ | ❌ | gap |

### 7.3 Sales-автоматизация

| Возможность | Pipedrive | dashboard-crm | Gap |
|-------------|-----------|---------------|-----|
| Workflow engine | ✅ Growth+ (visual) | 🟡 S29: 1×1 | **главный разрыв** |
| Sequences | ✅ Growth+ | ❌ | gap (нужен email) |
| Required fields | 🔒 Premium+ | ➕ stage gates (harder) | **мы сильнее** |
| Deal scoring | 🔒 Premium+ Scores | ➕ calculateDealHealth | **мы сильнее** |
| Forecast | ✅ Growth+ | 🟡 weighted pipeline | частичный паритет |
| Project templates | ✅ Premium+ (май 2026) | 🟡 PCT-1 boards, без templates | gap |
| Smart Deal Progression | 🟡 Sales Assistant (read) | 🟡 AI Hub (HITL на звонках) | **быстрая победа** |

### 7.4 Delivery / Projects (май 2026)

| Возможность | Pipedrive | dashboard-crm | Gap |
|-------------|-----------|---------------|-----|
| Separate Projects object | ✅ Premium+ | ➕ `type=internal` в projects | 🟡 схлопнутая модель |
| Project templates | ✅ dependencies, relative dates | ❌ | **P2 приоритет** |
| Gantt timeline | ✅ (май 2026) | ❌ | отложить |
| AI project brief | ✅ (май 2026) | ❌ | 🟡 AI Hub evolution |
| Won → Create Project | ✅ automation | 🟡 ручной / нет automation | gap |
| Project automations | ✅ task done → phase change | 🟡 S29 stage_entered | gap |

---

## 8. Архитектурное сравнение

```
Pipedrive                           dashboard-crm
─────────                           ───────────────
Deals (pipeline kanban)             projects (type=client)
Activities (unified type)           calls + meetings + tasks (split)
Rotting (per-stage inactivity)      getDealHealth (next_action) +
                                    calculateDealHealth (last_contact)
Focus panel                         DealFocusPanel ✅
Leads Inbox                         leads table ✅
Projects (post-sale, Premium+)      projects (type=internal) + columns
Pipeline sort: next activity        saved views + URL filters
Automations (Growth+)               automation_rules (1×1)
Sales Assistant (generic)           AI Hub (domain presets)
Activities tab                      TodayView (unified inbox) ➕
```

---

## 9. Что уже реализовано из Pipedrive (волны 1–2)

По `CHANGES-waves-1-2.md` и `CRM-EVOLUTION-PLAN.md`:

| Pipedrive-паттерн | Спринт | Статус |
|-------------------|--------|--------|
| Always next action | W1a | ✅ `next_step`, `next_action_date`, rotting |
| Rotting indicator | W1a | ✅ `getDealHealth()`, kanban/table badges |
| Focus panel | W1c | ✅ `DealFocusPanel`, pinned_note |
| Prompt при смене стадии | W1a | ✅ toast «Запланируй следующий шаг» |
| Action inbox | W1b | ✅ TodayView (ближе к Close, не к Pipedrive) |
| Reconnect | W2b | ✅ last_touch + «Остывают» |
| Saved views | W2c | ✅ `useSavedViews` |
| Cmd+K | W2a | ✅ CommandPalette 2.0 |
| Keyboard j/k + peek | W2d | ✅ PeekPanel |

**Вывод:** основной Pipedrive UX-gap **закрыт**. Остались: workflow, project templates, per-stage rotting, unified activities, deal progress bar.

---

## 10. Приоритеты для dashboard-crm

Отфильтровано под домен маркировки + внедрения. Пересечения с hubspot/attio отмечены.

### P0 — Smart Deal Progression на базе AI Hub (~0.5 спринта)

Pipedrive Sales Assistant пока read-only. HubSpot/Attio уже делают HITL post-meeting. Расширить AI Hub:

1. После встречи/звонка → AI предлагает обновить `next_step`, поля сделки, tasks
2. HITL в `AiWorkspaceModal`
3. Доменные пресеты (протокол внедрения)

*Также в hubspot-analysis P0, attio-analysis P0.*

### P1 — Generic Workflow Engine (~1.5–2 спринта)

**Референс Pipedrive:** automations с triggers, conditions, if/else, project creation from template.

MVP:
- Триггеры: `stage_entered` (есть) + `field_changed`, `task_overdue`, `record_created`, `time_based`
- Действия: `create_task` (есть) + `set_field`, `notify`, `create_activity`, `create_internal_project`, `webhook`
- Условия: JSONB predicate
- Run log на `automation_runs`

*Также в hubspot-analysis P1, attio-analysis P1.*

### P2 — Project templates при выигрыше (~0.7 спринта)

**Референс Pipedrive (май 2026):** `Deal won → automation → project from template`.

```
client project stage = "Выиграна"
  → automation создаёт internal project
  → project_columns: [Обследование, Настройка, Тест, ОЭ]
  → tasks из шаблона по типу внедрения (ERP / ЧЗ / оба)
  → relative due dates от даты выигрыша
```

Зависит от P1 или hardcoded trigger.

*Также в hubspot-analysis P2.*

### P3 — Per-stage rotting thresholds (~0.3 спринта)

**Референс Pipedrive:** rotting per pipeline stage по `last_updated`.

Дополнить `getDealHealth()`:
- Таблица `stage_rotting_days` (pipeline_id, stage_id, days)
- Сигнал «давно не трогали» на карточке (дополнительно к next_action rotting)
- Использовать `stage_entered_at` + activity_log

**Не заменяет** next_action rotting — **дополняет**.

### P4 — Deal progress bar (~0.2 спринта)

**Референс Pipedrive:** progress bar в detail view — дни на каждой стадии.

Использовать `stage_entered_at` + pipeline_stages history из `activity_log`.

### P5 — Pipeline default sort «next action» (~0.2 спринта)

**Референс Pipedrive:** default sort by next activity.

В PipelineBoard/ProjectsTable: сделки без next_action_date / просроченные — вверху по умолчанию.

### P6 — Notes в EntityTimeline (~0.2 спринта)

Подключить `activities.type='note'` к `use-entity-timeline.ts`.

*Также в hubspot-analysis P3.*

### P7 — Unified Activity type (опционально, ~1 спринт)

Pipedrive: один Activity с подтипами. У нас: calls + meetings + tasks.

Не срочно — работает. Унификация упростит «next activity» sort и activity performance report.

### Отложить

- Email sync / Sales Inbox / Sequences
- Products catalog / Smart Docs / eSignatures
- Gantt view для internal projects
- Sales Assistant generic chat (Cmd+K + AI Hub достаточно)
- LeadBooster / Web Visitors / Campaigns
- Codex Sales Plugin
- WhatsApp integration (пока нет multichannel)
- Marketplace / 100+ integrations

---

## 11. Pipedrive vs HubSpot vs Attio — что брать от кого

| Паттерн | Лучший референс | Почему |
|---------|----------------|--------|
| Activity-based selling / rotting | **Pipedrive** | Основатель продукта = эта философия |
| Focus panel + next action | **Pipedrive** (у нас ✅) | DealFocusPanel = прямой перенос |
| Action inbox (unified queue) | **Мы** (Close-стиль) | Pipedrive — fragmented |
| Workflow engine | HubSpot (зрелее) + Pipedrive (проще) | Pipedrive — visual, меньше action types |
| Project templates | **Pipedrive** (май 2026) + HubSpot Projects | Оба подтверждают won → project |
| Stage enforcement | **Мы** | Hard DB gates > Pipedrive required fields |
| AI post-meeting HITL | HubSpot + Attio | Pipedrive Sales Assistant — read-only |
| Domain AI (SPIN, протокол) | **Мы** | Ни у кого нет |
| Deal scoring | **Мы** (native) | Pipedrive Scores — Premium+ |
| Data model flexibility | Attio | Pipedrive — фиксированные объекты |

---

## 12. Что сознательно НЕ копировать

- Activity-based selling как **единственная** философия (у нас B2B внедрения = project delivery тоже важен)
- Rotting **вместо** next_action (разные сигналы — нужны оба)
- Email-first CRM (sync inbox, group emailing, sequences)
- Products/Revenue catalog (КП и биллинг в 1С)
- Gantt/PSA на уровне Accelo (следующий бенчмарк #3)
- Tier-gated features как модель монетизации (внутренний инструмент)
- Marketplace ecosystem

---

## 13. Итоговый вывод

**Pipedrive — ближайший бенчмарк по механике сделки.** Волны 1–2 (`CRM-EVOLUTION-PLAN.md`) **закрыли 80% UX-gap**: next action, rotting, focus panel, TodayView (даже сильнее), reconnect, saved views, Cmd+K.

**Оставшиеся разрывы:**
1. **Workflow engine** (P1) — главный, как у HubSpot/Attio
2. **Project templates** (P2) — Pipedrive подтвердил паттерн в мае 2026
3. **Per-stage rotting** (P3) — дополнение к next_action rotting
4. **Smart Deal Progression** (P0) — Pipedrive AI пока слабее нас по потенциалу
5. **Notes + progress bar** (P4–P6) — низкий effort

**Конкурентные преимущества сохранять:**
- TodayView как единая action queue (сильнее Pipedrive)
- Stage gates (hard enforcement)
- Native deal health без Premium tier
- Vertical AI (SPIN, протокол)
- Next action rotting (явный шаг vs «давно не трогали»)

**Стратегия:** Pipedrive уже отработан по UX. Дальше брать у него **automations + project templates + per-stage rotting**, не перестраивать pipeline mechanics. Следующий бенчмарк по очереди — **Close** (углубить Smart Views / sequences) или **Accelo** (PSA/delivery).

---

## 14. Источники

### Pipedrive (официальные, спарсено 2026-07-12)

- [Activity-Based Selling](https://www.pipedrive.com/en/blog/activity-based-selling)
- [The Rotting feature](https://support.pipedrive.com/en/article/the-rotting-feature) (12.05.2026)
- [Activities](https://support.pipedrive.com/en/article/activities) (08.04.2026)
- [Pipeline view](https://support.pipedrive.com/en/article/pipeline-view) (09.04.2026)
- [Deal detail view / Focus](https://support.pipedrive.com/en/article/deal-detail-view) (20.03.2026)
- [Leads Inbox](https://support.pipedrive.com/en/article/leads-inbox) (26.02.2026)
- [Automations: first steps](https://support.pipedrive.com/en/article/workflow-automation) (06.08.2025)
- [Projects by Pipedrive](https://support.pipedrive.com/en/article/projects-by-pipedrive) (20.05.2026)
- [Projects: templates](https://support.pipedrive.com/en/article/projects-templates) (27.05.2026)
- [Scores](https://support.pipedrive.com/en/article/scores) (16.03.2026)
- [Required fields](https://support.pipedrive.com/en/article/required-fields) (08.07.2025)
- [Sales Assistant](https://support.pipedrive.com/en/article/sales-assistant) (05.01.2026)
- [New Pipedrive plans](https://support.pipedrive.com/en/article/new-pipedrive-plans) (04.11.2025)
- [Newsroom: Projects update](https://www.pipedrive.com/en/newsroom/pipedrive-bridges-the-sales-to-delivery-gap-with-new-project-management-and-messaging-tools) (26.05.2026)
- [Newsroom: Codex Sales Plugin](https://www.pipedrive.com/en/newsroom/pipedrive-to-be-included-in-openais-codex-sales-plugin-launch-bringing-crm-context-into-ai-powered-sales-workflows) (04.06.2026)

### Pricing (третьи стороны, март 2026)

- [emailtooltester.com — Pipedrive Pricing 2026](https://www.emailtooltester.com/en/crm/pipedrive-review/pricing/)

### dashboard-crm (репозиторий)

- `CRM-EVOLUTION-PLAN.md` — Pipedrive как бенчмарк механики сделки
- `CHANGES-waves-1-2.md` — реализованные паттерны W1a–W2d
- `src/lib/utils/deal-health.ts` — rotting + health scoring
- `src/components/projects/DealFocusPanel.tsx` — focus panel
- `src/components/today/TodayView.tsx` — action inbox
- `src/lib/hooks/use-automation-rules.ts` — S29 automation
- `src/lib/hooks/use-stage-requirements.ts` — stage gates