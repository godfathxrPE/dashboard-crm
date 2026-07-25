# Архитектура: task-аналитика (gap №1 vs западные CRM)

_2026-07-23. D3, /architect. Разведка: crm-architect schema.md + живая БД (Supabase MCP)._

## Разведка (факты, определяющие дизайн)
1. **Нет времени завершения.** `tasks` НЕ имеет `completed_at`/`done_at`/`closed_at`. Статус — enum
   `lane` (now/next/wait/**done**). `updated_at` меняется на любом редактировании, не только на
   завершении → как proxy завершения слаб.
2. **`lane` для проектных задач деривативен** от `column_id` (пишет `trg_aa_resolve_board`, 032);
   для задач без проекта — истина. Любая задача имеет заполненный `lane` → ключевать метрики по нему
   можно, но триггер-стемп должен читать УЖЕ разрешённый lane (см. ordering в миграции).
3. **Серверной аналитики нет вообще.** 0 views, 0 RPC (`stat/kpi/dashboard/report/metric/analyt`).
   Единственная похожая функция — `stamp_quote_status` (не аналитика). Текущий `['dashboard-stats']`
   React-Query-ключ считается client-side. → серверные агрегаты — greenfield.
4. **История завершений частично есть, но без task_id.** `activity_log` (event-driven: `event_type`
   + `payload` jsonb + `user_id` + `created_at`) содержит **`task_completed` — 57 событий** и
   `task_created` — 5. НО payload у task_completed = **только `{title}`**, без `task_id`/`assigned_to`.
   → годится для АГРЕГАТА «завершений во времени по людям» (created_at = когда, user_id = кто), НЕ для
   привязки к конкретной задаче и НЕ для точного backfill `completed_at`.
5. **Объём данных рабочий:** 165 задач, 80 done (~48% completion), 25 назначенных, 17 с дедлайном,
   329 log-строк. Метрики осмысленны; дедлайн/назначения тонкие — вырастут с использованием командой.
6. Команда живая (memberships: owner + 2 manager). Следующая свободная миграция — **072**.

## CRM-аналогии
- **Salesforce**: `ClosedDate` на Opportunity + Reports & Dashboards (matrix reports, аггрегаты на
  сервере). Наш `completed_at` = зеркало ClosedDate для задач.
- **Jira**: `resolutiondate` + Velocity/Control Chart/Cumulative Flow. Cycle time = resolved − created.
- **Monday/Asana**: dashboard-виджеты (completion over time, workload по людям) поверх статус-колонок.
- **Вывод:** индустрия хранит явный timestamp завершения + считает агрегаты на бэке. Повторяем: колонка
  `completed_at` + серверные RPC/views, клиент только рисует.

## Data Model First
### Проблема ядра: `completed_at` (миграция 072)
- **Добавить `tasks.completed_at timestamptz` (nullable).** Источник истины «когда завершено».
- **BEFORE INSERT/UPDATE триггер `stamp_task_completed_at`:** `NEW.lane='done' AND (INSERT OR OLD.lane
  <>'done')` → `NEW.completed_at = now()`; переход `done→не-done` (реоткрытие) → `NEW.completed_at = null`.
  ⚠️ **Ordering:** должен сработать ПОСЛЕ `trg_aa_resolve_board` (тот разрешает lane из column_id).
  BEFORE-триггеры Postgres идут в алфавите имён → имя со суффиксом после `aa` (напр. `trg_stamp_...` или
  `trg_ba_...`) гарантирует чтение уже разрешённого `lane`. Проверить на гейте фактический порядок.
- **Backfill:** `update tasks set completed_at = updated_at where lane='done' and completed_at is null`.
  Приблизительно (для done-задач last-update ≈ завершение) — пометить как approximate для до-072 истории;
  форвардом точно. Log-события (57) не мапятся к task_id → точность не улучшают, backfill остаётся updated_at.
- **Индексы:** `idx_tasks_completed_at (completed_at) where completed_at is not null`;
  `idx_tasks_org_completed (org_id, completed_at)` под период-агрегаты; `idx_tasks_org_lane (org_id, lane)`
  под открытые/aging (если нет — 070 добавляла scheduled-индексы, lane-индекса могло не быть).
- **Логгер (мелкий долг, опц. в 072):** дописать `task_id` + `assigned_to` в payload `task_completed` —
  чтобы будущий log-анализ был возможен. НЕ блокер MVP (метрики берём из колонки).

### Источники метрик
`tasks` (completed_at, created_at, deadline, lane, priority, assigned_to, project_id, scheduled_start/end)
+ `memberships` (люди/роли для разрезов) + `activity_log.task_completed` (историч. тренд завершений).

## Метрики MVP (формулы + источник)
| Метрика | Формула | Источник |
|---|---|---|
| **Completion rate** | done / total за период | tasks.lane, completed_at в окне |
| **Throughput (velocity)** | count(completed_at) по неделям | tasks.completed_at |
| **Cycle time** | avg/median(completed_at − created_at) для завершённых | tasks (forward точно, история ≈) |
| **Open aging** | now − created_at для lane≠done, бакеты (<3д/3-7/7-30/>30) | tasks открытые |
| **Overdue** | lane≠done AND deadline < now; rate = overdue / (открытые с дедлайном) | tasks.deadline |
| **Workload по людям** | открытые задачи + сумма scheduled-часов на assignee (неделя) | tasks.assigned_to + scheduled_* |

Медиану — `percentile_cont(0.5)`. Тренды — по `date_trunc('week', completed_at at time zone 'Europe/Moscow')`.

## Серверная агрегация (не на клиенте — QUERY STRATEGY)
- **RPC `task_analytics_summary(p_from date, p_to date)`** SECURITY DEFINER stable, `search_path
  public, pg_temp`, returns `jsonb` (KPI-блок: completion_rate, throughput_total, cycle_time_median,
  overdue_count, open_total). Один round-trip для верхних плиток.
- **RPC `task_throughput_series(p_from, p_to, p_bucket text default 'week')`** → таблица (bucket,
  completed, created) для тренд-графика.
- **RPC `task_workload_by_assignee(p_week_start date)`** → (profile_id, open_count, scheduled_min) для
  bar «нагрузка по людям» (стыкуется с capacity/C позже).
- **Скоуп внутри RPC по роли (не отдельные политики):** `current_org_role()` — owner/admin → вся org;
  manager → `assigned_to = auth.uid() OR is_project_member(project_id)` (личный+командные проекты); всё
  в границе `org_id = current_org_id()`. Пустой результат, не ошибка. ACL: revoke anon, grant authenticated.
- Почему RPC, а не client-side: медиана/percentile, разрезы по неделям и join memberships дёшевы в PG и
  дороги в JS; плюс единый скоуп-гард в одном месте.

## RBAC-матрица (аналитика = для «Руководства»)
```
                | KPI org | KPI личный | Throughput org | Workload команды | Drill-down | Export |
Owner/Admin     |   ✓     |    ✓       |      ✓         |       ✓          |    ✓       |   ✓    |
Manager         |   ✗*    |    ✓       |   ✓ (свой+проекты)|   ✗ (свой)     |  ✓ (свой)  |   ✗    |
Viewer          |   ✓**   |    ✗       |      ✓**        |       ✓**        |    ✗       |   ✗    |
```
*Manager видит org-агрегат только по видимым ему задачам (RLS-скоуп в RPC). **Viewer — read дашбордов
в пределах org-скоупа; export off по умолчанию (crm-architect default).

## Миграция 072 (план)
1. `alter table tasks add column completed_at timestamptz;`
2. Триггер-функция + `trg_stamp_completed_at` (ordering после resolve_board).
3. Backfill (updated_at для done).
4. Индексы (completed_at, org+completed_at, org+lane).
5. 3 RPC (summary / throughput_series / workload_by_assignee), role-scoped, ACL.
6. (опц.) логгер task_completed += task_id/assigned_to.
Гейт: apply → advisors → JWT-sim (manager видит свой скоуп, не org) → реген типов.

## UI (recon для спринта — НЕ прескрайбить вслепую)
- **В сайдбаре УЖЕ есть «Аналитика»** (виден в B1-скринах) + «Обзор». CC обязан сделать recon: что на
  `/analytics` сейчас (стаб? kpi_entries-дашборд из 007?), какая charting-либа в проекте (Recharts?),
  паттерн KPI-плиток/дэйт-рейндж-фильтра в «Обзор». **Переиспользовать, не плодить.**
- MVP-экран: дэйт-рейндж фильтр → ряд KPI-плиток (completion/throughput/cycle/overdue) → тренд-график
  throughput (по неделям) → bar «нагрузка по людям» → таблица aging (drill). Токены/темы, tabular-nums,
  empty/loading/error. Realtime не нужен — аналитика низкочастотная, polling/refresh по фильтру.

## Roadmap
- **A-MVP (первый спринт):** миграция 072 (completed_at + trigger + backfill + summary/throughput RPC +
  индексы) + экран `/analytics` с KPI-плитками + throughput-тренд + aging-таблица. Cycle time — forward.
- **B:** workload-by-assignee bar (стык с capacity/C) + overdue-разбивка по людям/проектам.
- **C:** drill-down в список задач по клику метрики; export (owner/admin); per-project completion.
- **D (стык с тайм-блокинг C):** capacity/перегруз на scheduled-часах.

## Verification Labels
```
Type Safety:            NOT_VERIFIED (дизайн; типы при реализации — completed_at в gen types)
RLS Coverage:           PASS (дизайн: RPC SECURITY DEFINER со скоуп-гардом current_org_role/org_id;
                        не ослабляет tasks RLS)
Backward Compatibility: PASS (completed_at аддитивно nullable; триггер только стемпит; экран новый/
                        поверх существующего /analytics — recon перед касанием)
Runtime Tested:         NOT_VERIFIED
Regional Availability:  NOT_APPLICABLE (без сторонних сервисов; charting — уже в проекте)
```

## Риски / решения за тебя (нужно подтверждение по scope MVP)
- **completed_at backfill = updated_at** приблизителен для истории (cycle-time до-072 ≈). Форвардом точно.
  Альтернатива — не бэкфилить (история cycle-time пустая, копится с запуска). **Реко: бэкфилить с
  пометкой «≈» в UI** (лучше приблизительный тренд, чем пусто).
- **MVP-набор метрик** — предлагаю completion rate + throughput-тренд + cycle time + overdue + aging;
  workload-по-людям вынести в B (стыкуется с capacity). Подтверди набор или подвинь.