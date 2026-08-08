-- ═══════════════════════════════════════════════════════
-- 108 — Telegram, второй шаг (S-TG-2): напоминания по задачам + кнопка «Выполнено».
--
-- КЛЮЧЕВОЕ РЕШЕНИЕ: напоминание идёт ЧЕРЕЗ `notifications`, а не мимо. Новый тип
-- `task_reminder` подхватывает уже существующий триггер `trg_zz_telegram_outbox`
-- (107) — и то же событие видно в колокольчике CRM. Отдельный путь
-- «cron → Telegram» обошёл бы и журнал уведомлений, и веб-UI, то есть завёл бы
-- второй продукт с общей таблицей.
--
-- ГРАНИЦА ДЕЙСТВИЙ ИЗ БОТА. Кнопка есть только у «Выполнено» (`lane → done`):
-- это бинарное действие без формы. Смена стадии сделки в бот НЕ выносится — она
-- проходит `check_stage_requirements` (обязательные поля, файлы, чеклисты), а
-- `StageTransitionModal` собирает `loss_reason`/`won_reason` в момент перехода.
-- В мессенджере это дало бы либо машину состояний, либо обход гейтов; гейты живут
-- в БД ровно затем, чтобы клиент их не обходил. Тот же паттерн, что у
-- `spawn_suggest`: уведомление с deep link в визард, а не действие из уведомления.
--
-- ⚠️ НЕ ПРИМЕНЯТЬ ДО РЕДЕПЛОЯ edge-функций. Порядок гейта:
--      1) apply 108 (cron `tg-reminders` заводится сразу; кнопка при этом уже
--         приезжает в сообщении, но нажатие ничего не сделает — старая
--         telegram-webhook игнорирует callback_query молча и отвечает 200)
--      2) deploy edge `telegram-send` (умеет reply_markup) и `telegram-webhook`
--         (умеет callback_query)
--      3) ролевые смоки RPC + сквозной смок с живой привязкой
--    Пункт 1 безопасен раньше 2: единственный видимый эффект — «крутящаяся»
--    кнопка до таймаута Telegram, данные не трогаются.
--
-- ОТКАТ (порядок обратный применению; CHECK — последним, иначе останутся строки
-- с типом, которого он уже не допускает):
--      select cron.unschedule('tg-reminders');
--      select cron.unschedule('tg-cleanup');
--      drop function if exists public.tg_complete_task(uuid, uuid);
--      drop function if exists public.enqueue_task_reminders();
--      drop function if exists public.cleanup_telegram_transport();
--      drop function if exists public.telegram_task_keyboard(uuid);
--      -- claim_telegram_outbox вернуть в форму 107 через drop + create (тип возврата)
--      alter table public.telegram_outbox drop column if exists reply_markup;
--      drop trigger if exists trg_ab_reset_reminded_at on public.tasks;
--      drop function if exists public.reset_task_reminded_at();
--      drop index if exists public.idx_tasks_reminder_due;
--      alter table public.tasks drop column if exists reminded_at;
--      delete from public.notifications where type = 'task_reminder';
--      alter table public.notifications drop constraint notifications_type_check;
--      alter table public.notifications add constraint notifications_type_check
--        check (type in ('task_assigned','project_assigned','deal_won','automation',
--                        'spawn_suggest','webhook_disabled'));
--      -- плюс вернуть тела telegram_notification_text/enqueue_telegram_notification из 107
-- ═══════════════════════════════════════════════════════

------------------------------------------------------------------------
-- 1. Седьмой тип уведомления
------------------------------------------------------------------------
-- ⚠️ ТОЛЬКО РАСШИРЕНИЕ. Сузить набор нельзя, не удалив строки: CHECK проверяется
--    и на уже лежащих данных при добавлении констрейнта.
--
-- ⚠️ Тип живёт в ЧЕТЫРЁХ местах, и все четыре правятся этим же коммитом:
--      1) этот CHECK,
--      2) public.telegram_notification_text() ниже,
--      3) src/lib/domain/telegram-message.ts (зеркало для тестов),
--      4) src/components/layout/NotificationBell.tsx + src/types/database.ts
--         (NotificationType — точка расхождения SQL↔TS: значение, добавленное в
--          типах без миграции, упадёт на INSERT).
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'task_assigned', 'project_assigned', 'deal_won', 'automation',
    'spawn_suggest', 'webhook_disabled',
    'task_reminder'   -- 108, S-TG-2
  ));

