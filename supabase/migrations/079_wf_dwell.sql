-- 079: days_in_stage + suggest_spawn (S-R2-WF-DWELL, R2-P0-E).
-- Расширение работающего движка 050/051, не переписывание:
--   • новый триггер days_in_stage — «сделка застряла на стадии N дней» (pg_cron, как 051);
--   • новое действие suggest_spawn — HITL-уведомление «предложи создать внедрение».
--
-- ⚠️ ИНВАРИАНТ I8: авто-спавн внедрения ЗАПРЕЩЁН. suggest_spawn создаёт ТОЛЬКО
--    notification; вызова spawn_delivery_project из автоматизаций нет и не будет
--    (delivery_kind выбирает РП руками). Действие spawn_delivery не заводить.
--
-- ⚠️ ОБРАТИМОСТЬ: откат (re-narrow CHECK'ов) упадёт, если в таблицах уже есть
--    строки с новыми значениями. Перед откатом выполнить:
--      delete from public.automation_rules where trigger_type = 'days_in_stage';
--      update public.automation_rules set action_type = 'notify' where action_type = 'suggest_spawn';
--      delete from public.notifications where type = 'spawn_suggest';
--      select cron.unschedule('wf-dwell-daily');
--    и вернуть тело run_stage_automations из 050 (шаг 3 ниже его переписывает).

------------------------------------------------------------------------
-- 1. CHECK'и: расширяем полным списком (имена сверены по pg_constraint 2026-07-27)
------------------------------------------------------------------------
alter table public.automation_rules drop constraint if exists automation_rules_trigger_type_check;
alter table public.automation_rules add constraint automation_rules_trigger_type_check
  check (trigger_type in ('stage_entered','status_changed','field_changed','task_overdue','days_in_stage'));

alter table public.automation_rules drop constraint if exists automation_rules_action_type_check;
alter table public.automation_rules add constraint automation_rules_action_type_check
  check (action_type in ('create_task','notify','create_activity','set_field','suggest_spawn'));

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('task_assigned','project_assigned','deal_won','automation','spawn_suggest'));

------------------------------------------------------------------------
-- 2. Индекс под ежедневный dwell-скан (зеркало idx_tasks_overdue из 051).
--    Предикат — константный по колонкам type/status, чтобы скан открытых
--    client-сделок шёл по индексу, а не seq scan по всем projects.
------------------------------------------------------------------------
create index if not exists idx_projects_dwell
  on public.projects (org_id, stage_entered_at)
  where type = 'client' and status = 'open' and stage_entered_at is not null;

