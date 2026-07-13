-- ═══════════════════════════════════════════════════════════════════════════
-- Sprint PCT-1 — Project-centric Tasks (ось «проект» + кастомные колонки + internal)
--
-- Два ортогональных понятия, НЕ смешивать:
--   • стадия сделки  (stage_id → pipeline_stages)  — воронка продаж, гейты S27, S29
--   • колонка канбана задач (project_columns, НОВОЕ) — доска исполнения
--
-- Аддитивно. Не трогаем 019/027/029/030 и lane-логику личного борда — вся
-- совместимость через НОВЫЕ триггеры (resolve_task_board дериватит lane).
--
-- КОНТРАКТ: файл пишется и коммитится из Claude Code, НЕ применяется. Применяет
--           гейт Cowork (apply_migration → smoke → advisors).
--
-- ПОРЯДОК BEFORE-триггеров на tasks (по алфавиту): set_updated_at →
--   trg_aa_resolve_board → trg_set_org_id. Префикс trg_aa_ гарантирует, что
--   резолвер column_id/lane отрабатывает первым. Он не зависит от org_id
--   (ищет колонки по project_id), поэтому порядок с set_org_id безразличен.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1.1 projects: тип + нуллабельность стадийных полей + инварианты ──────────

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'client';

ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_type_chk;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_type_chk CHECK (type IN ('client','internal'));

-- Стадийные поля становятся nullable — internal-проект вне воронки продаж.
ALTER TABLE public.projects ALTER COLUMN stage_id    DROP NOT NULL;
ALTER TABLE public.projects ALTER COLUMN pipeline_id DROP NOT NULL;
ALTER TABLE public.projects ALTER COLUMN direction   DROP NOT NULL;

-- ⚠ ОТКЛОНЕНИЕ ОТ ПРОМПТА (осознанное): DEFAULT у legacy `stage` НЕ снимаем.
-- convert_lead() (018/025) вставляет клиентскую сделку, ОПУСКАЯ колонку `stage`,
-- и полагается на DEFAULT 'new_lead'. DROP DEFAULT занулил бы legacy-стадию всем
-- конвертируемым сделкам (регрессия для ProjectsTable/CommandPalette, читающих
-- `stage`). Цель «не писать 'new_lead' internal-проекту» достигается иначе:
-- ProjectModal для internal шлёт `stage: null` ЯВНО — явный NULL в INSERT
-- перекрывает DEFAULT, поэтому DEFAULT для internal никогда не срабатывает.
-- (DROP DEFAULT здесь был бы нужен только если бы internal-проекты создавал код,
--  опускающий `stage`; таких писателей нет — только ProjectModal.)

-- «Полу-internal» состояний не существует в принципе.
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_type_pipeline_chk;
ALTER TABLE public.projects ADD CONSTRAINT projects_type_pipeline_chk CHECK (
  (type = 'client'   AND pipeline_id IS NOT NULL AND stage_id IS NOT NULL AND direction IS NOT NULL)
  OR
  (type = 'internal' AND pipeline_id IS NULL AND stage_id IS NULL)
);

-- status: CHECK-констрейнта на живой БД НЕТ (проверено РАЗВЕДКОЙ) — заводим новый
-- с полным списком, добавляя 'completed' (терминал для internal, маппится в UI как
-- «Завершён»). Существующие значения (open/won/lost/on_hold) валидны.
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_status_chk;
ALTER TABLE public.projects ADD CONSTRAINT projects_status_chk CHECK (
  status IN ('open','won','lost','on_hold','completed')
);

-- ─── 1.1b Страховка legacy `stage` для internal (добавлено на гейт-ревью) ─────
-- DEFAULT 'new_lead' у `stage` сохранён ради convert_lead() (см. блок выше), поэтому
-- любой БУДУЩИЙ писатель internal-проекта, опустивший `stage`, молча получил бы
-- фантомную legacy-стадию у проекта вне воронки. Сегодня единственный писатель
-- internal — ProjectModal (шлёт stage: null явно), но контракт держим на уровне БД,
-- а не дисциплины кода: триггер тихо зануляет зеркало. INSERT OR UPDATE — на случай
-- любых будущих правок internal-проектов.

