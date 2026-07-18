-- 056b — advisor-гигиена вслед 056 (применена на гейте W1, 2026-07-18).
-- Линт authenticated_security_definer_function_executable: у ЧИСТО триггерных
-- функций снимаем EXECUTE для authenticated/anon (конвенция learnings: EXECUTE
-- проверяется при CREATE TRIGGER, триггеры уже созданы; клиенту эти функции не нужны).
-- НЕ трогаем: RPC, которые зовёт клиент (convert_lead, reorder_tasks, spawn_delivery_project,
-- apply_delivery_template, check_delivery_completion, check_stage_requirements,
-- delete_project_column, current_org_id/role) и helpers из RLS-политик
-- (is_org_member, shares_org_with) — они исполняются под ролью вызывающего.

revoke execute on function public.notify_deal_won() from anon, authenticated;
revoke execute on function public.orphan_children_on_project_move() from anon, authenticated;
revoke execute on function public.stamp_quote_status() from anon, authenticated;
revoke execute on function public.check_task_dependency_valid() from anon, authenticated;
revoke execute on function public.check_task_parent_valid() from anon, authenticated;

grant execute on function public.notify_deal_won() to service_role;
grant execute on function public.orphan_children_on_project_move() to service_role;
grant execute on function public.stamp_quote_status() to service_role;
grant execute on function public.check_task_dependency_valid() to service_role;
grant execute on function public.check_task_parent_valid() to service_role;
