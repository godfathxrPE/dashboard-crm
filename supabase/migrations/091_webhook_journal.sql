-- 091: журнал доставок — повтор и ретеншн (S-R2-WEBHOOK-JOURNAL, R2-P2, эпик B2, финал).
-- Транспорт (088/089) и действие движка (090) в проде и проверены. Здесь только две
-- новые функции и пятая cron-джоба.
--
-- ⚠️ МИГРАЦИЯ АДДИТИВНА. Ни одна функция из 088/089/090 не переписывается, ни одна
--    сигнатура не меняется, таблиц и колонок не добавляется (⇒ реген типов нужен
--    только ради новых RPC в `supabase.gen.ts`).
--
-- ⚠️ ОТКАТ: `select cron.unschedule('webhook-cleanup');` +
--    `drop function public.cleanup_webhook_deliveries();` +
--    `drop function public.retry_webhook_delivery(uuid);`. Строки, созданные повтором,
--    остаются — это обычные доставки, отличить их от прочих нечем и не нужно.

------------------------------------------------------------------------
-- 1. retry_webhook_delivery — ручной повтор доставки из журнала
------------------------------------------------------------------------
-- ⚠️ ПОВТОР СОЗДАЁТ НОВУЮ СТРОКУ, А НЕ ОЖИВЛЯЕТ СТАРУЮ. Это не стилистика:
--    `id` строки уходит получателю в заголовке `X-Torii-Delivery` и в теле как
--    `payload.id`, и по контракту (G3 §4) это КЛЮЧ ДЕДУПЛИКАЦИИ — приёмнику сказано
--    игнорировать повтор с тем же значением. `update … set status='pending'` на старой
--    строке означал бы, что корректно написанный приёмник ОТБРОСИТ ручной повтор:
--    у нас статус стал бы `delivered`, а на той стороне не появилось бы ничего.
--    Ложноположительный исход — худший из возможных. Плюс провалившаяся попытка
--    исчезла бы из журнала вместе с причиной. Так же устроен «Resend» у Stripe.
--
-- ⚠️ ЛОВУШКА ВНУТРИ ЛОВУШКИ: `payload.id` в скопированном теле обязан быть переписан
--    на новый id. Иначе заголовок и тело разойдутся, и приёмник, дедуплицирующий по
--    `payload.id`, отбросит доставку, а дедуплицирующий по заголовку — примет. Два
--    поведения на одно событие.
--
-- ⚠️ `occurred_at` в payload НЕ трогаем: это время, когда событие произошло в CRM,
--    а не время отправки. Перезапись превратила бы повтор старого события в «новое
--    событие сегодня» и сломала бы опознание события по (entity.id, event, occurred_at).
--
-- Гейт роли — в теле (паттерн send_test_webhook / delete_webhook_endpoint из 088).