------------------------------------------------------------------------
-- 2. Отметка отправленного напоминания
------------------------------------------------------------------------
-- ПОЧЕМУ КОЛОНКОЙ НА `tasks`, А НЕ ПОИСКОМ ПО ЖУРНАЛУ. Дедупликация обязана
-- держаться на данных, а не на точности расписания: тик неизбежно попадёт в окно
-- «до дедлайна» несколько раз подряд. Проверка «нет ли уже уведомления такого
-- типа по этой задаче» стоила бы join'а к растущей `notifications` на каждом
-- тике; `reminded_at is null` ложится в тот же индексный скан, что и выборка
-- кандидатов.
alter table public.tasks add column if not exists reminded_at timestamptz;

comment on column public.tasks.reminded_at is
  'Когда по задаче ушло напоминание в notifications (108, S-TG-2). Ключ идемпотентности '
  'пятиминутного тика enqueue_task_reminders: одно напоминание НА СРОК. Сбрасывается в NULL '
  'триггером trg_ab_reset_reminded_at при переносе deadline или смене remind_min.';

-- Purpose-built partial: тик читает ровно этот набор и ничего больше.
create index if not exists idx_tasks_reminder_due
  on public.tasks (deadline)
  where reminded_at is null and remind_min is not null and lane <> 'done';

-- ⚠️ ПЕРЕНОС СРОКА СБРАСЫВАЕТ ОТМЕТКУ, И ЭТО СОЗНАТЕЛЬНОЕ УТОЧНЕНИЕ ИНВАРИАНТА
--    «ровно одно напоминание на задачу». Инвариант защищает от повторных попаданий
--    тика в одно и то же окно — и продолжает это делать. Но задача, у которой
--    дедлайн перенесли на неделю вперёд, БЕЗ сброса не напомнила бы о себе больше
--    никогда: `reminded_at` относится к конкретному сроку, а не к строке навсегда.
--    Молчание после переноса выглядело бы как «напоминания не работают».
--
--    Ровно то же для смены `remind_min`: человек, переставивший «за 15 минут» на
--    «за день», просит именно новое напоминание.
create or replace function public.reset_task_reminded_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.reminded_at := null;
  return new;
end $$;

comment on function public.reset_task_reminded_at() is
  'Сброс tasks.reminded_at при переносе дедлайна или смене remind_min (108, S-TG-2): '
  'отметка относится к конкретному сроку, а не к строке навсегда.';

revoke all on function public.reset_task_reminded_at() from public, anon, authenticated;

-- Префикс `ab_` — после trg_aa_* (freeze_org_id, resolve_board), до остальных.
-- Пересечений нет: ни один другой триггер tasks к reminded_at не прикасается.
drop trigger if exists trg_ab_reset_reminded_at on public.tasks;
create trigger trg_ab_reset_reminded_at
  before update of deadline, remind_min on public.tasks
  for each row
  when (old.deadline   is distinct from new.deadline
     or old.remind_min is distinct from new.remind_min)
  execute function public.reset_task_reminded_at();

------------------------------------------------------------------------
-- 3. Клавиатура в сообщении
------------------------------------------------------------------------
-- Telegram принимает клавиатуру отдельным полем sendMessage, а не разметкой в
-- тексте, — значит она обязана доехать до edge отдельной колонкой.
alter table public.telegram_outbox add column if not exists reply_markup jsonb;

