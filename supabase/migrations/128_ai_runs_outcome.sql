-- 128_ai_runs_outcome.sql — S-AI-OBS-2
--
-- Журнал `ai_runs` связывается с созданной сущностью. До этой миграции прогон
-- capture заканчивался на «разобрано»: компания создавалась через 10 секунд
-- (кнопка «Создать» — другой вызов webhook), и связи между строками не было
-- ни в одну сторону. Главный вопрос недели наблюдения — «сколько разборов дошли
-- до записи» — не отвечался вовсе.
--
-- Механика: id прогона едет В ЧЕРНОВИКЕ (`telegram_capture_drafts.ai_run_id`),
-- а исход проставляют те же RPC, что создают сущность, — атомарно, в той же
-- транзакции. Веб-путь (модалка после разбора) пишет исход через
-- `capture_set_outcome` (INVOKER + RLS-политика UPDATE ниже).
--
-- ⚠️ СВЯЗЬ ЖИВЁТ В `result` JSONB, А НЕ В КОЛОНКАХ `entity_type`/`entity_id`.
--    Не лень, а граница 127: capture держат ШЕСТЬ механизмов — CHECK
--    `ai_runs_entity_type_check` не знает contact/task, парный CHECK
--    `ai_runs_entity_pair_or_capture` требует у capture пустой `entity_id`,
--    а `ai_runs_select` перечисляет ветки по сущностям. Записать реальный тип
--    в колонки значило бы перекроить всё это И молча изменить потребителей:
--    `ai-run-sources`/`CompanyAiDigest` фильтруют `entity_type='company'` —
--    capture-прогоны полезли бы в таймлайны сущностей.
--
-- Ключи в `result` (рядом с `source` и `kind` из S-AI-OBS-1):
--   outcome      — created | matched_existing | rejected;
--                  ОТСУТСТВИЕ ключа — тоже исход: разбор не дошёл ни до чего
--                  (черновик истёк, дубль проигнорирован, модалку закрыли).
--   entity_kind  — contact | company | task (у rejected не пишется)
--   entity_id    — uuid созданной или найденной записи
--
-- Откат: drop policy ai_runs_update_capture; drop function capture_set_outcome;
-- тела tg_apply_capture/tg_cancel_capture — из 125/110; alter table
-- telegram_capture_drafts drop column ai_run_id.

-- ── 1. Черновик несёт id прогона ────────────────────────────────────────
alter table public.telegram_capture_drafts
  add column if not exists ai_run_id uuid;

comment on column public.telegram_capture_drafts.ai_run_id is
  'S-AI-OBS-2: прогон ai_runs, из которого родился черновик. Nullable: журнал — '
  'побочный эффект, его отказ не отменяет разбор. Без FK намеренно: ai_runs '
  'чистится независимо от черновиков, и битая ссылка здесь дешевле каскада.';

