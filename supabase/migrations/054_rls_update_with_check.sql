-- 054_rls_update_with_check.sql — Sprint W1 (безопасность данных)
--
-- Проблема (ревью 2026-07-18): UPDATE-политики имеют только USING (проверка
-- СТАРОЙ строки) и НЕ имеют WITH CHECK (проверки НОВОЙ строки). Значит член
-- org A, у которого есть право писать свою строку, может прямым PostgREST-
-- запросом переставить org_id на org B — межтенантный перенос записи.
--
-- Список политик — из живой БД (pg_policies, cmd='UPDATE', with_check IS NULL),
-- НЕ из baseline (baseline — снимок до 040 и врёт: notif_update/project_columns
-- уже получили WITH CHECK в live и здесь ОТСУТСТВУЮТ — их не трогаем).
--
-- Принцип WITH CHECK: НЕ зеркалим ролевые/ownership-условия из USING. WITH CHECK
-- проверяет NEW-строку, и зеркало сломало бы легитимную смену owner_id/assigned_to
-- менеджером (AssigneeSelect). Достаточно org-границы: межтенантный перенос
-- закрыт, семантика приложения не меняется.
--
-- Применяет гейт Cowork через apply_migration (атомарно, без BEGIN/COMMIT).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1a. WITH CHECK на tenant-таблицы (есть колонка org_id) — только org-граница.
-- ─────────────────────────────────────────────────────────────────────────────
alter policy "calls_update" on public.calls
  with check (org_id = ( select public.current_org_id() ));

alter policy "companies_update" on public.companies
  with check (org_id = ( select public.current_org_id() ));

alter policy "contacts_update" on public.contacts
  with check (org_id = ( select public.current_org_id() ));

alter policy "leads_update" on public.leads
  with check (org_id = ( select public.current_org_id() ));

alter policy "meetings_update" on public.meetings
  with check (org_id = ( select public.current_org_id() ));

alter policy "projects_update" on public.projects
  with check (org_id = ( select public.current_org_id() ));

alter policy "tasks_update" on public.tasks
  with check (org_id = ( select public.current_org_id() ));

alter policy "quotes_update" on public.quotes
  with check (org_id = ( select public.current_org_id() ));

-- Не-tenant таблицы (нет reassignment-флоу): WITH CHECK = зеркало USING.
-- organizations: обновлять может только owner своей org; org id иммутабелен по сути.
alter policy "org_update_owner" on public.organizations
  with check (
    id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) = 'owner'
  );

-- profiles: строка = сам пользователь; NEW.id не должен уехать на чужой профиль.
alter policy "profiles_update_own" on public.profiles
  with check (id = ( select auth.uid() ));

-- NB: project_columns_update и notif_update ОТСУТСТВУЮТ в разведке №1 — у них
-- WITH CHECK уже выставлен в live (040+). Здесь намеренно НЕ трогаем.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1b. Freeze org_id — ремень + подтяжки. org_id иммутабелен на UPDATE.
--   Молча возвращаем старое значение, НЕ raise: optimistic-объекты хуков содержат
--   org_id-заглушки, и явно переданное значение не должно ронять легитимный апдейт.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.freeze_org_id()
returns trigger
language plpgsql
security definer set search_path = public, pg_temp
as $$
begin
  new.org_id := old.org_id;
  return new;
end $$;

revoke all on function public.freeze_org_id() from public, anon, authenticated;
grant execute on function public.freeze_org_id() to service_role;

-- Триггер trg_aa_freeze_org_id на КАЖДУЮ public-таблицу с колонкой org_id.
-- Префикс aa_ — чтобы Postgres выполнял его первым среди BEFORE UPDATE (алфавит),
-- до прочих BEFORE-триггеров, которые могли бы читать new.org_id.
do $$
declare t text;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.column_name = 'org_id'
      and c.table_name in (select tablename from pg_tables where schemaname = 'public')
  loop
    execute format(
      'drop trigger if exists trg_aa_freeze_org_id on public.%I;
       create trigger trg_aa_freeze_org_id
         before update of org_id on public.%I
         for each row
         when (old.org_id is distinct from new.org_id)
         execute function public.freeze_org_id();',
      t, t);
  end loop;
end $$;
