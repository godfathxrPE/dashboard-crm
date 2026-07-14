# Claude Code Prompt — Sprint: delivery P2a — фазовая доска + шаблоны + spawn v2

Контекст: dashboard-crm, ветка `feat/aura-theme`, после P1 (коммиты 4c1f2ad → 8706399 → 005bf20,
миграция 035 применена на прод). Архитектура: `_analysis/architecture-delivery-p2.md` (§10–13)
поверх `_analysis/architecture-delivery-projects.md` (v2+§8+§9).

> ⚠️ **Миграцию НЕ применять** — только файл в `supabase/migrations/`. Применяет гейт
> (Cowork/Олег: смоуки + advisors). После применения гейтом будет regen типов.

## Что делаем (P2a) / что НЕ делаем

Делаем:
1. Миграция `036`: `category='phase'` в project_columns; seed-guard для delivery; патч
   `resolve_task_board()`; таблицы `delivery_templates` / `delivery_template_phases` /
   `delivery_template_tasks` + RLS; хелпер `copy_delivery_template`; `spawn_delivery_project` v2
   (резолюция шаблона); сиды шаблонов; бэкфилл единственного delivery-проекта.
2. UI: фазовая доска в ProjectDetail delivery-проекта (колонки = фазы, статус задачи = badge,
   «Просрочена» — computed), смена статуса на карточке, empty state.

НЕ делаем (P2b): project_members, прогресс X/Y (`progress_done/total` остаются 0), кнопка
«Создать фазы из шаблона», WIP-limit UI, синк с 1С:ДО.

## СВЕРЕННЫЕ ФАКТЫ (живая БД 2026-07-11 — использовать как есть, не перепроверять)

- `project_columns_category_check`: `category IN ('backlog','started','paused','done')`.
- `category_to_lane(text)`: CASE с **`ELSE 'done'`** → для `'phase'` вернула бы `'done'`.
  Поэтому резолвер обязан ветвиться на `'phase'` ДО вызова (см. миграцию, блок 3).
- `resolve_task_board()`: BEFORE INSERT/UPDATE on tasks; на UPDATE смена `lane` ремапит
  `column_id` через `lane_to_category`; в конце всегда деривит `lane` из category колонки.
  Порядок BEFORE-триггеров tasks: `set_updated_at` → `trg_aa_resolve_board` → `trg_set_org_id`.