-- ── 2. tg_apply_capture: исход проставляется в той же транзакции ────────
--
-- Тело — 125 (сверено с файлом миграции; 125 применена, файл = живая функция)
-- плюс блоки простановки исхода перед обоими содержательными return.
-- Аргументы и тип возврата прежние ⇒ хватает create or replace.
create or replace function public.tg_apply_capture(
  p_actor_id uuid,
  p_draft_id uuid,
  p_kind     text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_draft      public.telegram_capture_drafts%rowtype;
  v_kind       text;
  v_role       text;
  v_data       jsonb;
  v_id         uuid;
  v_label      text;
  v_phones     jsonb;
  v_inn        text;
  v_assignee   uuid;
  v_project    uuid;
  v_company    uuid;
begin
  if p_actor_id is null or p_draft_id is null then
    raise exception 'tg_apply_capture: актор и черновик обязательны'
      using errcode = '22023';
  end if;

  if p_kind is not null and p_kind not in ('contact', 'company', 'task') then
    raise exception 'tg_apply_capture: недопустимая ветка %', p_kind
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
    raise exception 'tg_apply_capture: черновик принадлежит другому пользователю'
      using errcode = '42501';
  end if;

  -- Роль читается ЗАПРОСОМ, а не через current_org_role(): функция вызывается
  -- из бота под service_role, где current_org_id()/current_org_role() = NULL,
  -- а `NULL not in (…)` даёт NULL — то есть гард молча пропустил бы всех.
  select m.role into v_role
  from public.memberships m
  where m.profile_id = p_actor_id
    and m.org_id     = v_draft.org_id;

  if v_role is null then
    raise exception 'tg_apply_capture: актор вне организации черновика'
      using errcode = '42501';
  end if;

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

  -- ⚠️ ВЕТКУ ЗАДАЧИ НЕЛЬЗЯ ПОДМЕНИТЬ КНОПКОЙ. Выбор ветки (`tgcapc:`/`tgcapo:`)
  --    существует ради черновиков `unclear`, где payload несёт обе формы. У
  --    task-черновика в payload только ключ `task`: применение его «как контакта»
  --    создало бы контакт с пустым именем — молча и без единой ошибки.
  if v_draft.kind = 'task' and p_kind is not null and p_kind <> 'task' then
    raise exception 'tg_apply_capture: черновик задачи нельзя применить как %', p_kind
      using errcode = '22023';
  end if;

  v_kind := coalesce(p_kind, v_draft.kind);
  if v_kind = 'unclear' then
    return jsonb_build_object('status', 'kind_required');
  end if;

  v_data := coalesce(v_draft.payload -> v_kind, '{}'::jsonb);

  if v_kind = 'contact' then
    v_phones := coalesce(v_data -> 'phones', '[]'::jsonb);

    insert into public.contacts (
      org_id, created_by, owner_id,
      first_name, last_name, position, email, phone, phones, notes
    )
    values (
      v_draft.org_id, p_actor_id, p_actor_id,
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

    -- ── S-CONTACT-COMPANY: привязка к компании ────────────────────────
    --
    -- ⚠️ У `contacts` НЕТ `company_id`. Связь контакта с компанией живёт в
    --    junction-таблице `contact_company` (M:N с ролью и признаком основной),
    --    и до этой миграции бот в неё не писал вовсе: разобранное название
    --    компании оставалось словом в `notes`, а связь владелец ставил руками.
    --
    -- ⚠️ ССЫЛКА ПРОВЕРЯЕТСЯ НА ORG ЧЕРНОВИКА — тот же гард, что у ссылок
    --    задачи: DEFINER пишет в обход RLS, и чужой uuid в payload дал бы
    --    cross-tenant связь. Не прошло ⇒ ОБНУЛЯЕМ, а не падаем: контакт
    --    разобран, и терять его из-за привязки незачем.
    v_company := nullif(btrim(v_data ->> 'company_id'), '')::uuid;
    if v_company is not null
       and not exists (
         select 1 from public.companies c
         where c.id = v_company and c.org_id = v_draft.org_id
       )
    then
      v_company := null;
    end if;

    if v_company is not null then
      -- ⚠️ ОБРАБОТЧИК НА ОПЕРАЦИИ, А НЕ НА ТЕЛЕ ФУНКЦИИ (тот же приём, что
      --    `duplicate_inn` в 111). На `contact_company` висит
      --    `unique (contact_id, company_id)`; контакт к этому моменту УЖЕ
      --    создан, и падение на привязке обесценило бы всю операцию —
      --    черновик остался бы неприменённым при живой записи в `contacts`.
      begin
        insert into public.contact_company (
          contact_id, company_id, org_id, role, is_primary
        )
        values (
          v_id,
          v_company,
          v_draft.org_id,
          -- Роль в компании = должность, которую разобрала модель. Отдельного
          -- поля роли у бота нет, а «коммерческий директор» — это ровно она.
          nullif(btrim(v_data ->> 'position'), ''),
          -- У нового контакта это первая и единственная компания.
          true
        );
      exception when unique_violation then
        null;
      end;
    end if;

  elsif v_kind = 'task' then
    -- ── Ссылки: каждая обязана принадлежать организации черновика ──────
    --
    -- Порядок «взять → проверить → обнулить» важен: ошибочный `assigned_to`
    -- уводит уведомление не тому человеку МГНОВЕННО (trg_notify_task_assigned
    -- срабатывает AFTER INSERT), и отката у этого нет.
    v_assignee := nullif(btrim(v_data ->> 'assigned_to'), '')::uuid;
    if v_assignee is not null
       and not exists (
         select 1 from public.memberships m
         where m.profile_id = v_assignee and m.org_id = v_draft.org_id
       )
    then
      v_assignee := null;
    end if;

    v_project := nullif(btrim(v_data ->> 'project_id'), '')::uuid;
    if v_project is not null
       and not exists (
         select 1 from public.projects p
         where p.id = v_project and p.org_id = v_draft.org_id
       )
    then
      v_project := null;
    end if;

    v_company := nullif(btrim(v_data ->> 'company_id'), '')::uuid;
    if v_company is not null
       and not exists (
         select 1 from public.companies c
         where c.id = v_company and c.org_id = v_draft.org_id
       )
    then
      v_company := null;
    end if;

    -- ⚠️ lane = 'next' («Не начата»), а НЕ дефолтный 'now'. Задача, которую
    --    только что поставили, не находится в работе. Прецедент — delivery-путь
    --    (copy_delivery_template), где массовое создание ставит 'next' по той же
    --    причине.
    --
    -- ⚠️ При непустом project_id trg_aa_resolve_board подберёт колонку по
    --    lane_to_category('next') = 'backlog' и перепишет lane значением
    --    category_to_lane(категория колонки). Для 'backlog' это снова 'next' —
    --    то есть на текущих досках lane сохраняется. Это штатное поведение доски
    --    проекта, и мешать ему нельзя.
    --
    -- ⚠️ priority сверяется со СПИСКОМ, а не кастуется напрямую: payload пишет
    --    бот по ответу модели, и мусорная строка дала бы 22P02 вместо задачи.
    --
    -- created_by = p_actor_id: default auth.uid() в service-контексте = NULL.
    -- org_id явно: trg_set_org_id заполняет только при NULL, а current_org_id()
    -- здесь тоже NULL.
    insert into public.tasks (
      text, lane, priority, deadline, remind_min,
      project_id, company_id, assigned_to,
      created_by, org_id
    )
    values (
      coalesce(nullif(btrim(v_data ->> 'text'), ''), 'Без описания'),
      'next'::public.task_lane,
      coalesce(
        case
          when v_data ->> 'priority' in ('normal', 'important', 'critical')
            then (v_data ->> 'priority')::public.task_priority
        end,
        'normal'::public.task_priority
      ),
      nullif(btrim(v_data ->> 'deadline'), '')::timestamptz,
      nullif(btrim(v_data ->> 'remind_min'), '')::int,
      v_project, v_company, v_assignee,
      p_actor_id, v_draft.org_id
    )
    returning id, left(text, 80) into v_id, v_label;

  else
    v_phones := coalesce(v_data -> 'phones', '[]'::jsonb);
    v_inn := nullif(btrim(v_data ->> 'inn'), '');

    begin
      insert into public.companies (
        org_id, created_by, owner_id,
        name, inn, kpp, ogrn, legal_name, legal_address, inn_status, inn_verified_at,
        okved, industry, email, phone, phones, website, address, notes
      )
      values (
        v_draft.org_id, p_actor_id, p_actor_id,
        coalesce(nullif(btrim(v_data ->> 'name'), ''), 'Без названия'),
        v_inn,
        nullif(btrim(v_data ->> 'kpp'), ''),
        nullif(btrim(v_data ->> 'ogrn'), ''),
        nullif(btrim(v_data ->> 'legal_name'), ''),
        nullif(btrim(v_data ->> 'legal_address'), ''),
        nullif(btrim(v_data ->> 'inn_status'), ''),
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
      select c.id, c.name into v_id, v_label
      from public.companies c
      where c.org_id = v_draft.org_id
        and c.inn    = v_inn;

      update public.telegram_capture_drafts
         set status            = 'applied',
             applied_at        = now(),
             created_entity_id = v_id
       where id = p_draft_id;

      -- ── S-AI-OBS-2: исход «дошёл до существующей записи» ─────────────
      --
      -- ⚠️ ПРОСТАНОВКА ЗДЕСЬ, А НЕ У ВЫЗЫВАЮЩЕГО. Бот узнаёт об исходе из
      --    ответа RPC, но писал бы его вторым запросом — и падение между ними
      --    оставило бы применённый черновик с прогоном без исхода. В одной
      --    транзакции это невозможно.
      --
      -- `v_id` может быть NULL (запись удалили между падением вставки и
      -- поиском) — jsonb_strip_nulls не даст ключу с NULL засорить result.
      if v_draft.ai_run_id is not null then
        update public.ai_runs
           set result = coalesce(result, '{}'::jsonb) || jsonb_strip_nulls(
                 jsonb_build_object(
                   'outcome',     'matched_existing',
                   'entity_kind', 'company',
                   'entity_id',   v_id
                 ))
         where id = v_draft.ai_run_id;
      end if;

      return jsonb_build_object(
        'status', 'duplicate_inn',
        'id',     v_id,
        'kind',   'company',
        'label',  v_label
      );
    end;
  end if;

  update public.telegram_capture_drafts
     set status            = 'applied',
         applied_at        = now(),
         created_entity_id = v_id
   where id = p_draft_id;

  -- ── S-AI-OBS-2: исход «создано» — атомарно с самим созданием ──────────
  if v_draft.ai_run_id is not null then
    update public.ai_runs
       set result = coalesce(result, '{}'::jsonb) || jsonb_build_object(
             'outcome',     'created',
             'entity_kind', v_kind,
             'entity_id',   v_id
           )
     where id = v_draft.ai_run_id;
  end if;

  return jsonb_build_object(
    'status', 'created',
    'id',     v_id,
    'kind',   v_kind,
    'label',  v_label
  );
end $function$;

-- ── 3. tg_cancel_capture: отказ — тоже исход ────────────────────────────
--
-- Тело — 110 плюс простановка `rejected` перед успешным return. ACL прежний
-- (create or replace сохраняет гранты 110: только service_role).
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

  -- S-AI-OBS-2: явный отказ от карточки — исход, а не отсутствие исхода.
  -- Без entity_kind/entity_id: отклонённый разбор ни до чего не дошёл.
  if v_draft.ai_run_id is not null then
    update public.ai_runs
       set result = coalesce(result, '{}'::jsonb)
                    || jsonb_build_object('outcome', 'rejected')
     where id = v_draft.ai_run_id;
  end if;

  return jsonb_build_object('status', 'cancelled');
end $$;

-- ── 4. Веб-путь: RPC простановки исхода ─────────────────────────────────
--
-- ⚠️ SECURITY INVOKER — сознательно, в отличие от tg_*: вызывает браузер под
--    сессией, и границу держит RLS-политика UPDATE ниже, а не логика функции.
--    DEFINER здесь дал бы клиенту право писать в чужие прогоны.
--
-- ⚠️ RPC, А НЕ `update` С КЛИЕНТА: supabase-js в update() ЗАМЕНЯЕТ колонку
--    целиком — клиент затёр бы source/kind из S-AI-OBS-1. `result || …` в SQL —
--    единственный способ дописать ключи, не пересобирая объект на клиенте.
create or replace function public.capture_set_outcome(
  p_run_id      uuid,
  p_outcome     text,
  p_entity_kind text default null,
  p_entity_id   uuid default null
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_outcome not in ('created', 'matched_existing', 'rejected') then
    -- Громко, а не молча: мусорный outcome с клиента — баг вызывающего кода,
    -- и тихий no-op здесь был бы ровно тем слепым пятном, против которого спринт.
    raise exception 'capture_set_outcome: недопустимый outcome %', p_outcome
      using errcode = '22023';
  end if;

  update public.ai_runs
     set result = coalesce(result, '{}'::jsonb) || jsonb_strip_nulls(
           jsonb_build_object(
             'outcome',     p_outcome,
             'entity_kind', p_entity_kind,
             'entity_id',   p_entity_id
           ))
   where id = p_run_id
     and entity_type = 'capture';
  -- Ноль обновлённых строк — не ошибка: RLS отсекла чужое, либо id устарел.
  -- Журнал — побочный эффект; ронять UX из-за него нельзя (инвариант S-AI-OBS-1).
end $$;

comment on function public.capture_set_outcome(uuid, text, text, uuid) is
  'S-AI-OBS-2: веб-виджет дописывает исход разбора (created | matched_existing | '
  'rejected) в result своего capture-прогона. INVOKER: границу держит политика '
  'ai_runs_update_capture. Мерж через ||, чтобы не терять source/kind.';

revoke all on function public.capture_set_outcome(uuid, text, text, uuid) from public, anon;
grant execute on function public.capture_set_outcome(uuid, text, text, uuid) to authenticated;

-- ── 5. RLS UPDATE: только свои capture-прогоны ──────────────────────────
--
-- До 128 у ai_runs не было UPDATE-политики вовсе — веб не мог дописать исход.
-- USING и WITH CHECK одинаковы и оба требуют entity_type='capture': клиент не
-- может ни тронуть сущностный прогон, ни перекрасить capture в company — иначе
-- строка полезла бы в таймлайны сущностей (`ai-run-sources` фильтрует по
-- entity_type) под видом прогона пресета.
drop policy if exists ai_runs_update_capture on public.ai_runs;
create policy ai_runs_update_capture on public.ai_runs
  for update to authenticated
  using (
    org_id = ( select public.current_org_id() )
    and created_by = ( select auth.uid() )
    and entity_type = 'capture'
  )
  with check (
    org_id = ( select public.current_org_id() )
    and created_by = ( select auth.uid() )
    and entity_type = 'capture'
  );
