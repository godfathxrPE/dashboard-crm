


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."activity_type" AS ENUM (
    'call',
    'meeting',
    'email',
    'note',
    'task_completed',
    'stage_change',
    'kp_sent'
);


ALTER TYPE "public"."activity_type" OWNER TO "postgres";


CREATE TYPE "public"."call_status" AS ENUM (
    'done',
    'pending',
    'cancelled'
);


ALTER TYPE "public"."call_status" OWNER TO "postgres";


CREATE TYPE "public"."deal_stage" AS ENUM (
    'new_lead',
    'qualification',
    'waiting_materials',
    'preparing_kp',
    'kp_sent',
    'kp_review',
    'preparing_docs',
    'cz_approval',
    'trilateral_meeting',
    'experiment_setup',
    'contract_review',
    'contract_signing',
    'won',
    'lost'
);


ALTER TYPE "public"."deal_stage" OWNER TO "postgres";


CREATE TYPE "public"."direction_t" AS ENUM (
    'erp',
    'iiot'
);


ALTER TYPE "public"."direction_t" OWNER TO "postgres";


CREATE TYPE "public"."pipeline_entity_t" AS ENUM (
    'deal',
    'project'
);


ALTER TYPE "public"."pipeline_entity_t" OWNER TO "postgres";


CREATE TYPE "public"."task_lane" AS ENUM (
    'now',
    'next',
    'wait',
    'done'
);


ALTER TYPE "public"."task_lane" OWNER TO "postgres";


CREATE TYPE "public"."task_priority" AS ENUM (
    'normal',
    'important',
    'critical'
);


ALTER TYPE "public"."task_priority" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."aa_enforce_stage_gate"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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


ALTER FUNCTION "public"."aa_enforce_stage_gate"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_delivery_template"("p_project_id" "uuid", "p_template_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
    IF v_template_id IS NULL THEN
      RAISE EXCEPTION 'no template for direction % / kind %', v_project.direction, v_project.delivery_kind USING ERRCODE = 'P0001';
    END IF;
  END IF;

  PERFORM public.copy_delivery_template(p_project_id, v_template_id);
END $$;


