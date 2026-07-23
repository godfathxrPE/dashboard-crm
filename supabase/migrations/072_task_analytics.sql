-- 072_task_analytics.sql
-- Task-аналитика MVP: completed_at (истина «когда завершено») + серверные агрегаты (RPC).
-- КОНТРАКТ: пишется и коммитится из CC, НЕ применяется. Применяет гейт Cowork после ревью.
--
-- Скоуп RPC = зеркало SELECT-политик tasks (permissive OR):
--   tasks_select (baseline): org_id AND (role owner/admin OR assigned_to=uid OR created_by=uid)
--   tasks_select_member (065): org_id AND is_project_member(project_id)
-- → owner/admin видят всю org; прочие — assigned/author/project-member.
-- SECURITY DEFINER обходит RLS → предикат строим сами, точь-в-точь.

-- ── 1. completed_at ──────────────────────────────────────────────
alter table public.tasks add column if not exists completed_at timestamptz;

-- Стемп на переходе в done / очистка на реоткрытии. BEFORE — читает разрешённый lane
-- (имя trg_stamp_completed_at сортируется ПОСЛЕ trg_aa_resolve_board → lane уже резолвнут).
-- Не трогаем completed_at при прочих апдейтах.
create or replace function public.stamp_task_completed_at()
returns trigger language plpgsql set search_path to public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    if new.lane = 'done' then new.completed_at := now(); end if;
  else
    if new.lane = 'done' and old.lane is distinct from 'done' then
      new.completed_at := now();
    elsif new.lane <> 'done' and old.lane = 'done' then
      new.completed_at := null;            -- реоткрыли
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_stamp_completed_at on public.tasks;
create trigger trg_stamp_completed_at
  before insert or update of lane, column_id on public.tasks
  for each row execute function public.stamp_task_completed_at();

-- ── 2. backfill истории (≈ updated_at для done; форвардом — точно now()) ──
update public.tasks set completed_at = updated_at
  where lane = 'done' and completed_at is null;

-- ── 3. индекс под период-агрегаты (overdue/lane-индексы уже есть) ─
create index if not exists idx_tasks_org_completed
  on public.tasks(org_id, completed_at) where completed_at is not null;

-- ── 4. RPC (SECURITY DEFINER, скоуп по роли внутри; RLS обойдён → строим сами) ──

create or replace function public.task_analytics_summary(p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path to public, pg_temp as $$
declare
  v_org uuid := public.current_org_id();
  v_role text := public.current_org_role();
  v_uid uuid := auth.uid();
begin
  if v_org is null then return '{}'::jsonb; end if;
  return (
    with scoped as (
      select * from public.tasks t
      where t.org_id = v_org
        and ( v_role in ('owner','admin')
              or t.assigned_to = v_uid or t.created_by = v_uid
              or public.is_project_member(t.project_id) )
    ),
    comp as (select * from scoped where completed_at >= p_from and completed_at < (p_to + 1)),
    crea as (select * from scoped where created_at >= p_from and created_at < (p_to + 1))
    select jsonb_build_object(
      'open_total',       (select count(*) from scoped where lane <> 'done'),
      'done_total',       (select count(*) from scoped where lane = 'done'),
      'completed_period', (select count(*) from comp),
      'created_period',   (select count(*) from crea),
      -- snapshot completion: done / (done+open)
      'completion_rate',  (select case when count(*) > 0
                             then round(count(*) filter (where lane='done')::numeric / count(*), 3)
                             else null end from scoped),
      'overdue_count',    (select count(*) from scoped
                             where lane <> 'done' and deadline is not null and deadline < now()),
      'cycle_time_median_days', (
         select round(percentile_cont(0.5) within group (
                  order by extract(epoch from (completed_at - created_at)) / 86400.0)::numeric, 1)
         from comp where completed_at is not null)
    )
  );
end $$;

create or replace function public.task_throughput_series(p_from date, p_to date)
returns table(week_start date, completed int, created int)
language sql stable security definer set search_path to public, pg_temp as $$
  with scoped as (
    select * from public.tasks t
    where t.org_id = public.current_org_id()
      and ( public.current_org_role() in ('owner','admin')
            or t.assigned_to = auth.uid() or t.created_by = auth.uid()
            or public.is_project_member(t.project_id) )
  ),
  weeks as (
    select generate_series(date_trunc('week', p_from::timestamp),
                           date_trunc('week', p_to::timestamp), interval '1 week')::date as w
  )
  select w,
    (select count(*)::int from scoped
       where date_trunc('week', (completed_at at time zone 'Europe/Moscow'))::date = w),
    (select count(*)::int from scoped
       where date_trunc('week', (created_at   at time zone 'Europe/Moscow'))::date = w)
  from weeks order by w;
$$;

create or replace function public.task_aging_buckets()
returns table(bucket text, sort_key int, cnt int)
language sql stable security definer set search_path to public, pg_temp as $$
  with scoped as (
    select * from public.tasks t
    where t.org_id = public.current_org_id() and t.lane <> 'done'
      and ( public.current_org_role() in ('owner','admin')
            or t.assigned_to = auth.uid() or t.created_by = auth.uid()
            or public.is_project_member(t.project_id) )
  ),
  aged as (
    select case
      when now() - created_at < interval '3 days'  then 0
      when now() - created_at < interval '7 days'  then 1
      when now() - created_at < interval '30 days' then 2
      else 3 end as sort_key from scoped
  )
  select (array['<3д','3–7д','7–30д','>30д'])[sort_key+1], sort_key, count(*)::int
  from aged group by sort_key order by sort_key;
$$;

-- ACL: только залогиненные
revoke all on function public.task_analytics_summary(date,date)  from public, anon;
revoke all on function public.task_throughput_series(date,date)  from public, anon;
revoke all on function public.task_aging_buckets()               from public, anon;
grant execute on function public.task_analytics_summary(date,date) to authenticated, service_role;
grant execute on function public.task_throughput_series(date,date) to authenticated, service_role;
grant execute on function public.task_aging_buckets()              to authenticated, service_role;
