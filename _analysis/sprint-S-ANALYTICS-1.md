# Claude Code Prompt — S-ANALYTICS-1: Task analytics MVP (`completed_at` + RPC + `/analytics`)

> **Тип:** DB + hooks + UI. Миграция **072** (аддитивная).  
> **Риск:** средний (триггер на `tasks` + SECURITY DEFINER RPC). Откат DDL = drop column/fn (гейт).  
> **Стек:** Next.js 15 + TS + Tailwind + Supabase. Тема-дефолт `t-aura`.  
> **Ветка:** `feat/task-analytics-1`  
> **Источники:** `task-аналитика.md` (architect D3) + `_analysis/review-task-аналитика.md` (Grok 2026-07-23).  
> **НЕ применять миграцию из CC** — пишет + коммит; apply = гейт Cowork (MCP).

---

## WHY

Нет timestamp завершения задач → cycle time / throughput / completion rate считаются
примерно или никак. `/analytics` уже есть, но task-часть — client-side count по `lane`
(`TasksDistribution`), без периода и медианы. Индустрия (SF ClosedDate, Jira resolutiondate)
хранит явный stamp + агрегаты на сервере.

## WHAT (A-MVP only)

1. **`tasks.completed_at`** + BEFORE-триггер stamp (после `trg_aa_resolve_board`) + backfill ≈.  
2. **RPC** `task_analytics_summary` + `task_throughput_series` (role-scoped, org-first).  
3. **UI** на `/analytics`: date-range → KPI-плитки → throughput-тренд → aging-таблица.  
4. **Существующие** Calls / Pipeline / lane-donut / Export / WeeklyReview — **НЕ удалять**.

### Out of scope (жёстко)

| Вне MVP | Куда |
|---------|------|
| `task_workload_by_assignee` | B (capacity/timeblock) |
| Drill-down в список задач по клику KPI | C |
| Role-gate на `ExportPanel` | C / отдельный долг |
| Realtime на аналитику | не нужен |
| Правки `/tasks` layout, S-TASKS-RESTRUCTURE-1 | другой спринт |
| `kpi_entries` / call tracker | не трогать |
| Применение 072 из CC | гейт |

### Product locks (из ревью — не переобсуждать в CC)

| Тема | Решение |
|------|---------|
| Backfill | `completed_at = updated_at` где `lane='done'`; UI пометка «≈» у cycle time |
| Completion rate | `completed_in_period / NULLIF(created_in_period, 0)` (оба в `[p_from, p_to]` по MSK date) |
| Manager scope | `assigned_to OR created_by OR is_project_member` (**не** org-wide) |
| Viewer | org-wide **read** агрегатов (шире tasks RLS — осознанно) |
| Owner/Admin | org-wide |
| Workload bar | **не** в этом спринте |

---

## РАЗВЕДКА (первой, не менять код; вывод показать)

```bash
cd ~/Downloads/dashboard-crm

# 1. Свободный номер миграции (ожидаем 072)
ls supabase/migrations/ | sort | tail -15
ls supabase/migrations/ | grep -E '^07[0-9]'

# 2. tasks: нет completed_at; есть lane/deadline/scheduled_*/created_at
rg -n "completed_at|scheduled_start|\"lane\"" src/types/supabase.gen.ts | head -30
rg -n "completed_at" supabase/migrations --glob '*.sql' | head

# 3. Порядок BEFORE-триггеров tasks (stamp должен быть после aa)
rg -n "TRIGGER.*tasks|ON public.tasks" supabase/migrations/20260712230000_baseline.sql | head -40

# 4. resolve_board / is_project_member
rg -n "trg_aa_resolve_board|resolve_task_board|is_project_member" supabase/migrations --glob '*.sql' | head -20

# 5. Живой /analytics — ЧТО ОСТАВИТЬ
sed -n '1,80p' src/components/analytics/AnalyticsPage.tsx
ls src/components/analytics/
rg -n "TasksDistribution|useTasks|recharts" src/components/analytics -g '*.tsx' | head

# 6. log task_completed (payload only title)
rg -n "task_completed|logActivity" src/lib/hooks/use-tasks.ts

# 7. RPC-паттерн + org role
sed -n '1,40p' src/lib/hooks/use-org-role.ts
rg -n "\.rpc\(" src/lib/hooks -g '*.ts' | head -15
# stub Functions в gen (куда добавить сигнатуры до apply)
rg -n "reorder_tasks|check_delivery_completion|Functions:" src/types/supabase.gen.ts | head -20

# 8. date helpers MSK
rg -n "export function mskDateKey|Europe/Moscow" src/lib/utils/date-helpers.ts

# 9. schema skill path (после гейта — обновить; CC может черновик в docs если принято)
ls ~/.claude/skills/crm-architect/references/schema.md | head -1
```