ALTER FUNCTION "public"."apply_delivery_template"("p_project_id" "uuid", "p_template_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_pending_invites"("p_profile_id" "uuid", "p_email" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_count integer := 0;
BEGIN
  WITH matched AS (
    UPDATE public.invitations
    SET accepted_at = now()
    WHERE lower(email) = lower(p_email)
      AND accepted_at IS NULL
      AND expires_at > now()
    RETURNING org_id, role
  ), inserted AS (
    INSERT INTO public.memberships (org_id, profile_id, role)
    SELECT org_id, p_profile_id, role FROM matched
    ON CONFLICT (org_id, profile_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM inserted;
  RETURN v_count;
END; $$;


ALTER FUNCTION "public"."apply_pending_invites"("p_profile_id" "uuid", "p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."category_to_lane"("p" "text") RETURNS "public"."task_lane"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT CASE p
    WHEN 'backlog' THEN 'next'::task_lane
    WHEN 'started' THEN 'now'::task_lane
    WHEN 'paused'  THEN 'wait'::task_lane
    ELSE 'done'::task_lane
  END
$$;


ALTER FUNCTION "public"."category_to_lane"("p" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_delivery_completion"("p_project_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_open    jsonb;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'delivery_gate_check_denied: project not found'
      USING ERRCODE = '42501';
  END IF;
  IF v_project.type <> 'delivery' THEN
    RAISE EXCEPTION 'delivery_gate_check_denied: project is not delivery'
      USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_org_member(v_project.org_id) THEN
    RAISE EXCEPTION 'delivery_gate_check_denied: not a member of project org'
      USING ERRCODE = '42501';
  END IF;

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


ALTER FUNCTION "public"."check_delivery_completion"("p_project_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_stage_requirements"("p_project_id" "uuid", "p_target_stage_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
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
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'stage_gate_check_denied: project not found'
      USING ERRCODE = '42501';
  END IF;
  -- Гард только для auth-контекста: защищает RPC-поверхность от чужих org.
  -- Service-контекст (auth.uid() IS NULL) гард пропускает — требования всё
  -- равно проверяются ниже.
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
      v_ok := CASE v_col
        WHEN 'budget'           THEN v_project.budget IS NOT NULL
        WHEN 'company_id'       THEN v_project.company_id IS NOT NULL
        WHEN 'contact_id'       THEN v_project.contact_id IS NOT NULL
        WHEN 'next_step'        THEN v_project.next_step IS NOT NULL AND btrim(v_project.next_step) <> ''
        WHEN 'deadline'         THEN v_project.deadline IS NOT NULL
        WHEN 'probability'      THEN v_project.probability IS NOT NULL
        WHEN 'direction'        THEN v_project.direction IS NOT NULL
        WHEN 'next_action_date' THEN v_project.next_action_date IS NOT NULL
        ELSE NULL
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


ALTER FUNCTION "public"."check_stage_requirements"("p_project_id" "uuid", "p_target_stage_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."convert_lead"("p_lead_id" "uuid", "p_company_name" "text" DEFAULT NULL::"text", "p_contact_first_name" "text" DEFAULT NULL::"text", "p_contact_last_name" "text" DEFAULT NULL::"text", "p_contact_phone" "text" DEFAULT NULL::"text", "p_contact_email" "text" DEFAULT NULL::"text", "p_direction" "text" DEFAULT 'iiot'::"text", "p_deal_title" "text" DEFAULT NULL::"text", "p_deal_amount" numeric DEFAULT NULL::numeric, "p_company_id" "uuid" DEFAULT NULL::"uuid", "p_contact_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_contact_id uuid;
  v_deal_id uuid;
  v_pipeline_id uuid;
  v_first_stage_id uuid;
  v_lead_title text;
BEGIN
  -- S25 гард: лид должен принадлежать текущему пользователю в его org.
  IF NOT EXISTS (
    SELECT 1 FROM public.leads
    WHERE id = p_lead_id
      AND user_id = auth.uid()
      AND org_id = public.current_org_id()
  ) THEN
    RAISE EXCEPTION 'lead not found or access denied' USING ERRCODE = '42501';
  END IF;

  SELECT user_id, title INTO v_user_id, v_lead_title
  FROM leads WHERE id = p_lead_id AND status = 'qualified';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Lead not found or not in qualified status';
  END IF;

  -- 1. Компания (S25 fix: владение через owner_id/created_by, user_id нет)
  IF p_company_id IS NOT NULL THEN
    SELECT id INTO v_company_id FROM companies
      WHERE id = p_company_id
        AND (owner_id = v_user_id OR created_by = v_user_id);
    IF v_company_id IS NULL THEN
      RAISE EXCEPTION 'Company not found or not owned by lead owner';
    END IF;
  ELSE
    IF p_company_name IS NULL OR btrim(p_company_name) = '' THEN
      RAISE EXCEPTION 'Either p_company_id or p_company_name is required';
    END IF;
    INSERT INTO companies (owner_id, created_by, name)
    VALUES (v_user_id, v_user_id, p_company_name)
    RETURNING id INTO v_company_id;
  END IF;

  -- 2. Контакт (S25 fix: аналогично)
  IF p_contact_id IS NOT NULL THEN
    SELECT id INTO v_contact_id FROM contacts
      WHERE id = p_contact_id
        AND (owner_id = v_user_id OR created_by = v_user_id);
    IF v_contact_id IS NULL THEN
      RAISE EXCEPTION 'Contact not found or not owned by lead owner';
    END IF;
  ELSE
    IF p_contact_first_name IS NULL OR btrim(p_contact_first_name) = '' THEN
      RAISE EXCEPTION 'Either p_contact_id or p_contact_first_name is required';
    END IF;
    INSERT INTO contacts (owner_id, created_by, first_name, last_name, phone, email)
    VALUES (v_user_id, v_user_id, p_contact_first_name, p_contact_last_name, p_contact_phone, p_contact_email)
    RETURNING id INTO v_contact_id;
  END IF;

  -- 3. Связь контакт—компания (идемпотентно)
  INSERT INTO contact_company (contact_id, company_id)
  SELECT v_contact_id, v_company_id
  WHERE NOT EXISTS (
    SELECT 1 FROM contact_company
    WHERE contact_id = v_contact_id AND company_id = v_company_id
  );

  -- 4. Pipeline + первая стадия
  SELECT id INTO v_pipeline_id FROM pipelines
    WHERE direction = p_direction::direction_t AND entity_type = 'deal' AND is_default = true
    LIMIT 1;

  SELECT id INTO v_first_stage_id FROM pipeline_stages
    WHERE pipeline_id = v_pipeline_id
    ORDER BY order_index
    LIMIT 1;

  -- 5. Сделка (S25 fix: owner_id/created_by вместо user_id)
  INSERT INTO projects (
    owner_id, created_by, name, direction, pipeline_id, stage_id,
    company_id, contact_id, budget
  )
  VALUES (
    v_user_id,
    v_user_id,
    COALESCE(p_deal_title, v_lead_title),
    p_direction::direction_t,
    v_pipeline_id,
    v_first_stage_id,
    v_company_id,
    v_contact_id,
    p_deal_amount
  )
  RETURNING id INTO v_deal_id;

  -- 6. Обновляем лид
  UPDATE leads SET
    status = 'converted',
    direction = p_direction,
    converted_deal_id = v_deal_id,
    converted_company_id = v_company_id,
    converted_contact_id = v_contact_id,
    converted_at = now()
  WHERE id = p_lead_id;

  RETURN jsonb_build_object(
    'company_id', v_company_id,
    'contact_id', v_contact_id,
    'deal_id', v_deal_id
  );
END $$;


ALTER FUNCTION "public"."convert_lead"("p_lead_id" "uuid", "p_company_name" "text", "p_contact_first_name" "text", "p_contact_last_name" "text", "p_contact_phone" "text", "p_contact_email" "text", "p_direction" "text", "p_deal_title" "text", "p_deal_amount" numeric, "p_company_id" "uuid", "p_contact_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."copy_delivery_template"("p_project_id" "uuid", "p_template_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_project public.projects;
  v_phase record;
  v_col_id uuid;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND OR v_project.type <> 'delivery' THEN
    RAISE EXCEPTION 'delivery project not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.delivery_templates
                 WHERE id = p_template_id AND org_id = v_project.org_id) THEN
    RAISE EXCEPTION 'template org mismatch';
  END IF;
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


ALTER FUNCTION "public"."copy_delivery_template"("p_project_id" "uuid", "p_template_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_org_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT org_id FROM public.memberships
  WHERE profile_id = auth.uid()
  ORDER BY created_at LIMIT 1;
$$;


ALTER FUNCTION "public"."current_org_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_org_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT m.role FROM public.memberships m
  WHERE m.profile_id = auth.uid()
    AND m.org_id = public.current_org_id();
$$;


ALTER FUNCTION "public"."current_org_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_project_column"("p_column_id" "uuid", "p_target_column_id" "uuid" DEFAULT NULL::"uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_col public.project_columns; v_target public.project_columns;
BEGIN
  SELECT * INTO v_col FROM public.project_columns WHERE id = p_column_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'column not found'; END IF;

  -- NULL-safe: нет org-контекста ИЛИ чужой тенант → отказ.
  IF public.current_org_id() IS NULL
     OR v_col.org_id IS DISTINCT FROM public.current_org_id() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(public.current_org_role(), '') NOT IN ('owner','admin') AND NOT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = v_col.project_id
      AND (p.owner_id = auth.uid() OR p.created_by = auth.uid())
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_col.category IN ('backlog','done') AND NOT EXISTS (
    SELECT 1 FROM public.project_columns
    WHERE project_id = v_col.project_id AND category = v_col.category AND id <> v_col.id
  ) THEN
    RAISE EXCEPTION 'cannot delete last % column', v_col.category;
  END IF;

  IF EXISTS (SELECT 1 FROM public.tasks WHERE column_id = v_col.id) THEN
    SELECT * INTO v_target FROM public.project_columns
      WHERE id = p_target_column_id AND project_id = v_col.project_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'target column required'; END IF;
    UPDATE public.tasks SET column_id = v_target.id WHERE column_id = v_col.id;
  END IF;

  DELETE FROM public.project_columns WHERE id = v_col.id;
END $$;


ALTER FUNCTION "public"."delete_project_column"("p_column_id" "uuid", "p_target_column_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_delivery_completion"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NEW.type = 'delivery' AND OLD.status = 'open' AND NEW.status = 'completed' THEN
    v_result := public.check_delivery_completion(NEW.id);
    IF NOT (v_result->>'ready')::boolean THEN
      RAISE EXCEPTION 'delivery_gate_failed'
        USING DETAIL = (v_result->'open_milestones')::text, ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_delivery_completion"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_profile_settings"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO public.user_settings (profile_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_profile_settings"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  PERFORM public.apply_pending_invites(NEW.id, NEW.email);

  RETURN NEW;
END; $$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_member"("p_org" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE org_id = p_org AND profile_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_org_member"("p_org" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lane_to_category"("p" "public"."task_lane") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT CASE p
    WHEN 'next' THEN 'backlog'
    WHEN 'now'  THEN 'started'
    WHEN 'wait' THEN 'paused'
    ELSE 'done'
  END
$$;


ALTER FUNCTION "public"."lane_to_category"("p" "public"."task_lane") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_delete_call"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO activity_log (project_id, user_id, org_id, event_type, payload)
  VALUES (OLD.project_id, COALESCE(OLD.created_by, auth.uid()), COALESCE(OLD.org_id, public.current_org_id()), 'entity_deleted',
    jsonb_build_object('entity_type', 'calls', 'entity_name', 'Звонок', 'entity_id', OLD.id));
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN RETURN OLD;
END; $$;


ALTER FUNCTION "public"."log_delete_call"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_delete_company"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO activity_log (project_id, user_id, org_id, event_type, payload)
  VALUES (NULL, COALESCE(OLD.owner_id, auth.uid()), COALESCE(OLD.org_id, public.current_org_id()), 'entity_deleted',
    jsonb_build_object('entity_type', 'companies', 'entity_name', COALESCE(OLD.name, ''), 'entity_id', OLD.id));
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN RETURN OLD;
END; $$;


ALTER FUNCTION "public"."log_delete_company"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_delete_contact"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO activity_log (project_id, user_id, org_id, event_type, payload)
  VALUES (NULL, COALESCE(OLD.owner_id, auth.uid()), COALESCE(OLD.org_id, public.current_org_id()), 'entity_deleted',
    jsonb_build_object('entity_type', 'contacts', 'entity_name',
      COALESCE(NULLIF(TRIM(COALESCE(OLD.last_name,'') || ' ' || COALESCE(OLD.first_name,'')), ''), ''),
      'entity_id', OLD.id));
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN RETURN OLD;
END; $$;


ALTER FUNCTION "public"."log_delete_contact"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_delete_meeting"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO activity_log (project_id, user_id, org_id, event_type, payload)
  VALUES (OLD.project_id, COALESCE(OLD.created_by, auth.uid()), COALESCE(OLD.org_id, public.current_org_id()), 'entity_deleted',
    jsonb_build_object('entity_type', 'meetings', 'entity_name', COALESCE(OLD.title, ''), 'entity_id', OLD.id));
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN RETURN OLD;
END; $$;


ALTER FUNCTION "public"."log_delete_meeting"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_delete_project"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO activity_log (project_id, user_id, org_id, event_type, payload)
  VALUES (NULL, COALESCE(OLD.owner_id, auth.uid()), COALESCE(OLD.org_id, public.current_org_id()), 'entity_deleted',
    jsonb_build_object('entity_type', 'projects', 'entity_name', COALESCE(OLD.name, ''), 'entity_id', OLD.id));
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN RETURN OLD;
END; $$;


ALTER FUNCTION "public"."log_delete_project"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_delete_task"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO activity_log (project_id, user_id, org_id, event_type, payload)
  VALUES (OLD.project_id, COALESCE(OLD.created_by, auth.uid()), COALESCE(OLD.org_id, public.current_org_id()), 'entity_deleted',
    jsonb_build_object('entity_type', 'tasks', 'entity_name', COALESCE(OLD.text, ''), 'entity_id', OLD.id));
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN RETURN OLD;
END; $$;


ALTER FUNCTION "public"."log_delete_task"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_stage_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    INSERT INTO public.activities (type, title, project_id, company_id, org_id, metadata, created_by)
    VALUES (
      'stage_change',
      NEW.name || ': ' || OLD.stage || ' → ' || NEW.stage,
      NEW.id,
      NEW.company_id,
      COALESCE(NEW.org_id, public.current_org_id()),
      jsonb_build_object('from', OLD.stage::text, 'to', NEW.stage::text),
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_stage_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_project_assigned"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.owner_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.owner_id IS DISTINCT FROM OLD.owner_id)
     AND NEW.owner_id <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  THEN
    INSERT INTO public.notifications
      (org_id, recipient_id, actor_id, type, entity_type, entity_id, payload)
    VALUES
      (NEW.org_id, NEW.owner_id, auth.uid(), 'project_assigned', 'projects', NEW.id,
       jsonb_build_object('title', NEW.name));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END; $$;


ALTER FUNCTION "public"."notify_project_assigned"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_task_assigned"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to)
     AND NEW.assigned_to <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  THEN
    INSERT INTO public.notifications
      (org_id, recipient_id, actor_id, type, entity_type, entity_id, payload)
    VALUES
      (NEW.org_id, NEW.assigned_to, auth.uid(), 'task_assigned', 'tasks', NEW.id,
       jsonb_build_object('title', NEW.text));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END; $$;


ALTER FUNCTION "public"."notify_task_assigned"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."null_internal_stage"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.type IN ('internal','delivery') THEN NEW.stage := NULL; END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."null_internal_stage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_last_owner"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF OLD.role = 'owner' AND (TG_OP = 'DELETE' OR NEW.role <> 'owner') THEN
    IF (SELECT count(*) FROM public.memberships
        WHERE org_id = OLD.org_id AND role = 'owner') <= 1 THEN
      RAISE EXCEPTION 'cannot remove the last owner of the organization'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;


ALTER FUNCTION "public"."protect_last_owner"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalc_delivery_progress"("p_project_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_done int; v_total int;
BEGIN
  IF p_project_id IS NULL THEN RETURN; END IF;
  SELECT count(*) FILTER (WHERE lane = 'done'), count(*)
    INTO v_done, v_total
  FROM public.tasks WHERE project_id = p_project_id;
  UPDATE public.projects
     SET progress_done = v_done, progress_total = v_total
   WHERE id = p_project_id AND type = 'delivery'
     AND (progress_done IS DISTINCT FROM v_done OR progress_total IS DISTINCT FROM v_total);
END $$;


ALTER FUNCTION "public"."recalc_delivery_progress"("p_project_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reorder_tasks"("p_moves" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_bad_count int;
BEGIN
  IF p_moves IS NULL OR jsonb_typeof(p_moves) <> 'array'
     OR jsonb_array_length(p_moves) = 0 THEN
    RETURN;
  END IF;

  SELECT count(*)
    INTO v_bad_count
  FROM jsonb_to_recordset(p_moves) AS m(id uuid, lane text, sort_order int)
  JOIN public.tasks t ON t.id = m.id
  WHERE NOT public.is_org_member(t.org_id);

  IF v_bad_count > 0 THEN
    RAISE EXCEPTION 'not authorized for one or more tasks in reorder batch'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.tasks t
     SET lane       = m.lane::task_lane,
         sort_order = m.sort_order,
         updated_at = now()
  FROM jsonb_to_recordset(p_moves) AS m(id uuid, lane text, sort_order int)
  WHERE t.id = m.id
    AND public.is_org_member(t.org_id);
END;
$$;


ALTER FUNCTION "public"."reorder_tasks"("p_moves" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_task_board"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_cat text;
BEGIN
  IF NEW.project_id IS NULL THEN
    NEW.column_id := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.column_id IS NULL THEN
      SELECT id INTO NEW.column_id FROM public.project_columns
      WHERE project_id = NEW.project_id AND category = public.lane_to_category(NEW.lane)
      ORDER BY position LIMIT 1;
    END IF;
  ELSE
    IF NEW.column_id IS DISTINCT FROM OLD.column_id AND NEW.column_id IS NOT NULL THEN
      NULL;  -- явный перенос колонки (DnD) — уважаем
    ELSIF NEW.project_id IS DISTINCT FROM OLD.project_id THEN
      SELECT id INTO NEW.column_id FROM public.project_columns
      WHERE project_id = NEW.project_id AND category = public.lane_to_category(NEW.lane)
      ORDER BY position LIMIT 1;
    ELSIF NEW.lane IS DISTINCT FROM OLD.lane THEN
      SELECT category INTO v_cat FROM public.project_columns WHERE id = NEW.column_id;
      IF v_cat = 'phase' THEN
        NULL;  -- P2a: фазовая доска — смена lane это смена СТАТУСА, колонку (фазу) не трогаем
      ELSIF v_cat IS NULL OR public.category_to_lane(v_cat) IS DISTINCT FROM NEW.lane THEN
        SELECT id INTO NEW.column_id FROM public.project_columns
        WHERE project_id = NEW.project_id AND category = public.lane_to_category(NEW.lane)
        ORDER BY position LIMIT 1;
      END IF;
    END IF;
  END IF;

  IF NEW.column_id IS NULL THEN
    SELECT id INTO NEW.column_id FROM public.project_columns
    WHERE project_id = NEW.project_id ORDER BY position LIMIT 1;
  END IF;

  SELECT category INTO v_cat FROM public.project_columns WHERE id = NEW.column_id;
  IF v_cat IS NOT NULL AND v_cat <> 'phase' THEN   -- P2a: в phase-колонках lane — истина
    NEW.lane := public.category_to_lane(v_cat);
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."resolve_task_board"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_stage_automations"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_rule      record;
  v_run_id    uuid;
  v_task_id   uuid;
  v_text      text;
  v_assignee  uuid;
  v_lane      public.task_lane;
  v_priority  public.task_priority;
  v_due       int;
BEGIN
  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    FOR v_rule IN
      SELECT id, action_config
      FROM public.automation_rules
      WHERE org_id       = NEW.org_id
        AND is_active
        AND trigger_type = 'stage_entered'
        AND action_type  = 'create_task'
        AND (trigger_config->>'stage_id')::uuid = NEW.stage_id
    LOOP
      -- Вложенный обработчик: падение одного правила не гасит остальные.
      BEGIN
        -- Идемпотентность: строка не вставилась (правило уже стреляло по этой
        -- сделке+стадии) → v_run_id пуст → правило пропускаем.
        INSERT INTO public.automation_runs (rule_id, org_id, project_id, stage_id)
        VALUES (v_rule.id, NEW.org_id, NEW.id, NEW.stage_id)
        ON CONFLICT (rule_id, project_id, stage_id) DO NOTHING
        RETURNING id INTO v_run_id;

        IF v_run_id IS NULL THEN
          CONTINUE;
        END IF;

        -- Текст: простой replace, никакого format()/EXECUTE.
        v_text := replace(
          COALESCE(v_rule.action_config->>'task_text', 'Задача по сделке {deal}'),
          '{deal}', COALESCE(NEW.name, '')
        );

        -- Исполнитель: владелец сделки (дефолт) или её создатель.
        v_assignee := CASE v_rule.action_config->>'assignee'
          WHEN 'deal_creator' THEN NEW.created_by
          ELSE COALESCE(NEW.owner_id, NEW.created_by)   -- 'deal_owner' и дефолт
        END;

        -- Whitelist lane/priority — вне списка дефолт.
        v_lane := CASE v_rule.action_config->>'lane'
          WHEN 'now'  THEN 'now'::public.task_lane
          WHEN 'next' THEN 'next'::public.task_lane
          WHEN 'wait' THEN 'wait'::public.task_lane
          WHEN 'done' THEN 'done'::public.task_lane
          ELSE 'now'::public.task_lane
        END;

        v_priority := CASE v_rule.action_config->>'priority'
          WHEN 'normal'    THEN 'normal'::public.task_priority
          WHEN 'important' THEN 'important'::public.task_priority
          WHEN 'critical'  THEN 'critical'::public.task_priority
          ELSE 'normal'::public.task_priority
        END;

        v_due := COALESCE((v_rule.action_config->>'due_in_days')::int, 3);

        -- Создание задачи. assigned_to → trg_notify_task_assigned сам создаст
        -- уведомление (самоназначение отфильтрует). org_id — ЯВНО.
        INSERT INTO public.tasks
          (text, lane, priority, project_id, company_id, contact_id,
           deadline, assigned_to, org_id)
        VALUES
          (v_text, v_lane, v_priority, NEW.id, NEW.company_id, NEW.contact_id,
           (CURRENT_DATE + v_due)::timestamptz, v_assignee, NEW.org_id)
        RETURNING id INTO v_task_id;

        UPDATE public.automation_runs SET task_id = v_task_id WHERE id = v_run_id;

        INSERT INTO public.activity_log (project_id, user_id, event_type, payload, org_id)
        VALUES (
          NEW.id,
          COALESCE(auth.uid(), NEW.owner_id, NEW.created_by),
          'automation_fired',
          jsonb_build_object('rule_id', v_rule.id, 'task_id', v_task_id, 'stage_id', NEW.stage_id),
          NEW.org_id
        );
      EXCEPTION WHEN OTHERS THEN
        -- Правило упало — молча пропускаем, остальные правила продолжают.
        CONTINUE;
      END;
    END LOOP;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Автоматизация НИКОГДА не блокирует переход стадии.
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."run_stage_automations"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_project_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.type = 'delivery' THEN RETURN NEW; END IF;  -- P2a: фазы delivery создаёт copy_delivery_template
  INSERT INTO public.project_columns (org_id, project_id, name, category, position) VALUES
    (NEW.org_id, NEW.id, 'Бэклог',   'backlog', 1),
    (NEW.org_id, NEW.id, 'В работе', 'started', 2),
    (NEW.org_id, NEW.id, 'Ожидание', 'paused',  3),
    (NEW.org_id, NEW.id, 'Готово',   'done',    4);
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."seed_project_columns"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_org_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := public.current_org_id();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_org_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."shares_org_with"("p_profile" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships a
    JOIN public.memberships b ON a.org_id = b.org_id
    WHERE a.profile_id = auth.uid() AND b.profile_id = p_profile
  );
$$;


ALTER FUNCTION "public"."shares_org_with"("p_profile" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."spawn_delivery_project"("p_deal_id" "uuid", "p_kind" "text", "p_template_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_deal        record;
  v_privileged  boolean;
  v_pipeline_id uuid;
  v_first_stage uuid;
  v_new_id      uuid;
  v_template_id uuid;  -- P2a
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

  SELECT id INTO v_pipeline_id FROM public.pipelines
   WHERE entity_type='project' AND direction=v_deal.direction AND is_default=true LIMIT 1;
  IF v_pipeline_id IS NULL THEN
    RAISE EXCEPTION 'no project pipeline for direction %', v_deal.direction USING ERRCODE='P0001';
  END IF;
  SELECT id INTO v_first_stage FROM public.pipeline_stages
   WHERE pipeline_id=v_pipeline_id ORDER BY order_index LIMIT 1;

  -- P2a: резолюция шаблона ДО insert (явный p_template_id или по direction+kind)
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
    v_deal.org_id, COALESCE(v_deal.owner_id, auth.uid()), auth.uid(),
    v_deal.name || ' — внедрение', 'delivery', v_deal.direction,
    v_pipeline_id, v_first_stage, NULL, 'open',
    v_deal.company_id, v_deal.contact_id, p_deal_id, p_kind
  ) RETURNING id INTO v_new_id;

  -- P2a: фазы + задачи из шаблона; шаблона нет → проект без колонок (graceful)
  IF v_template_id IS NOT NULL THEN
    PERFORM public.copy_delivery_template(v_new_id, v_template_id);
  END IF;

  RETURN v_new_id;
END $$;


ALTER FUNCTION "public"."spawn_delivery_project"("p_deal_id" "uuid", "p_kind" "text", "p_template_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_deal_stage_fields"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_probability smallint;
  v_is_won      boolean;
  v_is_lost     boolean;
BEGIN
  SELECT probability, is_won, is_lost
    INTO v_probability, v_is_won, v_is_lost
  FROM pipeline_stages
  WHERE id = NEW.stage_id;

  NEW.probability := v_probability;

  IF v_is_won THEN
    NEW.status := 'won';
    NEW.actual_close_date := COALESCE(NEW.actual_close_date, current_date);
  ELSIF v_is_lost THEN
    NEW.status := 'lost';
    NEW.actual_close_date := COALESCE(NEW.actual_close_date, current_date);
  ELSE
    -- revert status to 'open' if stage moved back from won/lost
    IF NEW.status IN ('won', 'lost') THEN
      NEW.status := 'open';
      NEW.actual_close_date := NULL;
    END IF;
  END IF;

  RETURN NEW;
END $$;


ALTER FUNCTION "public"."sync_deal_stage_fields"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_delivery_progress"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."sync_delivery_progress"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_lane_on_category_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.category = 'phase' OR OLD.category = 'phase' THEN
    RETURN NEW;  -- P2a: фазовые колонки не каскадят статус (lane — истина задач)
  END IF;
  IF NEW.category IS DISTINCT FROM OLD.category THEN
    UPDATE public.tasks
       SET lane = public.category_to_lane(NEW.category)
     WHERE column_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."sync_lane_on_category_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_project_stage"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_is_won boolean;
  v_is_lost boolean;
BEGIN
  IF NEW.stage_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    NEW.stage_entered_at := now();

    SELECT is_won, is_lost INTO v_is_won, v_is_lost
    FROM pipeline_stages WHERE id = NEW.stage_id;

    IF v_is_won THEN
      NEW.status := 'won';
      NEW.actual_close_date := COALESCE(NEW.actual_close_date, CURRENT_DATE);
    ELSIF v_is_lost THEN
      NEW.status := 'lost';
      NEW.actual_close_date := COALESCE(NEW.actual_close_date, CURRENT_DATE);
    ELSE
      IF NEW.status IN ('won', 'lost') THEN
        NEW.status := 'open';
      END IF;
      NEW.actual_close_date := NULL;
    END IF;
  END IF;

  RETURN NEW;
END $$;


ALTER FUNCTION "public"."sync_project_stage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_leads_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;


ALTER FUNCTION "public"."update_leads_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "public"."activity_type" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "company_id" "uuid",
    "contact_id" "uuid",
    "project_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "org_id" "uuid" NOT NULL
);


ALTER TABLE "public"."activities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid",
    "user_id" "uuid",
    "event_type" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "org_id" "uuid" NOT NULL
);


ALTER TABLE "public"."activity_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "preset_key" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "transcript_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "result" "jsonb",
    "error" "text",
    "model" "text",
    "prompt_version" integer,
    "input_tokens" integer,
    "output_tokens" integer,
    "duration_ms" integer,
    "rating" smallint,
    "feedback_note" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    CONSTRAINT "ai_runs_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['call'::"text", 'meeting'::"text"]))),
    CONSTRAINT "ai_runs_rating_check" CHECK (("rating" = ANY (ARRAY['-1'::integer, 1]))),
    CONSTRAINT "ai_runs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'running'::"text", 'done'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."ai_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."automation_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "trigger_type" "text" NOT NULL,
    "trigger_config" "jsonb" NOT NULL,
    "action_type" "text" NOT NULL,
    "action_config" "jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "automation_rules_action_type_check" CHECK (("action_type" = 'create_task'::"text")),
    CONSTRAINT "automation_rules_trigger_type_check" CHECK (("trigger_type" = 'stage_entered'::"text"))
);


ALTER TABLE "public"."automation_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."automation_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rule_id" "uuid" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "stage_id" "uuid" NOT NULL,
    "task_id" "uuid",
    "fired_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."automation_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."call_tracker_days" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "plan" integer DEFAULT 40 NOT NULL,
    "done" integer DEFAULT 0 NOT NULL,
    "success" integer DEFAULT 0 NOT NULL,
    "fail" integer DEFAULT 0 NOT NULL,
    "hourly" "jsonb" DEFAULT '{}'::"jsonb",
    "fail_reasons" "jsonb" DEFAULT '{}'::"jsonb",
    "org_id" "uuid" NOT NULL
);


ALTER TABLE "public"."call_tracker_days" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "company_id" "uuid",
    "contact_id" "uuid",
    "project_id" "uuid",
    "date" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "public"."call_status" DEFAULT 'done'::"public"."call_status" NOT NULL,
    "next_step" "text",
    "agreements" "text",
    "duration_s" integer,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "org_id" "uuid" NOT NULL,
    "ai_summary" "jsonb",
    "ai_summary_at" timestamp with time zone
);


ALTER TABLE "public"."calls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."companies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "inn" "text",
    "industry" "text",
    "website" "text",
    "phone" "text",
    "address" "text",
    "notes" "text",
    "owner_id" "uuid",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "email" "text",
    "org_id" "uuid" NOT NULL
);


ALTER TABLE "public"."companies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contact_company" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "role" "text",
    "is_primary" boolean DEFAULT false,
    "org_id" "uuid" NOT NULL
);


ALTER TABLE "public"."contact_company" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text",
    "email" "text",
    "phone" "text",
    "position" "text",
    "notes" "text",
    "owner_id" "uuid",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "org_id" "uuid" NOT NULL
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dashboard_sync" (
    "id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "data" "jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."dashboard_sync" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_template_phases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "template_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."delivery_template_phases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_template_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "template_id" "uuid" NOT NULL,
    "phase_id" "uuid" NOT NULL,
    "wbs_code" "text",
    "title" "text" NOT NULL,
    "default_enabled" boolean DEFAULT true NOT NULL,
    "is_milestone" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."delivery_template_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "direction" "public"."direction_t" NOT NULL,
    "kind" "text" NOT NULL,
    "name" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "delivery_templates_kind_check" CHECK (("kind" = ANY (ARRAY['launch'::"text", 'experiment'::"text"])))
);


ALTER TABLE "public"."delivery_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" DEFAULT 'manager'::"text" NOT NULL,
    "token" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invited_by" "uuid",
    "expires_at" timestamp with time zone DEFAULT ("now"() + '14 days'::interval) NOT NULL,
    "accepted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "invitations_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'manager'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kpi_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "week_start" "date" NOT NULL,
    "metric" "text" NOT NULL,
    "plan" integer DEFAULT 0 NOT NULL,
    "fact" integer DEFAULT 0 NOT NULL,
    "points" integer DEFAULT 0 NOT NULL,
    "org_id" "uuid" NOT NULL
);


ALTER TABLE "public"."kpi_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "source" "text",
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "direction" "text",
    "company_name_raw" "text",
    "contact_name_raw" "text",
    "phone" "text",
    "email" "text",
    "notes" "text",
    "disqualify_reason" "text",
    "converted_deal_id" "uuid",
    "converted_company_id" "uuid",
    "converted_contact_id" "uuid",
    "converted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "org_id" "uuid" NOT NULL,
    CONSTRAINT "leads_direction_check" CHECK ((("direction" IS NULL) OR ("direction" = ANY (ARRAY['erp'::"text", 'iiot'::"text"])))),
    CONSTRAINT "leads_source_check" CHECK ((("source" IS NULL) OR ("source" = ANY (ARRAY['call'::"text", 'website'::"text", 'referral'::"text", 'cold'::"text", 'inbound'::"text", 'event'::"text"])))),
    CONSTRAINT "leads_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'contacted'::"text", 'qualified'::"text", 'disqualified'::"text", 'converted'::"text"])))
);


ALTER TABLE "public"."leads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meeting_attendees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "meeting_id" "uuid" NOT NULL,
    "contact_id" "uuid",
    "profile_id" "uuid"
);


ALTER TABLE "public"."meeting_attendees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."meetings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "date" "date" NOT NULL,
    "time" time without time zone,
    "location" "text",
    "project_id" "uuid",
    "notes" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "company_id" "uuid",
    "contact_id" "uuid",
    "next_step" "text",
    "org_id" "uuid" NOT NULL,
    "ai_summary" "jsonb",
    "ai_summary_at" timestamp with time zone
);


ALTER TABLE "public"."meetings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'manager'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "memberships_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."memberships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "actor_id" "uuid",
    "type" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "notifications_type_check" CHECK (("type" = ANY (ARRAY['task_assigned'::"text", 'project_assigned'::"text"])))
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pipeline_stages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pipeline_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "order_index" smallint NOT NULL,
    "probability" smallint,
    "phase_group" "text",
    "is_won" boolean DEFAULT false NOT NULL,
    "is_lost" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."pipeline_stages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pipelines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "direction" "public"."direction_t" NOT NULL,
    "entity_type" "public"."pipeline_entity_t" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pipelines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "full_name" "text" DEFAULT ''::"text" NOT NULL,
    "avatar_url" "text",
    "settings" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_columns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "wip_limit" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_columns_category_check" CHECK (("category" = ANY (ARRAY['backlog'::"text", 'started'::"text", 'paused'::"text", 'done'::"text", 'phase'::"text"]))),
    CONSTRAINT "project_columns_wip_limit_check" CHECK ((("wip_limit" IS NULL) OR ("wip_limit" > 0)))
);


ALTER TABLE "public"."project_columns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_size" bigint,
    "file_type" "text",
    "storage_path" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "org_id" "uuid" NOT NULL
);


ALTER TABLE "public"."project_files" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."project_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "project_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "project_members_role_check" CHECK (("role" = ANY (ARRAY['manager'::"text", 'implementer'::"text", 'installer'::"text"])))
);


ALTER TABLE "public"."project_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "company_id" "uuid",
    "contact_id" "uuid",
    "stage" "public"."deal_stage" DEFAULT 'new_lead'::"public"."deal_stage",
    "budget" bigint,
    "deadline" "date",
    "next_step" "text",
    "owner_id" "uuid",
    "loss_reason" "text",
    "loss_detail" "text",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "direction" "public"."direction_t",
    "pipeline_id" "uuid",
    "stage_id" "uuid",
    "probability" smallint,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "lost_reason" "text",
    "actual_close_date" "date",
    "next_action_date" "date",
    "pinned_note" "text",
    "stage_entered_at" timestamp with time zone DEFAULT "now"(),
    "org_id" "uuid" NOT NULL,
    "type" "text" DEFAULT 'client'::"text" NOT NULL,
    "parent_deal_id" "uuid",
    "delivery_kind" "text",
    "do_url" "text",
    "do_external_id" "text",
    "do_synced_at" timestamp with time zone,
    "progress_done" integer DEFAULT 0 NOT NULL,
    "progress_total" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "projects_delivery_kind_check" CHECK (("delivery_kind" = ANY (ARRAY['launch'::"text", 'experiment'::"text"]))),
    CONSTRAINT "projects_delivery_status_chk" CHECK ((("type" <> 'delivery'::"text") OR ("status" = ANY (ARRAY['open'::"text", 'completed'::"text"])))),
    CONSTRAINT "projects_status_chk" CHECK (("status" = ANY (ARRAY['open'::"text", 'won'::"text", 'lost'::"text", 'on_hold'::"text", 'completed'::"text"]))),
    CONSTRAINT "projects_type_chk" CHECK (("type" = ANY (ARRAY['client'::"text", 'internal'::"text", 'delivery'::"text"]))),
    CONSTRAINT "projects_type_pipeline_chk" CHECK (((("type" = 'client'::"text") AND ("pipeline_id" IS NOT NULL) AND ("stage_id" IS NOT NULL) AND ("direction" IS NOT NULL)) OR (("type" = 'internal'::"text") AND ("pipeline_id" IS NULL) AND ("stage_id" IS NULL)) OR (("type" = 'delivery'::"text") AND ("pipeline_id" IS NOT NULL) AND ("stage_id" IS NOT NULL) AND ("direction" IS NOT NULL) AND ("parent_deal_id" IS NOT NULL) AND ("delivery_kind" IS NOT NULL))))
);


ALTER TABLE "public"."projects" OWNER TO "postgres";


COMMENT ON COLUMN "public"."projects"."next_action_date" IS 'Дата следующего шага (next_step). NULL у активной сделки = rotting';



COMMENT ON COLUMN "public"."projects"."pinned_note" IS 'Закреплённая заметка (Focus panel, Sprint W1c)';



CREATE TABLE IF NOT EXISTS "public"."scheduled_calls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "time" time without time zone NOT NULL,
    "company_id" "uuid",
    "contact_id" "uuid",
    "project_id" "uuid",
    "phone" "text",
    "note" "text",
    "remind_min" integer DEFAULT 2,
    "done" boolean DEFAULT false,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "org_id" "uuid" NOT NULL
);


ALTER TABLE "public"."scheduled_calls" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stage_requirements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "pipeline_id" "uuid" NOT NULL,
    "stage_id" "uuid" NOT NULL,
    "requirement_type" "text" NOT NULL,
    "config" "jsonb" NOT NULL,
    "error_hint" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "stage_requirements_requirement_type_check" CHECK (("requirement_type" = ANY (ARRAY['field'::"text", 'file'::"text"])))
);


ALTER TABLE "public"."stage_requirements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "text" "text" NOT NULL,
    "lane" "public"."task_lane" DEFAULT 'now'::"public"."task_lane" NOT NULL,
    "priority" "public"."task_priority" DEFAULT 'normal'::"public"."task_priority" NOT NULL,
    "project_id" "uuid",
    "deadline" timestamp with time zone,
    "remind_min" integer,
    "sort_order" integer DEFAULT 0,
    "assigned_to" "uuid",
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "company_id" "uuid",
    "contact_id" "uuid",
    "org_id" "uuid" NOT NULL,
    "column_id" "uuid",
    "is_milestone" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transcripts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "source" "text" DEFAULT 'paste'::"text" NOT NULL,
    "content" "text",
    "storage_path" "text",
    "char_count" integer NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "transcripts_entity_type_check" CHECK (("entity_type" = ANY (ARRAY['call'::"text", 'meeting'::"text"]))),
    CONSTRAINT "transcripts_source_check" CHECK (("source" = ANY (ARRAY['paste'::"text", 'file'::"text"])))
);


ALTER TABLE "public"."transcripts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_settings" (
    "profile_id" "uuid" NOT NULL,
    "theme" "text" DEFAULT 't-claude'::"text",
    "visible_widgets" "jsonb" DEFAULT '[]'::"jsonb",
    "focus_text" "text",
    "notes_text" "text",
    "funnel_goals" "jsonb" DEFAULT '{"kp": 3, "calls": 200, "deals": 1, "meetings": 5}'::"jsonb",
    "plan_targets" "jsonb" DEFAULT '{"kp": 3, "calls": 200, "deals": 1, "meetings": 5}'::"jsonb",
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_settings" OWNER TO "postgres";


ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_runs"
    ADD CONSTRAINT "ai_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."automation_rules"
    ADD CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."automation_runs"
    ADD CONSTRAINT "automation_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."automation_runs"
    ADD CONSTRAINT "automation_runs_rule_id_project_id_stage_id_key" UNIQUE ("rule_id", "project_id", "stage_id");



ALTER TABLE ONLY "public"."call_tracker_days"
    ADD CONSTRAINT "call_tracker_days_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."call_tracker_days"
    ADD CONSTRAINT "call_tracker_days_profile_id_date_key" UNIQUE ("profile_id", "date");



ALTER TABLE ONLY "public"."calls"
    ADD CONSTRAINT "calls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_company"
    ADD CONSTRAINT "contact_company_contact_id_company_id_key" UNIQUE ("contact_id", "company_id");



ALTER TABLE ONLY "public"."contact_company"
    ADD CONSTRAINT "contact_company_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dashboard_sync"
    ADD CONSTRAINT "dashboard_sync_pkey" PRIMARY KEY ("id", "user_id");



ALTER TABLE ONLY "public"."delivery_template_phases"
    ADD CONSTRAINT "delivery_template_phases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_template_tasks"
    ADD CONSTRAINT "delivery_template_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_templates"
    ADD CONSTRAINT "delivery_templates_org_id_direction_kind_key" UNIQUE ("org_id", "direction", "kind");



ALTER TABLE ONLY "public"."delivery_templates"
    ADD CONSTRAINT "delivery_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_org_id_email_key" UNIQUE ("org_id", "email");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kpi_entries"
    ADD CONSTRAINT "kpi_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."kpi_entries"
    ADD CONSTRAINT "kpi_entries_profile_id_week_start_metric_key" UNIQUE ("profile_id", "week_start", "metric");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meeting_attendees"
    ADD CONSTRAINT "meeting_attendees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."meetings"
    ADD CONSTRAINT "meetings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_org_id_profile_id_key" UNIQUE ("org_id", "profile_id");



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pipeline_stages"
    ADD CONSTRAINT "pipeline_stages_pipeline_id_order_index_key" UNIQUE ("pipeline_id", "order_index");



ALTER TABLE ONLY "public"."pipeline_stages"
    ADD CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pipelines"
    ADD CONSTRAINT "pipelines_direction_entity_type_name_key" UNIQUE ("direction", "entity_type", "name");



ALTER TABLE ONLY "public"."pipelines"
    ADD CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_columns"
    ADD CONSTRAINT "project_columns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_files"
    ADD CONSTRAINT "project_files_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_project_id_profile_id_key" UNIQUE ("project_id", "profile_id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."scheduled_calls"
    ADD CONSTRAINT "scheduled_calls_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stage_requirements"
    ADD CONSTRAINT "stage_requirements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transcripts"
    ADD CONSTRAINT "transcripts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_pkey" PRIMARY KEY ("profile_id");



CREATE INDEX "idx_activities_company" ON "public"."activities" USING "btree" ("company_id");



CREATE INDEX "idx_activities_created" ON "public"."activities" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_activities_org" ON "public"."activities" USING "btree" ("org_id");



CREATE INDEX "idx_activities_project" ON "public"."activities" USING "btree" ("project_id");



CREATE INDEX "idx_activities_type" ON "public"."activities" USING "btree" ("type");



CREATE INDEX "idx_activity_log_org" ON "public"."activity_log" USING "btree" ("org_id");



CREATE INDEX "idx_activity_log_project" ON "public"."activity_log" USING "btree" ("project_id", "created_at" DESC);



CREATE INDEX "idx_ai_runs_entity" ON "public"."ai_runs" USING "btree" ("entity_type", "entity_id", "created_at" DESC);



CREATE INDEX "idx_ai_runs_org_created" ON "public"."ai_runs" USING "btree" ("org_id", "created_at" DESC);



CREATE INDEX "idx_automation_rules_org" ON "public"."automation_rules" USING "btree" ("org_id") WHERE "is_active";



CREATE INDEX "idx_automation_runs_rule" ON "public"."automation_runs" USING "btree" ("rule_id");



CREATE INDEX "idx_calls_company" ON "public"."calls" USING "btree" ("company_id");



CREATE INDEX "idx_calls_contact" ON "public"."calls" USING "btree" ("contact_id");



CREATE INDEX "idx_calls_date" ON "public"."calls" USING "btree" ("date" DESC);



CREATE INDEX "idx_calls_org" ON "public"."calls" USING "btree" ("org_id");



CREATE INDEX "idx_calls_project" ON "public"."calls" USING "btree" ("project_id");



CREATE INDEX "idx_cc_company" ON "public"."contact_company" USING "btree" ("company_id");



CREATE INDEX "idx_cc_contact" ON "public"."contact_company" USING "btree" ("contact_id");



CREATE INDEX "idx_companies_org" ON "public"."companies" USING "btree" ("org_id");



CREATE INDEX "idx_companies_owner" ON "public"."companies" USING "btree" ("owner_id");



CREATE INDEX "idx_contacts_org" ON "public"."contacts" USING "btree" ("org_id");



CREATE INDEX "idx_contacts_owner" ON "public"."contacts" USING "btree" ("owner_id");



CREATE INDEX "idx_delivery_templates_org" ON "public"."delivery_templates" USING "btree" ("org_id", "direction", "kind");



CREATE INDEX "idx_dt_phases_org" ON "public"."delivery_template_phases" USING "btree" ("org_id");



CREATE INDEX "idx_dt_phases_template" ON "public"."delivery_template_phases" USING "btree" ("template_id", "position");



CREATE INDEX "idx_dt_tasks_org" ON "public"."delivery_template_tasks" USING "btree" ("org_id");



CREATE INDEX "idx_dt_tasks_phase" ON "public"."delivery_template_tasks" USING "btree" ("phase_id");



CREATE INDEX "idx_dt_tasks_template" ON "public"."delivery_template_tasks" USING "btree" ("template_id", "phase_id", "sort_order");



CREATE INDEX "idx_invitations_email" ON "public"."invitations" USING "btree" ("lower"("email"));



CREATE INDEX "idx_leads_created_at" ON "public"."leads" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_leads_org" ON "public"."leads" USING "btree" ("org_id");



CREATE INDEX "idx_leads_status" ON "public"."leads" USING "btree" ("status");



CREATE INDEX "idx_leads_user_id" ON "public"."leads" USING "btree" ("user_id");



CREATE INDEX "idx_meetings_company" ON "public"."meetings" USING "btree" ("company_id");



CREATE INDEX "idx_meetings_contact" ON "public"."meetings" USING "btree" ("contact_id");



CREATE INDEX "idx_meetings_date" ON "public"."meetings" USING "btree" ("date");



CREATE INDEX "idx_meetings_org" ON "public"."meetings" USING "btree" ("org_id");



CREATE INDEX "idx_memberships_org" ON "public"."memberships" USING "btree" ("org_id");



CREATE INDEX "idx_memberships_profile" ON "public"."memberships" USING "btree" ("profile_id");



CREATE INDEX "idx_notifications_recipient" ON "public"."notifications" USING "btree" ("recipient_id", "read_at", "created_at" DESC);



CREATE UNIQUE INDEX "idx_pipelines_default" ON "public"."pipelines" USING "btree" ("direction", "entity_type") WHERE ("is_default" = true);



CREATE INDEX "idx_project_columns_org" ON "public"."project_columns" USING "btree" ("org_id");



CREATE INDEX "idx_project_columns_project" ON "public"."project_columns" USING "btree" ("project_id", "position");



CREATE INDEX "idx_project_files_project" ON "public"."project_files" USING "btree" ("project_id");



CREATE INDEX "idx_project_files_user" ON "public"."project_files" USING "btree" ("user_id");



CREATE INDEX "idx_project_members_org" ON "public"."project_members" USING "btree" ("org_id");



CREATE INDEX "idx_project_members_profile" ON "public"."project_members" USING "btree" ("profile_id");



CREATE INDEX "idx_project_members_project" ON "public"."project_members" USING "btree" ("project_id");



CREATE INDEX "idx_projects_company" ON "public"."projects" USING "btree" ("company_id");



CREATE INDEX "idx_projects_contact" ON "public"."projects" USING "btree" ("contact_id");



CREATE INDEX "idx_projects_direction" ON "public"."projects" USING "btree" ("direction");



CREATE INDEX "idx_projects_org" ON "public"."projects" USING "btree" ("org_id");



CREATE INDEX "idx_projects_owner" ON "public"."projects" USING "btree" ("owner_id");



CREATE INDEX "idx_projects_parent_deal_id" ON "public"."projects" USING "btree" ("parent_deal_id") WHERE ("parent_deal_id" IS NOT NULL);



CREATE INDEX "idx_projects_pipeline" ON "public"."projects" USING "btree" ("pipeline_id");



CREATE INDEX "idx_projects_stage" ON "public"."projects" USING "btree" ("stage");



CREATE INDEX "idx_projects_status" ON "public"."projects" USING "btree" ("status");



CREATE INDEX "idx_stage_req_org_stage" ON "public"."stage_requirements" USING "btree" ("org_id", "stage_id") WHERE "is_active";



CREATE INDEX "idx_stages_pipeline" ON "public"."pipeline_stages" USING "btree" ("pipeline_id");



CREATE INDEX "idx_tasks_assigned" ON "public"."tasks" USING "btree" ("assigned_to");



CREATE INDEX "idx_tasks_column" ON "public"."tasks" USING "btree" ("column_id", "sort_order");



CREATE INDEX "idx_tasks_company_id" ON "public"."tasks" USING "btree" ("company_id");



CREATE INDEX "idx_tasks_contact_id" ON "public"."tasks" USING "btree" ("contact_id");



CREATE INDEX "idx_tasks_lane" ON "public"."tasks" USING "btree" ("lane");



CREATE INDEX "idx_tasks_milestone" ON "public"."tasks" USING "btree" ("project_id") WHERE "is_milestone";



CREATE INDEX "idx_tasks_org" ON "public"."tasks" USING "btree" ("org_id");



CREATE INDEX "idx_tasks_project" ON "public"."tasks" USING "btree" ("project_id");



CREATE INDEX "idx_transcripts_entity" ON "public"."transcripts" USING "btree" ("entity_type", "entity_id");



CREATE UNIQUE INDEX "ux_ai_runs_active" ON "public"."ai_runs" USING "btree" ("transcript_id", "preset_key") WHERE ("status" = ANY (ARRAY['pending'::"text", 'running'::"text"]));



CREATE OR REPLACE TRIGGER "on_profile_created" AFTER INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_profile_settings"();



CREATE OR REPLACE TRIGGER "on_stage_change" AFTER UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."log_stage_change"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."calls" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."companies" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."meetings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."user_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_aa_enforce_stage_gate" BEFORE UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."aa_enforce_stage_gate"();



CREATE OR REPLACE TRIGGER "trg_aa_resolve_board" BEFORE INSERT OR UPDATE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."resolve_task_board"();



CREATE OR REPLACE TRIGGER "trg_ab_null_internal_stage" BEFORE INSERT OR UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."null_internal_stage"();



CREATE OR REPLACE TRIGGER "trg_leads_updated_at" BEFORE UPDATE ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."update_leads_updated_at"();



CREATE OR REPLACE TRIGGER "trg_log_delete_calls" BEFORE DELETE ON "public"."calls" FOR EACH ROW EXECUTE FUNCTION "public"."log_delete_call"();



CREATE OR REPLACE TRIGGER "trg_log_delete_companies" BEFORE DELETE ON "public"."companies" FOR EACH ROW EXECUTE FUNCTION "public"."log_delete_company"();



CREATE OR REPLACE TRIGGER "trg_log_delete_contacts" BEFORE DELETE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."log_delete_contact"();



CREATE OR REPLACE TRIGGER "trg_log_delete_meetings" BEFORE DELETE ON "public"."meetings" FOR EACH ROW EXECUTE FUNCTION "public"."log_delete_meeting"();



CREATE OR REPLACE TRIGGER "trg_log_delete_projects" BEFORE DELETE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."log_delete_project"();



CREATE OR REPLACE TRIGGER "trg_log_delete_tasks" BEFORE DELETE ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."log_delete_task"();



CREATE OR REPLACE TRIGGER "trg_notify_project_assigned" AFTER INSERT OR UPDATE OF "owner_id" ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."notify_project_assigned"();



CREATE OR REPLACE TRIGGER "trg_notify_task_assigned" AFTER INSERT OR UPDATE OF "assigned_to" ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."notify_task_assigned"();



CREATE OR REPLACE TRIGGER "trg_protect_last_owner" BEFORE DELETE OR UPDATE ON "public"."memberships" FOR EACH ROW EXECUTE FUNCTION "public"."protect_last_owner"();



CREATE OR REPLACE TRIGGER "trg_set_org_id" BEFORE INSERT ON "public"."activities" FOR EACH ROW EXECUTE FUNCTION "public"."set_org_id"();



CREATE OR REPLACE TRIGGER "trg_set_org_id" BEFORE INSERT ON "public"."activity_log" FOR EACH ROW EXECUTE FUNCTION "public"."set_org_id"();



CREATE OR REPLACE TRIGGER "trg_set_org_id" BEFORE INSERT ON "public"."ai_runs" FOR EACH ROW EXECUTE FUNCTION "public"."set_org_id"();



CREATE OR REPLACE TRIGGER "trg_set_org_id" BEFORE INSERT ON "public"."call_tracker_days" FOR EACH ROW EXECUTE FUNCTION "public"."set_org_id"();



CREATE OR REPLACE TRIGGER "trg_set_org_id" BEFORE INSERT ON "public"."calls" FOR EACH ROW EXECUTE FUNCTION "public"."set_org_id"();



CREATE OR REPLACE TRIGGER "trg_set_org_id" BEFORE INSERT ON "public"."companies" FOR EACH ROW EXECUTE FUNCTION "public"."set_org_id"();



CREATE OR REPLACE TRIGGER "trg_set_org_id" BEFORE INSERT ON "public"."contact_company" FOR EACH ROW EXECUTE FUNCTION "public"."set_org_id"();



CREATE OR REPLACE TRIGGER "trg_set_org_id" BEFORE INSERT ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."set_org_id"();



CREATE OR REPLACE TRIGGER "trg_set_org_id" BEFORE INSERT ON "public"."delivery_template_phases" FOR EACH ROW EXECUTE FUNCTION "public"."set_org_id"();



CREATE OR REPLACE TRIGGER "trg_set_org_id" BEFORE INSERT ON "public"."delivery_template_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."set_org_id"();



CREATE OR REPLACE TRIGGER "trg_set_org_id" BEFORE INSERT ON "public"."delivery_templates" FOR EACH ROW EXECUTE FUNCTION "public"."set_org_id"();



CREATE OR REPLACE TRIGGER "trg_set_org_id" BEFORE INSERT ON "public"."kpi_entries" FOR EACH ROW EXECUTE FUNCTION "public"."set_org_id"();



CREATE OR REPLACE TRIGGER "trg_set_org_id" BEFORE INSERT ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."set_org_id"();



CREATE OR REPLACE TRIGGER "trg_set_org_id" BEFORE INSERT ON "public"."meetings" FOR EACH ROW EXECUTE FUNCTION "public"."set_org_id"();



CREATE OR REPLACE TRIGGER "trg_set_org_id" BEFORE INSERT ON "public"."project_columns" FOR EACH ROW EXECUTE FUNCTION "public"."set_org_id"();



CREATE OR REPLACE TRIGGER "trg_set_org_id" BEFORE INSERT ON "public"."project_files" FOR EACH ROW EXECUTE FUNCTION "public"."set_org_id"();



CREATE OR REPLACE TRIGGER "trg_set_org_id" BEFORE INSERT ON "public"."project_members" FOR EACH ROW EXECUTE FUNCTION "public"."set_org_id"();



CREATE OR REPLACE TRIGGER "trg_set_org_id" BEFORE INSERT ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."set_org_id"();



CREATE OR REPLACE TRIGGER "trg_set_org_id" BEFORE INSERT ON "public"."scheduled_calls" FOR EACH ROW EXECUTE FUNCTION "public"."set_org_id"();



CREATE OR REPLACE TRIGGER "trg_set_org_id" BEFORE INSERT ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."set_org_id"();



CREATE OR REPLACE TRIGGER "trg_set_org_id" BEFORE INSERT ON "public"."transcripts" FOR EACH ROW EXECUTE FUNCTION "public"."set_org_id"();



CREATE OR REPLACE TRIGGER "trg_set_updated_at" BEFORE UPDATE ON "public"."delivery_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_updated_at" BEFORE UPDATE ON "public"."project_columns" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();



CREATE OR REPLACE TRIGGER "trg_sync_deal_stage_fields" BEFORE INSERT OR UPDATE OF "stage_id" ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."sync_deal_stage_fields"();



CREATE OR REPLACE TRIGGER "trg_sync_lane_on_category" AFTER UPDATE OF "category" ON "public"."project_columns" FOR EACH ROW EXECUTE FUNCTION "public"."sync_lane_on_category_change"();



CREATE OR REPLACE TRIGGER "trg_sync_project_stage" BEFORE INSERT OR UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."sync_project_stage"();



CREATE OR REPLACE TRIGGER "trg_zz_delivery_completion_gate" BEFORE UPDATE OF "status" ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_delivery_completion"();



CREATE OR REPLACE TRIGGER "trg_zz_delivery_progress" AFTER INSERT OR DELETE OR UPDATE OF "lane", "project_id" ON "public"."tasks" FOR EACH ROW EXECUTE FUNCTION "public"."sync_delivery_progress"();



CREATE OR REPLACE TRIGGER "trg_zz_run_automations" AFTER UPDATE ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."run_stage_automations"();



CREATE OR REPLACE TRIGGER "trg_zz_seed_columns" AFTER INSERT ON "public"."projects" FOR EACH ROW EXECUTE FUNCTION "public"."seed_project_columns"();



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."ai_runs"
    ADD CONSTRAINT "ai_runs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."ai_runs"
    ADD CONSTRAINT "ai_runs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_runs"
    ADD CONSTRAINT "ai_runs_transcript_id_fkey" FOREIGN KEY ("transcript_id") REFERENCES "public"."transcripts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_rules"
    ADD CONSTRAINT "automation_rules_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_runs"
    ADD CONSTRAINT "automation_runs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_runs"
    ADD CONSTRAINT "automation_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_runs"
    ADD CONSTRAINT "automation_runs_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "public"."automation_rules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."automation_runs"
    ADD CONSTRAINT "automation_runs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."call_tracker_days"
    ADD CONSTRAINT "call_tracker_days_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."call_tracker_days"
    ADD CONSTRAINT "call_tracker_days_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."calls"
    ADD CONSTRAINT "calls_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."calls"
    ADD CONSTRAINT "calls_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."calls"
    ADD CONSTRAINT "calls_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."calls"
    ADD CONSTRAINT "calls_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."calls"
    ADD CONSTRAINT "calls_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."contact_company"
    ADD CONSTRAINT "contact_company_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_company"
    ADD CONSTRAINT "contact_company_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_company"
    ADD CONSTRAINT "contact_company_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."dashboard_sync"
    ADD CONSTRAINT "dashboard_sync_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_template_phases"
    ADD CONSTRAINT "delivery_template_phases_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_template_phases"
    ADD CONSTRAINT "delivery_template_phases_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."delivery_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_template_tasks"
    ADD CONSTRAINT "delivery_template_tasks_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_template_tasks"
    ADD CONSTRAINT "delivery_template_tasks_phase_id_fkey" FOREIGN KEY ("phase_id") REFERENCES "public"."delivery_template_phases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_template_tasks"
    ADD CONSTRAINT "delivery_template_tasks_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."delivery_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_templates"
    ADD CONSTRAINT "delivery_templates_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."invitations"
    ADD CONSTRAINT "invitations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."kpi_entries"
    ADD CONSTRAINT "kpi_entries_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."kpi_entries"
    ADD CONSTRAINT "kpi_entries_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_converted_company_id_fkey" FOREIGN KEY ("converted_company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_converted_contact_id_fkey" FOREIGN KEY ("converted_contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_converted_deal_id_fkey" FOREIGN KEY ("converted_deal_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."meeting_attendees"
    ADD CONSTRAINT "meeting_attendees_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meeting_attendees"
    ADD CONSTRAINT "meeting_attendees_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."meeting_attendees"
    ADD CONSTRAINT "meeting_attendees_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."meetings"
    ADD CONSTRAINT "meetings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."meetings"
    ADD CONSTRAINT "meetings_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."meetings"
    ADD CONSTRAINT "meetings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."meetings"
    ADD CONSTRAINT "meetings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."meetings"
    ADD CONSTRAINT "meetings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."memberships"
    ADD CONSTRAINT "memberships_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."pipeline_stages"
    ADD CONSTRAINT "pipeline_stages_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_columns"
    ADD CONSTRAINT "project_columns_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_columns"
    ADD CONSTRAINT "project_columns_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_files"
    ADD CONSTRAINT "project_files_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."project_files"
    ADD CONSTRAINT "project_files_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_files"
    ADD CONSTRAINT "project_files_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."project_members"
    ADD CONSTRAINT "project_members_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_parent_deal_id_fkey" FOREIGN KEY ("parent_deal_id") REFERENCES "public"."projects"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id");



ALTER TABLE ONLY "public"."projects"
    ADD CONSTRAINT "projects_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stages"("id");



ALTER TABLE ONLY "public"."scheduled_calls"
    ADD CONSTRAINT "scheduled_calls_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."scheduled_calls"
    ADD CONSTRAINT "scheduled_calls_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."scheduled_calls"
    ADD CONSTRAINT "scheduled_calls_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."scheduled_calls"
    ADD CONSTRAINT "scheduled_calls_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."scheduled_calls"
    ADD CONSTRAINT "scheduled_calls_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stage_requirements"
    ADD CONSTRAINT "stage_requirements_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stage_requirements"
    ADD CONSTRAINT "stage_requirements_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stage_requirements"
    ADD CONSTRAINT "stage_requirements_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_column_id_fkey" FOREIGN KEY ("column_id") REFERENCES "public"."project_columns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."transcripts"
    ADD CONSTRAINT "transcripts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."transcripts"
    ADD CONSTRAINT "transcripts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_settings"
    ADD CONSTRAINT "user_settings_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Authenticated read pipeline_stages" ON "public"."pipeline_stages" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated read pipelines" ON "public"."pipelines" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Users can manage own project files" ON "public"."project_files" USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND (( SELECT "auth"."uid"() AS "uid") = "user_id"))) WITH CHECK ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND (( SELECT "auth"."uid"() AS "uid") = "user_id")));



CREATE POLICY "Users delete own data" ON "public"."dashboard_sync" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users delete own logs" ON "public"."activity_log" FOR DELETE USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users insert own logs" ON "public"."activity_log" FOR INSERT WITH CHECK ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "Users read own data" ON "public"."dashboard_sync" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users see own logs" ON "public"."activity_log" FOR SELECT USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR ("user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "Users update own data" ON "public"."dashboard_sync" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users write own data" ON "public"."dashboard_sync" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."activities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "activities_insert" ON "public"."activities" FOR INSERT WITH CHECK ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND (( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"]))));



CREATE POLICY "activities_select" ON "public"."activities" FOR SELECT USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR ("created_by" = ( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."activity_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ai_runs_insert" ON "public"."ai_runs" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."transcripts" "t"
  WHERE (("t"."id" = "ai_runs"."transcript_id") AND ("t"."entity_type" = "ai_runs"."entity_type") AND ("t"."entity_id" = "ai_runs"."entity_id"))))));



CREATE POLICY "ai_runs_select" ON "public"."ai_runs" FOR SELECT TO "authenticated" USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((("entity_type" = 'call'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."calls" "c"
  WHERE ("c"."id" = "ai_runs"."entity_id")))) OR (("entity_type" = 'meeting'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."meetings" "m"
  WHERE ("m"."id" = "ai_runs"."entity_id")))))));



