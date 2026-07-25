-- 074: project_baselines — зафиксированный слепок сроков проекта (план) для план/факт.
-- Hard delete: deleted_at-инфраструктуры в проекте нет (см. 067). Слепок иммутабелен:
-- UPDATE-политик нет, переснять = новый baseline. Аддитивно — правок существующих таблиц нет.

create table if not exists public.project_baselines (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  project_id  uuid not null references public.projects(id)      on delete cascade,
  name        text not null check (char_length(trim(name)) between 1 and 120),
  -- profiles, НЕ auth.users (конвенция проекта); SET NULL — слепок переживает ушедшего автора
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);

create table if not exists public.baseline_tasks (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  baseline_id  uuid not null references public.project_baselines(id) on delete cascade,
  -- денормализация: без project_id политика SELECT либо джойнит заголовок на каждую строку,
  -- либо вырождается в org-широкую. Пишется RPC вместе с baseline_id.
  project_id   uuid not null references public.projects(id) on delete cascade,
  task_id      uuid not null references public.tasks(id) on delete cascade,
  start_date   date not null,
  end_date     date not null,
  is_milestone boolean not null default false,
  unique (baseline_id, task_id)
);

-- org_id: ставится триггером и замораживается. Авто-цикл 054 новые таблицы не покрывает —
-- выписываем оба триггера явно на обе таблицы.
create trigger trg_set_org_id_project_baselines before insert on public.project_baselines
  for each row execute function public.set_org_id();
create trigger trg_freeze_org_id_project_baselines before update on public.project_baselines
  for each row execute function public.freeze_org_id();
create trigger trg_set_org_id_baseline_tasks before insert on public.baseline_tasks
  for each row execute function public.set_org_id();
create trigger trg_freeze_org_id_baseline_tasks before update on public.baseline_tasks
  for each row execute function public.freeze_org_id();

alter table public.project_baselines enable row level security;
alter table public.baseline_tasks    enable row level security;

create index if not exists idx_project_baselines_org_project
  on public.project_baselines (org_id, project_id, created_at desc);
create index if not exists idx_baseline_tasks_baseline on public.baseline_tasks (baseline_id);
create index if not exists idx_baseline_tasks_org_project
  on public.baseline_tasks (org_id, project_id);
create index if not exists idx_baseline_tasks_task on public.baseline_tasks (task_id);

-- Видимость = дословное зеркало project_messages_select (067): org-граница первым конъюнктом,
-- дальше owner/admin org, либо владелец/создатель проекта, либо is_project_member. Один и тот
-- же предикат на обеих таблицах — поэтому project_id денормализован в baseline_tasks.
create policy project_baselines_select on public.project_baselines
  for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.current_org_role()) in ('owner', 'admin')
      or exists (
        select 1 from public.projects p
        where p.id = project_id
          and (p.owner_id = (select auth.uid()) or p.created_by = (select auth.uid()))
      )
      or (select public.is_project_member(project_id))
    )
  );

-- DELETE: только owner/admin org. Физическое удаление, baseline_tasks уходят каскадом.
create policy project_baselines_delete on public.project_baselines
  for delete to authenticated
  using (
    org_id = (select public.current_org_id())
    and (select public.current_org_role()) in ('owner', 'admin')
  );

create policy baseline_tasks_select on public.baseline_tasks
  for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.current_org_role()) in ('owner', 'admin')
      or exists (
        select 1 from public.projects p
        where p.id = project_id
          and (p.owner_id = (select auth.uid()) or p.created_by = (select auth.uid()))
      )
      or (select public.is_project_member(project_id))
    )
  );

-- INSERT-политик нет ни на одной таблице: единственный путь записи — RPC security definer
-- (RLS к владельцу таблиц не применяется, force row level security нигде не включён). Прямой
-- INSERT заголовка клиентом дал бы пустой baseline без строк. UPDATE-политик нет по иммутабельности.
grant select, delete on public.project_baselines to authenticated;
grant select          on public.baseline_tasks    to authenticated;
revoke all on public.project_baselines from anon;
revoke all on public.baseline_tasks    from anon;

-- RPC: атомарный слепок одним INSERT..SELECT. org_id проставит триггер set_org_id().
create or replace function public.create_project_baseline(p_project_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if not exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.org_id = public.current_org_id()
  ) then
    raise exception 'Проект не найден' using errcode = '42501';
  end if;
  if coalesce(public.current_org_role(), '') not in ('owner', 'admin', 'manager') then
    raise exception 'Недостаточно прав' using errcode = '42501';
  end if;

  insert into public.project_baselines (project_id, name, created_by)
  values (p_project_id, trim(p_name), auth.uid())
  returning id into v_id;

  -- Слепок повторяет effectiveSpan из use-project-schedule.ts, иначе задачи, нарисованные на
  -- Ганте только по deadline, в план не попадут и после первого сдвига получат «вне плана».
  --   start = start_date ?? end_date ?? deadline(MSK)
  --   end   = end_date ?? deadline(MSK) ?? start_date, клэмп end < start → end = start
  with src as (
    select t.id,
           t.start_date,
           t.end_date,
           (t.deadline at time zone 'Europe/Moscow')::date as dl,
           t.is_milestone
    from public.tasks t
    where t.project_id = p_project_id          -- у tasks НЕТ deleted_at: фильтра здесь быть не может
  )
  insert into public.baseline_tasks
    (baseline_id, project_id, task_id, start_date, end_date, is_milestone)
  select v_id,
         p_project_id,
         s.id,
         coalesce(s.start_date, s.end_date, s.dl),
         greatest(coalesce(s.end_date, s.dl, s.start_date),
                  coalesce(s.start_date, s.end_date, s.dl)),
         s.is_milestone
  from src s
  where coalesce(s.start_date, s.end_date, s.dl) is not null;

  return v_id;
end $$;

revoke all on function public.create_project_baseline(uuid, text) from public, anon;
grant execute on function public.create_project_baseline(uuid, text) to authenticated;
