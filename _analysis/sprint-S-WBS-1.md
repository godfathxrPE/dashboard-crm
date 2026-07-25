# Claude Code Prompt — S-WBS-1: WBS-иерархия задач (parent_task_id + wbs_code)

## КОНТЕКСТ (не для исполнения)
Роадмап §6 B4. Задачам нужна иерархия «сводная → подзадачи» (шаблоны 1С:ДО несут
`wbs_code` в тексте: `1.3.11 Отгрузка`). Цель v1: (1) модель `parent_task_id` + `wbs_code`,
(2) задать родителя в модалке, (3) **группировка на Gantt по родителю** (сводный бар +
свёртка). Строится на S-DEPS-1 (та же зона: tasks / GanttTimeline / use-project-schedule).

**Scope v1 (строго):** данные + модалка + Gantt-группировка. **НЕ в v1:** DnD-репарент на
доске (ProjectBoard), автопересчёт дат родителя, cascade. Доска показывает `wbs_code`
префиксом (read-only), дерева-DnD там пока нет.

**Инварианты:**
1. **Аддитивно.** Только ADD COLUMN + новый триггер/индекс. Существующие триггеры tasks
   (set_org_id, lane-резолвер, progress 037, task_overdue) не трогать.
2. **Миграцию НЕ применять из CC** — записать `supabase/migrations/052_*.sql`, закоммитить.
   Применяет гейт Cowork через MCP. RLS не нужен (та же таблица `tasks`, политики наследуются).
3. **Ацикличность + один проект.** Родитель обязан быть в том же `project_id` и не создавать
   цикл — DB-триггер (паттерн 048 `check_task_dependency_valid`), плюс клиентский гард в модалке.
4. **Типы — no `any`.** `unknown` + гварды для внешнего. Токены/px по конвенции репо.

---

## РАЗВЕДКА (выполнить ПЕРВОЙ, ничего не менять)
```bash
cd ~/Downloads/dashboard-crm

# 1. tasks: подтвердить колонки + существующие триггеры (не сломать порядок)
grep -n "start_date\|end_date\|column_id\|is_milestone\|sort_order" src/types/database.ts | head
grep -rn "create trigger\|before insert\|before update" supabase/migrations/048_task_dependencies.sql

# 2. точки встройки
sed -n '1,75p'  src/lib/hooks/use-project-schedule.ts        # swimlanes/effectiveSpan
grep -n "sl.tasks.map\|GanttSwimlane\|swimlane" src/components/tasks/GanttTimeline.tsx | head
sed -n '1,26p'  src/lib/validators/task.ts                    # taskFormSchema
grep -n "optimistic\|input\.\|\.insert\|\.update" src/lib/hooks/use-tasks.ts | head -30
grep -n "export type Task\|Database\['public'\]" src/types/entities.ts

# 3. номер миграции = 052 (последняя 051)
ls supabase/migrations/ | grep -E "^05" 
```
Прочитать целиком: `use-project-schedule.ts`, `GanttTimeline.tsx` (рендер свимлейна),
`TaskModal.tsx`, `validators/task.ts`, insert/update в `use-tasks.ts`.

---

## ЗАДАЧА 1 — Миграция 052 (аддитивная; НЕ применять из CC)
Файл `supabase/migrations/052_task_wbs.sql`:

```sql
-- 052: WBS — иерархия задач (parent_task_id) + wbs_code (S-WBS-1)
-- Аддитивно к tasks. RLS наследуется (та же таблица). Родитель: тот же проект, без циклов.

alter table public.tasks
  add column if not exists parent_task_id uuid references public.tasks(id) on delete set null,
  add column if not exists wbs_code text;

-- Индекс под выборку детей и построение дерева
create index if not exists idx_tasks_parent on public.tasks(parent_task_id) where parent_task_id is not null;

-- Валидатор: self-ref / cross-project / cross-org / цикл по цепочке родителей.
-- Паттерн 048 (check_task_dependency_valid): DEFINER + search_path + адресный ACL.
create or replace function public.check_task_parent_valid()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_parent_project uuid; v_parent_org uuid;
begin
  if new.parent_task_id is null then
    return new;                                   -- корневая задача — ок
  end if;
  if new.parent_task_id = new.id then
    raise exception 'task cannot be its own parent' using errcode = '23514';
  end if;

  select project_id, org_id into v_parent_project, v_parent_org
    from public.tasks where id = new.parent_task_id;

  if v_parent_org is null then
    raise exception 'parent task not found' using errcode = '23503';
  end if;
  if v_parent_org is distinct from new.org_id then
    raise exception 'cross-org parent forbidden' using errcode = '42501';
  end if;
  -- та же org у вызывающего (DEFINER читает в обход RLS; гард только для auth-контекста)
  if auth.uid() is not null then
    if public.current_org_id() is null
       or v_parent_org is distinct from public.current_org_id() then
      raise exception 'cross-org parent forbidden' using errcode = '42501';
    end if;
  end if;
  -- иерархия — в пределах одного проекта
  if new.project_id is null or v_parent_project is distinct from new.project_id then
    raise exception 'parent must be in the same project' using errcode = '23514';
  end if;

  -- цикл: если предок предполагаемого родителя = сама задача → замкнём дерево.
  -- Идём ВВЕРХ от parent к корню (граф до апдейта ацикличен — инвариант держит этот триггер).
  if exists (
    with recursive up(node) as (
      select new.parent_task_id
      union
      select t.parent_task_id
        from public.tasks t
        join up ON t.id = up.node
       where t.parent_task_id is not null
    )
    select 1 from up where node = new.id
  ) then
    raise exception 'parent would create a cycle' using errcode = 'P0001';
  end if;

  return new;
end $$;

revoke all on function public.check_task_parent_valid() from public, anon;
grant execute on function public.check_task_parent_valid() to service_role;

-- Имя zz_ → после set_org_id (org_id заполнен к моменту проверки)
drop trigger if exists trg_zz_check_task_parent on public.tasks;
create trigger trg_zz_check_task_parent
  before insert or update of parent_task_id, project_id on public.tasks
  for each row execute function public.check_task_parent_valid();
```
**Verify (CC):** файл создан, `npx tsc` не зависит от миграции. **НЕ применять** — гейт Cowork.

---

## ЗАДАЧА 2 — Типы + валидатор
1. **`src/types/database.ts`** — после применения миграции гейтом Cowork регенерит
   `npx supabase gen types`. В спринте CC: добавить `parent_task_id: string | null` и
   `wbs_code: string | null` в `Task` (`src/types/entities.ts`, если тип расширяется руками)
   и в optimistic-объект (Задача 3). Пометить `WARNING` — сверить после regen.
2. **`src/lib/validators/task.ts`** — в `taskFormSchema` добавить:
```ts
  parent_task_id: z.string().uuid().nullable().optional(),
  wbs_code: z.string().max(40).nullable().optional(),
```
   (перед `.refine(...)` дат). `TaskFormValues` подхватит автоматически.

---

## ЗАДАЧА 3 — Запись в хуках (`use-tasks.ts`)
- `useCreateTask`: в `.insert({...})` и в optimistic-объект добавить
  `parent_task_id: input.parent_task_id ?? null`, `wbs_code: input.wbs_code ?? null`.
- `useUpdateTask`: в `.update({...})` пробросить `parent_task_id`, `wbs_code` (когда переданы).
- Инвалидация — как есть (`['tasks']`); дерево строится на клиенте, отдельного запроса нет.
**Verify:** создание/редактирование задачи с родителем сохраняет `parent_task_id`.

---

## ЗАДАЧА 4 — Модалка: родитель + WBS-код (`TaskModal.tsx`)
- В форму (после блока «Начало/Конец») добавить:
  - **`wbs_code`** — `<input type="text">` (`{...register('wbs_code', { setValueAs: v => v===''?null:v })}`),
    плейсхолдер `1.3.11`.
  - **Родитель** — `<select {...register('parent_task_id')}>` из задач **того же проекта**.
    Опции: `— без родителя —` + задачи проекта, **исключая саму задачу и её потомков**
    (клиентский anti-cycle; DB-триггер — второй рубеж).
- Источник списка: хук `useProjectBoard(projectId)` (уже есть) по `watch('project_id')`.
  Потомков вычислить локально (обход по `parent_task_id`), исключить из опций при `editTask`.
- `reset(...)` при edit/create — добавить `parent_task_id`, `wbs_code` (как остальные поля).
**Edge:** нет `project_id` → селект родителя скрыт/дизейбл (родитель без проекта не имеет смысла).
**Verify:** нельзя выбрать себя/потомка; сохранение проставляет родителя.

---

## ЗАДАЧА 5 — Дерево в расписании (`use-project-schedule.ts`)
Внутри **каждого свимлейна** построить 1 уровень группировки (v1 — flat children под parent;
глубже — рекурсивно, но UI отступом покажем уровень).

