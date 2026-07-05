-- ============================================
-- Migration 023: Org-scoped RLS refactor (Sprint 24)
-- Семантика политик переведена 1:1 на org-модель:
--   * org-граница первым конъюнктом: org_id = ( SELECT public.current_org_id() )
--   * роли через current_org_role() (маппинг: admin→owner, pm→admin,
--     member→manager, viewer→viewer)
--   * ownership-ветки сохранены как в живом инвентаре (pg_policies 2026-07-05)
-- Поведение для текущего пользователя не меняется. Расширение видимости — S25.
--
-- Применяется атомарно через MCP apply_migration (без BEGIN/COMMIT).
-- Helpers current_org_id()/is_org_member() уже введены в 021.
-- ============================================

-- ─────────────────────────────────────────────
-- 1. Новые helpers (initplan-friendly, hardening-конвенция)
-- ─────────────────────────────────────────────

-- Роль текущего пользователя в его текущей организации.
-- No-arg + STABLE → планировщик вычисляет один раз (initplan), не per-row.
CREATE OR REPLACE FUNCTION public.current_org_role()
RETURNS text AS $$
  SELECT m.role FROM public.memberships m
  WHERE m.profile_id = auth.uid()
    AND m.org_id = public.current_org_id();
$$ LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.current_org_role() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.current_org_role() TO authenticated, service_role;

-- Состоит ли профиль p в одной org с текущим пользователем (для profiles_select).
CREATE OR REPLACE FUNCTION public.shares_org_with(p_profile uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships a
    JOIN public.memberships b ON a.org_id = b.org_id
    WHERE a.profile_id = auth.uid() AND b.profile_id = p_profile
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.shares_org_with(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.shares_org_with(uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────
-- 2. Бизнес-таблицы (роль + ownership)
-- ─────────────────────────────────────────────

-- companies ─ ownership: owner_id (UPDATE) / owner_id ∨ created_by (SELECT/DELETE)
DROP POLICY IF EXISTS companies_select ON public.companies;
DROP POLICY IF EXISTS companies_insert ON public.companies;
DROP POLICY IF EXISTS companies_update ON public.companies;
DROP POLICY IF EXISTS companies_delete ON public.companies;

CREATE POLICY companies_select ON public.companies FOR SELECT USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
        OR owner_id   = ( SELECT auth.uid() )
        OR created_by = ( SELECT auth.uid() ) )
);
CREATE POLICY companies_insert ON public.companies FOR INSERT WITH CHECK (
  org_id = ( SELECT public.current_org_id() )
  AND ( SELECT public.current_org_role() ) IN ('owner','admin','manager')
);
CREATE POLICY companies_update ON public.companies FOR UPDATE USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
        OR owner_id = ( SELECT auth.uid() ) )
);
CREATE POLICY companies_delete ON public.companies FOR DELETE USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
        OR owner_id   = ( SELECT auth.uid() )
        OR created_by = ( SELECT auth.uid() ) )
);

-- contacts ─ идентично companies
DROP POLICY IF EXISTS contacts_select ON public.contacts;
DROP POLICY IF EXISTS contacts_insert ON public.contacts;
DROP POLICY IF EXISTS contacts_update ON public.contacts;
DROP POLICY IF EXISTS contacts_delete ON public.contacts;

CREATE POLICY contacts_select ON public.contacts FOR SELECT USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
        OR owner_id   = ( SELECT auth.uid() )
        OR created_by = ( SELECT auth.uid() ) )
);
CREATE POLICY contacts_insert ON public.contacts FOR INSERT WITH CHECK (
  org_id = ( SELECT public.current_org_id() )
  AND ( SELECT public.current_org_role() ) IN ('owner','admin','manager')
);
CREATE POLICY contacts_update ON public.contacts FOR UPDATE USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
        OR owner_id = ( SELECT auth.uid() ) )
);
CREATE POLICY contacts_delete ON public.contacts FOR DELETE USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
        OR owner_id   = ( SELECT auth.uid() )
        OR created_by = ( SELECT auth.uid() ) )
);

