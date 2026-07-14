# HubSpot ↔ dashboard-crm: карта возможностей и gap-анализ (v2.1)

**Дата:** 2026-07-10  
**Верификация:** сверено с живой схемой Supabase (миграции **001–034**, ref `uoiavcabxgdjugzryrmj`), `docs/schema.md`, исходниками `src/`.  
**Метод:** двустороннее сравнение — не только «чего нет у нас», но и «где мы сильнее / иначе устроены».

Предыдущая версия: `_analysis/hubspot-map-and-gap.md` (v1, устарела). Эта v2 исправляет упрощения v1 (Notes, Forecasting, Deals/Projects, несуществующий sync-слой) и добавляет tier-ограничения HubSpot.

**v2.1 (Claude cross-check по коду):** подтверждены правки v2 (Notes 🟡, weighted forecast 🟡, отсутствие sync-слоя, Deals+Projects схлопнуты). Исправлены две переоценки самой v2: Excel-импорт (у HubSpot он тоже есть — не наше преимущество) и Cmd+K (у HubSpot есть командный бар «Find or Ask» — не ❌).

---

## 0. Как читать этот документ

| Символ | Значение |
|--------|----------|
| ✅ | Паритет или сильная альтернатива |
| 🟡 | Частично / другая модель |
| ❌ | Нет |
| ➕ | Есть у нас, у HubSpot нет «из коробки» или слабее |
| 🔒 | Требует платного tier HubSpot |

**Важно:** HubSpot — горизонтальная CRM для inbound-маркетинга + sales + service. dashboard-crm — **вертикальная CRM** под продажи и внедрения маркировки (1С:ERP, Честный Знак). Gap-анализ фильтрует рекомендации под этот домен.

---

## 1. HubSpot — структура продукта (проверенная карта)

### 1.1 Архитектура

```
                 ┌─────────────── Breeze AI (слой поверх всего) ───────────────┐
   Marketing  ·  Sales  ·  Service  ·  Content  ·  Data  ·  Commerce   ← 6 Hub'ов
                 └──────────────── Smart CRM (единое ядро: объекты · свойства · связи) ─┘
```

Ключевая идея HubSpot: все Hub'ы пишут в **один граф объектов**. Сделка, контакт, тикет, email — одна запись, одна timeline.

### 1.2 Объектная модель Smart CRM

| Объект HubSpot | Назначение | Tier / активация |
|----------------|------------|------------------|
| Contacts | люди | все планы |
| Companies | компании | все планы |
| Deals | сделки в sales pipeline | все планы |
| Leads | квалификация до сделки | 🔒 Sales Pro+ |
| Tickets | support / help desk | Service (help desk — Pro+) |
| Tasks | to-do, очереди | все планы |
| Calls / Meetings | активности | Meetings scheduler — 🔒 Sales/Service Pro+ |
| Notes | отдельный activity-объект | все планы |
| Communications | SMS, WhatsApp, LinkedIn, почта | SMS — 🔒 Marketing Pro+ |
| Products / Quotes / Line items | каталог, КП | Quotes — Commerce |
| Invoices / Subscriptions / Orders / Carts | биллинг | Commerce |
| **Projects** | project management: pipeline + type + status | Super Admin activation |
| Marketing events / Campaigns | кампании, вебинары | Marketing |
| Services / Appointments / Courses / Listings | нишевые | Super Admin activation |
| Custom Objects | свои объекты | 🔒 Enterprise |

