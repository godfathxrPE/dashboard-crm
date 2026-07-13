-- === 035_delivery_projects.sql ===
-- Спринт «Проекты (delivery) P1»: type='delivery', spawn из won-сделки,
-- reseed project-пайплайнов под 4 состояния (phase_group-слаги).
-- Дизайн: _analysis/architecture-delivery-projects.md (D3 v2 + §8 + §9 ФИНАЛ).

-- 1) Тип delivery
ALTER TABLE public.projects DROP CONSTRAINT projects_type_chk;
ALTER TABLE public.projects ADD CONSTRAINT projects_type_chk CHECK (type IN ('client','internal','delivery'));

-- 2) Новые поля (аддитивно)
ALTER TABLE public.projects
  ADD COLUMN parent_deal_id  uuid REFERENCES public.projects(id) ON DELETE RESTRICT,
  ADD COLUMN delivery_kind   text CHECK (delivery_kind IN ('launch','experiment')),
  ADD COLUMN do_url          text,
  ADD COLUMN do_external_id  text,
  ADD COLUMN do_synced_at    timestamptz,
  ADD COLUMN progress_done   int NOT NULL DEFAULT 0,
  ADD COLUMN progress_total  int NOT NULL DEFAULT 0;

-- 3) Инвариант type↔pipeline: 3-я ветка delivery
ALTER TABLE public.projects DROP CONSTRAINT projects_type_pipeline_chk;
ALTER TABLE public.projects ADD CONSTRAINT projects_type_pipeline_chk CHECK (
     (type='client'   AND pipeline_id IS NOT NULL AND stage_id IS NOT NULL AND direction IS NOT NULL)
  OR (type='internal' AND pipeline_id IS NULL     AND stage_id IS NULL)
  OR (type='delivery' AND pipeline_id IS NOT NULL AND stage_id IS NOT NULL AND direction IS NOT NULL
        AND parent_deal_id IS NOT NULL AND delivery_kind IS NOT NULL)
);

-- 4) Статус delivery: только open/completed
ALTER TABLE public.projects ADD CONSTRAINT projects_delivery_status_chk CHECK (
  type <> 'delivery' OR status IN ('open','completed')
);

-- 5) Индекс parent_deal_id
CREATE INDEX IF NOT EXISTS idx_projects_parent_deal_id ON public.projects(parent_deal_id)
  WHERE parent_deal_id IS NOT NULL;

-- 6) null_internal_stage: нулить legacy stage и для delivery
CREATE OR REPLACE FUNCTION public.null_internal_stage()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF NEW.type IN ('internal','delivery') THEN NEW.stage := NULL; END IF;
  RETURN NEW;
END $$;

-- 7) Reseed project-пайплайнов под §9 ФИНАЛ. ВСЕ is_won=false,is_lost=false
--    (иначе sync_* выставят status='won' — нарушит projects_delivery_status_chk).
--    phase_group = слаги. Стадии никто не референсит (0 projects, 0 automations) —
--    сверено по prod 2026-07-10.
DELETE FROM public.pipeline_stages
  WHERE pipeline_id IN ('a0000000-0000-4000-8000-000000000004','a0000000-0000-4000-8000-000000000003');

INSERT INTO public.pipeline_stages (pipeline_id, name, order_index, phase_group, is_won, is_lost) VALUES
  ('a0000000-0000-4000-8000-000000000004','Инициация',      1,'initiated', false,false),
  ('a0000000-0000-4000-8000-000000000004','Планирование',   2,'planning',  false,false),
  ('a0000000-0000-4000-8000-000000000004','Обследование',   3,'execution', false,false),
  ('a0000000-0000-4000-8000-000000000004','Моделирование',  4,'execution', false,false),
  ('a0000000-0000-4000-8000-000000000004','Проектирование', 5,'execution', false,false),
  ('a0000000-0000-4000-8000-000000000004','Разработка',     6,'execution', false,false),
  ('a0000000-0000-4000-8000-000000000004','Внедрение',      7,'execution', false,false),
  ('a0000000-0000-4000-8000-000000000004','Эксплуатация',   8,'completed', false,false);

INSERT INTO public.pipeline_stages (pipeline_id, name, order_index, phase_group, is_won, is_lost) VALUES
  ('a0000000-0000-4000-8000-000000000003','Инициация',              1,'initiated', false,false),
  ('a0000000-0000-4000-8000-000000000003','Подготовительный этап',  2,'planning',  false,false),
  ('a0000000-0000-4000-8000-000000000003','Установка БИТ.MDT',      3,'execution', false,false),
  ('a0000000-0000-4000-8000-000000000003','Подготовка оборудования',4,'execution', false,false),
  ('a0000000-0000-4000-8000-000000000003','Запуск',                 5,'execution', false,false),
  ('a0000000-0000-4000-8000-000000000003','Регулярные мероприятия', 6,'execution', false,false),
  ('a0000000-0000-4000-8000-000000000003','Передача на поддержку',  7,'completed', false,false);

-- 8) RPC spawn_delivery_project — эталон convert_lead (SECURITY DEFINER,
--    NULL-safe org-гард) + ownership-гард (владелец/создатель сделки или org-админ).
CREATE OR REPLACE FUNCTION public.spawn_delivery_project(p_deal_id uuid, p_kind text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE
  v_deal        record;
  v_privileged  boolean;
  v_pipeline_id uuid;
  v_first_stage uuid;
  v_new_id      uuid;
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

  -- Ownership: владелец/создатель сделки, либо привилегированная роль org (RBAC-матрица архитектуры).
  SELECT EXISTS(
    SELECT 1 FROM public.memberships m
    WHERE m.profile_id = auth.uid() AND m.org_id = v_deal.org_id AND m.role IN ('owner','admin')
  ) INTO v_privileged;
  IF NOT (v_deal.owner_id = auth.uid() OR v_deal.created_by = auth.uid() OR v_privileged) THEN
    RAISE EXCEPTION 'only deal owner or org admin can spawn delivery' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_pipeline_id FROM public.pipelines
   WHERE entity_type='project' AND direction=v_deal.direction AND is_default=true LIMIT 1;
  IF v_pipeline_id IS NULL THEN
    RAISE EXCEPTION 'no project pipeline for direction %', v_deal.direction USING ERRCODE='P0001';
  END IF;
  SELECT id INTO v_first_stage FROM public.pipeline_stages
   WHERE pipeline_id=v_pipeline_id ORDER BY order_index LIMIT 1;

  INSERT INTO public.projects (
    org_id, owner_id, created_by, name, type, direction,
    pipeline_id, stage_id, stage, status, company_id, contact_id, parent_deal_id, delivery_kind
  ) VALUES (
    v_deal.org_id, COALESCE(v_deal.owner_id, auth.uid()), auth.uid(),
    v_deal.name || ' — внедрение', 'delivery', v_deal.direction,
    v_pipeline_id, v_first_stage, NULL, 'open',
    v_deal.company_id, v_deal.contact_id, p_deal_id, p_kind
  ) RETURNING id INTO v_new_id;

  RETURN v_new_id;
END $$;

REVOKE ALL ON FUNCTION public.spawn_delivery_project(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.spawn_delivery_project(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.spawn_delivery_project(uuid, text) FROM anon;  -- гейт-фикс: default-грант Supabase не снимается REVOKE FROM public
