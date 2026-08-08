# Claude Code Prompt — S-TL-1: лента сущности переезжает на сервер

Ось 2 роадмапа («Единая лента событий»). Лента **уже существует** и работает на трёх
карточках — этот спринт не строит её заново, а переносит сборку из шести клиентских
запросов в одну SQL-функцию. Состав и вид ленты обязаны остаться прежними.

**Ветка:** `feat/entity-timeline` от свежего `main` (`16d10a8`).
**Миграция:** `112_entity_timeline.sql` — написать и закоммитить, **не применять**.

---

## Прочитать до начала — три вещи, на которых легко ошибиться

**1. Критерий приёмки — построчное совпадение с эталоном, а не «работает».**
До спринта лента собирается в `use-entity-timeline.ts` шестью запросами. После спринта —
одним RPC. Если хоть одно событие пропало, добавилось или сдвинулось в порядке — спринт
не сделан. Эталон снимается ДО правок (задача 0) и сверяется ПОСЛЕ (задача 5).

**2. Лимит остаётся на источник, а не на ленту.**
Сейчас `PER_SOURCE_LIMIT = 50` применяется к каждому из шести источников независимо,
и лента — это их слияние. Соблазн сделать «честные последние 50 событий» здесь надо
подавить: он немедленно ломает критерий из п. 1. Глобальный keyset-курсор вводится
в S-TL-2 вместе с прокруткой «раньше» — там смена состава будет намеренной и заметной.

**3. Заголовки остаются в TypeScript.**
`describeEvent()` (258 строк), `presetTitle()`, адаптеры в `lib/timeline/adapters.ts` —
не трогать и в SQL не переносить. Функция отдаёт факты (`kind` + `payload` + `ref`),
текст собирает клиент. Это то, что делает п. 1 достижимым: слой представления не меняется.

---

## Жёсткие рамки

- Ровно **одна** миграция — `supabase/migrations/112_entity_timeline.sql`.
  Номер сверен запросом к `supabase_migrations.schema_migrations` (последняя —
  `20260808191356 capture_inn_duplicate`).
- **Миграцию не применять.** Ни `apply_migration`, ни `execute_sql` с DDL. Применяет
  гейт Cowork.
- `src/types/database.ts` и `src/types/supabase.gen.ts` руками не править. Реген —
  задача гейта после apply. До этого RPC в сгенерированных типах нет, и хук обязан
  жить без него (см. задачу 3).
- `EntityTimeline.tsx`, `adapters.ts`, `activity-events.ts`, `open-event.ts`,
  `ai-run-merge.ts` — **не трогать**. Меняется только `use-entity-timeline.ts`
  и добавляется один новый файл.
- `any` запрещён. Строка RPC приходит как `unknown` и сужается type guard'ом.
- Новых источников в ленте не появляется. `stage_transitions`, `messages`, `quotes`,
  `project_files` — это S-TL-2, не сейчас.

---

## РАЗВЕДКА

```bash
cd ~/Downloads/dashboard-crm
git checkout main && git pull && git status --short
git checkout -b feat/entity-timeline

# 1. Убедиться, что эталон — там, где ожидается
wc -l src/lib/hooks/use-entity-timeline.ts src/types/timeline.ts \
      src/lib/timeline/adapters.ts src/lib/timeline/ai-run-sources.ts

# 2. Кто потребитель ленты и с какими опциями
grep -rn -A 8 "<EntityTimeline" src/components/projects/ProjectDetail.tsx \
  src/components/companies/CompanyDetail.tsx src/components/contacts/ContactDetailHub.tsx

# 3. Номер следующей миграции — из ledger, НЕ из ls папки
ls supabase/migrations/ | tail -5

# 4. Значение, которое лента исключает из activity_log
grep -n "TRANSITION_METRIC_EVENT" src/lib/domain/stage-transition.ts

# 5. Куда кладутся тесты
ls tests/unit/ | head; grep -n "include" vitest.config.ts
```

Ожидается: 298/42/119/103 строк; `includeSystem: true` во всех трёх карточках;
последняя миграция в папке — `111_capture_inn_duplicate.sql`;
`TRANSITION_METRIC_EVENT = 'stage_transition_committed'`; тесты в `tests/unit/*.test.ts`.

---

## ЗАДАЧА 0: снять эталон ДО правок

Без этого шага задача 5 невыполнима — сравнивать будет не с чем.

```bash
npm run dev
```

Открыть три карточки и для каждой сохранить снимок ленты в
`_analysis/tl-baseline.md` — по одной строке на событие, в порядке отображения:

```
### project <uuid>
1. Звонок выполнен | 2026-08-05 | call
2. Задача: … | 2026-08-04 | task
…
```

Взять сделку с наибольшим числом событий (не пустую), компанию с несколькими сделками
и контакт со звонками. `_analysis/tl-baseline.md` — временный файл, удаляется
в задаче 5 перед коммитом.

---

## ЗАДАЧА 1: миграция `112_entity_timeline.sql`

Создать `supabase/migrations/112_entity_timeline.sql`.

### 1.1 Индексы под ветки union

Каждая ветка функции — `where <фильтр> order by <ts> desc limit N`. Без составного
индекса `(фильтр, ts desc)` Postgres соберёт всю выборку и отрежет в конце.

