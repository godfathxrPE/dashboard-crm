-- Add company_id and contact_id to tasks table
-- Run manually: supabase db push or apply via dashboard

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_company_id ON tasks(company_id);
CREATE INDEX IF NOT EXISTS idx_tasks_contact_id ON tasks(contact_id);

-- Enable RLS policies for new columns (inherits existing row-level security)
-- No additional policies needed — existing user_id-based RLS covers these columns.
