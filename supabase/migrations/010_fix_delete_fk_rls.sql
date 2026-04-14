-- ═══════════════════════════════════════════════════════
-- 010: Fix FK constraints + RLS for company/contact deletion
-- ═══════════════════════════════════════════════════════

-- ── FK: company_id ON DELETE SET NULL ──
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_company_id_fkey;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_company_id_fkey;
ALTER TABLE public.calls
  ADD CONSTRAINT calls_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_company_id_fkey;
ALTER TABLE public.activities
  ADD CONSTRAINT activities_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

-- ── FK: contact_id ON DELETE SET NULL ──
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_contact_id_fkey;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_contact_id_fkey
  FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;

ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_contact_id_fkey;
ALTER TABLE public.calls
  ADD CONSTRAINT calls_contact_id_fkey
  FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;

ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_contact_id_fkey;
ALTER TABLE public.activities
  ADD CONSTRAINT activities_contact_id_fkey
  FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;

-- ── RLS: allow owner/creator to delete (not just admin) ──
DROP POLICY IF EXISTS "companies_delete" ON public.companies;
CREATE POLICY "companies_delete" ON public.companies FOR DELETE USING (
  user_role() IN ('admin', 'pm') OR owner_id = auth.uid() OR created_by = auth.uid()
);

DROP POLICY IF EXISTS "contacts_delete" ON public.contacts;
CREATE POLICY "contacts_delete" ON public.contacts FOR DELETE USING (
  user_role() IN ('admin', 'pm') OR owner_id = auth.uid() OR created_by = auth.uid()
);
