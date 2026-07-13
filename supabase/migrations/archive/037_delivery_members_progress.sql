-- === 037_delivery_members_progress.sql ===
-- Спринт «delivery P2b»: project_members (3 роли) + RLS, прогресс X/Y триггером
-- (progress_done/total на projects) + бэкфилл, RPC apply_delivery_template,
-- фикс realtime-публикации (project_columns — pre-existing gap PCT-1).
-- Дизайн: _analysis/architecture-delivery-p2.md §14.
-- ⚠️ НЕ применена — применяет гейт (смоуки + advisors), после — типы вручную.

-- ═══════════════════════════════════════════════════════
-- 1) project_members + RLS
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('manager','implementer','installer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_project ON public.project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_members_profile ON public.project_members(profile_id);
CREATE INDEX IF NOT EXISTS idx_project_members_org ON public.project_members(org_id);

CREATE TRIGGER trg_set_org_id BEFORE INSERT ON public.project_members
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id();

ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY pm_select ON public.project_members FOR SELECT TO authenticated
  USING (org_id = ( SELECT public.current_org_id() ));

-- write: org + (owner/admin ∨ владелец проекта) — образец project_columns 032/034;
-- раздельные политики (урок 036b: FOR ALL дублирует SELECT → advisor-WARN)
CREATE POLICY pm_insert ON public.project_members FOR INSERT TO authenticated
  WITH CHECK (
    org_id = ( SELECT public.current_org_id() )
    AND (
      ( SELECT public.current_org_role() ) IN ('owner','admin')
      OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id
                 AND (p.owner_id = ( SELECT auth.uid() ) OR p.created_by = ( SELECT auth.uid() )))
    )
  );
CREATE POLICY pm_update ON public.project_members FOR UPDATE TO authenticated
  USING (
    org_id = ( SELECT public.current_org_id() )
    AND (
      ( SELECT public.current_org_role() ) IN ('owner','admin')
      OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id
                 AND (p.owner_id = ( SELECT auth.uid() ) OR p.created_by = ( SELECT auth.uid() )))
    )
  )
  -- WITH CHECK повторяет USING: иначе владелец проекта A мог бы перекинуть строку
  -- (project_id) в чужой проект B, где он не владелец
  WITH CHECK (
    org_id = ( SELECT public.current_org_id() )
    AND (
      ( SELECT public.current_org_role() ) IN ('owner','admin')
      OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id
                 AND (p.owner_id = ( SELECT auth.uid() ) OR p.created_by = ( SELECT auth.uid() )))
    )
  );
CREATE POLICY pm_delete ON public.project_members FOR DELETE TO authenticated
  USING (
    org_id = ( SELECT public.current_org_id() )
    AND (
      ( SELECT public.current_org_role() ) IN ('owner','admin')
      OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id
                 AND (p.owner_id = ( SELECT auth.uid() ) OR p.created_by = ( SELECT auth.uid() )))
    )
  );

