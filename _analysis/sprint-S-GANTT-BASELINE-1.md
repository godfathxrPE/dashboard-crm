# Claude Code Prompt — Sprint S-GANTT-BASELINE-1: базовый план (baseline) и план/факт

> **Тип:** D3, **С МИГРАЦИЕЙ** — CC пишет и коммитит, **не применяет**. Апплаит Cowork-гейт.
> **Ветка:** `feat/gantt-baseline-1` от свежего `main`.
> Зависимости: независим от 1B/CPM по коду, но по смыслу идёт после них.

## РАЗВЕДКА (обязательно перед первой строкой SQL)

```bash
cd ~/Downloads/dashboard-crm && git checkout main && git pull --ff-only origin main
git checkout -b feat/gantt-baseline-1
ls supabase/migrations | tail -5                    # СВОБОДНЫЙ номер, память врёт — смотри диск
grep -rn "set_org_id\|freeze_org_id\|current_org_role" supabase/migrations | tail -20
grep -rln "moddatetime\|updated_at" supabase/migrations | tail -3   # как ставится updated_at-триггер
grep -n "start_date\|end_date\|is_milestone\|wbs_code" src/types/database.ts | head
find src/components/tasks -name "*.tsx"             # куда класть UI, НЕ угадывай
```

Живую БД смотреть через Supabase MCP **read-only** (`list_tables`, `execute_sql` на SELECT) —
за истиной о колонках и политиках идти туда, а не в папку миграций.

Точки врезки в коде (сверено 2026-07-25):

- `useProjectSchedule` отдаёт `GanttTask.start/end` — baseline рисуется рядом, модель не меняем.
- `GanttTimeline`: `ROW_H = '1.75rem'`, бар позиционируется по `bucketIndexOf`; ghost-бар кладём
  тем же расчётом в ту же строку, слоем ниже.

## WHY

Без зафиксированного плана Гант отвечает только на «как сейчас». Заказчик и руководство спрашивают
другое: **«насколько мы уехали от того, что обещали»**. Это стандартный объект во всех взрослых
системах:

- MS Project: `Baseline` (до 11 слепков), `Start Variance` / `Finish Variance`.
- Primavera P6: `Project Baselines` + `Baseline Bars` на самом Ганте.
- Bryntum: `Baselines` feature — те же ghost-бары под основными.

Для твоего профиля (защита scope и сроков перед клиентом) это самая «продажная» фича из всей
дорожной карты: скрин Ганта с планом и фактом — готовый аргумент в разговоре о переносе сроков.

## DATA MODEL

```
project_baselines        1 ─── N  baseline_tasks
  id                              id
  org_id                          org_id
  project_id → projects           baseline_id → project_baselines (ON DELETE CASCADE)
  name                            project_id  → projects (денормализация под RLS)
  created_by → profiles           task_id     → tasks (ON DELETE CASCADE)
  created_at                      start_date / end_date / is_milestone
                                  UNIQUE (baseline_id, task_id)
```

**Иммутабельность.** UPDATE-политики нет ни на одной из таблиц: план, который правят задним
числом, бесполезен. Переснять = создать новый baseline. Имя тоже не редактируется — это
осознанная цена v1, в долги.

**Hard delete, без `deleted_at`.** В проекте нет ни одной таблицы с `deleted_at`; 067 фиксирует
это как решение («deleted_at-инфраструктуры в проекте нет — консистентно»). Одинокая
soft-delete-таблица означает, что каждый будущий запрос и каждая политика обязаны помнить
`and deleted_at is null`; первый забытый фильтр — призрачные бейслайны в селекте.
Удаление = физический DELETE заголовка, `baseline_tasks` уходят каскадом.

Отдельно: в исходной версии спринта soft delete требовал UPDATE-политики на
`project_baselines` — а RLS UPDATE не ограничен колонками, то есть owner/admin мог переписать
`name` и что угодно ещё. Заявленная иммутабельность ломалась той же строкой, которая её
охраняла. С hard delete UPDATE-политика не нужна вовсе.

`wbs_code` в слепок **не** копируем: он про структуру, а не про сроки.

`updated_at` не заводим — строка иммутабельна, обновлять нечего (паритет 067, где тоже нет).

## RBAC

```
             | Create baseline | Read | Delete (hard) |
owner        |        ✓        |  ✓   |       ✓       |
admin        |        ✓        |  ✓   |       ✓       |
manager      |        ✓        |  ✓   |       ✗       |
viewer       |        ✗        |  ✓*  |       ✗       |
```

