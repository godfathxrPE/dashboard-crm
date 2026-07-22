-- 069_recurring_tasks.sql
-- Повторяющиеся задачи: шаблон + daily-cron спавн (schedule-based, один открытый инстанс за раз).
-- Зеркалит 051 (run_overdue_automations, cron-паттерн) + tenant-конвенции project_columns (032/gen).
--
-- КОНТРАКТ: файл пишется и коммитится из Claude Code, НЕ применяется. Применяет
--           гейт Cowork (apply_migration → smoke → advisors).

-- ─── 1. TABLE ────────────────────────────────────────────────────────────────

create table if not exists public.recurring_task_templates (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  text           text not null,
  cadence        text not null check (cadence in ('daily','weekdays','weekly','monthly')),
  weekly_dow     smallint check (weekly_dow between 0 and 6),    -- 0=Вс..6=Сб (pg EXTRACT(dow))
  monthly_dom    smallint check (monthly_dom between 1 and 28),  -- cap 28 (безопасно для всех месяцев)
  priority       public.task_priority not null default 'normal',
  lane           public.task_lane not null default 'now',
  project_id     uuid references public.projects(id)  on delete set null,
  company_id     uuid references public.companies(id) on delete set null,
  contact_id     uuid references public.contacts(id)  on delete set null,
  assigned_to    uuid references public.profiles(id)  on delete set null,
  next_run_date  date not null,
  is_active      boolean not null default true,
  last_spawned_at timestamptz,
  created_by     uuid not null default auth.uid() references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint rtt_weekly_needs_dow  check (cadence <> 'weekly'  or weekly_dow  is not null),
  constraint rtt_monthly_needs_dom check (cadence <> 'monthly' or monthly_dom is not null)
);

create index if not exists idx_rtt_org on public.recurring_task_templates(org_id);
create index if not exists idx_rtt_due on public.recurring_task_templates(next_run_date) where is_active;

-- триггеры как у project_columns (032)
drop trigger if exists trg_set_org_id on public.recurring_task_templates;
create trigger trg_set_org_id before insert on public.recurring_task_templates
  for each row execute function public.set_org_id();

drop trigger if exists trg_aa_freeze_org_id on public.recurring_task_templates;
create trigger trg_aa_freeze_org_id before update on public.recurring_task_templates
  for each row execute function public.freeze_org_id();

drop trigger if exists trg_set_updated_at on public.recurring_task_templates;
create trigger trg_set_updated_at before update on public.recurring_task_templates
  for each row execute function public.update_updated_at();

-- RLS
alter table public.recurring_task_templates enable row level security;

drop policy if exists rtt_select on public.recurring_task_templates;
create policy rtt_select on public.recurring_task_templates
  for select using (org_id = (select public.current_org_id()));

drop policy if exists rtt_insert on public.recurring_task_templates;
create policy rtt_insert on public.recurring_task_templates
  for insert with check (
    org_id = (select public.current_org_id())
    and created_by = (select auth.uid())
  );

drop policy if exists rtt_update on public.recurring_task_templates;
create policy rtt_update on public.recurring_task_templates
  for update using (
    org_id = (select public.current_org_id())
    and (created_by = (select auth.uid()) or (select public.current_org_role()) in ('owner','admin'))
  ) with check (
    org_id = (select public.current_org_id())
  );

drop policy if exists rtt_delete on public.recurring_task_templates;
create policy rtt_delete on public.recurring_task_templates
  for delete using (
    org_id = (select public.current_org_id())
    and (created_by = (select auth.uid()) or (select public.current_org_role()) in ('owner','admin'))
  );

-- грант как у 053/067, anon — ничего
grant select, insert, update, delete on public.recurring_task_templates to authenticated;
revoke all on public.recurring_task_templates from anon;

-- ─── 2. ЛИНК-КОЛОНКА на tasks ────────────────────────────────────────────────

alter table public.tasks
  add column if not exists recurrence_template_id uuid
  references public.recurring_task_templates(id) on delete set null;

create index if not exists idx_tasks_recurrence
  on public.tasks(recurrence_template_id) where recurrence_template_id is not null;

-- ─── 3. helper следующей даты (immutable, чистая функция от аргументов) ──────

create or replace function public.rtt_next_occurrence(
  p_from date, p_cadence text, p_dow smallint, p_dom smallint
) returns date
language plpgsql immutable
set search_path to public, pg_temp
as $$
declare d date;
begin
  if p_cadence = 'daily' then
    return p_from + 1;
  elsif p_cadence = 'weekdays' then
    d := p_from + 1;
    while extract(dow from d) in (0,6) loop d := d + 1; end loop;   -- пропуск Вс(0)/Сб(6)
    return d;
  elsif p_cadence = 'weekly' then
    d := p_from + 1;
    while extract(dow from d) <> p_dow loop d := d + 1; end loop;
    return d;
  elsif p_cadence = 'monthly' then
    d := date_trunc('month', p_from)::date + (p_dom - 1);
    if d <= p_from then
      d := (date_trunc('month', p_from) + interval '1 month')::date + (p_dom - 1);
    end if;
    return d;
  end if;
  return p_from + 1;
end $$;

revoke all on function public.rtt_next_occurrence(date, text, smallint, smallint) from public, anon;
grant execute on function public.rtt_next_occurrence(date, text, smallint, smallint) to authenticated, service_role;

-- ─── 4. spawn (SECURITY DEFINER, зеркалит run_overdue_automations 051) ───────

create or replace function public.spawn_recurring_tasks()
returns void
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  tpl record;
  v_today date := (now() at time zone 'Europe/Moscow')::date;   -- MSK-день
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

      insert into public.tasks
        (text, lane, priority, project_id, company_id, contact_id,
         deadline, assigned_to, org_id, recurrence_template_id, created_by)
      values
        (tpl.text, tpl.lane, tpl.priority, tpl.project_id, tpl.company_id, tpl.contact_id,
         v_today::timestamptz,               -- дедлайн = сегодня (гейт гарантирует next_run_date<=today)
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

-- ─── 5. daily cron (зеркало wf-overdue-daily; 06:05 UTC = 09:05 MSK, сразу после overdue) ──

create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule('recurring-daily');
exception when others then null;  -- job ещё нет — ок
end $$;

select cron.schedule('recurring-daily', '5 6 * * *', 'select public.spawn_recurring_tasks();');