```sql
-- activity_log: по project_id составной уже есть, по contact/company — partial БЕЗ даты
create index if not exists idx_activity_log_contact_created
  on public.activity_log (contact_id, created_at desc) where contact_id is not null;
create index if not exists idx_activity_log_company_created
  on public.activity_log (company_id, created_at desc) where company_id is not null;

-- calls / meetings: сейчас (project_id) и (date desc) РАЗДЕЛЬНО — для ветки бесполезны
create index if not exists idx_calls_project_date on public.calls (project_id, date desc);
create index if not exists idx_calls_company_date on public.calls (company_id, date desc);
create index if not exists idx_calls_contact_date on public.calls (contact_id, date desc);

create index if not exists idx_meetings_project_date on public.meetings (project_id, date desc);
create index if not exists idx_meetings_company_date on public.meetings (company_id, date desc);
create index if not exists idx_meetings_contact_date on public.meetings (contact_id, date desc);

-- tasks: (project_id) есть, даты в нём нет
create index if not exists idx_tasks_project_created on public.tasks (project_id, created_at desc);
create index if not exists idx_tasks_company_created on public.tasks (company_id, created_at desc);
create index if not exists idx_tasks_contact_created on public.tasks (contact_id, created_at desc);

-- projects: источник «Сделки» в ленте компании/контакта
create index if not exists idx_projects_company_created on public.projects (company_id, created_at desc);
create index if not exists idx_projects_contact_created on public.projects (contact_id, created_at desc);
```

Все 13 аддитивны, `concurrently` не нужен: самая большая таблица — `tasks`, 654 строки.

### 1.2 Функция

