-- 050: Workflow Engine (S-WF-2A) — обобщение S29-движка automation_rules/runs.
-- Триггеры: stage_entered (S29), status_changed, field_changed.
-- Действия: create_task (S29), notify, create_activity, set_field.
-- Условия: conditions JSONB (AND-предикаты). Идемпотентность: trigger_key.

------------------------------------------------------------------------
-- 1. automation_rules: расширить CHECK + conditions
------------------------------------------------------------------------
alter table public.automation_rules drop constraint if exists automation_rules_trigger_type_check;
alter table public.automation_rules add constraint automation_rules_trigger_type_check
  check (trigger_type in ('stage_entered','status_changed','field_changed'));

alter table public.automation_rules drop constraint if exists automation_rules_action_type_check;
alter table public.automation_rules add constraint automation_rules_action_type_check
  check (action_type in ('create_task','notify','create_activity','set_field'));

alter table public.automation_rules
  add column if not exists conditions jsonb not null default '[]'::jsonb;

------------------------------------------------------------------------
-- 2. automation_runs: обобщить идемпотентность на trigger_key
------------------------------------------------------------------------
alter table public.automation_runs add column if not exists trigger_key text;
update public.automation_runs set trigger_key = stage_id::text where trigger_key is null;
alter table public.automation_runs alter column trigger_key set not null;
alter table public.automation_runs alter column stage_id drop not null;

alter table public.automation_runs drop constraint if exists automation_runs_rule_id_project_id_stage_id_key;
alter table public.automation_runs
  add constraint automation_runs_rule_project_key_uniq unique (rule_id, project_id, trigger_key);

------------------------------------------------------------------------
-- 3. notifications.type: +automation (полный список — не сузить)
------------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('task_assigned','project_assigned','deal_won','automation'));

