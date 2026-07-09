# Claude Code Prompt — Sprint PCT-1: Project-centric Tasks (ось «проект» + кастомные колонки + internal-проекты)

Контекст: dashboard-crm. Основание — `concept-project-centric-tasks.md` (v2, в корне репо),
факты сверены с живой БД 2026-07-09. Два ортогональных понятия: **стадия сделки**
(`stage_id → pipeline_stages`, воронка продаж, гейты S27, автоматизация S29) и **колонка
канбана задач** (НОВОЕ: `project_columns`, доска исполнения). НЕ смешивать. `lane` НЕ
выпиливается — становится деривативным для проектных задач (синхронизация триггером).

**КОНТРАКТ ПО МИГРАЦИИ (как в S29/S-AI-1)**: файл `032_project_boards.sql` пишется и
коммитится, но НЕ применяется. Применяет гейт Cowork (apply_migration → smoke → advisors).
Ничего не деплоить.

НЕ трогай: 019/027/029/030 (совместимость — только через НОВЫЕ триггеры), `lane`-логику
личного борда, Supabase client config.

---

## Ключевые решения (уже приняты, не пересматривать)

1. **Биекция category ↔ lane**: `backlog↔next`, `started↔now`, `paused↔wait`, `done↔done`.
   Категорий ровно четыре (text + CHECK, не enum — расширяемо).
2. **Source of truth**: задача с `project_id` → истина `column_id`, `lane` деривативен.
   Задача без проекта → истина `lane`, `column_id IS NULL`. Разруливает ОДИН триггер
   `resolve_task_board()` — благодаря ему личный борд, S29 `create_task` и TaskQuickAdd
   продолжают писать `lane` БЕЗ изменений кода.
3. **Internal-проекты**: `type='internal'`, `stage_id`/`pipeline_id`/`direction` = NULL
   (CHECK-инвариант), вне воронки/гейтов/автоматизации. S29 отваливается сам (матч по
   `stage_id`), 019 NULL-safe — проверено. Гейтить нужно только UI.
4. **Статус internal**: `open`/`on_hold`/`completed` (значение `completed` добавляется).
5. **Дефолтный сид колонок**: Бэклог/В работе/Ожидание/Готово — всем проектам, обоих типов,
   AFTER INSERT триггером (покрывает `convert_lead()` и любых будущих писателей).
6. **Удаление колонки** — только через RPC `delete_project_column(column, target)`
   (клиентский bulk-update чужих задач упрётся в RLS tasks). Последнюю колонку категории
   `backlog` или `done` удалить нельзя.
