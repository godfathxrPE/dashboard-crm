-- 105: сид-сегмент «Неполные сделки» (S-R3-TRUST-1).
-- Схема НЕ меняется: поле completeness_score — вычисляемое на клиенте
-- (src/lib/domain/segment-eval.ts, VIRTUAL_FIELDS), таблица и RLS заведены в 077.
-- Это ТОЛЬКО данные — политик, грантов, колонок и функций миграция не трогает.
--
-- ⚠️ Порог 60 — КОНСТАНТА и вынесен в ИМЯ сегмента, как «Залипли >14 дней» (086):
-- предикат считается на клиенте и про organizations.settings.completeness_rules
-- не знает. Назвать сегмент «Неполные сделки» без числа значило бы обещать
-- согласованность с настройкой весов, которой нет. Имя с числом честнее:
-- пользователь правит его руками, как любой другой сегмент.
--
-- sort_order = 60 — следующий после 086 (10/20/30/40 из 077, 50 из 086).
-- Идемпотентно: конфликт по uq_segments_shared_name (org_id, entity, name) where is_shared
-- → do nothing. Повторный apply безопасен.
insert into public.segments (org_id, name, entity, predicate, is_shared, sort_order)
select o.id, 'Полнота <60%', 'deals',
  '{"version":1,"and":[
      {"field":"status","op":"eq","value":"open"},
      {"field":"completeness_score","op":"lt","value":60}
   ]}'::jsonb,
  true, 60
from public.organizations o
on conflict do nothing;