-- projects ─ ownership: owner_id; DELETE только owner (было user_role()='admin')
DROP POLICY IF EXISTS projects_select ON public.projects;
DROP POLICY IF EXISTS projects_insert ON public.projects;
DROP POLICY IF EXISTS projects_update ON public.projects;
DROP POLICY IF EXISTS projects_delete ON public.projects;

CREATE POLICY projects_select ON public.projects FOR SELECT USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
        OR owner_id   = ( SELECT auth.uid() )
        OR created_by = ( SELECT auth.uid() ) )
);
CREATE POLICY projects_insert ON public.projects FOR INSERT WITH CHECK (
  org_id = ( SELECT public.current_org_id() )
  AND ( SELECT public.current_org_role() ) IN ('owner','admin','manager')
);
CREATE POLICY projects_update ON public.projects FOR UPDATE USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
        OR owner_id = ( SELECT auth.uid() ) )
);
CREATE POLICY projects_delete ON public.projects FOR DELETE USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) = 'owner'
        OR owner_id = ( SELECT auth.uid() ) )
);

-- tasks ─ ownership: assigned_to ∨ created_by (SELECT/UPDATE); DELETE: created_by
DROP POLICY IF EXISTS tasks_select ON public.tasks;
DROP POLICY IF EXISTS tasks_insert ON public.tasks;
DROP POLICY IF EXISTS tasks_update ON public.tasks;
DROP POLICY IF EXISTS tasks_delete ON public.tasks;

CREATE POLICY tasks_select ON public.tasks FOR SELECT USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
        OR assigned_to = ( SELECT auth.uid() )
        OR created_by  = ( SELECT auth.uid() ) )
);
CREATE POLICY tasks_insert ON public.tasks FOR INSERT WITH CHECK (
  org_id = ( SELECT public.current_org_id() )
  AND ( SELECT public.current_org_role() ) IN ('owner','admin','manager')
);
CREATE POLICY tasks_update ON public.tasks FOR UPDATE USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
        OR assigned_to = ( SELECT auth.uid() )
        OR created_by  = ( SELECT auth.uid() ) )
);
CREATE POLICY tasks_delete ON public.tasks FOR DELETE USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
        OR created_by = ( SELECT auth.uid() ) )
);

-- calls ─ ownership: created_by
DROP POLICY IF EXISTS calls_select ON public.calls;
DROP POLICY IF EXISTS calls_insert ON public.calls;
DROP POLICY IF EXISTS calls_update ON public.calls;
DROP POLICY IF EXISTS calls_delete ON public.calls;

CREATE POLICY calls_select ON public.calls FOR SELECT USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
        OR created_by = ( SELECT auth.uid() ) )
);
CREATE POLICY calls_insert ON public.calls FOR INSERT WITH CHECK (
  org_id = ( SELECT public.current_org_id() )
  AND ( SELECT public.current_org_role() ) IN ('owner','admin','manager')
);
CREATE POLICY calls_update ON public.calls FOR UPDATE USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
        OR created_by = ( SELECT auth.uid() ) )
);
CREATE POLICY calls_delete ON public.calls FOR DELETE USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
        OR created_by = ( SELECT auth.uid() ) )
);

-- meetings ─ ownership: created_by
DROP POLICY IF EXISTS meetings_select ON public.meetings;
DROP POLICY IF EXISTS meetings_insert ON public.meetings;
DROP POLICY IF EXISTS meetings_update ON public.meetings;
DROP POLICY IF EXISTS meetings_delete ON public.meetings;

CREATE POLICY meetings_select ON public.meetings FOR SELECT USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
        OR created_by = ( SELECT auth.uid() ) )
);
CREATE POLICY meetings_insert ON public.meetings FOR INSERT WITH CHECK (
  org_id = ( SELECT public.current_org_id() )
  AND ( SELECT public.current_org_role() ) IN ('owner','admin','manager')
);
CREATE POLICY meetings_update ON public.meetings FOR UPDATE USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
        OR created_by = ( SELECT auth.uid() ) )
);
CREATE POLICY meetings_delete ON public.meetings FOR DELETE USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
        OR created_by = ( SELECT auth.uid() ) )
);

-- activities ─ ownership: created_by; ТОЛЬКО SELECT + INSERT (UPDATE/DELETE политик нет)
DROP POLICY IF EXISTS activities_select ON public.activities;
DROP POLICY IF EXISTS activities_insert ON public.activities;