```sql
-- ═══════════════════════════════════════════════════════════════
-- entity_timeline — серверная сборка ленты сущности (S-TL-1, ось 2).
--
-- Источники — РОВНО те шесть, что читал клиентский хук до этого спринта:
-- calls, meetings, tasks, projects, activity_log, ai_runs.
--
-- SECURITY INVOKER — ОСОЗНАННОЕ отклонение от конвенции проекта (DEFINER +
-- адресный ACL). Причина: у источников НЕОДНОРОДНЫЕ предикаты SELECT —
--   tasks           → assigned_to / created_by / is_project_member
--   messages        → is_conversation_member  (в S-TL-2)
--   project_files   → is_project_member       (в S-TL-2)
--   webhook_deliveries → owner|admin          (в S-TL-2)
--   ai_runs         → существование родителя по entity_type
-- DEFINER обошёл бы RLS, и все эти предикаты пришлось бы повторить внутри
-- функции и держать синхронными вечно. Первое расхождение было бы МОЛЧАЛИВЫМ:
-- лента просто показала бы лишнее. INVOKER делает дрейф невозможным.
-- search_path фиксируется в любом случае — это отдельное требование.
--
-- Лимит — НА ИСТОЧНИК (как в клиентском PER_SOURCE_LIMIT = 50), не на ленту.
-- Глобальный keyset-курсор — S-TL-2, вместе с прокруткой «раньше».
--
-- Заголовков здесь нет намеренно: функция отдаёт факты, текст собирает TS
-- (describeEvent / presetTitle / adapters). Слой представления в БД не живёт.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.entity_timeline(
  p_entity_type text,
  p_entity_id   uuid,
  p_limit       int default 50
)
returns table (
  ts        timestamptz,
  id        text,
  source    text,
  kind      text,
  actor_id  uuid,
  ref_type  text,
  ref_id    uuid,
  payload   jsonb
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
with n as (
  -- потолок 200: p_limit приходит от клиента, `limit 100000` не должен быть выразим
  select least(greatest(coalesce(p_limit, 50), 1), 200) as v
),

-- проекты сущности — транзитивная привязка activity_log (только company/contact)
scope_projects as (
  select p.id from projects p
  where (p_entity_type = 'company' and p.company_id = p_entity_id)
     or (p_entity_type = 'contact' and p.contact_id = p_entity_id)
),

-- звонки и встречи сущности — «дети» для ai_runs. UUID уникальны между таблицами,
-- поэтому разделять источники не нужно (тот же приём, что в ai-run-sources.ts).
scope_children as (
  select c.id from calls c
   where (p_entity_type = 'project' and c.project_id = p_entity_id)
      or (p_entity_type = 'company' and c.company_id = p_entity_id)
      or (p_entity_type = 'contact' and c.contact_id = p_entity_id)
  union all
  select m.id from meetings m
   where (p_entity_type = 'project' and m.project_id = p_entity_id)
      or (p_entity_type = 'company' and m.company_id = p_entity_id)
      or (p_entity_type = 'contact' and m.contact_id = p_entity_id)
),

src_calls as (
  select c.date as ts,
         'call:' || c.id::text as id,
         'calls' as source, 'call' as kind,
         c.created_by as actor_id,
         'call' as ref_type, c.id as ref_id,
         jsonb_build_object(
           'status', c.status, 'next_step', c.next_step, 'agreements', c.agreements
         ) as payload
  from calls c
  where (p_entity_type = 'project' and c.project_id = p_entity_id)
     or (p_entity_type = 'company' and c.company_id = p_entity_id)
     or (p_entity_type = 'contact' and c.contact_id = p_entity_id)
  order by c.date desc
  limit (select v from n)
),

src_meetings as (
  -- ⚠ meetings.date — тип `date`, не timestamptz. Приведение `::timestamptz` берёт
  -- TimeZone СЕССИИ и на MSK-подключении сдвинет встречу на сутки назад относительно
  -- клиента, который делает new Date('2026-08-05') = полночь UTC. Тот же класс, что
  -- ключ идемпотентности из timestamptz в learnings.md. Фиксируем UTC явно.
  select (m.date::timestamp at time zone 'UTC') as ts,
         'meeting:' || m.id::text as id,
         'meetings' as source, 'meeting' as kind,
         m.created_by as actor_id,
         'meeting' as ref_type, m.id as ref_id,
         jsonb_build_object(
           'title', m.title, 'next_step', m.next_step, 'notes', m.notes
         ) as payload
  from meetings m
  where (p_entity_type = 'project' and m.project_id = p_entity_id)
     or (p_entity_type = 'company' and m.company_id = p_entity_id)
     or (p_entity_type = 'contact' and m.contact_id = p_entity_id)
  order by m.date desc
  limit (select v from n)
),

src_tasks as (
  -- ⚠ У задачи ДВЕ разные даты: отбор идёт по created_at (как в fetchTasks),
  -- а датой события служит deadline, если он есть (taskToEvent: date = deadline
  -- ?? created_at). Перепутать = получить другой состав ленты. Отсюда подзапрос:
  -- сначала топ-N по created_at, потом переоценка ts.
  select coalesce(t.deadline, t.created_at) as ts,
         'task:' || t.id::text as id,
         'tasks' as source, 'task' as kind,
         t.created_by as actor_id,
         'task' as ref_type, t.id as ref_id,
         jsonb_build_object(
           'text', t.text, 'lane', t.lane,
           'deadline', t.deadline, 'created_at', t.created_at
         ) as payload
  from (
    select t2.id, t2.text, t2.lane, t2.deadline, t2.created_at, t2.created_by
    from tasks t2
    where (p_entity_type = 'project' and t2.project_id = p_entity_id)
       or (p_entity_type = 'company' and t2.company_id = p_entity_id)
       or (p_entity_type = 'contact' and t2.contact_id = p_entity_id)
    order by t2.created_at desc
    limit (select v from n)
  ) t
),

src_projects as (
  -- на карточке самой сделки источник выключен (projectsEnabled в хуке)
  select p.created_at as ts,
         'project:' || p.id::text as id,
         'projects' as source, 'project' as kind,
         p.created_by as actor_id,
         'project' as ref_type, p.id as ref_id,
         jsonb_build_object('name', p.name, 'type', p.type) as payload
  from projects p
  where (p_entity_type = 'company' and p.company_id = p_entity_id)
     or (p_entity_type = 'contact' and p.contact_id = p_entity_id)
  order by p.created_at desc
  limit (select v from n)
),

src_activity as (
  select a.created_at as ts,
         'activity:' || a.id::text as id,
         'activity_log' as source, 'activity' as kind,
         a.user_id as actor_id,
         null::text as ref_type, null::uuid as ref_id,
         -- payload источника кладём ВНУТРЬ, рядом с event_type: describeEvent()
         -- принимает ActivityLog целиком и читает оба поля.
         jsonb_build_object('event_type', a.event_type, 'payload', a.payload) as payload
  from (
    -- прямая привязка
    ( select al.id, al.event_type, al.payload, al.created_at, al.user_id
      from activity_log al
      where al.event_type <> 'stage_transition_committed'
        and ( (p_entity_type = 'project' and al.project_id = p_entity_id)
           or (p_entity_type = 'company' and al.company_id = p_entity_id)
           or (p_entity_type = 'contact' and al.contact_id = p_entity_id) )
      order by al.created_at desc
      limit (select v from n) )
    union   -- не `union all`: дедуп по строке, как Map<id> в fetchActivity
    -- транзитивная: записи по проектам сущности (для project не нужна — она уже прямая)
    ( select al.id, al.event_type, al.payload, al.created_at, al.user_id
      from activity_log al
      where p_entity_type <> 'project'
        and al.event_type <> 'stage_transition_committed'
        and al.project_id in (select id from scope_projects)
      order by al.created_at desc
      limit (select v from n) )
  ) a
),

src_ai as (
  -- actor_id намеренно null: клиентский эталон его не проставляет. Заполнение из
  -- ai_runs.created_by — улучшение, но оно сломало бы построчное совпадение. S-TL-2.
  select r.created_at as ts,
         'ai_run:' || r.id::text as id,
         'ai_runs' as source, 'ai_run' as kind,
         null::uuid as actor_id,
         'ai_run' as ref_type, r.id as ref_id,
         jsonb_build_object(
           'preset_key', r.preset_key, 'entity_type', r.entity_type, 'status', r.status
         ) as payload
  from (
    select u.id, u.preset_key, u.entity_type, u.status, u.created_at
    from (
      -- по звонкам и встречам сущности. In-список здесь СЕРВЕРНЫЙ — это снимает
      -- остаток S-DEBT-TRUTH-1: на клиенте он ехал в URL и мог упереться в его длину.
      ( select ar.id, ar.preset_key, ar.entity_type, ar.status, ar.created_at
        from ai_runs ar
        where ar.entity_id in (select id from scope_children)
        order by ar.created_at desc
        limit (select v from n) )
      union
      -- по самой сущности: бриф компании, read-only пресеты сделки.
      -- У контакта своих прогонов не бывает (ai_runs.entity_type ∈ call|meeting|project|company).
      ( select ar.id, ar.preset_key, ar.entity_type, ar.status, ar.created_at
        from ai_runs ar
        where p_entity_type <> 'contact'
          and ar.entity_type = p_entity_type
          and ar.entity_id = p_entity_id
        order by ar.created_at desc
        limit (select v from n) )
    ) u
    order by u.created_at desc
    limit (select v from n)   -- лимит ПОСЛЕ слияния, как в mergeAiRunRows
  ) r
)

select * from (
  select * from src_calls
  union all select * from src_meetings
  union all select * from src_tasks
  union all select * from src_projects
  union all select * from src_activity
  union all select * from src_ai
) all_src
order by ts desc;
$$;

comment on function public.entity_timeline(text, uuid, int) is
  'S-TL-1: лента событий сущности (project|company|contact). SECURITY INVOKER — '
  'видимость наследуется от RLS источников, см. шапку миграции. Лимит на источник, '
  'не на ленту. Заголовки собирает клиент.';

revoke all on function public.entity_timeline(text, uuid, int) from public, anon;
grant execute on function public.entity_timeline(text, uuid, int) to authenticated;
```

