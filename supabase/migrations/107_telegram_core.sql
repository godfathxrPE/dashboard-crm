-- ═══════════════════════════════════════════════════════
-- 107 — Telegram, фундамент (S-TG-1): привязка аккаунта + очередь исходящих.
--
-- КЛЮЧЕВОЕ РЕШЕНИЕ: Telegram — ТРАНСПОРТ ДЛЯ `notifications`, а не источник событий.
-- Триггер `AFTER INSERT ON notifications` кладёт строку в outbox, если у получателя
-- есть привязка. Поэтому все шесть существующих типов (task_assigned,
-- project_assigned, deal_won, automation, spawn_suggest, webhook_disabled) поедут в
-- мессенджер БЕЗ ЕДИНОЙ ПРАВКИ в местах, которые их порождают (baseline notify_*,
-- 045, 050, 051, 079, 088, 090), и каждый будущий тип — тоже.
--
-- Альтернатива «дёргать Telegram из каждого триггера» отвергнута: она размазала бы
-- знание о мессенджере по всей схеме, а `notifications` ровно для этого и заведена.
--
-- ⚠️ НЕ ПРИМЕНЯТЬ ДО ДЕПЛОЯ edge-функций. Порядок гейта:
--      1) apply 107 (cron `tg-send` уже заведён, но тик молчит: Vault-секретов нет)
--      2) deploy edge `telegram-send` и `telegram-webhook`
--      3) Vault: telegram_send_key / telegram_send_url
--      4) setWebhook у Telegram
--    Пункт 1 безопасен раньше 2: при отсутствии секретов тик выходит молча (см. п. 7),
--    очередь не теряется — строки остаются `pending`.
--
-- ⚠️ ДВА СЕКРЕТА VAULT ЗАВОДЯТ РУКАМИ, НЕ МИГРАЦИЯ И НЕ CC (форма 089):
--
--      select vault.create_secret('<длинный случайный ключ>', 'telegram_send_key',
--             'Shared secret диспетчера Telegram');
--      select vault.create_secret('https://uoiavcabxgdjugzryrmj.supabase.co/functions/v1/telegram-send',
--             'telegram_send_url', 'URL edge-функции telegram-send');
--
--    То же значение ключа — в Supabase Function Secrets как TELEGRAM_SEND_KEY.
--    Токен бота (TELEGRAM_BOT_TOKEN) и секрет вебхука (TELEGRAM_WEBHOOK_SECRET) в БД
--    НЕ ПОПАДАЮТ ВООБЩЕ: они живут только в Function Secrets и читаются внутри edge.
--    `cron.job.command` хранится и читается открытым текстом — поэтому и ключ
--    диспетчера идёт через Vault, а не литералом в джобе.
--
-- ⚠️ ОБРАТИМОСТЬ (откатывать в этом порядке):
--      select cron.unschedule('tg-send');
--      drop trigger if exists trg_zz_telegram_outbox on public.notifications;
--      drop function if exists public.telegram_send_tick();
--      drop function if exists public.enqueue_telegram_notification();
--      drop function if exists public.link_telegram_account(text, bigint, bigint, text);
--      drop function if exists public.create_telegram_link_token();
--      drop function if exists public.telegram_notification_text(text, text, uuid, jsonb, text);
--      drop function if exists public.telegram_escape_html(text);
--      drop table if exists public.telegram_outbox cascade;
--      drop table if exists public.telegram_updates cascade;
--      drop table if exists public.telegram_link_tokens cascade;
--      drop table if exists public.telegram_accounts cascade;
-- ═══════════════════════════════════════════════════════

