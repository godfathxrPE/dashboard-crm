-- 089: тик диспетчера вебхуков + минутный cron (S-R2-WEBHOOK-TRANSPORT, B2, спринт 1).
--      Таблицы, RLS и RPC — в 088.
--
-- ⚠️ ПРИМЕНЯТЬ ТОЛЬКО ПОСЛЕ ДЕПЛОЯ edge-функции `webhook-dispatch`.
--    Порядок: 088 → deploy edge → 089 → фронт. Здесь лежит вызов функции;
--    применённая раньше деплоя, миграция заводит минутную джобу, которая раз
--    в минуту стучится в 404.
--
-- ⚠️ ДВА СЕКРЕТА VAULT ЗАВОДИТ ОЛЕГ РУКАМИ, НЕ МИГРАЦИЯ И НЕ CC:
--
--      select vault.create_secret('<длинный случайный ключ>', 'webhook_dispatch_key',
--             'Shared secret диспетчера вебхуков');
--      select vault.create_secret('https://uoiavcabxgdjugzryrmj.supabase.co/functions/v1/webhook-dispatch',
--             'webhook_dispatch_url', 'URL edge-функции webhook-dispatch');
--
--    То же значение ключа прописывается в Supabase Function Secrets как
--    WEBHOOK_DISPATCH_KEY. Пока секретов нет, тик тихо ничего не делает —
--    минутная джоба не должна сыпать ошибками в логи из-за ненастроенного окружения.
--
-- ⚠️ ПОЧЕМУ КЛЮЧ ИЗ VAULT, А НЕ ЛИТЕРАЛОМ. `cron.job.command` читается любым, у
--    кого есть доступ к БД, и хранится в открытом виде; текст миграции лежит в
--    репозитории. Поэтому cron зовёт функцию без аргументов, а функция достаёт
--    ключ из Vault сама. По той же причине из Vault берётся и URL проекта:
--    в organizations.settings его не положить — он общий, а не per-org.
--
-- ⚠️ ОБРАТИМОСТЬ: откат = `select cron.unschedule('webhook-retry');` +
--    `drop function public.dispatch_webhooks_tick();`. Откатывается ПЕРВОЙ,
--    до 088.

------------------------------------------------------------------------
-- 1. dispatch_webhooks_tick — единственный потребитель pg_net в проекте
------------------------------------------------------------------------
-- search_path — `public, pg_temp` по конвенции; `net` и `vault` выписаны схемой
-- явно, лишние схемы в search_path DEFINER-функции не нужны.

create or replace function public.dispatch_webhooks_tick()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text;
  v_url text;
begin
  -- Дешёвый выход: один индексный скан по idx_webhook_deliveries_queue (partial
  -- по status='pending'). Джоба минутная — единственная такая в проекте, остальные
  -- суточные, — и 1440 холостых HTTP-вызовов в сутки ей не нужны.
  if not exists (
    select 1 from public.webhook_deliveries
    where status = 'pending' and next_retry_at is not null and next_retry_at <= now()
  ) then
    return;
  end if;

  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'webhook_dispatch_key';
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'webhook_dispatch_url';

  -- Окружение не настроено — молча выходим. Очередь при этом не теряется: строки
  -- остаются pending и уедут первым же тиком после появления секретов.
  if v_key is null or v_url is null then
    return;
  end if;

  -- Fire-and-forget: pg_net кладёт запрос в свою очередь и отправляет фоновым
  -- воркером ПОСЛЕ коммита. Поэтому вызов из send_test_webhook (088) не гоняет
  -- HTTP внутри транзакции и не рискует отправить то, что потом откатится.
  --
  -- Тело пустое намеренно: функция на той стороне не принимает данных.
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'content-type',  'application/json',
                 'X-Dispatch-Key', v_key
               ),
    body    := '{}'::jsonb
  );
exception when others then
  -- Планировщик целиком никогда не падает (тот же контракт, что у
  -- run_dwell_automations 079). Минутная джоба, роняющая исключение, залила бы
  -- логи за сутки.
  return;
end $$;

comment on function public.dispatch_webhooks_tick() is
  'Будит edge-функцию webhook-dispatch, если в очереди есть готовые доставки (089). '
  'Ключ и URL берутся из Vault (webhook_dispatch_key / webhook_dispatch_url), а не из '
  'текста джобы: cron.job.command хранится и читается в открытом виде. Зовётся минутным '
  'cron''ом webhook-retry и напрямую из send_test_webhook ради немедленной доставки.';

revoke all on function public.dispatch_webhooks_tick() from public, anon, authenticated;
grant execute on function public.dispatch_webhooks_tick() to service_role;

------------------------------------------------------------------------
-- 2. pg_cron: webhook-retry, каждую минуту
------------------------------------------------------------------------
-- ⚠️ ПЕРВАЯ МИНУТНАЯ ДЖОБА В ПРОЕКТЕ. Остальные три — суточные и разведены по
--    минутам (06:00 wf-overdue-daily, 06:05 recurring-daily, 06:10 wf-dwell-daily),
--    чтобы не драться за одну минуту. Эта идёт вне того ряда: ретраи вебхуков
--    с суточным шагом бессмысленны.
--
--    Цена частоты оплачена телом функции: при пустой очереди это один индексный
--    скан по partial-индексу и выход, без обращения к Vault и без HTTP.
--
--    webhook-cleanup (ретеншн 30 дней, 06:15) — спринт 3: пока нечего чистить.

do $$
begin
  perform cron.unschedule('webhook-retry');
exception when others then null;  -- job ещё нет — ок
end $$;

select cron.schedule('webhook-retry', '* * * * *', 'select public.dispatch_webhooks_tick();');