CREATE OR REPLACE FUNCTION public.null_internal_stage() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.type = 'internal' THEN
    NEW.stage := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ab_null_internal_stage ON public.projects;
CREATE TRIGGER trg_ab_null_internal_stage BEFORE INSERT OR UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.null_internal_stage();

-- ─── 1.2 project_columns + tasks.column_id ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_columns (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id)      ON DELETE CASCADE,
  name       text NOT NULL,
  category   text NOT NULL CHECK (category IN ('backlog','started','paused','done')),
  position   int  NOT NULL DEFAULT 0,
  wip_limit  int  CHECK (wip_limit IS NULL OR wip_limit > 0),  -- схема P1, UI — P2
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_columns_project ON public.project_columns(project_id, position);
CREATE INDEX IF NOT EXISTS idx_project_columns_org     ON public.project_columns(org_id);

-- org_id — тем же trg_set_org_id, что и на projects/tasks; updated_at — update_updated_at.
DROP TRIGGER IF EXISTS trg_set_org_id ON public.project_columns;
CREATE TRIGGER trg_set_org_id BEFORE INSERT ON public.project_columns
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id();

DROP TRIGGER IF EXISTS trg_set_updated_at ON public.project_columns;
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.project_columns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS column_id uuid REFERENCES public.project_columns(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_column ON public.tasks(column_id, sort_order);

-- ─── 1.3 Биективные маппинги category ↔ lane ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.category_to_lane(p text) RETURNS task_lane
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p
    WHEN 'backlog' THEN 'next'::task_lane
    WHEN 'started' THEN 'now'::task_lane
    WHEN 'paused'  THEN 'wait'::task_lane
    ELSE 'done'::task_lane
  END
$$;

CREATE OR REPLACE FUNCTION public.lane_to_category(p task_lane) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p
    WHEN 'next' THEN 'backlog'
    WHEN 'now'  THEN 'started'
    WHEN 'wait' THEN 'paused'
    ELSE 'done'
  END
$$;

-- ─── 1.4 Сид дефолтных колонок при создании проекта ──────────────────────────
-- AFTER INSERT — покрывает и ProjectModal, и convert_lead(), и любых будущих
-- писателей. SECURITY DEFINER: вставка колонок не должна зависеть от RLS
-- вызывающего (convert_lead под своим гардом, клиент под своим).

CREATE OR REPLACE FUNCTION public.seed_project_columns() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.project_columns (org_id, project_id, name, category, position) VALUES
    (NEW.org_id, NEW.id, 'Бэклог',   'backlog', 1),
    (NEW.org_id, NEW.id, 'В работе', 'started', 2),
    (NEW.org_id, NEW.id, 'Ожидание', 'paused',  3),
    (NEW.org_id, NEW.id, 'Готово',   'done',    4);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_zz_seed_columns ON public.projects;
CREATE TRIGGER trg_zz_seed_columns AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.seed_project_columns();

-- ─── 1.5 Резолвер lane ↔ column_id (сердце совместимости) ─────────────────────
-- Единый source of truth per task:
--   • задача с project_id  → истина column_id, lane деривативен;
--   • задача без project_id → истина lane, column_id IS NULL.
-- Благодаря резолверу S29 create_task, TaskQuickAdd и личный борд пишут lane
-- БЕЗ изменений кода.

CREATE OR REPLACE FUNCTION public.resolve_task_board() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_cat text;
BEGIN
  -- Задача вне проекта: колонки нет, истина — lane.
  IF NEW.project_id IS NULL THEN
    NEW.column_id := NULL;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.column_id IS NULL THEN
      -- писатели lane (S29 create_task, TaskQuickAdd, личный борд) → колонка по категории
      SELECT id INTO NEW.column_id FROM public.project_columns
      WHERE project_id = NEW.project_id AND category = public.lane_to_category(NEW.lane)
      ORDER BY position LIMIT 1;
    END IF;
  ELSE  -- UPDATE
    IF NEW.column_id IS DISTINCT FROM OLD.column_id AND NEW.column_id IS NOT NULL THEN
      -- Явный переезд по доске проекта: column_id сохраняем, lane выведем ниже.
      NULL;
    ELSIF NEW.project_id IS DISTINCT FROM OLD.project_id THEN
      -- Смена проекта → колонка новой project по категории текущего lane.
      SELECT id INTO NEW.column_id FROM public.project_columns
      WHERE project_id = NEW.project_id AND category = public.lane_to_category(NEW.lane)
      ORDER BY position LIMIT 1;
    ELSIF NEW.lane IS DISTINCT FROM OLD.lane THEN
      -- lane-переезд на ЛИЧНОМ борде. Ремап колонки только если текущая колонка
      -- больше не соответствует новому lane. Это отделяет «юзер сменил lane» от
      -- каскада sync_lane_on_category_change (там колонка УЖЕ соответствует lane —
      -- ремап привёл бы к прыжку в первую колонку той же категории).
      SELECT category INTO v_cat FROM public.project_columns WHERE id = NEW.column_id;
      IF v_cat IS NULL OR public.category_to_lane(v_cat) IS DISTINCT FROM NEW.lane THEN
        SELECT id INTO NEW.column_id FROM public.project_columns
        WHERE project_id = NEW.project_id AND category = public.lane_to_category(NEW.lane)
        ORDER BY position LIMIT 1;
      END IF;
    END IF;
  END IF;

  -- fallback: подходящей категории нет (кастомный набор без нужного аналога) → первая колонка
  IF NEW.column_id IS NULL THEN
    SELECT id INTO NEW.column_id FROM public.project_columns
    WHERE project_id = NEW.project_id ORDER BY position LIMIT 1;
  END IF;

  -- деривация lane из фактической колонки
  SELECT category INTO v_cat FROM public.project_columns WHERE id = NEW.column_id;
  IF v_cat IS NOT NULL THEN
    NEW.lane := public.category_to_lane(v_cat);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_aa_resolve_board ON public.tasks;
CREATE TRIGGER trg_aa_resolve_board BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.resolve_task_board();

-- Смена category у колонки → каскадный пересчёт lane задач в ней.
-- (UPDATE tasks дёрнет trg_aa_resolve_board, который увидит, что column_id уже
--  соответствует новому lane, и НЕ будет ремапить колонку — см. коммент выше.)
CREATE OR REPLACE FUNCTION public.sync_lane_on_category_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.category IS DISTINCT FROM OLD.category THEN
    UPDATE public.tasks
       SET lane = public.category_to_lane(NEW.category)
     WHERE column_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_lane_on_category ON public.project_columns;
CREATE TRIGGER trg_sync_lane_on_category AFTER UPDATE OF category ON public.project_columns
  FOR EACH ROW EXECUTE FUNCTION public.sync_lane_on_category_change();

-- ─── 1.6 RPC удаления колонки ────────────────────────────────────────────────
-- Клиентский bulk-update чужих задач упрётся в RLS tasks → удаление только через RPC.

CREATE OR REPLACE FUNCTION public.delete_project_column(
  p_column_id uuid,
  p_target_column_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_col public.project_columns; v_target public.project_columns;
BEGIN
  SELECT * INTO v_col FROM public.project_columns WHERE id = p_column_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'column not found'; END IF;

  -- права: owner/admin org-wide, иначе — только свой проект (owner_id/created_by).
  IF v_col.org_id <> public.current_org_id() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF public.current_org_role() NOT IN ('owner','admin') AND NOT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = v_col.project_id
      AND (p.owner_id = auth.uid() OR p.created_by = auth.uid())
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- инвариант борда: последнюю backlog/done колонку удалить нельзя.
  IF v_col.category IN ('backlog','done') AND NOT EXISTS (
    SELECT 1 FROM public.project_columns
    WHERE project_id = v_col.project_id AND category = v_col.category AND id <> v_col.id
  ) THEN
    RAISE EXCEPTION 'cannot delete last % column', v_col.category;
  END IF;

  -- непустая колонка требует приёмника того же проекта.
  IF EXISTS (SELECT 1 FROM public.tasks WHERE column_id = v_col.id) THEN
    SELECT * INTO v_target FROM public.project_columns
      WHERE id = p_target_column_id AND project_id = v_col.project_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'target column required'; END IF;
    -- UPDATE дёрнет trg_aa_resolve_board → lane пересчитается по категории приёмника.
    UPDATE public.tasks SET column_id = v_target.id WHERE column_id = v_col.id;
  END IF;

  DELETE FROM public.project_columns WHERE id = v_col.id;
END $$;

REVOKE ALL ON FUNCTION public.delete_project_column(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.delete_project_column(uuid, uuid) TO authenticated, service_role;

-- ─── 1.7 RLS project_columns (паттерн 027) ───────────────────────────────────
-- SELECT — org-wide: колонки это конфигурация борда (как pipelines), не бизнес-данные;
-- гарантирует отрисовку задач member'а в чужом проекте. Write — owner/admin org-wide;
-- прочие роли (manager) — только проекты, где они owner_id/created_by.

ALTER TABLE public.project_columns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_columns_select" ON public.project_columns;
CREATE POLICY "project_columns_select" ON public.project_columns
  FOR SELECT
  USING ( org_id = ( SELECT public.current_org_id() ) );

DROP POLICY IF EXISTS "project_columns_insert" ON public.project_columns;
CREATE POLICY "project_columns_insert" ON public.project_columns
  FOR INSERT
  WITH CHECK (
    org_id = ( SELECT public.current_org_id() )
    AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
      OR EXISTS ( SELECT 1 FROM public.projects p
                  WHERE p.id = project_id
                    AND (p.owner_id = auth.uid() OR p.created_by = auth.uid()) ) )
  );

DROP POLICY IF EXISTS "project_columns_update" ON public.project_columns;
CREATE POLICY "project_columns_update" ON public.project_columns
  FOR UPDATE
  USING (
    org_id = ( SELECT public.current_org_id() )
    AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
      OR EXISTS ( SELECT 1 FROM public.projects p
                  WHERE p.id = project_id
                    AND (p.owner_id = auth.uid() OR p.created_by = auth.uid()) ) )
  )
  WITH CHECK ( org_id = ( SELECT public.current_org_id() ) );

DROP POLICY IF EXISTS "project_columns_delete" ON public.project_columns;
CREATE POLICY "project_columns_delete" ON public.project_columns
  FOR DELETE
  USING (
    org_id = ( SELECT public.current_org_id() )
    AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
      OR EXISTS ( SELECT 1 FROM public.projects p
                  WHERE p.id = project_id
                    AND (p.owner_id = auth.uid() OR p.created_by = auth.uid()) ) )
  );

-- ─── 1.8 Бэкфилл ─────────────────────────────────────────────────────────────

-- Колонки всем существующим проектам (триггер для них не срабатывал).
INSERT INTO public.project_columns (org_id, project_id, name, category, position)
SELECT p.org_id, p.id, v.name, v.category, v.position
FROM public.projects p
CROSS JOIN (VALUES ('Бэклог','backlog',1),('В работе','started',2),
                   ('Ожидание','paused',3),('Готово','done',4)) AS v(name,category,position)
WHERE NOT EXISTS (SELECT 1 FROM public.project_columns c WHERE c.project_id = p.id);

-- Прямой UPDATE: маппим lane → колонка по биекции (минуя триггерную двусмысленность).
UPDATE public.tasks t SET column_id = c.id
FROM public.project_columns c
WHERE t.project_id IS NOT NULL AND t.column_id IS NULL
  AND c.project_id = t.project_id
  AND c.category = public.lane_to_category(t.lane);

-- Пересчёт sort_order внутри новых колонок.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY column_id ORDER BY sort_order, created_at) AS rn
  FROM public.tasks WHERE column_id IS NOT NULL
)
UPDATE public.tasks t SET sort_order = ranked.rn FROM ranked WHERE t.id = ranked.id;
