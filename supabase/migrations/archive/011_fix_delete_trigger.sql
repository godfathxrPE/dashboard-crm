-- ═══════════════════════════════════════════════════════
-- 011: Fix delete trigger — handle missing columns gracefully
-- The generic trigger fails on tables with different column names.
-- Replace with per-table simple triggers.
-- ═══════════════════════════════════════════════════════

-- Drop the generic trigger from all tables
DROP TRIGGER IF EXISTS trg_log_delete_projects ON projects;
DROP TRIGGER IF EXISTS trg_log_delete_tasks ON tasks;
DROP TRIGGER IF EXISTS trg_log_delete_contacts ON contacts;
DROP TRIGGER IF EXISTS trg_log_delete_companies ON companies;
DROP TRIGGER IF EXISTS trg_log_delete_calls ON calls;
DROP TRIGGER IF EXISTS trg_log_delete_meetings ON meetings;
DROP FUNCTION IF EXISTS log_entity_deletion() CASCADE;

-- Simple per-table functions that only reference columns that exist

CREATE OR REPLACE FUNCTION log_delete_project() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO activity_log (project_id, user_id, event_type, payload)
  VALUES (NULL, COALESCE(OLD.owner_id, auth.uid()), 'entity_deleted',
    jsonb_build_object('entity_type', 'projects', 'entity_name', COALESCE(OLD.name, ''), 'entity_id', OLD.id));
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN RETURN OLD;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION log_delete_task() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO activity_log (project_id, user_id, event_type, payload)
  VALUES (OLD.project_id, COALESCE(OLD.created_by, auth.uid()), 'entity_deleted',
    jsonb_build_object('entity_type', 'tasks', 'entity_name', COALESCE(OLD.text, ''), 'entity_id', OLD.id));
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN RETURN OLD;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION log_delete_call() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO activity_log (project_id, user_id, event_type, payload)
  VALUES (OLD.project_id, COALESCE(OLD.created_by, auth.uid()), 'entity_deleted',
    jsonb_build_object('entity_type', 'calls', 'entity_name', 'Звонок', 'entity_id', OLD.id));
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN RETURN OLD;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION log_delete_meeting() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO activity_log (project_id, user_id, event_type, payload)
  VALUES (OLD.project_id, COALESCE(OLD.created_by, auth.uid()), 'entity_deleted',
    jsonb_build_object('entity_type', 'meetings', 'entity_name', COALESCE(OLD.title, ''), 'entity_id', OLD.id));
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN RETURN OLD;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION log_delete_contact() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO activity_log (project_id, user_id, event_type, payload)
  VALUES (NULL, COALESCE(OLD.owner_id, auth.uid()), 'entity_deleted',
    jsonb_build_object('entity_type', 'contacts', 'entity_name',
      COALESCE(NULLIF(TRIM(COALESCE(OLD.last_name,'') || ' ' || COALESCE(OLD.first_name,'')), ''), ''),
      'entity_id', OLD.id));
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN RETURN OLD;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION log_delete_company() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO activity_log (project_id, user_id, event_type, payload)
  VALUES (NULL, COALESCE(OLD.owner_id, auth.uid()), 'entity_deleted',
    jsonb_build_object('entity_type', 'companies', 'entity_name', COALESCE(OLD.name, ''), 'entity_id', OLD.id));
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN RETURN OLD;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-create triggers with per-table functions
CREATE TRIGGER trg_log_delete_projects BEFORE DELETE ON projects
  FOR EACH ROW EXECUTE FUNCTION log_delete_project();
CREATE TRIGGER trg_log_delete_tasks BEFORE DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION log_delete_task();
CREATE TRIGGER trg_log_delete_calls BEFORE DELETE ON calls
  FOR EACH ROW EXECUTE FUNCTION log_delete_call();
CREATE TRIGGER trg_log_delete_meetings BEFORE DELETE ON meetings
  FOR EACH ROW EXECUTE FUNCTION log_delete_meeting();
CREATE TRIGGER trg_log_delete_contacts BEFORE DELETE ON contacts
  FOR EACH ROW EXECUTE FUNCTION log_delete_contact();
CREATE TRIGGER trg_log_delete_companies BEFORE DELETE ON companies
  FOR EACH ROW EXECUTE FUNCTION log_delete_company();
