-- 070_task_scheduling_a1.sql
-- Тайм-блокинг A1: интервал времени на задачах + время/длительность в recurring-шаблоне.
-- scheduled_start/end = «когда делаю» (отдельная ось от deadline «сделать к»). Зеркалит
-- 069-паттерны (spawn_recurring_tasks, MSK-день). enum/деньги не трогаем.
--
-- КОНТРАКТ: файл пишется и коммитится из Claude Code, НЕ применяется. Применяет
--           гейт Cowork (apply_migration → smoke → advisors). A2 (недельная сетка) — след. спринт.

-- ─── 1. tasks: scheduled window (nullable — без них задача обычная, поведение не меняется) ──

alter table public.tasks
  add column if not exists scheduled_start timestamptz,
  add column if not exists scheduled_end   timestamptz;

alter table public.tasks drop constraint if exists tasks_scheduled_order_chk;
alter table public.tasks add constraint tasks_scheduled_order_chk
  check (scheduled_start is null or scheduled_end is null or scheduled_end > scheduled_start);

-- индексы под week/team time-grid (A2): только по заполненным окнам
create index if not exists idx_tasks_scheduled
  on public.tasks(scheduled_start) where scheduled_start is not null;
create index if not exists idx_tasks_assignee_scheduled
  on public.tasks(assigned_to, scheduled_start) where scheduled_start is not null;

-- ─── 2. recurring template: время-суток + длительность ───────────────────────

alter table public.recurring_task_templates
  add column if not exists start_time   time,
  add column if not exists duration_min int;

alter table public.recurring_task_templates drop constraint if exists rtt_duration_pos_chk;
alter table public.recurring_task_templates add constraint rtt_duration_pos_chk
  check (duration_min is null or duration_min > 0);

alter table public.recurring_task_templates drop constraint if exists rtt_duration_needs_time_chk;
alter table public.recurring_task_templates add constraint rtt_duration_needs_time_chk
  check (duration_min is null or start_time is not null);

-- ─── 3. spawn (SECURITY DEFINER, зеркалит 069 — добавлен scheduled-блок) ──────
--     У шаблона есть start_time → кладём тайм-блок. МСК wall-clock (09:30 МСК на
--     v_today) → корректный timestamptz. Иначе scheduled_* = null (обычная задача).

create or replace function public.spawn_recurring_tasks()
returns void
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  tpl record;
  v_today date := (now() at time zone 'Europe/Moscow')::date;   -- MSK-день
  v_start timestamptz;
  v_end   timestamptz;
begin
  for tpl in
    select * from public.recurring_task_templates
    where is_active and next_run_date <= v_today
  loop
    begin
      -- anti-pile-up: пока жив открытый инстанс шаблона — не спавним и НЕ двигаем дату
      if exists (
        select 1 from public.tasks
        where recurrence_template_id = tpl.id and lane <> 'done'
      ) then
        continue;
      end if;

      -- тайм-блок только если у шаблона задано время-суток
      if tpl.start_time is not null then
        v_start := (v_today + tpl.start_time) at time zone 'Europe/Moscow';   -- 09:30 МСК → UTC
        v_end   := v_start + make_interval(mins => coalesce(tpl.duration_min, 30));
      else
        v_start := null;
        v_end   := null;
      end if;

      insert into public.tasks
        (text, lane, priority, project_id, company_id, contact_id,
         deadline, scheduled_start, scheduled_end,
         assigned_to, org_id, recurrence_template_id, created_by)
      values
        (tpl.text, tpl.lane, tpl.priority, tpl.project_id, tpl.company_id, tpl.contact_id,
         v_today::timestamptz,               -- дедлайн = сегодня (гейт: next_run_date<=today)
         v_start, v_end,
         tpl.assigned_to, tpl.org_id, tpl.id, tpl.created_by);

      -- следующее вхождение строго после сегодня → пропущенные циклы не копятся
      update public.recurring_task_templates
        set next_run_date  = public.rtt_next_occurrence(v_today, tpl.cadence, tpl.weekly_dow, tpl.monthly_dom),
            last_spawned_at = now()
        where id = tpl.id;

    exception when others then
      continue;    -- один битый шаблон не блокирует остальные
    end;
  end loop;
exception when others then
  return;          -- из cron никогда не бросаем
end $$;

revoke all on function public.spawn_recurring_tasks() from public, anon, authenticated;
grant execute on function public.spawn_recurring_tasks() to service_role;
