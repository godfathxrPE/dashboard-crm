-- 052: WBS — иерархия задач (parent_task_id) + wbs_code (S-WBS-1)
-- Аддитивно к tasks. RLS наследуется (та же таблица). Родитель: тот же проект, без циклов.

alter table public.tasks
  add column if not exists parent_task_id uuid references public.tasks(id) on delete set null,
  add column if not exists wbs_code text;

-- Индекс под выборку детей и построение дерева
create index if not exists idx_tasks_parent on public.tasks(parent_task_id) where parent_task_id is not null;

-- Валидатор: self-ref / cross-project / cross-org / цикл по цепочке родителей.
-- Паттерн 048 (check_task_dependency_valid): DEFINER + search_path + адресный ACL.
create or replace function public.check_task_parent_valid()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_parent_project uuid; v_parent_org uuid;
begin
  if new.parent_task_id is null then
    return new;                                   -- корневая задача — ок
  end if;
  if new.parent_task_id = new.id then
    raise exception 'task cannot be its own parent' using errcode = '23514';
  end if;

  select project_id, org_id into v_parent_project, v_parent_org
    from public.tasks where id = new.parent_task_id;

  if v_parent_org is null then
    raise exception 'parent task not found' using errcode = '23503';
  end if;
  if v_parent_org is distinct from new.org_id then
    raise exception 'cross-org parent forbidden' using errcode = '42501';
  end if;
  -- B1 (паттерн 048): DEFINER читает tasks В ОБХОД RLS → родитель ОБЯЗАН
  -- принадлежать org вызывающего (иначе по известному UUID — cross-tenant привязка).
  -- Гард только для auth-контекста; service/MCP (auth.uid() IS NULL) не ломаем.
  if auth.uid() is not null then
    if public.current_org_id() is null
       or v_parent_org is distinct from public.current_org_id() then
      raise exception 'cross-org parent forbidden' using errcode = '42501';
    end if;
  end if;
  -- иерархия — в пределах одного проекта
  if new.project_id is null or v_parent_project is distinct from new.project_id then
    raise exception 'parent must be in the same project' using errcode = '23514';
  end if;

  -- цикл: если предок предполагаемого родителя = сама задача → замкнём дерево.
  -- Идём ВВЕРХ от parent к корню (граф до апдейта ацикличен — инвариант держит этот триггер).
  if exists (
    with recursive up(node) as (
      select new.parent_task_id
      union
      select t.parent_task_id
        from public.tasks t
        join up ON t.id = up.node
       where t.parent_task_id is not null
    )
    select 1 from up where node = new.id
  ) then
    raise exception 'parent would create a cycle' using errcode = 'P0001';
  end if;

  return new;
end $$;

revoke all on function public.check_task_parent_valid() from public, anon;
grant execute on function public.check_task_parent_valid() to service_role;

-- Имя zz_ → после set_org_id (org_id заполнен к моменту проверки)
drop trigger if exists trg_zz_check_task_parent on public.tasks;
create trigger trg_zz_check_task_parent
  before insert or update of parent_task_id, project_id on public.tasks
  for each row execute function public.check_task_parent_valid();

-- W4: перенос РОДИТЕЛЯ в другой проект осиротит его детей (check_task_parent_valid
-- валидирует ТОЛЬКО меняемую строку — дети остаются cross-project orphan). Дешёвый
-- AFTER-guard: при смене project_id родителя — обнулить parent_task_id у детей,
-- оставшихся в старом проекте (ON DELETE SET NULL зеркалит поведение при удалении).
create or replace function public.orphan_children_on_project_move()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.project_id is distinct from old.project_id then
    update public.tasks set parent_task_id = null
      where parent_task_id = new.id
        and project_id is distinct from new.project_id;
  end if;
  return new;
end $$;

revoke all on function public.orphan_children_on_project_move() from public, anon;
grant execute on function public.orphan_children_on_project_move() to service_role;

drop trigger if exists trg_zz_orphan_children_project on public.tasks;
create trigger trg_zz_orphan_children_project
  after update of project_id on public.tasks
  for each row execute function public.orphan_children_on_project_move();
