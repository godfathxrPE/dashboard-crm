-- ═══════════════════════════════════════════════════════════════════════
-- 138_brief_auto — автозапуск AI-брифа компании: очередь, дневной лимит, крон.
-- СТАТУС: ПРИМЕНЕНА 2026-10-04 (20261004093000) через SQL Editor владельца, MCP виснет на drop (S-BRIEF-IN-DEAL-1.1).
-- Решения владельца 29.09 (автозапуск) и 03.10 (апрув мокапа, четыре решения).
--
-- Зачем: daily-ревью сделок берёт зацепки для звонков из брифа компании, а бриф есть
-- у 2 из 16 компаний с открытыми сделками; кнопку в карточке компании не нажимали с 04.09.
-- Бриф теперь собирается сам — по триггерам, с дневным лимитом, фоновой очередью.
--
-- Триггеры (у компании есть открытая сделка `type='client' and status='open'`):
--   no_brief — нет ни одного company_brief со статусом done;
--   stage    — сделка вошла в стадию с phase_group='working' позже, чем бриф + 30 дн.;
--   stale    — последний бриф старше 90 дн.
-- Имён стадий и id воронок здесь нет — только phase_group.
--
-- Лимит: 10 автопрогонов в сутки (МСК) на org; переопределение —
-- organizations.settings.brief_auto_daily_limit (целое, 0 — выключено). Ручные прогоны
-- вне лимита, их путь (AiCompanyPanel → ai-run под JWT) не меняется.
-- Не чаще: один активный прогон на компанию (ux_ai_runs_active_entity), пауза 45 мин
-- после сбоя, не больше 2 автопопыток на компанию за сутки.
--
-- Устройство:
--   • очередь ВЫЧИСЛЯЕМАЯ (company_brief_candidates()), не таблица — второй источник
--     правды рядом с ai_runs не нужен;
--   • резерв лимита — INSERT строки ai_runs в той же транзакции, что подсчёт;
--     тики не пересекаются (pg_cron + pg_advisory_xact_lock), дубль по компании
--     отсекает уникальный индекс;
--   • исполнитель — существующий ai-run, ветка диспетчера по заголовку X-Dispatch-Key
--     берёт готовую строку по run_id. Шлюз ai-run (verify_jwt = true) проходит
--     легаси-anon JWT из Vault;
--   • auto_reason — колонка, а не ключ в result: признак нужен в момент INSERT
--     (подсчёт лимита), а result до done пуст. Ставит его только сервер — страж ниже;
--   • ошибки тика НЕ глотаются (в отличие от telegram_send_tick): сбой обязан лечь
--     в cron.job_run_details, иначе очередь молча встанет.
-- DO-блоков нет (MCP apply_migration на них виснет); cron.schedule по имени
-- идемпотентен в pg_cron ≥ 1.4.
--
-- ⚠️ ТРИ СЕКРЕТА VAULT ЗАВОДИТ ВЛАДЕЛЕЦ, НЕ МИГРАЦИЯ И НЕ CC (форма 107):
--
--      select vault.create_secret('<длинный случайный ключ>', 'brief_auto_key',
--             'Shared secret автозапуска брифа (ai-run, X-Dispatch-Key)');
--      select vault.create_secret('https://uoiavcabxgdjugzryrmj.supabase.co/functions/v1/ai-run',
--             'brief_auto_url', 'URL edge-функции ai-run');
--      select vault.create_secret('<легаси-anon JWT>', 'brief_auto_jwt',
--             'JWT для шлюза ai-run (verify_jwt = true)');
--
--    То же значение ключа — в Supabase Function Secrets как BRIEF_AUTO_KEY.
--    Без секретов тик выходит молча: apply 138 безопасен до деплоя ai-run.
--    Порядок включения: apply 138 → реген типов → деплой ai-run → секреты.
--
-- ⚠️ ОБРАТИМОСТЬ (откатывать в этом порядке):
--      select cron.unschedule('brief-auto');
--      drop function if exists public.brief_auto_tick();
--      drop function if exists public.company_brief_auto_state(uuid);
--      drop function if exists public.company_brief_candidates();
--      drop function if exists public.brief_auto_daily_limit(uuid);
--      drop function if exists public.brief_auto_day_start();
--      drop trigger if exists trg_ai_runs_auto_reason_guard on public.ai_runs;
--      drop function if exists public.ai_runs_auto_reason_guard();
--      alter table public.ai_runs drop constraint if exists ai_runs_auto_reason_check;
--      -- колонку auto_reason — только по явному «да» владельца: в ней журнал автозапусков
-- ═══════════════════════════════════════════════════════════════════════

------------------------------------------------------------------------
-- 1. Колонка и CHECK
------------------------------------------------------------------------
alter table public.ai_runs add column if not exists auto_reason text;