**Значение `p_entity_type` вне трёх допустимых даёт пустую ленту, а не ошибку.**
Это осознанно: RPC зовётся из типизированного клиента, мусор туда не приходит, а
`raise` в `language sql` недоступен без обёртки на plpgsql, которая стоит дороже пользы.

### 1.3 `docs/schema.md`

Добавить раздел в том же PR (правило проекта). Статус — **`НАПИСАНА, НЕ ПРИМЕНЕНА`**:
версию и `applied` проставит гейт после `apply_migration`, спринт её знать не может.

---

## ЗАДАЧА 2: адаптер строки RPC → `TimelineEvent`

Новый файл `src/lib/timeline/rpc-adapter.ts`. Чистая функция, без Supabase — по образцу
`ai-run-merge.ts`, чтобы тесты не тянули браузерный клиент.

Что делает: сужает `unknown` до строки RPC, восстанавливает форму, которую ждут
**существующие** адаптеры, и зовёт их. Ни одного нового заголовка здесь не появляется.

```ts
// Строка RPC. Тип локальный: в supabase.gen.ts функции ещё нет — реген делает гейт
// после apply. Появится в Database['public']['Functions'] — тогда и заменим на него.
export interface TimelineRpcRow {
  ts: string;
  id: string;
  source: string;
  kind: string;
  actor_id: string | null;
  ref_type: string | null;
  ref_id: string | null;
  payload: Record<string, unknown> | null;
}

export function isTimelineRpcRow(v: unknown): v is TimelineRpcRow { … }

export function rpcRowToEvent(row: TimelineRpcRow, now?: number): TimelineEvent { … }
```

Маппинг `kind` → существующий адаптер:

| `kind` | Собирается | Из payload |
|---|---|---|
| `call` | `callToEvent` | `status`, `next_step`, `agreements` + `id`/`date` из строки |
| `meeting` | `meetingToEvent` | `title`, `next_step`, `notes` |
| `task` | `taskToEvent(row, now)` | `text`, `lane`, `deadline`, `created_at` |
| `project` | `projectToEvent` | `name`, `type` |
| `activity` | `describeEvent({event_type, payload})` + `eventType` | `event_type`, `payload` |
| `ai_run` | `` `AI: ${presetTitle(preset_key)}` `` | `preset_key` |

`taskToEvent` принимает `now` параметром (чистота) — прокинуть, дефолт `Date.now()`.
`overdue` по-прежнему считается на клиенте: это функция текущего времени, в БД ей не место.

---

## ЗАДАЧА 3: переписать `use-entity-timeline.ts`

Шесть `useQuery` → один. Публичная сигнатура хука **не меняется**:

```ts
export function useEntityTimeline(
  entityType: TimelineEntityType,
  entityId: string | null | undefined,
  opts: UseEntityTimelineOptions = {},
): { events: TimelineEvent[]; isLoading: boolean }
```

Что удаляется: `fetchCalls`, `fetchMeetings`, `fetchTasks`, `fetchProjects`,
`fetchActivity`, `fetchAiRuns`, `resolveProjectIds`, `activityToEvent`, `FILTER_COLUMN`,
`ActivityRow`. Импорты `adapters` и `ai-run-sources` уходят из этого файла
(`ai-run-sources.ts` **остаётся** — у него второй потребитель, сводный AI-блок компании).

Что остаётся: `useActorMap()` и резолв `actorId → actorName` на сборке, сортировка
не нужна — RPC уже отдал по убыванию `ts`.

```ts
const { data, error } = await supabase.rpc('entity_timeline', {
  p_entity_type: entityType,
  p_entity_id: entityId,
  p_limit: PER_SOURCE_LIMIT,
});
if (error) throw error;
const rows = (data ?? []) as unknown[];
return rows.filter(isTimelineRpcRow).map((r) => rpcRowToEvent(r, now));
```