comment on column public.telegram_outbox.reply_markup is
  'inline_keyboard для sendMessage (108, S-TG-2). NULL = сообщение без кнопок. '
  'Подмешивается в тело запроса edge-функцией telegram-send.';

-- ⚠️ `callback_data` СТРОГО `tgdone:<uuid>` — никакого JSON. Лимит Telegram 64
--    байта (префикс 7 + uuid 36 = 43, влезает с запасом), но главное не длина:
--    разбор чужого ввода тем безопаснее, чем жёстче формат. Всё, что не легло в
--    эту форму, webhook отвергает не разбирая.
--
-- Функция чистая (таблиц не читает) → SECURITY INVOKER; ACL сужен явно, её зовёт
-- только DEFINER-триггер, исполняющийся от владельца.
create or replace function public.telegram_task_keyboard(p_task_id uuid)
returns jsonb
language sql
immutable
strict
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'inline_keyboard',
    jsonb_build_array(
      jsonb_build_array(
        jsonb_build_object(
          'text', '✓ Выполнено',
          'callback_data', 'tgdone:' || p_task_id::text
        )
      )
    )
  )
$$;

comment on function public.telegram_task_keyboard(uuid) is
  'Inline-клавиатура «Выполнено» для сообщения о задаче (108, S-TG-2). '
  'callback_data строго tgdone:<uuid>; зеркало — buildTaskKeyboard в '
  'src/lib/domain/telegram-message.ts.';

revoke all on function public.telegram_task_keyboard(uuid) from public, anon, authenticated;

-- ── Захват батча теперь отдаёт и клавиатуру ───────────────────────────
-- ⚠️ DROP + CREATE, А НЕ CREATE OR REPLACE. Postgres не даёт менять тип
--    возврата на месте («cannot change return type of existing function»), а
--    RETURNS TABLE — это он и есть. Сигнатура аргументов при этом не меняется,
--    поэтому ловушки перегрузки (42725 на старых вызовах) здесь нет.
--
-- ⚠️ ПОРЯДОК ГЕЙТА БЕЗОПАСЕН В ЛЮБУЮ СТОРОНУ. Старая (ещё не передеплоенная)
--    telegram-send зовёт ту же сигнатуру и читает четыре поля из ответа; лишний
--    `reply_markup` в JSON она просто игнорирует. Сообщения при этом уедут без
--    кнопок — это деградация, а не поломка.
drop function if exists public.claim_telegram_outbox(int);

