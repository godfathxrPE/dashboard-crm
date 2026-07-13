-- 003: Projects / Deals — Pipeline с 14 стадиями
-- Паттерн: Pipedrive Deals + Salesforce Opportunity Stages

CREATE TYPE deal_stage AS ENUM (
  'new_lead', 'qualification', 'waiting_materials', 'preparing_kp',
  'kp_sent', 'kp_review', 'preparing_docs', 'cz_approval',
  'trilateral_meeting', 'experiment_setup', 'contract_review',
  'contract_signing', 'won', 'lost'
);

CREATE TABLE public.projects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  company_id    UUID REFERENCES public.companies(id),
  contact_id    UUID REFERENCES public.contacts(id),
  stage         deal_stage NOT NULL DEFAULT 'new_lead',
  budget        BIGINT,
  deadline      DATE,
  next_step     TEXT,
  owner_id      UUID REFERENCES public.profiles(id),
  loss_reason   TEXT,
  loss_detail   TEXT,
  created_by    UUID REFERENCES public.profiles(id) DEFAULT auth.uid(),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_projects_stage ON public.projects(stage);
CREATE INDEX idx_projects_company ON public.projects(company_id);
CREATE INDEX idx_projects_owner ON public.projects(owner_id);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projects_select" ON public.projects FOR SELECT USING (
  user_role() IN ('admin', 'pm') OR owner_id = auth.uid() OR created_by = auth.uid()
);
CREATE POLICY "projects_insert" ON public.projects FOR INSERT
  WITH CHECK (user_role() IN ('admin', 'pm', 'member'));
CREATE POLICY "projects_update" ON public.projects FOR UPDATE USING (
  user_role() IN ('admin', 'pm') OR owner_id = auth.uid()
);
CREATE POLICY "projects_delete" ON public.projects FOR DELETE USING (
  user_role() = 'admin'
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
