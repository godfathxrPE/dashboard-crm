-- ============================================
-- Migration 021: Multitenancy (schema only, RLS unchanged)
-- Applied manually via Supabase SQL Editor
-- ============================================

BEGIN;

-- 1. Организации
CREATE TABLE IF NOT EXISTS public.organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_by  uuid REFERENCES public.profiles(id),
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- 2. Членство (роль — org-scoped; глобальную profiles.role не трогаем)
CREATE TABLE IF NOT EXISTS public.memberships (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'manager'
                CHECK (role IN ('owner','admin','manager','viewer')),
  created_at  timestamptz DEFAULT now(),
  UNIQUE(org_id, profile_id)
);

-- 3. Helpers — SECURITY DEFINER, объявлены ДО политик.
--    ⚠️ Политики НЕ должны подзапрашивать memberships напрямую:
--    self-referencing policy → "infinite recursion detected in policy" (42P17).
--    RLS применяется и к подзапросам внутри политик — обход только через
--    SECURITY DEFINER функцию.

-- Организация текущего пользователя (пока у юзера одна org)
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS uuid AS $$
  SELECT org_id FROM public.memberships
  WHERE profile_id = auth.uid()
  ORDER BY created_at LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp;

-- Членство в организации (базовый кирпич для всех RLS-политик, включая Sprint 24)
CREATE OR REPLACE FUNCTION public.is_org_member(p_org uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE org_id = p_org AND profile_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp;

-- ACL по hardening-конвенции БД (миграции 2026-06-14):
-- PUBLIC/anon отозваны; authenticated нужен обеим — их вызывают RLS-политики
-- и клиентские запросы под auth-контекстом.
REVOKE EXECUTE ON FUNCTION public.current_org_id() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.current_org_id() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.is_org_member(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated, service_role;

-- 4. RLS на новые таблицы (минимальные политики; полный RBAC — Sprint 24/25)
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_select_member" ON public.organizations
  FOR SELECT USING (public.is_org_member(id));

CREATE POLICY "membership_select_own_org" ON public.memberships
  FOR SELECT USING (
    profile_id = auth.uid()
    OR public.is_org_member(org_id)
  );

-- 5. org_id на все tenant-таблицы (nullable на этом шаге)
--    Список сверен с разведкой миграций 001–020: 14 tenant-таблиц.
--    profiles/user_settings — глобальные; meeting_attendees — тенантность через meetings (join).
ALTER TABLE public.companies         ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.contacts          ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.contact_company   ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.projects          ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.tasks             ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.calls             ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.meetings          ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.activities        ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.activity_log      ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.leads             ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.project_files     ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.kpi_entries       ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.call_tracker_days ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.scheduled_calls   ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
-- meeting_attendees: тенантность через meetings (join) — org_id не добавляем
-- user_settings: персональная таблица, вне тенант-модели
-- profiles: глобальная, вне тенант-модели

-- 6. Индексы
CREATE INDEX IF NOT EXISTS idx_memberships_profile ON public.memberships(profile_id);
CREATE INDEX IF NOT EXISTS idx_memberships_org     ON public.memberships(org_id);
CREATE INDEX IF NOT EXISTS idx_companies_org       ON public.companies(org_id);
CREATE INDEX IF NOT EXISTS idx_contacts_org        ON public.contacts(org_id);
CREATE INDEX IF NOT EXISTS idx_projects_org        ON public.projects(org_id);
CREATE INDEX IF NOT EXISTS idx_tasks_org           ON public.tasks(org_id);
CREATE INDEX IF NOT EXISTS idx_calls_org           ON public.calls(org_id);
CREATE INDEX IF NOT EXISTS idx_meetings_org        ON public.meetings(org_id);
CREATE INDEX IF NOT EXISTS idx_activities_org      ON public.activities(org_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_org    ON public.activity_log(org_id);
CREATE INDEX IF NOT EXISTS idx_leads_org           ON public.leads(org_id);

COMMIT;
