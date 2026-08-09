-- ═══════════════════════════════════════════════════════
-- 115 — S-TL-4 (ось 2 «Единая лента событий»): та же функция обслуживает уровень
-- организации, и «Последние действия» перестают выдавать журнал за всю активность.
--
-- ⚠️ НОМЕР СВЕРЕН ЗАПРОСОМ к `supabase_migrations.schema_migrations` (правило 4):
--    последняя применённая — `20260809083732 entity_timeline_kinds` (114) ⇒ 115.
--
-- ЧТО БЫЛО. Виджеты «Последние действия» (дашборд, 20 записей) и `ActivityWidget`
-- (дровер, 5) читали `activity_log` напрямую через `useRecentActivity`. В базе на
-- 2026-08-09: activity_log 801 (без технического `stage_transition_committed`),
-- tasks 654, ai_runs 21, projects 19, calls 14, meetings 1 — 1510 событий, из
-- которых виджеты видели 801, и то однобоко: ни звонков, ни встреч, ни задач, ни
-- сделок, ни AI-прогонов. Это не отсутствующая фича, а виджет, который врал названием.
--
-- ЧТО СТАЛО. Четвёртое значение `p_entity_type = 'org'` у той же функции.
-- Второй функции с копией тела не заводится: копия разошлась бы с оригиналом при
-- первой же правке веток, и разошлась бы МОЛЧА — лента просто показала бы другое.
--
-- ⚠️ ГРАНИЦУ ОРГАНИЗАЦИИ ДЕРЖИТ RLS ИСТОЧНИКОВ, А НЕ ТЕЛО ФУНКЦИИ.
-- В org-режиме предикат сущности снимается целиком — и ни `current_org_id()`, ни
-- ручного `org_id = …` вместо него НЕ появляется. Причина та же, по которой функция
-- `SECURITY INVOKER` с 112: вторая проверка была бы копией предиката политики и
-- разошлась бы с ней при первом изменении RLS. Ровно здесь это и проверяется —
-- ролевой смок org-ленты (`manager`-не-участник не видит чужих задач) есть в
-- критерии приёмки спринта, и если бы границу держало тело функции, тут была бы
-- утечка на всю организацию.
--
-- ⚠️ КОНТРАКТ РАСШИРЕН ДВУМЯ КОЛОНКАМИ — `parent_type` / `parent_id`.
-- На карточке сущности вопрос «к чему это относится» не стоит: карточка и есть
-- ответ. На уровне org он главный — строка «Задача: Приёмка отчёта» без указания
-- сделки бесполезна. Прежний `useRecentActivity` решал это вложенным
-- `project:projects(id, name)`; у `TimelineEvent` такого поля не было, и прямая
-- замена источника сделала бы виджет полнее, но нечитаемее.
-- **Имя не отдаём, только идентификатор**: резолв `id → имя` делает клиент из уже
-- загруженных кэшей (`useProjects`/`useCompanies`/`useContacts`), как `useActorMap`
-- резолвит актора. Джойн трёх таблиц в каждой из шести веток ради строки, которая
-- у клиента уже есть, — лишняя работа на каждой странице.
--
-- ⚠️ `DROP` ПЕРВОЙ СТРОКОЙ — ЗДЕСЬ ПО ДРУГОЙ ПРИЧИНЕ, ЧЕМ В 113/114.
-- Список типов аргументов не меняется (`p_entity_id` лишь получает `default null`),
-- поэтому перегрузки и `PGRST203` в этот раз не было бы вовсе. Но `create or replace`
-- не умеет менять НАБОР ВОЗВРАЩАЕМЫХ КОЛОНОК — вернул бы `42P13 cannot change return
-- type of existing function`. Гранты после `drop`+`create` не наследуются — повторены.
--
-- ⚠️ СПИСКИ `event_type` ДЛЯ ПСЕВДОВИДОВ СВЕДЕНЫ В ОДИН CTE `kind_types`.
-- Псевдовидов стало три (`note`, `stage`, `deleted`), и каждый нужен в ОБЕИХ ветвях
-- union внутри `src_activity` — то есть шесть мест на три списка. В 114 список
-- заметок уже был написан дважды; это полкласса того дефекта, что жил в трёх копиях
-- дедупа ОПФ (S-TG-3). Внутри SQL повторов теперь нет.
-- Дубль между SQL и TS (`NOTE_EVENT_TYPES` в `src/lib/utils/activity-events.ts`,
-- табы дашборда) этим НЕ снимается — его снять нельзя: SQL не импортирует константу.
--
-- Индексов миграция не добавляет. В org-режиме ветка идёт по всей таблице
-- (`order by ts desc limit N` без предиката сущности), но самая большая из шести —
-- `tasks`, 654 строки; индекс под сортировку без ведущей колонки сущности здесь
-- окупится не раньше десятков тысяч строк.
-- ═══════════════════════════════════════════════════════

