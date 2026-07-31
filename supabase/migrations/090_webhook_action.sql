-- 090: вебхук как действие движка автоматизаций (S-R2-WEBHOOK-ACTION, R2-P2, эпик B2).
-- Транспорт (088/089 + edge webhook-dispatch) сдан; здесь к нему подключается движок
-- правил: шестое action_type = 'webhook' кладёт строку в webhook_deliveries, дальше
-- работает уже готовая очередь.
--
-- ⚠️ СИГНАТУРА ЯДРА МЕНЯЕТСЯ. wf_apply_project_action получает пятый параметр
--    p_changes. `create or replace` с новым параметром создал бы ПЕРЕГРУЗКУ, а не
--    замену: старые вызовы `perform wf_apply_project_action(a,b,c,d)` стали бы
--    неоднозначными (подходит и 4-арная, и 5-арная с default) → 42725
--    «function ... is not unique», и движок встал бы ЦЕЛИКОМ, включая работающие
--    create_task/notify/set_field/suggest_spawn. Поэтому здесь обязательны
--    DROP 4-арной + перепись ОБОИХ вызывающих планировщиков в этой же миграции.
--
-- ⚠️ ОБЛАСТЬ ДЕЙСТВИЯ: webhook поддержан для четырёх триггеров — stage_entered,
--    status_changed, field_changed, days_in_stage. task_overdue НЕ поддержан:
--    run_overdue_automations (051) не зовёт wf_apply_project_action вовсе и жёстко
--    режет action_type not in ('notify','create_activity'). Правило «просрочка +
--    вебхук» молча не сработало бы никогда — худший из возможных исходов. UI и Zod
--    его уже запрещают; 051 здесь НЕ правится.
--
-- ⚠️ ОТКАТ: обратный порядок — вернуть 4-арную wf_apply_project_action и оба
--    планировщика ДОСЛОВНО из 079 (единственный источник текста, не «по памяти»),
--    затем сузить CHECK обратно:
--      update public.automation_rules set is_active = false where action_type = 'webhook';
--      delete from public.automation_rules where action_type = 'webhook';
--    (re-narrow CHECK'а упадёт, пока в таблице есть строки с 'webhook').

------------------------------------------------------------------------
-- 1. CHECK: шестое действие
------------------------------------------------------------------------
-- Пять существующих значений — дословно из 079:26-27, не по памяти.
-- trigger_type не трогаем: набор триггеров не меняется.
alter table public.automation_rules drop constraint if exists automation_rules_action_type_check;
alter table public.automation_rules add constraint automation_rules_action_type_check
  check (action_type in ('create_task','notify','create_activity','set_field','suggest_spawn','webhook'));

------------------------------------------------------------------------
-- 2. webhook_event_name — trigger_type → ДОМЕННОЕ имя события
------------------------------------------------------------------------
-- Наружу уходит доменное имя, а не имя триггера: набор trigger_type менялся
-- четырежды (baseline → 050 → 051 → 079), и получатель не должен ломаться от
-- внутренних переименований (арх-док §3.2).
--
-- ⚠️ ТОЧКА СИНХРОНИЗАЦИИ SQL ↔ TS. Та же карта живёт в
--    src/types/database.ts → WEBHOOK_EVENT_BY_TRIGGER. Меняется здесь — меняется там.
--
-- else → 'deal.updated': неизвестный триггер не должен ронять доставку, но и врать
-- конкретным именем не должен.
create or replace function public.webhook_event_name(p_trigger_type text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_trigger_type
    when 'stage_entered'  then 'deal.stage_changed'
    when 'status_changed' then 'deal.status_changed'
    when 'field_changed'  then 'deal.field_changed'
    when 'days_in_stage'  then 'deal.stuck_in_stage'
    else 'deal.updated'
  end;
$$;

revoke all on function public.webhook_event_name(text) from public, anon, authenticated;
grant execute on function public.webhook_event_name(text) to service_role;

comment on function public.webhook_event_name(text) is
  'trigger_type → доменное имя события вебхука (090). ТОЧКА СИНХРОНИЗАЦИИ с '
  'WEBHOOK_EVENT_BY_TRIGGER в src/types/database.ts.';

------------------------------------------------------------------------
-- 3. build_deal_webhook_payload — тело исходящего события
------------------------------------------------------------------------
-- Форма — арх-док §3.2 дословно. DEFINER: резолвит имена из profiles/companies/
-- contacts/pipeline_stages, а зовётся из DEFINER-контекста движка.
--
-- ⚠️ WHITELIST data ЗАКРЫТЫЙ. Наружу НЕ уходят pinned_note, loss_detail,
--    won_detail, lost_reason, loss_reason, won_reason, do_url, do_external_id,
--    delivery_kind, progress_* — внутренние заметки, формулировки причин проигрыша
--    и ссылки на 1С:ДО не дело внешней системы (§4.4). Новая колонка в projects
--    в вебхук сама НЕ попадёт, и это свойство, а не забывчивость.
--
-- ⚠️ budget — В КОПЕЙКАХ, как лежит в БД. Отдавать «удобные рубли» значит завести
--    второе представление денег в системе, где уже есть путаница.
--
-- ⚠️ occurred_at — to_char(… at time zone 'UTC', …), НЕ ::text: для timestamptz
--    ::text зависит от session TimeZone/DateStyle, и значение из UI (MSK) не
--    совпало бы со значением из cron (UTC). Грабля 079/084/088; здесь она стоила бы
--    подписи — получатель сверяет тело побайтово.
create or replace function public.build_deal_webhook_payload(
  p_project_id  uuid,
  p_event       text,
  p_delivery_id uuid,
  p_rule_id     uuid,
  p_rule_name   text,
  p_changes     jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  pr        public.projects%rowtype;
  v_stage   jsonb;
  v_owner   jsonb;
  v_company jsonb;
  v_contact jsonb;
  v_name    text;
  v_payload jsonb;
begin
  select * into pr from public.projects where id = p_project_id;
  if not found then
    return null;   -- вызывающий пропускает вставку; payload NOT NULL не нарушаем
  end if;

  -- Резолв имён — теми же таблицами и колонками, что в 087:112-132.
  -- Удалённая/отсутствующая ссылка даёт NULL-ключ, падать нельзя.
  if pr.stage_id is not null then
    select jsonb_build_object('id', s.id, 'name', s.name) into v_stage
    from public.pipeline_stages s where s.id = pr.stage_id;
  end if;

  if pr.owner_id is not null then
    select jsonb_build_object('id', p.id, 'name', p.full_name) into v_owner
    from public.profiles p where p.id = pr.owner_id;
  end if;

  if pr.company_id is not null then
    select jsonb_build_object('id', c.id, 'name', c.name) into v_company
    from public.companies c where c.id = pr.company_id;
  end if;

  if pr.contact_id is not null then
    select nullif(btrim(concat_ws(' ', ct.first_name, ct.last_name)), '')
      into v_name
    from public.contacts ct where ct.id = pr.contact_id;
    if found then
      v_contact := jsonb_build_object('id', pr.contact_id, 'name', v_name);
    end if;
  end if;

  v_payload := jsonb_build_object(
    'version',     1,
    'id',          p_delivery_id,
    'event',       p_event,
    'occurred_at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'org_id',      pr.org_id,
    'rule',        jsonb_build_object('id', p_rule_id, 'name', p_rule_name),
    'entity',      jsonb_build_object('type', 'deal', 'id', pr.id),
    'data',        jsonb_build_object(
      'name',             pr.name,
      'status',           pr.status,
      'budget',           pr.budget,
      'probability',      pr.probability,
      'direction',        pr.direction::text,
      'deadline',         pr.deadline,
      'next_action_date', pr.next_action_date,
      'next_step',        pr.next_step,
      'stage',            v_stage,
      'owner',            v_owner,
      'company',          v_company,
      'contact',          v_contact
    )
  );

  -- changes уходит как пришёл (формат 087: {from, to, from_name, to_name}).
  -- Диффа нет ⇒ ключа в payload нет вовсе, а не "changes": null.
  if p_changes is not null and jsonb_typeof(p_changes) <> 'null' then
    v_payload := v_payload || jsonb_build_object('changes', p_changes);
  end if;

  return v_payload;
end $$;

revoke all on function public.build_deal_webhook_payload(uuid, text, uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.build_deal_webhook_payload(uuid, text, uuid, uuid, text, jsonb)
  to service_role;

comment on function public.build_deal_webhook_payload(uuid, text, uuid, uuid, text, jsonb) is
  'Тело исходящего вебхука по сделке (090, арх-док §3.2). Whitelist data закрытый: '
  'pinned_note / loss_* / won_* / do_* наружу не уходят. budget в копейках.';

------------------------------------------------------------------------
-- 4. wf_apply_project_action — 4-арная УДАЛЯЕТСЯ, создаётся 5-арная
------------------------------------------------------------------------
-- DROP обязателен (см. шапку): иначе перегрузка и «function is not unique».
drop function if exists public.wf_apply_project_action(uuid, uuid, uuid, text);

-- Тело 079 дословно + шестая ветка 'webhook' и параметр p_changes.
-- Остальные пять действий и аудит (e) не тронуты — это проверяется дифом.
create or replace function public.wf_apply_project_action(
  p_rule_id     uuid,
  p_project_id  uuid,
  p_run_id      uuid,
  p_trigger_key text,
  p_changes     jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r             public.automation_rules%rowtype;
  pr            public.projects%rowtype;
  v_actor       uuid;
  v_task_id     uuid;
  v_text        text;
  v_assignee    uuid;
  v_lane        public.task_lane;
  v_priority    public.task_priority;
  v_due         int;
  v_recipient   uuid;
  v_set_field   text;
  v_set_val     text;
  -- 090: webhook-ветка
  v_ep          uuid;
  v_delivery_id uuid;
  v_event       text;
  v_payload     jsonb;
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

  elsif r.action_type = 'webhook' then
    ----------------------------------------------------------------
    -- 090: каждый активный получатель из action_config.endpoint_ids —
    --      отдельная строка очереди со своим delivery_id и своим ретраем.
    ----------------------------------------------------------------
    v_event := public.webhook_event_name(r.trigger_type);

    -- ⚠️ Сверка по e.id::text, а НЕ каст элемента массива в uuid. FK на jsonb не
    --    поставить, и мусор в endpoint_ids неизбежен; `(…)::uuid` на не-uuid бросил
    --    бы исключение, которое per-rule обработчик проглотил бы УЖЕ ПОСЛЕ вставки
    --    в automation_runs → правило стало бы no-op навсегда, без доставки и без
    --    аудита. Здесь мусор просто не находит ни одного endpoint'а.
    -- ⚠️ e.org_id = pr.org_id — граница арендатора: чужой uuid в конфиге не должен
    --    находить чужой endpoint.
    -- ⚠️ e.is_active — endpoint, авто-отключённый после 20 провалов (088), строк не
    --    порождает вовсе.
    for v_ep in
      select e.id
      from public.webhook_endpoints e
      where e.org_id = pr.org_id
        and e.is_active
        and e.id::text in (
          select jsonb_array_elements_text(
            case when jsonb_typeof(r.action_config->'endpoint_ids') = 'array'
                 then r.action_config->'endpoint_ids'
                 else '[]'::jsonb
            end
          )
        )
    loop
      v_delivery_id := gen_random_uuid();
      v_payload := public.build_deal_webhook_payload(
        pr.id, v_event, v_delivery_id, r.id, r.name, p_changes
      );
      continue when v_payload is null;   -- сделка исчезла между чтениями

      -- ⚠️ next_retry_at = now(): условие очереди — next_retry_at <= now(), и без
      --    штампа строку не увидел бы ни один тик.
      -- ⚠️ dispatch_webhooks_tick() здесь НЕ зовётся намеренно: одна массовая правка
      --    сделок дала бы столько HTTP-вызовов диспетчера, сколько строк. Доставку
      --    подберёт минутная джоба webhook-retry (089) — задержка до 60 с для
      --    автоматизации приемлема, в отличие от кнопки «Отправить тест», где
      --    пользователь смотрит на экран (там немедленный тик остаётся).
      insert into public.webhook_deliveries
        (id, org_id, endpoint_id, rule_id, event, payload, status, attempt, next_retry_at)
      values (
        v_delivery_id, pr.org_id, v_ep, r.id,
        v_event, v_payload,
        'pending', 0, now()
      );
    end loop;

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

-- ⚠️ Гранты уходят вместе с DROP'нутой функцией — повторяем паттерн 079 на новой сигнатуре.
revoke all on function public.wf_apply_project_action(uuid, uuid, uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.wf_apply_project_action(uuid, uuid, uuid, text, jsonb)
  to service_role;

------------------------------------------------------------------------
-- 5. run_stage_automations — тело 079 с ОДНОЙ смысловой правкой: сбор changes
--    и вызов 5-арной wf_apply_project_action.
--    Матч триггеров, conditions, re-entrancy guard (wf.ran), идемпотентный run,
--    per-rule `exception when others then continue` и внешний `return new` —
--    БЕЗ изменений. Никаких «попутных улучшений»: это проверяется дифом.
--    DEFINER/search_path обязательны: CREATE OR REPLACE перезаписывает security attrs.
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
  v_new       jsonb;
  v_old       jsonb;
  v_matched   boolean;
  v_key       text;
  v_field     text;
  -- 090: дифф для webhook-действия
  v_changes   jsonb;
  v_from_name text;
  v_to_name   text;
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
      -- (c2) 090: дифф для payload вебхука. Считается ТОЛЬКО под webhook-действие —
      --      резолв имён стадий на каждом create_task был бы платой ни за что.
      --      OLD внутри wf_apply_project_action недоступен (она перечитывает строку),
      --      поэтому дифф передаётся сверху.
      ------------------------------------------------------------------
      v_changes := null;
      if v_rule.action_type = 'webhook' then
        if v_rule.trigger_type = 'stage_entered' then
          select s.name into v_from_name from public.pipeline_stages s where s.id = old.stage_id;
          select s.name into v_to_name   from public.pipeline_stages s where s.id = new.stage_id;
          v_changes := jsonb_build_object(
            'stage_id', jsonb_build_object(
              'from',      old.stage_id::text,
              'to',        new.stage_id::text,
              'from_name', v_from_name,
              'to_name',   v_to_name
            )
          );
        elsif v_rule.trigger_type = 'status_changed' then
          v_changes := jsonb_build_object(
            'status', jsonb_build_object('from', v_old->>'status', 'to', v_new->>'status')
          );
        elsif v_rule.trigger_type = 'field_changed' then
          v_changes := jsonb_build_object(
            v_field, jsonb_build_object('from', v_old->>v_field, 'to', v_new->>v_field)
          );
        end if;
      end if;

      ------------------------------------------------------------------
      -- (d)+(e) действие + аудит — общая часть (079, сигнатура 090)
      ------------------------------------------------------------------
      perform public.wf_apply_project_action(v_rule.id, new.id, v_run_id, v_key, v_changes);

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
-- 6. run_dwell_automations — тело 079 с ОДНОЙ правкой: вызов 5-арной версии
--    с p_changes = NULL. «Застряла на стадии» — не изменение поля, диффа нет по
--    смыслу, и в payload ключа changes тогда просто не будет.
--    Скоуп, пороги, идемпотентность по пребыванию и guard wf.ran — без изменений.
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

          -- 090: p_changes = NULL — у «застревания» диффа нет по смыслу.
          perform public.wf_apply_project_action(r.id, p.id, v_run_id, v_key, null);

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
-- 7. delete_webhook_endpoint — чистит ссылки на удалённый endpoint в правилах
------------------------------------------------------------------------
-- До 090 endpoint нигде, кроме своей строки, не упоминался. Теперь его id лежит в
-- automation_rules.action_config->'endpoint_ids' (jsonb, FK не поставить), и после
-- удаления там остался бы мёртвый uuid.
--
-- Правило, оставшееся БЕЗ получателей, деактивируется. Это осознанный выбор против
-- «пусть висит»: активное правило, которое гарантированно ничего не делает, в списке
-- автоматизаций выглядит рабочим и вводит в заблуждение.
--
-- Всё остальное (гейт роли, удаление секрета из Vault, каскад журнала доставок) —
-- дословно из 088.
create or replace function public.delete_webhook_endpoint(p_endpoint_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org       uuid := ( select public.current_org_id() );
  v_role      text := ( select public.current_org_role() );
  v_secret_id uuid;
begin
  if v_org is null or v_role is null then
    raise exception 'webhook_endpoint_denied: no active org' using errcode = '42501';
  end if;
  if v_role not in ('owner','admin') then
    raise exception 'webhook_endpoint_denied: owner or admin required' using errcode = '42501';
  end if;

  delete from public.webhook_endpoints
  where id = p_endpoint_id and org_id = v_org
  returning secret_id into v_secret_id;

  if not found then
    raise exception 'webhook_endpoint_denied: not found' using errcode = '42501';
  end if;

  delete from vault.secrets where id = v_secret_id;

  -- 090: убрать id из endpoint_ids всех webhook-правил этой org.
  -- jsonb_agg по пустому остатку даёт NULL → coalesce до '[]'.
  update public.automation_rules r
  set action_config = jsonb_set(
        r.action_config,
        '{endpoint_ids}',
        coalesce(
          ( select jsonb_agg(x)
            from jsonb_array_elements_text(r.action_config->'endpoint_ids') t(x)
            where x <> p_endpoint_id::text ),
          '[]'::jsonb
        )
      )
  where r.org_id = v_org
    and r.action_type = 'webhook'
    and jsonb_typeof(r.action_config->'endpoint_ids') = 'array'
    and r.action_config->'endpoint_ids' ? p_endpoint_id::text;

  -- 090: правило без получателей — выключить.
  -- jsonb_array_length на не-массиве бросает 22023, поэтому через CASE по typeof.
  update public.automation_rules
  set is_active = false
  where org_id = v_org
    and action_type = 'webhook'
    and is_active
    and coalesce(
          case when jsonb_typeof(action_config->'endpoint_ids') = 'array'
               then jsonb_array_length(action_config->'endpoint_ids')
          end, 0) = 0;
end $$;

comment on function public.delete_webhook_endpoint(uuid) is
  'Удаляет endpoint вместе с его секретом в Vault (088) и вычищает его id из '
  'endpoint_ids всех webhook-правил org; правило, оставшееся без получателей, '
  'деактивируется (090). Прямой DELETE у authenticated отозван. Журнал доставок — каскадом.';

-- 088 называл send_test_webhook «единственным входом в очередь» — с 090 это неверно.
comment on function public.send_test_webhook(uuid) is
  'Ставит в очередь тестовую доставку (event webhook.test) и немедленно дёргает '
  'dispatch_webhooks_tick(). С 090 не единственный вход в очередь: боевые события '
  'кладёт действие webhook движка автоматизаций (там немедленный тик НЕ зовётся).';
