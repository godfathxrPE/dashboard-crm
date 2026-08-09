-- ═══════════════════════════════════════════════════════
-- 114 — S-TL-3 (ось 2 «Единая лента событий»): фильтр по видам переезжает на сервер.
--
-- ⚠️ НОМЕР СВЕРЕН ЗАПРОСОМ к `supabase_migrations.schema_migrations` (правило 4):
--    последняя применённая — `20260808222500 entity_timeline_keyset` (113) ⇒ 114.
--
-- ЧТО БЫЛО. Фильтр по видам («Звонки», «Задачи», «Заметки») жил на клиенте и резал
-- УЖЕ ЗАГРУЖЕННЫЕ страницы. До S-TL-2 лента грузилась целиком, и это было почти
-- честно; с появлением пагинации чип стал врать заметно: выбрав «Звонки», человек
-- видит звонки только из первых 50 событий, а не из ленты.
--
-- ЧТО СТАЛО. `p_kinds text[]` отсекает ветки union целиком, ещё до чтения таблиц.
--
-- ⚠️ ВМЕСТЕ С ФИЛЬТРОМ — ТОЧНАЯ ОТСЕЧКА КУРСОРА ВНУТРЬ ВЕТОК, и это не «заодно»,
-- а обязательная половина той же работы. В 113 ветка отбирала `limit N` по ГРУБОЙ
-- отсечке `ts <= p_before`, а точная (по паре `(ts, id)`) стояла СНАРУЖИ union.
-- Пока веток шесть, выброшенное снаружи покрывалось запасом: до 300 кандидатов
-- против 50 в выдаче. `p_kinds` этот запас убирает — при `p_kinds = ['task']`
-- работает ОДНА ветка, и если курсор попал в середину блока ничьих, снаружи
-- отбросится почти всё отобранное. Страница выйдет короче лимита, клиентский
-- `getNextPageParam` увидит `length < PAGE_SIZE` и решит, что достигнуто дно —
-- ПРИ ЖИВОМ ХВОСТЕ, без ошибки и без всякого признака.
-- На живых данных воспроизводимо: у «Хороший вкус — внедрение» 40 задач с одним
-- и тем же `created_at`, то есть с одним `ts`.
-- Лечится тем, что ветка отдаёт ровно N строк, ни одну из которых внешний фильтр
-- не выбросит. Внешняя отсечка остаётся — но как страховка, а не механизм.
--
-- ⚠️ СИГНАТУРА ЗАМЕНЕНА В ТРЕТИЙ РАЗ, а не расширена. Причина та же, что в 113:
-- PostgREST при двух кандидатах с пересекающимися именами аргументов отвечает
-- `PGRST203` (ambiguous) — вызов с пятью аргументами подошёл бы обеим сигнатурам.
-- Поэтому пятиаргументная удаляется ПЕРВОЙ строкой. Клиент обновляется тем же PR,
-- окна несовместимости нет. Гранты после `drop`+`create` не наследуются —
-- повторены явно, уже с ШЕСТЬЮ аргументами в сигнатуре.
--
-- ⚠️ СПИСОК ТИПОВ ЗАМЕТОК ПРОДУБЛИРОВАН здесь и в `NOTE_EVENT_TYPES`
-- (`src/lib/utils/activity-events.ts`). SQL не умеет импортировать TS-константу,
-- поэтому компромисс осознанный — но при добавлении типа заметки править надо
-- ОБА МЕСТА. Ровно тот класс дефекта, что дедуп ОПФ в трёх копиях из S-TG-3:
-- разошлись бы молча, чип «Заметки» просто показывал бы не то.
--
-- Новых источников тут по-прежнему нет (`messages`, `project_files`,
-- `stage_transitions`, `quotes`, `deal_stakeholders`, `project_checklists` дают
-- 29 событий на всю организацию) — отдельным спринтом, когда появятся данные.
-- ═══════════════════════════════════════════════════════

-- ⚠️ ПЕРВОЙ СТРОКОЙ — снятие пятиаргументной сигнатуры 113 (см. PGRST203 выше).
drop function if exists public.entity_timeline(text, uuid, timestamptz, text, int);

