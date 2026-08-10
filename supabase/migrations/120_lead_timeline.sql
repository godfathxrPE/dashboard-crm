-- ═══════════════════════════════════════════════════════════════════════════
-- 120 — S-LEAD-HUB-2a: пятое значение `p_entity_type` — `lead`.
--
-- ⚠️ НОМЕР СВЕРЕН ЗАПРОСОМ к `supabase_migrations.schema_migrations` (правило 4):
--    последняя применённая — `20260810084635 convert_lead_history` (119) ⇒ 120.
--    Файл `116_cleanup_orphan_import_tasks.sql` (ветка `fix/cleanup-116-rescope`)
--    номер 120 не занимает.
--
-- ЧТО БЫЛО. 118 завела `lead_id` у `calls`/`tasks`/`activity_log`, но лента о нём
-- не знала: `entity_timeline` принимала `project|company|contact|org`. Звонок по
-- лиду в базе есть, показать его на карточке лида нечем — а карточка (`/leads/[id]`,
-- этот же спринт) без ленты вырождается в ту же модалку, только шире.
--
-- ЧТО СТАЛО. `p_entity_type = 'lead'` в трёх ветках union из шести. `src_meetings`,
-- `src_projects`, `src_ai` НЕ ТРОГАЮТСЯ: колонки `lead_id` у `meetings`, `projects`
-- и `ai_runs` нет (118 её там не заводила) — предикат упал бы `42703`. Это же
-- зафиксировано в дизайне: встреча до квалификации редка, транскриптов до звонка
-- не бывает. CTE `scope_projects`/`scope_children` — про company/contact, не трогаем.
--
-- ⚠️ `CREATE OR REPLACE` БЕЗ `DROP` — в отличие от 113/114 (там менялся список
-- аргументов ⇒ PGRST203) и 115 (менялся набор возвращаемых колонок ⇒ 42P13). Здесь
-- не меняется ни то, ни другое: `replace` сохраняет гранты и не роняет зависимости.
--
-- ⚠️ ЛИД В `parent_type` ИДЁТ ПОСЛЕДНИМ — ЭТО ПОВЕДЕНИЕ, А НЕ ПОРЯДОК СТРОК.
-- `convert_lead` (119) проставляет звонку `project_id`, а `lead_id` НАМЕРЕННО
-- оставляет — связь с лидом нужна аналитике «жизни до сделки». Поставь лид первым в
-- `case` — и после конверсии org-лента показывала бы родителем лид вместо сделки,
-- то есть ссылку в прошлое. Последним: до конверсии родитель — лид (иначе событие
-- вовсе без родителя), после — сделка. `case` и `coalesce` обязаны совпадать по
-- порядку: рассинхрон дал бы тип от одной ветки, а id от другой — ссылку в никуда.
--
-- Индексов не добавляет: partial `idx_calls_lead`/`idx_tasks_lead`/
-- `idx_activity_log_lead` завела 118 — ровно под этот предикат.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.entity_timeline(
  p_entity_type text,
  p_entity_id uuid default null::uuid,
  p_before timestamp with time zone default null::timestamp with time zone,
  p_before_id text default null::text,
  p_limit integer default 50,
  p_kinds text[] default null::text[]
)
returns table(
  ts timestamp with time zone, id text, source text, kind text, actor_id uuid,
  ref_type text, ref_id uuid, parent_type text, parent_id uuid, payload jsonb
)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
with n as (
  select least(greatest(coalesce(p_limit, 50), 1), 200) as v
),
kind_types as (
  select array['comment_added']                as note,
         array['stage_change','stage_changed'] as stage,
         array['entity_deleted']               as deleted
),
scope_projects as (
  select p.id from projects p
  where (p_entity_type = 'company' and p.company_id = p_entity_id)
     or (p_entity_type = 'contact' and p.contact_id = p_entity_id)
),
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
         -- ⚠️ порядок case и coalesce обязан совпадать; лид — последним (см. шапку)
         case when c.project_id is not null then 'project'
              when c.company_id is not null then 'company'
              when c.contact_id is not null then 'contact'
              when c.lead_id    is not null then 'lead' end as parent_type,
         coalesce(c.project_id, c.company_id, c.contact_id, c.lead_id) as parent_id,
         jsonb_build_object(
           'status', c.status, 'next_step', c.next_step, 'agreements', c.agreements
         ) as payload
  from calls c
  where (p_kinds is null or 'call' = any(p_kinds))
    and ( p_entity_type = 'org'
       or (p_entity_type = 'project' and c.project_id = p_entity_id)
       or (p_entity_type = 'company' and c.company_id = p_entity_id)
       or (p_entity_type = 'contact' and c.contact_id = p_entity_id)
       or (p_entity_type = 'lead'    and c.lead_id    = p_entity_id) )
    and (p_before is null or c.date <= p_before)
    and (p_before is null
         or (c.date, 'call:' || c.id::text) < (p_before, coalesce(p_before_id, 'zzzz')))
  order by c.date desc, ('call:' || c.id::text) desc
  limit (select v from n)
),
src_meetings as (
  -- `meetings.lead_id` НЕТ (118 не заводила) — ветка без изменений.
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
    and (p_before is null or (m.date::timestamp at time zone 'UTC') <= p_before)
    and (p_before is null
         or ((m.date::timestamp at time zone 'UTC'), 'meeting:' || m.id::text)
            < (p_before, coalesce(p_before_id, 'zzzz')))
  order by m.date desc, ('meeting:' || m.id::text) desc
  limit (select v from n)
),
src_tasks as (
  select coalesce(t.deadline, t.created_at) as ts,
         'task:' || t.id::text as id,
         'tasks' as source, 'task' as kind,
         t.created_by as actor_id,
         'task' as ref_type, t.id as ref_id,
         case when t.project_id is not null then 'project'
              when t.company_id is not null then 'company'
              when t.contact_id is not null then 'contact'
              when t.lead_id    is not null then 'lead' end as parent_type,
         coalesce(t.project_id, t.company_id, t.contact_id, t.lead_id) as parent_id,
         jsonb_build_object(
           'text', t.text, 'lane', t.lane,
           'deadline', t.deadline, 'created_at', t.created_at
         ) as payload
  from (
    -- ⚠️ `lead_id` обязан быть и в СПИСКЕ КОЛОНОК подзапроса: внешний select читает
    -- только то, что подзапрос отдал (иначе 42703 на `t.lead_id`).
    select t2.id, t2.text, t2.lane, t2.deadline, t2.created_at, t2.created_by,
           t2.project_id, t2.company_id, t2.contact_id, t2.lead_id
    from tasks t2
    where (p_kinds is null or 'task' = any(p_kinds))
      and ( p_entity_type = 'org'
         or (p_entity_type = 'project' and t2.project_id = p_entity_id)
         or (p_entity_type = 'company' and t2.company_id = p_entity_id)
         or (p_entity_type = 'contact' and t2.contact_id = p_entity_id)
         or (p_entity_type = 'lead'    and t2.lead_id    = p_entity_id) )
      and (p_before is null or coalesce(t2.deadline, t2.created_at) <= p_before)
      and (p_before is null
           or (coalesce(t2.deadline, t2.created_at), 'task:' || t2.id::text)
              < (p_before, coalesce(p_before_id, 'zzzz')))
    order by coalesce(t2.deadline, t2.created_at) desc, ('task:' || t2.id::text) desc
    limit (select v from n)
  ) t
),
src_projects as (
  -- `projects.lead_id` НЕТ: связь обратная — `leads.converted_deal_id`. Сделка,
  -- рождённая из лида, в его ленту не попадает намеренно (карточка даёт прямую
  -- ссылку «К сделке»), иначе пришлось бы тащить сюда ещё один источник.
  select p.created_at as ts,
         'project:' || p.id::text as id,
         'projects' as source, 'project' as kind,
         p.created_by as actor_id,
         'project' as ref_type, p.id as ref_id,
         'project' as parent_type, p.id as parent_id,
         jsonb_build_object('name', p.name, 'type', p.type) as payload
  from projects p
  where (p_kinds is null or 'project' = any(p_kinds))
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
         case when a.project_id is not null then 'project'
              when a.company_id is not null then 'company'
              when a.contact_id is not null then 'contact'
              when a.lead_id    is not null then 'lead' end as parent_type,
         coalesce(a.project_id, a.company_id, a.contact_id, a.lead_id) as parent_id,
         jsonb_build_object('event_type', a.event_type, 'payload', a.payload) as payload
  from (
    -- ⚠️ `lead_id` добавлен в ОБЕ ветви union: списки колонок обязаны совпадать
    -- (иначе 42601), да и дедуп `union` считает строку целиком.
    ( select al.id, al.event_type, al.payload, al.created_at, al.user_id,
             al.project_id, al.company_id, al.contact_id, al.lead_id
      from activity_log al
      where ( p_kinds is null
           or 'activity' = any(p_kinds)
           or ('note'    = any(p_kinds) and al.event_type = any((select note    from kind_types)::text[]))
           or ('stage'   = any(p_kinds) and al.event_type = any((select stage   from kind_types)::text[]))
           or ('deleted' = any(p_kinds) and al.event_type = any((select deleted from kind_types)::text[])) )
        and al.event_type <> 'stage_transition_committed'
        and ( p_entity_type = 'org'
           or (p_entity_type = 'project' and al.project_id = p_entity_id)
           or (p_entity_type = 'company' and al.company_id = p_entity_id)
           or (p_entity_type = 'contact' and al.contact_id = p_entity_id)
           or (p_entity_type = 'lead'    and al.lead_id    = p_entity_id) )
        and (p_before is null or al.created_at <= p_before)
        and (p_before is null
             or (al.created_at, 'activity:' || al.id::text)
                < (p_before, coalesce(p_before_id, 'zzzz')))
      order by al.created_at desc, ('activity:' || al.id::text) desc
      limit (select v from n) )
    union
    ( select al.id, al.event_type, al.payload, al.created_at, al.user_id,
             al.project_id, al.company_id, al.contact_id, al.lead_id
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
  -- `ai_runs.entity_type` знает project/company/contact — лида там нет и не заводим.
  select r.created_at as ts,
         'ai_run:' || r.id::text as id,
         'ai_runs' as source, 'ai_run' as kind,
         r.created_by as actor_id,
         'ai_run' as ref_type, r.id as ref_id,
         case when r.entity_type in ('project','company') then r.entity_type end as parent_type,
         case when r.entity_type in ('project','company') then r.entity_id end as parent_id,
         jsonb_build_object(
           'preset_key', r.preset_key, 'entity_type', r.entity_type, 'status', r.status
         ) as payload
  from (
    select u.id, u.preset_key, u.entity_type, u.entity_id, u.status, u.created_at, u.created_by
    from (
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
    limit (select v from n)
  ) r
)
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
where p_before is null
   or (all_src.ts, all_src.id) < (p_before, coalesce(p_before_id, 'zzzz'))
order by all_src.ts desc, all_src.id desc
limit (select v from n);
$function$;

comment on function public.entity_timeline(text, uuid, timestamptz, text, int, text[]) is
$c$Единая лента событий. p_entity_type: project | company | contact | lead | org.
Источники: calls, meetings, tasks, projects, activity_log, ai_runs — но для 'lead'
работают только три (calls / tasks / activity_log): колонки lead_id у meetings,
projects и ai_runs нет.
Границу организации держит RLS источников — второго предиката в теле нет намеренно
(функция SECURITY INVOKER с 112).
parent_type='lead' возможен только у событий НЕконвертированного лида: convert_lead
(119) проставляет звонку/задаче project_id, а он в case стоит раньше лида, поэтому
после конверсии родителем становится сделка.
Пагинация — keyset по паре (ts, id), дно = неполная страница.$c$;

-- ═══ Проверки для гейта (после apply; в файле — закомментированы) ═══
-- 1. Лента лида со звонком: ожидаем строки kind='call'/'task'/'activity'.
-- select * from public.entity_timeline('lead', '<lead_id>'::uuid) order by ts desc;
--
-- 2. Org-лента не потеряла событий — сравнить с прогоном ДО apply:
-- select kind, parent_type, count(*) from public.entity_timeline('org', null, null, null, 200)
--  group by 1, 2 order by 1, 2;
--
-- 3. Родитель после конверсии — сделка, а не лид (звонок с обоими id):
-- select id, parent_type, parent_id from public.entity_timeline('org', null, null, null, 200)
--  where id like 'call:%';
