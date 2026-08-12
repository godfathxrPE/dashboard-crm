-- ═══════════════════════════════════════════════════════════════════════════
-- 123 — S-LEAD-CARRY-1: конверсия перестаёт терять квалификацию.
--
-- 119 научила `convert_lead` переносить ИСТОРИЮ (звонки, задачи) и класть боль /
-- ЧЗ-группы / дедлайн в `pinned_note` сделки. Три поля квалификации при этом
-- по-прежнему испарялись или оседали только текстом. Три переноса:
--
--   1. `decision_role`  → строка в `deal_stakeholders` (карта сделки начинается
--      с контакта, с которым вели лид, а не с пустого места)
--   2. `budget_status`  → строка в `pinned_note` сделки
--   3. `chz_groups`     → `companies.chz_groups` (маркировочный профиль КОМПАНИИ,
--      а не разовой сделки: через год на второй сделке его выясняли заново)
--
-- Тело функции взято из ЖИВОЙ БД (`pg_get_functiondef`, разведка 2026-08-11),
-- правки точечные. Сигнатура не меняется ⇒ `create or replace` без `drop`
-- (42P13 не грозит: набор аргументов и тип возврата те же).
--
-- ⚠️ `regulatory_deadline` в компанию НЕ переезжает. Дедлайн — свойство товарной
--    группы (справочник `src/lib/data/chz-groups.ts`, поле `since`), а не компании.
--    Перенеся его в `companies`, мы завели бы вторую копию даты, которая молча
--    разойдётся со справочником. У компании живут группы, дата выводится из них.
--
-- ⚠️ Гранты не трогаются: `CREATE OR REPLACE` сохраняет ACL существующей функции,
--    а повторные revoke/grant только шумели бы в диффе.
--
-- НЕ ПРИМЕНЯТЬ из Claude Code. apply — гейт Cowork через Supabase MCP.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ 1. Подтверждённый маркировочный профиль компании ═══
--
-- Отличие от `matchChzGroups(okved)`: та функция ВЫВОДИТ гипотезу из кода реестра,
-- эта колонка хранит ПОДТВЕРЖДЁННОЕ человеком — что клиент реально маркирует.
-- Компания с ОКВЭД 46.x (оптовая торговля) может возить обувь и молоко; ОКВЭД об
-- этом не знает, продавец знает. Две сущности, не дубль: derived остаётся видимой
-- как предположение, declared побеждает при рендере (`src/lib/domain/chz-profile.ts`).
alter table public.companies
  add column if not exists chz_groups text[];

comment on column public.companies.chz_groups is
  'Подтверждённые товарные группы «Честного Знака» (названия из lib/data/chz-groups.ts). '
  'NULL = не выяснено; ''{}'' = выяснено, что групп нет. Гипотеза по ОКВЭД считается '
  'кодом (matchChzGroups) и этой колонкой не заменяется.';

-- ═══ 2. CHECK на leads.decision_role — зеркало deal_stakeholders_role_chk ═══
--
-- Поле с самого начала было словарным (LeadModal рендерит <select> по
-- STAKEHOLDER_ROLE_ORDER), но БД его не проверяла. Пока значение никуда не уезжало,
-- цена была нулевой; теперь оно едет в `deal_stakeholders` с закрытым CHECK — чужое
-- значение уронило бы КОНВЕРСИЮ ошибкой 23514 в момент, когда её меньше всего ждут.
-- Домен закрывается на входе, а не разбирается на выходе.
--
-- Список значений — дословная копия `deal_stakeholders_role_chk` (092), снятая
-- разведкой 2026-08-11. Расходиться им нельзя: расхождение проявится только при
-- конверсии и только на редком значении.
--
-- На 2026-08-11 строк с `decision_role is not null` — НОЛЬ (проверено запросом),
-- поэтому валидация мгновенна и `NOT VALID` не нужен.
alter table public.leads
  drop constraint if exists leads_decision_role_check;

alter table public.leads
  add constraint leads_decision_role_check check (
    decision_role is null or decision_role = any (array[
      'decision_maker','economic_buyer','champion','expert','end_user','blocker'
    ])
  );

