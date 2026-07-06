-- 028_ai_summary.sql — Sprint 28
-- AI-саммари звонков и встреч: структурированное резюме заметок в новых полях.
-- Пишется Edge Function `ai-summarize` под JWT вызывающего юзера (RLS решает право
-- записи; существующие UPDATE-политики calls/meetings — owner/admin ∨ created_by).
-- RLS НЕ трогаем: новые колонки покрыты теми же табличными политиками.
--
-- Формат ai_summary (jsonb):
--   {
--     "summary": string,
--     "key_points": string[],
--     "risks": string[],
--     "suggested_next_step": string,
--     "meta": { "model": string, "generated_by": uuid, "input_chars": number }
--   }
-- Событие в activity_log: event_type = 'ai_summary_generated',
--   payload = { entity_type, entity_id }.

ALTER TABLE public.calls    ADD COLUMN IF NOT EXISTS ai_summary jsonb;
ALTER TABLE public.calls    ADD COLUMN IF NOT EXISTS ai_summary_at timestamptz;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS ai_summary jsonb;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS ai_summary_at timestamptz;