create or replace function public.claim_telegram_outbox(p_limit int default 25)
-- ⚠️ Выходная колонка называется `message_text`, а не `text`: имя колонки в
--    RETURNS TABLE становится переменной plpgsql и затенило бы ИМЯ ТИПА `text`
--    внутри тела (107).
returns table (
  id           uuid,
  chat_id      bigint,
  message_text text,
  attempts     int,
  reply_markup jsonb
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
  returning o.id, o.chat_id, o.text, o.attempts, o.reply_markup;
end $$;

comment on function public.claim_telegram_outbox(int) is
  'Атомарный захват батча очереди Telegram (107, + reply_markup в 108), только '
  'service_role. `for update skip locked` исключает двойную отправку при пересечении '
  'минутных тиков; захваченная строка получает лизинг 2 мин вместо next_retry_at = null, '
  'иначе умерший isolate оставил бы её захваченной навсегда. Счётчик попыток растёт '
  'здесь: захват и есть попытка.';

revoke all on function public.claim_telegram_outbox(int) from public, anon, authenticated;
grant execute on function public.claim_telegram_outbox(int) to service_role;

------------------------------------------------------------------------
-- 4. Текст уведомления: седьмой тип
------------------------------------------------------------------------
-- ⚠️ ТОЧКА СИНХРОНИЗАЦИИ SQL ↔ TS (см. 107). Зеркало —
--    src/lib/domain/telegram-message.ts, покрыто tests/unit/telegram-message.test.ts.
--    Расхождение зеркала с этой функцией — баг, а не «два варианта».
--
-- Меняется РОВНО ТРИ строки относительно 107: заголовок, ветка тела и явная ветка
-- пути. Всё остальное перенесено дословно — иначе диф не читается.
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
    when 'task_reminder'    then 'Скоро дедлайн'        -- 108
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
    -- 108: срок и название проекта собраны в payload.text планировщиком; title —
    -- голый текст задачи, он же фолбэк, если сборка строки почему-то не удалась.
    when p_type = 'task_reminder' then
      coalesce(v_text, v_title, v_head)
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
    -- 108: явно, хотя совпадает с фолбэком. У задачи нет detail-роута — доска.
    when p_type = 'task_reminder'    then '/tasks'
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
  'Текст сообщения Telegram по уведомлению (107, седьмой тип task_reminder — 108). '
  'Зеркало — buildTelegramNotificationText в src/lib/domain/telegram-message.ts, '
  'правится тем же коммитом. Ссылки может не быть — это штатный исход.';

revoke all on function public.telegram_notification_text(text, text, uuid, jsonb, text)
  from public, anon, authenticated;

------------------------------------------------------------------------
-- 5. Триггер notifications → outbox: клавиатура у задачных типов
------------------------------------------------------------------------
-- Отличие от 107 — одна ветка: у сообщений о ЗАДАЧЕ появляется кнопка. Проверка
-- `entity_type = 'tasks'` обязательна: без неё `entity_id` мог бы оказаться id
-- сделки, и callback_data увёл бы бота закрывать несуществующую задачу.
create or replace function public.enqueue_telegram_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_chat_id bigint;
  v_app_url text;
  v_markup  jsonb;
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

  -- 108: кнопка «Выполнено» — только у сообщений о задаче. `automation` сюда не
  -- входит намеренно, хотя тоже носит entity_type='tasks': это уведомление о
  -- ПРОСРОЧКЕ, и «закрыть одним тапом» для него — не то действие, которого от
  -- человека ждут (там нужен разбор, а не отметка).
  if new.type in ('task_assigned', 'task_reminder') and new.entity_type = 'tasks' then
    v_markup := public.telegram_task_keyboard(new.entity_id);
  end if;

  insert into public.telegram_outbox (org_id, notification_id, chat_id, text, reply_markup)
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
    ),
    v_markup
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
  'привязка (107; клавиатура у task_assigned/task_reminder — 108). Текст собирает '
  'telegram_notification_text. Любая ошибка глотается (RETURN NEW): доставка в '
  'мессенджер не роняет породившую транзакцию.';

------------------------------------------------------------------------
-- 6. Планировщик напоминаний
------------------------------------------------------------------------
-- ⚠️ ПОЛУЧАТЕЛЬ — `coalesce(assigned_to, created_by)`, И ЭТО НЕ МЕЛОЧЬ. На
--    2026-08-08 из 551 незакрытой задачи исполнитель проставлен у восьми: без
--    фолбэка напоминания промолчали бы почти по всей базе. Тот же приём стоит в
--    `isMine` (src/lib/utils/task-view.ts) и в run_overdue_automations (051).
--
-- ⚠️ `org_id` БЕРЁТСЯ ИЗ СТРОКИ ЗАДАЧИ, не из current_org_id(): в cron-контексте
--    текущей org нет, функция вернула бы NULL и NOT NULL уронил бы вставку.
create or replace function public.enqueue_task_reminders()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t           record;
  v_recipient uuid;
  v_project   text;
  v_when      text;