-- ═══ 3. convert_lead v3 ═══
create or replace function public.convert_lead(
  p_lead_id uuid,
  p_company_name text default null,
  p_contact_first_name text default null,
  p_contact_last_name text default null,
  p_contact_phone text default null,
  p_contact_email text default null,
  p_direction text default 'iiot',
  p_deal_title text default null,
  p_deal_amount numeric default null,
  p_company_id uuid default null,
  p_contact_id uuid default null
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
  v_budget_label text;   -- 123
BEGIN
  -- S25 гард (119: зеркало leads_update после переезда ownership на owner_id).
  IF NOT EXISTS (
    SELECT 1 FROM public.leads
    WHERE id = p_lead_id
      AND org_id = public.current_org_id()
      AND (
        public.current_org_role() IN ('owner','admin')
        OR owner_id = auth.uid()
        OR user_id  = auth.uid()
      )
  ) THEN
    RAISE EXCEPTION 'lead not found or access denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_lead
  FROM leads WHERE id = p_lead_id AND status = 'qualified';

  IF v_lead.id IS NULL THEN
    RAISE EXCEPTION 'Lead not found or not in qualified status';
  END IF;

  v_user_id := COALESCE(v_lead.owner_id, v_lead.user_id);
  v_lead_title := v_lead.title;

  -- 1. Компания
  --
  -- Гейт S-LEAD-CARRY-1: org-предикат добавлен вместе с 123-A. До 123 эти два
  -- поиска проверяли только владение, и цена была ограничена кривой ссылкой в
  -- projects.company_id; с 123-A по найденной компании идёт ЗАПИСЬ профиля.
  -- `v_lead.org_id`, не `current_org_id()`: в service-контексте helper = NULL и
  -- предикат стал бы немым (урок 024).
  IF p_company_id IS NOT NULL THEN
    SELECT id INTO v_company_id FROM companies
      WHERE id = p_company_id
        AND org_id = v_lead.org_id
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

  -- ═══ 123-A: маркировочный профиль лида → компания ═══
  -- Стоит СРАЗУ после блока 1 (v_company_id уже определён) и до создания сделки:
  -- профиль компании не должен зависеть от того, чем кончится вставка сделки.
  --
  -- `AND c.chz_groups IS NULL` — заполняем только пустое. Компания, у которой
  -- профиль уже подтверждён, конверсией НЕ перезаписывается: автослияние массивов
  -- молча смешало бы профили двух разных лидов. Расхождение вместо этого остаётся
  -- видимым человеку — `pinned_note` сделки всегда несёт строку «ЧЗ-группы: …»
  -- с тем, что сказал ЭТОТ лид.
  --
  -- Пустой массив у лида сюда не едет: '{}' — это «выяснили, что групп нет» у ЛИДА,
  -- а не подтверждение профиля по КОМПАНИИ.
  IF v_lead.chz_groups IS NOT NULL AND array_length(v_lead.chz_groups, 1) > 0 THEN
    UPDATE public.companies c
       SET chz_groups = v_lead.chz_groups
     WHERE c.id = v_company_id
       AND c.chz_groups IS NULL;
  END IF;

  -- 2. Контакт
  IF p_contact_id IS NOT NULL THEN
    SELECT id INTO v_contact_id FROM contacts
      WHERE id = p_contact_id
        AND org_id = v_lead.org_id
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

  -- ═══ 123-B: контакт лида → карта стейкхолдеров сделки ═══
  -- Строка создаётся ВСЕГДА, даже когда роль не выяснена: контакт, с которым вели
  -- лид, — уже участник решения, а `role IS NULL` карта рендерит честной подписью
  -- «роль не указана» (STAKEHOLDER_ROLE_EMPTY_LABEL). Пустая карта у только что
  -- созданной сделки — потеря знания, а не чистота.
  --
  -- `org_id` ЯВНО из строки лида, не из `current_org_id()`: функция SECURITY DEFINER
  -- и обязана работать в service-контексте, где `auth.uid()` = NULL и helper вернёт
  -- NULL (учебный инцидент 024). Триггер `trg_set_org_id` явное значение переживает —
  -- `set_org_id()` пишет только при NULL (проверено разведкой).
  --
  -- ON CONFLICT — по `deal_stakeholders_uniq(project_id, contact_id)`. У свежей
  -- сделки конфликта быть не может; строка стоит ради идемпотентности повторного
  -- вызова.
  INSERT INTO public.deal_stakeholders (org_id, project_id, contact_id, role)
  VALUES (v_lead.org_id, v_deal_id, v_contact_id, v_lead.decision_role)
  ON CONFLICT (project_id, contact_id) DO NOTHING;

  -- 119: перенос истории лида на созданные сущности
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

  -- 119 + ═══ 123-C ═══: квалификация лида → закреплённая заметка сделки
  --
  -- Ярлыки бюджета — зеркало `LEAD_BUDGET_STATUS_CONFIG`
  -- (`src/lib/validators/lead.ts`). Дубль осознанный и того же класса, что
  -- зеркало chz-groups клиент↔edge: SQL не читает модули TS. Меняешь ярлык в
  -- конфиге — меняй здесь.
  --
  -- `unknown` не пишется намеренно: «бюджет не выяснен» — это отсутствие знания,
  -- а строка о нём в закреплённой заметке создаёт вид, что вопрос закрыт.
  v_budget_label := CASE v_lead.budget_status
    WHEN 'none'      THEN 'Нет бюджета'
    WHEN 'estimated' THEN 'Оценён'
    WHEN 'confirmed' THEN 'Подтверждён'
    ELSE NULL
  END;

  v_note := concat_ws(e'\n',
    nullif('Боль: ' || v_lead.pain, 'Боль: '),
    CASE WHEN v_budget_label IS NOT NULL
         THEN 'Бюджет: ' || v_budget_label END,
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
