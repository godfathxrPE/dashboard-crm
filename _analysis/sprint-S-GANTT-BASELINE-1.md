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
  name                            task_id     → tasks (ON DELETE CASCADE)
  created_by / created_at         start_date / end_date / is_milestone
  deleted_at (soft delete)        UNIQUE (baseline_id, task_id)
```

- Слепок **иммутабелен**: UPDATE строк `baseline_tasks` не предусмотрен (нет политики) — план,
  который правят задним числом, бесполезен. Переснять = создать новый baseline.
- Soft delete только на заголовке (`project_baselines.deleted_at`); `baseline_tasks` — технические
  строки слепка, каскадное физическое удаление, рационале в комментарии миграции.
- `wbs_code` в слепок **не** копируем: он про структуру, а не про сроки, и не участвует в план/факте.

## RBAC

```
             | Create baseline | Read | Delete (soft) |
owner        |        ✓        |  ✓   |       ✓       |
admin        |        ✓        |  ✓   |       ✓       |
manager      |        ✓        |  ✓   |       ✗       |
viewer       |        ✗        |  ✓   |       ✗       |
```

## ЗАДАЧА 1: миграция `0NN_project_baselines.sql` (номер — из РАЗВЕДКИ)

Каркас; **имена функций/ролей сверить с существующими миграциями, не копировать вслепую**:

```sql
-- project_baselines: зафиксированный слепок сроков проекта (план) для план/факт-сравнения.
create table public.project_baselines (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  project_id  uuid not null references public.projects(id)      on delete cascade,
  name        text not null check (char_length(trim(name)) between 1 and 120),
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table public.baseline_tasks (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  baseline_id  uuid not null references public.project_baselines(id) on delete cascade,
  task_id      uuid not null references public.tasks(id) on delete cascade,
  start_date   date,
  end_date     date,
  is_milestone boolean not null default false,
  unique (baseline_id, task_id)
);

-- org_id: проставляется триггером и замораживается (конвенция 054)
create trigger set_org_id_project_baselines before insert on public.project_baselines
  for each row execute function public.set_org_id();
create trigger freeze_org_id_project_baselines before update on public.project_baselines
  for each row execute function public.freeze_org_id();
-- то же для baseline_tasks

alter table public.project_baselines enable row level security;
alter table public.baseline_tasks    enable row level security;

-- индексы под RLS и под чтение (конвенция: org_id первым конъюнктом)
create index on public.project_baselines (org_id, project_id) where deleted_at is null;
create index on public.baseline_tasks    (baseline_id);
create index on public.baseline_tasks    (org_id, task_id);
```

Политики — org-граница первым конъюнктом, роль через initplan-обёртку:

```sql
create policy project_baselines_select on public.project_baselines for select to authenticated
  using (org_id = ( select public.current_org_id() ) and deleted_at is null);

create policy project_baselines_insert on public.project_baselines for insert to authenticated
  with check (org_id = ( select public.current_org_id() )
              and ( select public.current_org_role() ) in ('owner','admin','manager'));

-- «удаление» = UPDATE deleted_at, только owner/admin
create policy project_baselines_update on public.project_baselines for update to authenticated
  using (org_id = ( select public.current_org_id() )
         and ( select public.current_org_role() ) in ('owner','admin'));

create policy baseline_tasks_select on public.baseline_tasks for select to authenticated
  using (org_id = ( select public.current_org_id() ));
-- INSERT в baseline_tasks клиенту НЕ даём: слепок пишет только RPC (SECURITY DEFINER)

revoke all on public.project_baselines, public.baseline_tasks from anon;   -- конвенция 056
```

RPC — атомарный слепок одним стейтментом (клиент не должен собирать N инсертов):

```sql
create or replace function public.create_project_baseline(p_project_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  -- императивный гард, NULL-safe: доступ к проекту и роль
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

  insert into public.baseline_tasks (baseline_id, task_id, start_date, end_date, is_milestone)
  select v_id, t.id, t.start_date, t.end_date, coalesce(t.is_milestone, false)
  from public.tasks t
  where t.project_id = p_project_id
    and t.deleted_at is null                    -- сверить имя колонки по схеме tasks!
    and (t.start_date is not null or t.end_date is not null);

  return v_id;
end $$;

revoke all on function public.create_project_baseline(uuid, text) from public, anon;
grant execute on function public.create_project_baseline(uuid, text) to authenticated;
```

> `org_id` в обеих вставках проставит триггер `set_org_id()` — руками не передаём.
> Если у `tasks` нет `deleted_at` — убрать условие (проверить по схеме, не по памяти).

## ЗАДАЧА 2: типы и хуки

- `npm run db:gen-types` **после** применения миграции гейтом — до этого типы не трогать.
- `src/lib/hooks/use-project-baselines.ts`:
  - `useProjectBaselines(projectId)` — список (id, name, created_at), сорт по `created_at desc`;
  - `useBaselineTasks(baselineId | null)` — `enabled: !!baselineId`, отдаёт `Map<task_id, {start,end}>`;
  - `useCreateBaseline(projectId)` — `supabase.rpc('create_project_baseline', {...})`,
    инвалидация списка, свой тост на `42501` (паттерн `parseDependencyError`);
  - `useDeleteBaseline` — UPDATE `deleted_at = now()`, оптимистик по 5-шаговой конвенции.

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
JWT → `get_advisors` (ожидание: 0 новых警 — RLS включена на обеих таблицах, функция с
`search_path`, ACL адресный).

Ручной смоук:

1. owner: «Зафиксировать план» → слепок создан, число строк в `baseline_tasks` = число датированных
   задач проекта.
2. Сдвинуть задачу → выбрать слепок → ghost-бар на старом месте, подсказка показывает `+N дн`.
3. Задача создана после слепка → ghost нет, маркер «вне плана».
4. viewer: кнопки «Зафиксировать» нет; RPC напрямую → `42501`.
5. manager: создаёт слепок, удалить не может (RLS deny, UI откатывает).
6. Чужая org: слепки не видны (RLS-изоляция, проверить симуляцией).
7. Проект без дат → слепок пустой, UI не падает.
8. Темы aura + fuji: ghost различим и не спорит с крит-путём.

## КОММИТ

```bash
git add supabase/migrations/0NN_project_baselines.sql \
        src/lib/hooks/use-project-baselines.ts src/components/tasks/
git commit -m "feat(gantt): базовый план проекта — слепок сроков и ghost-бары план/факт

- миграция 0NN: project_baselines + baseline_tasks (org_id + set_org_id/freeze_org_id,
  RLS org-первым-конъюнктом, initplan current_org_role, revoke anon, индексы)
- RPC create_project_baseline (SECURITY DEFINER, search_path public/pg_temp, адресный GRANT):
  атомарный слепок одним INSERT..SELECT; клиенту INSERT в baseline_tasks не выдан
- слепок иммутабелен: UPDATE-политики нет, переснять = новый baseline; soft delete на заголовке
- хуки use-project-baselines (список / строки / create / soft delete, оптимистик)
- UI: «Зафиксировать план», селект слепка, ghost-бар со сдвигом +N дн в подсказке

Миграция НЕ применена — апплаит гейт."
```

## Verification Labels

```
Type Safety:            NOT_VERIFIED (типы генерятся ПОСЛЕ apply; до этого — WARNING по построению)
RLS Coverage:           PASS by design (RLS на обеих таблицах, org первым конъюнктом,
                        INSERT в baseline_tasks только через SECURITY DEFINER RPC,
                        anon revoked) — подтверждается гейтом через get_advisors
Backward Compatibility: PASS (аддитивно: две новые таблицы, ни одной правки существующих)
Runtime Tested:         NOT_VERIFIED (миграция не применена из CC — это контракт процесса)
```

Трудоёмкость: ~10–14 ч (миграция+RPC ~3, гейт ~1, хуки ~2, UI ghost+селект ~4, смоук ролями ~2).
Риск: средний — первая миграция волны, но полностью аддитивная.

## Долги

- Несколько слепков одновременно (сравнение «план v1 vs v2») — v1 показывает один.
- Variance-колонки в списке задач и экспорт отклонений — после PNG-экспорта из POLISH.
- Автослепок при переводе проекта в статус «в работе» — если появится запрос.

---

## Процесс

CC пишет + коммитит (миграцию **не применяет**) → Cowork-гейт: ревью SQL → `apply_migration` →
`db:gen-types` → `get_advisors` → мёрж → мой прод-смоук по ролям.
