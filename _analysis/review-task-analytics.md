# Ревью: task-аналитика (архитектура gap №1)

**Дата:** 2026-07-23  
**Ревьюер:** Grok (верификация по коду `main`, schema.md / architecture-паттерны, grep migrations + src)  
**Объект:** `task-аналитика.md` — Data Model First + RPC + MVP UI для task analytics  
**Контекст:** не sprint-prompt для CC, а architect-дизайн (D3). Следующая миграция **072** (после 071 meeting attendee). Параллельно в очереди UI-only `sprint-S-TASKS-RESTRUCTURE-1` (lane/schema не трогает). Существующий `/analytics` — M6 (цвета/утилиты), **не** task-KPI.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Разведка (completed_at / lane / RPC greenfield) | ✅ |
| Номер миграции 072 | ✅ |
| Триггер stamp + ordering после `trg_aa_resolve_board` | ✅ |
| Источник `task_completed` payload (только title) | ✅ |
| Серверные RPC + SECURITY DEFINER / ACL | ✅ (с W по scope manager/viewer) |
| Совместимость с `scheduled_*` (070) | ✅ |
| UI recon / reuse `/analytics` + recharts | 🟡 (страница живая, не stub) |
| RBAC-матрица vs живой `tasks` RLS | 🟡 |
| Готовность как prompt для CC | ❌ (нужен sprint-файл + подтверждение scope) |
| Конфликт с S-TASKS-RESTRUCTURE-1 | ✅ низкий (UI-only vs analytics schema) |

**Оценка: 72/100 (NO-GO) · legacy 8/10.**  
Сильный Data Model First, но **не executable sprint** (нет РАЗВЕДКА/задач/гейта) → ниже порога **85** для Claude Code.  
Открытые B* (нужен sprint-файл, confirm scope, manager `created_by`) → cap ≤ 84.

**Шкала:** 0–100; **≥ 85 = GO в CC**; B* → max 84.

**Рекомендация:** **не отдавать в CC.** Executable follow-up: `_analysis/sprint-S-ANALYTICS-1.md` (ревью: `review-sprint-S-ANALYTICS-1.md`, **91/100 GO**).

---

## Статус

| Артефакт | Статус в репо |
|----------|---------------|
| `task-аналитика.md` (корень) | architecture, 2026-07-23 |
| Миграция 072 | **свободна** (последняя applied в schema: 071) |
| `completed_at` на `tasks` | **нет** (schema.md tasks + gen types) |
| RPC task_analytics_* | **нет** |
| `/analytics` UI | **живой** client-side (Calls / Tasks lane donut / Pipeline / Export / WeeklyReview) |
| `sprint-S-TASKS-RESTRUCTURE-1` | NEW, UI-only, без DDL — параллельно ок |

---

## С чем согласен полностью

### 1. Нет `completed_at` — правильное ядро gap

В `schema.md` / `tasks` колонки: `lane`, `created_at`, `updated_at`, `deadline`, `start_date`/`end_date`, `scheduled_start`/`scheduled_end` (070) — **без** `completed_at`/`done_at`/`closed_at`.  
`updated_at` как proxy действительно слаб (любой edit).

### 2. `lane` деривативен для проектных задач

`trg_aa_resolve_board` → `resolve_task_board()` (baseline + 032). BEFORE INSERT/UPDATE на `tasks`. Для project tasks истина — `column_id`/category; lane пишется резолвером. Stamp **обязан** идти после `aa` по алфавиту имени — в доке верно (`trg_stamp_*` / `trg_ba_*` / `trg_ab_*`).

Живой порядок BEFORE на `tasks` (baseline):

| Имя | Когда |
|-----|--------|
| `set_updated_at` | BEFORE UPDATE |
| `trg_aa_resolve_board` | BEFORE INSERT OR UPDATE |
| `trg_set_org_id` | BEFORE INSERT |