\* Read — только по проектам, которые пользователь и так видит (зеркало видимости проекта
из 065/067), а не по всей org. Плоское `org_id = current_org_id()` в SELECT дало бы утечку
сроков чужих проектов внутри организации — см. ЗАДАЧА 1.

## ЗАДАЧА 1: миграция `074_project_baselines.sql`

Номер `074` — по диску последний числовой `073_fix_spawn_delivery_project_stage.sql`
(есть ещё timestamp-именованный `20260712230000_baseline.sql`, в числовой ряд он не входит).
**Всё равно пересчитать `ls supabase/migrations | tail -5` перед первой строкой** и взять
фактически свободный.

Каркас; имена функций и ролей сверить с 067/069, не копировать вслепую:

```sql
-- 074: project_baselines — зафиксированный слепок сроков проекта (план) для план/факт.
-- Hard delete: deleted_at-инфраструктуры в проекте нет (см. 067). Слепок иммутабелен:
-- UPDATE-политик нет, переснять = новый baseline.

create table if not exists public.project_baselines (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  project_id  uuid not null references public.projects(id)      on delete cascade,
  name        text not null check (char_length(trim(name)) between 1 and 120),
  -- profiles, НЕ auth.users (конвенция проекта); SET NULL — слепок переживает ушедшего автора
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);

create table if not exists public.baseline_tasks (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  baseline_id  uuid not null references public.project_baselines(id) on delete cascade,
  -- денормализация: без project_id политика SELECT либо джойнит заголовок на каждую строку,
  -- либо вырождается в org-широкую. Пишется RPC вместе с baseline_id.
  project_id   uuid not null references public.projects(id) on delete cascade,
  task_id      uuid not null references public.tasks(id) on delete cascade,
  start_date   date not null,
  end_date     date not null,
  is_milestone boolean not null default false,
  unique (baseline_id, task_id)
);

-- org_id: ставится триггером и замораживается. Авто-цикл 054 новые таблицы не покрывает —
-- выписываем оба триггера явно на обе таблицы.
create trigger trg_set_org_id_project_baselines before insert on public.project_baselines
  for each row execute function public.set_org_id();
create trigger trg_freeze_org_id_project_baselines before update on public.project_baselines
  for each row execute function public.freeze_org_id();
create trigger trg_set_org_id_baseline_tasks before insert on public.baseline_tasks
  for each row execute function public.set_org_id();
create trigger trg_freeze_org_id_baseline_tasks before update on public.baseline_tasks
  for each row execute function public.freeze_org_id();

alter table public.project_baselines enable row level security;
alter table public.baseline_tasks    enable row level security;

create index if not exists idx_project_baselines_org_project
  on public.project_baselines (org_id, project_id, created_at desc);
create index if not exists idx_baseline_tasks_baseline on public.baseline_tasks (baseline_id);
create index if not exists idx_baseline_tasks_org_project
  on public.baseline_tasks (org_id, project_id);
create index if not exists idx_baseline_tasks_task on public.baseline_tasks (task_id);
```

**Видимость.** Предикат — дословное зеркало `project_messages_select` (067): org-граница первым
конъюнктом, дальше owner/admin org, либо владелец/создатель проекта, либо `is_project_member`.
Один и тот же предикат на обеих таблицах — поэтому `project_id` и лежит в `baseline_tasks`.

```sql
create policy project_baselines_select on public.project_baselines
  for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.current_org_role()) in ('owner','admin')
      or exists (
        select 1 from public.projects p
        where p.id = project_id
          and (p.owner_id = (select auth.uid()) or p.created_by = (select auth.uid()))
      )
      or (select public.is_project_member(project_id))
    )
  );

-- DELETE: только owner/admin org. Физическое удаление, baseline_tasks уходят каскадом.
create policy project_baselines_delete on public.project_baselines
  for delete to authenticated
  using (
    org_id = (select public.current_org_id())
    and (select public.current_org_role()) in ('owner','admin')
  );

create policy baseline_tasks_select on public.baseline_tasks
  for select to authenticated
  using ( /* тот же предикат, что выше, по своему project_id */ );
```

**INSERT-политик нет ни на одной таблице — это не забывчивость.** Единственный путь записи —
RPC с `security definer`: она выполняется от владельца таблиц, а RLS к владельцу не применяется
(`force row level security` в проекте нигде не включён). Прямой INSERT заголовка клиентом дал бы
пустой baseline без строк — ровно то, что мы не хотим. UPDATE-политик нет по иммутабельности.