alter table public.ai_runs drop constraint if exists ai_runs_auto_reason_check;
alter table public.ai_runs add constraint ai_runs_auto_reason_check check (
  auto_reason is null
  or (auto_reason in ('no_brief', 'stale', 'stage')
      and preset_key = 'company_brief' and entity_type = 'company')
);

comment on column public.ai_runs.auto_reason is
  'S-BRIEF-IN-DEAL-1.1 (138): причина автозапуска брифа (no_brief | stage | stale). NULL — ручной '
  'прогон. Ставит только brief_auto_tick(); пользовательский контекст отсекает trg_ai_runs_auto_reason_guard.';

------------------------------------------------------------------------
-- 2. Страж признака
------------------------------------------------------------------------
create or replace function public.ai_runs_auto_reason_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Пользовательский контекст (есть auth.uid()) не ставит и не меняет признак автозапуска:
  -- иначе участник org съел бы дневной лимит или выдал ручной прогон за автоматический.
  -- В cron и под service_role auth.uid() пуст — там признак ставит тик.
  if auth.uid() is not null and (
       (tg_op = 'INSERT' and new.auto_reason is not null)
    or (tg_op = 'UPDATE' and new.auto_reason is distinct from old.auto_reason)
  ) then
    raise exception 'auto_reason ставит только автозапуск брифа' using errcode = '42501';
  end if;
  return new;
end $$;

revoke all on function public.ai_runs_auto_reason_guard() from public, anon, authenticated;
grant execute on function public.ai_runs_auto_reason_guard() to service_role;

drop trigger if exists trg_ai_runs_auto_reason_guard on public.ai_runs;
create trigger trg_ai_runs_auto_reason_guard
  before insert or update of auto_reason on public.ai_runs
  for each row execute function public.ai_runs_auto_reason_guard();

------------------------------------------------------------------------
-- 3. Два внутренних помощника — один источник для границы суток и лимита
------------------------------------------------------------------------
-- Начало суток по Москве. Одна функция на тик, кандидатов и RPC: три копии выражения
-- разошлись бы на первой правке.
create or replace function public.brief_auto_day_start()
returns timestamptz
language sql stable security definer set search_path = public, pg_temp
as $$ select (date_trunc('day', now() at time zone 'Europe/Moscow')) at time zone 'Europe/Moscow' $$;

-- Дневной лимит org: organizations.settings.brief_auto_daily_limit, иначе 10.
-- Нецелое значение в настройке — дефолт, а не ошибка тика.
create or replace function public.brief_auto_daily_limit(p_org uuid)
returns int
language sql stable security definer set search_path = public, pg_temp
as $$
  select case when (o.settings->>'brief_auto_daily_limit') ~ '^\d+$'
              then (o.settings->>'brief_auto_daily_limit')::int else 10 end
    from public.organizations o where o.id = p_org
$$;

revoke all on function public.brief_auto_day_start()       from public, anon, authenticated;
revoke all on function public.brief_auto_daily_limit(uuid) from public, anon, authenticated;
grant execute on function public.brief_auto_day_start()       to service_role;
grant execute on function public.brief_auto_daily_limit(uuid) to service_role;

------------------------------------------------------------------------
-- 4. Кандидаты — внутренняя функция, видит все org, клиенту закрыта
------------------------------------------------------------------------
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
$$;

comment on function public.company_brief_candidates() is
  'S-BRIEF-IN-DEAL-1.1 (138): очередь автозапуска брифа — компании с открытой сделкой и '
  'причиной no_brief | stage (вход в phase_group=working позже брифа + 30 дн.) | stale '
  '(бриф старше 90 дн.), без активного прогона, без сбоя за 45 мин, с < 2 автопопытками за '
  'сутки МСК. Пороги 30 / 90 дн. зеркалит TS-константа BRIEF_STALE_DAYS (S-BRIEF-IN-DEAL-1.2) — '
  'править синхронно. Видит все org: только для тика и DEFINER-RPC, клиенту закрыта.';

revoke all on function public.company_brief_candidates() from public, anon, authenticated;
grant execute on function public.company_brief_candidates() to service_role;