**Правила по итогам разведки:**

- Если `072_*.sql` уже есть — **СТОП**, эскалируй (коллизия номера).  
- Если `completed_at` уже в gen/types — **СТОП**, сверь с живой БД.  
- UI: **надстраивать** `AnalyticsPage`, не rewrite.  
- Типы до apply: hand-stub Functions + колонка в gen **или** hand types в `database.ts` + cast (паттерн quotes/WBS) — выбрать один, consistency с последними миграциями в репо.

---

## ЗАДАЧА 1 — Миграция `072_task_analytics.sql` (НЕ apply из CC)

**Файл:** `supabase/migrations/072_task_analytics.sql`

Полное тело (можно разбить комментариями; один файл, идемпотентность где возможно):

```sql
-- 072: S-ANALYTICS-1 — tasks.completed_at + stamp trigger + analytics RPC
-- Apply: гейт Cowork (MCP apply_migration). НЕ из Claude Code.

-- ── 1. Column ──────────────────────────────────────────────
alter table public.tasks
  add column if not exists completed_at timestamptz;

comment on column public.tasks.completed_at is
  'S-ANALYTICS-1: when lane became done. Null if open/reopened. Backfill pre-072 ≈ updated_at.';

-- ── 2. Stamp trigger (AFTER resolve_board alphabetically) ──
-- BEFORE triggers on tasks: set_updated_at → trg_aa_resolve_board → trg_set_org_id
-- Name trg_ab_* guarantees order after trg_aa_resolve_board (lane already derived from column_id).
create or replace function public.stamp_task_completed_at()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- lane already resolved by trg_aa_resolve_board on same BEFORE chain
  if tg_op = 'INSERT' then
    if new.lane = 'done' then
      new.completed_at := coalesce(new.completed_at, now());
    end if;
    return new;
  end if;

  -- UPDATE
  if new.lane = 'done' and (old.lane is distinct from 'done') then
    new.completed_at := now();
  elsif new.lane is distinct from 'done' and old.lane = 'done' then
    -- reopen
    new.completed_at := null;
  end if;
  -- stay in done: keep existing completed_at (do not bump on every edit)
  return new;
end;
$$;

revoke all on function public.stamp_task_completed_at() from public, anon, authenticated;
grant execute on function public.stamp_task_completed_at() to service_role;

drop trigger if exists trg_ab_stamp_task_completed_at on public.tasks;
create trigger trg_ab_stamp_task_completed_at
  before insert or update on public.tasks
  for each row execute function public.stamp_task_completed_at();

-- ── 3. Backfill (approximate history) ─────────────────────
update public.tasks
set completed_at = updated_at
where lane = 'done'
  and completed_at is null
  and updated_at is not null;

-- ── 4. Indexes ────────────────────────────────────────────
create index if not exists idx_tasks_completed_at
  on public.tasks (completed_at)
  where completed_at is not null;

create index if not exists idx_tasks_org_completed
  on public.tasks (org_id, completed_at)
  where completed_at is not null;

create index if not exists idx_tasks_org_lane
  on public.tasks (org_id, lane);

-- ── 5. Visibility helper (SQL, reusable in both RPCs) ─────
-- Mirrors review B3 + product locks. DEFINER callers still filter org_id = current_org_id().
create or replace function public.task_analytics_row_visible(
  p_assigned_to uuid,
  p_created_by uuid,
  p_project_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when public.current_org_id() is null then false
    when coalesce(public.current_org_role(), '') in ('owner', 'admin', 'viewer') then true
    when coalesce(public.current_org_role(), '') = 'manager' then (
      p_assigned_to is not distinct from auth.uid()
      or p_created_by is not distinct from auth.uid()
      or public.is_project_member(p_project_id)
    )
    else false
  end;
$$;

revoke all on function public.task_analytics_row_visible(uuid, uuid, uuid) from public, anon;
grant execute on function public.task_analytics_row_visible(uuid, uuid, uuid) to authenticated, service_role;

-- ── 6. RPC summary → jsonb ────────────────────────────────
-- completion_rate = completed_in_period / nullif(created_in_period, 0)
-- completed_in_period: completed_at::date in [p_from, p_to] (date = calendar day in session; compare as date)
-- Prefer date bounds as date type (UI sends YYYY-MM-DD).
-- cycle_time_median_hours: percentile_cont(0.5) of extract(epoch from completed_at - created_at)/3600
--   only rows with completed_at in window and created_at not null
-- overdue_count / open_total: snapshot now (lane <> 'done'), not period-bound
-- history_approx: true (UI shows ≈ on cycle) — constant true until we track stamp source
create or replace function public.task_analytics_summary(
  p_from date,
  p_to date
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid := public.current_org_id();
  v_created int;
  v_completed int;
  v_cycle_median numeric;
  v_open int;
  v_overdue int;
begin
  if v_org is null then
    return jsonb_build_object(
      'completion_rate', null,
      'created_count', 0,
      'completed_count', 0,
      'throughput_total', 0,
      'cycle_time_median_hours', null,
      'open_total', 0,
      'overdue_count', 0,
      'history_approx', true,
      'from', p_from,
      'to', p_to
    );
  end if;

  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'invalid period' using errcode = '22023';
  end if;

  select count(*)::int into v_created
  from public.tasks t
  where t.org_id = v_org
    and public.task_analytics_row_visible(t.assigned_to, t.created_by, t.project_id)
    and (t.created_at at time zone 'Europe/Moscow')::date between p_from and p_to;

  select count(*)::int into v_completed
  from public.tasks t
  where t.org_id = v_org
    and public.task_analytics_row_visible(t.assigned_to, t.created_by, t.project_id)
    and t.completed_at is not null
    and (t.completed_at at time zone 'Europe/Moscow')::date between p_from and p_to;

  select percentile_cont(0.5) within group (
    order by extract(epoch from (t.completed_at - t.created_at)) / 3600.0
  ) into v_cycle_median
  from public.tasks t
  where t.org_id = v_org
    and public.task_analytics_row_visible(t.assigned_to, t.created_by, t.project_id)
    and t.completed_at is not null
    and t.created_at is not null
    and (t.completed_at at time zone 'Europe/Moscow')::date between p_from and p_to;

  select count(*)::int into v_open
  from public.tasks t
  where t.org_id = v_org
    and public.task_analytics_row_visible(t.assigned_to, t.created_by, t.project_id)
    and t.lane is distinct from 'done';

  select count(*)::int into v_overdue
  from public.tasks t
  where t.org_id = v_org
    and public.task_analytics_row_visible(t.assigned_to, t.created_by, t.project_id)
    and t.lane is distinct from 'done'
    and t.deadline is not null
    and t.deadline < now();

  return jsonb_build_object(
    'completion_rate', case when v_created = 0 then null else round((v_completed::numeric / v_created), 4) end,
    'created_count', v_created,
    'completed_count', v_completed,
    'throughput_total', v_completed,
    'cycle_time_median_hours', v_cycle_median,
    'open_total', v_open,
    'overdue_count', v_overdue,
    'history_approx', true,
    'from', p_from,
    'to', p_to
  );
end;
$$;

revoke all on function public.task_analytics_summary(date, date) from public, anon;
grant execute on function public.task_analytics_summary(date, date) to authenticated, service_role;

-- ── 7. RPC throughput series → setof ──────────────────────
create or replace function public.task_throughput_series(
  p_from date,
  p_to date,
  p_bucket text default 'week'
) returns table (
  bucket_start date,
  completed int,
  created int
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid := public.current_org_id();
  v_trunc text;
begin
  if v_org is null then
    return;
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'invalid period' using errcode = '22023';
  end if;
  if coalesce(p_bucket, 'week') not in ('day', 'week') then
    raise exception 'invalid bucket' using errcode = '22023';
  end if;
  v_trunc := case when p_bucket = 'day' then 'day' else 'week' end;

  return query
  with bounds as (
    select p_from as d_from, p_to as d_to
  ),
  -- generate bucket starts in MSK calendar sense via date_trunc on timestamptz MSK
  buckets as (
    select gs::date as bucket_start
    from bounds b,
    lateral generate_series(
      date_trunc(v_trunc, b.d_from::timestamp),
      date_trunc(v_trunc, b.d_to::timestamp),
      case when v_trunc = 'day' then interval '1 day' else interval '1 week' end
    ) as gs
  ),
  scoped as (
    select t.created_at, t.completed_at
    from public.tasks t
    where t.org_id = v_org
      and public.task_analytics_row_visible(t.assigned_to, t.created_by, t.project_id)
  ),
  created_b as (
    select
      (date_trunc(v_trunc, s.created_at at time zone 'Europe/Moscow'))::date as bucket_start,
      count(*)::int as n
    from scoped s
    where s.created_at is not null
      and (s.created_at at time zone 'Europe/Moscow')::date between (select d_from from bounds) and (select d_to from bounds)
    group by 1
  ),
  completed_b as (
    select
      (date_trunc(v_trunc, s.completed_at at time zone 'Europe/Moscow'))::date as bucket_start,
      count(*)::int as n
    from scoped s
    where s.completed_at is not null
      and (s.completed_at at time zone 'Europe/Moscow')::date between (select d_from from bounds) and (select d_to from bounds)
    group by 1
  )
  select
    b.bucket_start,
    coalesce(c.n, 0)::int as completed,
    coalesce(cr.n, 0)::int as created
  from buckets b
  left join completed_b c on c.bucket_start = b.bucket_start
  left join created_b cr on cr.bucket_start = b.bucket_start
  order by b.bucket_start;
end;
$$;

revoke all on function public.task_throughput_series(date, date, text) from public, anon;
grant execute on function public.task_throughput_series(date, date, text) to authenticated, service_role;
```

