-- 062: UPDATE-политика task_dependencies (правка lag_days из Gantt, S-SCHEDULE-1a).
-- До сих пор ребро было иммутабельно (048: только INSERT/DELETE/SELECT) — правка
-- lag из клиента упиралась в RLS deny. Предикат — как task_dep_insert/delete
-- (org + роль owner/admin/manager); WITH CHECK (новая строка) по конвенции 054
-- (ловит SET org_id / смену тенанта).
--
-- NB: RLS — row-level, не column-level; ограничение «только lag_days» — на стороне
-- клиента (мутация шлёт только lag_days). WITH CHECK на org_id не даёт увести
-- строку в чужой тенант даже без freeze-триггера.
--
-- Долг (W5, не этот спринт): check_task_dependency_valid — только BEFORE INSERT;
-- через API UPDATE можно сменить predecessor/successor в обход DAG-валидации.
-- v1 приемлемо (клиент шлёт только lag_days); hardening — отдельный заход.

create policy task_dep_update on public.task_dependencies
  for update using (
    org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin','manager')
  )
  with check (
    org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin','manager')
  );

-- B1: на живой БД UPDATE-привилегия у authenticated уже есть (дефолты Supabase),
-- но 048 грантовал явно только select/insert/delete — фиксируем намерение
-- идемпотентно (защита от дрейфа дефолтов, как quotes 053).
grant update on public.task_dependencies to authenticated;