------------------------------------------------------------------------
-- 4. wf_eval_conditions — AND-предикаты против to_jsonb(NEW). Не DEFINER.
------------------------------------------------------------------------
create or replace function public.wf_eval_conditions(p_conds jsonb, p_row jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare c jsonb; f text; op text; v text; rv text;
begin
  if p_conds is null or jsonb_typeof(p_conds) <> 'array' then return true; end if;
  for c in select * from jsonb_array_elements(p_conds) loop
    f := c->>'field'; op := c->>'op'; v := c->>'value'; rv := p_row->>f;
    case op
      when 'is_null'  then if rv is not null then return false; end if;
      when 'not_null' then if rv is null then return false; end if;
      when 'eq'       then if rv is distinct from v then return false; end if;
      when 'neq'      then if rv is not distinct from v then return false; end if;
      when 'contains' then if rv is null or position(v in rv) = 0 then return false; end if;
      when 'gt'       then if rv is null or rv::numeric <= v::numeric then return false; end if;
      when 'lt'       then if rv is null or rv::numeric >= v::numeric then return false; end if;
      when 'gte'      then if rv is null or rv::numeric <  v::numeric then return false; end if;
      when 'lte'      then if rv is null or rv::numeric >  v::numeric then return false; end if;
      else return false;                       -- неизвестный op → не матчим (safe)
    end case;
  end loop;
  return true;
exception when others then
  return false;                                -- битый предикат/каст → не матчим
end $$;

revoke all on function public.wf_eval_conditions(jsonb, jsonb) from public, anon;
grant execute on function public.wf_eval_conditions(jsonb, jsonb) to authenticated, service_role;

------------------------------------------------------------------------
-- 5. run_stage_automations — обобщённый движок (CREATE OR REPLACE тела).
--    Имя и триггер trg_zz_run_automations НЕ трогаем. DEFINER/search_path
--    ОБЯЗАТЕЛЬНО (REPLACE перезаписывает security attrs).
------------------------------------------------------------------------
create or replace function public.run_stage_automations()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rule      record;
  v_run_id    uuid;
  v_task_id   uuid;
  v_new       jsonb;
  v_old       jsonb;
  v_matched   boolean;
  v_key       text;
  v_field     text;
  v_text      text;
  v_assignee  uuid;
  v_lane      public.task_lane;
  v_priority  public.task_priority;
  v_due       int;
  v_recipient uuid;
  v_set_field text;
  v_set_val   text;
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
  -- разные trigger_type). SELECT * — нужны trigger_type/config/action_type/config/conditions.
  for v_rule in
    select * from public.automation_rules
    where org_id = new.org_id and is_active
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
      -- (d) диспатч действия
      ------------------------------------------------------------------
      if v_rule.action_type = 'create_task' then
        -- S29 1:1
        v_text := replace(
          coalesce(v_rule.action_config->>'task_text', 'Задача по сделке {deal}'),
          '{deal}', coalesce(new.name, '')
        );
        v_assignee := case v_rule.action_config->>'assignee'
          when 'deal_creator' then new.created_by
          else coalesce(new.owner_id, new.created_by)          -- 'deal_owner' + дефолт
        end;
        v_lane := case v_rule.action_config->>'lane'
          when 'next' then 'next'::public.task_lane
          when 'wait' then 'wait'::public.task_lane
          when 'done' then 'done'::public.task_lane
          else 'now'::public.task_lane
        end;
        v_priority := case v_rule.action_config->>'priority'
          when 'important' then 'important'::public.task_priority
          when 'critical'  then 'critical'::public.task_priority
          else 'normal'::public.task_priority
        end;
        v_due := coalesce((v_rule.action_config->>'due_in_days')::int, 3);

        insert into public.tasks
          (text, lane, priority, project_id, company_id, contact_id, deadline, assigned_to, org_id)
        values
          (v_text, v_lane, v_priority, new.id, new.company_id, new.contact_id,
           (current_date + v_due)::timestamptz, v_assignee, new.org_id)
        returning id into v_task_id;

        update public.automation_runs set task_id = v_task_id where id = v_run_id;

      elsif v_rule.action_type = 'notify' then
        v_recipient := case v_rule.action_config->>'recipient'
          when 'deal_creator' then new.created_by
          else coalesce(new.owner_id, new.created_by)
        end;
        if v_recipient is not null then
          insert into public.notifications
            (org_id, recipient_id, actor_id, type, entity_type, entity_id, payload)
          values (
            new.org_id, v_recipient,
            coalesce(auth.uid(), new.owner_id, new.created_by),
            'automation', 'projects', new.id,
            jsonb_build_object(
              'title', coalesce(new.name, ''),
              'text',  replace(coalesce(v_rule.action_config->>'text', ''), '{deal}', coalesce(new.name, ''))
            )
          );
        end if;

      elsif v_rule.action_type = 'create_activity' then
        -- заметка в CRM-таймлайн (activities.type='note'; title NOT NULL).
        -- activity_log 'automation_fired' ниже — отдельный аудит, не путать.
        insert into public.activities
          (type, title, description, company_id, contact_id, project_id, created_by, org_id)
        values (
          'note'::public.activity_type,
          replace(coalesce(v_rule.action_config->>'title', 'Автоматизация по {deal}'), '{deal}', coalesce(new.name, '')),
          v_rule.action_config->>'description',
          new.company_id, new.contact_id, new.id,
          coalesce(auth.uid(), new.owner_id, new.created_by),
          new.org_id
        );

      elsif v_rule.action_type = 'set_field' then
        -- WHITELIST жёстким CASE (никакого dynamic SQL с сырым именем поля).
        -- НИКОГДА stage_id/status/type/org_id. Каст — per-field; кривой каст
        -- → per-rule EXCEPTION → continue. Guard (wf.ran) не даст зациклиться.
        v_set_field := v_rule.action_config->>'field';
        v_set_val   := v_rule.action_config->>'value';
        if v_set_field = 'next_step' then
          update public.projects set next_step = v_set_val where id = new.id;
        elsif v_set_field = 'pinned_note' then
          update public.projects set pinned_note = v_set_val where id = new.id;
        elsif v_set_field = 'next_action_date' then
          update public.projects set next_action_date = nullif(v_set_val, '')::date where id = new.id;
        elsif v_set_field = 'probability' then
          update public.projects set probability = nullif(v_set_val, '')::int where id = new.id;
        end if;   -- поле вне whitelist → ничего не делаем

      end if;

      ------------------------------------------------------------------
      -- (e) аудит
      ------------------------------------------------------------------
      insert into public.activity_log (project_id, user_id, event_type, payload, org_id)
      values (
        new.id,
        coalesce(auth.uid(), new.owner_id, new.created_by),
        'automation_fired',
        jsonb_build_object('rule_id', v_rule.id, 'trigger', v_rule.trigger_type,
                           'action', v_rule.action_type, 'trigger_key', v_key),
        new.org_id
      );

    exception when others then
      continue;                                -- правило упало → молча дальше
    end;
  end loop;

  return new;

exception when others then
  return new;                                  -- автоматизация НИКОГДА не блокирует UPDATE
end $$;

-- ACL (REPLACE может сохранить, но фиксируем идемпотентно — как 029)
revoke all on function public.run_stage_automations() from public, anon, authenticated;
grant execute on function public.run_stage_automations() to service_role;