**`includeSystem` остаётся в сигнатуре, но теряет смысл**: RPC отдаёт все шесть
источников всегда, а все три потребителя передают `true`. Флаг **не удалять** —
это меняло бы публичный контракт трёх компонентов сверх задачи. Пометить
`@deprecated` с указанием, что снимается в S-TL-2 вместе с чипами фильтра.

`queryKey`: `['timeline', entityType, entityId]`. Прежние ключи вида
`['timeline', 'call', …]` исчезают — **проверить инвалидацию**:

```bash
grep -rn "'timeline'" src/lib/hooks/ src/components/
```

Хуки, инвалидирующие `['timeline']` префиксом (`use-activity-log`, `use-calls`,
`use-meetings`), продолжат работать. Точечные инвалидации по подключу — найти и поправить.

---

## ЗАДАЧА 4: тесты

`tests/unit/timeline-rpc-adapter.test.ts`. Только чистая функция, без Supabase.

Обязательные кейсы:

1. `call` со `status='done'` → `title = 'Звонок выполнен'`, `status='done'`,
   `detail = next_step`, `id = 'call:<uuid>'`
2. `meeting` с `title` → `'Встреча: …'`; без `title` → `'Встреча'`
3. `task` с `deadline` в прошлом и `lane != 'done'` → `status='overdue'` (передать
   фиксированный `now`, не `Date.now()`)
4. `task` без `deadline` → `date = created_at`, `detail` отсутствует
5. `project` с `type='internal'` → `'Проект: …'`; иначе `'Сделка: …'`
6. `activity` с `event_type='stage_change'` → заголовок от `describeEvent`,
   `eventType` проставлен
7. `ai_run` → `'AI: <человеческое имя пресета>'`, не машинный ключ
8. `isTimelineRpcRow` отсекает мусор: `null`, `{}`, строку, объект без `ts`

```bash
npm test
```

Ожидается 1064 + 8 = **1072 теста**, ноль падений.

---

## ЗАДАЧА 5: сверка с эталоном

⚠️ **Миграция не применена — RPC в базе нет.** Прямая проверка в UI на этом шаге
невозможна, и это нормально: сверку выполняет гейт после apply. Задача CC — подготовить
её так, чтобы она заняла минуты.

Что сделать:

```bash
npx tsc --noEmit          # чисто
npm run lint              # 49 находок, ровно как на чистом main (15 err / 34 warn)
npm test                  # 1072, ноль падений
npm run build             # ПОСЛЕДНИМ: билд при живом next dev убивает dev-сервер
```

Дописать в `_analysis/sprint-S-TL-1.md` раздел **«Сверка на гейте»** с готовыми шагами:

1. `apply_migration` 112 → `gen-types` → `get_advisors` (сравнить набор WARN
   с прежним; 20 WARN `authenticated_security_definer_function_executable` — baseline,
   новая функция INVOKER их не пополняет)
2. Открыть три карточки из `_analysis/tl-baseline.md`, сверить построчно
3. Ролевой смок: один `project_id` под `owner` / `admin` / `manager` / `viewer` —
   длина ленты и состав `source`. Ожидание: `viewer` и `manager` видят меньше
   `task`-событий (RLS `tasks`), остальные источники совпадают
4. `EXPLAIN (analyze, buffers)` на `entity_timeline('project', <uuid>, 50)` —
   убедиться, что ветки идут `Index Scan`, а не `Seq Scan`. При `Seq Scan` смотреть,
   выбрал ли планировщик generic plan (тогда предикат с тремя `or` не свернулся)

Удалить `_analysis/tl-baseline.md` перед коммитом — снимок эталона временный,
в репозитории ему не место. Содержимое перенести в раздел «Сверка на гейте».

---

## КОММИТ

```bash
git add .
git commit -m "S-TL-1: лента сущности собирается на сервере (entity_timeline, миграция 112)

Шесть клиентских запросов заменены одной SQL-функцией. Состав и порядок ленты
не меняются — критерий приёмки построчное совпадение с эталоном до правок.
SECURITY INVOKER вместо конвенционного DEFINER: у источников неоднородные
предикаты SELECT, повторять их внутри функции значит завести молчаливый дрейф.
Лимит остаётся на источник; глобальный keyset-курсор — S-TL-2.
Миграция написана и НЕ применена."
```

Пуш не делать — мерж и пуш у Олега.

---

## Сверка на гейте (заполнено Claude Code, S-TL-1)

Миграция 112 написана и **не применена** — RPC в базе нет, поэтому в UI лента сейчас
пуста (запрос падает на несуществующей функции). Так и задумано: сверку выполняет гейт
после apply. Ниже — всё, что нужно, чтобы она заняла минуты.

### Шаг 1 — применить и проверить окружение

1. `apply_migration` `112_entity_timeline.sql` → `gen-types` → `get_advisors`.
2. Реген типов нужен **только ради сигнатуры функции** (`Database['public']['Functions']`):
   таблиц, колонок и enum миграция не трогает. После регена в `rpc-adapter.ts` можно
   заменить локальный `TimelineRpcRow` на `Returns[number]`, а в `use-entity-timeline.ts`
   снять каст `UntypedRpc` — оба места помечены комментарием. Это **не обязательно** для
   приёмки: код работает и до регена.
