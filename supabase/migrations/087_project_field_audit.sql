-- 087: аудит критичных полей сделки в БД, с «было → стало» (S-R2-FIELD-AUDIT, эпик G1).
--
-- До этой миграции аудита изменений сделки не было — была его имитация: клиент
-- (use-projects.ts) писал в activity_log ИМЕНА КОЛОНОК из патча, без значений, без
-- проверки, что значение реально изменилось, и только для правок через UI. Любой
-- UPDATE мимо интерфейса (SQL, set_field из 079, будущие интеграции) не писал ничего.
--
-- Модель — Salesforce Field History Tracking: whitelist критичных полей + значения
-- from/to. HubSpot пишет каждое property и потом фильтрует шум в UI; здесь ленту
-- читают четыре компонента, поэтому шум не заводим — поля вне whitelist не аудируются.
--
-- Схема НЕ меняется: ни новых таблиц, ни новых колонок ⇒ регенерация типов не нужна.
-- Формат payload — НАДМНОЖЕСТВО текущего: `fields_changed` остаётся, добавляется
-- `changes`. Старые 658 записей рендерятся прежней веткой describeEvent, бэкфилла нет
-- (восстанавливать from/to не из чего).
--
-- RLS activity_log не трогаем. Следствие принято сознательно: менеджер не увидит в
-- ленте чужие изменения и записи от cron (user_id is null) — это текущая семантика
-- таблицы, а не регресс; закроется предикатом can_see_all_deals() в задаче про роль РОП.

-- ────────────────────────────────────────────────────────────────────────────
-- 1. log_project_field_audit — AFTER UPDATE на projects
--
-- Три класса полей:
--   значения — {from, to} текстом;
--   ссылки   — {from, to, from_name, to_name} (сырой UUID в ленте нечитаем);
--   факт     — {changed: true} (длинные тексты и заметки в лог не тащим).
--
-- ⚠️ Смена стадии — ОДНО событие, не пять. BEFORE-триггеры trg_sync_deal_stage_fields
--    и trg_sync_project_stage при смене stage_id сами перезаписывают probability,
--    status, actual_close_date и stage_entered_at (тела функций читаны в живой БД).
--    Наивный diff по whitelist выдал бы на переходе «Лид → Эксперимент» четыре записи
--    вместо одной, поэтому производные поля из payload перехода вычитаются.
--    Ровно та же логика, что была на клиенте (STAGE_DERIVED_FIELDS), но она видит OLD
--    и потому пишет реально изменившиеся поля, а не ключи патча — и её нельзя обойти.
--
-- ⚠️ user_id может быть NULL — при вызове из cron (run_dwell_automations, 079)
--    auth.uid() пуст; так же ведёт себя 051_task_overdue.sql:107-112. Подставлять
--    owner_id ЗАПРЕЩЕНО: подпись «изменил владелец» там, где изменил планировщик, —
--    ложь в аудите.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.log_project_field_audit()
returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
DECLARE
  -- Whitelist. Поля вне трёх массивов не аудируются вовсе. Не аудируются намеренно:
  -- progress_done/progress_total (пересчитывает триггер задач — каждая закрытая
  -- подзадача давала бы «прогресс 4 → 5», это уже видно как task_completed),
  -- stage_entered_at/updated_at/do_synced_at (служебные метки), org_id (заморожен
  -- trg_aa_freeze_org_id), type/parent_deal_id (задаются при создании и спавне),
  -- created_by/created_at/id (неизменяемые по смыслу).
  c_value_fields constant text[] := array[
    'name', 'budget', 'probability', 'deadline', 'actual_close_date',
    'next_action_date', 'status', 'direction', 'delivery_kind'
  ];
  c_ref_fields constant text[] := array[
    'owner_id', 'stage_id', 'company_id', 'contact_id', 'pipeline_id'
  ];
  c_flag_fields constant text[] := array[
    'next_step', 'pinned_note', 'won_reason', 'won_detail',
    'loss_reason', 'loss_detail', 'lost_reason', 'do_url'
  ];
  -- Производные от смены стадии — см. предупреждение выше.
  c_stage_derived constant text[] := array[
    'probability', 'status', 'actual_close_date', 'stage_entered_at'
  ];

  -- OLD/NEW читаем в теле, не в DECLARE: инициализаторы объявлений вычисляются до
  -- входа в блок, и зависеть от порядка тут незачем.
  v_old         jsonb;
  v_new         jsonb;
  v_stage_moved boolean;
  v_changes     jsonb := '{}'::jsonb;
  v_fields      text[] := '{}';
  v_field       text;
  v_from_id     uuid;
  v_to_id       uuid;
  v_from_name   text;
  v_to_name     text;
  v_event       text;
  v_payload     jsonb;
