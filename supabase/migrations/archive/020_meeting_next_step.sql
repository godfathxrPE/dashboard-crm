-- ============================================
-- Migration 020: next_step у встреч — симметрия с calls
-- Итог встречи → следующий шаг → toast «создать задачу?»
-- Applied via Supabase MCP (2026-07-05)
-- ============================================

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS next_step text;