3. Advisors: набор WARN обязан совпасть с прежним. 20 WARN
   `authenticated_security_definer_function_executable` — baseline проекта; новая функция
   `SECURITY INVOKER` и пополнить их не может по построению. Появление 21-го WARN
   означает, что кто-то поменял `security invoker` на `definer`.

### Шаг 2 — построчная сверка с эталоном

Эталон снят **до правок** из живого UI (сессия владельца org, 2026-08-08). Снимался не
глазами: у каждой строки `<EntityTimeline>` React-ключ равен `TimelineEvent.id`, то есть
`kind:uuid`, и скрипт собирал ключи из контейнера `.max-h-[560px]` в порядке отображения.
Идентичность события фиксируется **по id строки-источника**, а не по заголовку — это
строже (заголовок детерминирован строкой, а адаптеры спринт не трогал) и не плывёт со
временем, в отличие от относительной даты. uuid сокращён до первых 8 символов.

**Все пять списков ниже уже сверены** прогоном тела функции как обычного `SELECT`
(read-only, до apply, с подстановкой параметров литералами) — совпадение построчное,
100/77/77/3/4. На гейте это нужно повторить **через UI**, чтобы проверить ещё и
клиентскую половину (`rpc-adapter.ts` → адаптеры → рендер).

#### 2.1 project `562c6104-e734-4a74-93d1-8a1c37f9476c` — «Стратек — внедрение»

Всего **100**: `{activity: 50, task: 50}`. Группы: «Этот месяц» (1–2), «Ранее» (3–100).
Источник `projects` выключен (это сама сущность), `calls`/`meetings`/`ai_runs` пусты.
Оба источника упёрлись в `PER_SOURCE_LIMIT = 50` ⇒ карточка проверяет и лимит.

```
1.activity:583d149d 2.activity:5d20fb45 3.activity:61557857 4.task:cf813024
5.activity:dce7a62c 6.task:a6a598ba 7.activity:09aa6e71 8.task:4de1f588
9.activity:2fa8a600 10.task:9485cf30 11.task:159bd7f9 12.activity:51fd0fb1
13.activity:6bb1544b 14.task:7c3c1b70 15.task:3fad0d0e 16.activity:01621c1f
17.task:c1570551 18.activity:78701e24 19.activity:7e3333f1 20.task:0d5a1317
21.activity:1a9c32ad 22.task:75320d71 23.activity:7e2a184d 24.task:f61eeaed
25.activity:b1f48d54 26.task:f03fb09d 27.task:aba8f98e 28.activity:1c5cfe55
29.activity:85734bb3 30.task:7423fdb7 31.activity:61add789 32.task:836baec7
33.activity:41d5f581 34.task:f45058e3 35.task:7477c8f7 36.activity:c62f4157
37.activity:99c260b7 38.task:87aeee26 39.activity:85355d32 40.task:f0a1ab29
41.task:af161397 42.activity:dce90bfd 43.task:90593df8 44.activity:23de305c
45.activity:3e0b17b8 46.task:44c909ab 47.task:60202818 48.activity:f5c3101b
49.task:ba1f737c 50.activity:2acf1d56 51.task:8516feac 52.activity:4d976d27
53.task:e60efaf3 54.activity:90e4cb59 55.task:aa7c7fe6 56.activity:3627235c
57.activity:66026a7c 58.task:125a532b 59.task:60911f3c 60.activity:f49d979a
61.activity:29f35aad 62.task:55fd2156 63.task:14cb0346 64.activity:f92a1ceb
65.task:1dd1a0b7 66.activity:a36c7d32 67.activity:aecc3f83 68.task:e08b47e4
69.task:576cc819 70.activity:4bf6d506 71.task:755465fc 72.activity:e435ebb4
73.task:cd48253f 74.activity:9474f7d9 75.task:8ab890c0 76.activity:518a12af
77.activity:1fcc5e90 78.task:af7e91d6 79.activity:37babdb6 80.task:bbca8f91
81.activity:6b70688c 82.task:c9749cf2 83.activity:d590ff63 84.task:0a5f3921
85.task:857d3bbe 86.activity:cf35603d 87.activity:52ae77f2 88.task:e04422ed
89.task:a482345b 90.activity:853cf887 91.task:9b55e728 92.activity:93ce8bb3
93.task:a5f6dd26 94.activity:c347ddc1 95.task:1dd9da38 96.activity:2d33176f
97.task:2ce46230 98.activity:b7ebc2ae 99.task:5f5a4511 100.task:4837921e
```

Первые строки для глазной сверки:

```
1. activity:583d149d | 1 авг. • Олег  | Выполнено: Разработка отчёта о моделировании (…)
2. activity:5d20fb45 | 1 авг. • Олег  | Выполнено: Приёмка отчёта о моделировании заказчиком
3. activity:61557857 | 24 июл. • Олег | Выполнено: Проектирование и разработка (предварительная оценка)
4. task:cf813024     | 24 июл. • Олег | Задача: Проектирование и разработка (предварительная оценка)
```

⚠️ **Позиции 35/36, 53/54, 75/76 — контрольные.** Именно они разъезжались до правки
сортировки (см. «Что нашлось сверх задания» ниже). Если после apply там `activity`
раньше `task` — сортировка функции не та, что в файле.

