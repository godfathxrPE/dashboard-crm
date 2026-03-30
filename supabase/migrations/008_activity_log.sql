-- ═══════════════════════════════════════════════════════
-- 008: Activity Log — хронология событий по проекту
-- Гранулярный лог: stage_change, call_logged, task_created,
-- task_completed, meeting_scheduled, project_updated, comment_added
-- ═══════════════════════════════════════════════════════

CREATE TABLE public.activity_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id),
  event_type  TEXT NOT NULL,
  payload     JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_activity_log_project ON public.activity_log(project_id, created_at DESC);

-- RLS
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own logs"
  ON public.activity_log FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own logs"
  ON public.activity_log FOR INSERT
  WITH CHECK (user_id = auth.uid());
