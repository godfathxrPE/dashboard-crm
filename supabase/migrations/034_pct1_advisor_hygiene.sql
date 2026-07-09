-- 034: advisor-гигиена по объектам PCT-1 (гейт 2026-07-09).
-- В живой БД применено двумя миграциями: pct1_advisor_hygiene + pct1_rls_initplan_fix.

-- 1) Фиксированный search_path (function_search_path_mutable):
ALTER FUNCTION public.null_internal_stage()       SET search_path = public, pg_temp;
ALTER FUNCTION public.category_to_lane(text)      SET search_path = public, pg_temp;
ALTER FUNCTION public.lane_to_category(task_lane) SET search_path = public, pg_temp;

-- 2) Триггерные SECURITY DEFINER функции не должны торчать в REST RPC
--    (anon/authenticated_security_definer_function_executable):
REVOKE ALL ON FUNCTION public.resolve_task_board()           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.seed_project_columns()         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_lane_on_category_change() FROM PUBLIC, anon, authenticated;
-- delete_project_column: EXECUTE для authenticated ОСТАВЛЕН намеренно — клиентский API.

-- 3) auth_rls_initplan: auth.uid() → (select auth.uid()) в write-политиках project_columns.

DROP POLICY IF EXISTS "project_columns_insert" ON public.project_columns;
CREATE POLICY "project_columns_insert" ON public.project_columns
  FOR INSERT
  WITH CHECK (
    org_id = ( SELECT public.current_org_id() )
    AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
      OR EXISTS ( SELECT 1 FROM public.projects p
                  WHERE p.id = project_id
                    AND (p.owner_id = ( SELECT auth.uid() ) OR p.created_by = ( SELECT auth.uid() )) ) )
  );

DROP POLICY IF EXISTS "project_columns_update" ON public.project_columns;
CREATE POLICY "project_columns_update" ON public.project_columns
  FOR UPDATE
  USING (
    org_id = ( SELECT public.current_org_id() )
    AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
      OR EXISTS ( SELECT 1 FROM public.projects p
                  WHERE p.id = project_id
                    AND (p.owner_id = ( SELECT auth.uid() ) OR p.created_by = ( SELECT auth.uid() )) ) )
  )
  WITH CHECK ( org_id = ( SELECT public.current_org_id() ) );

DROP POLICY IF EXISTS "project_columns_delete" ON public.project_columns;
CREATE POLICY "project_columns_delete" ON public.project_columns
  FOR DELETE
  USING (
    org_id = ( SELECT public.current_org_id() )
    AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
      OR EXISTS ( SELECT 1 FROM public.projects p
                  WHERE p.id = project_id
                    AND (p.owner_id = ( SELECT auth.uid() ) OR p.created_by = ( SELECT auth.uid() )) ) )
  );