Расширить `GanttTask`/добавить сводный тип:
```ts
export interface GanttTask {
  task: Task;
  start: string; end: string;
  isMilestone: boolean;
  depth: number;            // 0 = корень, 1+ = вложенность (для отступа)
  isSummary: boolean;       // есть дети-в-расписании → сводный бар
  parentId: string | null;
}
```
Алгоритм в `useProjectSchedule` (после текущего сбора `byLane`):
1. Для каждого свимлейна построить `childrenOf = Map<parentId, GanttTask[]>` по `task.parent_task_id`
   (только среди задач этого свимлейна, у кого есть span).
2. Упорядоченный обход: корни (parent null ИЛИ родитель вне свимлейна) сортируются как сейчас;
   под каждым — его дети (рекурсивно), `depth+1`. Плоский результат `GanttTask[]` в порядке дерева.
3. **Сводный span:** если у задачи есть дети-в-расписании → `isSummary=true`,
   `start = min(child.start)`, `end = max(child.end)` (перекрывает собственные даты родителя;
   если своих детей нет — обычный бар). Ромб-веха остаётся, если `is_milestone`.
**Verify:** порядок «родитель → дети», сводные даты = обёртка детей.

---

## ЗАДАЧА 6 — Рендер дерева на Gantt (`GanttTimeline.tsx`)
- Свимлейн теперь рисует плоский упорядоченный `sl.tasks` (уже дерево-порядок).
- **Отступ строки** по `gt.depth` (левая колонка-название: `padding-left: depth*1rem`).
- **Сводный бар** (`gt.isSummary`): иной вид — тоньше/скобка/полупрозрачная заливка
  (var-токен, не hex), чтобы визуально отличался от листа. Клик по нему — тот же `onEditTask`.
- **Свёртка:** локальный `Set<collapsedId>` (useState). Клик по треугольнику у сводной строки
  прячет её потомков (фильтр перед рендером: скрыть task, если любой предок collapsed).
  Стрелки-зависимости (S-DEPS-1) для скрытых — не рисовать (пересчёт видимых id, как уже
  измеряются позиции из DOM `data-task-bar`).
- `wbs_code` — префиксом у названия строки, если задан (`text-text-mute`, `tabular-nums`).
**Verify:** отступы по уровню, свёртка прячет детей, стрелки не висят к скрытым, консоль чистая.

---

## ЗАДАЧА 7 — Доска (`ProjectBoard.tsx` / `TaskCard.tsx`) — только префикс (v1-lite)
- В `TaskCard` показать `wbs_code` префиксом у текста (если задан). Никакого DnD-репарента — v2.
**Verify:** карточка с `wbs_code` рисует код; без — как раньше.

---

## EDGE CASES
- Родитель без дат, дети с датами → сводный бар по детям; родитель без детей-в-расписании → обычный/undated.
- Родитель в одном свимлейне (фазе), ребёнок в другом → каждый в своём свимлейне; группировка
  только внутри свимлейна (v1). Задокументировать в комментарии (кросс-фазовые деревья — v2).
- Удаление родителя → `ON DELETE SET NULL` → дети становятся корневыми (не удаляются).
- Цикл/себя/чужой проект → DB-триггер `P0001/23514/42501`; клиент не даёт выбрать заранее.
- `phaseMode=false` (плоская доска) → один свимлейн, дерево работает так же.

## SELF-CHECK
- [ ] `npx tsc --noEmit` — 0 ошибок, без `any`.
- [ ] `npm run build` проходит.
- [ ] Миграция 052 **закоммичена, но не применена из CC**.
- [ ] Существующие триггеры tasks не тронуты; новый триггер `trg_zz_check_task_parent` before insert/update.
- [ ] Ноль hex/px вне конвенции; var-токены; `tabular-nums` для wbs_code.

## КОММИТ
```bash
git add .
git commit -m "feat(wbs): S-WBS-1 — иерархия задач (parent_task_id + wbs_code), группировка на Gantt"
```
НЕ пушить без явного «пушь».

## VERIFICATION LABELS (заполнит CC/гейт)
```
Type Safety:            NOT_VERIFIED (до tsc; parent/wbs в Task — WARNING до gen types)
RLS Coverage:           NOT_APPLICABLE (та же tasks; политики наследуются, новый триггер = валидация)
Backward Compatibility: WARNING (аддитивно; проверить, что доска/Gantt без wbs рендерят как раньше)
Runtime Tested:         NOT_VERIFIED
Regional Availability:  NOT_APPLICABLE

Migration 052: применяет гейт Cowork (MCP), затем npx supabase gen types → сверить Task.
```
