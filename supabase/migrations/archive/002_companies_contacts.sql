-- 002: Companies + Contacts + Junction
-- Паттерн: Salesforce Account ↔ Contact (M:N через AccountContactRelation)

CREATE TABLE public.companies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  inn         TEXT,
  industry    TEXT,
  website     TEXT,
  phone       TEXT,
  address     TEXT,
  notes       TEXT,
  owner_id    UUID REFERENCES public.profiles(id),
  created_by  UUID REFERENCES public.profiles(id) DEFAULT auth.uid(),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name  TEXT NOT NULL,
  last_name   TEXT,
  email       TEXT,
  phone       TEXT,
  position    TEXT,
  notes       TEXT,
  owner_id    UUID REFERENCES public.profiles(id),
  created_by  UUID REFERENCES public.profiles(id) DEFAULT auth.uid(),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.contact_company (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id  UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role        TEXT,
  is_primary  BOOLEAN DEFAULT false,
  UNIQUE(contact_id, company_id)
);

-- Индексы
CREATE INDEX idx_companies_owner ON public.companies(owner_id);
CREATE INDEX idx_contacts_owner ON public.contacts(owner_id);
CREATE INDEX idx_cc_contact ON public.contact_company(contact_id);
CREATE INDEX idx_cc_company ON public.contact_company(company_id);

-- RLS
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_company ENABLE ROW LEVEL SECURITY;

CREATE POLICY "companies_select" ON public.companies FOR SELECT USING (
  user_role() IN ('admin', 'pm') OR owner_id = auth.uid() OR created_by = auth.uid()
);
CREATE POLICY "companies_insert" ON public.companies FOR INSERT
  WITH CHECK (user_role() IN ('admin', 'pm', 'member'));
CREATE POLICY "companies_update" ON public.companies FOR UPDATE USING (
  user_role() IN ('admin', 'pm') OR owner_id = auth.uid()
);
CREATE POLICY "companies_delete" ON public.companies FOR DELETE USING (
  user_role() = 'admin'
);

CREATE POLICY "contacts_select" ON public.contacts FOR SELECT USING (
  user_role() IN ('admin', 'pm') OR owner_id = auth.uid() OR created_by = auth.uid()
);
CREATE POLICY "contacts_insert" ON public.contacts FOR INSERT
  WITH CHECK (user_role() IN ('admin', 'pm', 'member'));
CREATE POLICY "contacts_update" ON public.contacts FOR UPDATE USING (
  user_role() IN ('admin', 'pm') OR owner_id = auth.uid()
);
CREATE POLICY "contacts_delete" ON public.contacts FOR DELETE USING (
  user_role() = 'admin'
);

CREATE POLICY "cc_select" ON public.contact_company FOR SELECT USING (true);
CREATE POLICY "cc_insert" ON public.contact_company FOR INSERT
  WITH CHECK (user_role() IN ('admin', 'pm', 'member'));
CREATE POLICY "cc_delete" ON public.contact_company FOR DELETE USING (
  user_role() IN ('admin', 'pm')
);

-- Triggers
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
