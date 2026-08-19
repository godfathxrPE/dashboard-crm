-- 124_telegram_capture_task.sql — S-TG-TASK-1
--
-- Третий интент быстрого ввода из Telegram: задача.
--
-- ⚠️ ЭТО ВТОРОЙ КЛИЕНТ ГОТОВОГО МЕХАНИЗМА, А НЕ НОВЫЙ МЕХАНИЗМ. Черновик,
--    идемпотентность, кнопки и `tg_cancel_capture` уже работают (110, 111);
--    здесь расширяется CHECK на `kind` и дописывается ветка вставки в
--    `tg_apply_capture`. Существующие ветки contact/company не переписываются —
--    тело взято из `pg_get_functiondef` живой функции 2026-08-19.
--
-- ⚠️ ССЫЛКИ ИЗ PAYLOAD ПРОВЕРЯЮТСЯ НА ПРИНАДЛЕЖНОСТЬ ОРГАНИЗАЦИИ ЧЕРНОВИКА.
--    Функция SECURITY DEFINER читает и пишет в обход RLS: чужой uuid в payload
--    без такой проверки дал бы cross-tenant связь (класс
--    `check_task_dependency_valid`, 048). Не прошедшая проверку ссылка
--    ОБНУЛЯЕТСЯ, а не роняет вставку: черновик мог пережить удаление сотрудника,
--    и терять из-за этого весь разбор незачем.

-- ═══ 1. Черновик умеет kind='task' ═══
--
-- `duplicate_kind` НЕ трогаем: дедупа задач нет и не будет — две одинаковые
-- задачи законны, в отличие от двух одинаковых компаний.

alter table public.telegram_capture_drafts
  drop constraint if exists telegram_capture_drafts_kind_check;

alter table public.telegram_capture_drafts
  add constraint telegram_capture_drafts_kind_check
  check (kind = any (array['contact'::text, 'company'::text, 'unclear'::text, 'task'::text]));

-- ═══ 2. tg_apply_capture — ветка task ═══
--
-- Тип возврата не меняется ⇒ `drop function` не нужен (`create or replace`
-- достаточно, пока совпадают аргументы и колонки — S-LEAD-HUB-2a).

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

  return jsonb_build_object(
    'status', 'created',
    'id',     v_id,
    'kind',   v_kind,
    'label',  v_label
  );
end $function$;
