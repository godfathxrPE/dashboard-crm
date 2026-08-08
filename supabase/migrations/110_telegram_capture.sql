-- ═══════════════════════════════════════════════════════
-- 110 — Telegram, третий шаг (S-TG-3): быстрый ввод компании и контакта из бота.
--
-- ⚠️ НОМЕР — 110, А НЕ 109, КАК В ПРОМПТЕ СПРИНТА. 109 (`telegram_priority`) уже
--    применена гейтом `20260808170347`; номер взят запросом к
--    `supabase_migrations.schema_migrations`, а не из папки и не из CLAUDE.md
--    (правило 4 — в папке номера теряются, в файле устаревают).
--
-- ЧТО ЭТО. Между «бот разобрал текст» и «человек нажал Создать» проходит время, а
-- `callback_data` ограничена 64 байтами — разобранные поля в неё не положить.
-- Отсюда короткоживущая таблица черновиков: id черновика и есть то, что уезжает в
-- кнопку.
--
-- ГРАНИЦА ОТВЕТСТВЕННОСТИ. Разбор (ai-capture), реквизиты (company-lookup) и дедуп
-- живут в edge и в TS — здесь только ХРАНЕНИЕ черновика и ПРИМЕНЕНИЕ его под
-- правами человека. Собственной логики разбора в SQL нет и не должно быть: это
-- второй клиент готового кода, а не вторая его реализация.
--
-- ⚠️ ЗАПИСЬ ИДЁТ ПОД ПРАВАМИ ЧЕЛОВЕКА, НЕ БОТА — тот же инвариант, что у
--    `tg_complete_task` (108). Функция работает под service_role, где
--    `auth.uid()` = NULL и RLS не защищает ничего, поэтому актор передаётся
--    параметром, а гарды (org, роль) функция делает сама.
--
-- ⚠️ НЕ ПРИМЕНЯТЬ ДО РЕДЕПЛОЯ `telegram-webhook`. Порядок гейта:
--      1) apply 110 (сама по себе безопасна: таблица пустая, RPC никто не зовёт —
--         старая функция свободный текст молча игнорирует и отвечает 200)
--      2) deploy edge `telegram-webhook`
--      3) ролевые смоки RPC + сквозной смок ботом
--    Обратный порядок дал бы «Не удалось, откройте в CRM» на каждое сообщение:
--    новая функция звала бы несуществующую RPC.
--
-- ОТКАТ (порядок обратный применению):
--      drop function if exists public.tg_apply_capture(uuid, uuid, text);
--      -- cleanup_telegram_transport вернуть в форму 108 (create or replace, тип
--      -- возврата integer не менялся — drop не нужен)
--      drop table if exists public.telegram_capture_drafts;
-- ═══════════════════════════════════════════════════════