#### 2.2 company `774b8951-f2a8-42e2-86b9-2ce75e8d90e7` — «АО АГРАРНАЯ ГРУППА МП»

Всего **77**: `{task: 41, activity: 33, call: 1, project: 2}`. Группа одна — «Ранее».
`activity` здесь **только транзитивная**: в базе `activity_log.company_id` и `.contact_id`
заполнены у **нуля** строк из 809, прямая ветка компании/контакта пуста всегда.
⚠️ Чип фильтра ленты на этой карточке сохранён у пользователя как «AI» — для сверки
переключить на «Все» и вернуть обратно.

```
1.task:d089f81a 2.task:2a67a1e5 3.task:18c7f0ea 4.task:605dccda 5.activity:ea791b64
6.activity:af44261e 7.call:40bb0079 8.task:e3857e3f 9.task:ea0b1ff0 10.task:7a3c0118
11.task:a3ea9332 12.task:893590e8 13.task:09e9dca5 14.task:ee994c5f 15.task:8db5156d
16.task:889f57b5 17.task:058c745d 18.task:9435af6d 19.task:c43c6fd8 20.task:efe709b9
21.task:b6b96691 22.task:514e8f69 23.task:08383634 24.task:a9bd58a3 25.task:0b054d5e
26.task:d4d9e474 27.task:baf08bdc 28.task:592d471f 29.task:24a7098c 30.task:6984e4d1
31.task:f8c06a0f 32.task:b698e846 33.task:cabadba5 34.task:641cab39 35.task:85c48f39
36.task:33a43780 37.task:fe84a3b5 38.task:d05c201a 39.task:9af3f3e4 40.task:8215e0ab
41.task:2cf22ff4 42.task:1d5916d6 43.task:9a6de93f 44.task:e5485c13 45.activity:283de9c3
46.activity:a622bbcb 47.activity:2a3ffde3 48.activity:0c4728ee 49.activity:4f944687
50.activity:38635cd8 51.activity:734dab50 52.activity:3eddb175 53.activity:48a74cbc
54.activity:21951a62 55.activity:8e8db5eb 56.project:17ff29ad 57.activity:43edd8e5
58.activity:1b398bf0 59.activity:222d072d 60.activity:6d50ca14 61.activity:a6e31c0f
62.activity:1fa8d902 63.activity:8d431d75 64.activity:066e6f60 65.activity:1ea8b0ab
66.activity:cc4b0f1e 67.activity:4fdc481c 68.activity:66df17c5 69.activity:a590db45
70.activity:7199e52a 71.activity:688e7a88 72.activity:2f39a873 73.activity:2f2a8d5e
74.activity:24da94bd 75.activity:5a3afd1c 76.activity:da0d03fa 77.project:89f4ed00
```

#### 2.3 contact `19e95841-0c5b-47eb-8ca5-bca2db9d212b` — «Васильев Андрей Борисович»

Всего **77**, состав и порядок **совпадают со списком 2.2 позиция в позицию** — и это не
ошибка съёмки: контакт привязан к тем же двум проектам той же компании, и все шесть
источников дают тот же набор. Проверено отдельным дампом обеих страниц.
Отличие карточки: `splitUpcoming` не задан ⇒ группы «Просрочено / Этот месяц / Ранее»
(фактически всё в «Ранее» — просроченных задач у этого контакта нет).

#### 2.4 company `9ce19e28-a5ec-4ce4-9a36-a2ba4dcf2614` — «ООО ФИТНЕС ДЕСЕРТЫ» (ветка `meetings`)

Добавлено сверх задания: в трёх основных карточках встреч нет вообще, и ветка `meetings`
осталась бы непроверенной. Это **единственная встреча в базе**: `326a8882`,
`meetings.date = 2026-08-06` (тип `date`). Клиент кладёт в событие строку `'2026-08-06'`,
`new Date(...)` даёт полночь **UTC** ⇒ «2д назад». Ровно это обязана воспроизвести
SQL-ветка (`m.date::timestamp at time zone 'UTC'`), иначе встреча уедет на сутки.

```
1. [Ранее] meeting:326a8882-9fc8-40bf-8b81-75c3d0347654  | 2д назад • Олег | Встреча: Фитнес Десерты
2. [Ранее] activity:8b8425f3-590d-4cfa-8017-cd850e446a69 | 3д назад • Олег | Встреча: Фитнес Десерты
3. [Ранее] project:ea04601e-8b43-44c6-9e6c-3ca2ca71e42f  | 3д назад • Олег | Сделка: Фитнес Десерты. WMS
```

#### 2.5 company `c72a8886-ca48-4bd2-ab5a-c3245645f360` — «АО ДРУЖБА НАРОДОВ НОВА» (ветка `ai_runs`)

Тоже сверх задания — единственная карточка, где видны **оба** источника прогонов:
«Аналитическая записка» по звонку `db76b54c` (`ai_runs.entity_type='call'`) и два
«Брифа по компании» по самой компании. У `ai_run` актора нет (в строках ниже нет
«• Олег») — так в эталоне, так и должно остаться.