Источник: [Understand objects](https://knowledge.hubspot.com/records/understand-objects) (обновлено 16.06.2026).

### 1.3 Hub'ы — что решают

| Hub | Задача | Релевантность для dashboard-crm |
|-----|--------|--------------------------------|
| **Marketing** | лидоген, email-кампании, формы, ads, attribution | ❌ вне домена (интересен только вход лида) |
| **Sales** | pipeline, sequences, playbooks, quotes, forecasting, lead scoring, meeting scheduler | 🟡 **самый релевантный** — берём паттерны, не весь Hub |
| **Service** | tickets, KB, inbox, SLA, NPS/CSAT | 🟡 точечно — поток вопросов на внедрении |
| **Content** | CMS, сайт, блог, персонализация | ❌ вне домена |
| **Data** (ex-Operations) | sync, data quality, programmable automation, Data Studio | 🟡 идея «слоя синка» — да; Snowflake-коннекторы — нет |
| **Commerce** | quotes, invoicing, Stripe, subscriptions | 🟡 только quotes как объект; биллинг в 1С |

### 1.4 Платформенный слой HubSpot

**Workflows** — ядро автоматизации. Категории действий: Delays, Branches, CRM actions, Communication, AI actions, Marketing, Data ops (JS + webhooks), Connected apps. Триггеры: изменение свойства, список/сегмент, форма, дата, webhook, ручной enroll. Отдельно — **pipeline automations** на стадию.

**Прочее:** Properties (кастомные поля), Associations (типизированные M:N), Pipelines & stages, Lists/Segments (active + static), Reporting builder, Permissions/Teams, единая timeline на карточке.

**Breeze AI (2025–26):** Copilot, автономные Agents (Prospecting, Customer, Content, Data), Intelligence (enrichment, predictive scoring). INBOUND 2025: Data Hub rename, 20+ Agents, Marketplace, «The Loop» playbook.

---

## 2. dashboard-crm — текущее состояние (верифицировано)

### 2.1 Архитектурное отличие от HubSpot (критично для gap)

| Аспект | HubSpot | dashboard-crm |
|--------|---------|---------------|
| Deals vs Projects | **два разных объекта** | **одна таблица `projects`** с `type: client \| internal` |
| client-проект | = Deal (воронка, budget, gates) | `type='client'` + pipeline_id/stage_id/direction NOT NULL |
| internal-проект | ≈ Projects object | `type='internal'` + project_columns (канбан задач) |
| Кастомные объекты | Enterprise, UI-конфиг | миграции Supabase = бесплатная эволюция схемы |
| Мультитенантность | порталы / seats | `organizations` + `memberships` + RLS |

**Вывод:** маппинг `Deals → projects(client)` и `Projects → projects(internal)` — рабочий, но это **схлопывание двух HubSpot-сущностей в одну**. Это сила (меньше дублирования) и ограничение (нельзя 1:1 копировать HubSpot UX для deals и projects раздельно).

### 2.2 Объектная модель CRM

| Сущность CRM | Таблица / модуль | Аналог HubSpot | Статус |
|--------------|------------------|----------------|--------|
| Контакты | `contacts` | Contacts | ✅ |
| Компании | `companies` | Companies | ✅ |
| Связь M:N | `contact_company` (role, is_primary) | Associations | ✅ (через миграции, не UI-конфиг) |
| Сделки | `projects` WHERE `type='client'` | Deals | ✅ |
| Лиды | `leads` + `convert_lead()` RPC | Leads | ✅ (без отдельного prospecting workspace) |
| Проекты внедрения | `projects` WHERE `type='internal'` + `project_columns` | Projects | ✅ PCT-1 (032–034) |
| Задачи | `tasks` (+ личный борд lane; проектный — column_id) | Tasks | ✅ |
| Звонки | `calls` | Calls | ✅ |
| Встречи | `meetings` + `meeting_attendees` | Meetings | ✅ (без публичного scheduler) |
| Активности (legacy) | `activities` (enum: note, email, stage_change…) | Notes / Emails | 🟡 таблица есть, **не в EntityTimeline** |
| Аудит | `activity_log` (delete/stage events) | System events | ✅ |
| Файлы на сделке | `project_files` + Storage | Attachments | ✅ |
| Тикеты | — | Tickets | ❌ |
| Quotes / Products | — | Commerce | ❌ (КП — skill kp-master, вне CRM) |
| Команда | `memberships`, `invitations` | Teams | ✅ |
| Уведомления | `notifications` (task/project assigned) | In-app alerts | ✅ |
| AI | `transcripts`, `ai_runs`, Edge `ai-run` | Breeze | 🟡 нишевый (3 пресета под домен) |

**Миграции:** 001–034. Ключевые спринты: S27 gates, S29 automation v1, S-AI-1 AI Hub, PCT-1 project boards.

### 2.3 Платформенный слой CRM

| Возможность | Реализация | Статус |
|-------------|------------|--------|
| Пайплайны + стадии + probability | `pipelines`, `pipeline_stages` | ✅ |
| Стадийные гейты | `stage_requirements` + `check_stage_requirements()` + `trg_aa_enforce_stage_gate` | ➕ **уникально** — HubSpot pipeline automation не блокирует переход |
| Автоматизация v1 | `automation_rules` / `automation_runs`; trigger `stage_entered` → action `create_task` | 🟡 узко (S29) |
| Timeline | `EntityTimeline` + `use-entity-timeline` | 🟡 см. §2.4 |
| Saved views | `use-saved-views` (localStorage + URL query snapshot), W2c | 🟡 не server-side, не dynamic segments |
| Права | RLS + `current_org_role()` + ownership | ✅ |
| Дашборды | `DashboardHome` (/overview), `Charts` (/analytics) | 🟡 фиксированные виджеты, без report builder |
| Forecasting | weighted forecast в `PipelineBoard` (Σ budget × stage probability) | 🟡 без quota/team forecast |
| Deal health / rotting | `deal-health.ts`, `next_action_date`, индикаторы в карточках | ➕ Pipedrive-паттерн |
| Action inbox | `TodayView` (/) — очередь звонков, задач, сделок, встреч, остывающих | ➕ Close-паттерн |
| Reconnect | `use-last-touch`, порог в `reconnect` constants | ➕ |
| Keyboard / Cmd+K | `CommandPalette`, `use-keyboard-nav` | ➕ |
| Realtime | `use-realtime` → React Query invalidation | ✅ |
| Интеграции 1С/ЧЗ | — | ❌ (в репозитории **нет** `external_providers` / `sync_jobs`) |

### 2.4 EntityTimeline — точная спецификация

Источники в ленте (`use-entity-timeline.ts`):

| Источник | Всегда | Условие |
|----------|--------|---------|
| calls | ✅ | `.eq(contact_id \| company_id \| project_id)` |
| meetings | ✅ | то же |
| tasks | ✅ | то же |
| projects (связанные) | ✅ | для contact/company; пропуск для project-хаба |
| activity_log | только `includeSystem: true` | транзитивно через project_ids |
| ai_runs | только `includeSystem: true` | через call/meeting ids сущности |

**По умолчанию:** `includeSystem: false` на contact/company hub; `includeSystem: true` на `ProjectDetail`.

**Что НЕ в timeline:**
- standalone Notes (`activities.type='note'`) — таблица есть, UI-ленты нет;
- email / SMS / multichannel;
- поля `notes` на contact/company (это атрибуты, не activity).

**Вердикт vs HubSpot Notes:** 🟡, не ✅.

### 2.5 AI Hub (S-AI-1) — точная спецификация

| Компонент | Детали |
|-----------|--------|
| Сущности | `transcripts` (1→N прогонов), `ai_runs` (status, result jsonb, tokens, rating) |
| Edge Function | `ai-run` — generic, async |
| Пресеты | `meeting_protocol`, `analytic_note`, `spin_review` |
| UX | «AI предлагает — юзер подтверждает» (`AiWorkspaceModal`) |
| Отличие от Breeze | доменные пресеты (протокол, аналитическая записка, SPIN), не generic SDR-агент |

---

## 3. Двусторонняя gap-матрица

### 3.1 Ядро CRM

| Возможность | HubSpot | dashboard-crm | Gap / комментарий |
|-------------|---------|---------------|-------------------|
| Единый граф + timeline | ✅ Smart CRM | ✅ Supabase + EntityTimeline | 🟡 timeline уже, но без Notes/multichannel |
| Contacts / Companies | ✅ | ✅ | паритет |
| Deals | ✅ отдельный объект | ✅ `projects(client)` | 🟡 архитектурное схлопывание |
| Leads | 🔒 Sales Pro+ | ✅ + convert_lead RPC | ➕ без tier-ограничения |
| Projects (PM) | Super Admin activation | ✅ PCT-1 internal + columns | ➕ project-centric tasks — сильнее для внедрений |
| Tasks | ✅ + task queues | ✅ личный + проектный борд | паритет+ |
| Calls / Meetings | ✅ | ✅ | 🟡 без встроенного dialer/scheduler |
| Notes как activity | ✅ | ❌ в timeline | gap |
| Multichannel comms | ✅ Communications | ❌ | gap (план: Telegram/Email) |
| Tickets / SLA / KB | ✅ Service Hub | ❌ | gap (опционально) |
| Quotes / Products | ✅ Commerce | ❌ | gap (КП вне CRM) |
| Custom objects | 🔒 Enterprise | ➕ миграции | ➕ гибче и бесплатно |
| Файлы на сделке | ✅ | ✅ project_files | паритет |
| Команда / приглашения | ✅ | ✅ memberships + invitations | паритет |
| In-app notifications | ✅ | ✅ task/project assigned | 🟡 узкий набор типов |

### 3.2 Sales-автоматизация и процесс

| Возможность | HubSpot | dashboard-crm | Gap |
|-------------|---------|---------------|-----|
| Workflow engine | ✅ визуальный конструктор | 🟡 S29: 1 trigger × 1 action | **главный разрыв** |
| Pipeline stage automations | ✅ (не блокирующие) | 🟡 S29 create_task | разрыв |
| Stage **gates** (блокировка перехода) | 🟡 через required properties | ➕ S27 enforcement | **мы сильнее** |
| Sequences (email cadences) | 🔒 Sales Pro+ | ❌ | gap, нужен email-контур |
| Playbooks (sales scripts) | 🔒 Sales Pro+ | ❌ | gap; наш аналог — **шаблоны внедрения** (PCT P3) |
| Lead scoring | ✅ (+ predictive в Intelligence) | ❌ | gap; ложится на workflow P1 |
| Meeting scheduler (публичная ссылка) | 🔒 Pro+ | ❌ | отложить до Calendar |
| Forecasting | 🔒 Forecast tool (team quotas) | 🟡 weighted в PipelineBoard | частичный паритет |
| ABM / target accounts | ✅ | ❌ | вне домена |

### 3.3 Аналитика, сегментация, UX

| Возможность | HubSpot | dashboard-crm | Gap |
|-------------|---------|---------------|-----|
| Report builder | ✅ | ❌ | gap |
| Fixed dashboards | ✅ | ✅ overview + analytics | паритет для малой команды |
| Lists / dynamic segments | ✅ active lists | 🟡 saved views (localStorage) | gap: нет пересчёта |
| Deal rotting / next action | 🟡 (через workflows) | ➕ W1a native | **мы сильнее** |
| Action inbox «Сегодня» | 🟡 (tasks hub) | ➕ TodayView | **мы сильнее** |
| Reconnect / cooling contacts | 🟡 (через lists) | ➕ last_touch + Today | **мы сильнее** |
| Cmd+K / командный бар | 🟡 «Find or Ask» (глоб. поиск + AI) | ➕ полная палитра | богаче, но у HubSpot не ❌ |
| 9 тем оформления | ❌ | ➕ theme system | косметика, но есть |

### 3.4 AI

| Возможность | HubSpot | dashboard-crm | Gap |
|-------------|---------|---------------|-----|
| Copilot (generic) | ✅ Breeze | 🟡 AI Hub на звонках/встречах | разный фокус |
| Автономные Agents (SDR, Customer…) | ✅ 20+ (INBOUND 2025) | ❌ | сознательно не копируем |
| Call/meeting summary | ✅ | ✅ ai-summarize (028) + presets | паритет по звонкам |
| SPIN / протокол / аналит. записка | ❌ generic | ➕ 3 доменных пресета | **мы сильнее в нише** |
| Predictive lead scoring | ✅ Intelligence | ❌ | gap |

### 3.5 Data / интеграции

| Возможность | HubSpot | dashboard-crm | Gap |
|-------------|---------|---------------|-----|
| Data sync / ETL (100+ apps) | ✅ Data Hub | ❌ | будущий контур 1С/ЧЗ |
| Webhooks из workflows | ✅ | ❌ | часть P1 workflow |
| Programmable automation (JS) | ✅ | ❌ | не приоритет |
| Импорт CSV/Excel | ✅ core-фича | ✅ ExcelImport.tsx | паритет |

---

## 4. Исправления относительно v1

| Утверждение v1 | Факт v2 |
|----------------|---------|
| «Заметки в timeline ✅» | 🟡 только notes внутри meetings; standalone Notes нет |
| «Forecasting ❌» | 🟡 weighted forecast в PipelineBoard |
| «external_providers/sync_jobs в концепте» | **не найдено** в репозитории — убрано |
| Playbooks = шаблоны внедрения | разные сущности HubSpot; наш P3 — project templates |
| Deals = projects | верно как маппинг, но не 1:1 (схлопывание Deals+Projects) |
| Saved views = «просто фильтры UI» | W2c реализован: localStorage + named views + Cmd+K |

---

## 5. Приоритеты для dashboard-crm

Отфильтровано под домен (продажи маркировки + внедрения 1С/ЧЗ) и стек Next.js + Supabase.

### P1 — Generic Workflow Engine (главный разрыв)

**Сейчас (S29):** hardcoded `stage_entered → create_task`; таблицы `automation_rules` / `automation_runs` уже есть.

**MVP-ядро (не весь HubSpot):**
- Триггеры: `stage_entered` (есть) + `field_changed`, `task_overdue`, `deadline_approaching`, `record_created`, `time_based`;
- Действия: `create_task` (есть) + `set_field`, `notify`, `create_activity`, `webhook`;
- Условия: JSONB-предикат на правиле (без visual canvas на старте);
- Задержки: обобщить `due_in_days` → таблица отложенных jobs + pg_cron.

**Effort:** ~1.5–2 спринта. Фундамент S29 есть — эволюция, не с нуля.

### P2 — Шаблоны проектов внедрения (PCT-1 P3)

**HubSpot-референс:** Projects object + task templates (не sales Playbooks).

**Что взять:** тип internal-проекта → авто-генерация `project_columns` + типовых `tasks` (Обследование / Настройка / Тест / ОЭ).

**Effort:** ~0.7 спринта поверх PCT-1.

### P3 — Quotes как объект сделки (лёгкий)

Привязать КП (kp-master) к `projects(client)`: статус, сумма, дата отправки/принятия. Без Commerce Hub.

**Effort:** ~0.5 спринта.

### P4 — Лёгкий тикетный контур (опционально)

Только если реально теряются вопросы клиентов на внедрении: объект «инцидент/вопрос» на internal-проекте + SLA-таймер. Не полный Service Hub.

**Effort:** ~1 спринт. **Go/no-go:** болит ли сейчас?

### P5 — Динамические сегменты

Эволюция saved views: server-side `segments` с пересчётом («сделки без активности >7 дней»).

**Effort:** ~0.5 спринта.

### P6 — Подключить `activities` к timeline

Низкий effort, закрывает gap с HubSpot Notes без новой таблицы.

**Effort:** ~0.2 спринта.

### Отложить

- Sequences / email-маркетинг;
- Meeting scheduler (до Calendar-интеграции);
- Report builder (пока команда мала);
- Breeze Agents / автономный SDR;
- Commerce / Stripe;
- Data Hub / Snowflake sync.

---

## 6. Что сознательно НЕ копировать

- Marketing Hub целиком;
- Content Hub (CMS);
- Commerce / платежи (биллинг в 1С);
- 20+ Breeze Agents;
- Marketing events, Campaigns, Courses, Listings;
- Generic «HubSpot для бедных» — строим **вертикальную CRM под маркировку**.

---

## 7. Вывод

**Ядро CRM** (объекты, timeline, пайплайны, права, AI-ниша, PCT-1, stage gates, Today/reconnect) — на уровне или **сильнее** HubSpot в вашем домене. Кастомная схема через миграции гибче Enterprise custom objects.

**Главный разрыв** — workflow-движок: у HubSpot визуальный конструктор на весь граф, у нас S29 с одним правилом. Это P1 и он ложится на `automation_rules`.

**Второй по ценности** — шаблоны внедрения (PCT P3), подтверждённые паттерном HubSpot Projects, но реализуемые как project templates, не sales playbooks.

**Третий** — quotes в CRM и (опционально) лёгкие тикеты.

Стратегия: брать у HubSpot **паттерны автоматизации и проектного исполнения**, не маркетингово-контентную обвязку. Сохранять **вертикальную специализацию** (гейты, SPIN, протоколы, маркировочные воронки) как конкурентное преимущество.

---

## 8. Источники

**HubSpot (официальные):**
- [Understand objects](https://knowledge.hubspot.com/records/understand-objects)
- [Projects object](https://knowledge.hubspot.com/records/understand-and-use-projects-object)
- [Workflow actions](https://knowledge.hubspot.com/workflows/choose-your-workflow-actions)
- [Product catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog)
- [Custom objects](https://knowledge.hubspot.com/object-settings/create-custom-objects)

**dashboard-crm (репозиторий):**
- `docs/schema.md` — схема 001–034
- `supabase/migrations/027_stage_gates.sql`, `029_automation.sql`, `032_project_boards.sql`
- `src/lib/hooks/use-entity-timeline.ts`, `use-saved-views.ts`, `use-automation-rules.ts`
- `src/components/projects/PipelineBoard.tsx` (weighted forecast)
- `src/components/today/TodayView.tsx`, `src/lib/utils/deal-health.ts`
- `concept-project-centric-tasks.md` (P3 шаблоны)

**Контекст рынка:**
- [INBOUND 2025 — Data Hub, Breeze Agents](https://www.cmswire.com/digital-marketing/hubspot-unveils-data-hub-breeze-agents-and-the-loop-at-inbound-2025/)