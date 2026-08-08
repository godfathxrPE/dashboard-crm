-- ═══════════════════════════════════════════════════════
-- 113 — S-TL-2 (ось 2 «Единая лента событий»): у ленты появляется дно.
--
-- ⚠️ НОМЕР СВЕРЕН ЗАПРОСОМ к `supabase_migrations.schema_migrations` (правило 4):
--    последняя применённая — `20260808204308 entity_timeline` (112) ⇒ 113.
--
-- ЧТО БЫЛО (112). Лимит — НА ИСТОЧНИК: каждая из шести веток union отдавала до 50
-- строк, и лента показывала «до 50 от каждого источника», а не «последние N событий».
-- Прокрутки «раньше» не было вообще: всё, что за потолком, не показывалось и не
-- запрашивалось. На проде 2026-08-08 в потолок (`tasks + activity_log > 50`) упираются
-- 3 сделки из 19; у «Стратек — внедрение» 143 задачи против показанных 50.
--
-- ЧТО СТАЛО. Лимит — НА СТРАНИЦУ, плюс keyset-курсор `(ts, id)`.
--
-- ⚠️ ЭТО НАМЕРЕННО ЛОМАЕТ КРИТЕРИЙ ПРИЁМКИ S-TL-1 (построчное совпадение с прежней
-- клиентской лентой). Смена состава на «толстых» сделках — и есть доказательство,
-- что дефект починен, а не побочный эффект.
--
-- ⚠️ КУРСОР — ПАРА, А НЕ ОДИН `ts`. События одной секунды реальны: в проде 159 пар
-- в окне ±5 сек. По одному `ts` страница либо потеряет строки (`<`), либо повторит
-- их (`<=`). Пара `(ts, id)` — стандартный keyset, `id` уникален по построению
-- (`kind:uuid`).
--
-- ⚠️ `ord`/`seq` ИЗ 112 УДАЛЕНЫ ЦЕЛИКОМ. Они воспроизводили порядок конкатенации
-- массивов в старом JS-хуке (ранг источника + позиция внутри источника) — ключ,
-- который нельзя выразить в курсоре: он не является функцией возвращаемых колонок.
-- Вместо них сквозной `order by ts desc, id desc`. Это заодно закрывает находку
-- гейта S-TL-1: у «Хороший вкус — внедрение» 40 задач с ОДНИМ `created_at`, и их
-- порядок держался на физическом порядке строк, то есть ни на чём.
--
-- ⚠️ `date_trunc('milliseconds', ts)` УДАЛЁН. Он существовал ровно ради совпадения
-- с JS-сортировкой (`new Date(x).getTime()` режет timestamptz до миллисекунд).
-- Сортировки на клиенте больше нет, а усечение прямо вредит курсору: две строки
-- с разницей в 300 мкс схлопнулись бы в один ключ, и страница «раньше» либо
-- потеряла бы одну из них, либо повторила.
--
-- ⚠️ ВНУТРЕННИЙ `order by` КАЖДОЙ ВЕТКИ ОБЯЗАН НЕСТИ ТОТ ЖЕ ТАЙ-БРЕЙК, что внешний.
-- Ветка отдаёт свои топ-N, внешний запрос выбирает из них глобальные топ-N — это
-- корректно ТОЛЬКО если обе сортировки совпадают. Иначе на ничьих (те же 40 задач)
-- ветка вернёт произвольные N строк, внешний отсортирует уже урезанный набор, и
-- часть событий пропадёт безвозвратно — без ошибки и без всякого признака.
--
-- ⚠️ СИГНАТУРА ЗАМЕНЕНА, А НЕ РАСШИРЕНА. Postgres допускает перегрузку, но PostgREST
-- при двух кандидатах с пересекающимися именами аргументов отвечает `PGRST203`
-- (ambiguous) — вызов `{p_entity_type, p_entity_id, p_limit}` подошёл бы обеим.
-- Поэтому старая трёхаргументная удаляется ПЕРВОЙ строкой. Клиент обновляется тем
-- же PR, окна несовместимости нет.
--
-- Новых источников тут по-прежнему нет, и это решение: `messages` (8 строк),
-- `project_files` (7), `stage_transitions` (10), `quotes` (1), `deal_stakeholders` (3),
-- `project_checklists` (0) добавили бы к ленте 29 событий на всю организацию ценой
-- пересборки таксономии `kind` (KIND_META/KIND_LABEL/DEFAULT_KINDS/чипы/open-event/
-- 12 веток describeEvent). Отдельным спринтом — когда появятся данные.
-- ═══════════════════════════════════════════════════════

-- ⚠️ ПЕРВОЙ СТРОКОЙ — снятие старой сигнатуры (см. PGRST203 выше).
drop function if exists public.entity_timeline(text, uuid, int);