create or replace function public.entity_timeline(
  p_entity_type text,
  p_entity_id   uuid,
  p_before      timestamptz default null,   -- курсор: ts последнего показанного события
  p_before_id   text        default null,   -- курсор: его id (тай-брейк)
  p_limit       int         default 50,
  -- Словарь: 'call' | 'meeting' | 'task' | 'project' | 'activity' | 'ai_run' | 'note'.
  -- `null` = все виды. Значение вне словаря не ошибка — оно просто ничего не включает.
  p_kinds       text[]      default null
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
  -- 114: вид не запрошен → предикат схлопывается в false, и планировщик отбрасывает
  -- ветку как one-time filter, вовсе не читая таблицу.
  where (p_kinds is null or 'call' = any(p_kinds))
    and ( (p_entity_type = 'project' and c.project_id = p_entity_id)
       or (p_entity_type = 'company' and c.company_id = p_entity_id)
       or (p_entity_type = 'contact' and c.contact_id = p_entity_id) )
    -- грубая отсечка по ts — она индексируемая, её оставляем ради index scan
    and (p_before is null or c.date <= p_before)
    -- ⚠️ 114: ТОЧНАЯ отсечка по паре — обязательна с появлением p_kinds (см. шапку).
    and (p_before is null
         or (c.date, 'call:' || c.id::text) < (p_before, coalesce(p_before_id, 'zzzz')))
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
  where (p_kinds is null or 'meeting' = any(p_kinds))
    and ( (p_entity_type = 'project' and m.project_id = p_entity_id)
       or (p_entity_type = 'company' and m.company_id = p_entity_id)
       or (p_entity_type = 'contact' and m.contact_id = p_entity_id) )
    -- отсечка по той же величине, что уходит в ts: приведение к UTC обязано стоять
    -- и здесь, иначе курсор и ось события разъедутся на часовой пояс сессии.
    and (p_before is null or (m.date::timestamp at time zone 'UTC') <= p_before)
    -- ⚠️ 114: точная отсечка — тоже ПО UTC-ВЫРАЖЕНИЮ, а не по сырой `m.date`.
    -- Сортировка ниже идёт по сырой (ради индекса), но обе половины пары обязаны
    -- жить на той же оси, что и внешняя отсечка; приведение строго монотонно,
    -- поэтому порядок от этого не меняется.
    and (p_before is null
         or ((m.date::timestamp at time zone 'UTC'), 'meeting:' || m.id::text)
            < (p_before, coalesce(p_before_id, 'zzzz')))
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
  -- Под эту ось заведены три индекса по выражению (113).
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
    where (p_kinds is null or 'task' = any(p_kinds))
      and ( (p_entity_type = 'project' and t2.project_id = p_entity_id)
         or (p_entity_type = 'company' and t2.company_id = p_entity_id)
         or (p_entity_type = 'contact' and t2.contact_id = p_entity_id) )
      and (p_before is null or coalesce(t2.deadline, t2.created_at) <= p_before)
      -- ⚠️ 114: точная отсечка. Именно эта ветка и есть контрпример из шапки —
      -- 40 задач «Хорошего вкуса» с одним ts при `p_kinds = ['task']`.
      and (p_before is null
           or (coalesce(t2.deadline, t2.created_at), 'task:' || t2.id::text)
              < (p_before, coalesce(p_before_id, 'zzzz')))
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
  where (p_kinds is null or 'project' = any(p_kinds))
    and ( (p_entity_type = 'company' and p.company_id = p_entity_id)
       or (p_entity_type = 'contact' and p.contact_id = p_entity_id) )
    and (p_before is null or p.created_at <= p_before)
    and (p_before is null
         or (p.created_at, 'project:' || p.id::text)
            < (p_before, coalesce(p_before_id, 'zzzz')))
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
      -- ⚠️ 114: ветку включают ДВА вида. `activity` — журнал целиком, `note` — срез
      -- внутри него (человеческая заметка против системной записи; на уровне `kind`
      -- они неразличимы, отличается только `event_type`).
      -- ⚠️ Список типов заметок ДУБЛИРУЕТ `NOTE_EVENT_TYPES` в
      -- `src/lib/utils/activity-events.ts` — при добавлении типа править ОБА места.
      where ( p_kinds is null
           or 'activity' = any(p_kinds)
           or ('note' = any(p_kinds) and al.event_type = any(array['comment_added'])) )
        and al.event_type <> 'stage_transition_committed'
        and ( (p_entity_type = 'project' and al.project_id = p_entity_id)
           or (p_entity_type = 'company' and al.company_id = p_entity_id)
           or (p_entity_type = 'contact' and al.contact_id = p_entity_id) )
        and (p_before is null or al.created_at <= p_before)
        and (p_before is null
             or (al.created_at, 'activity:' || al.id::text)
                < (p_before, coalesce(p_before_id, 'zzzz')))
      order by al.created_at desc, ('activity:' || al.id::text) desc
      limit (select v from n) )
    union   -- не `union all`: дедуп по строке, как Map<id> в fetchActivity
    -- транзитивная: записи по проектам сущности (для project не нужна — она уже прямая)
    ( select al.id, al.event_type, al.payload, al.created_at, al.user_id
      from activity_log al
      where ( p_kinds is null
           or 'activity' = any(p_kinds)
           or ('note' = any(p_kinds) and al.event_type = any(array['comment_added'])) )
        and p_entity_type <> 'project'
        and al.event_type <> 'stage_transition_committed'
        and al.project_id in (select id from scope_projects)
        and (p_before is null or al.created_at <= p_before)
        and (p_before is null
             or (al.created_at, 'activity:' || al.id::text)
                < (p_before, coalesce(p_before_id, 'zzzz')))
      order by al.created_at desc, ('activity:' || al.id::text) desc
      limit (select v from n) )
  ) a
),