------------------------------------------------------------------------
-- 5. Состояние автосбора для UI (1.2) — org-first, одна компания
------------------------------------------------------------------------
-- Чужая или несуществующая компания → 0 строк (не ошибка). reason = NULL при живой
-- компании — «сейчас не в очереди»: есть активный прогон, пауза после сбоя, исчерпаны
-- попытки или триггера нет.
create or replace function public.company_brief_auto_state(p_company_id uuid)
returns table (reason text, used_today int, daily_limit int, attempts_today int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with org as (
    select c.org_id from public.companies c
     where c.id = p_company_id and c.org_id = (select public.current_org_id())
  )
  select
    (select k.reason from public.company_brief_candidates() k where k.company_id = p_company_id),
    (select count(*)::int from public.ai_runs r
      where r.org_id = org.org_id and r.auto_reason is not null
        and r.created_at >= public.brief_auto_day_start()),
    public.brief_auto_daily_limit(org.org_id),
    (select count(*)::int from public.ai_runs t
      where t.entity_type = 'company' and t.entity_id = p_company_id
        and t.auto_reason is not null
        and t.created_at >= public.brief_auto_day_start())
  from org
$$;

revoke all on function public.company_brief_auto_state(uuid) from public, anon;
grant execute on function public.company_brief_auto_state(uuid) to authenticated, service_role;

------------------------------------------------------------------------
-- 6. Тик
------------------------------------------------------------------------
create or replace function public.brief_auto_tick()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c_per_tick constant int := 2;
  v_day0  timestamptz := public.brief_auto_day_start();
  v_key   text;
  v_url   text;
  v_jwt   text;
  v_org   uuid;
  v_limit int;
  v_used  int;
  v_take  int;
  v_c     record;
  v_run   uuid;
begin
  perform pg_advisory_xact_lock(hashtext('brief_auto_tick'));

  -- 1. Реклейм: автопрогон pending/running старше 15 мин — pg_net не доставил или воркер
  --    снят по wall clock. CAS по статусу, как в ai-run: завершённое не трогаем.
  update public.ai_runs
     set status = 'error', error = 'upstream|Прогон прерван по таймауту.', finished_at = now()
   where auto_reason is not null and status in ('pending', 'running')
     and created_at < now() - interval '15 minutes';

  -- 2. Дешёвый выход: кандидатов нет — ни секретов, ни HTTP.
  if not exists (select 1 from public.company_brief_candidates()) then
    return;
  end if;

  -- 3. Окружение не настроено — молча выходим: apply 138 безопасен до деплоя ai-run и Vault.
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'brief_auto_key';
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'brief_auto_url';
  select decrypted_secret into v_jwt from vault.decrypted_secrets where name = 'brief_auto_jwt';
  if v_key is null or v_url is null or v_jwt is null then
    return;
  end if;

  -- 4. По организациям: остаток дневного лимита, не больше c_per_tick за тик.
  for v_org in select distinct k.org_id from public.company_brief_candidates() k loop
    v_limit := coalesce(public.brief_auto_daily_limit(v_org), 10);
    select count(*) into v_used from public.ai_runs r
     where r.org_id = v_org and r.auto_reason is not null and r.created_at >= v_day0;
    v_take := least(c_per_tick, v_limit - v_used);
    continue when v_take <= 0;

    for v_c in
      select * from public.company_brief_candidates() k
       where k.org_id = v_org
       order by case k.reason when 'stage' then 1 when 'no_brief' then 2 else 3 end,
                k.next_action_date asc nulls last
       limit v_take
    loop
      begin
        insert into public.ai_runs
          (org_id, preset_key, entity_type, entity_id, status, created_by, auto_reason)
        values
          (v_c.org_id, 'company_brief', 'company', v_c.company_id, 'pending', v_c.author_id, v_c.reason)
        returning id into v_run;
      exception when unique_violation then
        continue;  -- активный прогон появился между выборкой и вставкой (ручной клик)
      end;

      -- pg_net шлёт после коммита: строка к приходу запроса уже видна ai-run.
      perform net.http_post(
        url                  := v_url,
        headers              := jsonb_build_object(
                                  'content-type',   'application/json',
                                  'Authorization',  'Bearer ' || v_jwt,
                                  'X-Dispatch-Key', v_key),
        body                 := jsonb_build_object('run_id', v_run),
        timeout_milliseconds := 10000
      );
    end loop;
  end loop;
end $$;

comment on function public.brief_auto_tick() is
  'S-BRIEF-IN-DEAL-1.1 (138): автозапуск брифа компании. Реклейм зависших автопрогонов → '
  'кандидаты company_brief_candidates() → не больше 2 за тик в пределах дневного лимита org → '
  'INSERT ai_runs (auto_reason) + pg_net в ai-run (X-Dispatch-Key). Секреты — Vault '
  'brief_auto_key / brief_auto_url / brief_auto_jwt. Ошибки не глотаются: их видно в cron.job_run_details.';

revoke all on function public.brief_auto_tick() from public, anon, authenticated;
grant execute on function public.brief_auto_tick() to service_role;

------------------------------------------------------------------------
-- 7. Крон — раз в час 08:40–19:40 МСК (05:40–16:40 UTC), 12 тиков в сутки.
--    Минута :40 не пересекается с суточными уборками 06:00–06:25 UTC и пятиминутными
--    джобами; ≤ 2 прогона за тик — не залпом (лимит провайдера по токенам в минуту).
------------------------------------------------------------------------
select cron.schedule('brief-auto', '40 5-16 * * *', $cmd$select public.brief_auto_tick()$cmd$);
