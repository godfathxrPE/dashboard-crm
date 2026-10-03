-- 135 — S-NOTES-2.1: снять мост comment_added → notes (134, секция 9).
-- СТАТУС: ПРИМЕНЕНА 2026-10-03, версия журнала `20261003130000 notes_drop_bridge` (SQL Editor владельца:
-- MCP apply_migration виснет на операторах drop — ждёт подтверждения destructive-операции).
-- Писателей comment_added в клиенте и БД нет (разведка 03.10); строки журнала НЕ трогаем —
-- это аудит. entity_timeline уже исключает comment_added (134), её не меняем.
drop trigger if exists trg_zz_notes_bridge on public.activity_log;
drop function if exists public.notes_from_comment_added();