→ `trg_ab_stamp_completed_at` / `trg_stamp_task_completed_at` встанет **после** resolve. На гейте всё равно сверить `pg_trigger`.

### 3. Серверной task-аналитики нет

Клиент: `['dashboard-stats']` в `dashboard-content.tsx` — head-count'ы.  
`/analytics` `TasksDistribution` — `useTasks()` + count по `lane` в JS (`Charts.tsx`).  
`stamp_quote_status` (053) — не аналитика, верно как «похожая по имени» функция.  
RPC/views с `task_analytics` / throughput / percentile — **0** в migrations/src.

### 4. `activity_log.task_completed` без task_id

Клиент (`use-tasks.ts` ~301–304):

```ts
if (vars.lane === 'done' && result.project_id) {
  logActivity(result.project_id, 'task_completed', { title: result.text });
}
```

`logActivity` пишет `{ project_id, user_id, event_type, payload }` — **только title**.  
Дополнительно: **личные задачи без `project_id` не логируются**; переход в done через `column_id` без `vars.lane === 'done'` тоже может не залогировать. Это усиливает выбор **колонки `completed_at`**, а не log-backfill.

### 5. Миграция 072 + паттерны DEFINER

schema.md: «Следующая свободная — **072**». Репо: 068–071 на месте.  
План RPC: `SECURITY DEFINER`, `search_path = public, pg_temp`, revoke anon, grant authenticated, org-first + role scope — соответствует learnings (NULL-safe org-гард обязателен в теле).

### 6. Индексы и substrate 070

- `idx_tasks_overdue (org_id, deadline) WHERE deadline IS NOT NULL AND lane<>'done'` уже есть (051).  
- `idx_tasks_lane`, `idx_tasks_org` — есть; composite `(org_id, lane)` / `(org_id, completed_at)` — резонны.  
- `scheduled_start/end` + `idx_tasks_assignee_scheduled` (070) — workload-by-assignee опирается на живой substrate.

### 7. Charting / навигация

- Recharts: `Charts.tsx`, `CallsChart.tsx`, `OverviewCharts.tsx`.  
- Сайдбар: `TextNavSidebar` → `/analytics` «Аналитика».  
- Hotkey `a`, command palette — есть.  
Recon «не плодить вторую chart-либу» — верный.

### 8. Roadmap A→D

MVP = completed_at + summary/throughput + KPI/trend/aging; workload → B; drill/export hardening → C — разумная нарезка. Backfill `updated_at` с пометкой «≈» в UI — честный trade-off.

---

## Блокеры (критично — до sprint / CC)

### B1. Это не executable sprint-prompt

Файл — architecture. Нет:

- блока **РАЗВЕДКА** с командами «показать вывод»;
- нумерованных **ЗАДАЧ** (миграция / hooks / UI / types / schema.md);
- **ЖЁСТКО НЕ ТРОГАТЬ**;
- гейт-чеклиста (JWT-sim manager/viewer, advisors, gen types).

**Действие:** после подтверждения scope — `_analysis/sprint-S-TASK-ANALYTICS-1.md` (или handoff) по crm-architect checklist. CC не кормить architecture brief’ом 1:1.

### B2. Подтверждение scope MVP (явно в доке)

Док сам просит confirm:

- backfill ≈ vs empty history;
- набор KPI: completion + throughput + cycle + overdue + aging;
- workload в B (не A).

Без ответа product — sprint разъедется. **Зафиксировать в sprint header.**

### B3. Manager-скоуп RPC ≠ живой `tasks` SELECT

Док: manager → `assigned_to = auth.uid() OR is_project_member(project_id)`.

Живой SELECT:

- `tasks_select`: owner/admin **∨ assigned_to ∨ created_by**;
- `tasks_select_member` (065): **∨ is_project_member(project_id)**.

**Пропущен `created_by`.** Менеджер видит в UI задачи, которые создал, но не assignee и не member проекта — RPC их «сожмёт» → KPI < экрана задач.  
**Фикс в дизайне/спринте:**