```sql
grant select, delete on public.project_baselines to authenticated;
grant select          on public.baseline_tasks    to authenticated;
revoke all on public.project_baselines from anon;
revoke all on public.baseline_tasks    from anon;
```

Грант выписывается явно, даже если дефолтные привилегии Supabase его и так дают — конвенция 069.
`insert`/`update` не грантим: писать может только RPC.

### RPC — атомарный слепок одним стейтментом

```sql
create or replace function public.create_project_baseline(p_project_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if not exists (
    select 1 from public.projects p
    where p.id = p_project_id and p.org_id = public.current_org_id()
  ) then
    raise exception 'Проект не найден' using errcode = '42501';
  end if;
  if coalesce(public.current_org_role(), '') not in ('owner','admin','manager') then
    raise exception 'Недостаточно прав' using errcode = '42501';
  end if;

  insert into public.project_baselines (project_id, name, created_by)
  values (p_project_id, trim(p_name), auth.uid())
  returning id into v_id;

  -- Слепок обязан повторять effectiveSpan из use-project-schedule.ts, иначе задачи,
  -- нарисованные на Ганте только по deadline, в план не попадут и после первого сдвига
  -- получат маркер «вне плана», хотя были в плане.
  --   start = start_date ?? end_date ?? deadline(MSK)
  --   end   = end_date ?? deadline(MSK) ?? start_date, с клэмпом end < start → end = start
  with src as (
    select t.id,
           t.start_date,
           t.end_date,
           (t.deadline at time zone 'Europe/Moscow')::date as dl,
           t.is_milestone
    from public.tasks t
    where t.project_id = p_project_id          -- у tasks НЕТ deleted_at: фильтра здесь быть не может
  )
  insert into public.baseline_tasks
    (baseline_id, project_id, task_id, start_date, end_date, is_milestone)
  select v_id,
         p_project_id,
         s.id,
         coalesce(s.start_date, s.end_date, s.dl),
         greatest(coalesce(s.end_date, s.dl, s.start_date),
                  coalesce(s.start_date, s.end_date, s.dl)),
         s.is_milestone
  from src s
  where coalesce(s.start_date, s.end_date, s.dl) is not null;

  return v_id;
end $$;

revoke all on function public.create_project_baseline(uuid, text) from public, anon;
grant execute on function public.create_project_baseline(uuid, text) to authenticated;
```

> `org_id` в обеих вставках проставит триггер `set_org_id()` — руками не передаём.
> `tasks.is_milestone` — `boolean not null`, `coalesce` не нужен.
> **`and t.deleted_at is null` НЕ добавлять**: колонки нет, apply упадёт с 42703.

## ЗАДАЧА 2: типы и хуки

- `npm run db:gen-types` **после** применения миграции гейтом — до этого типы не трогать.
- `src/lib/hooks/use-project-baselines.ts`:
  - `useProjectBaselines(projectId)` — список (id, name, created_at), сорт по `created_at desc`;
  - `useBaselineTasks(baselineId | null)` — `enabled: !!baselineId`, отдаёт `Map<task_id, {start,end}>`;
  - `useCreateBaseline(projectId)` — `supabase.rpc('create_project_baseline', {...})`,
    инвалидация списка, свой тост на `42501` (паттерн `parseDependencyError`);
  - `useDeleteBaseline` — `.delete().eq('id', baselineId)` (физическое удаление, строки слепка
    уходят каскадом), оптимистик по 5-шаговой конвенции, тост на `42501` для manager/viewer;
    после удаления выбранного слепка сбросить селект в «—».

## ЗАДАЧА 3: UI

- В шапке Ганта: кнопка **«Зафиксировать план»** (видна при `canManage`) → компактный prompt имени
  (дефолт — `План от DD.MM.YYYY`), и селект **«Базовый план: —/…»** для выбора отображаемого слепка.
  Модалку класть в папку фичи (`src/components/tasks/…`), НЕ в `components/modals/`.
- **Ghost-бар**: под основным баром, в той же строке, высота ~⅓ `ROW_H`, смещён к низу строки,
  позиция по тем же `bucketIndexOf`/`buildBuckets`. Цвет — CSS-переменная темы с пониженной
  непрозрачностью, **никаких хексов**. Рендерить только если задача есть в слепке и даты отличаются.
- Подсказка при наведении на ghost: `План: DD.MM – DD.MM · сдвиг +N дн` (знак обязателен).
- Задачи, которых не было в слепке (созданы позже) — маркер «вне плана» в подсказке основного бара.
- Выбранный baseline держать в состоянии компонента (не в URL) — v1.

## VERIFY

