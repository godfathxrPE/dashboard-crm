-- ═══════════════════════════════════════════════════════
-- 133 — pg_cron: реже холостые тики и чистка истории запусков (долг I-1, шаг 1).
-- СТАТУС: ПРИМЕНЕНА гейтом Cowork 2026-09-26 (`20260926102002`) по «да» владельца.
--
-- Письмо Supabase 24.09: база выбирает суточный бюджет Disk IO. Данные ни при чём
-- (51 MB, целиком в кэше). Половина базы — `cron.job_run_details`: 167 тыс. строк, 28 MB,
-- не чистится с 18.07. Каждый запуск джобы — insert + несколько update в эту таблицу и WAL,
-- даже когда функция выходит на первом `if not exists`. Замер 26.09: 3 173 запуска за сутки,
-- из них ~2 880 — две минутные джобы, у которых работы почти нет:
--   webhook-retry — 0 строк в `webhook_deliveries` за всё время;
--   tg-send       — 6 сообщений в `telegram_outbox` за 30 дней.
--
-- ⚠️ tg-send — ОСНОВНОЙ путь доставки Telegram, не ретрай: `telegram_outbox.next_retry_at`
-- по умолчанию `now()`, триггера мгновенной отправки нет. Поэтому `*/5` поднимает задержку
-- уведомлений с ≤1 до ≤5 мин — принято при 6 сообщениях в месяц. Сдвиг `1-59/5` (минуты
-- 1, 6, 11…) ставит отправку через минуту после `tg-reminders` (`*/5`, минуты 0, 5, 10…):
-- задержка напоминаний остаётся прежней, ~1 мин. Вернуть мгновенность, если понадобится, —
-- statement-триггер AFTER INSERT на outbox, зовущий `telegram_send_tick()` (pg_net шлёт
-- после коммита), а крон оставить ретраем.
-- webhook-retry → `*/15`: подписчиков нет, первая доставка появится вместе с ними —
-- тогда пересмотреть.
--
-- Чистка: разово — старше 3 дней, дальше ежедневно `cron-history-cleanup` в 06:25 UTC
-- (рядом с остальными суточными уборками 06:00–06:20). `end_time IS NULL` (идущий запуск)
-- не трогается. VACUUM FULL не делается: место переиспользуется, цель — IO, не размер.
-- ═══════════════════════════════════════════════════════

select cron.alter_job(
  job_id   := (select jobid from cron.job where jobname = 'webhook-retry'),
  schedule := '*/15 * * * *'
);

select cron.alter_job(
  job_id   := (select jobid from cron.job where jobname = 'tg-send'),
  schedule := '1-59/5 * * * *'
);

delete from cron.job_run_details where end_time < now() - interval '3 days';

do $$
begin
  perform cron.unschedule('cron-history-cleanup');
exception when others then null;  -- джобы ещё нет — ок
end $$;

select cron.schedule(
  'cron-history-cleanup',
  '25 6 * * *',
  $cmd$delete from cron.job_run_details where end_time < now() - interval '3 days'$cmd$
);