```text
assigned_to = auth.uid()
OR created_by = auth.uid()
OR is_project_member(project_id)
```

(+ owner/admin = org-wide; NULL-safe `current_org_id()`).

---

## Предупреждения (желательно исправить)

### W1. `/analytics` — не stub

Сейчас: CallsChart, TasksDistribution (lane-donut), PipelineChart (фаза сделок), ExportPanel, WeeklyReview.  
MVP «KPI-плитки + throughput + aging» должен **надстроить** страницу (или явная секция «Задачи»), а не заменить M6/pipeline/calls.  
Sprint: recon-таблица «что остаётся / что добавляется / куда date-range».

### W2. Viewer org-wide KPI шире RLS tasks

`tasks_select` для viewer **не** org-wide (только own assigned/created + member board).  
Матрица: Viewer ✓ KPI org / throughput / workload. Это **намеренное расширение** через DEFINER — ок как product, но:

- зафиксировать в sprint «viewer = org aggregates read-only»;
- JWT-sim на гейте: viewer видит summary, не drill к чужим task rows (C);
- export off — согласуется с матрицей; **текущий ExportPanel ролей не проверяет** (долг; не блокирует task-RPC MVP).

### W3. Формула Completion rate неоднозначна

«done / total за период» — не специфицировано:

| Вариант | Смысл |
|---------|--------|
| A | `count(completed_at ∈ window) / count(created_at ∈ window)` |
| B | snapshot: done / all (игнор периода на знаменателе) |
| C | completed in window / (completed in window + open created ≤ window end) |

Для Salesforce-like throughput отдельная метрика; completion rate лучше **C или A** с подписью. Зафиксировать в SQL RPC + UI copy.

### W4. Cycle time history ≈ после backfill

Согласны с «≈» в UI. Дополнительно: задачи, ушедшие в done **до** 072 и потом отредактированные, получат `completed_at = updated_at` (искажение). Альтернатива: backfill только если `updated_at` близко к… — overkill; достаточно footnote «история приблизительна».

### W5. Индекс `idx_tasks_org_lane`

`idx_tasks_lane` уже есть; composite `(org_id, lane)` полезен для open/aging под org-фильтром в DEFINER (RLS не «бесплатный» внутри DEFINER — фильтр руками). Не блокер; `IF NOT EXISTS`.

### W6. Опциональный enrich `task_completed` payload

Дописывать `task_id` + `assigned_to` — в `useUpdateTask` (и пути, где lane→done без `vars.lane`, если есть). Не блокер MVP; в 072 можно SQL-only, client — отдельной задачей спринта, иначе log останется дырявым.

### W7. `STABLE` vs чтение «сейчас»

`task_analytics_summary` использует `now()` для overdue/aging — в PG `now()` STABLE; ок. Не помечать IMMUTABLE. Не кэшировать агрегат без ключа периода на клиенте надолго (staleTime умеренный).

### W8. Параллельный S-TASKS-RESTRUCTURE-1

UI задач (stream/table). Analytics читает tasks/RPC, не зависит от layout `/tasks`.  
Риск только продуктовый: «aging/overdue» в аналитике vs группировка на tasks — **общие** date-helpers (`mskDateKey` и т.п.) переиспользовать, не дублировать бакеты вразнобой.

### W9. Объём данных (165 tasks / 57 events)

Цифры из MCP-разведки автора — **в этом ревью live DB не перепроверялись**. На гейте спринта: `count(*)`, sample payload `task_completed`. Не опираться на 57 как на invariant.

---

## Пропущенные места (recon для sprint)

