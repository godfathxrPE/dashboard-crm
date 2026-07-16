-- 048: task_dependencies — рёбра DAG между задачами (Gantt-зависимости, FS v1)

create table if not exists public.task_dependencies (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  predecessor_id  uuid not null references public.tasks(id) on delete cascade,
  successor_id    uuid not null references public.tasks(id) on delete cascade,
  dep_type        text not null default 'FS' check (dep_type in ('FS','SS','FF','SF')),
  lag_days        int  not null default 0,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint task_dep_no_self check (predecessor_id <> successor_id),
  constraint task_dep_uniq unique (predecessor_id, successor_id)
);

create index if not exists idx_task_dep_org          on public.task_dependencies(org_id);
create index if not exists idx_task_dep_successor    on public.task_dependencies(successor_id);
create index if not exists idx_task_dep_predecessor  on public.task_dependencies(predecessor_id);

-- org_id автозаполнение (паттерн tenant-таблиц; функция public.set_org_id() — baseline)
create trigger trg_set_org_id
  before insert on public.task_dependencies
  for each row execute function public.set_org_id();

-- Валидатор: self-loop / cross-org / cross-project / cycle (DAG)
create or replace function public.check_task_dependency_valid()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pred_project uuid; v_pred_org uuid;
  v_succ_project uuid; v_succ_org uuid;
begin
  if new.predecessor_id = new.successor_id then
    raise exception 'task cannot depend on itself' using errcode = '23514';
  end if;

  select project_id, org_id into v_pred_project, v_pred_org
    from public.tasks where id = new.predecessor_id;
  select project_id, org_id into v_succ_project, v_succ_org
    from public.tasks where id = new.successor_id;

  if v_pred_org is null or v_succ_org is null then
    raise exception 'task not found' using errcode = '23503';
  end if;
  if v_pred_org is distinct from v_succ_org then
    raise exception 'cross-org dependency forbidden' using errcode = '42501';
  end if;

  -- B1: DEFINER читает tasks В ОБХОД RLS → обе задачи ОБЯЗАНЫ принадлежать org
  -- вызывающего. Иначе по известным UUID можно создать ребро своего org на чужие
  -- задачи (cross-tenant orphan). NULL-safe (learnings: PCT-1 delete_project_column).
  -- Гард только для auth-контекста; service/MCP (auth.uid() IS NULL) не ломаем.
  if auth.uid() is not null then
    if public.current_org_id() is null
       or v_pred_org is distinct from public.current_org_id()
       or v_succ_org is distinct from public.current_org_id() then
      raise exception 'cross-org dependency forbidden' using errcode = '42501';
    end if;
  end if;

  -- зависимости — в пределах одного проекта (Gantt проектный)
  if v_pred_project is null or v_succ_project is null
     or v_pred_project is distinct from v_succ_project then
    raise exception 'dependency requires both tasks in the same project'
      using errcode = '23514';
  end if;

  -- цикл: успешор УЖЕ достигает предшественника → ребро замкнёт DAG
  -- (граф до вставки ацикличен — этот же триггер гарантирует инвариант)
  if exists (
    with recursive reach(node) as (
      select d.successor_id
        from public.task_dependencies d
       where d.predecessor_id = new.successor_id
      union
      select d.successor_id
        from public.task_dependencies d
        join reach r on d.predecessor_id = r.node
    )
    select 1 from reach where node = new.predecessor_id
  ) then
    raise exception 'dependency would create a cycle' using errcode = 'P0001';
  end if;

  return new;
end $$;

-- имя zz_ → триггер срабатывает ПОСЛЕ trg_set_org_id (алфавит: set_ < zz_),
-- org_id уже заполнен на момент проверки
create trigger trg_zz_check_task_dependency
  before insert on public.task_dependencies
  for each row execute function public.check_task_dependency_valid();

-- Hardening (конвенция проекта для триггерных функций)
revoke all on function public.check_task_dependency_valid() from public, anon;
grant execute on function public.check_task_dependency_valid() to service_role;

-- RLS
alter table public.task_dependencies enable row level security;

-- SELECT — org-wide (как project_columns): все члены org видят стрелки чужих задач на Гантте
create policy task_dep_select on public.task_dependencies
  for select using ( org_id = ( select public.current_org_id() ) );

-- INSERT/DELETE — org + роль owner/admin/manager (кто ведёт расписание). viewer — read-only.
create policy task_dep_insert on public.task_dependencies
  for insert with check (
    org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin','manager')
  );

create policy task_dep_delete on public.task_dependencies
  for delete using (
    org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin','manager')
  );
-- UPDATE-политики НЕТ: ребро иммутабельно (изменение = delete + create).

grant select, insert, delete on public.task_dependencies to authenticated;
revoke all on public.task_dependencies from anon;