```bash
npx tsc --noEmit && npx eslint src/components/tasks src/lib/hooks
grep -rn "\bany\b" src/lib/hooks/use-project-baselines.ts            # пусто
grep -rn "#[0-9a-fA-F]\{6\}\|bg-\[" src/components/tasks/            # нет хардкод-цветов в новом
grep -rn "service_role" src/                                          # пусто
git diff --stat main
```

**Гейт (Cowork, я):** ревью SQL → `apply_migration` → `db:gen-types` → смоук ролями через симуляцию
JWT → `get_advisors` (ожидание: 0 новых warnings — RLS включена на обеих таблицах, функция с
`search_path`, ACL адресный).

Ручной смоук:

1. owner: «Зафиксировать план» → слепок создан, число строк в `baseline_tasks` = число датированных
   задач проекта.
2. Сдвинуть задачу → выбрать слепок → ghost-бар на старом месте, подсказка показывает `+N дн`.
3. Задача создана после слепка → ghost нет, маркер «вне плана».
4. viewer: кнопки «Зафиксировать» нет; RPC напрямую → `42501`.
5. manager: создаёт слепок, удалить не может (RLS deny → 0 строк, оптимистик откатывается).
6. Чужая org: слепки не видны (RLS-изоляция, проверить симуляцией).
7. Проект без дат → слепок пустой, UI не падает.
7a. Задача только с `deadline` (без start_date/end_date) → **в слепке есть**, ghost совпадает
    с тем, что рисовал Гант до сдвига. Регресс этого кейса — главный риск RPC.
7b. Участник, не входящий в проект → слепки этого проекта не видны (не только чужая org).
8. Темы aura + fuji: ghost различим и не спорит с крит-путём.

## КОММИТ

```bash
git add supabase/migrations/074_project_baselines.sql \
        src/lib/hooks/use-project-baselines.ts src/components/tasks/
git commit -m "feat(gantt): базовый план проекта — слепок сроков и ghost-бары план/факт

- миграция 074: project_baselines + baseline_tasks (org_id + set_org_id/freeze_org_id
  на обеих таблицах, RLS org-первым-конъюнктом, initplan current_org_role, revoke anon)
- видимость слепков = зеркало видимости проекта (067), не org-широкая: project_id
  денормализован в baseline_tasks под тот же предикат
- RPC create_project_baseline (SECURITY DEFINER, search_path public/pg_temp, адресный GRANT):
  атомарный слепок одним INSERT..SELECT, span повторяет effectiveSpan (deadline-only задачи
  попадают в план); INSERT-политик нет — единственный путь записи это RPC
- слепок иммутабелен: UPDATE-политик нет, переснять = новый baseline
- hard delete заголовка (owner/admin) + CASCADE: deleted_at в проекте не заводим (см. 067)
- хуки use-project-baselines (список / строки / create / delete, оптимистик)
- UI: «Зафиксировать план», селект слепка, ghost-бар со сдвигом +N дн в подсказке

Миграция НЕ применена — апплаит гейт."
```

## Verification Labels

```
Type Safety:            NOT_VERIFIED (типы генерятся ПОСЛЕ apply; до этого — WARNING по построению)
RLS Coverage:           PASS by design (RLS на обеих таблицах, org первым конъюнктом,
                        видимость = зеркало проекта, INSERT/UPDATE-политик нет вовсе —
                        запись только через SECURITY DEFINER RPC, anon revoked)
                        — подтверждается гейтом через get_advisors и смоуком 7b
Backward Compatibility: PASS (аддитивно: две новые таблицы, ни одной правки существующих)
Runtime Tested:         NOT_VERIFIED (миграция не применена из CC — это контракт процесса)
```

Трудоёмкость: ~10–14 ч (миграция+RPC ~3, гейт ~1, хуки ~2, UI ghost+селект ~4, смоук ролями ~2).
Риск: средний — первая миграция волны, но полностью аддитивная.

## Долги

- Несколько слепков одновременно (сравнение «план v1 vs v2») — v1 показывает один.
- Переименование слепка: UPDATE-политики нет по иммутабельности, опечатка в имени лечится
  только пересозданием. Если начнёт мешать — колоночный UPDATE через отдельную RPC, не политику.
- Variance-колонки в списке задач и экспорт отклонений — после PNG-экспорта из POLISH.
- Автослепок при переводе проекта в статус «в работе» — если появится запрос.

---

## Процесс

CC пишет + коммитит (миграцию **не применяет**) → Cowork-гейт: ревью SQL → `apply_migration` →
`db:gen-types` → `get_advisors` → мёрж → мой прод-смоук по ролям.
