-- 106: transcripts.source += 'audio' (S-R3-VOICE-1).
-- Аудио НЕ хранится: файл декодируется в браузере, уходит чанками в edge
-- `transcribe` и исчезает. storage_path остаётся null — колонка ждёт отдельного
-- решения о хранении записей, в этом спринте его нет.
-- Расширение домена CHECK'а обратно совместимо: старые строки 'paste'/'file' валидны.
alter table public.transcripts drop constraint if exists transcripts_source_check;
alter table public.transcripts add constraint transcripts_source_check
  check (source = any (array['paste'::text, 'file'::text, 'audio'::text]));
