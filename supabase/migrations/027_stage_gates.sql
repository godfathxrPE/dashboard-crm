-- ═══════════════════════════════════════════════════════════════════════════
-- Sprint 27 — Стадийные гейты (Blueprint v1)
--
-- stage_requirements  — org-scoped конфиг требований на ВХОД в стадию (UI owner/admin).
-- check_stage_requirements()  — единая проверка для триггера И UI-чек-листа.
-- aa_enforce_stage_gate() + trg_aa_enforce_stage_gate — блокирующий BEFORE-триггер.
--
-- КОНТРАКТ: файл пишется и коммитится из Claude Code, НЕ применяется. Применяет
--           гейт Cowork (apply_migration → smoke → advisors).
--
-- ПОРЯДОК BEFORE-триггеров на projects (по алфавиту имени):
--   set_updated_at → trg_aa_enforce_stage_gate → trg_set_org_id (INSERT) →
--   trg_sync_deal_stage_fields → trg_sync_project_stage
-- Префикс `trg_aa_` гарантирует, что гейт срабатывает ДО обоих trg_sync_* — гейт
-- отклоняет переход раньше, чем sync проставит stage_entered_at/status.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1.1 Таблица конфигурации требований ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.stage_requirements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id)  ON DELETE CASCADE,
  pipeline_id uuid NOT NULL REFERENCES public.pipelines(id)       ON DELETE CASCADE,
  stage_id    uuid NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
  requirement_type text NOT NULL CHECK (requirement_type IN ('field','file')),
  config      jsonb NOT NULL,   -- field: {"column":"budget"} | file: {"min_count":1,"label":"КП"}
  error_hint  text NOT NULL,    -- человекочитаемое «что сделать» для toast / чек-листа
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stage_req_org_stage
  ON public.stage_requirements(org_id, stage_id) WHERE is_active;

ALTER TABLE public.stage_requirements ENABLE ROW LEVEL SECURITY;

-- RLS: SELECT — все члены org; write — owner/admin. org_id задаётся ЯВНО из UI
-- (паттерн invitations/notifications — trg_set_org_id на таблицу НЕ вешается).
DROP POLICY IF EXISTS "stage_req_select" ON public.stage_requirements;
CREATE POLICY "stage_req_select" ON public.stage_requirements
  FOR SELECT
  USING ( org_id = ( SELECT public.current_org_id() ) );

DROP POLICY IF EXISTS "stage_req_insert" ON public.stage_requirements;
CREATE POLICY "stage_req_insert" ON public.stage_requirements
  FOR INSERT
  WITH CHECK (
    org_id = ( SELECT public.current_org_id() )
    AND ( SELECT public.current_org_role() ) IN ('owner','admin')
  );

DROP POLICY IF EXISTS "stage_req_update" ON public.stage_requirements;
CREATE POLICY "stage_req_update" ON public.stage_requirements
  FOR UPDATE
  USING (
    org_id = ( SELECT public.current_org_id() )
    AND ( SELECT public.current_org_role() ) IN ('owner','admin')
  )
  WITH CHECK (
    org_id = ( SELECT public.current_org_id() )
    AND ( SELECT public.current_org_role() ) IN ('owner','admin')
  );

DROP POLICY IF EXISTS "stage_req_delete" ON public.stage_requirements;
CREATE POLICY "stage_req_delete" ON public.stage_requirements
  FOR DELETE
  USING (
    org_id = ( SELECT public.current_org_id() )
    AND ( SELECT public.current_org_role() ) IN ('owner','admin')
  );