begin
  for t in
    select tk.id, tk.org_id, tk.text, tk.deadline, tk.remind_min,
           tk.assigned_to, tk.created_by, tk.project_id
    from public.tasks tk
    where tk.lane <> 'done'
      and tk.remind_min is not null
      and tk.deadline   is not null
      and tk.reminded_at is null
      and now() >= tk.deadline - make_interval(mins => tk.remind_min)
      -- Дедлайн уже прошёл — напоминать поздно, это работа task_overdue (051).
      and now() <  tk.deadline
  loop
    begin  -- пер-задачная изоляция: одна кривая строка не гасит остальные (политика 050)
      v_recipient := coalesce(t.assigned_to, t.created_by);

      -- Некому напоминать (задача без исполнителя И без автора — legacy-импорт).
      -- Отметку всё равно ставим: иначе строка будет перебираться каждым тиком до
      -- самого дедлайна и стоить скана впустую.
      if v_recipient is null then
        update public.tasks set reminded_at = now() where id = t.id;
        continue;
      end if;

      select p.name into v_project from public.projects p where p.id = t.project_id;

      -- Срок — в МСК: ключ дня в проекте везде московский (mskDateKey), и «14:00»
      -- в уведомлении обязано значить то же, что «14:00» в карточке задачи.
      v_when := to_char(t.deadline at time zone 'Europe/Moscow', 'DD.MM HH24:MI');

      insert into public.notifications
        (org_id, recipient_id, actor_id, type, entity_type, entity_id, payload)
      values (
        t.org_id,
        v_recipient,
        null,                       -- система, не человек
        'task_reminder',
        'tasks',                    -- ⚠️ клавиатуру вешает enqueue_telegram_notification
        t.id,                       --    именно по паре (type, entity_type='tasks')
        jsonb_build_object(
          'title', left(t.text, 120),
          'text',  '«' || left(t.text, 120) || '» — срок ' || v_when || ' МСК'
                   || coalesce(' · ' || v_project, ''),
          'deadline',     t.deadline,
          'project_name', v_project
        )
      );

      -- ⚠️ ПОРЯДОК ОБЯЗАТЕЛЕН: сначала INSERT, потом отметка. Упадёт вставка —
      --    отметка не проставится и следующий тик повторит. Наоборот было бы
      --    тихой потерей напоминания.
      update public.tasks set reminded_at = now() where id = t.id;

    exception when others then
      continue;
    end;
  end loop;
exception when others then
  return;  -- планировщик целиком никогда не падает
end $$;

comment on function public.enqueue_task_reminders() is
  'Пятиминутный планировщик напоминаний по задачам (108, S-TG-2): задачи с deadline и '
  'remind_min, попавшие в окно «до дедлайна» и ещё не отмеченные, получают уведомление '
  'типа task_reminder. Дальше срабатывает транспорт 107. Получатель — '
  'coalesce(assigned_to, created_by). Идемпотентность — tasks.reminded_at, отметка '
  'ставится ПОСЛЕ вставки.';

revoke all on function public.enqueue_task_reminders() from public, anon, authenticated;
grant execute on function public.enqueue_task_reminders() to service_role;

-- ⚠️ ПЯТЬ МИНУТ, А НЕ МИНУТА. Точность напоминания ±5 минут человеку безразлична,
--    а холостых пробуждений в пять раз меньше. Дешёвого выхода по `not exists`
--    здесь нет по той же причине, по какой он есть у tg-send: там условие —
--    один partial-индекс по очереди, здесь оно и есть сам отбор кандидатов
--    (idx_tasks_reminder_due), то есть проверка стоила бы ровно столько же.
do $$
begin
  perform cron.unschedule('tg-reminders');
exception when others then null;  -- job ещё нет — ок
end $$;

select cron.schedule('tg-reminders', '*/5 * * * *', 'select public.enqueue_task_reminders();');