**Проверки после записи файла (CC):**

```bash
test -f supabase/migrations/072_task_analytics.sql && wc -l supabase/migrations/072_task_analytics.sql
# НЕ supabase db push / НЕ apply_migration
```

**Гейт (Cowork, не CC):** apply → advisors → JWT-sim:

1. Owner: summary ненулевой при наличии задач.  
2. Manager: completed_count ≤ owner; не видит чужие non-member задачи.  
3. Viewer: summary org-wide ok.  
4. Done via `column_id` only (project board) → `completed_at` set.  
5. Reopen done→now → `completed_at` null.  
6. `pg_trigger` order: `trg_ab_stamp_task_completed_at` after `trg_aa_resolve_board`.  
7. `generate_typescript_types` → commit gen.  
8. schema.md (skill + docs) += 072.

---

## ЗАДАЧА 2 — Types (до apply: hand; после гейта: regen)

### 2a. `src/types/database.ts`

Добавить блок (рядом с другими hand RPC shapes):

```ts
// ═══ S-ANALYTICS-1 (072): task analytics RPC ═══
export interface TaskAnalyticsSummary {
  completion_rate: number | null;
  created_count: number;
  completed_count: number;
  throughput_total: number;
  cycle_time_median_hours: number | null;
  open_total: number;
  overdue_count: number;
  history_approx: boolean;
  from: string; // date
  to: string;
}

export interface TaskThroughputBucket {
  bucket_start: string; // date
  completed: number;
  created: number;
}
```