-- ═══════════════════════════════════════════════════════
-- 2) Прогресс X/Y — триггер + бэкфилл
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.recalc_delivery_progress(p_project_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
DECLARE v_done int; v_total int;
BEGIN
  IF p_project_id IS NULL THEN RETURN; END IF;
  SELECT count(*) FILTER (WHERE lane = 'done'), count(*)
    INTO v_done, v_total
  FROM public.tasks WHERE project_id = p_project_id;
  -- пишем ТОЛЬКО при изменении: на projects висят безусловные AFTER UPDATE
  -- (on_stage_change, trg_zz_run_automations) — не гоняем их вхолостую
  UPDATE public.projects
     SET progress_done = v_done, progress_total = v_total
   WHERE id = p_project_id AND type = 'delivery'
     AND (progress_done IS DISTINCT FROM v_done OR progress_total IS DISTINCT FROM v_total);
END $$;

CREATE OR REPLACE FUNCTION public.sync_delivery_progress()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') THEN
    PERFORM public.recalc_delivery_progress(NEW.project_id);
  END IF;
  IF TG_OP IN ('DELETE','UPDATE') THEN
    IF TG_OP = 'DELETE' OR OLD.project_id IS DISTINCT FROM NEW.project_id THEN
      PERFORM public.recalc_delivery_progress(OLD.project_id);
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

-- AFTER + имя trg_zz_* (алфавитно после BEFORE-цепочки set_updated_at →
-- trg_aa_resolve_board → trg_set_org_id)
CREATE TRIGGER trg_zz_delivery_progress
  AFTER INSERT OR DELETE OR UPDATE OF lane, project_id ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.sync_delivery_progress();

-- триггерные definer-функции не для RPC (паттерн 034)
REVOKE ALL ON FUNCTION public.recalc_delivery_progress(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recalc_delivery_progress(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.recalc_delivery_progress(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.sync_delivery_progress() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_delivery_progress() FROM anon;
REVOKE ALL ON FUNCTION public.sync_delivery_progress() FROM authenticated;

-- бэкфилл существующих delivery-проектов (факт: 4 шт., 137 задач, всё 0/0)
DO $$
DECLARE v_id uuid;
BEGIN
  FOR v_id IN SELECT id FROM public.projects WHERE type = 'delivery' LOOP
    PERFORM public.recalc_delivery_progress(v_id);
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════
-- 3) apply_delivery_template — клиентский RPC (фазы для пустой доски).
--    Гарды — дословно по образцу spawn_delivery_project (035/036).
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.apply_delivery_template(p_project_id uuid, p_template_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_project     record;
  v_privileged  boolean;
  v_template_id uuid;
BEGIN
  SELECT * INTO v_project FROM public.projects
   WHERE id = p_project_id AND org_id = public.current_org_id() AND public.current_org_id() IS NOT NULL;
  IF v_project.id IS NULL THEN
    RAISE EXCEPTION 'project not found or access denied' USING ERRCODE = '42501';
  END IF;
  IF v_project.type <> 'delivery' THEN
    RAISE EXCEPTION 'phases can be applied only to a delivery project' USING ERRCODE = 'P0001';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.memberships m
    WHERE m.profile_id = auth.uid() AND m.org_id = v_project.org_id AND m.role IN ('owner','admin')
  ) INTO v_privileged;
  IF NOT (v_project.owner_id = auth.uid() OR v_project.created_by = auth.uid() OR v_privileged) THEN
    RAISE EXCEPTION 'only project owner or org admin can apply template' USING ERRCODE = '42501';
  END IF;

  IF p_template_id IS NOT NULL THEN
    SELECT id INTO v_template_id FROM public.delivery_templates
    WHERE id = p_template_id AND org_id = v_project.org_id AND is_active;
    IF v_template_id IS NULL THEN
      RAISE EXCEPTION 'template not found' USING ERRCODE = '22023';
    END IF;
  ELSE
    SELECT id INTO v_template_id FROM public.delivery_templates
    WHERE org_id = v_project.org_id AND direction = v_project.direction
      AND kind = v_project.delivery_kind AND is_active
    LIMIT 1;
    -- здесь НЕ graceful (в отличие от spawn): пользователь явно просит фазы —
    -- если шаблона нет, честная ошибка
    IF v_template_id IS NULL THEN
      RAISE EXCEPTION 'no template for direction % / kind %', v_project.direction, v_project.delivery_kind USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- copy_delivery_template сам гардит org-match и «already has columns»
  PERFORM public.copy_delivery_template(p_project_id, v_template_id);
END $$;

REVOKE ALL ON FUNCTION public.apply_delivery_template(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_delivery_template(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_delivery_template(uuid, uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════
-- 4) Realtime-публикация (фикс pre-existing gap PCT-1):
--    useRealtimeSync('project_columns') из P2a был мёртвой подпиской —
--    таблицы не было в supabase_realtime. Добавляем обе
--    (RLS на таблицах включён — realtime уважает политики).
-- ═══════════════════════════════════════════════════════

ALTER PUBLICATION supabase_realtime ADD TABLE public.project_columns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_members;