------------------------------------------------------------------------
-- 1. Черновики разбора
------------------------------------------------------------------------
create table if not exists public.telegram_capture_drafts (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  -- Кто прислал текст; он же ЕДИНСТВЕННЫЙ, кто вправе подтвердить. Ссылка на
  -- profiles, не на auth.users — конвенция проекта.
  profile_id   uuid not null references public.profiles(id) on delete cascade,

  -- ⚠️ ТРИ ЗНАЧЕНИЯ, А НЕ ДВА. Промпт спринта описывал CHECK как `contact|company`
  --    и тут же требовал ветку `intent='unclear'` с кнопками «как контакт» /
  --    «как компанию». Одно противоречит другому: до нажатия ветка НЕ ВЫБРАНА, и
  --    записать её значением, которого человек не выбирал, — это и есть «гадать за
  --    него», запрещённое инвариантом фичи. Поэтому `unclear` хранится честно, а
  --    выбор приезжает третьим аргументом RPC.
  kind         text not null check (kind in ('contact', 'company', 'unclear')),

  -- Обе ветки разбора: {"contact": {...}|null, "company": {...}|null}. Обе, а не
  -- выбранная, — иначе на `unclear` вторая кнопка применяла бы пустоту.
  -- Реквизиты ЕГРЮЛ (если ИНН нашёлся) уже влиты в ветку company.
  payload      jsonb not null,

  -- Исходное сообщение. Нужно ровно для разбора инцидентов «бот понял не то»:
  -- без текста претензия неразрешима, а логи edge живут неделю.
  source_text  text not null,

  -- ⚠️ FK ЗДЕСЬ НЕТ И БЫТЬ НЕ МОЖЕТ: ссылка полиморфная — companies ИЛИ contacts,
  --    в зависимости от `duplicate_kind`. Тот же случай, что `transcripts.entity_id`.
  --    Цена — висячий id, если дубль удалят; он используется только для ссылки в
  --    сообщении, которая к тому моменту уже отправлена.
  duplicate_id   uuid,
  duplicate_kind text check (duplicate_kind in ('contact', 'company')),

  status       text not null default 'pending'
                 check (status in ('pending', 'applied', 'cancelled')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  applied_at   timestamptz,

  -- Ссылка на созданную запись: делает применённый черновик самодостаточным при
  -- разборе инцидента («что именно завели из этого текста»).
  created_entity_id uuid
);

create index if not exists idx_tg_capture_drafts_created
  on public.telegram_capture_drafts (created_at);

comment on table public.telegram_capture_drafts is
  'Черновики быстрого ввода из Telegram (110, S-TG-3): разбор ждёт подтверждения '
  'кнопкой. id черновика уезжает в callback_data — поля туда не влезают (лимит 64 '
  'байта). Живут сутки, чистит cleanup_telegram_transport. Для authenticated закрыты '
  'полностью: пишет и читает только edge под service_role.';

comment on column public.telegram_capture_drafts.kind is
  'contact | company | unclear. unclear — ветку человек ещё не выбрал; выбор приходит '
  'третьим аргументом tg_apply_capture, в черновике не переписывается.';

comment on column public.telegram_capture_drafts.duplicate_id is
  'Найденный при разборе дубль. Полиморфная ссылка (см. duplicate_kind) ⇒ FK нет.';

-- `update_updated_at` — имя именно такое, не `set_updated_at` (конвенция проекта);
-- тот же триггер стоит на всех трёх таблицах Telegram из 107.
drop trigger if exists trg_telegram_capture_drafts_updated on public.telegram_capture_drafts;
create trigger trg_telegram_capture_drafts_updated
  before update on public.telegram_capture_drafts
  for each row execute function public.update_updated_at();

-- ⚠️ ЗАМОРОЗКА org_id — РУКАМИ. Автоцикл 054 покрыл только таблицы, существовавшие
--    на момент 054; новые к нему не подключаются.
drop trigger if exists trg_aa_freeze_org_id on public.telegram_capture_drafts;
create trigger trg_aa_freeze_org_id
  before update of org_id on public.telegram_capture_drafts
  for each row
  when (old.org_id is distinct from new.org_id)
  execute function public.freeze_org_id();

-- ⚠️ RLS ВКЛЮЧЕНА, НО ПОЛИТИК НЕТ, И ЭТО ЗАКОНЧЕННОЕ СОСТОЯНИЕ, А НЕ НЕДОДЕЛКА.
--    Таблица — транспорт, как telegram_outbox и telegram_updates (107): клиенту
--    она не нужна ни на чтение, ни на запись, а service_role RLS не проверяет.
--    Политика «на всякий случай» открыла бы браузеру доступ к чужому сырому
--    тексту сообщений — ровно то, чего здесь быть не должно.
alter table public.telegram_capture_drafts enable row level security;

revoke all on public.telegram_capture_drafts from anon, authenticated;

------------------------------------------------------------------------
-- 2. Ретеншн: сутки
------------------------------------------------------------------------
-- ⚠️ ОТСТУПЛЕНИЕ ОТ ПРОМПТА: чистка дописана в `cleanup_telegram_transport()`
--    (джоба `tg-cleanup`, 20 6 * * *), а НЕ в `cleanup_webhook_deliveries()`
--    (`webhook-cleanup`, 15 6 * * *), как было предложено. Требование промпта —
--    «новую cron-джобу ради этого не заводить» — соблюдено, и новой джобы нет.
--    Но черновики Telegram чистит функция ретеншна Telegram, а не функция
--    ретеншна вебхуков: класть их туда значило бы, что отключение вебхуков
--    (или их откат) уносит с собой чистку чужой подсистемы.
--
-- ⚠️ СУТКИ, А НЕ 30 ДНЕЙ, как у остальных транспортных таблиц. Здесь лежит СЫРОЙ
--    ТЕКСТ СООБЩЕНИЙ ЧЕЛОВЕКА — подписи из писем, телефоны, всё, что он переслал
--    боту. Это не журнал доставки, и хранить его месяц «на всякий случай» нельзя.
--
-- ⚠️ ЧИСТЯТСЯ ВСЕ СТАТУСЫ, ВКЛЮЧАЯ pending. Отличие от `telegram_outbox`, где
--    pending не трогают ни при каком возрасте: там застрявшая строка — симптом
--    поломки транспорта, здесь «pending» через сутки значит только, что человек
--    не нажал кнопку. Это норма, а не инцидент.
create or replace function public.cleanup_telegram_transport()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
  v_total   integer := 0;
begin
  delete from public.telegram_outbox
  where status in ('sent', 'error')
    and created_at < now() - interval '30 days';
  get diagnostics v_deleted = row_count;
  v_total := v_total + v_deleted;

  delete from public.telegram_updates
  where received_at < now() - interval '30 days';
  get diagnostics v_deleted = row_count;
  v_total := v_total + v_deleted;

  -- 110: черновики быстрого ввода.
  delete from public.telegram_capture_drafts
  where created_at < now() - interval '1 day';
  get diagnostics v_deleted = row_count;
  v_total := v_total + v_deleted;

  return v_total;
end $$;

comment on function public.cleanup_telegram_transport() is
  'Ретеншн транспортных таблиц Telegram (108; черновики быстрого ввода — 110). '
  'outbox/updates — 30 дней, telegram_capture_drafts — СУТКИ (там сырой текст '
  'сообщений человека). Строки telegram_outbox в статусе pending не удаляются ни при '
  'каком возрасте: застрявшая очередь — симптом, а не мусор; для черновиков это '
  'правило НЕ действует — там pending значит «не нажал кнопку».';

revoke all on function public.cleanup_telegram_transport() from public, anon, authenticated;
grant execute on function public.cleanup_telegram_transport() to service_role;

-- Cron не пересоздаётся: джоба `tg-cleanup` заведена в 108 и зовёт эту же функцию
-- по имени. Новая ветка внутри тела подхватывается со следующим прогоном.

------------------------------------------------------------------------
-- 3. Применение черновика
------------------------------------------------------------------------
-- ⚠️ ВСЕ ГАРДЫ NULL-SAFE (`is null`, `is distinct from`): `if x = y` при NULL даёт
--    NULL, а не true — ветка молча не срабатывает, и проверка превращается в своё
--    отсутствие. Та же дисциплина, что в tg_complete_task (108).
--
-- ⚠️ ПОЛЯ ПЕРЕКЛАДЫВАЮТСЯ ПОИМЁННО, а не `jsonb_populate_record`. Черновик пишет
--    edge, то есть строка приходит из-за периметра БД; популятор дал бы ей право
--    задать ЛЮБУЮ колонку — включая `org_id`, `owner_id` и `created_by`, которые
--    здесь проставляет функция и только функция. Список полей — зеркало
--    `buildContactPrefill` / `buildCompanyPrefill` в QuickCapture.tsx.
--
-- ⚠️ ВОЗВРАТ — jsonb, А НЕ uuid, как предлагал промпт. Боту нужны в одном ответе
--    и исход (created / already_applied / not_found / kind_required), и id, и
--    подпись для сообщения. uuid + отдельный признак «уже применён» пришлось бы
--    кодировать NULL-ом, а NULL как код состояния — ровно тот приём, из-за
--    которого гарды выше пишутся null-safe.
create or replace function public.tg_apply_capture(
  p_actor_id uuid,
  p_draft_id uuid,
  -- Ветка, выбранная кнопкой на `unclear`. NULL ⇒ берётся из черновика.
  p_kind     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_draft  public.telegram_capture_drafts%rowtype;
  v_kind   text;
  v_role   text;
  v_data   jsonb;
  v_id     uuid;
  v_label  text;
  v_phones jsonb;
begin
  if p_actor_id is null or p_draft_id is null then
    raise exception 'tg_apply_capture: актор и черновик обязательны'
      using errcode = '22023';
  end if;

  if p_kind is not null and p_kind not in ('contact', 'company') then
    raise exception 'tg_apply_capture: недопустимая ветка %', p_kind
      using errcode = '22023';
  end if;

  -- ⚠️ `for update` — не украшение: две быстрые нажатия на одну кнопку идут
  --    двумя апдейтами Telegram и обрабатываются двумя isolate'ами. Без блокировки
  --    оба увидели бы status='pending' и создали бы ДВЕ записи из одного текста —
  --    то есть дедуп, ради которого всё затевалось, обошёл бы сам себя.
  select * into v_draft
  from public.telegram_capture_drafts
  where id = p_draft_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  -- Чужой черновик не подтверждают. Проверка ДО org-гарда: она строже и отвечает
  -- на более узкий вопрос.
  if v_draft.profile_id is distinct from p_actor_id then
    raise exception 'tg_apply_capture: черновик принадлежит другому пользователю'
      using errcode = '42501';
  end if;

  -- Org-гард + роль одним запросом. `memberships.profile_id`, НЕ `user_id` —
  -- такой колонки в таблице нет (42703 на первом же нажатии).
  select m.role into v_role
  from public.memberships m
  where m.profile_id = p_actor_id
    and m.org_id     = v_draft.org_id;

  if v_role is null then
    raise exception 'tg_apply_capture: актор вне организации черновика'
      using errcode = '42501';
  end if;

  -- ⚠️ Роль читается ЗАПРОСОМ, а не `current_org_role()`: хелпер ходит в
  --    `auth.uid()`, который в service-контексте NULL, и вернул бы NULL для
  --    кого угодно — то есть гард пропускал бы всех.
  if v_role = 'viewer' then
    raise exception 'tg_apply_capture: у роли viewer нет права создавать записи'
      using errcode = '42501';
  end if;

  if v_draft.status = 'applied' then
    return jsonb_build_object('status', 'already_applied');
  end if;
  if v_draft.status = 'cancelled' then
    return jsonb_build_object('status', 'cancelled');
  end if;

  v_kind := coalesce(p_kind, v_draft.kind);
  -- Ветка не выбрана — создавать нечего. Не «выберем сами»: инвариант фичи.
  if v_kind = 'unclear' then
    return jsonb_build_object('status', 'kind_required');
  end if;

  v_data := coalesce(v_draft.payload -> v_kind, '{}'::jsonb);

  if v_kind = 'contact' then
    -- `phones` NOT NULL DEFAULT '[]' — coalesce обязателен, ветка может прийти
    -- без ключа вовсе.
    v_phones := coalesce(v_data -> 'phones', '[]'::jsonb);

    insert into public.contacts (
      org_id, created_by, owner_id,
      first_name, last_name, position, email, phone, phones, notes
    )
    values (
      v_draft.org_id, p_actor_id, p_actor_id,
      -- first_name NOT NULL: пустая строка допустима, NULL — нет.
      coalesce(nullif(btrim(v_data ->> 'first_name'), ''), ''),
      nullif(btrim(v_data ->> 'last_name'), ''),
      nullif(btrim(v_data ->> 'position'), ''),
      nullif(btrim(v_data ->> 'email'), ''),
      nullif(btrim(v_data ->> 'phone'), ''),
      v_phones,
      nullif(btrim(v_data ->> 'notes'), '')
    )
    returning id, btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
    into v_id, v_label;

  else
    v_phones := coalesce(v_data -> 'phones', '[]'::jsonb);

    insert into public.companies (
      org_id, created_by, owner_id,
      name, inn, kpp, ogrn, legal_name, legal_address, inn_status, inn_verified_at,
      okved, industry, email, phone, phones, website, address, notes
    )
    values (
      v_draft.org_id, p_actor_id, p_actor_id,
      -- name NOT NULL. Пустое имя компании бессмысленно, но падать на вставке
      -- хуже, чем завести карточку с плейсхолдером, который человек тут же увидит.
      coalesce(nullif(btrim(v_data ->> 'name'), ''), 'Без названия'),
      nullif(btrim(v_data ->> 'inn'), ''),
      nullif(btrim(v_data ->> 'kpp'), ''),
      nullif(btrim(v_data ->> 'ogrn'), ''),
      nullif(btrim(v_data ->> 'legal_name'), ''),
      nullif(btrim(v_data ->> 'legal_address'), ''),
      nullif(btrim(v_data ->> 'inn_status'), ''),
      -- Сверка с ЕГРЮЛ произошла в момент разбора — штамп кладёт edge, здесь он
      -- только переносится. Мусор в поле даты уронил бы вставку, отсюда явный cast
      -- через nullif: пустая строка ≠ timestamptz.
      (nullif(btrim(v_data ->> 'inn_verified_at'), ''))::timestamptz,
      nullif(btrim(v_data ->> 'okved'), ''),
      nullif(btrim(v_data ->> 'industry'), ''),
      nullif(btrim(v_data ->> 'email'), ''),
      nullif(btrim(v_data ->> 'phone'), ''),
      v_phones,
      nullif(btrim(v_data ->> 'website'), ''),
      nullif(btrim(v_data ->> 'address'), ''),
      nullif(btrim(v_data ->> 'notes'), '')
    )
    returning id, name into v_id, v_label;
  end if;

  -- ⚠️ ПОРЯДОК: сначала вставка, потом отметка. Упадёт вставка — статус остаётся
  --    pending, и повторное нажатие сработает. Наоборот было бы «кнопка нажата,
  --    записи нет, повторить нельзя».
  update public.telegram_capture_drafts
     set status            = 'applied',
         applied_at        = now(),
         created_entity_id = v_id
   where id = p_draft_id;

  return jsonb_build_object(
    'status', 'created',
    'id',     v_id,
    'kind',   v_kind,
    'label',  v_label
  );
end $$;

comment on function public.tg_apply_capture(uuid, uuid, text) is
  'Применение черновика быстрого ввода из Telegram (110, S-TG-3): создаёт контакт или '
  'компанию под правами актора. Актор передаётся явно — в service-контексте '
  'auth.uid() = NULL. Возвращает jsonb со status: created | already_applied | '
  'cancelled | not_found | kind_required. Нарушение прав (чужой черновик, другая org, '
  'роль viewer) — исключение 42501, это не штатный путь. Поля перекладываются '
  'поимённо: payload приходит из-за периметра БД.';

revoke all on function public.tg_apply_capture(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.tg_apply_capture(uuid, uuid, text) to service_role;

------------------------------------------------------------------------
-- 4. Отмена черновика
------------------------------------------------------------------------
-- Отдельной RPC, а не UPDATE из edge: правило «чужой черновик не трогают» одно и
-- то же для обеих кнопок, и жить оно обязано в одном месте.
create or replace function public.tg_cancel_capture(p_actor_id uuid, p_draft_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_draft public.telegram_capture_drafts%rowtype;
begin
  if p_actor_id is null or p_draft_id is null then
    raise exception 'tg_cancel_capture: актор и черновик обязательны'
      using errcode = '22023';
  end if;

  select * into v_draft
  from public.telegram_capture_drafts
  where id = p_draft_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_draft.profile_id is distinct from p_actor_id then
    raise exception 'tg_cancel_capture: черновик принадлежит другому пользователю'
      using errcode = '42501';
  end if;

  -- Применённый черновик не отменяется: запись уже создана, и «отмена» тут значила
  -- бы удаление рабочих данных по кнопке в мессенджере. Удаляют в CRM.
  if v_draft.status = 'applied' then
    return jsonb_build_object('status', 'already_applied');
  end if;

  update public.telegram_capture_drafts
     set status = 'cancelled'
   where id = p_draft_id;

  return jsonb_build_object('status', 'cancelled');
end $$;

comment on function public.tg_cancel_capture(uuid, uuid) is
  'Отмена черновика быстрого ввода (110, S-TG-3). Возвращает jsonb со status: '
  'cancelled | already_applied | not_found. Применённый черновик не отменяется — '
  'запись уже создана, удаляют её в CRM.';

revoke all on function public.tg_cancel_capture(uuid, uuid) from public, anon, authenticated;
grant execute on function public.tg_cancel_capture(uuid, uuid) to service_role;
