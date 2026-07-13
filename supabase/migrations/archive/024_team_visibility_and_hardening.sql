-- ═══════════════════════════════════════════════════════════════════════════
-- Sprint 25: RBAC-финализация + командная видимость + hardening
-- ═══════════════════════════════════════════════════════════════════════════
-- Применяется атомарно через MCP apply_migration — БЕЗ BEGIN/COMMIT.
--
-- Содержание:
--   1. Командная видимость leads (owner/admin видят всё, manager — своё)
--   2. Командный activity-фид (та же модель)
--   3. Log-функции наследуют org_id из OLD/NEW (инцидент S24: лог из
--      service-контекста получал org_id NULL и молча терялся)
--   4. Гард владения внутри convert_lead (IDOR: SECURITY DEFINER без проверки)
--   5. Чистка legacy: DROP user_role(), DROP profiles.role
--
-- Разведка (S25): policies leads/activity_log переведены на current_org_role()
-- в 023; user_role() не используется ни кодом, ни политиками; handle_new_user
-- profiles.role не пишет. Живые тела функций сняты через pg_get_functiondef.
-- ═══════════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────────
-- 1. Командная видимость leads (паттерн companies из 023)
--    INSERT остаётся own (leads_insert_own не трогаем): лид создаёт владелец.
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS leads_select_own ON public.leads;
DROP POLICY IF EXISTS leads_update_own ON public.leads;
DROP POLICY IF EXISTS leads_delete_own ON public.leads;

CREATE POLICY leads_select ON public.leads FOR SELECT USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
        OR user_id = ( SELECT auth.uid() ) )
);
CREATE POLICY leads_update ON public.leads FOR UPDATE USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
        OR user_id = ( SELECT auth.uid() ) )
);
CREATE POLICY leads_delete ON public.leads FOR DELETE USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
        OR user_id = ( SELECT auth.uid() ) )
);


-- ─────────────────────────────────────────────────────────────────────────
-- 2. Командный activity-фид (INSERT/DELETE политики не трогаем — own)
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users see own logs" ON public.activity_log;

CREATE POLICY "Users see own logs" ON public.activity_log FOR SELECT USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
        OR user_id = ( SELECT auth.uid() ) )
);


-- ─────────────────────────────────────────────────────────────────────────
-- 3. Log-функции: org_id из OLD/NEW, не из auth-контекста.
--    Тела сняты через pg_get_functiondef; изменён ТОЛЬКО INSERT (добавлена
--    колонка org_id). EXCEPTION-блоки и остальное тело сохранены дословно.
--    trg_set_org_id (BEFORE INSERT) заполняет org_id только при NULL, поэтому
--    явное значение из OLD/NEW переживает и в service-контексте.
--    Одна функция = один CREATE OR REPLACE (грабли миграции 011).
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.log_delete_task()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO activity_log (project_id, user_id, org_id, event_type, payload)
  VALUES (OLD.project_id, COALESCE(OLD.created_by, auth.uid()), COALESCE(OLD.org_id, public.current_org_id()), 'entity_deleted',
    jsonb_build_object('entity_type', 'tasks', 'entity_name', COALESCE(OLD.text, ''), 'entity_id', OLD.id));
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN RETURN OLD;
END; $function$;

CREATE OR REPLACE FUNCTION public.log_delete_project()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO activity_log (project_id, user_id, org_id, event_type, payload)
  VALUES (NULL, COALESCE(OLD.owner_id, auth.uid()), COALESCE(OLD.org_id, public.current_org_id()), 'entity_deleted',
    jsonb_build_object('entity_type', 'projects', 'entity_name', COALESCE(OLD.name, ''), 'entity_id', OLD.id));
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN RETURN OLD;
END; $function$;

