-- ═══════════════════════════════════════════════════════════════════════════
-- 038 — Delivery P3: гейт завершения «Передача на поддержку».
-- «Завершить проект» (status open→completed, только type='delivery') блокируется,
-- пока ВСЕ is_milestone-задачи проекта не в lane='done'. Шаблон-агностично:
-- у ERP приёмки размазаны по фазам (6 вех), у IIoT launch — чек-лист «Передачи
-- на поддержку» (3 вехи), у IIoT experiment вех нет (завершается свободно).
-- Enforcement двухуровневый (S27-паттерн): check-функция для UI-чеклиста +
-- BEFORE-триггер как backstop (прямой UPDATE через API тоже блокируется).
-- Дизайн: _analysis/sprint-delivery-p3.md.
-- ⚠️ НЕ применена — применяет гейт (смоуки + advisors).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════
-- 1) tasks.is_milestone — флаг вехи приёмки.
--    До 038 флаг жил только в delivery_template_tasks и терялся при
--    копировании шаблона (copy_delivery_template, 036).
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS is_milestone boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_tasks_milestone ON public.tasks(project_id) WHERE is_milestone;

-- ═══════════════════════════════════════════════════════
-- 2) copy_delivery_template — переносить is_milestone из шаблона.
--    Тело из 036, изменение одно: колонка is_milestone в INSERT + tt.is_milestone
--    в SELECT. ACL (REVOKE все роли, 036) при CREATE OR REPLACE сохраняется.
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.copy_delivery_template(p_project_id uuid, p_template_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_project public.projects;
  v_phase record;
  v_col_id uuid;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND OR v_project.type <> 'delivery' THEN
    RAISE EXCEPTION 'delivery project not found';
  END IF;
  -- шаблон обязан принадлежать org проекта
  IF NOT EXISTS (SELECT 1 FROM public.delivery_templates
                 WHERE id = p_template_id AND org_id = v_project.org_id) THEN
    RAISE EXCEPTION 'template org mismatch';
  END IF;
  -- guard повторного копирования (защита будущей кнопки «Создать из шаблона», P2b):
  IF EXISTS (SELECT 1 FROM public.project_columns WHERE project_id = p_project_id) THEN
    RAISE EXCEPTION 'project already has columns';
  END IF;

  FOR v_phase IN
    SELECT * FROM public.delivery_template_phases
    WHERE template_id = p_template_id ORDER BY position
  LOOP
    INSERT INTO public.project_columns (org_id, project_id, name, category, position)
    VALUES (v_project.org_id, p_project_id, v_phase.name, 'phase', v_phase.position)
    RETURNING id INTO v_col_id;

    -- lane='next' ЯВНО (DEFAULT tasks.lane = 'now'); column_id явный →
    -- resolve_task_board его сохранит, а category='phase' не перезапишет lane.
    INSERT INTO public.tasks (org_id, project_id, column_id, lane, text, sort_order,
                              company_id, contact_id, created_by, is_milestone)
    SELECT v_project.org_id, p_project_id, v_col_id, 'next'::task_lane,
           COALESCE(tt.wbs_code || '. ', '') || tt.title, tt.sort_order,
           v_project.company_id, v_project.contact_id,
           COALESCE(auth.uid(), v_project.created_by), tt.is_milestone
    FROM public.delivery_template_tasks tt
    WHERE tt.phase_id = v_phase.id AND tt.default_enabled
    ORDER BY tt.sort_order;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════
-- 3) Бэкфилл существующих delivery-задач: матч на шаблонную веху по
--    тексту (wbs-префикс + title) внутри org проекта. org-фильтр обязателен —
--    без него возможен кросс-org ложный матч по одинаковому тексту.
--    Переименованные пользователем задачи бэкфилл пропустит — осознанно
--    (контроль на «ОМК — внедрение»: ровно 3 вехи 4.2/4.3/4.5).
-- ═══════════════════════════════════════════════════════

UPDATE public.tasks t SET is_milestone = true
FROM public.projects p, public.project_columns pc, public.delivery_template_tasks tt
WHERE t.project_id = p.id AND p.type = 'delivery'
  AND pc.id = t.column_id AND pc.category = 'phase'
  AND tt.is_milestone
  AND tt.org_id = p.org_id
  AND t.text = COALESCE(tt.wbs_code || '. ', '') || tt.title
  AND NOT t.is_milestone;

