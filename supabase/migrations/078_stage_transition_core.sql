-- ============================================================================
-- 078_stage_transition_core.sql — S-R2-TRANSITION-1a (R2-P0-A)
--
-- Две вещи, без которых модалка перехода стадии (1b) физически не работает:
--
--   F1. Гейт стадии читал PRE-UPDATE строку. `aa_enforce_stage_gate` — BEFORE
--       UPDATE, а `check_stage_requirements(project, stage)` селектил проект из
--       таблицы, то есть СТАРЫЕ значения. Следствие: `update({stage_id: B,
--       budget: 100})` одним запросом падал, если стадия B требует budget —
--       хотя патч его закрывает. Чиним: новая 3-арная `_row`-версия принимает
--       строку-кандидата (`to_jsonb(NEW)`), 2-арная остаётся тонким делегатом.
--
--   F2. История смен стадий не писалась с 047 (тогда сняли `log_stage_change`
--       вместе с legacy `projects.stage`). Проверено по живой БД 2026-07-26:
--       из 12 триггеров на `projects` историю не пишет НИ ОДИН, а
--       `stage_entered_at` хранит только текущее значение. Заводим
--       `stage_transitions` + AFTER-триггер.
--
-- ⚠️ БЭКФИЛЛ НЕВОЗМОЖЕН. Истории переходов нет ни в одном источнике: ни в
--    projects, ни в activity_log (клиентский `stage_changed` пишется только с
--    той сессии, где пользователь сидел в UI, и не покрывает cron/service).
--    Данные копятся С ДАТЫ APPLY этой миграции. Аналитика воронки P2
--    (конверсия стадий, median dwell) считается ТОЛЬКО по периоду после неё —
--    это надо помнить при первом же графике, иначе он соврёт про «до».
--
-- Идемпотентна: create or replace / if not exists / drop trigger if exists.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. check_stage_requirements_row — гейт, принимающий строку-кандидата
--
-- Почему НОВАЯ функция, а не третий параметр с DEFAULT у существующей:
--   • третий аргумент с DEFAULT сделал бы вызов с двумя аргументами
--     неоднозначным между 2-арной и 3-арной версиями → `function is not unique`;
--   • дропать 2-арную нельзя: у неё именные гранты (authenticated, service_role)
--     и её зовёт клиент через RPC (use-stage-gate.ts) для превью требований —
--     drop потребовал бы переGRANTа и ломал бы совместимость на время apply.
--
-- Тело — логика прежней функции; единственное изменение по существу в том,
-- откуда берутся значения полей. Источник сведён к ОДНОМУ jsonb (`v_src`),
-- поэтому field-проверки остались ОДНИМ `CASE`, а не двумя ветками: разъезд
-- двух списков поддерживаемых колонок — главный риск этой миграции, и здесь он
-- закрыт конструктивно. `to_jsonb(row)` даёт NULL на месте SQL NULL, поэтому
-- `v_src->>'col' IS NOT NULL` эквивалентно прежнему `v_project.col IS NOT NULL`.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.check_stage_requirements_row(
  p_project_id uuid,
  p_target_stage_id uuid,
  p_row jsonb
) returns jsonb
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
DECLARE
  v_project    public.projects%ROWTYPE;
  v_src        jsonb;
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

  -- p_row IS NULL → читаем из БД, как раньше (полная обратная совместимость:
  -- RPC-превью и любой сторонний вызов ведут себя ровно как до 078).
  -- p_row задан → проверяем строку-кандидата (to_jsonb(NEW) из BEFORE-триггера).
  v_src := coalesce(p_row, to_jsonb(v_project));

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
        WHEN 'budget'           THEN v_src->>'budget' IS NOT NULL
        WHEN 'company_id'       THEN v_src->>'company_id' IS NOT NULL
        WHEN 'contact_id'       THEN v_src->>'contact_id' IS NOT NULL
        WHEN 'next_step'        THEN v_src->>'next_step' IS NOT NULL AND btrim(v_src->>'next_step') <> ''
        WHEN 'deadline'         THEN v_src->>'deadline' IS NOT NULL
        WHEN 'probability'      THEN v_src->>'probability' IS NOT NULL
        WHEN 'direction'        THEN v_src->>'direction' IS NOT NULL
        WHEN 'next_action_date' THEN v_src->>'next_action_date' IS NOT NULL
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
      -- file-требования В ОБЕИХ ветках читаются из БД: файлы в том же UPDATE
      -- прийти не могут, это отдельная таблица — читать их из p_row нечего.
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

alter function public.check_stage_requirements_row(uuid, uuid, jsonb) owner to postgres;

