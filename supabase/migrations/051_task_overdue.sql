-- 051: task_overdue — просроченные задачи (S-WF-2C-A). pg_cron daily → run_overdue_automations.

------------------------------------------------------------------------
-- 1. task_overdue в CHECK trigger_type (action_type НЕ трогаем — notify/create_activity уже в списке)
------------------------------------------------------------------------
alter table public.automation_rules drop constraint if exists automation_rules_trigger_type_check;
alter table public.automation_rules add constraint automation_rules_trigger_type_check
  check (trigger_type in ('stage_entered','status_changed','field_changed','task_overdue'));

------------------------------------------------------------------------
-- 2. automation_runs.project_id → nullable (task_overdue персональных задач).
--    3-колоночный unique (rule_id,project_id,trigger_key) для проектных триггеров
--    остаётся: их executor всегда пишет project_id. task_overdue дедупит explicit
--    NOT EXISTS по (rule_id, trigger_key=task_id) — task_id глобально уникален.
------------------------------------------------------------------------
alter table public.automation_runs alter column project_id drop not null;

-- W2: 3-колоночный unique НЕ дедупит строки с project_id NULL (в PG NULL≠NULL).
-- Для персональных task_overdue-задач страхуем идемпотентность отдельным partial-unique
-- (гонка «ручной прогон + cron»). project-linked overdue покрыт 3-колоночным unique.
create unique index if not exists automation_runs_rule_key_null_project_uniq
  on public.automation_runs (rule_id, trigger_key)
  where project_id is null;

-- W5: partial-индекс под ежедневный скан просрочки (seq scan → index scan при росте tasks).
create index if not exists idx_tasks_overdue
  on public.tasks (org_id, deadline)
  where deadline is not null and lane <> 'done';

------------------------------------------------------------------------
-- 3. run_overdue_automations() — планировщик (SECURITY DEFINER, зовёт pg_cron, НЕ триггер).
--    Скан просроченных → task_overdue-правила org → conditions(task) → идемпотентный run → notify/activity.
------------------------------------------------------------------------
create or replace function public.run_overdue_automations()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t record;
  r record;
  v_recipient uuid;
begin
  for t in
    select * from public.tasks
    where deadline < now() and lane <> 'done'
  loop
    for r in
      select * from public.automation_rules
      where org_id = t.org_id and is_active and trigger_type = 'task_overdue'
    loop
      begin  -- per (rule,task) изоляция
        -- идемпотентность: раз на (rule, task). task_id глобально уникален →
        -- project_id в ключе не нужен (работает и для персональных задач).
        if exists (
          select 1 from public.automation_runs
          where rule_id = r.id and trigger_key = t.id::text
        ) then
          continue;
        end if;

        -- W3: v1 task_overdue поддерживает только notify/create_activity. Прочие action
        -- пропускаем ДО записи run — иначе no-op run навсегда заблокирует будущее
        -- расширение executor'а на этот action (идемпотентность «раз на задачу»).
        if r.action_type not in ('notify', 'create_activity') then
          continue;
        end if;

        -- условия — против ЗАДАЧИ (поля задачи: priority/lane/text/…)
        if not public.wf_eval_conditions(r.conditions, to_jsonb(t)) then
          continue;
        end if;

        insert into public.automation_runs (rule_id, org_id, project_id, task_id, trigger_key)
        values (r.id, t.org_id, t.project_id, t.id, t.id::text);

        if r.action_type = 'notify' then
          v_recipient := coalesce(t.assigned_to, t.created_by);
          if v_recipient is not null then
            insert into public.notifications
              (org_id, recipient_id, actor_id, type, entity_type, entity_id, payload)
            values (
              t.org_id, v_recipient, null,            -- actor null = системное
              'automation', 'tasks', t.id,             -- сущность = ЗАДАЧА
              jsonb_build_object(
                'title', left(t.text, 120),
                'text', replace(coalesce(r.action_config->>'text', 'Задача просрочена: {task}'), '{task}', t.text)
              )
            );
          end if;

        elsif r.action_type = 'create_activity' then
          insert into public.activities
            (type, title, description, company_id, contact_id, project_id, created_by, org_id)
          values (
            'note'::public.activity_type,
            replace(coalesce(r.action_config->>'title', 'Просрочена задача: {task}'), '{task}', t.text),
            r.action_config->>'description',
            t.company_id, t.contact_id,                -- W7: попадёт в timeline компании/контакта
            t.project_id,                              -- может быть null (персональная)
            coalesce(t.assigned_to, t.created_by),
            t.org_id
          );
        end if;  -- create_task/set_field отсечены выше (W3)

        insert into public.activity_log (project_id, user_id, event_type, payload, org_id)
        values (
          t.project_id, null, 'automation_fired',
          jsonb_build_object('rule_id', r.id, 'trigger', 'task_overdue', 'action', r.action_type, 'task_id', t.id),
          t.org_id
        );

      exception when others then
        continue;  -- одно правило/задача упало — остальные продолжают
      end;
    end loop;
  end loop;
exception when others then
  return;  -- планировщик целиком никогда не падает
end $$;

revoke all on function public.run_overdue_automations() from public, anon, authenticated;
grant execute on function public.run_overdue_automations() to service_role;

------------------------------------------------------------------------
-- 4. pg_cron: включить + расписание (daily 06:00 UTC = 09:00 MSK).
--    Если create extension упадёт по правам — Cowork включит pg_cron через
--    Supabase Dashboard (Database → Extensions), затем применит cron.schedule.
------------------------------------------------------------------------
create extension if not exists pg_cron;

-- идемпотентный re-schedule (перезапуск миграции не дублирует job)
do $$
begin
  perform cron.unschedule('wf-overdue-daily');
exception when others then null;  -- job ещё нет — ок
end $$;

select cron.schedule('wf-overdue-daily', '0 6 * * *', 'select public.run_overdue_automations();');