CREATE OR REPLACE FUNCTION public.log_delete_contact()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO activity_log (project_id, user_id, org_id, event_type, payload)
  VALUES (NULL, COALESCE(OLD.owner_id, auth.uid()), COALESCE(OLD.org_id, public.current_org_id()), 'entity_deleted',
    jsonb_build_object('entity_type', 'contacts', 'entity_name',
      COALESCE(NULLIF(TRIM(COALESCE(OLD.last_name,'') || ' ' || COALESCE(OLD.first_name,'')), ''), ''),
      'entity_id', OLD.id));
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN RETURN OLD;
END; $function$;

CREATE OR REPLACE FUNCTION public.log_delete_company()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO activity_log (project_id, user_id, org_id, event_type, payload)
  VALUES (NULL, COALESCE(OLD.owner_id, auth.uid()), COALESCE(OLD.org_id, public.current_org_id()), 'entity_deleted',
    jsonb_build_object('entity_type', 'companies', 'entity_name', COALESCE(OLD.name, ''), 'entity_id', OLD.id));
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN RETURN OLD;
END; $function$;

CREATE OR REPLACE FUNCTION public.log_delete_call()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO activity_log (project_id, user_id, org_id, event_type, payload)
  VALUES (OLD.project_id, COALESCE(OLD.created_by, auth.uid()), COALESCE(OLD.org_id, public.current_org_id()), 'entity_deleted',
    jsonb_build_object('entity_type', 'calls', 'entity_name', 'Звонок', 'entity_id', OLD.id));
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN RETURN OLD;
END; $function$;

CREATE OR REPLACE FUNCTION public.log_delete_meeting()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO activity_log (project_id, user_id, org_id, event_type, payload)
  VALUES (OLD.project_id, COALESCE(OLD.created_by, auth.uid()), COALESCE(OLD.org_id, public.current_org_id()), 'entity_deleted',
    jsonb_build_object('entity_type', 'meetings', 'entity_name', COALESCE(OLD.title, ''), 'entity_id', OLD.id));
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN RETURN OLD;
END; $function$;

-- log_stage_change пишет в activities (не activity_log); activities.org_id NOT NULL.
-- Наследуем org_id проекта из NEW.
CREATE OR REPLACE FUNCTION public.log_stage_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;


-- ─────────────────────────────────────────────────────────────────────────
-- 4. Гард владения в convert_lead (IDOR: SECURITY DEFINER обходит RLS).
--    Тело снято через pg_get_functiondef; добавлена ТОЛЬКО проверка после
--    DECLARE. Возвращаемый контракт (jsonb {company_id, contact_id, deal_id})
--    не изменён — RPC используют hooks.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.convert_lead(p_lead_id uuid, p_company_name text DEFAULT NULL::text, p_contact_first_name text DEFAULT NULL::text, p_contact_last_name text DEFAULT NULL::text, p_contact_phone text DEFAULT NULL::text, p_contact_email text DEFAULT NULL::text, p_direction text DEFAULT 'iiot'::text, p_deal_title text DEFAULT NULL::text, p_deal_amount numeric DEFAULT NULL::numeric, p_company_id uuid DEFAULT NULL::uuid, p_contact_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- SECURITY DEFINER обходит RLS, поэтому проверяем владение явно.
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

  -- 1. Компания: существующая (с проверкой владельца — SECURITY DEFINER!) или новая
  -- S25 fix: в живых таблицах нет user_id — владение через owner_id/created_by.
  -- Живое тело ссылалось на несуществующую колонку → конверсия падала с 42703.
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

  -- 2. Контакт: существующий (с проверкой владельца) или новый
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

  -- 5. Сделка
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
END $function$;


-- ─────────────────────────────────────────────────────────────────────────
-- 5. Чистка legacy: роли теперь ТОЛЬКО в memberships (current_org_role()).
--    Разведка S25 подтвердила: user_role() не используется ни кодом, ни
--    политиками (переведены в 023); handle_new_user profiles.role не пишет.
-- ─────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.user_role();
ALTER TABLE public.profiles DROP COLUMN IF EXISTS role;