create or replace function public.retry_webhook_delivery(p_delivery_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org    uuid := ( select public.current_org_id() );
  v_role   text := ( select public.current_org_role() );
  v_src    public.webhook_deliveries%rowtype;
  v_ep     public.webhook_endpoints%rowtype;
  v_new_id uuid := gen_random_uuid();
begin
  if v_org is null or v_role is null then
    raise exception 'webhook_endpoint_denied: no active org' using errcode = '42501';
  end if;
  if v_role not in ('owner','admin') then
    raise exception 'webhook_endpoint_denied: owner or admin required' using errcode = '42501';
  end if;

  -- ⚠️ `org_id = v_org` обязателен И при DEFINER: RLS внутри DEFINER не действует,
  --    граница арендатора здесь держится только этим предикатом. Чужой id даёт
  --    «not found», а не «нет прав» — существование строки не подтверждаем.
  select * into v_src
  from public.webhook_deliveries
  where id = p_delivery_id and org_id = v_org;

  if not found then
    raise exception 'webhook_delivery_denied: not found' using errcode = '42501';
  end if;

  -- Повторять можно только терминальные неуспехи.
  -- `pending` нельзя: строка либо ждёт своей минуты, либо взята под 5-минутный лизинг
  -- в claim_webhook_deliveries (088) — повтор дал бы двойную отправку одного события.
  -- `delivered` повторять нечего.
  if v_src.status not in ('failed','dropped') then
    raise exception 'webhook_delivery_not_retryable' using errcode = '22023';
  end if;

  select * into v_ep
  from public.webhook_endpoints
  where id = v_src.endpoint_id and org_id = v_org;

  if not found then
    raise exception 'webhook_endpoint_denied: not found' using errcode = '42501';
  end if;

  -- ⚠️ Отключённый endpoint отказываем ЗДЕСЬ, а не ставим в очередь: захват
  --    (claim_webhook_deliveries) по is_active не фильтрует, решение принимает edge —
  --    и он немедленно пишет `dropped` («Endpoint отключён»). Повтор в выключенный
  --    endpoint не «подождёт включения», а просто добавит вторую мёртвую строку.
  if not v_ep.is_active then
    raise exception 'webhook_endpoint_inactive' using errcode = '22023';
  end if;

  insert into public.webhook_deliveries
    (id, org_id, endpoint_id, rule_id, event, payload, status, attempt, next_retry_at)
  values (
    v_new_id, v_org, v_src.endpoint_id, v_src.rule_id, v_src.event,
    -- jsonb_typeof-guard не паранойя: колонка объявлена просто `jsonb`, и на
    -- не-объекте jsonb_set бросает 22023 — исключение съело бы кнопку целиком.
    case when jsonb_typeof(v_src.payload) = 'object'
         then jsonb_set(v_src.payload, '{id}', to_jsonb(v_new_id))
         else v_src.payload
    end,
    'pending', 0, now()
  );

  -- Немедленный тик — как в send_test_webhook: пользователь смотрит на экран.
  -- (В действии движка 090 тик наоборот НЕ зовётся — там массовая правка сделок.)
  -- Guard по to_regprocedure — на случай применения 091 раньше 089 в чистом окружении.
  if to_regprocedure('public.dispatch_webhooks_tick()') is not null then
    perform public.dispatch_webhooks_tick();
  end if;

  return v_new_id;
end $$;

revoke all on function public.retry_webhook_delivery(uuid) from public, anon;
grant execute on function public.retry_webhook_delivery(uuid) to authenticated;

comment on function public.retry_webhook_delivery(uuid) is
  'Повторяет доставку из журнала (091): вставляет НОВУЮ строку с новым id и переписанным '
  'payload.id — id уходит получателю как X-Torii-Delivery и служит ключом дедупликации, '
  'поэтому оживление старой строки было бы отброшено корректным приёмником. occurred_at '
  'не трогается. Повторить можно только failed/dropped и только в активный endpoint. '
  'Гейт owner/admin — в теле.';

------------------------------------------------------------------------
-- 2. cleanup_webhook_deliveries — ретеншн журнала, 30 дней
------------------------------------------------------------------------
-- Возвращает число удалённых строк, чтобы cron.job_run_details показывал работу,
-- а не пустой успех.
--
-- ⚠️ `pending` НЕ УДАЛЯЕТСЯ НИКОГДА, независимо от возраста. Строка, висящая
--    `pending` 31 день, — это симптом (лизинг не снялся, очередь не разбирается),
--    и удалить её значит стереть единственный след проблемы. Пусть накапливается
--    и колет глаза.
--
-- Ретеншн зашит константой: единственный вызывающий — cron, а «настраиваемый
-- ретеншн» без UI это мёртвый параметр.
--
-- ⚠️ Батчинга нет намеренно: при текущем объёме единичный DELETE отрабатывает
--    мгновенно. ПОРОГ ПЕРЕСМОТРА — сотни тысяч строк: тогда DELETE надо резать на
--    пачки по 5 000 в цикле, иначе одна ночная транзакция подержит блокировку
--    дольше, чем нужно.

create or replace function public.cleanup_webhook_deliveries()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  delete from public.webhook_deliveries
  where status in ('delivered','failed','dropped')
    and created_at < now() - interval '30 days';

  get diagnostics v_deleted = row_count;
  return v_deleted;
end $$;

revoke all on function public.cleanup_webhook_deliveries() from public, anon, authenticated;
grant execute on function public.cleanup_webhook_deliveries() to service_role;

comment on function public.cleanup_webhook_deliveries() is
  'Ретеншн журнала доставок (091): удаляет ТЕРМИНАЛЬНЫЕ строки старше 30 дней и '
  'возвращает их число. pending не трогает никогда и ни в каком возрасте — висящая '
  'строка это симптом, а не мусор. Зовёт cron webhook-cleanup, 06:15 UTC.';

------------------------------------------------------------------------
-- 3. Cron webhook-cleanup — пятая джоба проекта
------------------------------------------------------------------------
-- Утренняя цепочка с шагом 5 минут (сверено с cron.job 2026-07-31):
--   wf-overdue-daily 0 6 · recurring-daily 5 6 · wf-dwell-daily 10 6 · [эта] 15 6
-- плюс минутная webhook-retry (089). 06:15 — следующий свободный слот.
--
-- ⚠️ pg_cron живёт в Postgres, а не в Vercel: ограничение тарифа Hobby «cron не чаще
--    раза в сутки» относится к Vercel Cron, которым проект не пользуется.
--
-- Идемпотентная регистрация — тот же паттерн, что в 089.
do $$
begin
  perform cron.unschedule('webhook-cleanup');
exception when others then null;  -- job ещё нет — ок
end $$;

select cron.schedule('webhook-cleanup', '15 6 * * *', 'select public.cleanup_webhook_deliveries();');
