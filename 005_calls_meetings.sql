-- ═══════════════════════════════════════════════════════════════
-- Sprint 4: calls + meetings tables (idempotent)
-- Запусти ТОЛЬКО ЕСЛИ получишь 400 на /calls или /meetings
-- ═══════════════════════════════════════════════════════════════

-- Enum: call_status
DO $$ BEGIN
  CREATE TYPE call_status AS ENUM ('done', 'pending', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Calls
CREATE TABLE IF NOT EXISTS public.calls (
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

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='calls' AND policyname='calls_select') THEN
    CREATE POLICY "calls_select" ON public.calls FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='calls' AND policyname='calls_insert') THEN
    CREATE POLICY "calls_insert" ON public.calls FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='calls' AND policyname='calls_update') THEN
    CREATE POLICY "calls_update" ON public.calls FOR UPDATE USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='calls' AND policyname='calls_delete') THEN
    CREATE POLICY "calls_delete" ON public.calls FOR DELETE USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

GRANT ALL ON public.calls TO authenticated;

-- Meetings
CREATE TABLE IF NOT EXISTS public.meetings (
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

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='meetings' AND policyname='meetings_select') THEN
    CREATE POLICY "meetings_select" ON public.meetings FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='meetings' AND policyname='meetings_insert') THEN
    CREATE POLICY "meetings_insert" ON public.meetings FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='meetings' AND policyname='meetings_update') THEN
    CREATE POLICY "meetings_update" ON public.meetings FOR UPDATE USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='meetings' AND policyname='meetings_delete') THEN
    CREATE POLICY "meetings_delete" ON public.meetings FOR DELETE USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

GRANT ALL ON public.meetings TO authenticated;

-- Triggers
DROP TRIGGER IF EXISTS set_updated_at ON public.calls;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.calls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.meetings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.meetings;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

SELECT 'Sprint 4 tables ready' AS status;
