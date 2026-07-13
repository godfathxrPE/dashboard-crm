-- ═══════════════════════════════════════════════════════════════════════════
-- Sprint 29 — Автоматизация v1 (триггер → действие)
--
-- automation_rules  — org-scoped конфиг правил (UI owner/admin). v1: единственный
--                     trigger_type='stage_entered', единственный action_type='create_task'.
-- automation_runs   — журнал срабатываний + идемпотентность (один выстрел на
--                     пару сделка+стадия через UNIQUE(rule_id, project_id, stage_id)).
-- run_stage_automations() + trg_zz_run_automations — AFTER UPDATE ON projects.
--
-- КОНТРАКТ: файл пишется и коммитится из Claude Code, НЕ применяется. Применяет
--           гейт Cowork (apply_migration → smoke → advisors).
--
-- КОМПОЗИЦИЯ, НЕ ДУБЛИРОВАНИЕ: правило только СОЗДАЁТ задачу с assigned_to.
-- Уведомление шлёт уже существующий trg_notify_task_assigned (S26, INSERT-ветка);
-- самоназначение (assignee = актор перехода) отфильтровывается там же.
--
-- EXCEPTION-ПОЛИТИКА — ПРОТИВОПОЛОЖНОСТЬ ГЕЙТУ S27:
--   гейт (aa_enforce_stage_gate) БЛОКИРУЕТ переход и НЕ глотает исключения.
--   автоматизация НИКОГДА не блокирует переход → глотает всё:
--     · внешний EXCEPTION WHEN OTHERS THEN RETURN NEW — падение исполнителя не
--       рушит UPDATE стадии;
--     · вложенный BEGIN/EXCEPTION на каждое правило — падение одного правила
--       (битый конфиг) не гасит остальные.
--
-- ПОРЯДОК AFTER UPDATE-триггеров на projects (по алфавиту имени):
--   on_stage_change → trg_notify_project_assigned → trg_zz_run_automations
-- Префикс `zz_` гарантирует, что автоматизация стреляет ПОСЛЕДНЕЙ — после всех
-- BEFORE-синков (stage_entered_at/status уже проставлены) и после лога стадии,
-- т.е. по финальным значениям NEW.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1.1 Таблицы ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.automation_rules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name           text NOT NULL,
  trigger_type   text NOT NULL CHECK (trigger_type IN ('stage_entered')),
  trigger_config jsonb NOT NULL,  -- {"pipeline_id": uuid, "stage_id": uuid}
  action_type    text NOT NULL CHECK (action_type IN ('create_task')),
  action_config  jsonb NOT NULL,  -- {"task_text":"Подготовить КП по {deal}",
                                  --  "assignee":"deal_owner"|"deal_creator",
                                  --  "lane":"now","priority":"important","due_in_days":3}
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automation_rules_org
  ON public.automation_rules(org_id) WHERE is_active;

-- Журнал срабатываний + идемпотентность. UNIQUE(rule_id, project_id, stage_id)
-- = «одно правило стреляет по конкретной сделке в конкретной стадии ровно раз»
-- (защита от спама при пинг-понге стадий — осознанное ограничение v1).
CREATE TABLE IF NOT EXISTS public.automation_runs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id    uuid NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  org_id     uuid NOT NULL REFERENCES public.organizations(id)    ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id)         ON DELETE CASCADE,
  stage_id   uuid NOT NULL,
  task_id    uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  fired_at   timestamptz DEFAULT now(),
  UNIQUE (rule_id, project_id, stage_id)
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_rule ON public.automation_runs(rule_id);

ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_runs  ENABLE ROW LEVEL SECURITY;

-- ─── RLS: automation_rules — паттерн stage_requirements ──────────────────────
-- SELECT — все члены org; write — owner/admin. org_id задаётся ЯВНО из UI
-- (trg_set_org_id на таблицу НЕ вешается — паттерн invitations/stage_requirements).
DROP POLICY IF EXISTS "automation_rules_select" ON public.automation_rules;
CREATE POLICY "automation_rules_select" ON public.automation_rules
  FOR SELECT
  USING ( org_id = ( SELECT public.current_org_id() ) );

DROP POLICY IF EXISTS "automation_rules_insert" ON public.automation_rules;
CREATE POLICY "automation_rules_insert" ON public.automation_rules
  FOR INSERT
  WITH CHECK (
    org_id = ( SELECT public.current_org_id() )
    AND ( SELECT public.current_org_role() ) IN ('owner','admin')
  );

DROP POLICY IF EXISTS "automation_rules_update" ON public.automation_rules;
CREATE POLICY "automation_rules_update" ON public.automation_rules
  FOR UPDATE
  USING (
    org_id = ( SELECT public.current_org_id() )
    AND ( SELECT public.current_org_role() ) IN ('owner','admin')
  )
  WITH CHECK (
    org_id = ( SELECT public.current_org_id() )
    AND ( SELECT public.current_org_role() ) IN ('owner','admin')
  );

DROP POLICY IF EXISTS "automation_rules_delete" ON public.automation_rules;
CREATE POLICY "automation_rules_delete" ON public.automation_rules
  FOR DELETE
  USING (
    org_id = ( SELECT public.current_org_id() )
    AND ( SELECT public.current_org_role() ) IN ('owner','admin')
  );