------------------------------------------------------------------------
-- 1. telegram_accounts — привязка профиля к чату
------------------------------------------------------------------------
-- `created_by` НЕ заводится, и это не пропуск конвенции: строку создаёт edge под
-- service_role, где `auth.uid()` пуст, а «кто владелец» и так записан в profile_id.
-- Колонка с вечным NULL хуже её отсутствия.
create table if not exists public.telegram_accounts (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid   not null references public.organizations(id) on delete cascade,
  profile_id        uuid   not null references public.profiles(id)      on delete cascade,
  -- bigint, НЕ int: Telegram ID давно вышли за 2^31 (у новых аккаунтов ~7·10^9).
  telegram_user_id  bigint not null,
  telegram_chat_id  bigint not null,
  -- Отображение в UI. Меняется на стороне Telegram и может быть пустым (username
  -- необязателен) — искать по нему нельзя, только показывать.
  username          text,
  linked_at         timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- Оба UNIQUE обязательны и означают разное:
  --   profile   — у одного человека один мессенджер (иначе дубли уведомлений);
  --   telegram  — один Telegram не может слушать за двоих (иначе чужие уведомления).
  constraint telegram_accounts_profile_uniq  unique (profile_id),
  constraint telegram_accounts_tg_user_uniq  unique (telegram_user_id)
);

create index if not exists idx_telegram_accounts_org on public.telegram_accounts(org_id);

drop trigger if exists trg_aa_freeze_org_id on public.telegram_accounts;
create trigger trg_aa_freeze_org_id
  before update of org_id on public.telegram_accounts
  for each row
  when (old.org_id is distinct from new.org_id)
  execute function public.freeze_org_id();

drop trigger if exists trg_set_updated_at on public.telegram_accounts;
create trigger trg_set_updated_at
  before update on public.telegram_accounts
  for each row execute function public.update_updated_at();

-- `set_org_id()` НЕ вешаем: org_id приходит явно из DEFINER-функции
-- link_telegram_account (как в segments / stage_requirements / invitations).
-- В DEFINER-контексте под service_role `current_org_id()` вернул бы NULL.

-- ═══ RLS ═══
-- Привязка ЛИЧНАЯ, не командная. owner/admin чужих привязок НЕ ВИДЯТ — это адрес в
-- стороннем мессенджере, персональные данные сотрудника, а не рабочая запись вроде
-- задачи или сделки. Админу для его работы этот идентификатор не нужен ни разу:
-- «отключить сотруднику Telegram» решается увольнением из org (cascade по profiles
-- сюда не идёт, но и уведомления без membership не порождаются).
--
-- INSERT/UPDATE политик нет вовсе — единственный путь создания это RPC
-- link_telegram_account под service_role. Пустая политика на INSERT надёжнее любой
-- проверки: подделать telegram_user_id из браузера физически нечем.
--
-- org_id первым конъюнктом — конвенция проекта; current_org_id() в initplan-обёртке.
-- ⚠️ Побочный эффект org-first: если человек состоит в двух org и переключился,
--    своя строка ему не видна и UI покажет «не привязан». Это самолечится — повторный
--    /start пересоздаёт строку с актуальным org_id (link_telegram_account делает
--    delete+insert, а не update: trg_aa_freeze_org_id запретил бы смену org_id).
alter table public.telegram_accounts enable row level security;

create policy telegram_accounts_select on public.telegram_accounts for select to authenticated
  using (
    org_id = ( select public.current_org_id() )
    and profile_id = ( select auth.uid() )
  );

create policy telegram_accounts_delete on public.telegram_accounts for delete to authenticated
  using (
    org_id = ( select public.current_org_id() )
    and profile_id = ( select auth.uid() )
  );

-- `revoke truncate, references, trigger` не пишем — 082 сузил дефолтные привилегии в
-- корне, новая таблица приходит с authenticated = arwd. `revoke ... from anon`
-- остаётся: default ACL роли supabase_admin всё ещё раздаёт anon полный набор.
revoke all on public.telegram_accounts from anon;
revoke insert, update on public.telegram_accounts from authenticated;
grant select, delete on public.telegram_accounts to authenticated;  -- поверх RLS

-- ═══ Realtime ═══
-- Нужен ровно для одного сценария: человек нажал «Подключить», ушёл в Telegram,
-- сказал боту /start и вернулся во вкладку. Без публикации карточка так и висит
-- «не привязан», пока он не нажмёт F5. Realtime уважает RLS — чужую строку
-- подписчик не увидит, а своя ему и так видна.
-- Guard как в 068: голый `alter publication … add table` падает на повторном apply.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'telegram_accounts'
  ) then
    alter publication supabase_realtime add table public.telegram_accounts;
  end if;
