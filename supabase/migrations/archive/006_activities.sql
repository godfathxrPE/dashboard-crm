-- 006: Activities — единый лог (Salesforce Activity Timeline pattern)

CREATE TYPE activity_type AS ENUM (
  'call', 'meeting', 'email', 'note', 'task_completed', 'stage_change', 'kp_sent'
);

CREATE TABLE public.activities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        activity_type NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  company_id  UUID REFERENCES public.companies(id),
  contact_id  UUID REFERENCES public.contacts(id),
  project_id  UUID REFERENCES public.projects(id),
  metadata    JSONB DEFAULT '{}',
  created_by  UUID REFERENCES public.profiles(id) DEFAULT auth.uid(),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_activities_company ON public.activities(company_id);
CREATE INDEX idx_activities_project ON public.activities(project_id);
CREATE INDEX idx_activities_created ON public.activities(created_at DESC);
CREATE INDEX idx_activities_type ON public.activities(type);

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activities_select" ON public.activities FOR SELECT USING (
  user_role() IN ('admin', 'pm') OR created_by = auth.uid()
);
CREATE POLICY "activities_insert" ON public.activities FOR INSERT
  WITH CHECK (user_role() IN ('admin', 'pm', 'member'));

-- Триггер: логирование смены стадии проекта
CREATE OR REPLACE FUNCTION public.log_stage_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    INSERT INTO public.activities (type, title, project_id, company_id, metadata, created_by)
    VALUES (
      'stage_change',
      NEW.name || ': ' || OLD.stage || ' → ' || NEW.stage,
      NEW.id,
      NEW.company_id,
      jsonb_build_object('from', OLD.stage::text, 'to', NEW.stage::text),
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_stage_change AFTER UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.log_stage_change();