------------------------------------------------------------------------
-- 3. wf_apply_project_action — ОБЩАЯ часть действий над сделкой.
--    Вынесена из блока (d)+(e) run_stage_automations (050) один-в-один, чтобы
--    dwell-планировщик не дублировал код действий (иначе разъедутся).
--    Отличия от исходного блока: работает не с NEW, а с перечитанной строкой
--    projects (в AFTER UPDATE это та же строка — триггер trg_zz_run_automations
--    видит уже записанное значение), и знает про suggest_spawn.
--
--    Параметры — id, а не composite: PL/pgSQL-record из `for v_rule in select *`
--    не типизирован, а перечитать rule/project по PK стоит два index-lookup'а
--    и случается только на РЕАЛЬНО сработавшем правиле (после идемпотентного run).
--
--    DEFINER + search_path обязательны: зовётся и из триггера, и из cron.
------------------------------------------------------------------------
create or replace function public.wf_apply_project_action(
  p_rule_id     uuid,
  p_project_id  uuid,
  p_run_id      uuid,
  p_trigger_key text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r           public.automation_rules%rowtype;
  pr          public.projects%rowtype;
  v_actor     uuid;
  v_task_id   uuid;
  v_text      text;
  v_assignee  uuid;
  v_lane      public.task_lane;
  v_priority  public.task_priority;
  v_due       int;
  v_recipient uuid;
  v_set_field text;
  v_set_val   text;
begin
  select * into r from public.automation_rules where id = p_rule_id;
  if not found then return; end if;
  select * into pr from public.projects where id = p_project_id;
  if not found then return; end if;

  -- В cron-контексте auth.uid() = NULL → actor из владельца сделки (как 050).
  v_actor := coalesce(auth.uid(), pr.owner_id, pr.created_by);

  ------------------------------------------------------------------
  -- (d) диспатч действия
  ------------------------------------------------------------------
  if r.action_type = 'create_task' then
    v_text := replace(
      coalesce(r.action_config->>'task_text', 'Задача по сделке {deal}'),
      '{deal}', coalesce(pr.name, '')
    );
    v_assignee := case r.action_config->>'assignee'
      when 'deal_creator' then pr.created_by
      else coalesce(pr.owner_id, pr.created_by)          -- 'deal_owner' + дефолт
    end;
    v_lane := case r.action_config->>'lane'
      when 'next' then 'next'::public.task_lane
      when 'wait' then 'wait'::public.task_lane
      when 'done' then 'done'::public.task_lane
      else 'now'::public.task_lane
    end;
    v_priority := case r.action_config->>'priority'
      when 'important' then 'important'::public.task_priority
      when 'critical'  then 'critical'::public.task_priority
      else 'normal'::public.task_priority
    end;
    v_due := coalesce((r.action_config->>'due_in_days')::int, 3);

    insert into public.tasks
      (text, lane, priority, project_id, company_id, contact_id, deadline, assigned_to, org_id)
    values
      (v_text, v_lane, v_priority, pr.id, pr.company_id, pr.contact_id,
       (current_date + v_due)::timestamptz, v_assignee, pr.org_id)
    returning id into v_task_id;

    if p_run_id is not null then
      update public.automation_runs set task_id = v_task_id where id = p_run_id;
    end if;

  elsif r.action_type = 'notify' then
    v_recipient := case r.action_config->>'recipient'
      when 'deal_creator' then pr.created_by
      else coalesce(pr.owner_id, pr.created_by)
    end;
    if v_recipient is not null then
      insert into public.notifications
        (org_id, recipient_id, actor_id, type, entity_type, entity_id, payload)
      values (
        pr.org_id, v_recipient, v_actor,
        'automation', 'projects', pr.id,
        jsonb_build_object(
          'title', coalesce(pr.name, ''),
          'text',  replace(coalesce(r.action_config->>'text', ''), '{deal}', coalesce(pr.name, ''))
        )
      );
    end if;

  elsif r.action_type = 'create_activity' then
    -- заметка в CRM-таймлайн (activities.type='note'; title NOT NULL).
    -- activity_log 'automation_fired' ниже — отдельный аудит, не путать.
    insert into public.activities
      (type, title, description, company_id, contact_id, project_id, created_by, org_id)
    values (
      'note'::public.activity_type,
      replace(coalesce(r.action_config->>'title', 'Автоматизация по {deal}'), '{deal}', coalesce(pr.name, '')),
      r.action_config->>'description',
      pr.company_id, pr.contact_id, pr.id,
      v_actor,
      pr.org_id
    );

  elsif r.action_type = 'set_field' then
    -- WHITELIST жёстким CASE (никакого dynamic SQL с сырым именем поля).
    -- НИКОГДА stage_id/status/type/org_id.
    -- ⚠️ probability на dwell-правиле переживёт только до следующей смены стадии:
    --    trg_sync_deal_stage_fields перезапишет её значением из стадии.
    v_set_field := r.action_config->>'field';
    v_set_val   := r.action_config->>'value';
    if v_set_field = 'next_step' then
      update public.projects set next_step = v_set_val where id = pr.id;
    elsif v_set_field = 'pinned_note' then
      update public.projects set pinned_note = v_set_val where id = pr.id;
    elsif v_set_field = 'next_action_date' then
      update public.projects set next_action_date = nullif(v_set_val, '')::date where id = pr.id;
    elsif v_set_field = 'probability' then
      update public.projects set probability = nullif(v_set_val, '')::int where id = pr.id;
    end if;   -- поле вне whitelist → ничего не делаем

  elsif r.action_type = 'suggest_spawn' then
    -- I8: ТОЛЬКО уведомление. Проект внедрения здесь не создаётся никогда —
    -- РП открывает визард по deep link и выбирает контур/шаблон/владельца сам.
    v_recipient := coalesce(pr.owner_id, pr.created_by);
    if v_recipient is not null then
      insert into public.notifications
        (org_id, recipient_id, actor_id, type, entity_type, entity_id, payload)
      values (
        pr.org_id, v_recipient, v_actor,
        'spawn_suggest', 'projects', pr.id,
        jsonb_build_object(
          'title', coalesce(pr.name, ''),
          'text',  replace(coalesce(r.action_config->>'text', ''), '{deal}', coalesce(pr.name, ''))
        )
      );
    end if;

  end if;

  ------------------------------------------------------------------
  -- (e) аудит
  ------------------------------------------------------------------
  insert into public.activity_log (project_id, user_id, event_type, payload, org_id)
  values (
    pr.id, v_actor, 'automation_fired',
    jsonb_build_object('rule_id', r.id, 'trigger', r.trigger_type,
                       'action', r.action_type, 'trigger_key', p_trigger_key),
    pr.org_id
  );
end $$;

revoke all on function public.wf_apply_project_action(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.wf_apply_project_action(uuid, uuid, uuid, text) to service_role;

------------------------------------------------------------------------
-- 4. run_stage_automations — тело 050 с одной правкой: блоки (d)+(e)
--    заменены вызовом wf_apply_project_action. Матч триггеров, conditions,
--    re-entrancy guard и идемпотентный run — БЕЗ изменений.
--    DEFINER/search_path обязательны: CREATE OR REPLACE перезаписывает security attrs.
------------------------------------------------------------------------
create or replace function public.run_stage_automations()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rule    record;
  v_run_id  uuid;
  v_new     jsonb;
  v_old     jsonb;
  v_matched boolean;
  v_key     text;
  v_field   text;
begin
  -- RE-ENTRANCY GUARD: set_field делает UPDATE projects → снова AFTER UPDATE.
  -- transaction-local флаг отсекает повторный проход (v1: один проход на txn).
  if current_setting('wf.ran', true) = '1' then
    return new;
  end if;
  perform set_config('wf.ran', '1', true);

  v_new := to_jsonb(new);
  v_old := to_jsonb(old);

  -- ЧИТАЕМ ВСЕ активные правила org, матчим в PL/pgSQL (не в WHERE, т.к.
  -- разные trigger_type). days_in_stage сюда не попадает — это cron-триггер.
  for v_rule in
    select * from public.automation_rules
    where org_id = new.org_id and is_active and trigger_type <> 'days_in_stage'
  loop
    begin  -- per-rule изоляция: падение одного правила не гасит остальные
      ------------------------------------------------------------------
      -- (a) матч триггера + trigger_key
      ------------------------------------------------------------------
      v_matched := false;
      v_key := null;

      if v_rule.trigger_type = 'stage_entered' then
        if new.stage_id is distinct from old.stage_id
           and new.stage_id is not null
           and (v_rule.trigger_config->>'stage_id')::uuid = new.stage_id then
          v_matched := true;
          v_key := new.stage_id::text;
        end if;

      elsif v_rule.trigger_type = 'status_changed' then
        if new.status is distinct from old.status
           and ( v_rule.trigger_config->>'to' is null
                 or v_rule.trigger_config->>'to' = new.status ) then
          v_matched := true;
          v_key := coalesce(new.status, '__null__');
        end if;

      elsif v_rule.trigger_type = 'field_changed' then
        v_field := v_rule.trigger_config->>'field';
        if v_field is not null
           and (v_new->>v_field) is distinct from (v_old->>v_field) then
          v_matched := true;
          v_key := coalesce(v_new->>v_field, '__null__');   -- очистка поля → sentinel, не NULL
        end if;
      end if;

      if not v_matched then
        continue;
      end if;

      ------------------------------------------------------------------
      -- (b) conditions (AND-предикаты)
      ------------------------------------------------------------------
      if not public.wf_eval_conditions(v_rule.conditions, v_new) then
        continue;
      end if;

      ------------------------------------------------------------------
      -- (c) идемпотентный run (одно срабатывание на rule+project+trigger_key)
      ------------------------------------------------------------------
      insert into public.automation_runs (rule_id, org_id, project_id, stage_id, trigger_key)
      values (
        v_rule.id, new.org_id, new.id,
        case when v_rule.trigger_type = 'stage_entered' then new.stage_id else null end,
        v_key
      )
      on conflict (rule_id, project_id, trigger_key) do nothing
      returning id into v_run_id;

      if v_run_id is null then
        continue;                              -- уже стреляло по этому trigger_key
      end if;

      ------------------------------------------------------------------
      -- (d)+(e) действие + аудит — общая часть (079)
      ------------------------------------------------------------------
      perform public.wf_apply_project_action(v_rule.id, new.id, v_run_id, v_key);

    exception when others then
      continue;                                -- правило упало → молча дальше
    end;
  end loop;

  return new;

exception when others then
  return new;                                  -- автоматизация НИКОГДА не блокирует UPDATE
end $$;

revoke all on function public.run_stage_automations() from public, anon, authenticated;
grant execute on function public.run_stage_automations() to service_role;

------------------------------------------------------------------------
-- 5. run_dwell_automations() — планировщик «застряла на стадии» (не триггер).
--    Зеркало run_overdue_automations (051): скан → правила org → conditions →
--    идемпотентный run → общая часть действий.
--
--    Скоуп: открытые (status='open') client-сделки; won/lost не «застревают».
--    Порог: now() - stage_entered_at >= min_days. Опциональный stage_id в
--    trigger_config сужает до одной стадии.
--
--    ИДЕМПОТЕНТНОСТЬ — один раз за ПРЕБЫВАНИЕ на стадии:
--      trigger_key = stage_id || '@' || to_char(stage_entered_at at time zone 'UTC', …)
--    (stage_entered_at обновляет sync_project_stage() при каждой смене стадии;
--    UTC-рендер обязателен — см. комментарий у v_key ниже).
--    Существующий unique (rule_id, project_id, trigger_key) из 050 покрывает всё:
--    project_id здесь всегда not null, partial-unique из 051 не нужен.
--    Два следствия — это НЕ баги:
--      • смена min_days в правиле не вызовет повторного срабатывания на том же
--        пребывании (ключ не зависит от порога);
--      • возврат на ту же стадию обновляет stage_entered_at → правило сработает
--        снова (желаемое поведение).
------------------------------------------------------------------------
create or replace function public.run_dwell_automations()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r        record;
  p        record;
  v_min    int;
  v_stage  uuid;
  v_key    text;
  v_run_id uuid;
begin
  -- Действие set_field делает UPDATE projects → сработал бы trg_zz_run_automations.
  -- Ставим тот же transaction-local флаг, что и 050: dwell-проход не порождает
  -- каскад стадийных автоматизаций (семантика «один проход автоматизаций на txn»).
  perform set_config('wf.ran', '1', true);

  for r in
    select * from public.automation_rules
    where is_active and trigger_type = 'days_in_stage'
  loop
    begin  -- per-rule изоляция
      v_min := nullif(r.trigger_config->>'min_days', '')::int;
      if v_min is null or v_min < 1 then
        continue;                                   -- правило без порога — не стреляем
      end if;
      v_stage := nullif(r.trigger_config->>'stage_id', '')::uuid;

      for p in
        select * from public.projects
        where org_id = r.org_id
          and type = 'client'
          and status = 'open'
          and stage_id is not null
          and stage_entered_at is not null
          and now() - stage_entered_at >= make_interval(days => v_min)
          and (v_stage is null or stage_id = v_stage)
      loop
        begin  -- per (rule, project) изоляция
          -- условия — против СДЕЛКИ (поля projects), как у stage_entered
          if not public.wf_eval_conditions(r.conditions, to_jsonb(p)) then
            continue;
          end if;

          -- ⚠️ НЕ `stage_entered_at::text`: рендер timestamptz зависит от session
          -- TimeZone/DateStyle → ключ у cron и у ручного прогона разъехался бы и
          -- правило стрельнуло бы дважды за одно пребывание. Фиксируем UTC + to_char
          -- (оба поля NOT NULL по WHERE выше).
          v_key := p.stage_id::text || '@'
                   || to_char(p.stage_entered_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US');

          insert into public.automation_runs (rule_id, org_id, project_id, stage_id, trigger_key)
          values (r.id, p.org_id, p.id, p.stage_id, v_key)
          on conflict (rule_id, project_id, trigger_key) do nothing
          returning id into v_run_id;

          if v_run_id is null then
            continue;                               -- уже стреляло на этом пребывании
          end if;

          perform public.wf_apply_project_action(r.id, p.id, v_run_id, v_key);

        exception when others then
          continue;
        end;
      end loop;

    exception when others then
      continue;
    end;
  end loop;
exception when others then
  return;  -- планировщик целиком никогда не падает
end $$;

revoke all on function public.run_dwell_automations() from public, anon, authenticated;
grant execute on function public.run_dwell_automations() to service_role;

------------------------------------------------------------------------
-- 6. pg_cron: 10 6 * * * — после wf-overdue-daily (0 6) и recurring-daily (5 6),
--    чтобы джобы не дрались за одну минуту.
------------------------------------------------------------------------
do $$
begin
  perform cron.unschedule('wf-dwell-daily');
exception when others then null;  -- job ещё нет — ок
end $$;

select cron.schedule('wf-dwell-daily', '10 6 * * *', 'select public.run_dwell_automations();');
