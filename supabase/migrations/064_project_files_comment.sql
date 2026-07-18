-- S-PROJECT-WORKSPACE-1: комментарий к файлу проекта (п.9).
-- Аддитивно: nullable-колонка, существующие RLS project_files (own user_id + org) её покрывают,
-- политики не меняются. Применяется гейтом.
ALTER TABLE public.project_files ADD COLUMN comment text;