### 2b. `src/types/supabase.gen.ts` (stub до apply — паттерн quotes)

В `Functions` добавить сигнатуры (имена args как в SQL: `p_from`, `p_to`, `p_bucket`):

- `task_analytics_summary: { Args: { p_from: string; p_to: string }; Returns: Json }`
- `task_throughput_series: { Args: { p_from: string; p_to: string; p_bucket?: string }; Returns: { bucket_start: string; completed: number; created: number }[] }`

Колонку `completed_at: string | null` в `tasks.Row` / Insert / Update — **добавить**, иначе tsc не знает поле после UI.  
После гейта regen — сдифить, не потерять `RelaxOrgId` hand-layer в `database.ts`.

`entities.ts` — **не** править руками (derived).

---

## ЗАДАЧА 3 — Hook `use-task-analytics.ts`

**Новый файл:** `src/lib/hooks/use-task-analytics.ts`

```ts
// queryKey: ['task-analytics', 'summary', from, to]
// queryKey: ['task-analytics', 'throughput', from, to, bucket]
// supabase.rpc('task_analytics_summary', { p_from: from, p_to: to })
// supabase.rpc('task_throughput_series', { p_from: from, p_to: to, p_bucket: 'week' })
// staleTime: 60_000; no realtime
// cast Returns → TaskAnalyticsSummary / TaskThroughputBucket[]
// enabled: !!from && !!to
```