- `seed_project_columns()`: сидит 4 дефолтные колонки ЛЮБОМУ проекту (guard'а на delivery нет).
- `spawn_delivery_project(p_deal_id uuid, p_kind text)` — 2 аргумента, SECURITY DEFINER,
  REVOKE PUBLIC/anon + GRANT authenticated. Гарды: whitelist kind → `22023`; NULL-safe org →
  `42501`; client+won → `P0001`; ownership (owner/created_by ∨ membership owner/admin) → `42501`;
  нет default project-пайплайна направления → `P0001`.
- `tasks.lane` DEFAULT `'now'` → в копировании шаблона ставить `lane='next'` ЯВНО.
- Организация **одна**; delivery-проектов **1** (4 дефолтные колонки, 0 задач) — бэкфилл тривиален.
- Project-пайплайны стоят (035): ERP 8 стадий / IIoT 7, `phase_group` initiated/planning/execution/completed,
  все `is_won=false/is_lost=false`.
- `delete_project_column`: guard «последняя backlog/done» — для phase-колонок вакуумно истинен
  (их можно удалять при пустоте/с приёмником) — ок, поведение приемлемо.
- Учтены уроки: REVOKE явно FROM anon после GRANT authenticated; NULL-safe сравнения в
  SECURITY DEFINER; `database.ts` рукописный — полный regen перезапишет кастомные хелперы,
  дополняем вручную.
- **UI (сверено по коду, ревью Grok подтверждено):** доска PCT-1 = `src/components/tasks/ProjectBoard.tsx`,
  рендерится из `ProjectDetail.tsx` (`{tab === 'board' && <ProjectBoard projectId={projectId} />}`, ~:840).
  `CATEGORY_LABEL`/`CATEGORY_OPTIONS` — 4 значения (`ProjectBoard.tsx:37–47`); rename колонки включает
  select category (`:101–109`); есть UI «+ Колонка» (`:307–343`) и удаление колонки. `TaskQuickAdd`
  **уже принимает** optional prop `lane` (`TaskQuickAdd.tsx:9`), но `ProjectBoard.tsx:149` его не передаёт.
  DnD (`handleDragEnd`) шлёт только `column_id`+`sort_order` — для phase-режима уже корректен, не трогать.
- Переменные живого тела spawn (035): `v_deal`, `v_privileged`, `v_pipeline_id`, `v_first_stage`,
  `v_new_id`. Org родителя — `v_deal.org_id`.
- `sync_lane_on_category_change()`: при смене category колонки каскадит `lane = category_to_lane(NEW.category)`
  на все её задачи → для `'phase'` это `'done'` (ELSE-ветка). Патчится в A3b.

## РАЗВЕДКА (перед кодом)

```bash
# Какой компонент рендерит PCT-1 доску задач проекта (internal) — его расширяем режимом phase:
grep -rn "project_columns\|projectColumns\|column_id" src/components --include="*.tsx" | head -20
grep -rn "use-project-columns\|useProjectColumns" src/lib src/components --include="*.ts" --include="*.tsx"
# ProjectDetail: где табы и где рендерится доска для delivery/internal:
grep -nE "Tabs|таб|доска|Board" src/components/projects/ProjectDetail.tsx | head -20
# Где UI читает category колонок (стили/маппинги) — phase не должен упасть в default-ветку 'done':
grep -rn "category" src/components src/lib/hooks --include="*.ts" --include="*.tsx" | grep -iv "categor.*css" | head -20
# categoryToLane / laneToCategory аналоги на клиенте:
grep -rnE "laneToCategory|categoryToLane|lane_to_category" src --include="*.ts" --include="*.tsx"
# Как задачи создаются в контексте проекта (TaskModal/QuickAdd передают column_id?):
grep -rn "column_id" src/components/modals src/components/tasks --include="*.tsx" | head
# Статус-badge задач: есть ли готовый компонент (переиспользовать для Не начата/В работе/Готово):
grep -rn "lane" src/components/tasks --include="*.tsx" | head -20
```

---

## ЧАСТЬ A — Миграция `supabase/migrations/036_delivery_phase_board_templates.sql` (ТОЛЬКО файл)

### A1. category='phase'

```sql
ALTER TABLE public.project_columns DROP CONSTRAINT project_columns_category_check;
ALTER TABLE public.project_columns ADD CONSTRAINT project_columns_category_check
  CHECK (category IN ('backlog','started','paused','done','phase'));
```

### A2. seed_project_columns — guard для delivery

Пересоздать функцию ЦЕЛИКОМ (тело из живой БД + первая строка-guard):

```sql
CREATE OR REPLACE FUNCTION public.seed_project_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF NEW.type = 'delivery' THEN RETURN NEW; END IF;  -- P2a: фазы delivery создаёт copy_delivery_template
  INSERT INTO public.project_columns (org_id, project_id, name, category, position) VALUES
    (NEW.org_id, NEW.id, 'Бэклог',   'backlog', 1),
    (NEW.org_id, NEW.id, 'В работе', 'started', 2),
    (NEW.org_id, NEW.id, 'Ожидание', 'paused',  3),
    (NEW.org_id, NEW.id, 'Готово',   'done',    4);
  RETURN NEW;
END $$;
```

### A3. resolve_task_board — патч под phase-колонки

Пересоздать ЦЕЛИКОМ. Тело = текущее из живой БД с ДВУМЯ правками (помечены `-- P2a`).
Семантика: в phase-колонках `lane` — истина (статус задачи), колонка — фаза; смена lane
НЕ двигает колонку; деривация lane из category для phase отключена.

```sql
CREATE OR REPLACE FUNCTION public.resolve_task_board()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
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
```

(ACL функции не трогаем — REVOKE из RPC сделан в 034 и сохраняется при CREATE OR REPLACE.)

### A3b. sync_lane_on_category_change — guard для phase (правка ревью Grok W1)

Смена category существующей колонки каскадит lane всех её задач; для `'phase'` каскад дал бы
`lane='done'` всем задачам фазы. UI в phase-режиме смену category прячет (B2), но контракт
держим на уровне БД:

```sql
CREATE OR REPLACE FUNCTION public.sync_lane_on_category_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
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
```

### A4. Таблицы шаблонов + RLS

```sql
CREATE TABLE IF NOT EXISTS public.delivery_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  direction public.direction_t NOT NULL,
  kind text NOT NULL CHECK (kind IN ('launch','experiment')),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, direction, kind)
);

CREATE TABLE IF NOT EXISTS public.delivery_template_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.delivery_templates(id) ON DELETE CASCADE,
  name text NOT NULL,
  position int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.delivery_template_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.delivery_templates(id) ON DELETE CASCADE,
  phase_id uuid NOT NULL REFERENCES public.delivery_template_phases(id) ON DELETE CASCADE,
  wbs_code text,
  title text NOT NULL,
  default_enabled boolean NOT NULL DEFAULT true,
  is_milestone boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_delivery_templates_org ON public.delivery_templates(org_id, direction, kind);
CREATE INDEX IF NOT EXISTS idx_dt_phases_template ON public.delivery_template_phases(template_id, position);
CREATE INDEX IF NOT EXISTS idx_dt_tasks_template ON public.delivery_template_tasks(template_id, phase_id, sort_order);

-- updated_at + org_id триггеры (имена/функции сверены по живой БД: project_columns
-- использует trg_set_updated_at → update_updated_at())
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.delivery_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_set_org_id BEFORE INSERT ON public.delivery_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id();
CREATE TRIGGER trg_set_org_id BEFORE INSERT ON public.delivery_template_phases
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id();
CREATE TRIGGER trg_set_org_id BEFORE INSERT ON public.delivery_template_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id();

-- RLS: read org-wide, write owner/admin (шаблон = конфигурация org, как pipelines)
ALTER TABLE public.delivery_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_template_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_template_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY dt_select ON public.delivery_templates FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY dt_write ON public.delivery_templates FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.current_org_role() IN ('owner','admin'))
  WITH CHECK (org_id = public.current_org_id() AND public.current_org_role() IN ('owner','admin'));

CREATE POLICY dtp_select ON public.delivery_template_phases FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY dtp_write ON public.delivery_template_phases FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.current_org_role() IN ('owner','admin'))
  WITH CHECK (org_id = public.current_org_id() AND public.current_org_role() IN ('owner','admin'));

CREATE POLICY dtt_select ON public.delivery_template_tasks FOR SELECT TO authenticated
  USING (org_id = public.current_org_id());
CREATE POLICY dtt_write ON public.delivery_template_tasks FOR ALL TO authenticated
  USING (org_id = public.current_org_id() AND public.current_org_role() IN ('owner','admin'))
  WITH CHECK (org_id = public.current_org_id() AND public.current_org_role() IN ('owner','admin'));
```


### A5. copy_delivery_template — internal-хелпер

```sql
CREATE OR REPLACE FUNCTION public.copy_delivery_template(p_project_id uuid, p_template_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_project public.projects;
  v_phase record;
  v_col_id uuid;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND OR v_project.type <> 'delivery' THEN
    RAISE EXCEPTION 'delivery project not found';
  END IF;
  -- hardening (ревью Grok W2): шаблон обязан принадлежать org проекта
  IF NOT EXISTS (SELECT 1 FROM public.delivery_templates
                 WHERE id = p_template_id AND org_id = v_project.org_id) THEN
    RAISE EXCEPTION 'template org mismatch';
  END IF;
  -- guard повторного копирования (защита будущей кнопки «Создать из шаблона», P2b):
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
                              company_id, contact_id, created_by)
    SELECT v_project.org_id, p_project_id, v_col_id, 'next'::task_lane,
           COALESCE(tt.wbs_code || '. ', '') || tt.title, tt.sort_order,
           v_project.company_id, v_project.contact_id,
           COALESCE(auth.uid(), v_project.created_by)
    FROM public.delivery_template_tasks tt
    WHERE tt.phase_id = v_phase.id AND tt.default_enabled
    ORDER BY tt.sort_order;
  END LOOP;
END $$;

-- internal-only: не для клиентского RPC
REVOKE ALL ON FUNCTION public.copy_delivery_template(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.copy_delivery_template(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.copy_delivery_template(uuid, uuid) FROM authenticated;
```

Примечания:
- `org_id`/`created_by` — явные (хелпер работает и из миграции, где `auth.uid()` NULL).
- INSERT в tasks дёргает `resolve_task_board`: `column_id` явный → сохраняется,
  категория `'phase'` → `lane='next'` не перезаписывается (проверка A3).
- `company_id/contact_id` наследуем от проекта — задачи сразу привязаны к клиенту.

### A6. spawn_delivery_project v2

**DROP старой сигнатуры обязателен** (иначе PostgREST получит неоднозначный overload при
вызове с 2 именованными аргументами):

Полное тело v2 — живое тело 035 (сверено с БД 2026-07-11) + блок шаблона. Правки помечены `-- P2a`:

```sql
DROP FUNCTION IF EXISTS public.spawn_delivery_project(uuid, text);

CREATE FUNCTION public.spawn_delivery_project(p_deal_id uuid, p_kind text, p_template_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $$
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

  -- P2a: фазы + задачи из шаблона; шаблона нет → проект без колонок (graceful,
  -- UI покажет empty state) — НЕ ошибка, иначе заблокировали бы ERP-эксперименты
  IF v_template_id IS NOT NULL THEN
    PERFORM public.copy_delivery_template(v_new_id, v_template_id);
  END IF;

  RETURN v_new_id;
END $$;
```

ACL как в 035:

```sql
REVOKE ALL ON FUNCTION public.spawn_delivery_project(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.spawn_delivery_project(uuid, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.spawn_delivery_project(uuid, text, uuid) TO authenticated;
```

### A7. Сиды шаблонов (org одна — сидим в неё)

```sql
DO $$
DECLARE
  v_org uuid;
  v_tpl uuid;
  v_ph uuid;
BEGIN
  SELECT id INTO v_org FROM public.organizations LIMIT 1;

  -- ============ IIoT: Запуск (полный) — СДР из 1С:ДО (§7 delivery-process-DO.md) ============
  INSERT INTO public.delivery_templates (org_id, direction, kind, name)
  VALUES (v_org, 'iiot', 'launch', 'IIoT: полный запуск (СДР 1С:ДО)')
  RETURNING id INTO v_tpl;

  INSERT INTO public.delivery_template_phases (org_id, template_id, name, position)
  VALUES (v_org, v_tpl, 'Подготовка к запуску', 1) RETURNING id INTO v_ph;
  INSERT INTO public.delivery_template_tasks (org_id, template_id, phase_id, wbs_code, title, sort_order) VALUES
    (v_org, v_tpl, v_ph, '1.1', 'Подготовительный этап', 1),
    (v_org, v_tpl, v_ph, '1.2', 'Установка расширения БИТ.MDT (ЭП с МЧД для ЧЗ, серверная подпись, ввод в оборот)', 2),
    (v_org, v_tpl, v_ph, '1.3', 'Подготовка оборудования (сценарии тестирования, аттестация, отгрузка)', 3),
    (v_org, v_tpl, v_ph, '1.4', '1 неделя до запуска', 4),
    (v_org, v_tpl, v_ph, '1.5', '2 дня до запуска', 5);

  INSERT INTO public.delivery_template_phases (org_id, template_id, name, position)
  VALUES (v_org, v_tpl, 'Запуск', 2) RETURNING id INTO v_ph;
  INSERT INTO public.delivery_template_tasks (org_id, template_id, phase_id, wbs_code, title, sort_order) VALUES
    (v_org, v_tpl, v_ph, '2.1', 'Запуск', 1),
    (v_org, v_tpl, v_ph, '2.2', 'Подписать протоколы тестирования/обучения', 2),
    (v_org, v_tpl, v_ph, '2.3', 'Список камер', 3),
    (v_org, v_tpl, v_ph, '2.4', 'Post Mortem', 4),
    (v_org, v_tpl, v_ph, '2.5', 'Завершение запуска', 5);

  INSERT INTO public.delivery_template_phases (org_id, template_id, name, position)
  VALUES (v_org, v_tpl, 'Регулярные мероприятия', 3) RETURNING id INTO v_ph;
  INSERT INTO public.delivery_template_tasks (org_id, template_id, phase_id, wbs_code, title, sort_order) VALUES
    (v_org, v_tpl, v_ph, '3.1', 'Еженедельная конференция', 1),
    (v_org, v_tpl, v_ph, '3.2', 'Консультация и решение задач Заказчика', 2);

  INSERT INTO public.delivery_template_phases (org_id, template_id, name, position)
  VALUES (v_org, v_tpl, 'Передача на поддержку', 4) RETURNING id INTO v_ph;
  INSERT INTO public.delivery_template_tasks (org_id, template_id, phase_id, wbs_code, title, is_milestone, sort_order) VALUES
    (v_org, v_tpl, v_ph, '4.1', 'Список открытых вопросов', false, 1),
    (v_org, v_tpl, v_ph, '4.2', 'Подтверждение администратора', true, 2),
    (v_org, v_tpl, v_ph, '4.3', 'Подтверждение службы поддержки', true, 3),
    (v_org, v_tpl, v_ph, '4.4', 'Встреча', false, 4),
    (v_org, v_tpl, v_ph, '4.5', 'Чек-лист передачи на поддержку', true, 5);

  -- ============ IIoT: Эксперимент (пилот) — тот же СДР (правка ревью Grok B1: полный сид) ============
  -- ⚠️ Какие задачи «НЕ ТРЕБУЕТСЯ ЭКСПЕРИМЕНТ» — уточнит Олег по отчёту 1С:ДО;
  -- пока default_enabled=true везде (отключается UPDATE'ом на гейте, не блокер).
  INSERT INTO public.delivery_templates (org_id, direction, kind, name)
  VALUES (v_org, 'iiot', 'experiment', 'IIoT: эксперимент (пилот, СДР 1С:ДО)')
  RETURNING id INTO v_tpl;

  INSERT INTO public.delivery_template_phases (org_id, template_id, name, position)
  VALUES (v_org, v_tpl, 'Подготовка к запуску', 1) RETURNING id INTO v_ph;
  INSERT INTO public.delivery_template_tasks (org_id, template_id, phase_id, wbs_code, title, sort_order) VALUES
    (v_org, v_tpl, v_ph, '1.1', 'Подготовительный этап', 1),
    (v_org, v_tpl, v_ph, '1.2', 'Установка расширения БИТ.MDT (ЭП с МЧД для ЧЗ, серверная подпись, ввод в оборот)', 2),
    (v_org, v_tpl, v_ph, '1.3', 'Подготовка оборудования (сценарии тестирования, аттестация, отгрузка)', 3),
    (v_org, v_tpl, v_ph, '1.4', '1 неделя до запуска', 4),
    (v_org, v_tpl, v_ph, '1.5', '2 дня до запуска', 5);

  INSERT INTO public.delivery_template_phases (org_id, template_id, name, position)
  VALUES (v_org, v_tpl, 'Запуск', 2) RETURNING id INTO v_ph;
  INSERT INTO public.delivery_template_tasks (org_id, template_id, phase_id, wbs_code, title, sort_order) VALUES
    (v_org, v_tpl, v_ph, '2.1', 'Запуск', 1),
    (v_org, v_tpl, v_ph, '2.2', 'Подписать протоколы тестирования/обучения', 2),
    (v_org, v_tpl, v_ph, '2.3', 'Список камер', 3),
    (v_org, v_tpl, v_ph, '2.4', 'Post Mortem', 4),
    (v_org, v_tpl, v_ph, '2.5', 'Завершение запуска', 5);

  INSERT INTO public.delivery_template_phases (org_id, template_id, name, position)
  VALUES (v_org, v_tpl, 'Регулярные мероприятия', 3) RETURNING id INTO v_ph;
  INSERT INTO public.delivery_template_tasks (org_id, template_id, phase_id, wbs_code, title, sort_order) VALUES
    (v_org, v_tpl, v_ph, '3.1', 'Еженедельная конференция', 1),
    (v_org, v_tpl, v_ph, '3.2', 'Консультация и решение задач Заказчика', 2);

  INSERT INTO public.delivery_template_phases (org_id, template_id, name, position)
  VALUES (v_org, v_tpl, 'Передача на поддержку', 4) RETURNING id INTO v_ph;
  INSERT INTO public.delivery_template_tasks (org_id, template_id, phase_id, wbs_code, title, is_milestone, sort_order) VALUES
    (v_org, v_tpl, v_ph, '4.1', 'Список открытых вопросов', false, 1),
    (v_org, v_tpl, v_ph, '4.2', 'Подтверждение администратора', true, 2),
    (v_org, v_tpl, v_ph, '4.3', 'Подтверждение службы поддержки', true, 3),
    (v_org, v_tpl, v_ph, '4.4', 'Встреча', false, 4),
    (v_org, v_tpl, v_ph, '4.5', 'Чек-лист передачи на поддержку', true, 5);

  -- ============ ERP: внедрение — 6 этапов, pptx «Технология реализации проекта 1С v2.2»
  -- (слайды 9–20: задачи этапов + ключевые действия менеджера; извлечено 2026-07-11) ============
  INSERT INTO public.delivery_templates (org_id, direction, kind, name)
  VALUES (v_org, 'erp', 'launch', 'ERP: внедрение (Технология 1С v2.2, 6 этапов)')
  RETURNING id INTO v_tpl;

  INSERT INTO public.delivery_template_phases (org_id, template_id, name, position)
  VALUES (v_org, v_tpl, 'Обследование', 1) RETURNING id INTO v_ph;
  INSERT INTO public.delivery_template_tasks (org_id, template_id, phase_id, wbs_code, title, is_milestone, sort_order) VALUES
    (v_org, v_tpl, v_ph, '1.1', 'Согласовать договор и ДС на этап, получить аванс 50%', false, 1),
    (v_org, v_tpl, v_ph, '1.2', 'Установочная встреча команд (оргстарт)', false, 2),
    (v_org, v_tpl, v_ph, '1.3', 'Утверждение целей проекта, актуализация функциональных рамок', false, 3),
    (v_org, v_tpl, v_ph, '1.4', 'Анализ бизнес-процессов AS IS', false, 4),
    (v_org, v_tpl, v_ph, '1.5', 'Сбор требований к автоматизации', false, 5),
    (v_org, v_tpl, v_ph, '1.6', 'Формирование целевой ИТ-архитектуры и концепции НСИ', false, 6),
    (v_org, v_tpl, v_ph, '1.7', 'Формирование дорожной карты проекта', false, 7),
    (v_org, v_tpl, v_ph, '1.8', 'Отчёт об обследовании: разработка и согласование', true, 8);

  INSERT INTO public.delivery_template_phases (org_id, template_id, name, position)
  VALUES (v_org, v_tpl, 'Моделирование', 2) RETURNING id INTO v_ph;
  INSERT INTO public.delivery_template_tasks (org_id, template_id, phase_id, wbs_code, title, is_milestone, sort_order) VALUES
    (v_org, v_tpl, v_ph, '2.1', 'Согласовать ДС на этап', false, 1),
    (v_org, v_tpl, v_ph, '2.2', 'Разработка контрольных примеров (бизнес-кейсов)', false, 2),
    (v_org, v_tpl, v_ph, '2.3', 'Подготовка и настройка ИБ для моделирования', false, 3),
    (v_org, v_tpl, v_ph, '2.4', 'Ввод и настройка моделей процессов', false, 4),
    (v_org, v_tpl, v_ph, '2.5', 'Демонстрации модели по функциональным блокам', false, 5),
    (v_org, v_tpl, v_ph, '2.6', 'Фиксация функциональных разрывов (реестр ФР)', false, 6),
    (v_org, v_tpl, v_ph, '2.7', 'Сводный отчёт о моделировании', true, 7);

  INSERT INTO public.delivery_template_phases (org_id, template_id, name, position)
  VALUES (v_org, v_tpl, 'Проектирование', 3) RETURNING id INTO v_ph;
  INSERT INTO public.delivery_template_tasks (org_id, template_id, phase_id, wbs_code, title, is_milestone, sort_order) VALUES
    (v_org, v_tpl, v_ph, '3.1', 'Описание способа реализации функциональных разрывов', false, 1),
    (v_org, v_tpl, v_ph, '3.2', 'Описание интеграций и переноса данных', false, 2),
    (v_org, v_tpl, v_ph, '3.3', 'Описание функциональности языком метаданных', false, 3),
    (v_org, v_tpl, v_ph, '3.4', 'Макеты интерфейсов (при необходимости)', false, 4),
    (v_org, v_tpl, v_ph, '3.5', 'Контрольные примеры и сценарии тестирования', false, 5),
    (v_org, v_tpl, v_ph, '3.6', 'ТЗ: согласование и приёмо-сдача этапа', true, 6);

  INSERT INTO public.delivery_template_phases (org_id, template_id, name, position)
  VALUES (v_org, v_tpl, 'Разработка', 4) RETURNING id INTO v_ph;
  INSERT INTO public.delivery_template_tasks (org_id, template_id, phase_id, wbs_code, title, is_milestone, sort_order) VALUES
    (v_org, v_tpl, v_ph, '4.1', 'Разработка кода по частным ТЗ', false, 1),
    (v_org, v_tpl, v_ph, '4.2', 'Подготовка тестовых данных и сценариев тестирования', false, 2),
    (v_org, v_tpl, v_ph, '4.3', 'Тестирование разработок', false, 3),
    (v_org, v_tpl, v_ph, '4.4', 'Интеграция данных в предпродуктивную базу', false, 4),
    (v_org, v_tpl, v_ph, '4.5', 'Тестирование и выверка перенесённых данных', false, 5),
    (v_org, v_tpl, v_ph, '4.6', 'Запуск временных интеграций', false, 6),
    (v_org, v_tpl, v_ph, '4.7', 'Приёмо-сдаточные испытания, фиксация scope-изменений через ДС', true, 7);

  INSERT INTO public.delivery_template_phases (org_id, template_id, name, position)
  VALUES (v_org, v_tpl, 'Внедрение', 5) RETURNING id INTO v_ph;
  INSERT INTO public.delivery_template_tasks (org_id, template_id, phase_id, wbs_code, title, is_milestone, sort_order) VALUES
    (v_org, v_tpl, v_ph, '5.1', 'Обновление продуктивной базы, перенос из предпродуктива', false, 1),
    (v_org, v_tpl, v_ph, '5.2', 'Перенос данных и первоначальные настройки для ОПЭ', false, 2),
    (v_org, v_tpl, v_ph, '5.3', 'Итоговое тестирование системы', false, 3),
    (v_org, v_tpl, v_ph, '5.4', 'Обучение сотрудников Заказчика', false, 4),
    (v_org, v_tpl, v_ph, '5.5', 'Наполнение системы НСИ и историческими данными', false, 5),
    (v_org, v_tpl, v_ph, '5.6', 'Подготовка пользовательских инструкций', false, 6),
    (v_org, v_tpl, v_ph, '5.7', 'Приёмка, подписание актов, запуск в ОПЭ', true, 7);

  INSERT INTO public.delivery_template_phases (org_id, template_id, name, position)
  VALUES (v_org, v_tpl, 'Эксплуатация', 6) RETURNING id INTO v_ph;
  INSERT INTO public.delivery_template_tasks (org_id, template_id, phase_id, wbs_code, title, is_milestone, sort_order) VALUES
    (v_org, v_tpl, v_ph, '6.1', 'Поддержка и мониторинг на период ОПЭ', false, 1),
    (v_org, v_tpl, v_ph, '6.2', 'Консультации пользователей', false, 2),
    (v_org, v_tpl, v_ph, '6.3', 'Доработка системы под новые требования', false, 3),
    (v_org, v_tpl, v_ph, '6.4', 'Перевод клиента на договор поддержки', true, 4),
    (v_org, v_tpl, v_ph, '6.5', 'Предложение расширения на смежные контуры (допродажа)', false, 5);
END $$;
```

### A8. Бэкфилл существующего delivery-проекта (факт: 1 шт., 4 дефолтных колонки, 0 задач)

```sql
DO $$
DECLARE
  v_proj public.projects;
  v_tpl uuid;
BEGIN
  FOR v_proj IN SELECT * FROM public.projects WHERE type = 'delivery' LOOP
    -- у прогонного проекта задач нет — удаляем дефолтные колонки безопасно
    IF NOT EXISTS (SELECT 1 FROM public.tasks WHERE project_id = v_proj.id) THEN
      DELETE FROM public.project_columns WHERE project_id = v_proj.id AND category <> 'phase';
      SELECT id INTO v_tpl FROM public.delivery_templates
      WHERE org_id = v_proj.org_id AND direction = v_proj.direction
        AND kind = v_proj.delivery_kind AND is_active
      LIMIT 1;
      IF v_tpl IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.project_columns WHERE project_id = v_proj.id) THEN
        PERFORM public.copy_delivery_template(v_proj.id, v_tpl);
      END IF;
    END IF;
  END LOOP;
END $$;
```

После применения гейтом: `generate_typescript_types` → дополнить `src/types/database.ts`
ВРУЧНУЮ (файл рукописный, полный regen запрещён) **и обновить `docs/schema.md`**.

---

## ЧАСТЬ B — Frontend

### B1. Типы / валидаторы

- `src/types/database.ts` — вручную добавить: Row/Insert/Update для `delivery_templates`,
  `delivery_template_phases`, `delivery_template_tasks`; в типе project_columns.category —
  union `'backlog'|'started'|'paused'|'done'|'phase'`. `any` запрещён.
- `src/lib/constants/delivery-phases.ts` — добавить константы статусов задач фазовой доски:

```ts
export const DELIVERY_TASK_STATUS_LABELS: Record<string, string> = {
  next: 'Не начата',
  now: 'В работе',
  wait: 'Ожидание',
  done: 'Готово',
};
export const DELIVERY_TASK_STATUS_ORDER = ['next', 'now', 'done'] as const; // цикл смены статуса
```

### B2. Фазовый режим `ProjectBoard.tsx` (конкретизировано по ревью Grok B2)

Файл: `src/components/tasks/ProjectBoard.tsx`. Режим:
`const isPhaseBoard = columns.length > 0 && columns.every(c => c.category === 'phase')`
(деривация от данных, а не от project.type — компонент не знает проект; тип прокидывать не надо).

- **B2.1** `CATEGORY_LABEL`: добавить `phase: 'Фаза'` (тип `ColumnCategory` расширяется в B1).
  В `CATEGORY_OPTIONS` **не включать** — phase не выбирается вручную.
- **B2.2** В phase-режиме СКРЫТЬ управление колонками: кнопку «+ Колонка» (`:307–343`),
  карандаш rename (внутри rename — select category, менять category фазы нельзя) и Trash
  удаления колонки (`:124–129`). Фазы — структура из шаблона; их CRUD — P2b.
  Подпись категории под именем колонки (`:122`) в phase-режиме не показывать (там «Фаза» у всех — шум).
- **B2.3** Карточка задачи в phase-режиме: badge статуса из `lane`
  (`DELIVERY_TASK_STATUS_LABELS`, цвета `var(--…)`), клик — цикл `next → now → done`
  (mutate только `{ lane }`, `column_id` НЕ слать); computed badge «Просрочена»
  (`deadline < now && lane !== 'done'`) — красный, приоритетнее статусного.
  Реализация: prop `phaseMode` на `TaskCard` ИЛИ отдельный `PhaseTaskCard` — на выбор CC,
  но текущий чекбокс done/now в phase-режиме заменить на цикл-badge.
- **B2.4** DnD: `handleDragEnd` уже шлёт только `column_id`+`sort_order` — НЕ трогать.
- **B2.5** `TaskQuickAdd`: prop `lane` уже существует (`TaskQuickAdd.tsx:9`) —
  в phase-режиме передавать `lane="next"` из `BoardColumn` (`ProjectBoard.tsx:149`),
  иначе DEFAULT БД `'now'` родит задачу «В работе» (патч A3 lane не перезаписывает — это истина).
  То же для `TaskModal` (`defaultProjectId` уже прокинут): при создании из phase-доски — `lane: 'next'`.
- **B2.6** `ProjectDetail.tsx`: для `type='delivery'` лейбл таба `board` — «План» (у internal
  остаётся «Доска задач»). Empty state доски (0 колонок): «Фазы не созданы — для этого
  направления нет шаблона» (без CTA — кнопка «Создать из шаблона» в P2b).
- Optimistic updates — по существующему паттерну хуков (`useMoveTask`/`useUpdateTask` уже так работают).

### B3. Регресс-точки

- Личный борд `/tasks`: delivery-задачи с lane-истиной корректно лягут в свои lanes; смена
  lane на личном борде для задачи в phase-колонке НЕ должна дёргать column_id (резолвер A3
  это гарантирует на уровне БД — UI ничего не делает).
- Internal-доски и client-сделки — не затронуты (грепнуть, что нигде UI не завязан на
  «category всегда из 4 значений»; см. РАЗВЕДКА про category).

### B4. Тесты (правка ревью Grok W7)

По образцу существующих `tests/unit/delivery-phases.test.ts` / `project-href.test.ts`:
- unit: `DELIVERY_TASK_STATUS_LABELS`/`_ORDER` — цикл статусов (next→now→done→next);
- unit: предикат «просрочена» (deadline в прошлом + lane≠done → true; lane=done → false;
  без deadline → false);
- unit: `isPhaseBoard` — деривация режима (все phase → true; смесь/пусто → false).
e2e spawn-флоу требует auth+данных — оставить на ручной прогон гейта, НЕ писать.

---

## ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -10 && npm run build 2>&1 | tail -5
npm run test 2>&1 | tail -5
# в UI нет хардкода лейблов статусов вне констант:
grep -rnE "'Не начата'|'В работе'|'Готово'|'Просрочена'" src --include="*.tsx" | grep -v delivery-phases
# category='phase' не падает в UI-маппинги с default 'done':
grep -rnE "categoryToLane|laneToCategory" src --include="*.ts" --include="*.tsx"
```

### SQL-смоуки гейта (выполняет Cowork после apply, НЕ CC)

```sql
-- 1) после spawn 2-арг (iiot, experiment): колонки category='phase', задачи lane='next' (НЕ 'done')
-- 2) UPDATE tasks SET lane='now' на phase-задаче → column_id НЕ изменился
-- 3) UPDATE tasks SET column_id=<другая фаза> → lane НЕ изменился
-- 4) INSERT internal-проекта → 4 дефолтные колонки (регресс seed-guard)
-- 5) INSERT task (column_id=phase, lane='next') → lane остался 'next'
-- 6) UPDATE project_columns SET category на phase-колонке → задачи НЕ каскадятся (A3b)
-- 7) spawn для направления без шаблона (erp+experiment) → проект создан, 0 колонок
-- 8) бэкфилл: у прогонного delivery-проекта колонки = фазы IIoT-шаблона
```

Ручной сценарий (после применения миграции гейтом): spawn IIoT-эксперимент с won-сделки →
доска 4 фаз с задачами «Не начата» → клик badge → «В работе» → DnD в «Запуск» (статус
сохранился) → задача с дедлайном вчера показывает «Просрочена» → `/tasks` личный борд без
регресса.

## КОММИТЫ (после ревью diff Олегом)

```bash
# 1) миграция (отдельно — легче ревьюить гейтом)
git add supabase/migrations/036_delivery_phase_board_templates.sql
git commit -m "feat(delivery): P2a миграция — фазовые колонки (category=phase), шаблоны Запуск/Эксперимент, spawn v2 с копированием шаблона"
# 2) UI
git add src/
git commit -m "feat(delivery): P2a фазовая доска — колонки=фазы СДР, статус задачи badge, просрочка computed"
```

## VERIFICATION

```
Type Safety:            NOT_VERIFIED (regen после гейта; ручные типы — WARNING до tsc)
RLS Coverage:           WARNING (3 новые таблицы: политики в A4 по образцу 027/032; advisors на гейте)
Backward Compatibility: WARNING (резолвер патчится ветками — internal/личный борд не меняются,
                        но резолвер это «сердце совместимости», смоук на гейте обязателен;
                        spawn: DROP+CREATE с DEFAULT-параметром — 2-арг вызов UI сохраняется)
Runtime Tested:         NOT_VERIFIED
Regional Availability:  NOT_APPLICABLE
```

Трудоёмкость: ~8–12 ч CC (оценка поднята по ревью Grok: phase-режим ProjectBoard — основной
объём) | Риск: средний-высокий на резолвере (митигация — SQL-смоуки гейта выше), средний на UI.

---
_v2 после ревью Grok (`review/review-delivery-p2a-and-architecture.md`): закрыты B1 (полный сид
IIoT experiment), B2 (чеклист phase-режима по фактам ProjectBoard.tsx), B3 (lane='next' в B2.5),
W1 (A3b guard sync_lane), W2 (org-check в copy), W4 (полное тело spawn v2 с живыми именами
переменных), W7 (тесты), W8 (таб «План»). W3 отклонён: каждый spawn создаёт НОВЫЙ проект,
дубль фаз невозможен; guard в copy добавлен как защита будущей кнопки P2b._
