-- Sprint W1a: activity-based selling
ALTER TABLE projects ADD COLUMN IF NOT EXISTS next_action_date date;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pinned_note text;

COMMENT ON COLUMN projects.next_action_date IS 'Дата следующего шага (next_step). NULL у активной сделки = rotting';
COMMENT ON COLUMN projects.pinned_note IS 'Закреплённая заметка (Focus panel, Sprint W1c)';
