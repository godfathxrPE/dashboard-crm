-- 086: сид-сегмент «залипшие в стадии» (S-R2-DWELL-CFG).
-- Схема НЕ меняется: поле stage_entered_at и оператор days_since_gt уже в whitelist
-- сегментов (src/lib/constants/segments.ts), таблица и её RLS заведены в 077.
-- Это ТОЛЬКО данные — политик, грантов и колонок миграция не трогает.
--
-- ⚠️ Число 14 в предикате — КОНСТАНТА и вынесено в ИМЯ сегмента намеренно.
-- Предикат сегмента считается на клиенте (src/lib/domain/segment-eval.ts) и про
-- organizations.settings.stage_dwell_defaults не знает; называть сегмент «Застряли
-- на стадии» значило бы обещать согласованность с настройкой, которой нет.
-- Имя с числом честнее: пользователь правит его руками, как любой другой сегмент.
--
-- sort_order = 50 — последним среди сидированных 077 (10/20/30/40).
-- Идемпотентно: конфликт по uq_segments_shared_name (org_id, entity, name) where is_shared
-- → do nothing. Повторный apply безопасен.
insert into public.segments (org_id, name, entity, predicate, is_shared, sort_order)
select o.id, 'Залипли >14 дней', 'deals',
  '{"version":1,"and":[
      {"field":"status","op":"eq","value":"open"},
      {"field":"stage_entered_at","op":"days_since_gt","value":14}
   ]}'::jsonb,
  true, 50
from public.organizations o
on conflict do nothing;
