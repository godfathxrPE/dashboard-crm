-- 004: Tasks — Kanban board с 4 колонками

CREATE TYPE task_lane AS ENUM ('now', 'next', 'wait', 'done');
CREATE TYPE task_priority AS ENUM ('normal', 'important', 'critical');

CREATE TABLE public.tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text        TEXT NOT NULL,
  lane        task_lane NOT NULL DEFAULT 'now',
  priority    task_priority NOT NULL DEFAULT 'normal',
  project_id  UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  deadline    TIMESTAMPTZ,
  remind_min  INT,
  sort_order  INT DEFAULT 0,
  assigned_to UUID REFERENCES public.profiles(id),
  created_by  UUID REFERENCES public.profiles(id) DEFAULT auth.uid(),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_tasks_lane ON public.tasks(lane);
CREATE INDEX idx_tasks_project ON public.tasks(project_id);
CREATE INDEX idx_tasks_assigned ON public.tasks(assigned_to);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_select" ON public.tasks FOR SELECT USING (
  user_role() IN ('admin', 'pm') OR assigned_to = auth.uid() OR created_by = auth.uid()
);
CREATE POLICY "tasks_insert" ON public.tasks FOR INSERT
  WITH CHECK (user_role() IN ('admin', 'pm', 'member'));
CREATE POLICY "tasks_update" ON public.tasks FOR UPDATE USING (
  user_role() IN ('admin', 'pm') OR assigned_to = auth.uid() OR created_by = auth.uid()
);
CREATE POLICY "tasks_delete" ON public.tasks FOR DELETE USING (
  user_role() IN ('admin', 'pm') OR created_by = auth.uid()
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