7. **RLS `project_columns`**: SELECT — org-wide (колонки — конфигурация борда, как
   pipelines, не бизнес-данные; это проще EXISTS-схемы и гарантирует отрисовку задач
   member'а в чужом проекте). Write — `owner`/`admin` org-wide; `manager` — только
   проекты, где он `owner_id`/`created_by`.

---

## РАЗВЕДКА (выполни первой, результаты влияют на Задачу 1)

```bash
# 1. CHECK-констрейнт на projects.status — имя нужно для DROP/ADD (completed)
# через Supabase MCP execute_sql:
#   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
#   WHERE conrelid = 'public.projects'::regclass AND contype = 'c';

# 2. Триггеры на tasks (алфавитный порядок BEFORE-триггеров — новый должен быть trg_aa_*)
#   SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.tasks'::regclass AND NOT tgisinternal;

# 3. Все места, где код считает stage_id/pipeline_id/direction NOT NULL
grep -rnE "\.stage_id|\.pipeline_id|\.direction" src --include="*.ts" --include="*.tsx" \
  | grep -vE "stage_id\?|pipeline_id\?|direction\?" | head -40

# 4. Side-effect на lane==='done' в use-tasks (строка ~158) — что именно делает
sed -n '150,175p' src/lib/hooks/use-tasks.ts

# 5. Текущий дефолт формы проекта и авто-подстановка pipeline/stage
sed -n '50,110p' src/components/projects/ProjectModal.tsx

# 6. Как ProjectDetail показывает задачи сейчас (секция ~600-660)
grep -n "Task\|Задач" src/components/projects/ProjectDetail.tsx | head -20

# 7. Типы Task/Project
grep -n -A20 "export interface Task\b\|Tables\['tasks'\]" src/types/database.ts | head -40
```

---

## ЗАДАЧА 1: Миграция `supabase/migrations/032_project_boards.sql` (написать, НЕ применять)

Один файл, секции в этом порядке. Все `ALTER`/`CREATE` — с `IF NOT EXISTS`/`OR REPLACE`
где применимо.

### 1.1 projects: тип + нуллабельность + инвариант

```sql
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'client';
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_type_chk;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_type_chk CHECK (type IN ('client','internal'));

ALTER TABLE public.projects ALTER COLUMN stage_id    DROP NOT NULL;
ALTER TABLE public.projects ALTER COLUMN pipeline_id DROP NOT NULL;
ALTER TABLE public.projects ALTER COLUMN direction   DROP NOT NULL;
ALTER TABLE public.projects ALTER COLUMN stage       DROP DEFAULT;  -- зеркало не должно молча писать 'new_lead'

-- «полу-internal» состояний не существует:
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_type_pipeline_chk;
ALTER TABLE public.projects ADD CONSTRAINT projects_type_pipeline_chk CHECK (
  (type = 'client'   AND pipeline_id IS NOT NULL AND stage_id IS NOT NULL AND direction IS NOT NULL)
  OR
  (type = 'internal' AND pipeline_id IS NULL AND stage_id IS NULL)
);
```

⚠️ `status`: по РАЗВЕДКЕ №1 — если CHECK существует, пересоздать с `'completed'` в списке
(`open/won/lost/on_hold/completed`); если констрейнта нет — добавить новый с полным списком.

### 1.2 project_columns + tasks.column_id

```sql
CREATE TABLE IF NOT EXISTS public.project_columns (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name       text NOT NULL,
  category   text NOT NULL CHECK (category IN ('backlog','started','paused','done')),
  position   int  NOT NULL DEFAULT 0,
  wip_limit  int  CHECK (wip_limit IS NULL OR wip_limit > 0),  -- схема P1, UI — P2
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_columns_project ON public.project_columns(project_id, position);
CREATE INDEX IF NOT EXISTS idx_project_columns_org     ON public.project_columns(org_id);

-- существующие триггеры проекта (имена сверь с 021/022 и update_updated_at):
CREATE TRIGGER trg_set_org_id BEFORE INSERT ON public.project_columns
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id();
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.project_columns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS column_id uuid REFERENCES public.project_columns(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_column ON public.tasks(column_id, sort_order);
```

### 1.3 Маппинги + сид колонок

```sql
CREATE OR REPLACE FUNCTION public.category_to_lane(p text) RETURNS task_lane
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p WHEN 'backlog' THEN 'next'::task_lane WHEN 'started' THEN 'now'
                WHEN 'paused' THEN 'wait' ELSE 'done' END $$;

CREATE OR REPLACE FUNCTION public.lane_to_category(p task_lane) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p WHEN 'next' THEN 'backlog' WHEN 'now' THEN 'started'
                WHEN 'wait' THEN 'paused' ELSE 'done' END $$;

CREATE OR REPLACE FUNCTION public.seed_project_columns() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.project_columns (org_id, project_id, name, category, position) VALUES
    (NEW.org_id, NEW.id, 'Бэклог',   'backlog', 1),
    (NEW.org_id, NEW.id, 'В работе', 'started', 2),
    (NEW.org_id, NEW.id, 'Ожидание', 'paused',  3),
    (NEW.org_id, NEW.id, 'Готово',   'done',    4);
  RETURN NEW;
END $$;

CREATE TRIGGER trg_zz_seed_columns AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.seed_project_columns();
```

⚠️ SECURITY DEFINER обязателен: проект создаёт и `convert_lead()`, и обычный клиент —
вставка колонок не должна зависеть от RLS вызывающего.

### 1.4 Резолвер lane ↔ column_id (сердце совместимости)

```sql
CREATE OR REPLACE FUNCTION public.resolve_task_board() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  ELSE
    IF NEW.column_id IS DISTINCT FROM OLD.column_id AND NEW.column_id IS NOT NULL THEN
      NULL; -- переезд по доске проекта: lane выведем ниже
    ELSIF NEW.project_id IS DISTINCT FROM OLD.project_id
       OR (NEW.lane IS DISTINCT FROM OLD.lane) THEN
      -- смена проекта или lane-переезд на личном борде → перемапить колонку
      SELECT id INTO NEW.column_id FROM public.project_columns
      WHERE project_id = NEW.project_id AND category = public.lane_to_category(NEW.lane)
      ORDER BY position LIMIT 1;
    END IF;
  END IF;

  -- fallback: подходящей категории нет (кастомный набор без backlog-аналога) → первая колонка
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

CREATE TRIGGER trg_aa_resolve_board BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.resolve_task_board();
```

⚠️ Имя `trg_aa_*` — чтобы BEFORE-триггер шёл первым по алфавиту (сверь РАЗВЕДКОЙ №2,
что на tasks нет BEFORE-триггера с именем «раньше»). ⚠️ Смена category у существующей
колонки: добавь AFTER UPDATE OF category ON project_columns → `UPDATE tasks SET lane =
category_to_lane(NEW.category) WHERE column_id = NEW.id` (SECURITY DEFINER, отдельная
функция `sync_lane_on_category_change()`).

### 1.5 RPC удаления колонки

```sql
CREATE OR REPLACE FUNCTION public.delete_project_column(p_column_id uuid, p_target_column_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_col public.project_columns; v_target public.project_columns;
BEGIN
  SELECT * INTO v_col FROM public.project_columns WHERE id = p_column_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'column not found'; END IF;

  -- права: owner/admin org-wide, manager — свой проект (паттерн 027)
  IF v_col.org_id <> public.current_org_id() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  IF public.current_org_role() NOT IN ('owner','admin') AND NOT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = v_col.project_id
      AND (p.owner_id = auth.uid() OR p.created_by = auth.uid())
  ) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;

  -- инвариант борда: последняя backlog/done не удаляется
  IF v_col.category IN ('backlog','done') AND NOT EXISTS (
    SELECT 1 FROM public.project_columns
    WHERE project_id = v_col.project_id AND category = v_col.category AND id <> v_col.id
  ) THEN RAISE EXCEPTION 'cannot delete last % column', v_col.category; END IF;

  -- непустая колонка требует приёмника того же проекта
  IF EXISTS (SELECT 1 FROM public.tasks WHERE column_id = v_col.id) THEN
    SELECT * INTO v_target FROM public.project_columns
      WHERE id = p_target_column_id AND project_id = v_col.project_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'target column required'; END IF;
    UPDATE public.tasks SET column_id = v_target.id WHERE column_id = v_col.id;
  END IF;

  DELETE FROM public.project_columns WHERE id = v_col.id;
END $$;
```

⚠️ `UPDATE tasks SET column_id` внутри RPC дёрнет `trg_aa_resolve_board` → lane
пересчитается сам. Это желаемое поведение.

### 1.6 RLS project_columns (паттерн 027)

```sql
ALTER TABLE public.project_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_columns_select" ON public.project_columns FOR SELECT
  USING ( org_id = ( SELECT public.current_org_id() ) );

CREATE POLICY "project_columns_write" ON public.project_columns
  FOR ALL
  USING (
    org_id = ( SELECT public.current_org_id() )
    AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
      OR EXISTS ( SELECT 1 FROM public.projects p
                  WHERE p.id = project_id
                    AND (p.owner_id = auth.uid() OR p.created_by = auth.uid()) ) )
  )
  WITH CHECK ( org_id = ( SELECT public.current_org_id() ) );
```

⚠️ Раздели на insert/update/delete-политики, если в проекте так принято (сверь 027/030);
`FOR ALL` с USING достаточно, но единообразие важнее.

### 1.7 Бэкфилл (в конце файла)

```sql
-- колонки всем существующим проектам (у них триггер не срабатывал)
INSERT INTO public.project_columns (org_id, project_id, name, category, position)
SELECT p.org_id, p.id, v.name, v.category, v.position
FROM public.projects p
CROSS JOIN (VALUES ('Бэклог','backlog',1),('В работе','started',2),
                   ('Ожидание','paused',3),('Готово','done',4)) AS v(name,category,position)
WHERE NOT EXISTS (SELECT 1 FROM public.project_columns c WHERE c.project_id = p.id);

-- прямой UPDATE, минуя двусмысленность: маппим lane → колонка
UPDATE public.tasks t SET column_id = c.id
FROM public.project_columns c
WHERE t.project_id IS NOT NULL AND t.column_id IS NULL
  AND c.project_id = t.project_id AND c.category = public.lane_to_category(t.lane);

-- пересчёт sort_order внутри колонок
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY column_id ORDER BY sort_order, created_at) AS rn
  FROM public.tasks WHERE column_id IS NOT NULL
)
UPDATE public.tasks t SET sort_order = ranked.rn FROM ranked WHERE t.id = ranked.id;
```

---

## ЗАДАЧА 2: Типы — `src/types/database.ts`

1. `export type ProjectType = 'client' | 'internal';`
2. `export type ColumnCategory = 'backlog' | 'started' | 'paused' | 'done';`
3. Интерфейс `ProjectColumn` (Row/Insert/Update — по образцу соседних) с полями из 1.2.
4. `Project`: добавить `type: ProjectType`; `stage_id`, `pipeline_id`, `direction` → `| null`.
5. `Task`: добавить `column_id: string | null` (Row/Insert/Update).

⚠️ После правки `Project` компилятор подсветит все места из РАЗВЕДКИ №3 — это и есть
план Задачи 6. Не глуши ошибки `!`-ассершенами: каждая — ветка `type === 'client'`.

---

## ЗАДАЧА 3: Валидаторы

`src/lib/validators/project.ts`: схема через `z.discriminatedUnion('type', ...)` —
`client` требует `direction`/`pipeline_id`/`stage_id` (как сейчас), `internal` их
запрещает (`z.undefined()`/omit). `src/lib/validators/task.ts`: добавить
`column_id: z.string().uuid().nullable().optional()` — lane-дефолт не трогать.

---

## ЗАДАЧА 4: Хуки

1. Новый `src/lib/hooks/use-project-columns.ts`: `useProjectColumns(projectId)`
   (SELECT order by position), `useCreateColumn`, `useUpdateColumn` (rename/category/position),
   `useDeleteColumn` → `supabase.rpc('delete_project_column', {...})`. Optimistic по
   паттерну проекта, ключ `['project-columns', projectId]`.
2. `src/lib/hooks/use-tasks.ts`: добавить `useProjectBoard(projectId)` — задачи проекта,
   сгруппированные `Record<columnId, Task[]>` (сортировка по `sort_order`), + мутация
   `moveTask({ id, column_id, sort_order })`. Существующие функции НЕ менять
   (lane-запись личного борда остаётся — резолвер в БД её обработает).
3. Realtime: в ProjectDetail — `useRealtimeSync('tasks')` уже есть? Проверить; добавить
   подписку на `project_columns` (если `useRealtimeSync` параметризуется таблицей — вызвать
   вторым инстансом).

⚠️ Инвалидация: перенос по доске меняет и `lane` (триггером) → инвалидируй `['tasks']`
целиком, не только `['project-board', projectId]`, иначе личный борд покажет старую lane.

---

## ЗАДАЧА 5: ProjectModal — переключатель типа

`src/components/projects/ProjectModal.tsx`:
1. Переключатель «Клиентский / Внутренний» (radio/switch) над direction — только в
   режиме создания; тип существующего проекта в P1 НЕ меняется (это отдельная миграция
   в/из воронки — вне скоупа, задокументируй в UI подсказкой).
2. `type === 'internal'` → скрыть direction/pipeline/stage и company/contact-селекты НЕ
   скрывать (внутренний проект может быть про клиента, просто без сделки), auto-default
   pipeline (строки ~91–107) не должен срабатывать для internal.
3. Submit: internal шлёт `stage_id: null, pipeline_id: null, direction: null, type: 'internal'`.

---

## ЗАДАЧА 6: Гейтинг pipeline-UI по `type` (по списку из РАЗВЕДКИ №3 + компилятора)

Минимум (сверь с реальными ошибками tsc):
- `ProjectDetail.tsx` — chevron/StackedPipeline, StageReadiness, DealProgressBar,
  probability, кнопки стадий: рендер только при `project.type === 'client'`.
- `PipelineBoard.tsx` / `StageBoard.tsx` / `ProjectsView.tsx` — internal-проекты не
  попадают в стадийные колонки (stage_id null); показать их отдельной группой/фильтром
  «Внутренние» в table-view, топ-фильтр по типу на `/projects`.
- `ProjectCard.tsx` — бейдж типа вместо стадии для internal.
- `LostDeals.tsx`, won/lost-аналитика, `dashboard-content.tsx` (фильтр `stage !== 'won'`)
  — проверить, что internal (stage=null) не ломает выборки; где считается конверсия —
  фильтр `type === 'client'`.
- `stage-mapping.ts` (`mapToLegacyStage`) — вызовы должны переживать `direction: null`
  (internal туда попадать не должен вовсе — гейти вызов, не функцию).

---

## ЗАДАЧА 7: Проектная доска

1. Новый `src/components/tasks/ProjectBoard.tsx`: динамические колонки из
   `useProjectColumns(projectId)` + задачи из `useProjectBoard(projectId)`. dnd-kit по
   образцу `KanbanBoard.tsx` (267 строк — переиспользуй паттерны onDragOver/onDragEnd,
   но droppable-id = `column.id`, НЕ lane). Перенос → `moveTask({ column_id, sort_order })`.
   Empty state на колонку. TaskQuickAdd в колонке — прокинуть `column_id` (+`project_id`).
2. Управление колонками: кнопка «+ колонка» (имя + category-селект из 4 категорий),
   rename inline, удаление → confirm-диалог; если в колонке есть задачи — обязательный
   селект колонки-приёмника → `useDeleteColumn({ id, targetId })`.
3. Встроить в `ProjectDetail.tsx` как вкладку «Доска» (рядом с текущим списком задач;
   существующий список задач оставить как есть — не ломать привычный вид).
4. `/tasks` (личный борд) — НЕ трогать.

⚠️ Стили: только CSS-переменные, скоуп тем не ломать; никаких Tailwind-цветов и px.

---

## ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -20
npm run build 2>&1 | tail -5
grep -n "column_id" src/types/database.ts src/lib/validators/task.ts | head
```

Смок-сценарии для гейта (выполняет Cowork при применении, приложи в PR-описание):
1. INSERT проекта (client и internal) → 4 колонки создались; internal с `stage_id=null`
   проходит, `client` без stage_id — ловит `projects_type_pipeline_chk`.
2. INSERT задачи с `project_id` + `lane='now'` без column_id → column_id = «В работе»,
   lane остался 'now'. Перенос по доске в «Готово» → lane стал 'done'.
3. Перенос той же задачи на личном борде в 'wait' → column_id стал «Ожидание».
4. `delete_project_column` непустой без target → exception; последней done-колонки → exception.
5. S29: переход сделки в «Подготовка КП» → задача создана И встала в backlog/«Бэклог»-колонку.
6. RLS: manager чужого проекта не может INSERT/DELETE колонку (42501), но SELECT видит.

## КОММИТ

```bash
git add supabase/migrations/032_project_boards.sql src/ concept-project-centric-tasks.md
git commit -m "Sprint PCT-1: project boards — project_columns + tasks.column_id, internal-проекты (type, nullable stage/pipeline/direction), lane<->column резолвер, ProjectBoard UI"
```

---

## VERIFICATION (для ревью промпта, не для Claude Code)

```
Type Safety:            WARNING (типы описаны, generated types не прогонялись)
RLS Coverage:           WARNING (паттерн скопирован с 027, не исполнялся)
Backward Compatibility: WARNING (аддитивно + резолвер; S29/личный борд по дизайну не тронуты, подтверждается смоками гейта)
Runtime Tested:         NOT_VERIFIED (контракт: миграцию применяет гейт)
Regional Availability:  NOT_APPLICABLE
```

Трудоёмкость: полноценный спринт (миграция с 5 функциями + рефактор борда). Риск: средне-высокий; главные точки — резолвер (смоки 2–3) и гейтинг pipeline-UI (ошибки tsc после Задачи 2 = чек-лист).
