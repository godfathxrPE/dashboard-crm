-- 005: Calls + Meetings + Attendees

CREATE TYPE call_status AS ENUM ('done', 'pending', 'cancelled');

CREATE TABLE public.calls (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID REFERENCES public.companies(id),
  contact_id  UUID REFERENCES public.contacts(id),
  project_id  UUID REFERENCES public.projects(id),
  date        TIMESTAMPTZ NOT NULL DEFAULT now(),
  status      call_status NOT NULL DEFAULT 'done',
  next_step   TEXT,
  agreements  TEXT,
  duration_s  INT,
  created_by  UUID REFERENCES public.profiles(id) DEFAULT auth.uid(),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.meetings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  date        DATE NOT NULL,
  time        TIME,
  location    TEXT,
  project_id  UUID REFERENCES public.projects(id),
  notes       TEXT,
  created_by  UUID REFERENCES public.profiles(id) DEFAULT auth.uid(),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.meeting_attendees (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id  UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  contact_id  UUID REFERENCES public.contacts(id),
  profile_id  UUID REFERENCES public.profiles(id)
);

CREATE INDEX idx_calls_company ON public.calls(company_id);
CREATE INDEX idx_calls_project ON public.calls(project_id);
CREATE INDEX idx_calls_date ON public.calls(date DESC);
CREATE INDEX idx_meetings_date ON public.meetings(date);

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_attendees ENABLE ROW LEVEL SECURITY;

-- Calls: все авторизованные видят, member+ создают
CREATE POLICY "calls_select" ON public.calls FOR SELECT USING (
  user_role() IN ('admin', 'pm') OR created_by = auth.uid()
);
CREATE POLICY "calls_insert" ON public.calls FOR INSERT
  WITH CHECK (user_role() IN ('admin', 'pm', 'member'));
CREATE POLICY "calls_update" ON public.calls FOR UPDATE USING (
  user_role() IN ('admin', 'pm') OR created_by = auth.uid()
);
CREATE POLICY "calls_delete" ON public.calls FOR DELETE USING (
  user_role() IN ('admin', 'pm') OR created_by = auth.uid()
);

-- Meetings: аналогично
CREATE POLICY "meetings_select" ON public.meetings FOR SELECT USING (
  user_role() IN ('admin', 'pm') OR created_by = auth.uid()
);
CREATE POLICY "meetings_insert" ON public.meetings FOR INSERT
  WITH CHECK (user_role() IN ('admin', 'pm', 'member'));
CREATE POLICY "meetings_update" ON public.meetings FOR UPDATE USING (
  user_role() IN ('admin', 'pm') OR created_by = auth.uid()
);
CREATE POLICY "meetings_delete" ON public.meetings FOR DELETE USING (
  user_role() IN ('admin', 'pm') OR created_by = auth.uid()
);

CREATE POLICY "attendees_all" ON public.meeting_attendees FOR ALL USING (true);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