CREATE POLICY activities_select ON public.activities FOR SELECT USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
        OR created_by = ( SELECT auth.uid() ) )
);
CREATE POLICY activities_insert ON public.activities FOR INSERT WITH CHECK (
  org_id = ( SELECT public.current_org_id() )
  AND ( SELECT public.current_org_role() ) IN ('owner','admin','manager')
);

-- contact_company ─ SELECT было USING true (дыра) → закрываем org-границей
DROP POLICY IF EXISTS cc_select ON public.contact_company;
DROP POLICY IF EXISTS cc_insert ON public.contact_company;
DROP POLICY IF EXISTS cc_delete ON public.contact_company;

CREATE POLICY cc_select ON public.contact_company FOR SELECT USING (
  org_id = ( SELECT public.current_org_id() )
);
CREATE POLICY cc_insert ON public.contact_company FOR INSERT WITH CHECK (
  org_id = ( SELECT public.current_org_id() )
  AND ( SELECT public.current_org_role() ) IN ('owner','admin','manager')
);
CREATE POLICY cc_delete ON public.contact_company FOR DELETE USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( SELECT public.current_org_role() ) IN ('owner','admin')
);

-- ─────────────────────────────────────────────
-- 3. meeting_attendees ─ тенантность транзитивно через meetings (org_id колонки нет).
--    Сохраняем join-паттерн, роль переписана на current_org_role().
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS attendees_own ON public.meeting_attendees;

CREATE POLICY attendees_own ON public.meeting_attendees FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE m.id = meeting_attendees.meeting_id
      AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
            OR m.created_by = ( SELECT auth.uid() ) )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE m.id = meeting_attendees.meeting_id
      AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
            OR m.created_by = ( SELECT auth.uid() ) )
  )
);

-- ─────────────────────────────────────────────
-- 4. Own-семантика (user_id) + org-граница
-- ─────────────────────────────────────────────

-- leads ─ own (user_id), все роли команды видят свои лиды
DROP POLICY IF EXISTS leads_select_own ON public.leads;
DROP POLICY IF EXISTS leads_insert_own ON public.leads;
DROP POLICY IF EXISTS leads_update_own ON public.leads;
DROP POLICY IF EXISTS leads_delete_own ON public.leads;

CREATE POLICY leads_select_own ON public.leads FOR SELECT USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( SELECT auth.uid() ) = user_id
);
CREATE POLICY leads_insert_own ON public.leads FOR INSERT WITH CHECK (
  org_id = ( SELECT public.current_org_id() )
  AND ( SELECT auth.uid() ) = user_id
);
CREATE POLICY leads_update_own ON public.leads FOR UPDATE USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( SELECT auth.uid() ) = user_id
);
CREATE POLICY leads_delete_own ON public.leads FOR DELETE USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( SELECT auth.uid() ) = user_id
);

-- activity_log ─ own (user_id); политик S/I/D (UPDATE нет)
DROP POLICY IF EXISTS "Users see own logs"    ON public.activity_log;
DROP POLICY IF EXISTS "Users insert own logs" ON public.activity_log;
DROP POLICY IF EXISTS "Users delete own logs" ON public.activity_log;

CREATE POLICY "Users see own logs" ON public.activity_log FOR SELECT USING (
  org_id = ( SELECT public.current_org_id() )
  AND user_id = ( SELECT auth.uid() )
);
CREATE POLICY "Users insert own logs" ON public.activity_log FOR INSERT WITH CHECK (
  org_id = ( SELECT public.current_org_id() )
  AND user_id = ( SELECT auth.uid() )
);
CREATE POLICY "Users delete own logs" ON public.activity_log FOR DELETE USING (
  org_id = ( SELECT public.current_org_id() )
  AND user_id = ( SELECT auth.uid() )
);

-- project_files ─ own (user_id), FOR ALL
DROP POLICY IF EXISTS "Users can manage own project files" ON public.project_files;

CREATE POLICY "Users can manage own project files" ON public.project_files FOR ALL
USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( SELECT auth.uid() ) = user_id
)
WITH CHECK (
  org_id = ( SELECT public.current_org_id() )
  AND ( SELECT auth.uid() ) = user_id
);

