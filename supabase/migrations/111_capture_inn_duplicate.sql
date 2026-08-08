-- ═══════════════════════════════════════════════════════
-- 111 — S-TG-3-INN-DUP: дубль по ИНН — штатный исход, а не падение вставки.
--
-- ⚠️ НОМЕР СВЕРЕН ЗАПРОСОМ к `supabase_migrations.schema_migrations` (правило 4):
--    последняя применённая — `20260808174157` (110, telegram_capture) ⇒ 111.
--
-- ЧТО БЫЛО. На `companies` живёт partial-unique
--   `uq_companies_org_inn (org_id, inn) where inn is not null and inn <> ''`,
-- а `tg_apply_capture` (110) вставляла компанию без обработки 23505. Отсюда:
--   • кнопка «Всё равно создать» на дубле по ИНН не могла сработать НИКОГДА —
--     вставка упиралась в индекс;
--   • человек видел «Не удалось. Откройте CRM» — про ИНН ни слова;
--   • черновик оставался `pending`: исключение откатывало функцию вместе с
--     `status = 'applied'`, и следующее нажатие давало ровно то же.
-- Тот же путь срабатывал и без дубля на экране: компанию завели между разбором и
-- нажатием, либо дедуп промолчал из-за потолка выборки в 2000 строк.
--
-- ЧТО СТАЛО. Вставка компании обёрнута блоком с `exception when unique_violation`:
-- функция находит существующую запись, ЗАКРЫВАЕТ черновик как `applied` (работа по
-- нему окончена, повторное нажатие обязано дать тот же ответ) и возвращает новый
-- исход `duplicate_inn` с id и названием — боту есть чем ответить и куда сослаться.
--
-- ⚠️ НЕ `on conflict do nothing` и НЕ суффикс к ИНН. Первое молча вернуло бы
--    «создано» без записи, второе испортило бы реквизит. ИНН уникален по природе:
--    совпадение по нему значит буквально ту же организацию, и «создать вторую
--    такую же» — не то, чего хотел человек, даже когда он нажал «Всё равно
--    создать» (он имел в виду «похожее НАЗВАНИЕ — это другая компания»).
--
-- ⚠️ ОБРАБОТЧИК СТОИТ ТОЛЬКО НА ВСТАВКЕ КОМПАНИИ, а не вокруг всего тела:
--    `when unique_violation` на функции целиком поймал бы и будущие констрейнты,
--    о которых эта ветка ничего не знает, и соврал бы про причину. Ветка контакта
--    не тронута сознательно — на `contacts` уникальных индексов нет
--    (сверено с живой БД 2026-08-08: только `contacts_pkey`). Появится такой
--    индекс — обрабатывать симметрично, а не расширять этот блок.
--
-- Тип возврата (jsonb) и сигнатура не меняются ⇒ `create or replace` достаточно,
-- DROP не нужен (в отличие от `claim_telegram_outbox` в 108).
-- Редеплой `telegram-webhook` НУЖЕН: новый исход `duplicate_inn` старая функция
-- разберёт как «черновик устарел» — сообщение будет неверным, но не разрушительным,
-- поэтому apply раньше деплоя безопасен.
--
-- ОТКАТ: вернуть тело функции в форму 110 (`create or replace`, тип прежний).
-- ═══════════════════════════════════════════════════════

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
  v_inn    text;
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
    -- ИНН вынесен в переменную: он нужен и вставке, и поиску существующей записи
    -- в обработчике. Второе вычисление той же строки разошлось бы с первым при
    -- любой правке нормализации.
    v_inn := nullif(btrim(v_data ->> 'inn'), '');

    -- ⚠️ ВЛОЖЕННЫЙ БЛОК = SAVEPOINT. Откатывается только вставка, черновик и
    --    гарды выше остаются; поэтому UPDATE в обработчике сохраняется.
    begin
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
        v_inn,
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

    exception when unique_violation then
      -- Единственный уникальный индекс на таблице — `uq_companies_org_inn`
      -- (org_id, inn). Ищем существующую запись, чтобы бот дал на неё ссылку, а
      -- не просто сказал «не получилось».
      select c.id, c.name into v_id, v_label
      from public.companies c
      where c.org_id = v_draft.org_id
        and c.inn    = v_inn;

      -- ⚠️ v_id ЗДЕСЬ МОЖЕТ ОСТАТЬСЯ NULL — строку удалили в CRM между падением
      --    вставки и поиском. Исход всё равно `duplicate_inn`: причина известна
      --    точно, а ссылку бот в этом случае не рисует (ссылка в никуда хуже её
      --    отсутствия — то же правило, что у `v_link` в `telegram_notification_text`).
      --
      -- Черновик закрываем как applied и связываем с НАЙДЕННОЙ записью: работа по
      -- нему закончена, повторное нажатие обязано дать тот же ответ, а не новую
      -- попытку вставки, которая упрётся в тот же индекс.
      update public.telegram_capture_drafts
         set status            = 'applied',
             applied_at        = now(),
             created_entity_id = v_id
       where id = p_draft_id;

      return jsonb_build_object(
        'status', 'duplicate_inn',
        'id',     v_id,
        'kind',   'company',
        'label',  v_label
      );
    end;
  end if;

  -- ⚠️ ПОРЯДОК: сначала вставка, потом отметка. Упадёт вставка — статус остаётся
  --    pending, и повторное нажатие сработает. Наоборот было бы «кнопка нажата,
  --    записи нет, повторить нельзя». Исключение — ветка `duplicate_inn` выше:
  --    там повтор бессмыслен по определению, поэтому черновик закрывается.
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
  'Применение черновика быстрого ввода из Telegram (110, S-TG-3; 111 — исход '
  'duplicate_inn): создаёт контакт или компанию под правами актора. Актор передаётся '
  'явно — в service-контексте auth.uid() = NULL. Возвращает jsonb со status: created | '
  'duplicate_inn | already_applied | cancelled | not_found | kind_required. '
  'duplicate_inn (111) — вставка компании упёрлась в uq_companies_org_inn: возвращаются '
  'id и название СУЩЕСТВУЮЩЕЙ записи (id может быть NULL, если её удалили в ту же '
  'секунду), черновик закрывается как applied — повтор бессмыслен. Нарушение прав '
  '(чужой черновик, другая org, роль viewer) — исключение 42501, это не штатный путь. '
  'Поля перекладываются поимённо: payload приходит из-за периметра БД.';

-- Гранты не меняются (функция пересоздана `create or replace` — ACL сохраняется),
-- но повторяем явно: молчаливое расхождение прав дороже трёх лишних строк.
revoke all on function public.tg_apply_capture(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.tg_apply_capture(uuid, uuid, text) to service_role;