```
1. [Ранее] ai_run:81cd162f-6221-45f7-b359-5e909039071a | 11ч назад     | AI: Аналитическая записка
2. [Ранее] ai_run:7b0eb4ef-992e-415b-a30d-890686668823 | 4д назад      | AI: Бриф по компании
3. [Ранее] ai_run:613ca8cc-e2d8-4040-ae9f-eab9b4a57dda | 4д назад      | AI: Бриф по компании
4. [Ранее] call:db76b54c-f0bd-4106-8180-9948cf21b836   | 8 июл. • Олег | Звонок выполнен
```

### Шаг 3 — ролевой смок

Один `project_id` под `owner` / `admin` / `manager` / `viewer`: длина ленты и набор
`source`. Ожидание: `viewer` и `manager` видят **меньше** `task`-событий (`tasks` —
единственный источник ленты с ownership-предикатом в SELECT-политике), остальные
источники совпадают. Это не расхождение с эталоном, а его прямое следствие: функция
`SECURITY INVOKER`, видимость наследуется от тех же политик, что видели шесть прежних
запросов. Эталон выше снят под владельцем org.

Если у `viewer` лента совпала с владельцем **полностью** — проверять надо не ленту,
а `security invoker` в теле функции.

### Шаг 4 — планы

`EXPLAIN (analyze, buffers) select * from public.entity_timeline('project', '562c6104-e734-4a74-93d1-8a1c37f9476c', 50)`.
Ветки обязаны идти `Index Scan` по новым составным индексам, а не `Seq Scan`. При
`Seq Scan` смотреть, не выбрал ли планировщик generic plan (тогда предикат с тремя `or`
не свернулся по `p_entity_type`).

⚠️ Одно исключение известно заранее: ветка `ai_runs.entity_id in (…)` индексом **не
закрыта** — `idx_ai_runs_entity` начинается с `entity_type`, составного `(entity_id, …)`
нет, и миграция его не заводит. В таблице 21 строка, `Seq Scan` там ожидаем и безвреден;
заводить индекс есть смысл вместе с S-TL-2, где источников станет больше.

### Что нашлось сверх задания — и почему это меняло состав ленты

**Сортировки `order by ts desc` из промпта недостаточно.** Клиент сортировал ленту через
`new Date(x).getTime()`, а `getTime()` **режет timestamptz до миллисекунд** (лишние
разряды отбрасываются). У Postgres разрешение микросекундное, и события, различающиеся
на сотни микросекунд, он расставляет иначе. На эталоне 2.1 это дало **три расхождения из
ста** — пары `task`/`activity`, записанные одной транзакцией с Δ ≈ 110–570 мкс:

```
поз. 35/36  task:7477c8f7 (…26.171861+00) ↔ activity:c62f4157 (…26.171971+00)
поз. 53/54  task:e60efaf3 (…23.242261+00) ↔ activity:90e4cb59 (…23.242762+00)
поз. 75/76  task:8ab890c0 (…19.426279+00) ↔ activity:518a12af (…19.426847+00)
```

Для JS все три пары — ничья, и стабильный `Array#sort` (ES2019+) оставлял их в порядке
конкатенации источников: `tasks` идёт в массиве раньше `activity_log`. Postgres видел
разницу и менял их местами.

Поэтому ключ сортировки в функции — `date_trunc('milliseconds', ts) desc`, затем `ord`
(ранг источника, повторяющий порядок конкатенации в хуке: calls, meetings, tasks,
projects, activity_log, ai_runs), затем `seq` (позиция внутри источника в его собственном
порядке отбора; для `tasks` это `created_at desc`, а не `ts`). Обе служебные колонки живут
только внутри подзапроса — наружу уходят ровно восемь колонок контракта. Возвращаемый
`ts` **не** округляется: усечение — свойство сортировки, а не данных.

Записано в `crm-architect/references/learnings.md`.

**`includeSystem` оставлен рабочим, а не превращён в заглушку.** Промпт предполагал, что
флаг просто теряет смысл. Но молча мёртвый флаг в публичной сигнатуре — ловушка для того,
кто однажды передаст `false`; плюс неиспользуемый параметр даёт лишнее предупреждение
линта сверх baseline. Он остался фильтром на клиенте (RPC всегда отдаёт все шесть
источников) с прежним дефолтом `false`, помечен `@deprecated` и снимается в S-TL-2.
Для всех трёх живых потребителей (`includeSystem: true`) это ровно ничего не меняет.

### Проверки, прогнанные до коммита

```
npx tsc --noEmit   → чисто
npm run lint       → 49 находок (15 error / 34 warning) — как на чистом main
npm test           → 1072 теста (1064 + 8), ноль падений
npm run build      → успешно (гнался последним)
```

---

## Что НЕ входит в спринт — не делать, даже если руки тянутся

- Прокрутка «раньше», keyset-курсор, глобальный лимит — **S-TL-2**
- Новые источники (`stage_transitions`, `messages`, `quotes`, `project_files`,
  `deal_stakeholders`, `project_checklists`) — **S-TL-2**
- Дедуп смены стадии по эпохам — **S-TL-2** (сейчас источник один, дублей не видно)
- Расширение таксономии `kind`, удаление `TimelineEvent.eventType` — **S-TL-2**
- `org_timeline()` — **S-TL-3**
- `task_id` в payload `task_created` — отдельная задача, правка триггера
- Судьба мёртвой таблицы `activities` — отдельное решение
```