src_ai as (
  -- ⚠ actor_id ЗАПОЛНЕН с 113 (`ai_runs.created_by`, NOT NULL).
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
        where (p_kinds is null or 'ai_run' = any(p_kinds))
          and ar.entity_id in (select id from scope_children)
          and (p_before is null or ar.created_at <= p_before)
          and (p_before is null
               or (ar.created_at, 'ai_run:' || ar.id::text)
                  < (p_before, coalesce(p_before_id, 'zzzz')))
        order by ar.created_at desc, ('ai_run:' || ar.id::text) desc
        limit (select v from n) )
      union
      -- по самой сущности: бриф компании, read-only пресеты сделки.
      -- У контакта своих прогонов не бывает (ai_runs.entity_type ∈ call|meeting|project|company).
      ( select ar.id, ar.preset_key, ar.entity_type, ar.status, ar.created_at, ar.created_by
        from ai_runs ar
        where (p_kinds is null or 'ai_run' = any(p_kinds))
          and p_entity_type <> 'contact'
          and ar.entity_type = p_entity_type
          and ar.entity_id = p_entity_id
          and (p_before is null or ar.created_at <= p_before)
          and (p_before is null
               or (ar.created_at, 'ai_run:' || ar.id::text)
                  < (p_before, coalesce(p_before_id, 'zzzz')))
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
--
-- ⚠️ 114: с точной отсечкой внутри веток этот фильтр НИЧЕГО больше не выбрасывает —
-- он оставлен страховкой на случай, если ветка когда-нибудь заведётся без неё.
-- Убирать его нельзя: тогда такая ветка сломает пагинацию молча.
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

comment on function public.entity_timeline(text, uuid, timestamptz, text, int, text[]) is
  'S-TL-3: лента событий сущности (project|company|contact), страницами, с фильтром '
  'по видам. SECURITY INVOKER — видимость наследуется от RLS источников, см. шапку '
  'миграции 112. p_limit — лимит СТРАНИЦЫ (не источника), зажат в [1,200]. Курсор — '
  'пара (p_before, p_before_id) = ts и id последнего показанного события; порядок '
  'ts desc, id desc; точная отсечка стоит ВНУТРИ каждой ветки union (без неё сужение '
  'p_kinds до одного источника обрывает пагинацию на живом хвосте). p_kinds — '
  'call|meeting|task|project|activity|ai_run|note, null = все; note — срез '
  'activity_log по event_type, дублирует NOTE_EVENT_TYPES в activity-events.ts. '
  'Заголовки собирает клиент.';

-- Гранты после drop+create не наследуются — повторяем явно (ШЕСТЬ аргументов).
revoke all on function public.entity_timeline(text, uuid, timestamptz, text, int, text[]) from public, anon;
grant execute on function public.entity_timeline(text, uuid, timestamptz, text, int, text[]) to authenticated;

-- ⚠️ Значение `p_entity_type` вне трёх допустимых даёт ПУСТУЮ ленту, а не ошибку.
-- Это осознанно: RPC зовётся из типизированного клиента, мусор туда не приходит, а
-- `raise` в `language sql` недоступен без обёртки на plpgsql, которая стоит дороже пользы.
-- То же и с `p_kinds`: неизвестное значение просто не включает ни одной ветки.
