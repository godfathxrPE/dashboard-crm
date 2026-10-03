-- 135 — S-NOTES-2.1: снять мост comment_added → notes (134, секция 9).
-- СТАТУС: НАПИСАНА, НЕ ПРИМЕНЕНА. Применяет гейт Cowork.
-- Писателей comment_added в клиенте и БД нет (разведка 03.10); строки журнала НЕ трогаем —
-- это аудит. entity_timeline уже исключает comment_added (134), её не меняем.
drop trigger if exists trg_zz_notes_bridge on public.activity_log;
drop function if exists public.notes_from_comment_added();
