-- ═══════════════════════════════════════════════════════
-- 112 — S-TL-1 (ось 2 «Единая лента событий»): лента сущности собирается на сервере.
--
-- ⚠️ НОМЕР СВЕРЕН ЗАПРОСОМ к `supabase_migrations.schema_migrations` (правило 4):
--    последняя применённая — `20260808191356 capture_inn_duplicate` (111) ⇒ 112.
--
-- ЧТО БЫЛО. `use-entity-timeline.ts` собирал ленту ШЕСТЬЮ запросами из браузера
-- (calls, meetings, tasks, projects, activity_log, ai_runs), плюс два вспомогательных
-- (проекты сущности для транзитивного `activity_log`, звонки+встречи для `ai_runs`).
-- Слияние, дедуп и сортировка — в `useMemo`.
--
-- ЧТО СТАЛО. Один RPC `entity_timeline(text, uuid, int)`. Состав, порядок и лимит
-- НЕ меняются — это критерий приёмки спринта, а не пожелание.
--
-- ⚠️ SECURITY INVOKER — ОСОЗНАННОЕ отклонение от конвенции проекта (DEFINER + адресный
-- ACL). Причина: у источников НЕОДНОРОДНЫЕ предикаты SELECT —
--   tasks              → assigned_to / created_by / is_project_member
--   ai_runs            → существование родителя по entity_type
--   messages           → is_conversation_member   (появится в S-TL-2)
--   project_files      → is_project_member        (S-TL-2)
--   webhook_deliveries → owner|admin              (S-TL-2)
-- DEFINER обошёл бы RLS, и все эти предикаты пришлось бы повторить внутри функции и
-- держать синхронными вечно. Первое расхождение было бы МОЛЧАЛИВЫМ: лента просто
-- показала бы лишнее. INVOKER делает дрейф невозможным — видимость наследуется от тех
-- же политик, что видели шесть прежних запросов, буква в букву.
-- `search_path` фиксируется в любом случае: это отдельное требование, не связанное
-- с выбором INVOKER/DEFINER.
--
-- ⚠️ ЛИМИТ — НА ИСТОЧНИК (как клиентский `PER_SOURCE_LIMIT = 50`), НЕ на ленту.
-- «Честные последние 50 событий» здесь сделали бы другой состав ленты и провалили
-- критерий приёмки. Глобальный keyset-курсор — S-TL-2, вместе с прокруткой «раньше»,
-- где смена состава будет намеренной и заметной.
--
-- ⚠️ ПОРЯДОК СОРТИРУЕТСЯ ПО МИЛЛИСЕКУНДАМ, а не по полному `ts` — и это НЕ описка.
-- Клиент сортировал ленту через `new Date(x).getTime()`, а `getTime()` режет
-- timestamptz до миллисекунд (лишние разряды ОТБРАСЫВАЮТСЯ, не округляются). У
-- Postgres разрешение микросекундное, и события, различающиеся на сотни микросекунд,
-- он расставляет иначе. На живых данных это не теория: в ленте сделки
-- «Стратек — внедрение» три пары `task`/`activity` (позиции 35/36, 53/54, 75/76)
-- разъезжались ровно так — записи одной транзакции с Δ ≈ 110–570 мкс.
-- Поэтому ключ сортировки — `date_trunc('milliseconds', ts)`, а дальше:
--   `ord` — ранг источника, повторяющий порядок конкатенации в хуке
--           (calls, meetings, tasks, projects, activity_log, ai_runs): `Array#sort`
--           в JS стабилен с ES2019, и на равных ключах побеждал источник, стоявший
--           в массиве раньше;
--   `seq` — позиция внутри источника в его собственном порядке отбора. Для `tasks`
--           это `created_at desc`, а НЕ `ts`: у задачи дата события (`deadline`) и
--           порядок отбора (`created_at`) — разные колонки, и на равных `ts`
--           клиент оставлял порядок отбора.
-- Возвращаемый `ts` при этом НЕ округляется: усечение — свойство сортировки, а не
-- данных. Убрать всю тройку можно будет только вместе с критерием «построчное
-- совпадение», то есть не раньше S-TL-2.
--
-- ⚠️ ЗАГОЛОВКОВ ЗДЕСЬ НЕТ НАМЕРЕННО. Функция отдаёт факты (`kind` + `payload` + `ref`),
-- текст собирает TypeScript (`describeEvent` / `presetTitle` / `lib/timeline/adapters.ts`).
-- Слой представления в БД не живёт — и именно это делает построчное совпадение
-- с эталоном достижимым: слой представления спринт не трогает вообще.
--
-- Новых источников не появляется: `stage_transitions`, `messages`, `quotes`,
-- `project_files`, `deal_stakeholders`, `project_checklists` — это S-TL-2.
-- ═══════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1. Индексы под ветки union
--
-- Каждая ветка функции — `where <фильтр> order by <ts> desc limit N`. Без составного
-- индекса `(фильтр, ts desc)` планировщик соберёт всю выборку по фильтру и отрежет
-- её в конце сортировкой.
--
-- Все 13 аддитивны; `concurrently` не нужен — самая большая из таблиц `tasks`
-- (654 строки на 2026-08-08), блокировка на создание неощутима.
-- ─────────────────────────────────────────────────────────────

-- activity_log: по project_id составной уже есть (`idx_activity_log_project`),
-- по contact/company — partial БЕЗ даты (`idx_activity_log_contact` / `_company`).
create index if not exists idx_activity_log_contact_created
  on public.activity_log (contact_id, created_at desc) where contact_id is not null;