BEGIN
  v_old := to_jsonb(OLD);
  v_new := to_jsonb(NEW);
  v_stage_moved := NEW.stage_id IS DISTINCT FROM OLD.stage_id;

  -- 1. Значения. Сравнение через IS DISTINCT FROM по jsonb — NULL-safe в обе стороны
  --    (в jsonb NULL-колонка приходит как json null, а не SQL NULL).
  FOREACH v_field IN ARRAY c_value_fields LOOP
    CONTINUE WHEN v_stage_moved AND v_field = ANY (c_stage_derived);
    CONTINUE WHEN (v_old -> v_field) IS NOT DISTINCT FROM (v_new -> v_field);
    v_fields := v_fields || v_field;
    v_changes := v_changes || jsonb_build_object(
      v_field,
      jsonb_build_object('from', v_old ->> v_field, 'to', v_new ->> v_field)
    );
  END LOOP;

  -- 2. Ссылки с резолвом имени. stage_id при переходе уходит отдельным блоком (п. 4),
  --    в changes его дублировать не надо.
  FOREACH v_field IN ARRAY c_ref_fields LOOP
    CONTINUE WHEN v_stage_moved AND v_field = 'stage_id';
    CONTINUE WHEN (v_old -> v_field) IS NOT DISTINCT FROM (v_new -> v_field);
    v_from_id := (v_old ->> v_field)::uuid;
    v_to_id := (v_new ->> v_field)::uuid;
    v_from_name := null;
    v_to_name := null;
    -- Удалённый профиль/компания дают NULL — «—» в ленте, падать нельзя.
    CASE v_field
      WHEN 'owner_id' THEN
        SELECT p.full_name INTO v_from_name FROM public.profiles p WHERE p.id = v_from_id;
        SELECT p.full_name INTO v_to_name   FROM public.profiles p WHERE p.id = v_to_id;
      WHEN 'stage_id' THEN
        SELECT s.name INTO v_from_name FROM public.pipeline_stages s WHERE s.id = v_from_id;
        SELECT s.name INTO v_to_name   FROM public.pipeline_stages s WHERE s.id = v_to_id;
      WHEN 'company_id' THEN
        SELECT c.name INTO v_from_name FROM public.companies c WHERE c.id = v_from_id;
        SELECT c.name INTO v_to_name   FROM public.companies c WHERE c.id = v_to_id;
      WHEN 'contact_id' THEN
        SELECT nullif(btrim(concat_ws(' ', ct.first_name, ct.last_name)), '')
          INTO v_from_name FROM public.contacts ct WHERE ct.id = v_from_id;
        SELECT nullif(btrim(concat_ws(' ', ct.first_name, ct.last_name)), '')
          INTO v_to_name   FROM public.contacts ct WHERE ct.id = v_to_id;
      WHEN 'pipeline_id' THEN
        SELECT pl.name INTO v_from_name FROM public.pipelines pl WHERE pl.id = v_from_id;
        SELECT pl.name INTO v_to_name   FROM public.pipelines pl WHERE pl.id = v_to_id;
      ELSE
        NULL;
    END CASE;
    v_fields := v_fields || v_field;
    v_changes := v_changes || jsonb_build_object(
      v_field,
      jsonb_build_object(
        'from', v_old ->> v_field, 'to', v_new ->> v_field,
        'from_name', v_from_name, 'to_name', v_to_name
      )
    );
  END LOOP;

  -- 3. Факт изменения без значения.
  FOREACH v_field IN ARRAY c_flag_fields LOOP
    CONTINUE WHEN (v_old -> v_field) IS NOT DISTINCT FROM (v_new -> v_field);
    v_fields := v_fields || v_field;
    v_changes := v_changes || jsonb_build_object(v_field, jsonb_build_object('changed', true));
  END LOOP;

  -- 4. Тип события. Формат payload у stage_changed — тот же, что писал клиент
  --    (from_stage_id/to_stage_id/from_name/to_name), плюс прочие изменённые поля.
  IF v_stage_moved THEN
    v_from_name := null;
    v_to_name := null;
    SELECT s.name INTO v_from_name FROM public.pipeline_stages s WHERE s.id = OLD.stage_id;
    SELECT s.name INTO v_to_name   FROM public.pipeline_stages s WHERE s.id = NEW.stage_id;
    v_event := 'stage_changed';
    v_payload := jsonb_build_object(
      'from_stage_id', OLD.stage_id,
      'to_stage_id', NEW.stage_id,
      'from_name', v_from_name,
      'to_name', v_to_name
    );
    IF coalesce(array_length(v_fields, 1), 0) > 0 THEN
      v_payload := v_payload || jsonb_build_object(
        'fields_changed', to_jsonb(v_fields),
        'changes', v_changes
      );
    END IF;
  ELSIF coalesce(array_length(v_fields, 1), 0) > 0 THEN
    v_event := 'project_updated';
    v_payload := jsonb_build_object(
      'fields_changed', to_jsonb(v_fields),
      'changes', v_changes
    );
  ELSE
    -- Патч с теми же значениями (budget 12M → 12M) записи не даёт. Отличие от
    -- клиентского поведения, где запись появлялась на любой UPDATE.
    RETURN NEW;
  END IF;

  INSERT INTO public.activity_log (project_id, user_id, org_id, event_type, payload)
  VALUES (NEW.id, auth.uid(), NEW.org_id, v_event, v_payload);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Аудит НЕ блокирует бизнес-операцию — тот же контракт, что у log_stage_transition
  -- (078:262) и run_stage_automations (050). Запись теряется молча, UPDATE проходит.
  RETURN NEW;
