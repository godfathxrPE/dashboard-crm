# Claude Code Prompt — S-DEPS-1: Gantt-зависимости (task_dependencies, FS + DAG + стрелки)

> **Контекст процесса.** Ты (CC) пишешь миграцию + код + коммитишь. **Миграцию НЕ применяешь** — её применяет гейт Cowork через Supabase MCP. Стек незыблем: Next 15 + TS strict + Tailwind (6 тем) + Supabase. Прод ref `uoiavcabxgdjugzryrmj`.
>
> **Нумерация — внимание.** Последний **файл** в `supabase/migrations/` — `046`. B2-DROP (легаси-stage) был применён через MCP как «047», но **файл 047 в репо не закоммичен** (известный backlog: docs/schema дельта 047). Живая история БД → по 047. Новая миграция = **`048_task_dependencies.sql`** (047 не переиспользуем — это версия DROP'а). Cowork на гейте сверит `supabase_migrations.schema_migrations`, что 048 не коллизит.
>
> Сущность новая → режим /architect соблюдён на стороне Cowork (дизайн ниже в шапке). Твоя задача — реализовать по шагам. Каждый блок — один concern. Порядок зависимостей: **Migration → Types → Validator → Hook → Component**.

---

## АРХИТЕКТУРА (согласовано, реализуй как есть)

**Сущность `task_dependencies`** — рёбра DAG между задачами одного проекта. v1 — только тип **FS** (finish-to-start: `successor` не может начаться раньше, чем закончится `predecessor`). Стрелка рисуется `predecessor.end → successor.start`.

- **Junction-таблица** (M:N self-ref на `tasks`), прецедент — `contact_company`: `org_id NOT NULL`, FK `ON DELETE CASCADE`, **hard-delete** (осознанное отклонение от soft-delete-дефолта v2: ребро графа — не бизнес-запись с историей, как и связь контакт↔компания; лог не нужен).
- `org_id` ставит `trg_set_org_id` (клиент org_id не передаёт).
- Тип задел под FS/SS/FF/SF + `lag_days` — чтобы будущие типы связей и critical path не требовали DDL.

**Границы v1 (важно).** S-DEPS-1 = **storage + DAG-инвариант + отрисовка стрелок + ручное создание/удаление**. Это НЕ scheduling engine: FS хранится и рисуется, но БД/UI **не** запрещают `successor.start < predecessor.end` и **не** двигают даты каскадно (cascade shift — roadmap v2). Critical path (longest path в DAG) — **следующий отдельный спринт**, не здесь.

### ЖЁСТКО НЕ ТРОГАТЬ
- **Не применять** миграцию 048 из CC (`apply_migration` — только гейт Cowork).
- **Не** делать полный regen типов (CLI без токена падает, теряет hand-edits) — только аддитивный hand-stub.
- **Не** двигать даты `successor` каскадно и **не** enforce'ить FS как constraint (v2).
- **Не** трогать commit-path VIEW-2 (`useUpdateTaskDates`, dual-key optimistic `['tasks','board',projectId]` + `['tasks']`) и RLS-политики `tasks`.
- **Не** делать critical-path highlight (v2).
- **Не** менять `effectiveSpan`/`use-project-schedule.ts` span-логику — переиспользовать, не дублировать.

---

## ЗАДАЧА 1 — Миграция `048_task_dependencies` (пишешь файл, НЕ применяешь)

### РАЗВЕДКА (сначала — ничего не менять)
```bash
ls supabase/migrations/ | tail -20                      # последний файл = 046 (047-DROP applied via MCP, файла нет); создаёшь 048
grep -rn "trg_set_org_id" supabase/migrations/ | head    # имя триггера set_org_id (attach к новой таблице)
grep -rn "current_org_id\|current_org_role" supabase/migrations/ | head
grep -rn "contact_company" supabase/migrations/*.sql | head  # свериться с junction-прецедентом (org_id, CASCADE, RLS)
```
Проверь по выводу: точные сигнатуры `public.current_org_id()`, `public.current_org_role()`, имя `trg_set_org_id` и как он навешивается. **Имена бери из вывода, не из памяти.**

### Файл `supabase/migrations/048_task_dependencies.sql`
```sql
-- 048: task_dependencies — рёбра DAG между задачами (Gantt-зависимости, FS v1)

create table if not exists public.task_dependencies (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  predecessor_id  uuid not null references public.tasks(id) on delete cascade,
  successor_id    uuid not null references public.tasks(id) on delete cascade,
  dep_type        text not null default 'FS' check (dep_type in ('FS','SS','FF','SF')),
  lag_days        int  not null default 0,
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  constraint task_dep_no_self check (predecessor_id <> successor_id),
  constraint task_dep_uniq unique (predecessor_id, successor_id)
);

create index if not exists idx_task_dep_org          on public.task_dependencies(org_id);
create index if not exists idx_task_dep_successor    on public.task_dependencies(successor_id);
create index if not exists idx_task_dep_predecessor  on public.task_dependencies(predecessor_id);

-- org_id автозаполнение (паттерн tenant-таблиц)
create trigger trg_set_org_id
  before insert on public.task_dependencies
  for each row execute function public.set_org_id();
-- ^ ЕСЛИ разведка показала другое имя функции set_org_id() — подставь его.

-- Валидатор: self-loop / cross-org / cross-project / cycle (DAG)
create or replace function public.check_task_dependency_valid()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pred_project uuid; v_pred_org uuid;
  v_succ_project uuid; v_succ_org uuid;
begin
  if new.predecessor_id = new.successor_id then
    raise exception 'task cannot depend on itself' using errcode = '23514';
  end if;

  select project_id, org_id into v_pred_project, v_pred_org
    from public.tasks where id = new.predecessor_id;
  select project_id, org_id into v_succ_project, v_succ_org
    from public.tasks where id = new.successor_id;

  if v_pred_org is null or v_succ_org is null then
    raise exception 'task not found' using errcode = '23503';
  end if;
  if v_pred_org is distinct from v_succ_org then
    raise exception 'cross-org dependency forbidden' using errcode = '42501';
  end if;

  -- B1: DEFINER читает tasks В ОБХОД RLS → обе задачи ОБЯЗАНЫ принадлежать org
  -- вызывающего. Иначе по известным UUID можно создать ребро своего org на чужие
  -- задачи (cross-tenant orphan). NULL-safe (learnings: PCT-1 delete_project_column).
  -- Гард только для auth-контекста; service/MCP (auth.uid() IS NULL) не ломаем.
  if auth.uid() is not null then
    if public.current_org_id() is null
       or v_pred_org is distinct from public.current_org_id()
       or v_succ_org is distinct from public.current_org_id() then
      raise exception 'cross-org dependency forbidden' using errcode = '42501';
    end if;
  end if;

  -- зависимости — в пределах одного проекта (Gantt проектный)
  if v_pred_project is null or v_succ_project is null
     or v_pred_project is distinct from v_succ_project then
    raise exception 'dependency requires both tasks in the same project'
      using errcode = '23514';
  end if;

  -- цикл: успешор УЖЕ достигает предшественника → ребро замкнёт DAG
  -- (граф до вставки ацикличен — этот же триггер гарантирует инвариант)
  if exists (
    with recursive reach(node) as (
      select d.successor_id
        from public.task_dependencies d
       where d.predecessor_id = new.successor_id
      union
      select d.successor_id
        from public.task_dependencies d
        join reach r on d.predecessor_id = r.node
    )
    select 1 from reach where node = new.predecessor_id
  ) then
    raise exception 'dependency would create a cycle' using errcode = 'P0001';
  end if;

  return new;
end $$;

-- имя zz_ → триггер срабатывает ПОСЛЕ trg_set_org_id (алфавит: set_ < zz_),
-- org_id уже заполнен на момент проверки
create trigger trg_zz_check_task_dependency
  before insert on public.task_dependencies
  for each row execute function public.check_task_dependency_valid();

-- Hardening (конвенция проекта для триггерных функций)
revoke all on function public.check_task_dependency_valid() from public, anon;
grant execute on function public.check_task_dependency_valid() to service_role;

-- RLS
alter table public.task_dependencies enable row level security;

-- SELECT — org-wide (как project_columns): все члены org видят стрелки чужих задач на Гантте
create policy task_dep_select on public.task_dependencies
  for select using ( org_id = ( select public.current_org_id() ) );

-- INSERT/DELETE — org + роль owner/admin/manager (кто ведёт расписание). viewer — read-only.
create policy task_dep_insert on public.task_dependencies
  for insert with check (
    org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin','manager')
  );

create policy task_dep_delete on public.task_dependencies
  for delete using (
    org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin','manager')
  );
-- UPDATE-политики НЕТ: ребро иммутабельно (изменение = delete + create).

grant select, insert, delete on public.task_dependencies to authenticated;
revoke all on public.task_dependencies from anon;
```

> **Стоп-гейт.** После записи файла: `git add supabase/migrations/048_task_dependencies.sql` — но **не** запускай применение. Дальнейшие шаги (типы/хук/UI) пиши так, чтобы `tsc` проходил на **ручных** типах (Задача 2). Cowork применит 048 через MCP и на гейте сверит advisors.

---

## ЗАДАЧА 2 — Типы

### РАЗВЕДКА
```bash
grep -rn "TaskRow\|Task\b\|project_columns" src/types/ | head
find src -name "supabase.gen.ts" -o -name "entities.ts" -o -name "database.ts" | head
```

Регер CLI без токена падает (известная грабля) → добавь тип **аддитивно и точечно**, не гоняя полный регер (иначе потеряешь hand-edits). В `src/types/database.ts` (или `entities.ts` — куда деривят доменные типы) добавь:

```ts
export type DepType = 'FS' | 'SS' | 'FF' | 'SF';

export interface TaskDependency {
  id: string;
  org_id: string;
  predecessor_id: string;
  successor_id: string;
  dep_type: DepType;
  lag_days: number;
  created_by: string | null;
  created_at: string;
}
```
`entities.ts` деривит из `supabase.gen.ts` — руками его union не ломай; если там ветка от gen — добавь строку `task_dependencies` в gen-стаб по образцу соседней таблицы.

---

## ЗАДАЧА 3 — Хук `use-task-dependencies.ts`

### РАЗВЕДКА
```bash
ls src/lib/hooks/ | grep -i "task\|schedule"
sed -n '1,80p' src/lib/hooks/use-project-schedule.ts   # какой queryKey читает Гант
grep -rn "useUpdateTaskDates\|\['tasks'" src/lib/hooks/ | head  # cache-key конвенция
```

Файл `src/lib/hooks/use-task-dependencies.ts`:
- `useTaskDependencies(projectId, taskIds)` — SELECT рёбер проекта. **W3 — RLS отдаёт ВСЕ рёбра org**, `task_dependencies` своей `project_id`-колонки не имеет → фильтруй явно по id задач текущего борда:
  ```ts
  // taskIds — id всех задач проекта (из board / use-project-schedule)
  const { data, error } = await supabase
    .from('task_dependencies')
    .select('id, predecessor_id, successor_id, dep_type, lag_days')
    .in('predecessor_id', taskIds)
    .in('successor_id', taskIds);   // оба конца в проекте → своё ребро, не чужой проект org
  ```
  Без `taskIds` (пусто) — не дёргать запрос (`enabled: taskIds.length > 0`). queryKey: `['task-dependencies', projectId]`.
- `useCreateTaskDependency(projectId)` — INSERT `{predecessor_id, successor_id}` (dep_type дефолт FS). **Оптимистик**: `cancelQueries(['task-dependencies', projectId])` → патч кэша → rollback on error → invalidate on settled (конвенция проекта, 5 шагов).
- `useDeleteTaskDependency(projectId)` — DELETE по `id`, тот же оптимистик-паттерн.
- Ошибки БД мапить в человекочитаемый toast по errcode:
  - `P0001` → «Нельзя: получится циклическая зависимость».
  - `23514` → «Задачи должны быть в одном проекте / нельзя связать задачу саму с собой».
  - `23505` (unique) → «Такая связь уже есть».
  - `42501` → «Недостаточно прав» / «Задачи из разных пространств».

Внешний payload от Supabase типизируй через `unknown` + narrowing (не `any`).

---

## ЗАДАЧА 4 — Рендер стрелок на Гантте (read-first)

### РАЗВЕДКА
```bash
sed -n '160,180p;260,290p;360,420p' src/components/tasks/GanttTimeline.tsx  # геометрия: gridColumn s+1/e+2 (~170), gridCols/ROW_H (~280), lane-ряды и today (~366-414)
grep -n "ROW_H\|gridTemplateColumns\|getBucketPx\|gridRef" src/components/tasks/GanttTimeline.tsx
grep -rn "bucketPx\|mskDateKey\|shiftDateKeyByBuckets" src/lib/utils/date-helpers.ts
```

В `GanttTimeline.tsx`:
- Наложи **SVG-overlay** (`position:absolute; inset:0; pointer-events:none`) поверх области таймлайна. Для каждого ребра: правый край бара `predecessor` (end) → левый край бара `successor` (start), ортогональная стрелка (elbow: вправо → вниз/вверх → вправо) + маркер-наконечник.
- **ВНИМАНИЕ по геометрии (проверено в GanttTimeline.tsx):** бары НЕ позиционируются через `left/width`. Живой бар — `style={{ gridColumn: gt.isMilestone ? `${s+1}` : `${s+1} / ${e+2}`, gridRow: 1 }}` на grid `gridTemplateColumns: repeat(buckets.length, minmax(28px,1fr))`, каждый swimlane — отдельный grid высотой `ROW_H` (`1.75rem`), плюс спейсер-шапка бакетов и phase-заголовки. `bucketPx` меряется рантаймом (`getBucketPx()` через `gridRef`) — только для drag-transform.
  Поэтому `barRect(task): {x, y, w}` считай так:
  - `x = bucketIndex(startKey) * bucketPx`, `w = (endIndexInclusive - startIndex + 1) * bucketPx`, где `bucketIndex` — индекс бакета по `mskDateKey` (та же логика, что даёт `s`/`e` бару), `bucketPx = gridRef.clientWidth / buckets.length` (мерить с того же grid, что бары).
  - `y` — **накопленная** высота: спейсер-шапка (`ROW_H`) + сумма высот предыдущих lane-рядов (`ROW_H` на ряд) + phase-заголовки, до ряда искомой задачи. Индекс ряда бери из `filteredSwimlanes`/`laneRows`, НЕ выдумывай.
  - Центр бара по Y = `y + ROW_H/2`; правый край pred = `x_pred + w_pred`, левый край succ = `x_succ`.
  - Пересчитывай на изменение зума/фильтра/размера (ResizeObserver или зависимость от `buckets.length` + `gridRef.clientWidth`). Иначе стрелки разъедутся на day/week/month и multi-lane.
- Задача без дат (fallback на `deadline::date`) — стрелку рисуй по эффективным датам рендера (`effectiveSpan` из `use-project-schedule.ts`), не по сырому `start_date`.
- **W4 — фильтр Гантта прячет бары.** `filter='open'` убирает `lane==='done'` (GanttTimeline.tsx:244–245). Если pred или succ **нет в текущем filter-view** (`filteredSwimlanes`) → `barRect` не найдётся → **skip стрелку** (не падать, не рисовать в никуда). Полный граф виден в `filter='all'`.
- Цвет стрелки — через CSS-переменную **`var(--text-mute)`** (проверено: токен в globals.css — `--text-mute`, НЕ `--text-muted`) или `var(--accent)`, **не хардкод hex** (6 тем). Наконечник — solid, не rgba (dark-темы).
- Клик по стрелке → удалить (через `useDeleteTaskDependency`) с confirm. Стрелке дай `pointer-events:stroke` на самом path (overlay иначе `none`).

---

## ЗАДАЧА 5 — Создание связи (link-mode)

- Добавь на панель Гантта тумблер «Связи» (link-mode). В режиме: клик по бару-A → он подсвечивается как predecessor → клик по бару-B → `useCreateTaskDependency({predecessor: A, successor: B})`. Esc/повторный клик по тумблеру — выход.
- Пока link-mode активен — **drag баров (VIEW-2) отключить** (не конфликтовать с click-vs-drag): в GanttTimeline прокинуть флаг, гейтить pointer-handlers move/resize.
- Пустое состояние: если рёбер нет и link-mode выкл — ничего не рисуем (Гант как в VIEW-2).
- a11y: тумблер — `<button aria-pressed>`; бары уже кликабельны (VIEW-1) — link-клик не должен ломать клавиатурный путь открытия модалки.

---

## ГЕЙТЫ CC (прогнать перед коммитом)
```bash
npx tsc --noEmit                 # 0 ошибок (на РУЧНЫХ типах — миграция ещё не применена)
npm run build                    # exit 0
git diff --stat                  # только: миграция 048 + src/types + src/lib/hooks + src/components/tasks + date-helpers
```
> `tsc`/`build` — нативно на Маке (мост SWC arm64 не тянет). Git — только терминал Мака.

## КОММИТ
```bash
git add supabase/migrations/048_task_dependencies.sql \
        src/types src/lib/hooks/use-task-dependencies.ts \
        src/components/tasks/GanttTimeline.tsx
# date-helpers.ts добавляй в git add ТОЛЬКО если реально выносил туда barRect/хелпер (W8) — иначе не трогать
git commit -m "feat(gantt): S-DEPS-1 — task_dependencies (FS) + DAG-валидация + стрелки на Гантте"
```
Доки — **отдельным** коммитом `docs(schema): дельта 048 task_dependencies` (если правишь `docs/schema.md`).

---

## ЧТО СДЕЛАЕТ COWORK ПОСЛЕ ТЕБЯ (не делай сам)
1. `apply_migration` 048 через Supabase MCP (атомарно, в history).
2. Smoke ролями: owner создаёт FS-ребро; **цикл A→B→A → P0001**; cross-project → 23514; дубль → 23505; viewer INSERT → RLS deny (0 строк/42501); **B1: explicit cross-org — INSERT с UUID задач ЧУЖОГО org под JWT своего → 42501** (гард обязан сработать); `get_advisors` чисто (initplan на новых policy нет). **W6 known-race:** параллельные A→B и B→A теоретически оба проходят CTE (v1 — принято, serial-smoke; SERIALIZABLE/advisory-lock вне scope).
3. Chrome-смок на проде: link-mode создаёт стрелку, стрелка держится при зуме day/week/month, клик-удаление, drag-баров отключён в link-mode. Restore тестовых рёбер.

---

## VERIFICATION (дизайн-уровень, до применения)
```
Type Safety:            WARNING  (ручные типы; PASS после регена на применённой 048)
RLS Coverage:           PASS     (select org-wide; insert/delete org + owner/admin/manager; update запрещён; anon revoke; B1: DEFINER-валидатор закрывает cross-tenant edge через org-гард)
Backward Compatibility: PASS     (новая таблица + новые функции; существующие tasks/Гант не тронуты)
DAG Correctness:        WARNING  (рекурсивный CTE верен при ацикличном инварианте; подтвердить смоком цикла P0001)
Runtime Tested:         NOT_VERIFIED
Regional Availability:  NOT_APPLICABLE
```
