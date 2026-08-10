-- ═══════════════════════════════════════════════════════════════════════════
-- 119 — S-LEAD-CORE-1: конверсия переносит ИСТОРИЮ, а не только реквизиты.
--
-- ⚠️ Идёт СТРОГО после 117 (owner_id, pain, chz_groups, regulatory_deadline)
--    и 118 (calls.lead_id / tasks.lead_id).
--
-- Тело взято из ЖИВОЙ БД (`pg_get_functiondef`, разведка 2026-08-10), правки
-- точечные. Сигнатура не меняется ⇒ `create or replace` без `drop` (42P13 не
-- грозит: набор аргументов и тип возврата те же).
--
-- ЧТО МЕНЯЕТСЯ (три точки):
--
-- 1. ГАРД ВЛАДЕНИЯ приведён к RLS после 117. Был `user_id = auth.uid()` — с
--    переездом ownership на `owner_id` назначенный ответственный (AssigneeSelect)
--    не смог бы конвертировать собственный лид: `user_id` остался бы у автора.
--    Стало зеркало `leads_update`: org + (owner/admin ∨ owner_id = auth.uid())
--    плюс legacy-ветка `user_id = auth.uid()` — строки, где бэкфилл owner_id не
--    прошёл (автор без профиля), продолжают конвертироваться своим создателем.
--    Гард НЕ снимается и не ослабляется до «просто org» — чужой лид по-прежнему 42501.
--
-- 2. ВЛАДЕЛЕЦ создаваемых компании/контакта/сделки — `coalesce(owner_id, user_id)`
--    лида, а не `user_id`. Иначе сделка уезжала бы автору лида, а не тому, кто с
--    ним работал.
--
-- 3. ПЕРЕНОС ИСТОРИИ: звонки и задачи лида получают ссылки на созданные сущности;
--    квалификация (боль / ЧЗ-группы / дедлайн маркировки) уходит в `pinned_note`
--    сделки, если та пуста. `lead_id` при этом НЕ зануляется — связь с лидом
--    остаётся для аналитики «жизни до конверсии».
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.convert_lead(
  p_lead_id uuid,
  p_company_name text default null::text,
  p_contact_first_name text default null::text,
  p_contact_last_name text default null::text,
  p_contact_phone text default null::text,
  p_contact_email text default null::text,
  p_direction text default 'iiot'::text,
  p_deal_title text default null::text,
  p_deal_amount numeric default null::numeric,
  p_company_id uuid default null::uuid,
  p_contact_id uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_lead public.leads%rowtype;
  v_user_id uuid;
  v_company_id uuid;
  v_contact_id uuid;
  v_deal_id uuid;
  v_pipeline_id uuid;
  v_first_stage_id uuid;
  v_lead_title text;
  v_note text;
BEGIN
  -- S25 гард (119: зеркало leads_update после переезда ownership на owner_id).
  IF NOT EXISTS (
    SELECT 1 FROM public.leads
    WHERE id = p_lead_id
      AND org_id = public.current_org_id()
      AND (
        public.current_org_role() IN ('owner','admin')
        OR owner_id = auth.uid()
        OR user_id  = auth.uid()   -- legacy: строки без бэкфилла owner_id
      )
  ) THEN
    RAISE EXCEPTION 'lead not found or access denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_lead
  FROM leads WHERE id = p_lead_id AND status = 'qualified';

  IF v_lead.id IS NULL THEN
    RAISE EXCEPTION 'Lead not found or not in qualified status';
  END IF;

  -- 119: владелец создаваемых сущностей — ответственный за лид, автор лишь запасной.
  v_user_id := COALESCE(v_lead.owner_id, v_lead.user_id);
  v_lead_title := v_lead.title;

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

  -- ═══ 119: перенос истории лида на созданные сущности ═══
  -- `coalesce` — не перетираем то, что уже проставлено вручную.
  UPDATE public.calls c
     SET contact_id = COALESCE(c.contact_id, v_contact_id),
         company_id = COALESCE(c.company_id, v_company_id),
         project_id = COALESCE(c.project_id, v_deal_id)
   WHERE c.lead_id = p_lead_id;

  UPDATE public.tasks t
     SET project_id = COALESCE(t.project_id, v_deal_id),
         company_id = COALESCE(t.company_id, v_company_id),
         contact_id = COALESCE(t.contact_id, v_contact_id)
   WHERE t.lead_id = p_lead_id;

  -- ═══ 119: квалификация лида → закреплённая заметка сделки ═══
  -- Только если заметка пуста: ручной текст важнее сгенерированного.
  v_note := concat_ws(e'\n',
    nullif('Боль: ' || v_lead.pain, 'Боль: '),
    CASE WHEN v_lead.chz_groups IS NOT NULL AND array_length(v_lead.chz_groups, 1) > 0
         THEN 'ЧЗ-группы: ' || array_to_string(v_lead.chz_groups, ', ') END,
    CASE WHEN v_lead.regulatory_deadline IS NOT NULL
         THEN 'Дедлайн маркировки: ' || to_char(v_lead.regulatory_deadline, 'DD.MM.YYYY') END
  );

  IF v_note IS NOT NULL AND v_note <> '' THEN
    UPDATE public.projects p
       SET pinned_note = v_note
     WHERE p.id = v_deal_id
       AND (p.pinned_note IS NULL OR p.pinned_note = '');
  END IF;

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

-- ACL живой функции не менялся (`create or replace` его сохраняет):
-- authenticated исполняет её из UI, guard внутри отдаёт 42501 на чужой лид.
