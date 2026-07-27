-- 080 — S-SEC-GRANTS-NARROW: сузить гранты `authenticated` до того, что покрывает RLS,
-- и добить хвост 056b по триггерным функциям.
--
-- Урок 075: дефолтные привилегии Supabase выдают `authenticated` ВЕСЬ набор прав на любую
-- новую таблицу в public, поэтому `grant select, insert …` в шапке миграции ничего не сужает.
-- До сих пор revoke был сделан только у baseline-таблиц (075) и у новых таблиц R2
-- (`segments` 077, `stage_transitions` 078). У остальных 33 таблиц с `org_id` держится полный
-- набор, включая `TRUNCATE` / `REFERENCES` / `TRIGGER` — три привилегии, которые **RLS не
-- покрывает вообще**: TRUNCATE игнорирует политики, TRIGGER позволяет навесить свой триггер.
-- Клиенту они не нужны ни в одном сценарии.
--
-- Что НЕ трогаем: `SELECT` / `INSERT` / `UPDATE` / `DELETE` — там работает RLS, снятие DML
-- сломает приложение. Этим правка отличается от 075, где у baseline-таблиц DML не нужен вовсе.
--
-- Поведение не меняется. Откат — обратный grant.
--
-- Затронуто на момент написания (33 таблицы с `org_id`, у которых есть TRUNCATE):
--   activities, activity_log, ai_runs, automation_rules, automation_runs, call_tracker_days,
--   calls, companies, contact_company, contacts, delivery_template_phases,
--   delivery_template_tasks, delivery_templates, invitations, kpi_entries, leads, meetings,
--   memberships, message_reactions, notifications, project_columns, project_files,
--   project_members, project_messages, project_videos, projects, quotes,
--   recurring_task_templates, scheduled_calls, stage_requirements, task_dependencies, tasks,
--   transcripts
-- Уже чистые (revoke сделан в своей миграции): baseline_tasks, project_baselines (075),
--   segments (077), stage_transitions (078).
-- Вне охвата (нет колонки `org_id` — отдельным решением): dashboard_sync, meeting_attendees,
--   organizations, pipeline_stages, pipelines, profiles, user_settings.
--
-- Исполняется через каталог, а не по списку имён: так новая org-таблица, добавленная между
-- написанием и apply, тоже будет сужена, и миграция остаётся идемпотентной при повторе.
--
-- Применяет гейт Cowork через apply_migration.

-- 1. Сплошной revoke по таблицам с `org_id`.
do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join information_schema.columns col
      on col.table_schema = 'public'
     and col.table_name = c.relname
     and col.column_name = 'org_id'
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname
  loop
    execute format('revoke truncate, references, trigger on public.%I from authenticated', r.relname);
    -- anon уже пуст после 056 (`revoke all on all tables … from anon` + default privileges),
    -- строка ниже — страховка на случай таблицы, созданной в обход конвенции.
    execute format('revoke all on public.%I from anon', r.relname);
  end loop;
end $$;

-- 2. Хвост 056b: чисто триггерные функции без EXECUTE у клиентских ролей.
-- `stamp_task_completed_at` (072) и `sync_project_stage` (S29.1) проскочили мимо конвенции —
-- у обеих EXECUTE остался и у `anon`, и у `authenticated`. Практического вреда нет (вызов
-- триггерной функции вне триггера падает), но линт advisors это видит, а EXECUTE проверяется
-- только при CREATE TRIGGER — существующие триггеры продолжат работать.
revoke all on function public.stamp_task_completed_at() from public, anon, authenticated;
revoke all on function public.sync_project_stage()      from public, anon, authenticated;

grant execute on function public.stamp_task_completed_at() to service_role;
grant execute on function public.sync_project_stage()      to service_role;

-- 3. Осознанно НЕ делаем:
--    • `check_stage_requirements(uuid, uuid)` остаётся с EXECUTE у `authenticated` — её зовёт
--      модалка перехода стадии, чтобы показать невыполненные требования ДО update. Защита
--      внутри есть (`is_org_member` → 42501 по чужому проекту). Снятие сломает переход из UI.
--    • DML-гранты (SELECT/INSERT/UPDATE/DELETE) — их граница это RLS, не грант.
--    • `create_project_baseline` исполним `service_role` по дефолтным привилегиям (074
--      грантовала только `authenticated`) — безвредно, правка не нужна.