Хелпер периода по умолчанию (последние 8 недель / 56 дней **включительно** до сегодня MSK):

- `defaultAnalyticsRange(): { from: string; to: string }` через `mskDateKey` из `src/lib/utils/date-helpers.ts`  
- today MSK = `mskDateKey(new Date())`; from = today − 55 days (простая UTC-полдень арифметика или date-fns если уже в deps — **не** добавлять новую lib).

**Инвалидация:** в `useUpdateTask` / create / delete `onSettled` добавить:

```ts
queryClient.invalidateQueries({ queryKey: ['task-analytics'] });
```

(уже есть invalidate `dashboard-stats` — рядом). Не дублировать per-mutation логику thrice без нужды — один helper ok.

---

## ЗАДАЧА 4 — UI: секция Task analytics на `/analytics`

### 4a. Компоненты (новые)

| Файл | Роль |
|------|------|
| `src/components/analytics/TaskAnalyticsSection.tsx` | date-range + KPI row + chart + aging |
| `src/components/analytics/TaskAnalyticsKpis.tsx` | 4–5 плиток |
| (optional inline) throughput chart | recharts `BarChart`/`AreaChart` как `CallsChart` |

**Не трогать** (кроме import/composition в page):

- `CallsChart.tsx`, `Charts.tsx` (TasksDistribution/Pipeline), `ExportPanel.tsx`, `WeeklyReview.tsx` — behavior/M6 colors.

### 4b. `AnalyticsPage.tsx` composition

Порядок:

1. Header (как сейчас)  
2. **`<TaskAnalyticsSection />`** — новый блок сверху (task KPI — gap #1)  
3. grid Calls + TasksDistribution  
4. PipelineChart  
5. ExportPanel  
6. WeeklyReview modal  

### 4c. KPI-плитки (токены, `tabular-nums`)

| Плитка | Поле | Формат |
|--------|------|--------|
| Completion | `completion_rate` | % или «—» |
| Throughput | `throughput_total` | int |
| Cycle time | `cycle_time_median_hours` | «X ч» / «X д»; suffix **≈** if `history_approx` |
| Overdue | `overdue_count` | int |
| Open | `open_total` | int |

Loading: skeleton pulse (`border-border`, `bg-surface`).  
Error: text-xs text-text-mute + retry.  
Empty period (0/0): «Нет данных за период» — не фейковый 0% как успех без copy.

### 4d. Date range

Минимально: два `<input type="date">` from/to **или** пресеты «4 нед / 8 нед / 90д» + custom.  
State local в section; default = 8 weeks.  
CSS: `var(--*)` only, no hardcoded hex.

### 4e. Throughput chart

`task_throughput_series` week buckets → recharts (dynamic import pattern как `CallsChart` / W4a — **не** тащить recharts в first chunk page если section heavy: `dynamic(..., { ssr: false })`).

### 4f. Aging table (client snapshot OK for MVP)

Отдельный лёгкий запрос **или** расширить summary — **предпочтение:** client `useTasks()` уже в кэше на analytics page через donut:

- filter `lane !== 'done'`
- age days = now − created_at (MSK day buckets: `<3` / `3–7` / `7–30` / `>30`)
- table: bucket | count  
- **Scope note:** aging по `useTasks` подчиняется RLS tasks (viewer/manager уже отфильтрованы RLS) — согласовано с открытыми задачами UI; KPI open_total из RPC может чуть отличаться у viewer (RPC org-wide vs RLS) — **допустимо**; подпись «открытые (видимые вам)» у aging если role manager/viewer.

Не плодить второй full tasks fetch если `useTasks` уже mounted.

### 4g. index export

`src/components/analytics/index.ts` — export новых public components if needed.

---

## ЗАДАЧА 5 — (малый) enrich `task_completed` payload

В `use-tasks.ts` `onSuccess` update:

```ts
if (/* became done */) {
  logActivity(result.project_id, 'task_completed', {
    title: result.text,
    task_id: result.id,
    assigned_to: result.assigned_to,
  });
}
```

Условие «became done»: `vars.lane === 'done' || result.lane === 'done'` **и** желательно не логировать повторно если уже было done — best-effort:  
`vars.lane === 'done' || (vars.column_id && result.lane === 'done')` — не блокировать MVP если сложно; минимум = добавить `task_id`/`assigned_to` в существующий `if (vars.lane === 'done' && result.project_id)`.

**Не** менять schema activity_log.

---

## ЗАДАЧА 6 — Verify (CC local, без apply)

```bash
# tsc / lint на изменённых файлах
npx tsc --noEmit 2>&1 | head -40
# migration file exists, no accidental apply scripts
git status --short
rg -n "completed_at|task_analytics|TaskAnalytics" src supabase/migrations/072_task_analytics.sql | head -40
```

UI без apply: RPC упадут — **ожидаемо** до гейта. CC не маскировать пустым mock data; section показывает error state «доступно после миграции 072» **или** просто error из supabase — ok.

---

## ЖЁСТКО НЕ ТРОГАТЬ

- `dashboard-content.tsx` / `dashboard-stats` semantics (можно только invalidate key рядом с task-analytics)  
- M6 phase colors / CallsChart / PipelineChart logic  
- ExportPanel RBAC  
- `tasks.lane` enum, `resolve_task_board`, 051 overdue cron  
- 069/070 recurring/schedule spawn  
- S-TASKS-RESTRUCTURE files (`task-view.ts` layout) — не рефакторить  
- `flowType` / supabase client overrides  
- soft-delete / `deleted_at`

---

## КОММИТ

```bash
git add \
  supabase/migrations/072_task_analytics.sql \
  src/types/database.ts \
  src/types/supabase.gen.ts \
  src/lib/hooks/use-task-analytics.ts \
  src/lib/hooks/use-tasks.ts \
  src/components/analytics/ \
  src/app/\(dashboard\)/analytics/page.tsx

git commit -m "$(cat <<'EOF'
Sprint S-ANALYTICS-1: tasks.completed_at + analytics RPC + /analytics task KPI

Add migration 072 (completed_at stamp trigger, backfill, summary/throughput RPC),
hooks and Task analytics section on /analytics. Do not apply migration in this commit.
EOF
)"
```

(Не `git push` без явной просьбы.)

---

## Гейт Cowork (чеклист)

- [ ] `apply_migration` 072 (атомарно)  
- [ ] advisors clean (ожидаемый definer WARN-класс — как is_project_member)  
- [ ] JWT-sim owner / manager / viewer (B3 scope)  
- [ ] stamp via column_id→done + reopen  
- [ ] trigger order `pg_trigger`  
- [ ] regen types + schema.md (skill + docs)  
- [ ] smoke UI: KPI + chart + ≈ badge + empty/error  
- [ ] merge to main **только после** apply  

---

## Acceptance (product)

1. Задача → done → `completed_at` now; reopen → null.  
2. Owner видит org KPI за выбранный период.  
3. Manager не видит чужие personal tasks вне своих/member-проектов.  
4. Throughput chart = weekly completed/created.  
5. Cycle time median + «≈».  
6. Calls/Pipeline/Export/WeeklyReview на месте.  
7. Миграция в репо, **не** «случайно» применена только локально без history.