------------------------------------------------------------------------
-- 7. Закрытие задачи из бота
------------------------------------------------------------------------
-- ⚠️ АКТОР ПЕРЕДАЁТСЯ ЯВНО. В service-контексте `auth.uid()` = NULL, и функция,
--    полагающаяся на него, молча закрыла бы гард. Поэтому `p_actor_id` — параметр,
--    а проверки прав функция делает САМА: org, затем владение.
--
-- ⚠️ ВСЕ ГАРДЫ NULL-SAFE. `if x = y` при NULL даёт NULL, а не true — ветка молча
--    не срабатывает, и проверка превращается в её отсутствие. Отсюда
--    `is null` и `is distinct from` вместо `=`/`<>`.
create or replace function public.tg_complete_task(p_actor_id uuid, p_task_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_task public.tasks%rowtype;
begin
  if p_actor_id is null or p_task_id is null then
    raise exception 'tg_complete_task: актор и задача обязательны'
      using errcode = '22023';
  end if;

  select * into v_task from public.tasks where id = p_task_id;
  if not found then
    return 'not_found';
  end if;

  -- Org-гард. Одна проверка, а не две: членство в ТОЙ ЖЕ org, что у задачи, и
  -- есть весь ответ. `memberships.profile_id`, НЕ `user_id` — такой колонки в
  -- таблице нет, вариант с ней падал бы 42703 на первом же нажатии.
  if not exists (
    select 1 from public.memberships m
    where m.profile_id = p_actor_id
      and m.org_id     = v_task.org_id
  ) then
    raise exception 'tg_complete_task: актор вне организации задачи'
      using errcode = '42501';
  end if;

  -- Владение. Ровно тот же предикат, что у получателя напоминания, — иначе
  -- человек получал бы кнопку на задачу, которую ему не дают закрыть.
  if coalesce(v_task.assigned_to, v_task.created_by) is distinct from p_actor_id then
    raise exception 'tg_complete_task: задача не принадлежит актору'
      using errcode = '42501';
  end if;

  if v_task.lane = 'done' then
    return 'already_done';
  end if;

  -- `completed_at` проставит trg_stamp_completed_at (072) — он BEFORE UPDATE OF
  -- lane и срабатывает в том числе на definer-апдейте. Руками его не писать:
  -- вышло бы два источника правды.
  update public.tasks set lane = 'done'::public.task_lane where id = p_task_id;

  return 'done';
end $$;

comment on function public.tg_complete_task(uuid, uuid) is
  'Закрытие задачи по кнопке из Telegram (108, S-TG-2). Актор передаётся явно: в '
  'service-контексте auth.uid() = NULL. Возвращает done|already_done|not_found; '
  'нарушение прав — исключение 42501, это не штатный путь. completed_at ставит '
  'триггер 072.';

revoke all on function public.tg_complete_task(uuid, uuid) from public, anon, authenticated;
grant execute on function public.tg_complete_task(uuid, uuid) to service_role;

------------------------------------------------------------------------
-- 8. Ретеншн транспортных таблиц (долг, записанный в 107)
------------------------------------------------------------------------
-- `telegram_updates` растёт монотонно на каждое входящее сообщение, `telegram_outbox`
-- — на каждое исходящее. Ни та, ни другая не рабочие данные: первая нужна ровно на
-- окно ретраев Telegram (минуты), вторая — пока сообщение не доставлено.
-- 30 дней — тот же горизонт, что у cleanup_webhook_deliveries (089): достаточно,
-- чтобы разобрать инцидент по логам, и не бесконечно.
--
-- `pending` НЕ ТРОГАЕМ ни при каком возрасте: строка, застрявшая в очереди, — это
-- симптом, а не мусор. Удалить её значит спрятать поломку транспорта.
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

  return v_total;
end $$;

comment on function public.cleanup_telegram_transport() is
  'Ретеншн транспортных таблиц Telegram, 30 дней (108, S-TG-2) — закрывает долг, '
  'записанный в комментарии telegram_updates (107). Строки в статусе pending не '
  'удаляются ни при каком возрасте: застрявшая очередь — симптом, а не мусор.';

revoke all on function public.cleanup_telegram_transport() from public, anon, authenticated;
grant execute on function public.cleanup_telegram_transport() to service_role;

-- Суточный шаг, в общей утренней колонне обслуживающих джоб (06:00 UTC = 09:00 MSK).
do $$
begin
  perform cron.unschedule('tg-cleanup');
exception when others then null;
end $$;

select cron.schedule('tg-cleanup', '20 6 * * *', 'select public.cleanup_telegram_transport();');
