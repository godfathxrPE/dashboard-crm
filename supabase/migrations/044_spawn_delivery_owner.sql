-- 044: Win Wizard — spawn_delivery_project расширена выбором owner/РП (S-WIN-WIZARD-1)
--
-- Аддитивно и обратносовместимо: добавлен 4-й параметр p_owner_id uuid DEFAULT NULL,
-- поэтому старые 3-арговые вызовы продолжают работать. owner нового внедрения =
-- COALESCE(p_owner_id, deal.owner_id, auth.uid()). Назначаемый owner валидируется
-- как член той же организации (иначе 42501) — нельзя «подарить» проект чужаку.
--
-- ACL: EXECUTE только authenticated (anon revoked) — функция SECURITY DEFINER,
-- org/ownership-гарды внутри опираются на auth.uid()/current_org_id().
--
-- ФУНКЦИЯ УЖЕ НА ПРОДЕ (применено через Supabase MCP до этого файла). Оформлено
-- идемпотентно (CREATE OR REPLACE + revoke/grant), повторный прогон безопасен.

CREATE OR REPLACE FUNCTION public.spawn_delivery_project(
  p_deal_id uuid,
  p_kind text,
  p_template_id uuid DEFAULT NULL::uuid,
  p_owner_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_deal        record;
  v_privileged  boolean;
  v_pipeline_id uuid;
  v_first_stage uuid;
  v_new_id      uuid;
  v_template_id uuid;
BEGIN
  IF p_kind NOT IN ('launch','experiment') THEN
    RAISE EXCEPTION 'invalid delivery_kind' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_deal FROM public.projects
   WHERE id = p_deal_id AND org_id = public.current_org_id() AND public.current_org_id() IS NOT NULL;
  IF v_deal.id IS NULL THEN
    RAISE EXCEPTION 'deal not found or access denied' USING ERRCODE = '42501';
  END IF;
  IF v_deal.type <> 'client' OR v_deal.status <> 'won' THEN
    RAISE EXCEPTION 'delivery can be spawned only from a won client deal' USING ERRCODE = 'P0001';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.memberships m
    WHERE m.profile_id = auth.uid() AND m.org_id = v_deal.org_id AND m.role IN ('owner','admin')
  ) INTO v_privileged;
  IF NOT (v_deal.owner_id = auth.uid() OR v_deal.created_by = auth.uid() OR v_privileged) THEN
    RAISE EXCEPTION 'only deal owner or org admin can spawn delivery' USING ERRCODE = '42501';
  END IF;

  -- Win Wizard (044): назначаемый owner должен быть членом орга
  IF p_owner_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM public.memberships m WHERE m.profile_id = p_owner_id AND m.org_id = v_deal.org_id
  ) THEN
    RAISE EXCEPTION 'assigned owner is not a member of the org' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_pipeline_id FROM public.pipelines
   WHERE entity_type='project' AND direction=v_deal.direction AND is_default=true LIMIT 1;
  IF v_pipeline_id IS NULL THEN
    RAISE EXCEPTION 'no project pipeline for direction %', v_deal.direction USING ERRCODE='P0001';
  END IF;
  SELECT id INTO v_first_stage FROM public.pipeline_stages
   WHERE pipeline_id=v_pipeline_id ORDER BY order_index LIMIT 1;

  IF p_template_id IS NOT NULL THEN
    SELECT id INTO v_template_id FROM public.delivery_templates
    WHERE id = p_template_id AND org_id = v_deal.org_id AND is_active;
    IF v_template_id IS NULL THEN
      RAISE EXCEPTION 'template not found' USING ERRCODE = '22023';
    END IF;
  ELSE
    SELECT id INTO v_template_id FROM public.delivery_templates
    WHERE org_id = v_deal.org_id AND direction = v_deal.direction
      AND kind = p_kind AND is_active
    LIMIT 1;
  END IF;

  INSERT INTO public.projects (
    org_id, owner_id, created_by, name, type, direction,
    pipeline_id, stage_id, stage, status, company_id, contact_id, parent_deal_id, delivery_kind
  ) VALUES (
    v_deal.org_id,
    COALESCE(p_owner_id, v_deal.owner_id, auth.uid()),
    auth.uid(),
    v_deal.name || ' — внедрение', 'delivery', v_deal.direction,
    v_pipeline_id, v_first_stage, NULL, 'open',
    v_deal.company_id, v_deal.contact_id, p_deal_id, p_kind
  ) RETURNING id INTO v_new_id;

  IF v_template_id IS NOT NULL THEN
    PERFORM public.copy_delivery_template(v_new_id, v_template_id);
  END IF;

  RETURN v_new_id;
END $function$;

-- ACL: только authenticated (anon не должен звать spawn — org-контекст берётся из JWT)
REVOKE ALL ON FUNCTION public.spawn_delivery_project(uuid, text, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.spawn_delivery_project(uuid, text, uuid, uuid) TO authenticated;