-- kpi_entries ─ own (profile_id), FOR ALL
DROP POLICY IF EXISTS kpi_own ON public.kpi_entries;

CREATE POLICY kpi_own ON public.kpi_entries FOR ALL
USING (
  org_id = ( SELECT public.current_org_id() )
  AND profile_id = ( SELECT auth.uid() )
)
WITH CHECK (
  org_id = ( SELECT public.current_org_id() )
  AND profile_id = ( SELECT auth.uid() )
);

-- call_tracker_days ─ own (profile_id), FOR ALL
DROP POLICY IF EXISTS tracker_own ON public.call_tracker_days;

CREATE POLICY tracker_own ON public.call_tracker_days FOR ALL
USING (
  org_id = ( SELECT public.current_org_id() )
  AND profile_id = ( SELECT auth.uid() )
)
WITH CHECK (
  org_id = ( SELECT public.current_org_id() )
  AND profile_id = ( SELECT auth.uid() )
);

-- scheduled_calls ─ own (profile_id), FOR ALL
DROP POLICY IF EXISTS scheduled_own ON public.scheduled_calls;

CREATE POLICY scheduled_own ON public.scheduled_calls FOR ALL
USING (
  org_id = ( SELECT public.current_org_id() )
  AND profile_id = ( SELECT auth.uid() )
)
WITH CHECK (
  org_id = ( SELECT public.current_org_id() )
  AND profile_id = ( SELECT auth.uid() )
);

-- ─────────────────────────────────────────────
-- 5. profiles / organizations
-- ─────────────────────────────────────────────

-- profiles ─ видно себя + со-org-членов (было own ∨ user_role()='admin', глобально)
DROP POLICY IF EXISTS profiles_select ON public.profiles;

CREATE POLICY profiles_select ON public.profiles FOR SELECT USING (
  id = ( SELECT auth.uid() )
  OR public.shares_org_with(id)
);
-- profiles_update_own — не трогаем (id = auth.uid()).

-- organizations ─ добавить UPDATE (переименование org владельцем).
-- org_select_member (SELECT) уже есть из 021 — не трогаем.
DROP POLICY IF EXISTS org_update_owner ON public.organizations;

CREATE POLICY org_update_owner ON public.organizations FOR UPDATE USING (
  id = ( SELECT public.current_org_id() )
  AND ( SELECT public.current_org_role() ) = 'owner'
);

-- memberships: write-политики НЕ добавляем (invites — S26; членством управляет
-- только service-сторона). membership_select_own_org из 021 — остаётся.
-- user_settings, dashboard_sync, pipelines, pipeline_stages — вне скоупа S24.

-- ─────────────────────────────────────────────
-- 6. Фиксы security advisors (legacy)
-- ─────────────────────────────────────────────

-- convert_lead: закрыть anon-вызов через REST RPC + зафиксировать search_path
REVOKE EXECUTE ON FUNCTION public.convert_lead(uuid,text,text,text,text,text,text,text,numeric,uuid,uuid) FROM PUBLIC, anon;
ALTER  FUNCTION public.convert_lead(uuid,text,text,text,text,text,text,text,numeric,uuid,uuid)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.sync_project_stage() SET search_path = public, pg_temp;

-- ─────────────────────────────────────────────
-- 7. Дожать NOT NULL на служебных таблицах (после 022 нулей нет, триггеры заполняют)
-- ⚠️ service_role-писатели (если появятся) обязаны передавать org_id явно:
--    current_org_id() под service-контекстом возвращает NULL.
-- ─────────────────────────────────────────────
ALTER TABLE public.activities        ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.activity_log      ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.project_files     ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.kpi_entries       ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.call_tracker_days ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.scheduled_calls   ALTER COLUMN org_id SET NOT NULL;

-- ─────────────────────────────────────────────
-- 8. Деприкация user_role() — НЕ удаляем (может использоваться в UI, см. S25).
-- ─────────────────────────────────────────────
COMMENT ON FUNCTION public.user_role() IS
  'DEPRECATED S24: политики переведены на current_org_role(). Удалить в S25 после переезда UI.';