-- ─── 1.2 check_stage_requirements() — единая проверка для триггера и UI ───────
--
-- Возвращает jsonb-массив НЕзакрытых требований:
--   [{"type":"field","config":{...},"hint":"..."}]  — пустой массив = проход.
--
-- SECURITY DEFINER необходим: RLS project_files own-only (user_id), менеджер,
-- двигающий сделку, не видит файлы, загруженные админом → false negative под
-- INVOKER. Обход RLS требует явного гарда (урок convert_lead).
--
-- field-проверка: НИКАКОГО динамического SQL. Whitelist колонок жёстко в CASE —
-- барьер против SQL-injection через config гейта. Неизвестная колонка = пункт
-- НЕ пройден с пометкой «неподдерживаемая колонка».
CREATE OR REPLACE FUNCTION public.check_stage_requirements(
  p_project_id uuid,
  p_target_stage_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project    public.projects%ROWTYPE;
  v_req        record;
  v_unmet      jsonb := '[]'::jsonb;
  v_col        text;
  v_ok         boolean;
  v_min_count  int;
  v_file_count int;
BEGIN
  -- Гард входа: проект существует И вызывающий — член его org.
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'stage_gate_check_denied: project not found'
      USING ERRCODE = '42501';
  END IF;
  -- Гард только для auth-контекста: защищает RPC-поверхность от чужих org.
  -- Service-контекст (auth.uid() IS NULL: бэкфиллы, автоматизация, гейт-триггер
  -- под служебными операциями) гард пропускает — требования всё равно проверяются
  -- ниже. Без этого условия любой служебный UPDATE стадии падал бы 42501 (гейт S27).
  IF auth.uid() IS NOT NULL AND NOT public.is_org_member(v_project.org_id) THEN
    RAISE EXCEPTION 'stage_gate_check_denied: not a member of project org'
      USING ERRCODE = '42501';
  END IF;

  FOR v_req IN
    SELECT requirement_type, config, error_hint
    FROM public.stage_requirements
    WHERE stage_id = p_target_stage_id
      AND org_id   = v_project.org_id
      AND is_active
  LOOP
    v_ok := false;

    IF v_req.requirement_type = 'field' THEN
      v_col := v_req.config->>'column';
      -- Whitelist полей сделки — синхронизирован с GATE_FIELD_COLUMNS в UI.
      v_ok := CASE v_col
        WHEN 'budget'           THEN v_project.budget IS NOT NULL
        WHEN 'company_id'       THEN v_project.company_id IS NOT NULL
        WHEN 'contact_id'       THEN v_project.contact_id IS NOT NULL
        WHEN 'next_step'        THEN v_project.next_step IS NOT NULL AND btrim(v_project.next_step) <> ''
        WHEN 'deadline'         THEN v_project.deadline IS NOT NULL
        WHEN 'probability'      THEN v_project.probability IS NOT NULL
        WHEN 'direction'        THEN v_project.direction IS NOT NULL
        WHEN 'next_action_date' THEN v_project.next_action_date IS NOT NULL
        ELSE NULL   -- неподдерживаемая (не в whitelist) колонка
      END;

      IF v_ok IS NULL THEN
        v_unmet := v_unmet || jsonb_build_object(
          'type',   'field',
          'config', v_req.config,
          'hint',   v_req.error_hint || ' (неподдерживаемая колонка: ' || COALESCE(v_col, 'null') || ')'
        );
        CONTINUE;
      END IF;

    ELSIF v_req.requirement_type = 'file' THEN
      v_min_count := COALESCE((v_req.config->>'min_count')::int, 1);
      SELECT count(*) INTO v_file_count
      FROM public.project_files
      WHERE project_id = p_project_id;
      v_ok := v_file_count >= v_min_count;
    END IF;

    IF NOT v_ok THEN
      v_unmet := v_unmet || jsonb_build_object(
        'type',   v_req.requirement_type,
        'config', v_req.config,
        'hint',   v_req.error_hint
      );
    END IF;
  END LOOP;

  RETURN v_unmet;
END;
$$;

REVOKE ALL ON FUNCTION public.check_stage_requirements(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.check_stage_requirements(uuid, uuid) TO authenticated, service_role;

-- ─── 1.3 Enforcement-триггер ─────────────────────────────────────────────────
--
-- Блокирует переход на p_target_stage_id, если check вернул непустой массив.
-- В отличие от log/notify-функций — БЕЗ EXCEPTION-глотания: гейт обязан блокировать.
-- UI парсит message = 'stage_gate_failed' + DETAIL (jsonb-массив пунктов).
CREATE OR REPLACE FUNCTION public.aa_enforce_stage_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_unmet jsonb;
BEGIN
  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    v_unmet := public.check_stage_requirements(NEW.id, NEW.stage_id);
    IF jsonb_array_length(v_unmet) > 0 THEN
      RAISE EXCEPTION 'stage_gate_failed'
        USING DETAIL = v_unmet::text, ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.aa_enforce_stage_gate() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.aa_enforce_stage_gate() TO service_role;

DROP TRIGGER IF EXISTS trg_aa_enforce_stage_gate ON public.projects;
CREATE TRIGGER trg_aa_enforce_stage_gate
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.aa_enforce_stage_gate();

-- ─── 1.4 Seed под ЧЗ-процесс (идемпотентный, best-effort) ───────────────────
--
-- Требования для дефолтной org, стадии матчатся по name (стадия не нашлась —
-- пропуск). Ориентир — Олег правит в UI (Settings → Гейты). Каждый INSERT
-- guarded NOT EXISTS: повторный запуск миграции не плодит дубли.
DO $seed$
DECLARE
  v_org uuid;
BEGIN
  SELECT id INTO v_org FROM public.organizations ORDER BY created_at LIMIT 1;
  IF v_org IS NULL THEN
    RETURN;
  END IF;

  -- «Подготовка КП»: бюджет проставлен + приложено КП.
  INSERT INTO public.stage_requirements (org_id, pipeline_id, stage_id, requirement_type, config, error_hint)
  SELECT v_org, ps.pipeline_id, ps.id, 'field', '{"column":"budget"}'::jsonb, 'Укажите бюджет сделки'
  FROM public.pipeline_stages ps
  JOIN public.pipelines p ON p.id = ps.pipeline_id
  WHERE p.entity_type = 'deal' AND ps.name = 'Подготовка КП'
    AND NOT EXISTS (
      SELECT 1 FROM public.stage_requirements sr
      WHERE sr.org_id = v_org AND sr.stage_id = ps.id
        AND sr.requirement_type = 'field' AND sr.config->>'column' = 'budget'
    );

  INSERT INTO public.stage_requirements (org_id, pipeline_id, stage_id, requirement_type, config, error_hint)
  SELECT v_org, ps.pipeline_id, ps.id, 'file', '{"min_count":1,"label":"КП"}'::jsonb, 'Загрузите файл КП в сделку'
  FROM public.pipeline_stages ps
  JOIN public.pipelines p ON p.id = ps.pipeline_id
  WHERE p.entity_type = 'deal' AND ps.name = 'Подготовка КП'
    AND NOT EXISTS (
      SELECT 1 FROM public.stage_requirements sr
      WHERE sr.org_id = v_org AND sr.stage_id = ps.id
        AND sr.requirement_type = 'file' AND sr.config->>'label' = 'КП'
    );

  -- «Эксперимент»: компания и контакт должны быть привязаны.
  INSERT INTO public.stage_requirements (org_id, pipeline_id, stage_id, requirement_type, config, error_hint)
  SELECT v_org, ps.pipeline_id, ps.id, 'field', '{"column":"company_id"}'::jsonb, 'Привяжите компанию к сделке'
  FROM public.pipeline_stages ps
  JOIN public.pipelines p ON p.id = ps.pipeline_id
  WHERE p.entity_type = 'deal' AND ps.name = 'Эксперимент'
    AND NOT EXISTS (
      SELECT 1 FROM public.stage_requirements sr
      WHERE sr.org_id = v_org AND sr.stage_id = ps.id
        AND sr.requirement_type = 'field' AND sr.config->>'column' = 'company_id'
    );

  INSERT INTO public.stage_requirements (org_id, pipeline_id, stage_id, requirement_type, config, error_hint)
  SELECT v_org, ps.pipeline_id, ps.id, 'field', '{"column":"contact_id"}'::jsonb, 'Привяжите контакт к сделке'
  FROM public.pipeline_stages ps
  JOIN public.pipelines p ON p.id = ps.pipeline_id
  WHERE p.entity_type = 'deal' AND ps.name = 'Эксперимент'
    AND NOT EXISTS (
      SELECT 1 FROM public.stage_requirements sr
      WHERE sr.org_id = v_org AND sr.stage_id = ps.id
        AND sr.requirement_type = 'field' AND sr.config->>'column' = 'contact_id'
    );

  -- «Договор»: приложен договор + сформулирован следующий шаг.
  INSERT INTO public.stage_requirements (org_id, pipeline_id, stage_id, requirement_type, config, error_hint)
  SELECT v_org, ps.pipeline_id, ps.id, 'file', '{"min_count":1,"label":"Договор"}'::jsonb, 'Загрузите файл договора'
  FROM public.pipeline_stages ps
  JOIN public.pipelines p ON p.id = ps.pipeline_id
  WHERE p.entity_type = 'deal' AND ps.name = 'Договор'
    AND NOT EXISTS (
      SELECT 1 FROM public.stage_requirements sr
      WHERE sr.org_id = v_org AND sr.stage_id = ps.id
        AND sr.requirement_type = 'file' AND sr.config->>'label' = 'Договор'
    );

  INSERT INTO public.stage_requirements (org_id, pipeline_id, stage_id, requirement_type, config, error_hint)
  SELECT v_org, ps.pipeline_id, ps.id, 'field', '{"column":"next_step"}'::jsonb, 'Опишите следующий шаг по сделке'
  FROM public.pipeline_stages ps
  JOIN public.pipelines p ON p.id = ps.pipeline_id
  WHERE p.entity_type = 'deal' AND ps.name = 'Договор'
    AND NOT EXISTS (
      SELECT 1 FROM public.stage_requirements sr
      WHERE sr.org_id = v_org AND sr.stage_id = ps.id
        AND sr.requirement_type = 'field' AND sr.config->>'column' = 'next_step'
    );
END;
$seed$;