END;
$$;

alter function public.log_project_field_audit() owner to postgres;

revoke all on function public.log_project_field_audit() from public, anon, authenticated;
grant execute on function public.log_project_field_audit() to service_role;

-- Имя `trg_zy_...` — порядок срабатывания в PG алфавитный (конвенция из 078:265-272):
-- trg_aa_* (гейты) → нотификации → trg_zy_* (аудит) → trg_zz_run_automations.
-- Алфавитно встаёт перед trg_zy_log_stage_transition — обе только пишут, порядок
-- между ними безразличен.
--
-- Без `of <колонка>`: аудит должен видеть любое поле whitelist, а не одну колонку.
drop trigger if exists trg_zy_log_field_audit on public.projects;
create trigger trg_zy_log_field_audit
  after update on public.projects
  for each row
  execute function public.log_project_field_audit();

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Индекс под ленту дашборда
--
-- useRecentActivity (use-activity-log.ts:37-55) читает
-- `select … neq(event_type, …) order by created_at desc limit N` без project_id.
-- Существующие индексы — (org_id) и (project_id, created_at desc); сортировку по org
-- ни один не покрывает. Индекса по event_type НЕ заводим: три хука фильтруют его
-- через neq, такой предикат неселективен и индекс не использует.
-- ────────────────────────────────────────────────────────────────────────────
create index if not exists idx_activity_log_org_created
  on public.activity_log (org_id, created_at desc);