| Файл / место | Заметка | Действие в sprint |
|--------------|---------|-------------------|
| `src/components/analytics/AnalyticsPage.tsx` | живая композиция | extend, не rewrite |
| `src/components/analytics/Charts.tsx` | TasksDistribution client lane | оставить snapshot-donut **или** заменить RPC-метриками явно |
| `src/components/analytics/ExportPanel.tsx` | export без role-gate | out of scope MVP или W |
| `src/lib/hooks/use-tasks.ts:301–304` | log только title + project_id | optional payload; completed_at независимо |
| `src/app/(dashboard)/dashboard-content.tsx` | dashboard-stats counts | не смешивать с task_analytics RPC keys |
| `supabase/migrations/053_quotes.sql` | `stamp_quote_status` pattern | образец stamp-триггера |
| `supabase/migrations/051_task_overdue.sql` | `idx_tasks_overdue` | не дублировать смысл |
| `supabase/migrations/070_task_scheduling_a1.sql` | scheduled_* | workload B |
| `src/types/database.ts` + `supabase.gen.ts` | types | +completed_at после apply + gen |
| crm-architect `schema.md` | post-migration | обязательный хвост спринта |

---

## Предлагаемые правки в architecture / будущий sprint

1. **B3:** manager filter += `created_by = auth.uid()`.  
2. **W1:** UI = секция Task analytics **на** `/analytics` + date-range; pipeline/calls/export не удалять без отдельного решения.  
3. **W3:** явная формула completion_rate в RPC comment + UI.  
4. **Имя триггера:** зафиксировать `trg_ab_stamp_task_completed_at` (гарантированно после `trg_aa_resolve_board`, до `trg_set_org_id` не критично — stamp не зависит от org_id).  
5. **RPC set A-MVP:** `task_analytics_summary` + `task_throughput_series`; `task_workload_by_assignee` — фаза B (согласовать с roadmap).  
6. **Гейт:** advisors; JWT owner vs manager vs viewer; reopen done→now обнуляет completed_at; insert lane=done стемпит; project task done via column_id (без lane в payload) стемпит; backfill count; `generate_typescript_types` / schema.md.  
7. **Query keys:** `['task-analytics', from, to]` — инвалидация из `useUpdateTask` onSettled (lane/column) опционально; иначе refresh по фильтру (док: realtime не нужен — ок).  
8. Перенести файл в `_analysis/` при желании единого glob watcher (`architecture-task-analitika.md` / sprint-*) — сейчас корень **не** в `list-pending.sh`.

---

## crm-architect checklist (дизайн)

| Пункт | Статус |
|-------|--------|
| РАЗВЕДКА в executable prompt | ❌ (будет в sprint) |
| Реальные table/column names | ✅ |
| Реальные paths (analytics, hooks) | 🟡 recon UI обязателен |
| learnings: DEFINER search_path + ACL | ✅ заложены |
| learnings: NULL-safe org_id | 🟡 явно дописать в SQL-скелет |
| Миграция отдельным файлом, apply не из CC | ✅ (план) |
| org_id / current_org_role first | ✅ |
| CSS variables / theme | ✅ (токены, tabular-nums) |
| schema.md после 072 | ✅ в гейт |
| DELETE CASCADE | N/A (аддитивная колонка) |

---

## Чеклист перед CC (после sprint-файла)

- [ ] Product: confirm MVP metrics + backfill «≈»  
- [ ] Sprint md с РАЗВЕДКОЙ, задачами, out-of-scope, гейтом  
- [ ] Manager scope = assigned_to ∨ created_by ∨ is_project_member  
- [ ] Viewer policy зафиксирована (org aggregate vs own-only)  
- [ ] Completion rate formula зафиксирована  
- [ ] UI plan: extend AnalyticsPage, recharts reuse  
- [ ] Миграция `072_task_completed_at_analytics.sql` (имя на усмотрение)  
- [ ] Триггер order verified on gate  
- [ ] JWT-sim + advisors + types + schema.md  
- [ ] Не apply migration из CC session без явного «apply»

---

## Итог одной строкой

**Архитектура верная и опирается на живой код; в Claude Code — только после sprint-prompt и фикса scope manager/`created_by` + явного UI-extend `/analytics`.**