CREATE POLICY "ai_runs_update" ON "public"."ai_runs" FOR UPDATE TO "authenticated" USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR ("created_by" = ( SELECT "auth"."uid"() AS "uid"))))) WITH CHECK ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR ("created_by" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "attendees_own" ON "public"."meeting_attendees" USING ((EXISTS ( SELECT 1
   FROM "public"."meetings" "m"
  WHERE (("m"."id" = "meeting_attendees"."meeting_id") AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR ("m"."created_by" = ( SELECT "auth"."uid"() AS "uid"))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."meetings" "m"
  WHERE (("m"."id" = "meeting_attendees"."meeting_id") AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR ("m"."created_by" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."automation_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "automation_rules_delete" ON "public"."automation_rules" FOR DELETE USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND (( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));



CREATE POLICY "automation_rules_insert" ON "public"."automation_rules" FOR INSERT WITH CHECK ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND (( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));



CREATE POLICY "automation_rules_select" ON "public"."automation_rules" FOR SELECT USING (("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")));



CREATE POLICY "automation_rules_update" ON "public"."automation_rules" FOR UPDATE USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND (( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])))) WITH CHECK ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND (( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));



ALTER TABLE "public"."automation_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "automation_runs_select" ON "public"."automation_runs" FOR SELECT USING (("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")));



ALTER TABLE "public"."call_tracker_days" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."calls" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "calls_delete" ON "public"."calls" FOR DELETE USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR ("created_by" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "calls_insert" ON "public"."calls" FOR INSERT WITH CHECK ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND (( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"]))));



CREATE POLICY "calls_select" ON "public"."calls" FOR SELECT USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR ("created_by" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "calls_update" ON "public"."calls" FOR UPDATE USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR ("created_by" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "cc_delete" ON "public"."contact_company" FOR DELETE USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND (( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));



CREATE POLICY "cc_insert" ON "public"."contact_company" FOR INSERT WITH CHECK ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND (( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"]))));



CREATE POLICY "cc_select" ON "public"."contact_company" FOR SELECT USING (("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")));



ALTER TABLE "public"."companies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "companies_delete" ON "public"."companies" FOR DELETE USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR ("owner_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("created_by" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "companies_insert" ON "public"."companies" FOR INSERT WITH CHECK ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND (( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"]))));



CREATE POLICY "companies_select" ON "public"."companies" FOR SELECT USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR ("owner_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("created_by" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "companies_update" ON "public"."companies" FOR UPDATE USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR ("owner_id" = ( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."contact_company" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contacts_delete" ON "public"."contacts" FOR DELETE USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR ("owner_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("created_by" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "contacts_insert" ON "public"."contacts" FOR INSERT WITH CHECK ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND (( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"]))));



CREATE POLICY "contacts_select" ON "public"."contacts" FOR SELECT USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR ("owner_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("created_by" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "contacts_update" ON "public"."contacts" FOR UPDATE USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR ("owner_id" = ( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."dashboard_sync" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_template_phases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_template_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "dt_delete" ON "public"."delivery_templates" FOR DELETE TO "authenticated" USING ((("org_id" = "public"."current_org_id"()) AND ("public"."current_org_role"() = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));



CREATE POLICY "dt_insert" ON "public"."delivery_templates" FOR INSERT TO "authenticated" WITH CHECK ((("org_id" = "public"."current_org_id"()) AND ("public"."current_org_role"() = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));



CREATE POLICY "dt_select" ON "public"."delivery_templates" FOR SELECT TO "authenticated" USING (("org_id" = "public"."current_org_id"()));



CREATE POLICY "dt_update" ON "public"."delivery_templates" FOR UPDATE TO "authenticated" USING ((("org_id" = "public"."current_org_id"()) AND ("public"."current_org_role"() = ANY (ARRAY['owner'::"text", 'admin'::"text"])))) WITH CHECK ((("org_id" = "public"."current_org_id"()) AND ("public"."current_org_role"() = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));



CREATE POLICY "dtp_delete" ON "public"."delivery_template_phases" FOR DELETE TO "authenticated" USING ((("org_id" = "public"."current_org_id"()) AND ("public"."current_org_role"() = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));



CREATE POLICY "dtp_insert" ON "public"."delivery_template_phases" FOR INSERT TO "authenticated" WITH CHECK ((("org_id" = "public"."current_org_id"()) AND ("public"."current_org_role"() = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));



CREATE POLICY "dtp_select" ON "public"."delivery_template_phases" FOR SELECT TO "authenticated" USING (("org_id" = "public"."current_org_id"()));



CREATE POLICY "dtp_update" ON "public"."delivery_template_phases" FOR UPDATE TO "authenticated" USING ((("org_id" = "public"."current_org_id"()) AND ("public"."current_org_role"() = ANY (ARRAY['owner'::"text", 'admin'::"text"])))) WITH CHECK ((("org_id" = "public"."current_org_id"()) AND ("public"."current_org_role"() = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));



CREATE POLICY "dtt_delete" ON "public"."delivery_template_tasks" FOR DELETE TO "authenticated" USING ((("org_id" = "public"."current_org_id"()) AND ("public"."current_org_role"() = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));



CREATE POLICY "dtt_insert" ON "public"."delivery_template_tasks" FOR INSERT TO "authenticated" WITH CHECK ((("org_id" = "public"."current_org_id"()) AND ("public"."current_org_role"() = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));



CREATE POLICY "dtt_select" ON "public"."delivery_template_tasks" FOR SELECT TO "authenticated" USING (("org_id" = "public"."current_org_id"()));



CREATE POLICY "dtt_update" ON "public"."delivery_template_tasks" FOR UPDATE TO "authenticated" USING ((("org_id" = "public"."current_org_id"()) AND ("public"."current_org_role"() = ANY (ARRAY['owner'::"text", 'admin'::"text"])))) WITH CHECK ((("org_id" = "public"."current_org_id"()) AND ("public"."current_org_role"() = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));



CREATE POLICY "inv_delete" ON "public"."invitations" FOR DELETE USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND (( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));



CREATE POLICY "inv_insert" ON "public"."invitations" FOR INSERT WITH CHECK ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND (( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));



CREATE POLICY "inv_select" ON "public"."invitations" FOR SELECT USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND (( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));



ALTER TABLE "public"."invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kpi_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "kpi_own" ON "public"."kpi_entries" USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ("profile_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ("profile_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leads_delete" ON "public"."leads" FOR DELETE USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR ("user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "leads_insert_own" ON "public"."leads" FOR INSERT WITH CHECK ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND (( SELECT "auth"."uid"() AS "uid") = "user_id")));



CREATE POLICY "leads_select" ON "public"."leads" FOR SELECT USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR ("user_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "leads_update" ON "public"."leads" FOR UPDATE USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR ("user_id" = ( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."meeting_attendees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."meetings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "meetings_delete" ON "public"."meetings" FOR DELETE USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR ("created_by" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "meetings_insert" ON "public"."meetings" FOR INSERT WITH CHECK ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND (( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"]))));



CREATE POLICY "meetings_select" ON "public"."meetings" FOR SELECT USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR ("created_by" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "meetings_update" ON "public"."meetings" FOR UPDATE USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR ("created_by" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "membership_delete" ON "public"."memberships" FOR DELETE USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR ("profile_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "membership_insert" ON "public"."memberships" FOR INSERT WITH CHECK ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND (( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) AND (("role" <> 'owner'::"text") OR (( SELECT "public"."current_org_role"() AS "current_org_role") = 'owner'::"text"))));



CREATE POLICY "membership_select_own_org" ON "public"."memberships" FOR SELECT USING ((("profile_id" = "auth"."uid"()) OR "public"."is_org_member"("org_id")));



CREATE POLICY "membership_update" ON "public"."memberships" FOR UPDATE USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND (( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])))) WITH CHECK ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND (("role" <> 'owner'::"text") OR (( SELECT "public"."current_org_role"() AS "current_org_role") = 'owner'::"text"))));



ALTER TABLE "public"."memberships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notif_delete" ON "public"."notifications" FOR DELETE USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ("recipient_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "notif_select" ON "public"."notifications" FOR SELECT USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ("recipient_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "notif_update" ON "public"."notifications" FOR UPDATE USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ("recipient_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "org_select_member" ON "public"."organizations" FOR SELECT USING ("public"."is_org_member"("id"));



CREATE POLICY "org_update_owner" ON "public"."organizations" FOR UPDATE USING ((("id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND (( SELECT "public"."current_org_role"() AS "current_org_role") = 'owner'::"text")));



ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pipeline_stages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pipelines" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pm_delete" ON "public"."project_members" FOR DELETE TO "authenticated" USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR (EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "project_members"."project_id") AND (("p"."owner_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("p"."created_by" = ( SELECT "auth"."uid"() AS "uid")))))))));



CREATE POLICY "pm_insert" ON "public"."project_members" FOR INSERT TO "authenticated" WITH CHECK ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR (EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "project_members"."project_id") AND (("p"."owner_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("p"."created_by" = ( SELECT "auth"."uid"() AS "uid")))))))));



CREATE POLICY "pm_select" ON "public"."project_members" FOR SELECT TO "authenticated" USING (("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")));



CREATE POLICY "pm_update" ON "public"."project_members" FOR UPDATE TO "authenticated" USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR (EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "project_members"."project_id") AND (("p"."owner_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("p"."created_by" = ( SELECT "auth"."uid"() AS "uid"))))))))) WITH CHECK ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR (EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "project_members"."project_id") AND (("p"."owner_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("p"."created_by" = ( SELECT "auth"."uid"() AS "uid")))))))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select" ON "public"."profiles" FOR SELECT USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."shares_org_with"("id")));



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE USING (("id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."project_columns" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "project_columns_delete" ON "public"."project_columns" FOR DELETE USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR (EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "project_columns"."project_id") AND (("p"."owner_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("p"."created_by" = ( SELECT "auth"."uid"() AS "uid")))))))));



CREATE POLICY "project_columns_insert" ON "public"."project_columns" FOR INSERT WITH CHECK ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR (EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "project_columns"."project_id") AND (("p"."owner_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("p"."created_by" = ( SELECT "auth"."uid"() AS "uid")))))))));



CREATE POLICY "project_columns_select" ON "public"."project_columns" FOR SELECT USING (("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")));



CREATE POLICY "project_columns_update" ON "public"."project_columns" FOR UPDATE USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR (EXISTS ( SELECT 1
   FROM "public"."projects" "p"
  WHERE (("p"."id" = "project_columns"."project_id") AND (("p"."owner_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("p"."created_by" = ( SELECT "auth"."uid"() AS "uid"))))))))) WITH CHECK (("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")));



ALTER TABLE "public"."project_files" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."project_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."projects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "projects_delete" ON "public"."projects" FOR DELETE USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = 'owner'::"text") OR ("owner_id" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "projects_insert" ON "public"."projects" FOR INSERT WITH CHECK ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND (( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"]))));



CREATE POLICY "projects_select" ON "public"."projects" FOR SELECT USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR ("owner_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("created_by" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "projects_update" ON "public"."projects" FOR UPDATE USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR ("owner_id" = ( SELECT "auth"."uid"() AS "uid")))));



ALTER TABLE "public"."scheduled_calls" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "scheduled_own" ON "public"."scheduled_calls" USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ("profile_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ("profile_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "settings_own" ON "public"."user_settings" USING (("profile_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "stage_req_delete" ON "public"."stage_requirements" FOR DELETE USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND (( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));



CREATE POLICY "stage_req_insert" ON "public"."stage_requirements" FOR INSERT WITH CHECK ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND (( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));



CREATE POLICY "stage_req_select" ON "public"."stage_requirements" FOR SELECT USING (("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")));



CREATE POLICY "stage_req_update" ON "public"."stage_requirements" FOR UPDATE USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND (( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])))) WITH CHECK ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND (( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"]))));



ALTER TABLE "public"."stage_requirements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tasks_delete" ON "public"."tasks" FOR DELETE USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR ("created_by" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "tasks_insert" ON "public"."tasks" FOR INSERT WITH CHECK ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND (( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text"]))));



CREATE POLICY "tasks_select" ON "public"."tasks" FOR SELECT USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR ("assigned_to" = ( SELECT "auth"."uid"() AS "uid")) OR ("created_by" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "tasks_update" ON "public"."tasks" FOR UPDATE USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((( SELECT "public"."current_org_role"() AS "current_org_role") = ANY (ARRAY['owner'::"text", 'admin'::"text"])) OR ("assigned_to" = ( SELECT "auth"."uid"() AS "uid")) OR ("created_by" = ( SELECT "auth"."uid"() AS "uid")))));



CREATE POLICY "tracker_own" ON "public"."call_tracker_days" USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ("profile_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ("profile_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."transcripts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "transcripts_delete" ON "public"."transcripts" FOR DELETE TO "authenticated" USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "transcripts_insert" ON "public"."transcripts" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND ((("entity_type" = 'call'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."calls" "c"
  WHERE ("c"."id" = "transcripts"."entity_id")))) OR (("entity_type" = 'meeting'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."meetings" "m"
  WHERE ("m"."id" = "transcripts"."entity_id")))))));



CREATE POLICY "transcripts_select" ON "public"."transcripts" FOR SELECT TO "authenticated" USING ((("org_id" = ( SELECT "public"."current_org_id"() AS "current_org_id")) AND ((("entity_type" = 'call'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."calls" "c"
  WHERE ("c"."id" = "transcripts"."entity_id")))) OR (("entity_type" = 'meeting'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."meetings" "m"
  WHERE ("m"."id" = "transcripts"."entity_id")))))));



ALTER TABLE "public"."user_settings" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."aa_enforce_stage_gate"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."aa_enforce_stage_gate"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_delivery_template"("p_project_id" "uuid", "p_template_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_delivery_template"("p_project_id" "uuid", "p_template_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_delivery_template"("p_project_id" "uuid", "p_template_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."apply_pending_invites"("p_profile_id" "uuid", "p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_pending_invites"("p_profile_id" "uuid", "p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."category_to_lane"("p" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."category_to_lane"("p" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."category_to_lane"("p" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_delivery_completion"("p_project_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_delivery_completion"("p_project_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_delivery_completion"("p_project_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_stage_requirements"("p_project_id" "uuid", "p_target_stage_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_stage_requirements"("p_project_id" "uuid", "p_target_stage_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_stage_requirements"("p_project_id" "uuid", "p_target_stage_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."convert_lead"("p_lead_id" "uuid", "p_company_name" "text", "p_contact_first_name" "text", "p_contact_last_name" "text", "p_contact_phone" "text", "p_contact_email" "text", "p_direction" "text", "p_deal_title" "text", "p_deal_amount" numeric, "p_company_id" "uuid", "p_contact_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."convert_lead"("p_lead_id" "uuid", "p_company_name" "text", "p_contact_first_name" "text", "p_contact_last_name" "text", "p_contact_phone" "text", "p_contact_email" "text", "p_direction" "text", "p_deal_title" "text", "p_deal_amount" numeric, "p_company_id" "uuid", "p_contact_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."convert_lead"("p_lead_id" "uuid", "p_company_name" "text", "p_contact_first_name" "text", "p_contact_last_name" "text", "p_contact_phone" "text", "p_contact_email" "text", "p_direction" "text", "p_deal_title" "text", "p_deal_amount" numeric, "p_company_id" "uuid", "p_contact_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."copy_delivery_template"("p_project_id" "uuid", "p_template_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."copy_delivery_template"("p_project_id" "uuid", "p_template_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_org_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_org_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_org_id"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."current_org_role"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."current_org_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_org_role"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_project_column"("p_column_id" "uuid", "p_target_column_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_project_column"("p_column_id" "uuid", "p_target_column_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_project_column"("p_column_id" "uuid", "p_target_column_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."enforce_delivery_completion"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."enforce_delivery_completion"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_profile_settings"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_profile_settings"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_org_member"("p_org" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_org_member"("p_org" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_member"("p_org" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."lane_to_category"("p" "public"."task_lane") TO "anon";
GRANT ALL ON FUNCTION "public"."lane_to_category"("p" "public"."task_lane") TO "authenticated";
GRANT ALL ON FUNCTION "public"."lane_to_category"("p" "public"."task_lane") TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_delete_call"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_delete_call"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_delete_company"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_delete_company"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_delete_contact"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_delete_contact"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_delete_meeting"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_delete_meeting"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_delete_project"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_delete_project"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_delete_task"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_delete_task"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."log_stage_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."log_stage_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_project_assigned"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_project_assigned"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_task_assigned"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_task_assigned"() TO "service_role";



GRANT ALL ON FUNCTION "public"."null_internal_stage"() TO "anon";
GRANT ALL ON FUNCTION "public"."null_internal_stage"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."null_internal_stage"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_last_owner"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_last_owner"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."recalc_delivery_progress"("p_project_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recalc_delivery_progress"("p_project_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."reorder_tasks"("p_moves" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reorder_tasks"("p_moves" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reorder_tasks"("p_moves" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."resolve_task_board"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_task_board"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."run_stage_automations"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."run_stage_automations"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."seed_project_columns"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."seed_project_columns"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_org_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_org_id"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."shares_org_with"("p_profile" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."shares_org_with"("p_profile" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."shares_org_with"("p_profile" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."spawn_delivery_project"("p_deal_id" "uuid", "p_kind" "text", "p_template_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."spawn_delivery_project"("p_deal_id" "uuid", "p_kind" "text", "p_template_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."spawn_delivery_project"("p_deal_id" "uuid", "p_kind" "text", "p_template_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_deal_stage_fields"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_deal_stage_fields"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_delivery_progress"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_delivery_progress"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_lane_on_category_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_lane_on_category_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_project_stage"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_project_stage"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_project_stage"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_leads_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_leads_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."activities" TO "anon";
GRANT ALL ON TABLE "public"."activities" TO "authenticated";
GRANT ALL ON TABLE "public"."activities" TO "service_role";



GRANT ALL ON TABLE "public"."activity_log" TO "anon";
GRANT ALL ON TABLE "public"."activity_log" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_log" TO "service_role";



GRANT ALL ON TABLE "public"."ai_runs" TO "anon";
GRANT ALL ON TABLE "public"."ai_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_runs" TO "service_role";



GRANT ALL ON TABLE "public"."automation_rules" TO "anon";
GRANT ALL ON TABLE "public"."automation_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."automation_rules" TO "service_role";



GRANT ALL ON TABLE "public"."automation_runs" TO "anon";
GRANT ALL ON TABLE "public"."automation_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."automation_runs" TO "service_role";



GRANT ALL ON TABLE "public"."call_tracker_days" TO "anon";
GRANT ALL ON TABLE "public"."call_tracker_days" TO "authenticated";
GRANT ALL ON TABLE "public"."call_tracker_days" TO "service_role";



GRANT ALL ON TABLE "public"."calls" TO "anon";
GRANT ALL ON TABLE "public"."calls" TO "authenticated";
GRANT ALL ON TABLE "public"."calls" TO "service_role";



GRANT ALL ON TABLE "public"."companies" TO "anon";
GRANT ALL ON TABLE "public"."companies" TO "authenticated";
GRANT ALL ON TABLE "public"."companies" TO "service_role";



GRANT ALL ON TABLE "public"."contact_company" TO "anon";
GRANT ALL ON TABLE "public"."contact_company" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_company" TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON TABLE "public"."dashboard_sync" TO "anon";
GRANT ALL ON TABLE "public"."dashboard_sync" TO "authenticated";
GRANT ALL ON TABLE "public"."dashboard_sync" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_template_phases" TO "anon";
GRANT ALL ON TABLE "public"."delivery_template_phases" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_template_phases" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_template_tasks" TO "anon";
GRANT ALL ON TABLE "public"."delivery_template_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_template_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_templates" TO "anon";
GRANT ALL ON TABLE "public"."delivery_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."delivery_templates" TO "service_role";



GRANT ALL ON TABLE "public"."invitations" TO "anon";
GRANT ALL ON TABLE "public"."invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."invitations" TO "service_role";



GRANT ALL ON TABLE "public"."kpi_entries" TO "anon";
GRANT ALL ON TABLE "public"."kpi_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."kpi_entries" TO "service_role";



GRANT ALL ON TABLE "public"."leads" TO "anon";
GRANT ALL ON TABLE "public"."leads" TO "authenticated";
GRANT ALL ON TABLE "public"."leads" TO "service_role";



GRANT ALL ON TABLE "public"."meeting_attendees" TO "anon";
GRANT ALL ON TABLE "public"."meeting_attendees" TO "authenticated";
GRANT ALL ON TABLE "public"."meeting_attendees" TO "service_role";



GRANT ALL ON TABLE "public"."meetings" TO "anon";
GRANT ALL ON TABLE "public"."meetings" TO "authenticated";
GRANT ALL ON TABLE "public"."meetings" TO "service_role";



GRANT ALL ON TABLE "public"."memberships" TO "anon";
GRANT ALL ON TABLE "public"."memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."memberships" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."pipeline_stages" TO "anon";
GRANT ALL ON TABLE "public"."pipeline_stages" TO "authenticated";
GRANT ALL ON TABLE "public"."pipeline_stages" TO "service_role";



GRANT ALL ON TABLE "public"."pipelines" TO "anon";
GRANT ALL ON TABLE "public"."pipelines" TO "authenticated";
GRANT ALL ON TABLE "public"."pipelines" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."project_columns" TO "anon";
GRANT ALL ON TABLE "public"."project_columns" TO "authenticated";
GRANT ALL ON TABLE "public"."project_columns" TO "service_role";



GRANT ALL ON TABLE "public"."project_files" TO "anon";
GRANT ALL ON TABLE "public"."project_files" TO "authenticated";
GRANT ALL ON TABLE "public"."project_files" TO "service_role";



GRANT ALL ON TABLE "public"."project_members" TO "anon";
GRANT ALL ON TABLE "public"."project_members" TO "authenticated";
GRANT ALL ON TABLE "public"."project_members" TO "service_role";



GRANT ALL ON TABLE "public"."projects" TO "anon";
GRANT ALL ON TABLE "public"."projects" TO "authenticated";
GRANT ALL ON TABLE "public"."projects" TO "service_role";



GRANT ALL ON TABLE "public"."scheduled_calls" TO "anon";
GRANT ALL ON TABLE "public"."scheduled_calls" TO "authenticated";
GRANT ALL ON TABLE "public"."scheduled_calls" TO "service_role";



GRANT ALL ON TABLE "public"."stage_requirements" TO "anon";
GRANT ALL ON TABLE "public"."stage_requirements" TO "authenticated";
GRANT ALL ON TABLE "public"."stage_requirements" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."transcripts" TO "anon";
GRANT ALL ON TABLE "public"."transcripts" TO "authenticated";
GRANT ALL ON TABLE "public"."transcripts" TO "service_role";



GRANT ALL ON TABLE "public"."user_settings" TO "anon";
GRANT ALL ON TABLE "public"."user_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."user_settings" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";









-- ═══════════════════════════════════════════════════════════════════════════
-- ADDENDUM (Cowork-гейт, 2026-07-12): realtime publication.
-- pg_dump схемы public НЕ включает членство таблиц в publication supabase_realtime
-- (publication — объект уровня БД). Восстанавливаем 10 таблиц из живого прода.
-- Идемпотентно: guard по pg_publication_tables + создание publication при отсутствии
-- (на чистой не-Supabase БД её может не быть; на Supabase создаётся автоматически пустой).
-- Extensions (uuid-ossp, pgcrypto) НЕ включены намеренно — Supabase-managed,
-- предустановлены на каждом проекте; схема использует нативный gen_random_uuid() (PG13+).
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  t text;
  rt_tables text[] := ARRAY[
    'activities','ai_runs','calls','dashboard_sync','meetings',
    'notifications','project_columns','project_members','projects','tasks'
  ];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  FOREACH t IN ARRAY rt_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