-- ─────────────────────────────────────────────────────────────
-- 1. Индексы под ось курсора у задач
--
-- У задачи ось события — `coalesce(deadline, created_at)`, и с 113 по ней же идёт
-- ОТБОР (в 112 отбор шёл по `created_at`, а `ts` пересчитывался после). Обычный
-- индекс по `created_at` для выражения бесполезен — планировщику нужен индекс по
-- тому же выражению.
--
-- Индексы 112 (`idx_tasks_*_created`) НЕ удаляются: по `created_at` ходят доска
-- задач и прежние выборки. Три новых аддитивны, `concurrently` не требуется —
-- 654 строки.
-- ─────────────────────────────────────────────────────────────

create index if not exists idx_tasks_project_ts
  on public.tasks (project_id, (coalesce(deadline, created_at)) desc);
create index if not exists idx_tasks_company_ts
  on public.tasks (company_id, (coalesce(deadline, created_at)) desc);
create index if not exists idx_tasks_contact_ts
  on public.tasks (contact_id, (coalesce(deadline, created_at)) desc);

-- ─────────────────────────────────────────────────────────────
-- 2. Функция
-- ─────────────────────────────────────────────────────────────

create or replace function public.entity_timeline(
  p_entity_type text,
  p_entity_id   uuid,
  p_before      timestamptz default null,   -- курсор: ts последнего показанного события
  p_before_id   text        default null,   -- курсор: его id (тай-брейк)
  p_limit       int         default 50
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
  where ( (p_entity_type = 'project' and c.project_id = p_entity_id)
       or (p_entity_type = 'company' and c.company_id = p_entity_id)
       or (p_entity_type = 'contact' and c.contact_id = p_entity_id) )
    -- курсор: грубая отсечка по ts, точная — снаружи по паре (ts, id)
    and (p_before is null or c.date <= p_before)
  order by c.date desc, ('call:' || c.id::text) desc
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
         ) as payload
  from meetings m
  where ( (p_entity_type = 'project' and m.project_id = p_entity_id)
       or (p_entity_type = 'company' and m.company_id = p_entity_id)
       or (p_entity_type = 'contact' and m.contact_id = p_entity_id) )
    -- отсечка по той же величине, что уходит в ts: приведение к UTC обязано стоять
    -- и здесь, иначе курсор и ось события разъедутся на часовой пояс сессии.
    and (p_before is null or (m.date::timestamp at time zone 'UTC') <= p_before)
  -- сортировка — по СЫРОЙ `m.date`, а не по выражению: приведение строго монотонно,
  -- порядок тот же, зато `idx_meetings_*_date` (112) остаётся рабочим. По выражению
  -- планировщик индекс не подобрал бы и сортировал бы выборку целиком.
  order by m.date desc, ('meeting:' || m.id::text) desc
  limit (select v from n)
),

src_tasks as (
  -- ⚠ У задачи ДВЕ разные даты: `created_at` (когда завели) и `deadline` (когда срок).
  -- Датой события служит `coalesce(deadline, created_at)` — и с 113 по ней же идёт
  -- ОТБОР. В 112 отбор шёл по `created_at` (так делал прежний клиентский fetchTasks),
  -- но при курсоре это развело бы выборку и курсор на РАЗНЫЕ оси, и страница «раньше»
  -- теряла бы задачи: отсечка по `ts`, а топ-N — по другой колонке.
  -- Под новую ось заведены три индекса по выражению (см. выше).
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
    where ( (p_entity_type = 'project' and t2.project_id = p_entity_id)
         or (p_entity_type = 'company' and t2.company_id = p_entity_id)
         or (p_entity_type = 'contact' and t2.contact_id = p_entity_id) )
      and (p_before is null or coalesce(t2.deadline, t2.created_at) <= p_before)
    order by coalesce(t2.deadline, t2.created_at) desc, ('task:' || t2.id::text) desc
    limit (select v from n)
  ) t
),

src_projects as (
  -- на карточке самой сделки источник выключен предикатом сущности
  select p.created_at as ts,
         'project:' || p.id::text as id,
         'projects' as source, 'project' as kind,
         p.created_by as actor_id,
         'project' as ref_type, p.id as ref_id,
         jsonb_build_object('name', p.name, 'type', p.type) as payload
  from projects p
  where ( (p_entity_type = 'company' and p.company_id = p_entity_id)
       or (p_entity_type = 'contact' and p.contact_id = p_entity_id) )
    and (p_before is null or p.created_at <= p_before)
  order by p.created_at desc, ('project:' || p.id::text) desc
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
        and (p_before is null or al.created_at <= p_before)
      order by al.created_at desc, ('activity:' || al.id::text) desc
      limit (select v from n) )
    union   -- не `union all`: дедуп по строке, как Map<id> в fetchActivity
    -- транзитивная: записи по проектам сущности (для project не нужна — она уже прямая)
    ( select al.id, al.event_type, al.payload, al.created_at, al.user_id
      from activity_log al
      where p_entity_type <> 'project'
        and al.event_type <> 'stage_transition_committed'
        and al.project_id in (select id from scope_projects)
        and (p_before is null or al.created_at <= p_before)
      order by al.created_at desc, ('activity:' || al.id::text) desc
      limit (select v from n) )
  ) a
),