-- Триггерная функция, не RPC-поверхность: клиенту звать её незачем (паттерн 056b).
-- Вызывающие — DEFINER-функции, владелец postgres, им грант не нужен.
revoke all on function public.check_stage_requirements_row(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.check_stage_requirements_row(uuid, uuid, jsonb)
  to service_role;

comment on function public.check_stage_requirements_row(uuid, uuid, jsonb) is
  'Требования стадии против строки-кандидата. p_row = to_jsonb(NEW) из BEFORE-триггера '
  '(гейт видит патч того же UPDATE); p_row IS NULL → читает строку из БД (поведение до 078).';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. check_stage_requirements/2 — тонкий делегат
--    Контракт (имя, типы аргументов, тип возврата, гранты) НЕ меняется:
--    RPC-превью из use-stage-gate.ts продолжает работать без правок клиента.
--    CREATE OR REPLACE сохраняет существующие гранты authenticated/service_role.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.check_stage_requirements(
  p_project_id uuid,
  p_target_stage_id uuid
) returns jsonb
  language sql
  security definer
  set search_path = public, pg_temp
as $$
  select public.check_stage_requirements_row($1, $2, null::jsonb)
$$;

alter function public.check_stage_requirements(uuid, uuid) owner to postgres;

comment on function public.check_stage_requirements(uuid, uuid) is
  'Превью незакрытых требований стадии по ТЕКУЩЕЙ строке проекта. С 078 — делегат '
  'check_stage_requirements_row(..., null). Поведение и гранты не изменились.';

-- ────────────────────────────────────────────────────────────────────────────
-- 3. aa_enforce_stage_gate — единственная правка: гейт смотрит на NEW
--    (BEFORE UPDATE, поэтому NEW уже содержит поля этого же патча).
--    SECURITY DEFINER + search_path обязаны быть переписаны явно: REPLACE
--    перезаписывает security-атрибуты функции целиком.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.aa_enforce_stage_gate()
returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
DECLARE
  v_unmet jsonb;
BEGIN
  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    -- 078 (F1): to_jsonb(NEW) — гейт проверяет поля, приходящие ЭТИМ ЖЕ UPDATE.
    v_unmet := public.check_stage_requirements_row(NEW.id, NEW.stage_id, to_jsonb(NEW));
    IF jsonb_array_length(v_unmet) > 0 THEN
      RAISE EXCEPTION 'stage_gate_failed'
        USING DETAIL = v_unmet::text, ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

alter function public.aa_enforce_stage_gate() owner to postgres;

revoke all on function public.aa_enforce_stage_gate() from public, anon, authenticated;
grant execute on function public.aa_enforce_stage_gate() to service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. stage_transitions — история переходов стадии
--
-- ⚠️ to_stage_id: NOT NULL + ON DELETE CASCADE (а НЕ SET NULL).
--    NOT NULL со SET NULL — противоречие: удаление стадии из словаря упало бы
--    на NOT NULL, то есть аудит-таблица заблокировала бы чистку
--    pipeline_stages. Тот же класс грабли, что в 077 с segments.owner_id.
--    Цена CASCADE — история переходов в удалённую стадию исчезает вместе с ней;
--    для аналитики воронки это корректно (стадии в отчёте всё равно нет).
--    from_stage_id nullable по существу (первый переход) → SET NULL безопасен.
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.stage_transitions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id)  on delete cascade,
  project_id    uuid not null references public.projects(id)       on delete cascade,
  from_stage_id uuid          references public.pipeline_stages(id) on delete set null,
  to_stage_id   uuid not null references public.pipeline_stages(id) on delete cascade,
  changed_by    uuid          references public.profiles(id)        on delete set null,
  changed_at    timestamptz not null default now()
);

comment on table public.stage_transitions is
  'Аудит смен стадии проекта/сделки. Пишется ТОЛЬКО триггером trg_zy_log_stage_transition '
  'под SECURITY DEFINER; INSERT/UPDATE/DELETE-политик нет. Данные с даты apply 078 — '
  'бэкфилл невозможен (истории до этого не существовало ни в одном источнике).';
comment on column public.stage_transitions.changed_by is
  'auth.uid() на момент перехода. NULL — штатно для cron/service-контекста (pg_cron, RPC под service_role).';

-- (project_id, changed_at desc) — таймлайн карточки; (org_id, ...) — аналитика периода;
-- (org_id, to_stage_id, ...) — конверсия/dwell по конкретной стадии.
create index if not exists idx_stage_tr_project_at on public.stage_transitions (project_id, changed_at desc);
create index if not exists idx_stage_tr_org_at     on public.stage_transitions (org_id, changed_at desc);
create index if not exists idx_stage_tr_to_stage   on public.stage_transitions (org_id, to_stage_id, changed_at desc);

alter table public.stage_transitions enable row level security;

drop policy if exists stage_tr_select on public.stage_transitions;
create policy stage_tr_select on public.stage_transitions
  for select
  using (org_id = ( select public.current_org_id() ));

-- Урок 075: дефолтные привилегии Supabase выдают authenticated ВСЁ на новой
-- таблице, а TRUNCATE вообще не проверяется RLS. Права режем адресно, не
-- полагаясь на отсутствие политик.
revoke all on public.stage_transitions from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.stage_transitions from authenticated;
grant select on public.stage_transitions to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. log_stage_transition — AFTER UPDATE OF stage_id
--
-- ⚠️ Триггер НЕ ИМЕЕТ ПРАВА уронить UPDATE: гейт блокирует переход осознанно,
--    аудит — никогда (образец — run_stage_automations из 050/I5). Отсюда
--    `exception when others then return new`.
--
-- Имя `trg_zy_...`: порядок срабатывания триггеров в Postgres — алфавитный по
-- имени. `trg_zy_*` < `trg_zz_run_automations`, значит история пишется ПОСЛЕ
-- BEFORE-гейта (trg_aa_*) и ДО автоматизаций — автоматизация, читающая историю,
-- увидит уже записанный переход.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.log_stage_transition()
returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
BEGIN
  INSERT INTO public.stage_transitions
    (org_id, project_id, from_stage_id, to_stage_id, changed_by)
  VALUES
    (NEW.org_id, NEW.id, OLD.stage_id, NEW.stage_id, auth.uid());
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Аудит не блокирует бизнес-операцию. Молча пропускаем запись.
  RETURN NEW;
END;
$$;

alter function public.log_stage_transition() owner to postgres;

revoke all on function public.log_stage_transition() from public, anon, authenticated;
grant execute on function public.log_stage_transition() to service_role;

drop trigger if exists trg_zy_log_stage_transition on public.projects;
create trigger trg_zy_log_stage_transition
  after update of stage_id on public.projects
  for each row
  when (new.stage_id is distinct from old.stage_id)
  execute function public.log_stage_transition();