create index if not exists idx_activity_log_company_created
  on public.activity_log (company_id, created_at desc) where company_id is not null;

-- calls / meetings: сейчас (project_id) и (date desc) лежат РАЗДЕЛЬНО — для ветки,
-- которая фильтрует и сортирует одновременно, ни один из них не работает целиком.
create index if not exists idx_calls_project_date on public.calls (project_id, date desc);
create index if not exists idx_calls_company_date on public.calls (company_id, date desc);
create index if not exists idx_calls_contact_date on public.calls (contact_id, date desc);

create index if not exists idx_meetings_project_date on public.meetings (project_id, date desc);
create index if not exists idx_meetings_company_date on public.meetings (company_id, date desc);
create index if not exists idx_meetings_contact_date on public.meetings (contact_id, date desc);

-- tasks: (project_id) / (company_id) / (contact_id) есть, даты в них нет.
create index if not exists idx_tasks_project_created on public.tasks (project_id, created_at desc);
create index if not exists idx_tasks_company_created on public.tasks (company_id, created_at desc);
create index if not exists idx_tasks_contact_created on public.tasks (contact_id, created_at desc);

-- projects: источник «Сделки» в ленте компании/контакта.
create index if not exists idx_projects_company_created on public.projects (company_id, created_at desc);
create index if not exists idx_projects_contact_created on public.projects (contact_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- 2. Функция
-- ─────────────────────────────────────────────────────────────

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
         ) as payload,
         1 as ord, row_number() over (order by c.date desc) as seq
  from calls c
  where (p_entity_type = 'project' and c.project_id = p_entity_id)
     or (p_entity_type = 'company' and c.company_id = p_entity_id)
     or (p_entity_type = 'contact' and c.contact_id = p_entity_id)
  order by c.date desc
  limit (select v from n)
),

src_meetings as (
  -- ⚠ meetings.date — тип `date`, не timestamptz (сверено с живой БД). Приведение
  -- `::timestamptz` взяло бы TimeZone СЕССИИ и на MSK-подключении сдвинуло бы встречу
  -- на сутки назад относительно клиента, который делает `new Date('2026-08-06')` =
  -- полночь UTC. Тот же класс, что ключ идемпотентности из timestamptz в learnings.md.
  -- Фиксируем UTC явно.
  select (m.date::timestamp at time zone 'UTC') as ts,
         'meeting:' || m.id::text as id,
         'meetings' as source, 'meeting' as kind,
         m.created_by as actor_id,
         'meeting' as ref_type, m.id as ref_id,
         jsonb_build_object(
           'title', m.title, 'next_step', m.next_step, 'notes', m.notes
         ) as payload,
         2 as ord, row_number() over (order by m.date desc) as seq
  from meetings m
  where (p_entity_type = 'project' and m.project_id = p_entity_id)
     or (p_entity_type = 'company' and m.company_id = p_entity_id)
     or (p_entity_type = 'contact' and m.contact_id = p_entity_id)
  order by m.date desc
  limit (select v from n)
),

src_tasks as (
  -- ⚠ У задачи ДВЕ разные даты: отбор идёт по created_at (как в fetchTasks), а датой
  -- события служит deadline, если он есть (taskToEvent: date = deadline ?? created_at).
  -- Перепутать = получить другой состав ленты. Отсюда подзапрос: сначала топ-N
  -- по created_at, потом переоценка ts.
  select coalesce(t.deadline, t.created_at) as ts,
         'task:' || t.id::text as id,
         'tasks' as source, 'task' as kind,
         t.created_by as actor_id,
         'task' as ref_type, t.id as ref_id,
         jsonb_build_object(
           'text', t.text, 'lane', t.lane,
           'deadline', t.deadline, 'created_at', t.created_at
         ) as payload,
         3 as ord, row_number() over (order by t.created_at desc) as seq
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
         jsonb_build_object('name', p.name, 'type', p.type) as payload,
         4 as ord, row_number() over (order by p.created_at desc) as seq
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
         jsonb_build_object('event_type', a.event_type, 'payload', a.payload) as payload,
         5 as ord, row_number() over (order by a.created_at desc) as seq
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
         ) as payload,
         6 as ord, row_number() over (order by r.created_at desc) as seq
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

-- `ord`/`seq` живут только внутри подзапроса: наружу уходят ровно восемь колонок
-- контракта, а ORDER BY имеет право ссылаться на любую колонку источника.
select all_src.ts, all_src.id, all_src.source, all_src.kind,
       all_src.actor_id, all_src.ref_type, all_src.ref_id, all_src.payload
from (
  select * from src_calls
  union all select * from src_meetings
  union all select * from src_tasks
  union all select * from src_projects
  union all select * from src_activity
  union all select * from src_ai
) all_src
order by date_trunc('milliseconds', all_src.ts) desc, all_src.ord, all_src.seq;
$$;

comment on function public.entity_timeline(text, uuid, int) is
  'S-TL-1: лента событий сущности (project|company|contact). SECURITY INVOKER — '
  'видимость наследуется от RLS источников, см. шапку миграции. Лимит на источник, '
  'не на ленту. Заголовки собирает клиент.';

revoke all on function public.entity_timeline(text, uuid, int) from public, anon;
grant execute on function public.entity_timeline(text, uuid, int) to authenticated;

-- ⚠️ Значение `p_entity_type` вне трёх допустимых даёт ПУСТУЮ ленту, а не ошибку.
-- Это осознанно: RPC зовётся из типизированного клиента, мусор туда не приходит, а
-- `raise` в `language sql` недоступен без обёртки на plpgsql, которая стоит дороже пользы.
