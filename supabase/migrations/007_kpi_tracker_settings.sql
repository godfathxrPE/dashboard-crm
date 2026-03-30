-- 007: KPI + Call Tracker + Scheduled Calls + User Settings

-- KPI entries по неделям
CREATE TABLE public.kpi_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES public.profiles(id),
  week_start  DATE NOT NULL,
  metric      TEXT NOT NULL,
  plan        INT NOT NULL DEFAULT 0,
  fact        INT NOT NULL DEFAULT 0,
  points      INT NOT NULL DEFAULT 0,
  UNIQUE(profile_id, week_start, metric)
);

-- Дневной трекер звонков
CREATE TABLE public.call_tracker_days (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   UUID NOT NULL REFERENCES public.profiles(id),
  date         DATE NOT NULL DEFAULT CURRENT_DATE,
  plan         INT NOT NULL DEFAULT 40,
  done         INT NOT NULL DEFAULT 0,
  success      INT NOT NULL DEFAULT 0,
  fail         INT NOT NULL DEFAULT 0,
  hourly       JSONB DEFAULT '{}',
  fail_reasons JSONB DEFAULT '{}',
  UNIQUE(profile_id, date)
);

-- Запланированные звонки
CREATE TABLE public.scheduled_calls (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES public.profiles(id),
  time        TIME NOT NULL,
  company_id  UUID REFERENCES public.companies(id),
  contact_id  UUID REFERENCES public.contacts(id),
  project_id  UUID REFERENCES public.projects(id),
  phone       TEXT,
  note        TEXT,
  remind_min  INT DEFAULT 2,
  done        BOOLEAN DEFAULT false,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Пользовательские настройки (1:1 с profiles)
CREATE TABLE public.user_settings (
  profile_id      UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  theme           TEXT DEFAULT 't-claude',
  visible_widgets JSONB DEFAULT '[]',
  focus_text      TEXT,
  notes_text      TEXT,
  funnel_goals    JSONB DEFAULT '{"calls": 200, "meetings": 5, "kp": 3, "deals": 1}',
  plan_targets    JSONB DEFAULT '{"calls": 200, "meetings": 5, "kp": 3, "deals": 1}',
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- RLS для всех таблиц — пользователь видит только свои данные
ALTER TABLE public.kpi_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_tracker_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kpi_own" ON public.kpi_entries FOR ALL
  USING (profile_id = auth.uid());
CREATE POLICY "tracker_own" ON public.call_tracker_days FOR ALL
  USING (profile_id = auth.uid());
CREATE POLICY "scheduled_own" ON public.scheduled_calls FOR ALL
  USING (profile_id = auth.uid());
CREATE POLICY "settings_own" ON public.user_settings FOR ALL
  USING (profile_id = auth.uid());

-- Автосоздание settings при создании профиля
CREATE OR REPLACE FUNCTION public.handle_new_profile_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_settings (profile_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile_settings();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Включаем Realtime для ключевых таблиц
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meetings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activities;
