-- 076: organizations.settings — jsonb-мешок настроек организации (R2-P0-D).
-- Первый потребитель — порог тишины `reconnect_days` (жил хардкодом в
-- src/lib/constants/reconnect.ts). Второй заложенный ключ — `stage_dwell_defaults`.
--
-- Аддитивно и полностью: политики НЕ трогаются. UPDATE на organizations остаётся
-- owner-only (`org_update_owner`, baseline + WITH CHECK из 054) — значит настройки
-- правит только владелец org, admin читает. Расширение политики под admin — отдельное
-- продуктовое решение, в этой миграции сознательно НЕ делается.
--
-- Схема значения не форсируется CHECK'ом: ключи растут по спринтам, форвард-совместимость
-- держит клиентский Zod (src/lib/validators/org-settings.ts). Неизвестные ключи не теряются —
-- запись идёт merge'ом ({...current, ...patch}), а не литералом.
-- Откат: alter table public.organizations drop column settings;

alter table public.organizations
  add column if not exists settings jsonb not null default '{}'::jsonb;

comment on column public.organizations.settings is
  'Настройки организации (R2-P0-D). Известные ключи: reconnect_days int 3..90, '
  'stage_dwell_defaults {default,<phase_group>: int 1..365}. Правит только owner '
  '(org_update_owner). Запись — merge, не перезапись.';