end $$;

comment on table public.telegram_accounts is
  'Привязка профиля CRM к чату Telegram (107, S-TG-1). Личные данные: SELECT/DELETE только '
  'своей строки, owner/admin чужих не видят. INSERT/UPDATE из браузера закрыты полностью — '
  'единственный путь создания это RPC link_telegram_account под service_role.';

------------------------------------------------------------------------
-- 2. telegram_link_tokens — одноразовые токены привязки
------------------------------------------------------------------------
-- ЗАЧЕМ ТОКЕН, А НЕ «НАПИШИ БОТУ СВОЙ EMAIL». Второе — спуфинг чужого профиля одним
-- сообщением: бот не может проверить, что писавший владеет этим адресом. Токен
-- выдаётся уже аутентифицированной сессии в CRM и живёт 15 минут.
--
-- `text` PK, а не uuid: uuid v4 предсказуем по формату и его пишут «на глаз» в чат.
-- 24 случайных байта из pgcrypto — 192 бита, перебор бессмыслен.
create table if not exists public.telegram_link_tokens (
  token       text primary key,
  profile_id  uuid not null references public.profiles(id)      on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_telegram_link_tokens_profile
  on public.telegram_link_tokens(profile_id) where used_at is null;

drop trigger if exists trg_aa_freeze_org_id on public.telegram_link_tokens;
create trigger trg_aa_freeze_org_id
  before update of org_id on public.telegram_link_tokens
  for each row
  when (old.org_id is distinct from new.org_id)
  execute function public.freeze_org_id();

drop trigger if exists trg_set_updated_at on public.telegram_link_tokens;
create trigger trg_set_updated_at
  before update on public.telegram_link_tokens
  for each row execute function public.update_updated_at();

-- ═══ RLS ═══
-- RLS включена, политик НОЛЬ — и это полное закрытие, а не забытая строка: клиенту
-- таблица не нужна ни на чтение (свой токен он получает возвратом RPC), ни на запись.
-- Чтение чужой строки = угон привязки, поэтому даже «свои» политики не заводим.
alter table public.telegram_link_tokens enable row level security;

revoke all on public.telegram_link_tokens from anon, authenticated;

comment on table public.telegram_link_tokens is
  'Одноразовые токены привязки Telegram (107, S-TG-1): 24 случайных байта, TTL 15 минут. '
  'Клиенту недоступна ВООБЩЕ (revoke all + RLS без политик): токен отдаёт возвратом '
  'create_telegram_link_token(), проверяет link_telegram_account() под service_role.';

------------------------------------------------------------------------
-- 3. telegram_outbox — очередь исходящих
------------------------------------------------------------------------
-- ОЧЕРЕДЬ, А НЕ FIRE-AND-FORGET: Telegram отвечает 429 с `retry_after` при
-- превышении лимита и 403, когда пользователь заблокировал бота. И то, и другое
-- надо пережить, не потеряв сообщение и не долбясь вечно в заблокированный чат.
create table if not exists public.telegram_outbox (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid   not null references public.organizations(id)  on delete cascade,
  -- nullable: очередь переживает свой источник, а в S-TG-2 появятся сообщения
  -- вообще без уведомления-родителя (напоминания).
  notification_id  uuid   references public.notifications(id) on delete cascade,
  chat_id          bigint not null,
  -- УЖЕ ГОТОВЫЙ текст, собранный на момент постановки в очередь. Пересобирать его
  -- при отправке нельзя: сделку могли переименовать, и человек получил бы сообщение
  -- про событие, которого в тот момент не было.
  text             text   not null,
  status           text   not null default 'pending',
  attempts         int    not null default 0,
  next_retry_at    timestamptz default now(),
  last_error       text,
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint telegram_outbox_status_chk check (status in ('pending', 'sent', 'error'))
);

-- Точная копия приёма из 088 (idx_webhook_deliveries_queue): partial-индекс, на
-- котором стоит дешёвый выход минутного тика.
create index if not exists idx_telegram_outbox_queue
  on public.telegram_outbox(next_retry_at) where status = 'pending';
create index if not exists idx_telegram_outbox_org on public.telegram_outbox(org_id);

drop trigger if exists trg_aa_freeze_org_id on public.telegram_outbox;
create trigger trg_aa_freeze_org_id
  before update of org_id on public.telegram_outbox
  for each row
  when (old.org_id is distinct from new.org_id)
  execute function public.freeze_org_id();

drop trigger if exists trg_set_updated_at on public.telegram_outbox;
create trigger trg_set_updated_at
  before update on public.telegram_outbox
  for each row execute function public.update_updated_at();

-- ═══ RLS ═══
-- Политик ноль намеренно (см. telegram_link_tokens). Пишет триггер, читает и
-- закрывает edge под service_role. Заводить политики «на всякий случай» здесь
-- значит открыть текст чужих уведомлений — в нём бюджеты и имена контактов.
alter table public.telegram_outbox enable row level security;

revoke all on public.telegram_outbox from anon, authenticated;

comment on table public.telegram_outbox is
  'Очередь исходящих сообщений Telegram (107, S-TG-1). Пишет trg_zz_telegram_outbox, '
  'дренит edge telegram-send под service_role. Клиенту недоступна вообще: в тексте '
  'лежит содержимое уведомлений. Текст фиксируется при постановке, не пересобирается.';

------------------------------------------------------------------------
-- 4. telegram_updates — идемпотентность входящих
------------------------------------------------------------------------
-- Telegram ретраит доставку апдейта, если наш ответ не пришёл за таймаут, а
-- обработка `/start` не идемпотентна сама по себе. `insert ... on conflict do
-- nothing` → 0 строк означает «это повтор, выходим».
--
-- `org_id` ЗДЕСЬ НЕТ И НЕ ДОЛЖНО БЫТЬ: бот один на всю инсталляцию, а апдейт
-- приходит раньше, чем известно, чей он вообще (у `/start` без валидного токена
-- org не появится никогда). Это журнал транспорта, не тенантные данные —
-- поэтому и конвенция org-таблицы к нему не применяется.
create table if not exists public.telegram_updates (
  update_id    bigint primary key,
  received_at  timestamptz not null default now()
);

create index if not exists idx_telegram_updates_received
  on public.telegram_updates(received_at);

alter table public.telegram_updates enable row level security;

revoke all on public.telegram_updates from anon, authenticated;

comment on table public.telegram_updates is
  'Журнал update_id для идемпотентности входящих Telegram (107, S-TG-1). Без org_id '
  'намеренно: бот один на инсталляцию, апдейт приходит до определения тенанта. '
  'ДОЛГ S-TG-2: ретеншн — таблица растёт монотонно (строка ~24 байта на сообщение).';

------------------------------------------------------------------------
-- 5. Сборка текста сообщения
------------------------------------------------------------------------
-- Обе функции ЧИСТЫЕ (не читают таблиц) → SECURITY INVOKER, а не DEFINER: повышать
-- права нечему. ACL сужен явно — их зовёт только DEFINER-триггер, который исполняется
-- от владельца и в грантах не нуждается.

create or replace function public.telegram_escape_html(p_text text)
returns text
language sql
immutable
strict
set search_path = public, pg_temp
as $$
  -- Порядок обязателен: `&` первым, иначе он съест собственные подстановки
  -- («&lt;» превратится в «&amp;lt;»). Три символа — ровно то, что требует
  -- parse_mode: 'HTML' у Telegram; кавычки в тексте (не в атрибуте) экранировать
  -- не нужно. Имя компании вида «ООО "Ромашка & Ко"» без этого роняет sendMessage.
  select replace(replace(replace(p_text, '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
$$;

comment on function public.telegram_escape_html(text) is
  'Экранирование под parse_mode HTML у Telegram (107): & < >, амперсанд первым.';

revoke all on function public.telegram_escape_html(text) from public, anon, authenticated;

-- ⚠️ ТОЧКА СИНХРОНИЗАЦИИ SQL ↔ TS. Ровно та же логика продублирована в
--    `src/lib/domain/telegram-message.ts` — там она покрыта юнит-тестами
--    (`tests/unit/telegram-message.test.ts`), которых в SQL взять негде. Зеркало
--    правится ТЕМ ЖЕ коммитом, что эта функция; тот же приём, что у зеркал промптов
--    edge-функций (S-R3-VOICE-1) и у WEBHOOK_EVENT_BY_TRIGGER (090).
--
-- Заголовки и тело — зеркало TYPE_LABEL/payloadTitle, путь — зеркало entityRoute
-- из `src/components/layout/NotificationBell.tsx`: человек, читающий уведомление в
-- Telegram и в колокольчике, должен видеть одно и то же, иначе это два разных
-- продукта с общей таблицей.
create or replace function public.telegram_notification_text(
  p_type        text,
  p_entity_type text,
  p_entity_id   uuid,
  p_payload     jsonb,
  p_app_url     text
)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_title text := public.telegram_escape_html(nullif(btrim(coalesce(p_payload->>'title', '')), ''));
  v_text  text := public.telegram_escape_html(nullif(btrim(coalesce(p_payload->>'text',  '')), ''));
  v_head  text;
  v_body  text;
  v_path  text;
  v_link  text;
begin
  -- Заголовок — литерал из закрытого набора, экранировать нечего.
  v_head := case p_type
    when 'task_assigned'    then 'Назначена задача'
    when 'project_assigned' then 'Назначена сделка'
    when 'deal_won'         then 'Сделка выиграна'
    when 'automation'       then 'Автоматизация'
    when 'spawn_suggest'    then 'Пора создать внедрение'
    when 'webhook_disabled' then 'Вебхук отключён'
    else 'Уведомление'
  end;

  v_body := case
    when p_type = 'deal_won' then
      coalesce('Сделка «' || v_title || '» выиграна — создайте внедрение',
               'Сделка выиграна — создайте внедрение')
    when p_type = 'automation' then
      coalesce(v_text, v_title, v_head)
    when p_type = 'spawn_suggest' then
      coalesce(v_text, 'Сделка «' || v_title || '» — пора создать внедрение', v_head)
    else
      coalesce(v_title, v_head)
  end;

  v_path := case
    -- task_overdue-автоматизация несёт entity_type='tasks' → доска задач (иначе
    -- ушла бы в /deals/{task_id} = 404). Проверять ДО общей automation-ветки.
    when p_type = 'automation' and p_entity_type = 'tasks' then '/tasks'
    when p_type = 'spawn_suggest'    then '/deals/' || p_entity_id::text || '?spawn=1'
    -- у endpoint'а нет своего роута: ведём в Настройки, где секция «Вебхуки».
    when p_type = 'webhook_disabled' then '/settings'
    when p_type in ('project_assigned', 'deal_won', 'automation')
                                     then '/deals/' || p_entity_id::text
    else '/tasks'
  end;

  -- Ссылка добавляется, ТОЛЬКО если базовый URL похож на базовый URL. Регэксп
  -- намеренно уже, чем «валидный URL»: он не пропускает `&`, `<`, `>` и пробел, и
  -- поэтому собранная ссылка не может сломать parse_mode HTML и не требует
  -- отдельного экранирования. Не совпало — сообщение уходит без ссылки: лучше без
  -- неё, чем ссылка в никуда.
  if p_app_url ~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[A-Za-z0-9._~/-]*)?$' then
    v_link := rtrim(p_app_url, '/') || v_path;
  end if;

  return '<b>' || v_head || '</b>' || E'\n' || v_body
         || coalesce(E'\n' || v_link, '');
end $$;

comment on function public.telegram_notification_text(text, text, uuid, jsonb, text) is
  'Текст уведомления для Telegram (107, S-TG-1): заголовок, суть, ссылка. Зеркало '
  'TYPE_LABEL/payloadTitle/entityRoute из NotificationBell.tsx и '
  'src/lib/domain/telegram-message.ts (там же юнит-тесты). Пустой/непохожий app_url '
  '⇒ сообщение без ссылки.';

revoke all on function public.telegram_notification_text(text, text, uuid, jsonb, text)
  from public, anon, authenticated;

------------------------------------------------------------------------
-- 6. RPC: выдача токена и привязка
------------------------------------------------------------------------

create or replace function public.create_telegram_link_token()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_org   uuid;
  v_token text;
begin
  -- NULL-safe гард: без него DEFINER выдал бы токен «профилю NULL» из анонимной
  -- сессии, и первый же /start привязал бы бота к несуществующему человеку.
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  v_org := public.current_org_id();
  if v_org is null then
    raise exception 'no active organization' using errcode = '42501';
  end if;

  -- Прежние невыданные токены гасим: иначе ссылка из вкладки, открытой вчера,
  -- останется рабочей ещё 15 минут после того, как человек запросил новую.
  update public.telegram_link_tokens
     set used_at = now()
   where profile_id = v_uid and used_at is null;

  -- pgcrypto живёт в схеме `extensions` (088a), а search_path у DEFINER-функции —
  -- `public, pg_temp`: схему выписываем явно, иначе 42883.
  v_token := encode(extensions.gen_random_bytes(24), 'hex');

  insert into public.telegram_link_tokens (token, profile_id, org_id, expires_at)
  values (v_token, v_uid, v_org, now() + interval '15 minutes');

  return v_token;
end $$;

comment on function public.create_telegram_link_token() is
  'Одноразовый токен привязки Telegram для текущего auth.uid() (107, S-TG-1), TTL 15 мин. '
  'Гасит прежние неиспользованные токены профиля. DEFINER: таблица токенов закрыта для '
  'authenticated полностью.';

revoke all on function public.create_telegram_link_token() from public, anon;
grant execute on function public.create_telegram_link_token() to authenticated;

-- ── Привязка ──────────────────────────────────────────────────────────
-- ⚠️ ПОЧЕМУ RPC, А НЕ ПРЯМАЯ ЗАПИСЬ ИЗ EDGE (как в outbox). Здесь три шага —
--    проверить токен, создать привязку, погасить токен — и они обязаны быть одной
--    транзакцией: два одновременных /start с одним токеном иначе дадут две привязки.
--    `for update` на строке токена сериализует их. Плюс сама проверка токена
--    остаётся в БД, где таблица токенов закрыта для всех, кроме DEFINER'а.
create or replace function public.link_telegram_account(
  p_token            text,
  p_telegram_user_id bigint,
  p_chat_id          bigint,
  p_username         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tok public.telegram_link_tokens%rowtype;
begin
  if p_token is null or p_telegram_user_id is null or p_chat_id is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_request');
  end if;

  select * into v_tok
  from public.telegram_link_tokens
  where token = p_token
  for update;

  -- Три причины отказа сведены в одну наружу намеренно: «истёк» и «уже использован»
  -- различает только владелец токена, а бот отвечает в чат, который ещё не привязан.
  if not found or v_tok.used_at is not null or v_tok.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'invalid_token');
  end if;

  -- delete+insert, а не upsert: смена org_id у существующей строки упёрлась бы в
  -- trg_aa_freeze_org_id. Заодно снимает привязку этого же Telegram к другому
  -- профилю (второй UNIQUE) — «один Telegram слушает за одного».
  -- Hard delete — норма проекта, soft-delete тут родил бы невидимые строки,
  -- ломающие оба UNIQUE.
  delete from public.telegram_accounts
   where profile_id = v_tok.profile_id
      or telegram_user_id = p_telegram_user_id;

  insert into public.telegram_accounts
    (org_id, profile_id, telegram_user_id, telegram_chat_id, username, linked_at)
  values
    (v_tok.org_id, v_tok.profile_id, p_telegram_user_id, p_chat_id,
     nullif(btrim(coalesce(p_username, '')), ''), now());

  update public.telegram_link_tokens
     set used_at = now()
   where token = v_tok.token;

  return jsonb_build_object('ok', true);
end $$;

comment on function public.link_telegram_account(text, bigint, bigint, text) is
  'Привязка Telegram по одноразовому токену (107, S-TG-1), только service_role. Проверка '
  'токена, создание привязки и его гашение — одна транзакция с `for update` на токене: '
  'два одновременных /start иначе дали бы две привязки. Наружу отдаёт {ok, reason} — '
  'причины отказа сведены к invalid_token намеренно.';

revoke all on function public.link_telegram_account(text, bigint, bigint, text)
  from public, anon, authenticated;
grant execute on function public.link_telegram_account(text, bigint, bigint, text) to service_role;

-- ── Захват батча очереди ──────────────────────────────────────────────
-- ⚠️ ЗАЧЕМ ЭТО ЕСТЬ, ЕСЛИ EDGE И ТАК ХОДИТ В ТАБЛИЦУ НАПРЯМУЮ. Джоба минутная, а
--    отправка 25 сообщений при медленном Telegram упирается в таймаут 10 с каждое —
--    то есть тик вполне может не уложиться в минуту, и следующий заберёт ТЕ ЖЕ
--    строки. В вебхуках это стоило бы дубля у получателя, здесь — дубля в личном
--    чате живого человека, что заметно куда сильнее. `for update skip locked`
--    исключает пересечение; точная форма claim_webhook_deliveries (088).
--
--    Лизинг 2 минуты вместо `next_retry_at = null`: умерший isolate иначе оставил бы
--    строку захваченной навсегда. Через 2 минуты она сама вернётся в очередь.
--    Счётчик попыток растёт ЗДЕСЬ, а не в edge — захват и есть попытка.
create or replace function public.claim_telegram_outbox(p_limit int default 25)
-- ⚠️ Выходная колонка называется `message_text`, а не `text`: имя колонки в
--    RETURNS TABLE становится переменной plpgsql и затенило бы ИМЯ ТИПА `text`
--    внутри тела. Сейчас тело обходится без приведений, но правка, которой
--    понадобится `::text`, упала бы с невнятной ошибкой.
returns table (
  id           uuid,
  chat_id      bigint,
  message_text text,
  attempts     int
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lease interval := interval '2 minutes';
begin
  return query
  with picked as (
    select o.id
    from public.telegram_outbox o
    where o.status = 'pending'
      and o.next_retry_at is not null
      and o.next_retry_at <= now()
    order by o.next_retry_at
    limit greatest(coalesce(p_limit, 25), 1)
    for update skip locked
  )
  update public.telegram_outbox o
     set attempts      = o.attempts + 1,
         next_retry_at = now() + v_lease
    from picked p
   where o.id = p.id
  returning o.id, o.chat_id, o.text, o.attempts;   -- o.text → колонка message_text
end $$;

comment on function public.claim_telegram_outbox(int) is
  'Атомарный захват батча очереди Telegram (107), только service_role. '
  '`for update skip locked` исключает двойную отправку при пересечении минутных тиков; '
  'захваченная строка получает лизинг 2 мин вместо next_retry_at = null, иначе умерший '
  'isolate оставил бы её захваченной навсегда. Счётчик попыток растёт здесь: захват и '
  'есть попытка.';

revoke all on function public.claim_telegram_outbox(int) from public, anon, authenticated;
grant execute on function public.claim_telegram_outbox(int) to service_role;

------------------------------------------------------------------------
-- 7. Триггер: notifications → outbox
------------------------------------------------------------------------
create or replace function public.enqueue_telegram_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_chat_id bigint;
  v_app_url text;
begin
  -- Ищем по profile_id, БЕЗ сверки org: привязка глобально уникальна по профилю, а
  -- уведомление всегда адресовано человеку, а не его роли в конкретной org.
  select ta.telegram_chat_id
    into v_chat_id
  from public.telegram_accounts ta
  where ta.profile_id = new.recipient_id;

  -- Нет привязки — Telegram в этой инсталляции просто не существует. Самый частый
  -- путь: он обязан быть дешёвым (один индексный скан по UNIQUE) и молчаливым.
  if v_chat_id is null then
    return new;
  end if;

  select o.settings->>'app_url'
    into v_app_url
  from public.organizations o
  where o.id = new.org_id;

  insert into public.telegram_outbox (org_id, notification_id, chat_id, text)
  values (
    new.org_id,
    new.id,
    v_chat_id,
    public.telegram_notification_text(
      new.type, new.entity_type, new.entity_id,
      coalesce(new.payload, '{}'::jsonb),
      -- Фолбэк на боевой origin — тот же литерал, что APP_ORIGIN в
      -- src/lib/utils/entity-links.ts. per-org в organizations.settings, потому что
      -- Vault читать из обычного триггера не с руки, а адрес у org может отличаться.
      coalesce(v_app_url, 'https://dashboard-crm-ten.vercel.app')
    )
  );

  return new;
exception when others then
  -- ОБЯЗАТЕЛЕН. Это AFTER-исполнитель на чужой транзакции: сбой доставки в
  -- мессенджер не имеет права откатить назначение задачи или выигрыш сделки.
  -- Та же политика, что у notify_* (baseline), run_stage_automations (050) и
  -- run_dwell_automations (079).
  return new;
end $$;

comment on function public.enqueue_telegram_notification() is
  'AFTER INSERT ON notifications → строка в telegram_outbox, если у получателя есть '
  'привязка (107, S-TG-1). Текст собирает telegram_notification_text. Любая ошибка '
  'глотается (RETURN NEW): доставка в мессенджер не роняет породившую транзакцию.';

revoke all on function public.enqueue_telegram_notification() from public, anon, authenticated;

-- Префикс `zz_` — после всех прочих AFTER-триггеров на notifications (порядок
-- срабатывания алфавитный). Постановка в очередь мессенджера логически последняя.
drop trigger if exists trg_zz_telegram_outbox on public.notifications;
create trigger trg_zz_telegram_outbox
  after insert on public.notifications
  for each row execute function public.enqueue_telegram_notification();

------------------------------------------------------------------------
-- 8. telegram_send_tick() + cron
------------------------------------------------------------------------
-- Форма дословно повторяет dispatch_webhooks_tick() (089) — включая дешёвый выход,
-- Vault вместо литерала, fire-and-forget и глушитель исключений. Расхождение здесь
-- было бы отдельной сущностью без причины.
create or replace function public.telegram_send_tick()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text;
  v_url text;
begin
  -- Дешёвый выход: один индексный скан по idx_telegram_outbox_queue (partial по
  -- status='pending'). Джоба минутная — вторая такая в проекте, — и 1440 холостых
  -- HTTP-вызовов в сутки ей не нужны.
  if not exists (
    select 1 from public.telegram_outbox
    where status = 'pending' and next_retry_at is not null and next_retry_at <= now()
  ) then
    return;
  end if;

  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'telegram_send_key';
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'telegram_send_url';

  -- Окружение не настроено — молча выходим. Очередь не теряется: строки остаются
  -- pending и уедут первым же тиком после появления секретов. Ровно это делает
  -- безопасным apply 107 ДО деплоя edge-функции.
  if v_key is null or v_url is null then
    return;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'content-type',   'application/json',
                 'X-Dispatch-Key', v_key
               ),
    body    := '{}'::jsonb
  );
exception when others then
  return;
end $$;

comment on function public.telegram_send_tick() is
  'Будит edge-функцию telegram-send, если в очереди есть готовые сообщения (107). Ключ и '
  'URL — из Vault (telegram_send_key / telegram_send_url), а не из текста джобы: '
  'cron.job.command читается открытым текстом. Зовётся минутным cron''ом tg-send.';

revoke all on function public.telegram_send_tick() from public, anon, authenticated;
grant execute on function public.telegram_send_tick() to service_role;

-- ⚠️ ВТОРАЯ МИНУТНАЯ ДЖОБА В ПРОЕКТЕ (первая — webhook-retry, 089). Цена частоты
--    оплачена телом функции: при пустой очереди это один индексный скан и выход, без
--    обращения к Vault и без HTTP. Суточный шаг для мессенджера бессмыслен —
--    уведомление, приехавшее назавтра, это не уведомление.
do $$
begin
  perform cron.unschedule('tg-send');
exception when others then null;  -- job ещё нет — ок
end $$;

select cron.schedule('tg-send', '* * * * *', 'select public.telegram_send_tick();');
