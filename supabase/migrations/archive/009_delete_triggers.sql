-- ═══════════════════════════════════════════════════════
-- 009: Delete Triggers — логирование удаления сущностей
-- ═══════════════════════════════════════════════════════

-- Allow activity_log entries without a project (for entity deletions)
ALTER TABLE public.activity_log ALTER COLUMN project_id DROP NOT NULL;

-- Drop the existing FK (NOT NULL + CASCADE) and re-add as nullable CASCADE
ALTER TABLE public.activity_log DROP CONSTRAINT IF EXISTS activity_log_project_id_fkey;
ALTER TABLE public.activity_log
  ADD CONSTRAINT activity_log_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

-- Also add ON DELETE SET NULL for other tables referencing projects
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_project_id_fkey;
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

ALTER TABLE public.calls DROP CONSTRAINT IF EXISTS calls_project_id_fkey;
ALTER TABLE public.calls
  ADD CONSTRAINT calls_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

ALTER TABLE public.meetings DROP CONSTRAINT IF EXISTS meetings_project_id_fkey;
ALTER TABLE public.meetings
  ADD CONSTRAINT meetings_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

-- Universal deletion logging function
CREATE OR REPLACE FUNCTION log_entity_deletion()
RETURNS TRIGGER AS $$
DECLARE
  entity_label TEXT;
  p_user_id UUID;
BEGIN
  -- Determine entity label
  CASE TG_TABLE_NAME
    WHEN 'projects' THEN
      entity_label := COALESCE(OLD.name, 'Без названия');
    WHEN 'tasks' THEN
      entity_label := COALESCE(OLD.text, 'Без названия');
    WHEN 'contacts' THEN
      entity_label := COALESCE(
        NULLIF(TRIM(COALESCE(OLD.last_name, '') || ' ' || COALESCE(OLD.first_name, '')), ''),
        'Без имени'
      );
    WHEN 'companies' THEN
      entity_label := COALESCE(OLD.name, 'Без названия');
    WHEN 'calls' THEN
      entity_label := 'Звонок';
    WHEN 'meetings' THEN
      entity_label := COALESCE(OLD.title, 'Встреча');
    ELSE
      entity_label := 'Запись';
  END CASE;

  -- Get user id per table (not all tables have the same column)
  CASE TG_TABLE_NAME
    WHEN 'projects' THEN   p_user_id := OLD.owner_id;
    WHEN 'companies' THEN  p_user_id := OLD.owner_id;
    WHEN 'contacts' THEN   p_user_id := OLD.owner_id;
    WHEN 'tasks' THEN      p_user_id := OLD.created_by;
    WHEN 'calls' THEN      p_user_id := OLD.created_by;
    WHEN 'meetings' THEN   p_user_id := OLD.created_by;
    ELSE                   p_user_id := NULL;
  END CASE;
  p_user_id := COALESCE(p_user_id, auth.uid());

  -- Skip if no user
  IF p_user_id IS NULL THEN
    RETURN OLD;
  END IF;

  INSERT INTO public.activity_log (project_id, user_id, event_type, payload)
  VALUES (
    CASE
      WHEN TG_TABLE_NAME IN ('projects', 'contacts', 'companies') THEN NULL
      ELSE OLD.project_id
    END,
    p_user_id,
    'entity_deleted',
    jsonb_build_object(
      'entity_type', TG_TABLE_NAME,
      'entity_name', entity_label,
      'entity_id', OLD.id
    )
  );

  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  -- Don't block deletion if logging fails
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers
DROP TRIGGER IF EXISTS trg_log_delete_projects ON projects;
CREATE TRIGGER trg_log_delete_projects
  BEFORE DELETE ON projects
  FOR EACH ROW EXECUTE FUNCTION log_entity_deletion();

DROP TRIGGER IF EXISTS trg_log_delete_tasks ON tasks;
CREATE TRIGGER trg_log_delete_tasks
  BEFORE DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION log_entity_deletion();

DROP TRIGGER IF EXISTS trg_log_delete_contacts ON contacts;
CREATE TRIGGER trg_log_delete_contacts
  BEFORE DELETE ON contacts
  FOR EACH ROW EXECUTE FUNCTION log_entity_deletion();

DROP TRIGGER IF EXISTS trg_log_delete_companies ON companies;
CREATE TRIGGER trg_log_delete_companies
  BEFORE DELETE ON companies
  FOR EACH ROW EXECUTE FUNCTION log_entity_deletion();

DROP TRIGGER IF EXISTS trg_log_delete_calls ON calls;
CREATE TRIGGER trg_log_delete_calls
  BEFORE DELETE ON calls
  FOR EACH ROW EXECUTE FUNCTION log_entity_deletion();

DROP TRIGGER IF EXISTS trg_log_delete_meetings ON meetings;
CREATE TRIGGER trg_log_delete_meetings
  BEFORE DELETE ON meetings
  FOR EACH ROW EXECUTE FUNCTION log_entity_deletion();

-- RLS: allow selecting logs without project (for deletion events)
DROP POLICY IF EXISTS "Users see own logs" ON public.activity_log;
CREATE POLICY "Users see own logs"
  ON public.activity_log FOR SELECT
  USING (user_id = auth.uid());

-- Allow trigger (SECURITY DEFINER) to insert
DROP POLICY IF EXISTS "Service insert logs" ON public.activity_log;
CREATE POLICY "Service insert logs"
  ON public.activity_log FOR INSERT
  WITH CHECK (true);

-- Allow deleting activity_log entries (for project cleanup)
DROP POLICY IF EXISTS "Users delete own logs" ON public.activity_log;
CREATE POLICY "Users delete own logs"
  ON public.activity_log FOR DELETE
  USING (user_id = auth.uid());
