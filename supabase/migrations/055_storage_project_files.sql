-- 055_storage_project_files.sql — Sprint W1 (безопасность данных)
--
-- Политики бакета project-files живут только в проде и НЕ в git → воссоздаём в
-- миграции, чтобы схема была источником истины и переносилась в новые окружения.
--
-- Клиент (use-project-files.ts) пишет в путь <user_id>/<projectId>/<uuid>.<ext>,
-- читает через createSignedUrl; метаданные — в public.project_files (RLS own-only).
-- Политики бакета паритетны метаданным: own-path (первый сегмент пути = auth.uid()).
--
-- Разведка №3 (live): бакет уже private, file_size_limit=52428800 (50 MB) —
-- строка UPDATE ниже идемпотентна. Существующие политиκи уже own-path scoped, но
-- под НЕканоническими именами ("Users can read/upload/delete own project files") и
-- не в git — дропаем именно их по фактическим именам и пересоздаём канонически.
--
-- Применяет гейт Cowork через apply_migration.

update storage.buckets
set public = false, file_size_limit = 52428800  -- 50 MB
where id = 'project-files';

-- Дроп фактических live-политик (имена из разведки №3) + канонических (идемпотентность).
drop policy if exists "Users can read own project files"   on storage.objects;
drop policy if exists "Users can upload project files"      on storage.objects;
drop policy if exists "Users can delete own project files"  on storage.objects;
drop policy if exists "project_files_select" on storage.objects;
drop policy if exists "project_files_insert" on storage.objects;
drop policy if exists "project_files_delete" on storage.objects;

create policy "project_files_select" on storage.objects for select to authenticated
  using (bucket_id = 'project-files'
     and (storage.foldername(name))[1] = ( select auth.uid() )::text);

create policy "project_files_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'project-files'
     and (storage.foldername(name))[1] = ( select auth.uid() )::text);

create policy "project_files_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'project-files'
     and (storage.foldername(name))[1] = ( select auth.uid() )::text);