-- ─── RLS: automation_runs — SELECT члены org, write-политик НЕТ ───────────────
-- Пишет только SECURITY DEFINER-триггер (bypass RLS) — паттерн notifications.
DROP POLICY IF EXISTS "automation_runs_select" ON public.automation_runs;
CREATE POLICY "automation_runs_select" ON public.automation_runs
  FOR SELECT
  USING ( org_id = ( SELECT public.current_org_id() ) );

-- ─── 1.2 Функция-исполнитель ─────────────────────────────────────────────────
--
-- НИКАКОГО динамического SQL: text шаблона — простой replace('{deal}', NEW.name);
-- lane/priority — жёсткий whitelist в CASE (барьер против инъекции enum-значений
-- через action_config), дефолты 'now'/'normal'. assignee — CASE, дефолт deal_owner.
-- org_id проставляется ЯВНО (= NEW.org_id) во все вставки.
CREATE OR REPLACE FUNCTION public.run_stage_automations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

REVOKE ALL ON FUNCTION public.run_stage_automations() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.run_stage_automations() TO service_role;

DROP TRIGGER IF EXISTS trg_zz_run_automations ON public.projects;
CREATE TRIGGER trg_zz_run_automations
  AFTER UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.run_stage_automations();

-- ─── 1.3 Seed: 3 пресета (идемпотентно, матч стадий по name / is_won) ────────
--
-- Дефолтная org, стадии deal-воронок. Guard NOT EXISTS по (org, stage, name):
-- повторный запуск миграции не плодит дубли. Ориентир — Олег правит в UI.
DO $seed$
DECLARE
  v_org uuid;
BEGIN
  SELECT id INTO v_org FROM public.organizations ORDER BY created_at LIMIT 1;
  IF v_org IS NULL THEN
    RETURN;
  END IF;

  -- 1. Вход в «Подготовка КП» → «Подготовить КП по {deal}», владелец, important, +3.
  INSERT INTO public.automation_rules
    (org_id, name, trigger_type, trigger_config, action_type, action_config)
  SELECT v_org, 'КП: задача при входе в «Подготовка КП»', 'stage_entered',
         jsonb_build_object('pipeline_id', ps.pipeline_id, 'stage_id', ps.id),
         'create_task',
         jsonb_build_object('task_text','Подготовить КП по {deal}','assignee','deal_owner',
                            'lane','now','priority','important','due_in_days',3)
  FROM public.pipeline_stages ps
  JOIN public.pipelines p ON p.id = ps.pipeline_id
  WHERE p.entity_type = 'deal' AND ps.name = 'Подготовка КП'
    AND NOT EXISTS (
      SELECT 1 FROM public.automation_rules ar
      WHERE ar.org_id = v_org
        AND ar.trigger_type = 'stage_entered'
        AND (ar.trigger_config->>'stage_id')::uuid = ps.id
        AND ar.action_config->>'task_text' = 'Подготовить КП по {deal}'
    );

  -- 2. Вход в «Договор» → «Подготовить договор по {deal}», владелец, important, +5.
  INSERT INTO public.automation_rules
    (org_id, name, trigger_type, trigger_config, action_type, action_config)
  SELECT v_org, 'Договор: задача при входе в «Договор»', 'stage_entered',
         jsonb_build_object('pipeline_id', ps.pipeline_id, 'stage_id', ps.id),
         'create_task',
         jsonb_build_object('task_text','Подготовить договор по {deal}','assignee','deal_owner',
                            'lane','now','priority','important','due_in_days',5)
  FROM public.pipeline_stages ps
  JOIN public.pipelines p ON p.id = ps.pipeline_id
  WHERE p.entity_type = 'deal' AND ps.name = 'Договор'
    AND NOT EXISTS (
      SELECT 1 FROM public.automation_rules ar
      WHERE ar.org_id = v_org
        AND ar.trigger_type = 'stage_entered'
        AND (ar.trigger_config->>'stage_id')::uuid = ps.id
        AND ar.action_config->>'task_text' = 'Подготовить договор по {deal}'
    );

  -- 3. Вход в выигрышную стадию (is_won) → «Запросить отзыв/кейс у {deal}»,
  --    владелец, normal, +14. Матч по is_won, НЕ по имени.
  INSERT INTO public.automation_rules
    (org_id, name, trigger_type, trigger_config, action_type, action_config)
  SELECT v_org, 'Победа: запросить отзыв/кейс', 'stage_entered',
         jsonb_build_object('pipeline_id', ps.pipeline_id, 'stage_id', ps.id),
         'create_task',
         jsonb_build_object('task_text','Запросить отзыв/кейс у {deal}','assignee','deal_owner',
                            'lane','next','priority','normal','due_in_days',14)
  FROM public.pipeline_stages ps
  JOIN public.pipelines p ON p.id = ps.pipeline_id
  WHERE p.entity_type = 'deal' AND ps.is_won = true
    AND NOT EXISTS (
      SELECT 1 FROM public.automation_rules ar
      WHERE ar.org_id = v_org
        AND ar.trigger_type = 'stage_entered'
        AND (ar.trigger_config->>'stage_id')::uuid = ps.id
        AND ar.action_config->>'task_text' = 'Запросить отзыв/кейс у {deal}'
    );
END;
$seed$;
