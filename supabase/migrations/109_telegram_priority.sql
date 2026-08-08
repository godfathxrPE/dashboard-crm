-- ═══════════════════════════════════════════════════════
-- 109 — S-TG-PRIORITY: приоритет задачи в заголовке напоминания.
--
-- ПОЧЕМУ ЭТО МИГРАЦИЯ, А НЕ ПРАВКА UI. Приоритет не показывался не потому, что
-- его не выводили, а потому что его НЕ БЫЛО В ДАННЫХ: `enqueue_task_reminders`
-- (108) кладёт в `notifications.payload` только title/text/deadline/project_name,
-- и `telegram_notification_text()` про приоритет физически не знала.
--
-- ГРАНИЦЫ (сознательные, не «на будущее доделаем»):
--   • ТОЛЬКО `task_reminder`. Остальные шесть типов собирают чужие функции со
--     своим payload — лезть в них этим фиксом незачем.
--   • ТОЛЬКО два верхних уровня: important → « · важно», critical → « · критично»,
--     normal → НИЧЕГО. Маркер у всех — это отсутствие маркера, так система
--     приоритетов и обесценивается.
--   • Поведение доставки не меняется: ни расписание, ни число напоминаний, ни
--     получатель, ни cron. Это правка текста и одного ключа payload.
--
-- ⚠️ Таблиц, индексов и cron-джоб миграция НЕ ТРОГАЕТ — только две функции через
--    `create or replace`. Тип возврата у обеих прежний ⇒ DROP не нужен (в отличие
--    от `claim_telegram_outbox` в 108, где менялся RETURNS TABLE).
--
-- ⚠️ РЕДЕПЛОЙ EDGE НЕ НУЖЕН. Обе функции живут в БД; `telegram-send` получает уже
--    готовый текст строкой очереди и про приоритет не знает.
--
-- ОТКАТ: вернуть тела обеих функций из `108_telegram_reminders.sql` (разделы 4 и 6).
--   Данные чистить не нужно: лишний ключ `priority` в payload уже разосланных
--   уведомлений безвреден — читатели берут его через `->>`, отсутствие = NULL.
-- ═══════════════════════════════════════════════════════

------------------------------------------------------------------------
-- 1. Планировщик кладёт приоритет в payload
------------------------------------------------------------------------
-- Отличие от 108 — РОВНО ДВЕ строки: `tk.priority` в выборке цикла и ключ
-- 'priority' в jsonb_build_object. Порядок «сначала INSERT, потом отметка»,
-- пер-задачная изоляция и внешний глушитель — без изменений; переписаны целиком
-- только потому, что plpgsql не умеет патчить тело.
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
           tk.assigned_to, tk.created_by, tk.project_id,
           tk.priority                                    -- 109
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
          'project_name', v_project,
          -- 109: приоритет уезжает в payload ЗНАЧЕНИЕМ, а не признаком — решение
          -- «какой маркер показать» принимает telegram_notification_text, а не
          -- планировщик, иначе правка формата требовала бы двух миграций.
          --
          -- `::text` не обязателен (jsonb_build_object на enum даёт ту же строку —
          -- проверено), но написан явно: читатель достаёт значение через `->>`,
          -- то есть контракт payload здесь текстовый, и вид в коде совпадает с ним.
          'priority',     t.priority::text
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
  'ставится ПОСЛЕ вставки. payload: title, text, deadline, project_name, '
  '**priority (109)**.';

revoke all on function public.enqueue_task_reminders() from public, anon, authenticated;
grant execute on function public.enqueue_task_reminders() to service_role;

------------------------------------------------------------------------
-- 2. Приоритет в заголовке сообщения
------------------------------------------------------------------------
-- ⚠️ ТОЧКА СИНХРОНИЗАЦИИ SQL ↔ TS (заведена в 107, подтверждена в 108). Зеркало —
--    `src/lib/domain/telegram-message.ts`, покрыто `tests/unit/telegram-message.test.ts`.
--    Расхождение зеркала с этой функцией — баг, а не «два варианта».
--
-- Отличие от 108 — ОДНА ветка `v_head`. Всё остальное перенесено дословно.
create or replace function public.telegram_notification_text(
  p_type        text,
  p_entity_type text,
  p_entity_id   uuid,
  p_payload     jsonb,
  p_app_url     text
)
returns text
language plpgsql
immutable          -- по-прежнему зависит только от аргументов: таблиц не читает
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
    -- 109: приоритет припиской к заголовку. Только два верхних уровня — `normal`
    -- маркера не получает, иначе он есть у всех и не значит ничего.
    --
    -- ⚠️ `else ''`, А НЕ `else null`: конкатенация с NULL даёт NULL, и заголовок
    --    исчез бы ЦЕЛИКОМ — вместе с ним `v_body`-фолбэк и всё сообщение. Та же
    --    ловушка, из-за которой в 107 стоит `coalesce` вокруг `v_link`.
    --
    -- ⚠️ Приоритет НЕ экранируется и не должен: это литерал из закрытого набора
    --    (enum `task_priority`), а не введённый человеком текст. Экранированию
    --    подлежат `title` и `text` — они выше и уже обработаны.
    when 'task_reminder'    then 'Скоро дедлайн' || case p_payload->>'priority'
                                  when 'important' then ' · важно'
                                  when 'critical'  then ' · критично'
                                  else ''  -- normal, отсутствующий ключ, мусор
                                end
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
    -- срок и название проекта собраны в payload.text планировщиком; title — голый
    -- текст задачи, он же фолбэк, если сборка строки почему-то не удалась.
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
    -- явно, хотя совпадает с фолбэком. У задачи нет detail-роута — доска.
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
  'Текст сообщения Telegram по уведомлению (107; седьмой тип task_reminder — 108; '
  'приписка приоритета к его заголовку — 109). Зеркало — buildTelegramNotificationText '
  'в src/lib/domain/telegram-message.ts, правится тем же коммитом. Приписку получают '
  'только important/critical: маркер у всех — это отсутствие маркера. Ссылки может не '
  'быть — это штатный исход.';

revoke all on function public.telegram_notification_text(text, text, uuid, jsonb, text)
  from public, anon, authenticated;
