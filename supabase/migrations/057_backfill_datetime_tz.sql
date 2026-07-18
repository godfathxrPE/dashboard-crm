-- 057_backfill_datetime_tz.sql — Sprint W2
-- Разовый бэкфилл исторических timestamptz, введённых через <input datetime-local>
-- по СТАРОМУ пути (когда локальное «МСК» время писалось в БД как будто это UTC).
-- С фикса W2 (datetimeLocalToIso / isoToDatetimeLocal) запись идёт корректно, поэтому
-- сдвигаем ТОЛЬКО строки, созданные ДО деплоя фронта.
--
-- ⚠️ ГЕЙТ (Cowork), ручные шаги перед apply:
--   1. Заменить <DEPLOY_TS> на фактический момент ДЕПЛОЯ ФРОНТА на Netlify
--      (НЕ merge PR — между merge и деплоем записи ещё идут по старому пути).
--   2. Прогнать SELECT-превью ниже и ГЛАЗАМИ проверить сдвигаемый набор
--      (данных мало — ~14 звонков — просмотр дёшев и обязателен).
--   3. Строки, импортированные migrate.mjs из старого дашборда, могли храниться
--      корректно (МСК уже как МСК). На гейте свериться по их created_at (день
--      миграции данных, <IMPORT_FROM>..<IMPORT_TO>) и при необходимости исключить
--      их доп. условием `and created_at not between '<IMPORT_FROM>' and '<IMPORT_TO>'`.
--   МСК = UTC+3 → сдвиг −3 часа приводит «UTC-записанное МСК» к настоящему UTC.
--
-- SELECT-превью (выполнить и проверить ПЕРЕД update; сам update закомментирован до подстановки метки):
--   select id, date, date - interval '3 hours' as fixed, created_at
--     from public.calls
--    where created_at < '<DEPLOY_TS>'::timestamptz
--    order by created_at;
--   select id, deadline, deadline - interval '3 hours' as fixed, created_at
--     from public.tasks
--    where deadline is not null and created_at < '<DEPLOY_TS>'::timestamptz
--    order by created_at;

update public.calls
set date = date - interval '3 hours'
where created_at < '<DEPLOY_TS>'::timestamptz;

update public.tasks
set deadline = deadline - interval '3 hours'
where deadline is not null
  and created_at < '<DEPLOY_TS>'::timestamptz;
