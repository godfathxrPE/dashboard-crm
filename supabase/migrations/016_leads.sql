-- ============================================
-- Migration 016: Leads table
-- Applied manually via Supabase SQL Editor
-- ============================================

BEGIN;

-- 1. Таблица leads
CREATE TABLE IF NOT EXISTS leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,

  -- Основные поля
  title text NOT NULL,
  source text CHECK (source IS NULL OR source IN ('call','website','referral','cold','inbound','event')),
  status text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','contacted','qualified','disqualified','converted')),
  direction text
    CHECK (direction IS NULL OR direction IN ('erp','iiot')),

  -- Контактные данные (raw — ещё не привязаны к contacts/companies)
  company_name_raw text,
  contact_name_raw text,
  phone text,
  email text,

  -- Контекст
  notes text,
  disqualify_reason text,

  -- Связь с конвертированной сделкой
  converted_deal_id uuid REFERENCES projects(id),
  converted_company_id uuid REFERENCES companies(id),
  converted_contact_id uuid REFERENCES contacts(id),
  converted_at timestamptz,

  -- Мета
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Индексы
CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);

-- 3. RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads_select_own" ON leads
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "leads_insert_own" ON leads
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "leads_update_own" ON leads
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "leads_delete_own" ON leads
  FOR DELETE USING (auth.uid() = user_id);

-- 4. Trigger для updated_at
CREATE OR REPLACE FUNCTION update_leads_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

CREATE TRIGGER trg_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_leads_updated_at();

-- 5. Функция конверсии лида (Salesforce Lead Conversion pattern)
CREATE OR REPLACE FUNCTION convert_lead(
  p_lead_id uuid,
  p_company_name text,
  p_contact_first_name text,
  p_contact_last_name text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL,
  p_contact_email text DEFAULT NULL,
  p_direction text DEFAULT 'iiot',
  p_deal_title text DEFAULT NULL,
  p_deal_amount numeric DEFAULT NULL
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

  -- 1. Компания
  INSERT INTO companies (user_id, name)
  VALUES (v_user_id, p_company_name)
  RETURNING id INTO v_company_id;

  -- 2. Контакт
  INSERT INTO contacts (user_id, first_name, last_name, phone, email)
  VALUES (v_user_id, p_contact_first_name, p_contact_last_name, p_contact_phone, p_contact_email)
  RETURNING id INTO v_contact_id;

  -- 3. Связь контакт—компания
  INSERT INTO contact_company (contact_id, company_id)
  VALUES (v_contact_id, v_company_id);

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

-- 6. GRANT
GRANT ALL ON leads TO authenticated;

COMMIT;

-- ============================================
-- VERIFICATION (run separately after migration)
-- ============================================
-- SELECT COUNT(*) FROM leads;  -- should be 0
-- SELECT * FROM pg_policies WHERE tablename = 'leads';  -- should show 4 policies
-- SELECT proname FROM pg_proc WHERE proname = 'convert_lead';  -- should return 1 row
