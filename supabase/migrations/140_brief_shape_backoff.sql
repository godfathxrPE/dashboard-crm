-- ═══════════════════════════════════════════════════════════════════════
-- 140_brief_shape_backoff — пауза автосбора брифа на 7 суток после двух сбоев shape подряд.
-- СТАТУС: НАПИСАНА, НЕ ПРИМЕНЕНА (fix-BRIEF-SHAPE-BACKOFF)
-- 139 зарезервирована за «Авто-видом внедрения» (STATUS) — не занимать.
--
-- Зачем: company_brief_candidates() (138) держит паузу 45 мин после сбоя и не больше
-- 2 автопопыток на компанию за сутки МСК — назавтра всё заново. Компания, о которой
-- веб-поиск ничего не находит (shape|Поиск не дал ни одного источника…), каждый день
-- съедала бы 2 из 10 слотов org без конца, а панель брифа обещала бы автоповтор.
--
-- Правило:
--   • две последние по created_at строки ai_runs с preset_key = 'company_brief' у
--     компании — обе status = 'error' и error начинается с 'shape|' ⇒ компания вне
--     очереди 7 суток от coalesce(finished_at, created_at) более поздней из двух;
--   • ручные прогоны в счёт наравне с автозапуском; прогон done серию обрывает;
--   • в счёт только класс shape: upstream / access / network — сбои провайдера, не
--     компании, пауза по ним выключила бы автосбор всей org на неделю;
--   • класс, а не текст EMPTY_SOURCES_TEXT: класс — контракт runError() в
--     supabase/functions/ai-run/index.ts, текст пишется для человека и меняется.
-- Зеркало порогов — BRIEF_SHAPE_BACKOFF_STREAK / BRIEF_SHAPE_BACKOFF_DAYS в
-- src/lib/domain/company-brief.ts, менять парой.
-- company_brief_auto_state() не меняется: reason берётся отсюда и на паузе станет NULL.
--
-- Сигнатура, hardening и ACL — как в 138. DO-блоков и drop-операций нет — MCP apply_migration.
--
-- ⚠️ ОБРАТИМОСТЬ: create or replace function public.company_brief_candidates() с телом
--    и комментарием из 138_brief_auto.sql (раздел 4) — без условия «межсуточная пауза».
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.company_brief_candidates()
returns table (org_id uuid, company_id uuid, reason text, author_id uuid, next_action_date date)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with open_deals as (
    select p.id, p.org_id, p.company_id,
           coalesce(p.owner_id, p.created_by) as author_id,
           p.next_action_date
      from public.projects p
      join public.companies co on co.id = p.company_id and co.org_id = p.org_id
     where p.type = 'client' and p.status = 'open'
  ),
  per_company as (
    -- автор и срок — от сделки компании с ближайшим шагом
    select distinct on (d.company_id) d.org_id, d.company_id, d.author_id, d.next_action_date
      from open_deals d
     order by d.company_id, d.next_action_date asc nulls last, d.id
  ),
  last_done as (
    select r.entity_id as company_id, max(r.created_at) as brief_at
      from public.ai_runs r
     where r.preset_key = 'company_brief' and r.entity_type = 'company' and r.status = 'done'
     group by r.entity_id
  ),
  working_entry as (
    -- вход открытой сделки в рабочую фазу; FK stage_transitions → pipeline_stages снят
    -- сознательно (комментарий таблицы), поэтому inner join отбрасывает удалённые стадии
    select d.company_id, max(st.changed_at) as entered_at
      from public.stage_transitions st
      join open_deals d on d.id = st.project_id
      join public.pipeline_stages ps on ps.id = st.to_stage_id
     where ps.phase_group = 'working'
     group by d.company_id
  ),
  scored as (
    select c.org_id, c.company_id, c.author_id, c.next_action_date,
           case
             when lb.brief_at is null                              then 'no_brief'
             when we.entered_at > lb.brief_at + interval '30 days' then 'stage'
             when lb.brief_at < now() - interval '90 days'         then 'stale'
           end as reason
      from per_company c
      left join last_done lb     on lb.company_id = c.company_id
      left join working_entry we on we.company_id = c.company_id
  )
  select s.org_id, s.company_id, s.reason, s.author_id, s.next_action_date
    from scored s
   where s.reason is not null
     and s.author_id is not null
     -- уже идёт прогон (ручной или авто)
     and not exists (
       select 1 from public.ai_runs a
        where a.entity_type = 'company' and a.entity_id = s.company_id
          and a.preset_key = 'company_brief' and a.status in ('pending', 'running'))
     -- пауза после сбоя: 45 мин (тик раз в час → повтор следующим тиком)
     and not exists (
       select 1 from public.ai_runs e
        where e.entity_type = 'company' and e.entity_id = s.company_id
          and e.preset_key = 'company_brief' and e.status = 'error'
          and e.finished_at > now() - interval '45 minutes')
     -- не больше двух автопопыток на компанию за сутки МСК
     and (select count(*) from public.ai_runs t
           where t.entity_type = 'company' and t.entity_id = s.company_id
             and t.auto_reason is not null
             and t.created_at >= public.brief_auto_day_start()) < 2
     -- межсуточная пауза после серии shape (140): две последние попытки брифа — ошибки
     -- класса shape ⇒ компания вне очереди 7 суток от конца более поздней. Зеркало —
     -- BRIEF_SHAPE_BACKOFF_* в src/lib/domain/company-brief.ts, менять парой.
     -- coalesce(error, '') обязателен: bool_and пропускает NULL, и ошибка без текста
     -- рядом с shape иначе дала бы ложную паузу.
     and not exists (
       select 1
         from (select r.status, coalesce(r.error, '') as error,
                      coalesce(r.finished_at, r.created_at) as ended_at
                 from public.ai_runs r
                where r.entity_type = 'company' and r.entity_id = s.company_id
                  and r.preset_key = 'company_brief'
                order by r.created_at desc
                limit 2) last2
       having count(*) = 2
          and bool_and(last2.status = 'error' and last2.error like 'shape|%')
          and max(last2.ended_at) > now() - interval '7 days'
     )
$$;

comment on function public.company_brief_candidates() is
  'S-BRIEF-IN-DEAL-1.1 (138): очередь автозапуска брифа — компании с открытой сделкой и '
  'причиной no_brief | stage (вход в phase_group=working позже брифа + 30 дн.) | stale '
  '(бриф старше 90 дн.), без активного прогона, без сбоя за 45 мин, с < 2 автопопытками за '
  'сутки МСК. Пороги 30 / 90 дн. зеркалит TS-константа BRIEF_STALE_DAYS (S-BRIEF-IN-DEAL-1.2) — '
  'править синхронно. Видит все org: только для тика и DEFINER-RPC, клиенту закрыта. '
  'fix-BRIEF-SHAPE-BACKOFF (140): две последние попытки брифа (ручные в счёт) — ошибки класса '
  'shape ⇒ компания вне очереди 7 суток от конца более поздней; зеркало — '
  'BRIEF_SHAPE_BACKOFF_STREAK / BRIEF_SHAPE_BACKOFF_DAYS.';

revoke all on function public.company_brief_candidates() from public, anon, authenticated;
grant execute on function public.company_brief_candidates() to service_role;
