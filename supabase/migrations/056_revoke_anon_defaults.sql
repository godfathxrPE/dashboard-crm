-- 056_revoke_anon_defaults.sql — Sprint W1 (безопасность данных)
--
-- Вход в приложение — только по magic link (authenticated). Под anon public-схема
-- не нужна. Снимаем default privileges и текущие гранты для anon, чтобы закрыть
-- класс риска «новая таблица без ENABLE RLS = публично читаема под anon-ключом».
--
-- Функции скопом НЕ трогаем: у definer-функций адресные ACL уже выставлены
-- (024/034/040), скоп-revoke с них ничего не даёт, а сюрпризы возможны.
--
-- Применяет гейт Cowork через apply_migration.

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
