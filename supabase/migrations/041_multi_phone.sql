-- 041_multi_phone.sql — Sprint UI-D1 «Мультителефон на contacts/companies»
-- ⚠️ PENDING: НЕ применять автоприменением. Применяет ТОЛЬКО гейт Cowork через
--    MCP apply_migration, после верификации против живой БД
--    (см. _analysis/sprint-ui-D1-brackets-phones-dropdown.md).
--
-- Базовая точка — 20260712230000_baseline.sql (снимок прода 2026-07-12).
--
-- Решение: JSONB-массив `phones` на обеих таблицах. Старая одиночная колонка
-- `phone` остаётся primary-зеркалом (backward-compat: дедуп-логика модалок и
-- списки, читающие `phone`, продолжают работать; UI на submit синхронизирует
-- primary-телефон обратно в `phone`).
--
-- Элемент массива: { "type": "mobile"|"work"|"other", "value": string, "is_primary": bool }.
--
-- Новых функций НЕТ → REVOKE-правило проекта не применяется (только колонки).
-- RLS не меняется: phones живёт в той же строке, покрыт существующими
-- политиками contacts/companies.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- Колонки. NOT NULL DEFAULT '[]' — старые строки сразу получают пустой массив,
-- бэкфилл ниже переносит существующий одиночный phone первым элементом.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.contacts  ADD COLUMN IF NOT EXISTS phones jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS phones jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ─────────────────────────────────────────────────────────────────────────────
-- Бэкфилл: существующий одиночный phone → первый элемент массива, is_primary=true.
-- Контакты — тип 'mobile', компании — 'work'. Только там, где phone задан и
-- массив ещё пуст (идемпотентно при повторном прогоне).
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.contacts
   SET phones = jsonb_build_array(
     jsonb_build_object('type', 'mobile', 'value', phone, 'is_primary', true))
 WHERE phone IS NOT NULL AND phone <> '' AND phones = '[]'::jsonb;

UPDATE public.companies
   SET phones = jsonb_build_array(
     jsonb_build_object('type', 'work', 'value', phone, 'is_primary', true))
 WHERE phone IS NOT NULL AND phone <> '' AND phones = '[]'::jsonb;

COMMIT;
