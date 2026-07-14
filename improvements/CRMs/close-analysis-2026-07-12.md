# Close CRM — комплексный анализ и инсайты для dashboard-crm

**Дата:** 2026-07-12  
**Метод:** парсинг help.close.com (KB, обновления до июля 2026), close.com/changelog, pricing, сопоставление с кодовой базой dashboard-crm.  
**Связанные документы:** `improvements/crm-benchmark-candidates-2026-07-12.md` (приоритет #2), `CRM-EVOLUTION-PLAN.md`, `CHANGES-waves-1-2.md`, `improvements/pipedrive-analysis-2026-07-12.md`, `improvements/hubspot-analysis-2026-07-12.md`, `improvements/attio-analysis-2026-07-12.md`.

---

## 0. Как читать этот документ

| Символ | Значение |
|--------|----------|
| ✅ | Паритет или сильная альтернатива |
| 🟡 | Частично / другая модель |
| ❌ | Нет |
| ➕ | Есть у нас, у Close нет «из коробки» или слабее |
| 🔒 | Требует платного tier Close |

**Контекст:** Close — **sales communication CRM** для outbound-команд (11,500+ businesses, 2B calls/emails). dashboard-crm — **вертикальная CRM** под продажи и внедрения маркировки (1С:ERP, Честный Знак). Close — **главный бенчмарк по action inbox и Smart Views**; TodayView (W1b) уже вдохновлён Close Inbox. Этот анализ закрывает оставшиеся gaps.

---

## 1. Close в 2026 — позиционирование и архитектура

### 1.1 Слоган и стратегия

Close позиционируется как **«CRM with everything your team needs to sell faster»** — calling, email, SMS, workflows + **Chloe** (AI sales agent). Не platform play, а **communication-first sales machine**.

Ключевые концепции (с [help.close.com](https://help.close.com), [changelog](https://close.com/changelog) 2026):

```
Communication-First Sales CRM
├── Inbox — единая очередь «что делать сейчас»
├── Smart Views — динамические saved searches (Leads / Contacts / Activities)
├── Workflows — multi-channel sequences (email · SMS · call · task)
├── Built-in Dialer — power / predictive + AI call summaries
└── Lead Page — центр: Lead → Contacts → Opportunities → Timeline

Поверх (2025–2026):
├── Chloe — AI agent (batch calling, workflows, enrich)
├── Activity Smart Views — фильтры по calls/emails/SMS/meetings (окт. 2025)
├── Call Tasks — auto-complete при звонке (март 2026)
├── Native Scheduling — Google Calendar booking (май 2026)
├── Column calculations в Smart Views (март 2026)
├── ChatGPT app + Codex plugin — CRM context в AI (апр.–июнь 2026)
└── Forms — native lead capture (янв. 2026)
```

**Главное отличие от Pipedrive:** Pipedrive = pipeline kanban + activity-based selling. Close = **Inbox + Smart Views как навигация**, pipeline (Opportunities) вторичен. Реп «работает из Inbox», не из kanban.

**Главное отличие от HubSpot/Attio:** Close заточен под **outbound phone/email**, не inbound marketing и не AI-native data model.

### 1.2 Масштаб (заявленный, 2026)

| Метрика | Значение |
|---------|----------|
| Клиенты | 11,500+ businesses |
| Активность | 2 billion calls, emails, meetings |
| G2 | 4.7 stars, 2000+ reviews |

### 1.3 Ценовая модель (2026)

| Plan | Annual | Monthly | Ключевое |
|------|--------|---------|----------|
| **Solo** | $9/seat | $19/seat | 1 user, 10k leads, **без Workflows** |
| **Essentials** | $35/seat | $49/seat | Inbox, forms, calling, SMS, **без Workflows** |
| **Growth** | $99/seat | $109/seat | 🔒 **Workflows**, power dialer, bulk email, Chloe in workflows |
| **Scale** | $139/seat | $149/seat | Predictive dialer, lead visibility, live coaching |

**AI credits:** 500–2000/user/mo по плану (Chloe, enrich, summaries). Telephony — отдельно.

**Инсайт:** Workflows (sequences) — с Growth ($99/seat). Inbox и Smart Views — на всех планах. Для команды 5 человек Growth = $495/mo. У нас inbox-паттерн и saved views — без tier.

---

## 2. Объектная модель Close

### 2.1 Lead-centric, не Deal-centric

| Объект | Назначение | Отличие от dashboard-crm |
|--------|------------|--------------------------|
| **Lead** | Компания/аккаунт (центр карточки) | 🟡 у нас `companies` + `projects(client)` раздельно |
| **Contact** | Люди внутри Lead | ✅ `contacts` |
| **Opportunity** | Сделка в pipeline (до 300 на Lead) | ✅ `projects(client)` + `pipeline_stages` |
| **Activities** | Calls, Emails, SMS, Meetings, Notes, Tasks | 🟡 у нас calls/meetings/tasks — три таблицы |
| **Custom Activities** | Свои шаблоны активности | 🔒 Growth+ |
| **Custom Objects** | 🔒 Scale | ➕ у нас — миграции Supabase |

**Ключевой паттерн:** один Lead → много Contacts → много Opportunities. Timeline на Lead page объединяет всё.

### 2.2 Inbox — эталон action queue

[Close Inbox KB](https://help.close.com/docs/inbox) (апрель 2026):

```
Inbox (три зоны)
├── Inbox — сейчас (due + overdue)
├── Done — завершённое
└── Future — snoozed + scheduled

Типы элементов в Inbox:
├── Inbound emails (+ follow-up reminders)
├── Missed calls / voicemails
├── Inbound SMS
├── Due / overdue Tasks (+ High Priority)
├── Opportunities на expected close date
├── Stalled opportunity reminders (Pipeline Guidance)
└── Potential Contacts (не в CRM, 30 дней)
```

**UX-паттерны Inbox (сент. 2025):**
- Фильтры: lead status, opportunity pipeline/stage, Smart View
- Context hover: status, opportunity value, **local time** контакта
- **Next Lead** — навигация по очереди без возврата в Inbox
- Bulk: mark all done / snooze all на Lead page
- Snooze → перенос в Future; Done → архив (email sync в Gmail)

> «Your sales team should be able to work exclusively from their Close inbox.»

### 2.3 Smart Views — навигация, не отчёты

[Smart Views](https://help.close.com/docs/search-and-smart-views) (окт. 2025), [Creating Smart Views](https://help.close.com/docs/creating-smart-views):

| Аспект | Close | dashboard-crm (W2c) |
|--------|-------|---------------------|
| Хранение | **Server-side**, динамический пересчёт | localStorage snapshot URL |
| Объекты | Leads, Contacts, **Activities** | projects, contacts, companies (URL filters) |
| Шаринг | Private / team / org | ❌ только локально |
| Sidebar | Pin to sidebar, drag reorder | Чипы на странице + CommandPalette |
| AI search | NL → filter («leads not contacted 20 days») | 🟡 CommandPalette — поиск, не NL filters |
| Column calc | Sum/avg/count в колонках (март 2026) | ❌ |
| Как workflow | **Smart Views вместо Tasks** для рутины | TodayView — hardcoded секции |

**Close Pro Tip (из KB Tasks):**
> «It's best to use **Smart Views instead of Tasks** when you are keeping track of communication workflows that are part of your routine follow-up process. Save Tasks for accomplishing unique actions.»

**Типичный день репа в Close:**
1. Smart View: новые лиды без касания
2. Smart View: follow-up после outreach без ответа
3. Smart View: cold leads → email cadence (Workflow)
4. Smart View: warm leads с Opportunity

### 2.4 Workflows — multi-channel sequences

[Workflows KB](https://help.close.com/docs/workflows) (июль 2026):

```
Trigger (manual / event: lead · contact · opportunity · call · meeting · form)
  → Step(s): email · SMS · call task · task · update lead/opportunity
  → Delays: 1 min – 365 days
  → Goals: incoming email/SMS/call, meeting booked, lead status change → STOP
  → Communication Window: Mon–Fri 9–16, contact timezone
  → Blackout Dates: holidays
  → Runs: once per contact / multiple
```

| Возможность | Close | dashboard-crm |
|-------------|-------|---------------|
| Multi-channel sequence | ✅ email + SMS + call + task | ❌ |
| Auto-stop on reply | ✅ Workflow Goals | ❌ |
| Email drafts for review | ✅ Inbox (дек. 2025) | ❌ |
| Opportunity stall trigger | ✅ (сент. 2025) | 🟡 rotting deals в TodayView |
| Run log + retry | ✅ Runs view | 🟡 `automation_runs` без UI |
| Tier | 🔒 Growth+ ($99/seat) | ➕ без tier (когда будет) |

### 2.5 Маппинг на dashboard-crm

| Close | dashboard-crm | Комментарий |
|-------|---------------|-------------|
| Inbox | ➕ `TodayView` (`/`) | **реализовано W1b**, другая модель данных |
| Smart Views | 🟡 `use-saved-views` (localStorage) | **главный gap** |
| Workflows | 🟡 S29: `stage_entered → create_task` | gap |
| Lead | `companies` + leads | 🟡 нет единого Lead object |
| Opportunity | `projects(client)` | ✅ |
| Built-in dialer | ❌ (ручные calls) | сознательно |
| Email/SMS sync | ❌ | вне домена B2B промышленных |
| Pipeline Guidance | 🟡 `getDealHealth()` + TodayView | частичный паритет |
| High Priority Tasks | ❌ | gap |
| Snooze / Done / Future | ❌ | gap |
| Next Lead navigation | 🟡 j/k в TodayView | частичный паритет |
| Activity Smart Views | ❌ | gap |
| Chloe / Lead Summaries | 🟡 AI Hub (нишевые пресеты) | другой фокус |

---

## 3. Inbox vs TodayView — детальное сравнение

### 3.1 Что уже перенесено (W1b + W2b + W2d)

По `CHANGES-waves-1-2.md` и `TodayView.tsx`:

| Close Inbox | dashboard-crm TodayView | Статус |
|-------------|-------------------------|--------|
| Единая очередь действий | ✅ секции с приоритетом | **реализовано** |
| Due tasks | ✅ lane=now, просроченные сверху | **реализовано** |
| Actionable rows | ✅ primary/secondary на строке | **реализовано** |
| Calls due/overdue | ✅ просроченные + сегодня | **реализовано** |
| Meetings today | ✅ | **реализовано** |
| Stale leads | ✅ stale new/contacted | **реализовано** |
| Rotting deals | ➕ секция «без шага» (Pipedrive+Close) | **реализовано** |
| Reconnect | ➕ «Остывают» (Clay/folk) | **реализовано W2b** |
| Keyboard nav | ✅ j/k, Enter, `d` — primary | **реализовано W2d** |
| Focus widget | ✅ `TodayFocus` | **реализовано** |

### 3.2 Что у Close есть, у нас нет

| Возможность | Close | Наш gap | Effort |
|-------------|-------|---------|--------|
| **Done / Future / Snooze** | ✅ triage model | Inbox items не переносятся в «позже» | ~0.3 спринта |
| **Inbound email/SMS** | ✅ core | ❌ нет email sync | вне домена |
| **Opportunity close date** | ✅ в Inbox + Future | 🟡 deadline на project, не в очереди | ~0.2 спринта |
| **Stalled opportunity** | ✅ Pipeline Guidance → Inbox | 🟡 rotting, не «застряла на стадии N дней» | P3 из pipedrive |
| **Context hover** | ✅ value, status, local time | 🟡 минимум в QueueRow | ~0.2 спринта |
| **Next item** без возврата | ✅ Next Lead | 🟡 j/k, но нет «следующий в очереди» CTA | ~0.2 спринта |
| **Bulk mark done** | ✅ на Lead page | ❌ | ~0.2 спринта |
| **High Priority tasks** | ✅ (сент. 2025) | ❌ | ~0.1 спринта |
| **Filter inbox by Smart View** | ✅ | ❌ (нет server Smart Views) | зависит от P1 |
| **Potential Contacts** | ✅ из email | ❌ | вне домена |

### 3.3 Где TodayView **сильнее** Close Inbox

| Возможность | Почему |
|-------------|--------|
| **Вертикальные секции** | Close — плоский список с табами; у нас — типизированные блоки (звонки / лиды / сделки / остывают) |
| **Reconnect по active deals** | Close — через Smart View filters; у нас — native `last_touch` + фильтр по активным сделкам |
| **Rotting deals** | Close — Pipeline Guidance; у нас — explicit `next_step` rotting |
| **Доменные действия** | «Запланировать шаг», convert lead — под наш процесс |
| **Без email-зависимости** | Inbox Close бесполезен без email sync; TodayView работает на calls/meetings/tasks |

---

## 4. Smart Views vs use-saved-views — главный разрыв

### 4.1 Close Smart Views (эталон)

- **Динамические:** лиды входят/выходят из view по условиям
- **Сложные фильтры:** AND/OR, email opens, call count, local time, custom fields
- **Activity Smart Views:** «звонки где transcript упомянул X» (окт. 2025)
- **AI Search:** natural language → filter
- **Shared:** команда видит одни views в sidebar
- **Column calculations:** sum/avg прямо в таблице (март 2026)
- **Workflow trigger:** bulk enroll leads from Smart View

### 4.2 Наш use-saved-views (W2c)

```typescript
// localStorage: route + query snapshot
{ id, label, route: '/deals', query: '?f=erp,active' }
```

- ✅ URL-persist filters (`useChipFilter`)
- ✅ Pin в CommandPalette + чипы на странице
- ❌ Не пересчитывается server-side («сделки без активности >7 дней»)
- ❌ Нет activity-based filters
- ❌ Нет шаринга между пользователями
- ❌ Нет NL search

**Инсайт:** Close Smart Views = **P5 из hubspot-analysis** + **P4 из attio-analysis** + **Activity filters**. Это **самый ценный gap** после workflow engine.

---

## 5. AI: Chloe vs AI Hub

| Close (2026) | dashboard-crm | Вердикт |
|--------------|---------------|---------|
| **Chloe** — AI sales agent, batch calling | ❌ | вне домена (нет dialer) |
| **Lead Summaries** | 🟡 | Gap (лёгкий пресет) |
| **Suggested Action** — stalled deals | 🟡 rotting + TodayView | частичный паритет |
| **AI Enrich** — contact/company fields | ❌ | вне домена |
| **Call transcript → summary** | ✅ `transcripts`, `ai_runs` | ➕ **сильнее в нише** |
| **SPIN / протокол / аналит. записка** | ➕ AI Hub | **уникально** |
| **ChatGPT / Codex plugin** | ❌ | отложить |
| **Credit-metered AI** | — | у нас без биллинга |

**Инсайт:** Close AI заточен под **outbound volume** (enrich, batch call, lead summary). Наш AI Hub — под **качество B2B-диалога** (SPIN, протокол внедрения). Не копировать Chloe; взять **Lead Summary** и **Suggested Action** как лёгкие пресеты.

---

## 6. Gap-матрица: dashboard-crm vs Close

### 6.1 Где dashboard-crm **сильнее** Close

| Возможность | Почему |
|-------------|--------|
| **TodayView без email sync** | Работает на звонках/встречах; Close Inbox пуст без inbox integration |
| **Vertical AI** (SPIN, протокол) | Close — generic Chloe |
| **Stage gates** (hard DB enforcement) | Close — нет blocking stage transitions |
| **Project-centric delivery** | Close — нет Projects/delivery вообще |
| **Reconnect по active deals** | Native, не Smart View workaround |
| **Next action rotting** | Explicit next_step; Close — Pipeline Guidance |
| **Multi-tenant RLS** | Close — org-level |
| **Peek panel** (W2d) | Close — Lead page navigation |
| **9 themes** | Close — single design |

### 6.2 Inbox / Action queue

| Возможность | Close | dashboard-crm | Gap |
|-------------|-------|---------------|-----|
| Unified action inbox | ✅ Inbox | ➕ TodayView | **паритет+** |
| Snooze / Future | ✅ | ❌ | gap |
| Done archive | ✅ | 🟡 mark done, нет архива | gap |
| Email/SMS in queue | ✅ | ❌ | вне домена |
| High priority tasks | ✅ | ❌ | gap |
| Context hover | ✅ | 🟡 | gap |
| Next in queue | ✅ Next Lead | 🟡 j/k | частично |
| Keyboard shortcuts | ✅ | ➕ j/k, Cmd+K | паритет |

### 6.3 Smart Views / Filters

| Возможность | Close | dashboard-crm | Gap |
|-------------|-------|---------------|-----|
| Server-side dynamic views | ✅ | ❌ localStorage | **главный gap** |
| Activity Smart Views | ✅ | ❌ | gap |
| AI NL search | ✅ | ❌ | отложить |
| Team sharing | ✅ | ❌ | gap |
| Column calculations | ✅ | ❌ | отложить |
| Bulk workflow from view | ✅ | ❌ | зависит от workflow |

### 6.4 Automation / Communication

| Возможность | Close | dashboard-crm | Gap |
|-------------|-------|---------------|-----|
| Multi-channel Workflows | ✅ Growth+ | 🟡 S29 1×1 | **главный разрыв** |
| Built-in dialer | ✅ | ❌ | вне домена |
| Email sequences | ✅ | ❌ | нужен email |
| SMS sequences | ✅ | ❌ | вне домена |
| Workflow Goals (stop on reply) | ✅ | ❌ | gap |
| Forms lead capture | ✅ all plans | ❌ | опционально |

### 6.5 CRM core

| Возможность | Close | dashboard-crm | Gap |
|-------------|-------|---------------|-----|
| Opportunities pipeline | ✅ | ✅ PipelineBoard | паритет |
| Lead → Opportunity | ✅ | ✅ lead convert + project | паритет |
| Timeline + filters | ✅ | 🟡 EntityTimeline без filters | gap |
| Notes in timeline | ✅ | ❌ | gap (P3) |
| Custom fields | ✅ 250 | ➕ миграции | мы гибче |
| Native scheduling | ✅ май 2026 | ❌ | отложить |

---

## 7. Архитектурное сравнение

```
Close                               dashboard-crm
─────                               ───────────────
Lead (account hub)                  companies + projects(client)
Opportunities (pipeline)            projects(client) + pipeline_stages
Inbox (email·call·SMS·task)         TodayView (call·task·deal·reconnect)
Smart Views (server dynamic)        use-saved-views (localStorage)
Workflows (multi-channel)           automation_rules (1×1)
Built-in dialer + SMS               manual calls table
Tasks for unique actions            tasks + next_step on deal
Smart Views for routine follow-up   TodayView hardcoded sections
```

---

## 8. Что уже реализовано из Close (волны 1–2)

| Close-паттерн | Спринт | Статус |
|---------------|--------|--------|
| Action Inbox как стартовый экран | W1b | ✅ TodayView на `/` |
| Actionable queue rows | W1b | ✅ QueueRow primary/secondary |
| Saved views как навигация | W2c | 🟡 localStorage, не server dynamic |
| Smart Views в CommandPalette | W2a+W2c | 🟡 секция «Виды» |
| Keyboard through queue | W2d | ✅ j/k/Enter/d |
| Reconnect в очереди | W2b | ✅ «Остывают» |

**Вывод:** **Inbox-концепция закрыта** на уровне UX. Главные оставшиеся gaps Close — **server-side Smart Views** и **Workflows/sequences** (последнее — только с email-контуром).

---

## 9. Приоритеты для dashboard-crm

Отфильтровано под домен маркировки + B2B-внедрения (не outbound call center). Пересечения с pipedrive/hubspot/attio отмечены.

### P0 — Server-side Smart Views / segments (~0.5–0.7 спринта)

**Референс Close:** динамические Smart Views — «лиды без касания 14 дней», «ждёт КП», «ERP», «маркировка».

Эволюция `use-saved-views`:
- Таблица `segments` (org_id, name, entity_type, filter_json, shared)
- Server-side пересчёт: «client projects без activity > N дней»
- Pin в sidebar + CommandPalette (как сейчас, но query из БД)
- Пресеты: «Тихо >14 дней», «Без next_step», «ЧЗ», «ERP»

*Также hubspot P5, attio P4, pipedrive — косвенно.*

### P1 — TodayView triage: Snooze + Done (~0.3 спринта)

**Референс Close:** Inbox / Done / Future + snooze.

- Snooze строки → скрыть до даты (localStorage или `inbox_snoozes` table)
- «Отложить на завтра» уже есть на звонках — обобщить на все типы
- Секция «Отложено» (Future) в TodayView
- Опционально: «Скрытые сегодня» (Done) с undo

### P2 — Context-rich queue rows (~0.2 спринта)

**Референс Close:** inbox hover — status, value, overdue days.

Расширить `QueueRow`:
- Сделка: стадия, budget, дней без касания
- Контакт: компания, last_touch
- Лид: источник, дней в статусе

### P3 — High Priority tasks (~0.1 спринта)

**Референс Close:** High Priority flag (сент. 2025).

- `tasks.priority: normal | high`
- В TodayView — high сверху в секции задач
- Визуальный маркер в task board

### P4 — «Следующий в очереди» CTA (~0.2 спринта)

**Референс Close:** Next Lead button.

- После primary action на строке → автофокус на следующую
- Кнопка «Следующий» в шапке TodayView
- Счётчик «осталось N» (частично есть через total)

### P5 — Activity-based segment filters (~0.3 спринта)

**Референс Close:** Activity Smart Views (окт. 2025).

Без полного Activity Smart View — добавить в segments:
- «Контакты без звонка > 21 день» (через calls join)
- «Сделки без встречи на стадии X»
- «Звонки без follow-up task»

### P6 — Generic Workflow Engine (~1.5–2 спринта)

**Референс Close:** Workflows с Goals, delays, communication window.

MVP без email/SMS:
- Триггеры + conditions + delays
- Действия: create_task, set_field, notify, create_internal_project
- Goal: `task_completed` / `field_changed` → stop run
- Run log UI на `automation_runs`

*Также hubspot P1, attio P1, pipedrive P1. Email sequences — только после email-контура.*

### P7 — Lead Summary preset (~0.2 спринта)

**Референс Close:** Lead Summaries (Growth+).

AI Hub preset «Что по сделке X?» — summary из EntityTimeline перед звонком.

*Связано с hubspot/attio P0 Smart Deal Progression — другой угол.*

### P8 — Notes в EntityTimeline (~0.2 спринта)

*Общий P3 из hubspot/attio/pipedrive.*

### Отложить

- Built-in dialer / power dialer / predictive dialer
- Email/SMS sync и sequences
- Chloe / batch calling / AI Enrich
- Potential Contacts из email
- Forms (если нет inbound web leads)
- Custom Objects (Scale)
- Column calculations в таблицах
- Native scheduling (до calendar integration)
- ChatGPT/Codex plugin

---

## 10. Close vs Pipedrive vs HubSpot — что брать от кого

| Паттерн | Лучший референс | Почему |
|---------|----------------|--------|
| Action inbox | **Close** (у нас ✅ TodayView) | Close — эталон; мы адаптировали |
| Smart Views (dynamic) | **Close** | Самые зрелые saved searches + Activity views |
| Pipeline / rotting | **Pipedrive** | Kanban + per-stage rotting |
| Workflow sequences | **Close** (outbound) + HubSpot (broad) | Close — multi-channel + Goals |
| AI post-meeting HITL | HubSpot + Attio | Close — read summaries, не HITL update |
| Project delivery | HubSpot + Pipedrive Projects | Close — нет delivery |
| Stage enforcement | **Мы** | Ни у кого нет hard gates |
| Domain AI | **Мы** | SPIN, протокол |

---

## 11. Что сознательно НЕ копировать

- Communication-first stack (dialer, SMS, email sync как primary data)
- Outbound call center workflows (power/predictive dialer, batch calling)
- Lead-centric object model (у нас companies + projects работают)
- Smart Views **вместо** TodayView секций (у нас гибрид лучше для вертикали)
- Credit-metered Chloe
- Tier-gated Workflows как модель монетизации
- Potential Contacts / email-first inbox

---

## 12. Итоговый вывод

**Close — ближайший бенчмарк по action inbox и Smart Views.** TodayView (W1b) **уже реализует дух Close Inbox**, адаптированный под B2B-внедрения без email sync. Это **конкурентное преимущество** — Inbox Close бесполезен без подключённого email.

**Оставшиеся разрывы:**
1. **Server-side Smart Views** (P0) — главный уникальный gap Close
2. **TodayView triage** Snooze/Done/Future (P1) — polish inbox UX
3. **Workflow engine** (P6) — общий с HubSpot/Attio/Pipedrive; sequences — после email
4. **Context rows + priority tasks** (P2–P4) — низкий effort, высокий parity

**Конкурентные преимущества сохранять:**
- TodayView с доменными секциями (rotting, reconnect, stale leads)
- Работа без email/dialer интеграции
- Vertical AI (SPIN, протокол)
- Stage gates + project delivery

**Стратегия:** Close уже отработан по Inbox. Дальше — **server-side segments (Smart Views)** и **inbox triage polish**. Следующий бенчмарк по очереди — **Accelo** (#3, PSA/delivery) или **Clay** (#4, relationship intelligence).

---

## 13. Источники

### Close (официальные, спарсено 2026-07-12)

- [Inbox](https://help.close.com/docs/inbox) (08.04.2026)
- [Smart Views / Lead Filtering](https://help.close.com/docs/search-and-smart-views) (17.10.2025)
- [Create a Smart View](https://help.close.com/docs/creating-smart-views) (17.10.2025)
- [Tasks](https://help.close.com/docs/tasks) (22.09.2025)
- [Workflows](https://help.close.com/docs/workflows) (10.07.2026)
- [Multi-channel sales workflow](https://help.close.com/docs/creating-a-multi-channel-sales-workflow-in-close)
- [Plans and Billing](https://help.close.com/docs/plans-and-billing) (10.06.2025)
- [Communication features](https://close.com/communication)
- [Pricing](https://close.com/pricing) (2026)
- [Changelog](https://close.com/changelog) — Call Tasks (18.03.2026), Native Scheduling (07.05.2026), Column calculations (06.03.2026), Activity Smart Views (17.10.2025), Inbox improvements (05.09.2025), Forms (16.01.2026), ChatGPT app (30.04.2026)

### dashboard-crm (репозиторий)

- `CRM-EVOLUTION-PLAN.md` — Close Inbox + Smart Views как бенчмарк
- `CHANGES-waves-1-2.md` — W1b TodayView, W2c saved views
- `src/components/today/TodayView.tsx` — action inbox
- `src/lib/hooks/use-saved-views.ts` — localStorage views
- `improvements/pipedrive-analysis-2026-07-12.md` — пересекающиеся приоритеты