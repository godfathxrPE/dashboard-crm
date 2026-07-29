-- 088: транспорт исходящих вебхуков — расширение, таблицы, RLS, секрет через Vault
--      (S-R2-WEBHOOK-TRANSPORT, эпик B2, спринт 1 из трёх).
--      Тик и cron — в 089, ПОСЛЕ деплоя edge-функции webhook-dispatch.
--
-- ⚠️ ПОРЯДОК ДЕПЛОЯ (менять нельзя): 088 → edge `webhook-dispatch` → 089 → фронт.
--    089 содержит URL функции; звать несуществующую бессмысленно.
--
-- ⚠️ ОБРАТИМОСТЬ. Откат 088 = drop обеих таблиц, трёх RPC и `drop extension pg_net`,
--    плюс вернуть notifications_type_check к пяти значениям (079:29-31). Безопасен
--    только ПОСЛЕ отката 089 (там функция ссылается на webhook_deliveries).
--    Порядок отката: 089, затем 088.
--    Секреты, заведённые в vault.secrets через create_webhook_endpoint, откатом НЕ
--    удаляются — их снимает delete_webhook_endpoint либо ручной delete по имени
--    'webhook_%'. Оставленный секрет безвреден (endpoint'а уже нет), но копится.
--
-- ⚠️ CHECK notifications_type_check сужать обратно нельзя, пока в таблице есть строки
--    с 'webhook_disabled' — сначала delete, потом re-narrow (урок 083).
--
-- ⚠️ ГРАНИЦЫ СПРИНТА. Движок автоматизаций здесь НЕ трогается вовсе:
--    automation_rules_action_type_check остаётся с пятью значениями,
--    wf_apply_project_action не переписывается. Единственный вход в очередь —
--    send_test_webhook (event 'webhook.test'). `action_type='webhook'` — спринт 2.
--
-- Отклонения от текста спринта (и почему):
--   • `search_path` у всех четырёх RPC — `public, pg_temp` (конвенция проекта), а НЕ
--     `public, pg_temp, vault`: вызовы vault.* выписаны схемой явно, и тогда лишняя
--     схема в search_path DEFINER-функции — только поверхность атаки, без пользы.
--   • Добавлена четвёртая RPC `delete_webhook_endpoint`, которой в тексте спринта нет.
--     Причина: DELETE у `authenticated` отозван (запись только через RPC), значит
--     «удалить endpoint» из UI иначе не выполнить; и вместе со строкой обязан уходить
--     её секрет из vault.secrets, иначе Vault копит мусор, на который уже никто не
--     сошлётся.
--   • Индекс очереди — `(next_retry_at) where status = 'pending'`, а не
--     `(status, next_retry_at) where …` из арх-дока §2.2: под partial-предикатом по
--     константному статусу первая колонка ключа вырождается в константу.

------------------------------------------------------------------------
-- 1. Расширение pg_net
------------------------------------------------------------------------
-- ⚠️ Первое HTTP-расширение в проекте (`net.http_post` — 0 совпадений в репо до 088).
--    pg_net объявлен relocatable = false со schema = 'net', поэтому схему создаёт сам:
--    `with schema` писать НЕ нужно (и нельзя — упадёт).
--    Если apply споткнётся о права — включить через Dashboard → Database → Extensions
--    руками; прецедент задокументирован для pg_cron (051:128-129).
--    Проверка после apply: select count(*) from pg_extension where extname = 'pg_net' → 1.
--
--    Здесь расширение только ставится. Единственный его потребитель — 089.

create extension if not exists pg_net;

------------------------------------------------------------------------
-- 2. webhook_endpoints — конфигурация получателя
------------------------------------------------------------------------
-- В таблице НЕТ ничего, чем можно подписать запрос: только secret_id — ссылка в
-- vault.secrets. Это требование §4.2 арх-дока, а не осторожность.

create table if not exists public.webhook_endpoints (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  name                 text not null check (char_length(trim(name)) between 1 and 120),
  -- Схему проверяем и в БД: RPC — не единственный мыслимый путь записи (миграция,
  -- ручной фикс), а https-only — инвариант, а не правило валидации формы.
  -- Порт, IP-литерал и allowlist требуют разбора URL и живут в dispatcher'е.
  url                  text not null check (url ~ '^https://'),
  secret_id            uuid not null,
  is_active            boolean not null default true,
  description          text,
  -- Наблюдаемость: денормализация ради списка в UI без агрегата по журналу.
  last_delivery_at     timestamptz,
  last_status_code     int,
  consecutive_failures int not null default 0 check (consecutive_failures >= 0),
  disabled_reason      text,
  created_by           uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_webhook_endpoints_org
  on public.webhook_endpoints (org_id);

------------------------------------------------------------------------
-- 3. webhook_deliveries — журнал и очередь одновременно
------------------------------------------------------------------------
-- Одна таблица вместо пары «очередь + история»: очередь мала (единицы событий в
-- минуту), а разделение потребовало бы синхронизации двух источников для UI (§2.2).
--
-- Soft delete не заводим — технический журнал, тот же класс, что notifications и
-- automation_runs. Это осознанное исключение, а не недосмотр.

create table if not exists public.webhook_deliveries (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  endpoint_id     uuid not null references public.webhook_endpoints(id) on delete cascade,
  -- null у тестовых отправок; у боевых — правило, породившее событие (спринт 2).
  rule_id         uuid references public.automation_rules(id) on delete set null,
  -- Доменное имя события, НЕ имя триггера: набор trigger_type менялся четырежды,
  -- получатель не должен от этого ломаться (§3.2). Словарь значений намеренно НЕ
  -- зафиксирован CHECK'ом — он расширяется спринтом 2, и re-narrow дороже пользы.
  event           text not null check (char_length(trim(event)) between 1 and 64),
  -- Ровно то, что уйдёт в body. Хранится целиком: без этого нельзя «Повторить».
  payload         jsonb not null check (octet_length(payload::text) <= 65536),
  status          text not null default 'pending'
                    check (status in ('pending','delivered','failed','dropped')),
  attempt         int not null default 0 check (attempt >= 0),
  next_retry_at   timestamptz,          -- null у финальных статусов
  response_status int,
  response_body   text,                 -- усечён до 8 КБ в dispatcher'е (§4.5)
  error           text,                 -- сетевые / DNS / SSRF-отказы
  created_at      timestamptz not null default now(),
  delivered_at    timestamptz
);

-- Очередь. Partial по status: минутная джоба обязана читать живую очередь, а не
-- весь журнал. Ключ — только next_retry_at: под этим предикатом status константен.
create index if not exists idx_webhook_deliveries_queue
  on public.webhook_deliveries (next_retry_at)
  where status = 'pending';

-- Журнал одного endpoint'а (секция «Вебхуки», спринт 3).
create index if not exists idx_webhook_deliveries_endpoint
  on public.webhook_deliveries (endpoint_id, created_at desc);

create index if not exists idx_webhook_deliveries_org
  on public.webhook_deliveries (org_id, created_at desc);

------------------------------------------------------------------------
-- 4. Триггеры новых таблиц
------------------------------------------------------------------------
-- `set_org_id` НЕ вешаем: org_id приходит явно (из RPC). Тот же выбор в
-- segments / stage_requirements / invitations / checklists — в DEFINER-контексте
-- current_org_id() может вернуть NULL, и явная передача надёжнее подстановки.
--
-- Заморозка org_id обязательна и выписывается руками: автоцикл 054 покрывает
-- только таблицы, существовавшие на момент 054. Префикс `aa_` не косметика —
-- порядок исполнения триггеров алфавитный (проект уже обжёгся на
-- trg_sync_deal_stage_fields против trg_sync_project_stage).

drop trigger if exists trg_aa_freeze_org_id on public.webhook_endpoints;
create trigger trg_aa_freeze_org_id
  before update of org_id on public.webhook_endpoints
  for each row
  when (old.org_id is distinct from new.org_id)
  execute function public.freeze_org_id();

drop trigger if exists trg_aa_freeze_org_id on public.webhook_deliveries;
create trigger trg_aa_freeze_org_id
  before update of org_id on public.webhook_deliveries
  for each row
  when (old.org_id is distinct from new.org_id)
  execute function public.freeze_org_id();

-- updated_at только у endpoints: у deliveries его нет по модели (created_at +
-- delivered_at, §2.2). Функция называется `update_updated_at` — `set_updated_at`
-- в схеме НЕТ вовсе, имена в проекте разъезжаются, не угадывать.
drop trigger if exists trg_set_updated_at on public.webhook_endpoints;
create trigger trg_set_updated_at
  before update on public.webhook_endpoints
  for each row execute function public.update_updated_at();

------------------------------------------------------------------------
-- 5. RLS
------------------------------------------------------------------------
-- current_org_*() строго в обёртке ( select … ) — initplan-оптимизация, иначе
-- функция вычисляется на каждую строку (advisor WARN).

alter table public.webhook_endpoints  enable row level security;
alter table public.webhook_deliveries enable row level security;

-- ── webhook_endpoints: читают все члены org, правят owner/admin ──
-- Политики записи — второй контур поверх отозванных грантов (п. 6). Дублирование
-- намеренное: грант может однажды расшириться регеном дефолтов, политика — нет.
create policy webhook_endpoints_select on public.webhook_endpoints
  for select to authenticated
  using ( org_id = ( select public.current_org_id() ) );

create policy webhook_endpoints_write on public.webhook_endpoints
  for all to authenticated
  using (
    org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin')
  )
  with check (
    org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin')
  );

-- ── webhook_deliveries: SELECT ТОЛЬКО owner/admin ──
-- ⚠️ ЭТО НЕ ОПЕЧАТКА И НЕ КОПИПАСТА С endpoints. В payload лежат бюджеты сделок и
--    имена контактов (§4.3); рядовому участнику журнал доставок не нужен, а утечка
--    через него — настоящая. Запись не даётся никому: пишет только SECURITY DEFINER.
create policy webhook_deliveries_select on public.webhook_deliveries
  for select to authenticated
  using (
    org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin')
  );

------------------------------------------------------------------------
-- 6. Гранты
------------------------------------------------------------------------
-- С 082 дефолтные привилегии postgres в public сужены в корне, и новая таблица
-- приходит с authenticated = arwd. Значит `revoke truncate, references, trigger`
-- писать не нужно, а вот insert/update/delete отозвать НАДО явно: по умолчанию они
-- есть. Права разбирать поэлементно через unnest(relacl) — `like` по склейке врёт
-- (грабля 080).
--
-- `revoke ... from anon` остаётся: default ACL роли supabase_admin в public всё ещё
-- раздаёт anon полный набор.

revoke all on public.webhook_endpoints  from anon;
revoke all on public.webhook_deliveries from anon;

-- Запись только через RPC: секрет генерируется в БД, и клиент не должен уметь
-- вставить строку с чужим secret_id либо переписать secret_id на существующей.
revoke insert, update, delete on public.webhook_endpoints  from authenticated;
revoke insert, update, delete on public.webhook_deliveries from authenticated;

grant select on public.webhook_endpoints  to authenticated;  -- поверх RLS
grant select on public.webhook_deliveries to authenticated;  -- поверх RLS (owner/admin)

------------------------------------------------------------------------
-- 7. create_webhook_endpoint — единственное место, где секрет покидает БД
------------------------------------------------------------------------
-- ⚠️ NOT_VERIFIED до гейта: доступность vault.create_secret из миграции под postgres
--    в этом проекте не проверялась ни разу (Vault 0.3.1 установлен, но не использован).
--    Проверка первым делом после apply:
--      select vault.create_secret('probe-value', 'probe_' || gen_random_uuid()::text, 'проба');
--      select name, decrypted_secret from vault.decrypted_secrets where name like 'probe_%';
--      delete from vault.secrets where name like 'probe_%';
--    Если недоступно — план Б в §4.2 арх-дока (ciphertext в колонке + pgp_sym_encrypt
--    ключом из Function Secrets). Это свой крипто-код и своя ротация, поэтому путь второй.

create or replace function public.create_webhook_endpoint(
  p_name        text,
  p_url         text,
  p_description text default null
)
returns table (endpoint_id uuid, secret text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org       uuid := ( select public.current_org_id() );
  v_role      text := ( select public.current_org_role() );
  v_secret    text;
  v_secret_id uuid;
  v_id        uuid;
begin
  -- DEFINER обходит RLS — гейт роли проверяем руками (тот же принцип, что в
  -- toggle_checklist_item 084 и check_stage_requirements).
  if v_org is null or v_role is null then
    raise exception 'webhook_endpoint_denied: no active org' using errcode = '42501';
  end if;
  if v_role not in ('owner','admin') then
    raise exception 'webhook_endpoint_denied: owner or admin required' using errcode = '42501';
  end if;

  if p_url is null or p_url !~ '^https://' then
    raise exception 'url_must_be_https' using errcode = '22023';
  end if;
  if p_name is null or char_length(trim(p_name)) = 0 then
    raise exception 'name_required' using errcode = '22023';
  end if;

  -- 32 байта энтропии, hex — 64 символа. pgcrypto живёт в схеме extensions.
  v_secret := encode(extensions.gen_random_bytes(32), 'hex');

  -- Имя секрета обязано быть уникальным в Vault; привязку «секрет ↔ endpoint»
  -- держит webhook_endpoints.secret_id, имя нужно только для читаемости.
  v_secret_id := vault.create_secret(
    v_secret,
    'webhook_' || gen_random_uuid()::text,
    'HMAC secret для webhook_endpoints (088)'
  );

  insert into public.webhook_endpoints (org_id, name, url, secret_id, description, created_by)
  values (v_org, trim(p_name), p_url, v_secret_id, nullif(trim(coalesce(p_description,'')), ''), auth.uid())
  returning id into v_id;

  return query select v_id, v_secret;
end $$;

comment on function public.create_webhook_endpoint(text, text, text) is
  'Создаёт endpoint и его HMAC-секрет (088). Секрет кладётся в Vault, в таблицу идёт '
  'только secret_id; возвращается вызывающему РОВНО ОДИН РАЗ и повторно не показывается '
  '(только rotate_webhook_secret). Гейт роли owner/admin — внутри, DEFINER обходит RLS.';

------------------------------------------------------------------------
-- 8. rotate_webhook_secret — новый секрет, старый недействителен сразу
------------------------------------------------------------------------
create or replace function public.rotate_webhook_secret(p_endpoint_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org       uuid := ( select public.current_org_id() );
  v_role      text := ( select public.current_org_role() );
  v_secret_id uuid;
  v_secret    text;
begin
  if v_org is null or v_role is null then
    raise exception 'webhook_endpoint_denied: no active org' using errcode = '42501';
  end if;
  if v_role not in ('owner','admin') then
    raise exception 'webhook_endpoint_denied: owner or admin required' using errcode = '42501';
  end if;

  -- `for update`: секрет меняется read-modify-write в двух местах (Vault + строка),
  -- две одновременные ротации иначе разошлись бы. Урок toggle_checklist_item (084).
  select secret_id into v_secret_id
  from public.webhook_endpoints
  where id = p_endpoint_id and org_id = v_org
  for update;

  if not found then
    raise exception 'webhook_endpoint_denied: not found' using errcode = '42501';
  end if;

  v_secret := encode(extensions.gen_random_bytes(32), 'hex');
  perform vault.update_secret(v_secret_id, v_secret);

  -- Тронуть строку, чтобы updated_at показал момент ротации: сам секрет в строке
  -- не лежит, и без этого факт ротации в таблице не виден вовсе.
  update public.webhook_endpoints set updated_at = now() where id = p_endpoint_id;

  return v_secret;
end $$;

comment on function public.rotate_webhook_secret(uuid) is
  'Перегенерирует HMAC-секрет endpoint''а (088) и отдаёт новый один раз. Старый '
  'перестаёт действовать немедленно — доставки в полёте с ним не сверятся.';

------------------------------------------------------------------------
-- 9. delete_webhook_endpoint — строка и её секрет уходят вместе
------------------------------------------------------------------------
-- Нужна потому, что DELETE у authenticated отозван (п. 6). Заодно снимает секрет
-- из Vault: без этого Vault копил бы записи, на которые уже никто не сошлётся.
-- Журнал доставок уходит по on delete cascade — это осознанно: журнал без
-- endpoint'а нечитаем, а ретеншн всё равно 30 дней (спринт 3).

create or replace function public.delete_webhook_endpoint(p_endpoint_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org       uuid := ( select public.current_org_id() );
  v_role      text := ( select public.current_org_role() );
  v_secret_id uuid;
begin
  if v_org is null or v_role is null then
    raise exception 'webhook_endpoint_denied: no active org' using errcode = '42501';
  end if;
  if v_role not in ('owner','admin') then
    raise exception 'webhook_endpoint_denied: owner or admin required' using errcode = '42501';
  end if;

  delete from public.webhook_endpoints
  where id = p_endpoint_id and org_id = v_org
  returning secret_id into v_secret_id;

  if not found then
    raise exception 'webhook_endpoint_denied: not found' using errcode = '42501';
  end if;

  delete from vault.secrets where id = v_secret_id;
end $$;

comment on function public.delete_webhook_endpoint(uuid) is
  'Удаляет endpoint вместе с его секретом в Vault (088). Прямой DELETE у authenticated '
  'отозван, поэтому удаление из UI идёт только сюда. Журнал доставок уходит каскадом.';

------------------------------------------------------------------------
-- 10. send_test_webhook — единственный вход в очередь в этом спринте
------------------------------------------------------------------------
-- Смысл: проверить транспорт целиком ДО того, как к нему подключён движок правил.
-- Отладка «почему не доехало» в двух подсистемах сразу дороже, чем в одной.

create or replace function public.send_test_webhook(p_endpoint_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org         uuid := ( select public.current_org_id() );
  v_role        text := ( select public.current_org_role() );
  v_ep          public.webhook_endpoints%rowtype;
  v_delivery_id uuid := gen_random_uuid();
  v_now         timestamptz := now();
begin
  if v_org is null or v_role is null then
    raise exception 'webhook_endpoint_denied: no active org' using errcode = '42501';
  end if;
  if v_role not in ('owner','admin') then
    raise exception 'webhook_endpoint_denied: owner or admin required' using errcode = '42501';
  end if;

  select * into v_ep
  from public.webhook_endpoints
  where id = p_endpoint_id and org_id = v_org;

  if not found then
    raise exception 'webhook_endpoint_denied: not found' using errcode = '42501';
  end if;
  if not v_ep.is_active then
    raise exception 'webhook_endpoint_inactive' using errcode = '22023';
  end if;

  -- ⚠️ occurred_at — to_char(… at time zone 'UTC', …), НЕ ::text: для timestamptz
  --    ::text зависит от session TimeZone/DateStyle, и значение из UI (MSK) не
  --    совпало бы со значением из cron (UTC). Грабля 079/084, здесь она стоила бы
  --    подписи: получатель сверяет тело побайтово.
  insert into public.webhook_deliveries
    (id, org_id, endpoint_id, rule_id, event, payload, status, attempt, next_retry_at)
  values (
    v_delivery_id,
    v_org,
    p_endpoint_id,
    null,
    'webhook.test',
    jsonb_build_object(
      'version',     1,
      'id',          v_delivery_id,
      'event',       'webhook.test',
      'occurred_at', to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'org_id',      v_org,
      'data',        jsonb_build_object('message', 'Тестовая доставка из Torii CRM')
    ),
    'pending',
    0,
    v_now
  );

  -- Немедленная доставка, без ожидания минутной джобы.
  --
  -- ⚠️ Guard по to_regprocedure — не украшение: между apply 088 и apply 089
  --    dispatch_webhooks_tick() ещё не существует, и без guard'а тестовая отправка
  --    падала бы исключением вместо того, чтобы просто встать в очередь.
  if to_regprocedure('public.dispatch_webhooks_tick()') is not null then
    perform public.dispatch_webhooks_tick();
  end if;

  return v_delivery_id;
end $$;

comment on function public.send_test_webhook(uuid) is
  'Ставит в очередь тестовую доставку (event webhook.test) и немедленно дёргает '
  'dispatch_webhooks_tick, если та уже создана (089). Единственный вход в очередь '
  'в спринте 1: движок автоматизаций к вебхукам ещё не подключён.';

------------------------------------------------------------------------
-- 11. Три RPC для диспетчера — ТОЛЬКО service_role
------------------------------------------------------------------------
-- ⚠️ ЭТОГО БЛОКА НЕТ В ТЕКСТЕ СПРИНТА. Он там подразумевал, что edge читает
--    `vault.decrypted_secrets` и пишет таблицы напрямую через supabase-js. Так
--    не выйдет: PostgREST отдаёт только выставленные схемы (public,
--    graphql_public), схемы `vault` среди них нет и выставлять её нельзя —
--    это открыло бы все секреты проекта на HTTP. Значит доступ к секрету идёт
--    через DEFINER-функцию в public с ACL только у service_role.
--
--    Раз такая функция всё равно нужна, туда же уходят захват очереди и запись
--    результата. Выгода не только в симметрии: edge-функции тогда НЕ нужны
--    гранты на сами таблицы вовсе — сервисный ключ работает исключительно через
--    три эти двери, и поверхность «что может ключ, если утечёт» сужается до них.

-- ── 11.1 Захват батча ──
-- ⚠️ ОТКЛОНЕНИЕ ОТ СПРИНТА, осознанное. Спринт предлагал read-then-update
--    (`update … where id = ? and status = 'pending'` с проверкой затронутых строк).
--    Здесь захват сделан одним `for update skip locked`: это не митигация гонки,
--    а её отсутствие — две джобы физически не увидят одну строку.
--
-- ⚠️ ВТОРОЕ ОТКЛОНЕНИЕ: захваченная строка получает next_retry_at = now() + лизинг
--    (5 мин), а НЕ null. С null умерший на полпути isolate оставлял бы строку
--    навсегда в pending без времени — её не подберёт ни один тик. Тот же класс
--    проблемы, что «зомби-прогон» в ai-run (STALE_RUN_MINUTES), и лечится так же:
--    временем, а не надеждой. Лизинг 5 мин ≫ таймаута запроса 5 с, поэтому живой
--    диспетчер успевает перезаписать строку финальным статусом раньше, чем она
--    снова станет видимой.

create or replace function public.claim_webhook_deliveries(p_limit int default 50)
returns table (
  delivery_id       uuid,
  org_id            uuid,
  endpoint_id       uuid,
  event             text,
  payload           jsonb,
  attempt           int,
  url               text,
  endpoint_active   boolean,
  allowed_hosts     jsonb,
  failure_threshold int
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lease interval := interval '5 minutes';
begin
  return query
  with picked as (
    select d.id
    from public.webhook_deliveries d
    where d.status = 'pending'
      and d.next_retry_at is not null
      and d.next_retry_at <= now()
    order by d.next_retry_at
    limit greatest(coalesce(p_limit, 50), 1)
    for update skip locked
  ),
  claimed as (
    update public.webhook_deliveries d
    set attempt = d.attempt + 1,
        next_retry_at = now() + v_lease
    from picked p
    where d.id = p.id
    returning d.id, d.org_id, d.endpoint_id, d.event, d.payload, d.attempt
  )
  select
    c.id,
    c.org_id,
    c.endpoint_id,
    c.event,
    c.payload,
    c.attempt,
    e.url,
    e.is_active,
    coalesce(o.settings -> 'webhook_allowed_hosts', '[]'::jsonb),
    coalesce((o.settings ->> 'webhook_failure_threshold')::int, 20)
  from claimed c
  join public.webhook_endpoints e on e.id = c.endpoint_id
  join public.organizations     o on o.id = c.org_id;
end $$;

comment on function public.claim_webhook_deliveries(int) is
  'Атомарный захват батча очереди вебхуков (088), только service_role. '
  '`for update skip locked` исключает двойную отправку; захваченная строка получает '
  'лизинг 5 мин вместо next_retry_at = null, иначе умерший isolate оставил бы её '
  'в pending навсегда. Отдаёт заодно url endpoint''а и настройки org, чтобы '
  'диспетчеру не требовались гранты на таблицы.';

-- ── 11.2 Секреты подписи ──
-- Единственная дверь из public в vault. Массивом, а не по одному: диспетчер
-- зовёт её ОДИН раз и только для доставок, прошедших SSRF-проверку — секрет
-- отброшенных в память функции не попадает вовсе.

create or replace function public.get_webhook_secrets(p_endpoint_ids uuid[])
returns table (endpoint_id uuid, secret text)
language sql
security definer
set search_path = public, pg_temp
as $$
  select e.id, s.decrypted_secret
  from public.webhook_endpoints e
  join vault.decrypted_secrets s on s.id = e.secret_id
  where e.id = any(coalesce(p_endpoint_ids, '{}'::uuid[]));
$$;

comment on function public.get_webhook_secrets(uuid[]) is
  'Отдаёт HMAC-секреты endpoint''ов диспетчеру (088). ACL — только service_role: '
  'это единственный путь из public в схему vault, и расширять его нельзя. '
  'Выставлять саму схему vault в PostgREST запрещено — это открыло бы все секреты проекта.';

-- ── 11.3 Запись результата попытки ──
-- Один вызов закрывает доставку и двигает счётчики endpoint'а, включая
-- авто-отключение и уведомление владельцу. Порог — из organizations.settings
-- (ключ webhook_failure_threshold), дефолт 20; форвард-совместимо с
-- reconnect_days и stage_dwell_defaults из 076.

create or replace function public.record_webhook_result(
  p_delivery_id     uuid,
  p_status          text,
  p_response_status int         default null,
  p_response_body   text        default null,
  p_error           text        default null,
  p_next_retry_at   timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_endpoint  uuid;
  v_org       uuid;
  v_fails     int;
  v_threshold int;
  v_active    boolean;
  v_name      text;
  v_url       text;
begin
  if p_status not in ('pending','delivered','failed','dropped') then
    raise exception 'bad_delivery_status: %', p_status using errcode = '22023';
  end if;

  update public.webhook_deliveries
  set status          = p_status,
      response_status = p_response_status,
      -- Второй рубеж усечения: диспетчер режет тело сам, но журнал не должен
      -- зависеть от того, что его об этом попросили.
      response_body   = left(p_response_body, 8192),
      error           = p_error,
      next_retry_at   = case when p_status = 'pending' then p_next_retry_at else null end,
      delivered_at    = case when p_status = 'delivered' then now() else delivered_at end
  where id = p_delivery_id
  returning endpoint_id, org_id into v_endpoint, v_org;

  if not found then
    raise exception 'delivery_not_found' using errcode = '42704';
  end if;

  if p_status = 'delivered' then
    update public.webhook_endpoints
    set consecutive_failures = 0,
        last_delivery_at     = now(),
        last_status_code     = p_response_status
    where id = v_endpoint;
    return;
  end if;

  -- Неуспех — считая ретраи: каждая неудачная попытка двигает счётчик (§5).
  update public.webhook_endpoints
  set consecutive_failures = consecutive_failures + 1,
      last_delivery_at     = now(),
      last_status_code     = p_response_status
  where id = v_endpoint
  returning consecutive_failures, is_active, name, url
      into v_fails, v_active, v_name, v_url;

  select coalesce((settings ->> 'webhook_failure_threshold')::int, 20)
    into v_threshold
  from public.organizations where id = v_org;

  if v_active and v_fails >= coalesce(v_threshold, 20) then
    update public.webhook_endpoints
    set is_active       = false,
        disabled_reason = format('Отключён автоматически: %s провалов подряд', v_fails)
    where id = v_endpoint;

    -- Владельцу org. Тип 'webhook_disabled' добавлен в CHECK в п. 12 этой же миграции.
    insert into public.notifications (org_id, recipient_id, actor_id, type, entity_type, entity_id, payload)
    select v_org, m.profile_id, null, 'webhook_disabled', 'webhook_endpoint', v_endpoint,
           jsonb_build_object('name', v_name, 'url', v_url, 'failures', v_fails)
    from public.memberships m
    where m.org_id = v_org and m.role = 'owner';
  end if;
end $$;

comment on function public.record_webhook_result(uuid, text, int, text, text, timestamptz) is
  'Закрывает попытку доставки и двигает счётчики endpoint''а (088), только service_role. '
  'Успех обнуляет consecutive_failures; неуспех (включая назначенный ретрай) увеличивает, '
  'и по достижении organizations.settings.webhook_failure_threshold (дефолт 20) отключает '
  'endpoint и шлёт владельцу уведомление webhook_disabled.';

------------------------------------------------------------------------
-- 12. ACL функций
------------------------------------------------------------------------
-- Адресно: анониму — ничего, аутентифицированному — вызов (гейт роли в теле).
-- Массово снимать EXECUTE у DEFINER-функций нельзя (20 WARN в advisors — это RPC
-- проекта, разбираются поштучно).

revoke all on function public.create_webhook_endpoint(text, text, text) from public, anon;
revoke all on function public.rotate_webhook_secret(uuid)               from public, anon;
revoke all on function public.delete_webhook_endpoint(uuid)             from public, anon;
revoke all on function public.send_test_webhook(uuid)                   from public, anon;

grant execute on function public.create_webhook_endpoint(text, text, text) to authenticated;
grant execute on function public.rotate_webhook_secret(uuid)               to authenticated;
grant execute on function public.delete_webhook_endpoint(uuid)             to authenticated;
grant execute on function public.send_test_webhook(uuid)                   to authenticated;

-- ⚠️ Три функции диспетчера — service_role И ТОЛЬКО ОН. `authenticated` здесь не
--    появляется ни при каких условиях: get_webhook_secrets отдаёт секреты подписи,
--    claim_webhook_deliveries двигает чужую очередь, record_webhook_result пишет
--    журнал. Образец ACL — run_dwell_automations (079:421-422).
--    Это не тот случай, что check_stage_requirements (её зовёт UI, и EXECUTE у
--    authenticated там осмыслен) — не «доводить до единообразия».
revoke all on function public.claim_webhook_deliveries(int)   from public, anon, authenticated;
revoke all on function public.get_webhook_secrets(uuid[])     from public, anon, authenticated;
revoke all on function public.record_webhook_result(uuid, text, int, text, text, timestamptz)
  from public, anon, authenticated;

grant execute on function public.claim_webhook_deliveries(int) to service_role;
grant execute on function public.get_webhook_secrets(uuid[])   to service_role;
grant execute on function public.record_webhook_result(uuid, text, int, text, text, timestamptz)
  to service_role;

------------------------------------------------------------------------
-- 13. notifications.type — шестое значение
------------------------------------------------------------------------
-- Синхронно с `NotificationType` в src/types/database.ts. Точка расхождения
-- SQL↔TS, поэтому правится одним коммитом (§6.1 арх-дока).
-- Значения 1–5 — дословно из 079:30-31, не «переписать по памяти».

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('task_assigned','project_assigned','deal_won','automation','spawn_suggest',
                  'webhook_disabled'));

------------------------------------------------------------------------
-- 14. Комментарии таблиц
------------------------------------------------------------------------

comment on table public.webhook_endpoints is
  'Получатели исходящих вебхуков (B2, 088). Секрета в таблице НЕТ — только secret_id, '
  'ссылка в vault.secrets; подписать запрос содержимым строки невозможно. Запись — '
  'только через RPC create/rotate/delete_webhook_endpoint (INSERT/UPDATE/DELETE у '
  'authenticated отозваны). consecutive_failures >= порога (organizations.settings.'
  'webhook_failure_threshold, дефолт 20) → is_active=false + уведомление webhook_disabled.';

comment on table public.webhook_deliveries is
  'Очередь и журнал доставок вебхуков (B2, 088). id — он же X-Torii-Delivery и ключ '
  'идемпотентности на приёмнике. payload хранится целиком, иначе невозможно «Повторить». '
  'SELECT только owner/admin: внутри бюджеты и имена контактов. Пишет только SECURITY '
  'DEFINER (RPC и edge под service_role). Soft delete намеренно НЕТ — технический '
  'журнал, тот же класс, что notifications и automation_runs; ретеншн 30 дней — спринт 3.';
