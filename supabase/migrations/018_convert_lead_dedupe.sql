-- ============================================
-- Migration 018: convert_lead v2 — конвертация без дублей
-- Опциональные p_company_id / p_contact_id: если переданы,
-- используем существующие записи вместо создания новых.
-- Applied manually via Supabase SQL Editor
-- ============================================

BEGIN;

-- Смена сигнатуры → старую функцию нужно удалить (CREATE OR REPLACE не умеет)
DROP FUNCTION IF EXISTS convert_lead(uuid, text, text, text, text, text, text, text, numeric);

CREATE OR REPLACE FUNCTION convert_lead(
  p_lead_id uuid,
  p_company_name text DEFAULT NULL,
  p_contact_first_name text DEFAULT NULL,
  p_contact_last_name text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL,
  p_contact_email text DEFAULT NULL,
  p_direction text DEFAULT 'iiot',
  p_deal_title text DEFAULT NULL,
  p_deal_amount numeric DEFAULT NULL,
  p_company_id uuid DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
  SELECT user_id, title INTO v_user_id, v_lead_title
  FROM leads WHERE id = p_lead_id AND status = 'qualified';

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Lead not found or not in qualified status';
  END IF;

  -- 1. Компания: существующая (с проверкой владельца — SECURITY DEFINER!) или новая
  IF p_company_id IS NOT NULL THEN
    SELECT id INTO v_company_id FROM companies
      WHERE id = p_company_id AND user_id = v_user_id;
    IF v_company_id IS NULL THEN
      RAISE EXCEPTION 'Company not found or not owned by lead owner';
    END IF;
  ELSE
    IF p_company_name IS NULL OR btrim(p_company_name) = '' THEN
      RAISE EXCEPTION 'Either p_company_id or p_company_name is required';
    END IF;
    INSERT INTO companies (user_id, name)
    VALUES (v_user_id, p_company_name)
    RETURNING id INTO v_company_id;
  END IF;

  -- 2. Контакт: существующий (с проверкой владельца) или новый
  IF p_contact_id IS NOT NULL THEN
    SELECT id INTO v_contact_id FROM contacts
      WHERE id = p_contact_id AND user_id = v_user_id;
    IF v_contact_id IS NULL THEN
      RAISE EXCEPTION 'Contact not found or not owned by lead owner';
    END IF;
  ELSE
    IF p_contact_first_name IS NULL OR btrim(p_contact_first_name) = '' THEN
      RAISE EXCEPTION 'Either p_contact_id or p_contact_first_name is required';
    END IF;
    INSERT INTO contacts (user_id, first_name, last_name, phone, email)
    VALUES (v_user_id, p_contact_first_name, p_contact_last_name, p_contact_phone, p_contact_email)
    RETURNING id INTO v_contact_id;
  END IF;

  -- 3. Связь контакт—компания (идемпотентно: пара может уже существовать)
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
    user_id, name, direction, pipeline_id, stage_id,
    company_id, contact_id, budget
  )
  VALUES (
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

COMMIT;

-- ============================================
-- VERIFICATION (run separately after migration)
-- ============================================
-- SELECT proname, pronargs FROM pg_proc WHERE proname = 'convert_lead';  -- 1 row, 11 args