-- ═══════════════════════════════════════════════════════
-- 4) check_delivery_completion — чеклист готовности к завершению.
--    Та же проверка, что и enforcement-триггер (S27-паттерн: одна истина
--    для UI и backstop). Возвращает jsonb:
--    { "ready": bool, "open_milestones": [{id, text, phase, lane}, …] }
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.check_delivery_completion(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_open    jsonb;
BEGIN
  -- Гард входа: проект существует, delivery, вызывающий — член его org (S27, 027).
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'delivery_gate_check_denied: project not found'
      USING ERRCODE = '42501';
  END IF;
  IF v_project.type <> 'delivery' THEN
    RAISE EXCEPTION 'delivery_gate_check_denied: project is not delivery'
      USING ERRCODE = '42501';
  END IF;
  -- Гард только для auth-контекста: защищает RPC-поверхность от чужих org.
  -- Service-контекст (auth.uid() IS NULL: триггер под служебными операциями,
  -- бэкфиллы) гард пропускает — вехи всё равно проверяются ниже.
  -- Membership — по org ПРОЕКТА, не current_org_id() (edge: пользователь в двух org).
  IF auth.uid() IS NOT NULL AND NOT public.is_org_member(v_project.org_id) THEN
    RAISE EXCEPTION 'delivery_gate_check_denied: not a member of project org'
      USING ERRCODE = '42501';
  END IF;

  -- Открытые вехи: is_milestone AND lane <> 'done'.
  -- phase — имя колонки доски (LEFT JOIN: column_id nullable).
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('id', t.id, 'text', t.text, 'phase', pc.name, 'lane', t.lane)
      ORDER BY t.text
    ),
    '[]'::jsonb
  )
  INTO v_open
  FROM public.tasks t
  LEFT JOIN public.project_columns pc ON pc.id = t.column_id
  WHERE t.project_id = p_project_id
    AND t.is_milestone
    AND t.lane <> 'done';

  RETURN jsonb_build_object(
    'ready',           jsonb_array_length(v_open) = 0,
    'open_milestones', v_open
  );
END;
$$;

-- Урок P1: REVOKE FROM PUBLIC не снимает default-грант anon — явный REVOKE anon обязателен.
REVOKE ALL ON FUNCTION public.check_delivery_completion(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.check_delivery_completion(uuid) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════
-- 5) Enforcement-триггер (backstop): прямой UPDATE status через API тоже
--    блокируется. БЕЗ EXCEPTION-глотания — гейт обязан блокировать (S27,
--    противоположность notify/automation-функциям). NEW не трогаем.
--    UI парсит message = 'delivery_gate_failed' + DETAIL (jsonb-массив вех,
--    тот же shape, что open_milestones RPC).
--    Reopen (completed→open) и client/internal-проекты гейт не трогает.
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.enforce_delivery_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NEW.type = 'delivery' AND OLD.status = 'open' AND NEW.status = 'completed' THEN
    -- Та же проверка, что RPC-чеклист. В триггерном контексте service-операций
    -- auth.uid() IS NULL — org-гард внутри пропустит (S27-паттерн).
    v_result := public.check_delivery_completion(NEW.id);
    IF NOT (v_result->>'ready')::boolean THEN
      RAISE EXCEPTION 'delivery_gate_failed'
        USING DETAIL = (v_result->'open_milestones')::text, ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_delivery_completion() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.enforce_delivery_completion() TO service_role;

-- Имя trg_zz_* — BEFORE-триггеры выполняются по алфавиту: гейт идёт ПОСЛЕДНИМ
-- (после set_updated_at, trg_aa_enforce_stage_gate, trg_ab_null_internal_stage,
-- trg_sync_*) и видит финальные NEW. С S27 не конфликтует: тот реагирует на
-- stage_id, P3 — на status. Сверено с pg_trigger на проде 2026-07-12.
DROP TRIGGER IF EXISTS trg_zz_delivery_completion_gate ON public.projects;
CREATE TRIGGER trg_zz_delivery_completion_gate
  BEFORE UPDATE OF status ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_delivery_completion();