-- ⚠️ ПЕРВОЙ СТРОКОЙ — снятие прежней функции: меняется набор возвращаемых колонок
-- (см. 42P13 в шапке), а не список аргументов.
drop function if exists public.entity_timeline(text, uuid, timestamptz, text, int, text[]);

create or replace function public.entity_timeline(
  -- 'org' | 'project' | 'company' | 'contact'
  p_entity_type text,
  -- ⚠️ При p_entity_type = 'org' ИГНОРИРУЕТСЯ ЦЕЛИКОМ и может быть null: границу
  -- задаёт RLS источников, а сузить её до чужой org нельзя — политики не позволят.
  p_entity_id   uuid        default null,
  p_before      timestamptz default null,   -- курсор: ts последнего показанного события
  p_before_id   text        default null,   -- курсор: его id (тай-брейк)
  p_limit       int         default 50,
  -- Словарь: 'call'|'meeting'|'task'|'project'|'activity'|'ai_run' + производные
  -- 'note'|'stage'|'deleted' (срезы activity_log по event_type).
  -- `null` = все виды. Значение вне словаря не ошибка — оно ничего не включает.
  p_kinds       text[]      default null
)
returns table (
  ts          timestamptz,
  id          text,
  source      text,
  kind        text,
  actor_id    uuid,
  ref_type    text,
  ref_id      uuid,
  -- 115: к чему относится событие. `null` — законное значение: у 304 записей
  -- журнала из 801 нет ни одной привязки, у задачи её может не быть тоже.
  parent_type text,
  parent_id   uuid,
  payload     jsonb
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

-- ⚠️ Единственное место, где перечислены `event_type` псевдовидов. Ссылаться на них
-- скалярным подзапросом, НЕ копировать литералы в ветки: в 114 список заметок уже
-- был написан дважды, и это ровно тот дефект, что жил в трёх копиях дедупа ОПФ.
--
-- ⚠️ КАСТ `::text[]` У ПОДЗАПРОСА ОБЯЗАТЕЛЕН. `x = any((select arr from cte))`
-- парсится как форма `ANY(subquery)` — то есть «сравни x с каждой СТРОКОЙ», а строка
-- тут одна и она типа `text[]` ⇒ `42883 operator does not exist: text = text[]`.
-- Каст превращает подзапрос в выражение, и включается форма `ANY(array)`.
kind_types as (
  select array['comment_added']                as note,
         array['stage_change','stage_changed'] as stage,
         array['entity_deleted']               as deleted
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
         -- ⚠️ ПОРЯДОК В `case` И В `coalesce` ОБЯЗАН СОВПАДАТЬ. Разъедутся — клиент
         -- пойдёт искать компанию по id проекта и не найдёт (или, хуже, найдёт).
         -- Приоритет один на все ветки: project → company → contact.
         case when c.project_id is not null then 'project'
              when c.company_id is not null then 'company'
              when c.contact_id is not null then 'contact' end as parent_type,
         coalesce(c.project_id, c.company_id, c.contact_id) as parent_id,
         jsonb_build_object(
           'status', c.status, 'next_step', c.next_step, 'agreements', c.agreements
         ) as payload
  from calls c
  -- 114: вид не запрошен → предикат схлопывается в false, и планировщик отбрасывает
  -- ветку как one-time filter, вовсе не читая таблицу.
  where (p_kinds is null or 'call' = any(p_kinds))
    -- 115: у 'org' предиката сущности НЕТ — границу держит RLS (см. шапку).
    and ( p_entity_type = 'org'
       or (p_entity_type = 'project' and c.project_id = p_entity_id)
       or (p_entity_type = 'company' and c.company_id = p_entity_id)
       or (p_entity_type = 'contact' and c.contact_id = p_entity_id) )
    -- грубая отсечка по ts — она индексируемая, её оставляем ради index scan
    and (p_before is null or c.date <= p_before)
    -- ⚠️ 114: ТОЧНАЯ отсечка по паре — обязательна с появлением p_kinds. Без неё
    -- ветка отдаёт строки, которые внешний фильтр выбросит, страница выходит короче
    -- лимита, и пагинация встаёт на живом хвосте без ошибки и без признака.
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
         case when m.project_id is not null then 'project'
              when m.company_id is not null then 'company'
              when m.contact_id is not null then 'contact' end as parent_type,
         coalesce(m.project_id, m.company_id, m.contact_id) as parent_id,
         jsonb_build_object(
           'title', m.title, 'next_step', m.next_step, 'notes', m.notes
         ) as payload
  from meetings m
  where (p_kinds is null or 'meeting' = any(p_kinds))
    and ( p_entity_type = 'org'
       or (p_entity_type = 'project' and m.project_id = p_entity_id)
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
         case when t.project_id is not null then 'project'
              when t.company_id is not null then 'company'
              when t.contact_id is not null then 'contact' end as parent_type,
         coalesce(t.project_id, t.company_id, t.contact_id) as parent_id,
         jsonb_build_object(
           'text', t.text, 'lane', t.lane,
           'deadline', t.deadline, 'created_at', t.created_at
         ) as payload
  from (
    select t2.id, t2.text, t2.lane, t2.deadline, t2.created_at, t2.created_by,
           t2.project_id, t2.company_id, t2.contact_id
    from tasks t2
    where (p_kinds is null or 'task' = any(p_kinds))
      and ( p_entity_type = 'org'
         or (p_entity_type = 'project' and t2.project_id = p_entity_id)
         or (p_entity_type = 'company' and t2.company_id = p_entity_id)
         or (p_entity_type = 'contact' and t2.contact_id = p_entity_id) )
      and (p_before is null or coalesce(t2.deadline, t2.created_at) <= p_before)
      -- ⚠️ 114: точная отсечка. Именно эта ветка дала контрпример: у «Хороший вкус —
      -- внедрение» 40 задач с одним ts, и без неё вторая страница приходила пустой.
      and (p_before is null
           or (coalesce(t2.deadline, t2.created_at), 'task:' || t2.id::text)
              < (p_before, coalesce(p_before_id, 'zzzz')))
    order by coalesce(t2.deadline, t2.created_at) desc, ('task:' || t2.id::text) desc
    limit (select v from n)
  ) t
),

src_projects as (
  select p.created_at as ts,
         'project:' || p.id::text as id,
         'projects' as source, 'project' as kind,
         p.created_by as actor_id,
         'project' as ref_type, p.id as ref_id,
         -- Сделка сама себе родитель: в org-ленте строка «Сделка: X» должна вести
         -- на карточку X, а не в никуда.
         'project' as parent_type, p.id as parent_id,
         jsonb_build_object('name', p.name, 'type', p.type) as payload
  from projects p
  where (p_kinds is null or 'project' = any(p_kinds))
    -- ⚠️ 115: для 'org' ветка ВКЛЮЧЕНА — создание сделки это событие org-уровня.
    -- На карточке самой сделки она по-прежнему выключена предикатом сущности:
    -- там это не событие ленты, а сама сущность.
    and ( p_entity_type = 'org'
       or (p_entity_type = 'company' and p.company_id = p_entity_id)
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
         -- ⚠️ `activity_log.company_id` и `.contact_id` — NULL у ВСЕХ 801 строк
         -- (сверено 2026-08-09), так что практически это `project_id` или ничего.
         -- Ветви `case` оставлены: колонки в таблице есть, и первая же заметка на
         -- компании их заполнит.
         case when a.project_id is not null then 'project'
              when a.company_id is not null then 'company'
              when a.contact_id is not null then 'contact' end as parent_type,
         coalesce(a.project_id, a.company_id, a.contact_id) as parent_id,
         -- payload источника кладём ВНУТРЬ, рядом с event_type: describeEvent()
         -- принимает ActivityLog целиком и читает оба поля.
         jsonb_build_object('event_type', a.event_type, 'payload', a.payload) as payload
  from (
    -- прямая привязка
    ( select al.id, al.event_type, al.payload, al.created_at, al.user_id,
             al.project_id, al.company_id, al.contact_id
      from activity_log al
      -- ⚠️ Ветку включают ЧЕТЫРЕ вида: `activity` — журнал целиком, плюс три среза
      -- по `event_type` (`note`/`stage`/`deleted`). Списки — только из `kind_types`.
      where ( p_kinds is null
           or 'activity' = any(p_kinds)
           or ('note'    = any(p_kinds) and al.event_type = any((select note    from kind_types)::text[]))
           or ('stage'   = any(p_kinds) and al.event_type = any((select stage   from kind_types)::text[]))
           or ('deleted' = any(p_kinds) and al.event_type = any((select deleted from kind_types)::text[])) )
        and al.event_type <> 'stage_transition_committed'
        and ( p_entity_type = 'org'
           or (p_entity_type = 'project' and al.project_id = p_entity_id)
           or (p_entity_type = 'company' and al.company_id = p_entity_id)
           or (p_entity_type = 'contact' and al.contact_id = p_entity_id) )
        and (p_before is null or al.created_at <= p_before)
        and (p_before is null
             or (al.created_at, 'activity:' || al.id::text)
                < (p_before, coalesce(p_before_id, 'zzzz')))
      order by al.created_at desc, ('activity:' || al.id::text) desc
      limit (select v from n) )
    union   -- не `union all`: дедуп по строке, как Map<id> в fetchActivity
    -- Транзитивная ветвь: записи по проектам сущности.
    -- ⚠️ 115: условие сужено с `<> 'project'` до явного списка. Для 'org' прямая
    -- ветвь уже отдаёт ВЕСЬ журнал организации, и транзитивная только удвоила бы
    -- выборку — дедуп `union` спас бы результат, но работа делалась бы зря.
    ( select al.id, al.event_type, al.payload, al.created_at, al.user_id,
             al.project_id, al.company_id, al.contact_id
      from activity_log al
      where ( p_kinds is null
           or 'activity' = any(p_kinds)
           or ('note'    = any(p_kinds) and al.event_type = any((select note    from kind_types)::text[]))
           or ('stage'   = any(p_kinds) and al.event_type = any((select stage   from kind_types)::text[]))
           or ('deleted' = any(p_kinds) and al.event_type = any((select deleted from kind_types)::text[])) )
        and p_entity_type in ('company', 'contact')
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
         -- ⚠️ Родитель только для прогонов по сделке и компании. У прогона по
         -- звонку/встрече родитель есть, но клиент резолвит имена из кэшей
         -- `useProjects`/`useCompanies`/`useContacts` — звонка там нет, и `parent_id`
         -- превратился бы в id, для которого имени не найдётся никогда.
         case when r.entity_type in ('project','company') then r.entity_type end as parent_type,
         case when r.entity_type in ('project','company') then r.entity_id end as parent_id,
         jsonb_build_object(
           'preset_key', r.preset_key, 'entity_type', r.entity_type, 'status', r.status
         ) as payload
  from (
    select u.id, u.preset_key, u.entity_type, u.entity_id, u.status, u.created_at, u.created_by
    from (
      -- по звонкам и встречам сущности. In-список здесь СЕРВЕРНЫЙ — это снимает
      -- остаток S-DEBT-TRUTH-1: на клиенте он ехал в URL и мог упереться в его длину.
      -- ⚠️ 115: для 'org' `scope_children` пуст, поэтому ветвь берёт ВСЕ прогоны —
      -- она и есть org-ветвь, второй здесь не нужно.
      ( select ar.id, ar.preset_key, ar.entity_type, ar.entity_id, ar.status,
               ar.created_at, ar.created_by
        from ai_runs ar
        where (p_kinds is null or 'ai_run' = any(p_kinds))
          and ( p_entity_type = 'org'
             or ar.entity_id in (select id from scope_children) )
          and (p_before is null or ar.created_at <= p_before)
          and (p_before is null
               or (ar.created_at, 'ai_run:' || ar.id::text)
                  < (p_before, coalesce(p_before_id, 'zzzz')))
        order by ar.created_at desc, ('ai_run:' || ar.id::text) desc
        limit (select v from n) )
      union
      -- по самой сущности: бриф компании, read-only пресеты сделки.
      -- ⚠️ 115: условие сужено с `<> 'contact'` до явного списка. Для 'org' оно
      -- не применимо по построению — `ar.entity_type = 'org'` не бывает
      -- (`ai_runs.entity_type ∈ call|meeting|project|company`), а у контакта своих
      -- прогонов не бывает вовсе.
      ( select ar.id, ar.preset_key, ar.entity_type, ar.entity_id, ar.status,
               ar.created_at, ar.created_by
        from ai_runs ar
        where (p_kinds is null or 'ai_run' = any(p_kinds))
          and p_entity_type in ('project', 'company')
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
-- ⚠️ С точной отсечкой внутри веток (114) этот фильтр ничего больше не выбрасывает —
-- он оставлен страховкой на случай, если ветка когда-нибудь заведётся без неё.
-- Убирать его нельзя: тогда такая ветка сломает пагинацию молча.
select all_src.ts, all_src.id, all_src.source, all_src.kind,
       all_src.actor_id, all_src.ref_type, all_src.ref_id,
       all_src.parent_type, all_src.parent_id, all_src.payload
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
  'S-TL-4: лента событий, страницами, с фильтром по видам. p_entity_type — '
  'org|project|company|contact; при ''org'' предикат сущности снимается целиком, а '
  'p_entity_id игнорируется (границу организации держит RLS источников, не тело '
  'функции — потому и SECURITY INVOKER, см. шапку 112). p_limit — лимит СТРАНИЦЫ, '
  'зажат в [1,200]. Курсор — пара (p_before, p_before_id); порядок ts desc, id desc; '
  'точная отсечка стоит ВНУТРИ каждой ветки union. p_kinds — шесть видов плюс '
  'производные note|stage|deleted (срезы activity_log по event_type, списки в CTE '
  'kind_types), null = все. parent_type/parent_id — к чему относится событие '
  '(project→company→contact, первый непустой); ИМЯ резолвит клиент из своих кэшей. '
  'Заголовки собирает клиент.';

-- Гранты после drop+create не наследуются — повторяем явно.
revoke all on function public.entity_timeline(text, uuid, timestamptz, text, int, text[]) from public, anon;
grant execute on function public.entity_timeline(text, uuid, timestamptz, text, int, text[]) to authenticated;

-- ⚠️ Значение `p_entity_type` вне четырёх допустимых даёт ПУСТУЮ ленту, а не ошибку.
-- Это осознанно: RPC зовётся из типизированного клиента, мусор туда не приходит, а
-- `raise` в `language sql` недоступен без обёртки на plpgsql, которая стоит дороже пользы.
-- То же и с `p_kinds`: неизвестное значение просто не включает ни одной ветки.