src_ai as (
  -- ⚠ actor_id ЗАПОЛНЕН. В 112 тут стоял `null::uuid` ради построчного совпадения
  -- с прежней клиентской лентой; этого критерия больше нет, и у AI-прогона появляется
  -- автор (`ai_runs.created_by`, NOT NULL).
  select r.created_at as ts,
         'ai_run:' || r.id::text as id,
         'ai_runs' as source, 'ai_run' as kind,
         r.created_by as actor_id,
         'ai_run' as ref_type, r.id as ref_id,
         jsonb_build_object(
           'preset_key', r.preset_key, 'entity_type', r.entity_type, 'status', r.status
         ) as payload
  from (
    select u.id, u.preset_key, u.entity_type, u.status, u.created_at, u.created_by
    from (
      -- по звонкам и встречам сущности. In-список здесь СЕРВЕРНЫЙ — это снимает
      -- остаток S-DEBT-TRUTH-1: на клиенте он ехал в URL и мог упереться в его длину.
      ( select ar.id, ar.preset_key, ar.entity_type, ar.status, ar.created_at, ar.created_by
        from ai_runs ar
        where ar.entity_id in (select id from scope_children)
          and (p_before is null or ar.created_at <= p_before)
        order by ar.created_at desc, ('ai_run:' || ar.id::text) desc
        limit (select v from n) )
      union
      -- по самой сущности: бриф компании, read-only пресеты сделки.
      -- У контакта своих прогонов не бывает (ai_runs.entity_type ∈ call|meeting|project|company).
      ( select ar.id, ar.preset_key, ar.entity_type, ar.status, ar.created_at, ar.created_by
        from ai_runs ar
        where p_entity_type <> 'contact'
          and ar.entity_type = p_entity_type
          and ar.entity_id = p_entity_id
          and (p_before is null or ar.created_at <= p_before)
        order by ar.created_at desc, ('ai_run:' || ar.id::text) desc
        limit (select v from n) )
    ) u
    order by u.created_at desc, ('ai_run:' || u.id::text) desc
    limit (select v from n)   -- лимит ПОСЛЕ слияния, как в mergeAiRunRows
  ) r
)

-- Финал: keyset по паре (ts, id).
--
-- Сравнение КОРТЕЖЕЙ — не два отдельных предиката: `(ts, id) < (a, b)` раскрывается
-- в `ts < a or (ts = a and id < b)`, ровно обратное к `order by ts desc, id desc`.
-- Разложить его на `ts <= a and id < b` — классическая ошибка: она выбросила бы
-- все строки старше курсора, у которых id лексикографически больше.
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
-- `coalesce(p_before_id, 'zzzz')` страхует вызов с `p_before` БЕЗ `p_before_id`:
-- все шесть префиксов id (activity/ai_run/call/meeting/project/task) лексикографически
-- меньше 'zzzz', поэтому отсечка вырождается в `ts <= p_before` — страница повторит
-- события ровно этой микросекунды, но не потеряет ни одного. Клиент всегда передаёт
-- обе половины курсора, это ветка на случай ручного вызова.
where p_before is null
   or (all_src.ts, all_src.id) < (p_before, coalesce(p_before_id, 'zzzz'))
order by all_src.ts desc, all_src.id desc
limit (select v from n);
$$;

comment on function public.entity_timeline(text, uuid, timestamptz, text, int) is
  'S-TL-2: лента событий сущности (project|company|contact), страницами. SECURITY '
  'INVOKER — видимость наследуется от RLS источников, см. шапку миграции 112. '
  'p_limit — лимит СТРАНИЦЫ (не источника), зажат в [1,200]. Курсор — пара '
  '(p_before, p_before_id) = ts и id последнего показанного события; порядок '
  'ts desc, id desc. Заголовки собирает клиент.';

-- Гранты после drop+create не наследуются — повторяем явно.
revoke all on function public.entity_timeline(text, uuid, timestamptz, text, int) from public, anon;
grant execute on function public.entity_timeline(text, uuid, timestamptz, text, int) to authenticated;

-- ⚠️ Значение `p_entity_type` вне трёх допустимых даёт ПУСТУЮ ленту, а не ошибку.
-- Это осознанно: RPC зовётся из типизированного клиента, мусор туда не приходит, а
-- `raise` в `language sql` недоступен без обёртки на plpgsql, которая стоит дороже пользы.
