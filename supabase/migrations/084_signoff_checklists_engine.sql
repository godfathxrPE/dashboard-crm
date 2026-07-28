-- 084: sign-off чеклисты — RPC отметки, расширение гейта, инстанцирование
--      (S-R2-SIGNOFF-1, R2-P1-G). Таблицы — в 083.
--
-- ⚠️ ОБРАТИМОСТЬ / ПОРЯДОК ОТКАТА: 084 откатывается ПЕРВОЙ, 083 — второй.
--    Откат 084 = вернуть тела check_delivery_completion / enforce_delivery_completion /
--    spawn_delivery_project из baseline (строки 224–265, 588–604) и 073 соответственно,
--    затем drop toggle_checklist_item и instantiate_project_checklists.
--
-- ⚠️ ПРАВИТСЯ ЖИВОЙ ГЕЙТ. Через check_delivery_completion + enforce_delivery_completion
--    сегодня проходят 3 открытых delivery-проекта (проверено на живой БД 2026-07-28).
--    Тела скопированы из ЖИВОЙ БД (pg_proc.prosrc), не из файлов: guard-блок и блок
--    открытых вех идут дословно, ключ `open_milestones` сохраняет имя и форму.
--
-- ⚠️ BREAKING для клиента: enforce_delivery_completion кладёт в DETAIL теперь ВЕСЬ
--    результат (объект), а не голый массив вех. parseDeliveryGateError в том же коммите
--    переучен переживать ОБА формата — между apply миграции и деплоем фронта есть окно.

-- ═══════════════════════════════════════════════════════════════════
-- 1. toggle_checklist_item — единственный путь отметки
-- ═══════════════════════════════════════════════════════════════════
-- DEFINER: штампует actor и время СЕРВЕРНО. Прямой UPDATE items рядовому участнику
-- закрыт политикой project_checklists_write (083) — это и есть смысл sign-off.

create or replace function public.toggle_checklist_item(
  p_checklist_id uuid,
  p_item_key     text,
  p_checked      boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row   public.project_checklists%rowtype;
  v_items jsonb;
  v_found boolean := false;
  v_done  boolean;
  v_actor uuid := auth.uid();
begin
  if p_checked is null then
    raise exception 'checklist_toggle_denied: p_checked must not be null' using errcode = '22023';
  end if;

  -- `for update` (правка гейта): items — read-modify-write по jsonb. Без блокировки
  -- две одновременные отметки РАЗНЫХ пунктов дают last-write-wins, и одна отметка
  -- молча теряется — ровно в сценарии, ради которого фича и делается (команда
  -- проходит sign-off вместе перед сдачей). Блокировка строки, не таблицы.
  select * into v_row from public.project_checklists where id = p_checklist_id for update;
  if not found then
    raise exception 'checklist_toggle_denied: not found' using errcode = '42501';
  end if;

  -- Guard как в check_stage_requirements: DEFINER обязан проверять членство сам.
  if v_actor is null or not public.is_org_member(v_row.org_id) then
    raise exception 'checklist_toggle_denied: not a member of project org' using errcode = '42501';
  end if;

  -- `with ordinality` обязателен: без него jsonb_agg не гарантирует порядок, и пункты
  -- чеклиста переставлялись бы на каждой отметке.
  --
  -- checked_at — to_char(… at time zone 'UTC', …), НЕ now()::text: грабля 079, ::text для
  -- timestamptz зависит от session TimeZone/DateStyle, и значение из UI (MSK) не совпало бы
  -- со значением из cron/скрипта (UTC). Клиент парсит строку как ISO.
  select jsonb_agg(
           case when it->>'key' = p_item_key
             then it
                  || jsonb_build_object('checked', p_checked)
                  || case when p_checked
                       then jsonb_build_object('checked_by', v_actor,
                                               'checked_at', to_char(now() at time zone 'UTC',
                                                                     'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
                       else jsonb_build_object('checked_by', null, 'checked_at', null)
                     end
             else it
           end
           order by ord
         ),
         bool_or(it->>'key' = p_item_key)
    into v_items, v_found
  from jsonb_array_elements(v_row.items) with ordinality as t(it, ord);

  if not coalesce(v_found, false) then
    raise exception 'checklist_toggle_denied: unknown item key %', p_item_key using errcode = '22023';
  end if;

  v_items := coalesce(v_items, '[]'::jsonb);

  -- «Чеклист закрыт» = все required-пункты отмечены (пунктов без required это не касается).
  select not exists (
    select 1 from jsonb_array_elements(v_items) x
    where coalesce((x->>'required')::boolean, false)
      and not coalesce((x->>'checked')::boolean, false)
  ) into v_done;

  update public.project_checklists
     set items        = v_items,
         -- coalesce со СТАРЫМ значением: отметка необязательного пункта на уже закрытом
         -- чеклисте не должна переставлять дату sign-off на «сейчас».
         completed_at = case when v_done then coalesce(v_row.completed_at, now()) else null end
   where id = p_checklist_id;

  return v_items;
end $$;

revoke all on function public.toggle_checklist_item(uuid, text, boolean) from public, anon;
grant execute on function public.toggle_checklist_item(uuid, text, boolean) to authenticated;

comment on function public.toggle_checklist_item(uuid, text, boolean) is
  'R2-P1-G (084): отметить/снять пункт sign-off чеклиста. DEFINER — checked_by/checked_at '
  'штампует сервер (auth.uid()/now()), клиент их не передаёт. Guard членства внутри → 42501. '
  'Неизвестный key → 22023. completed_at выставляется, когда все required отмечены.';

-- ═══════════════════════════════════════════════════════════════════
-- 2. check_delivery_completion — + незакрытые обязательные пункты
-- ═══════════════════════════════════════════════════════════════════
-- Guard-блок и блок открытых вех — ДОСЛОВНО из живой БД (pg_proc.prosrc, сверено
-- 2026-07-28; совпадает с baseline:229–258). Ключ `open_milestones` остаётся с тем же
-- именем и формой: его читают useDeliveryGate и DeliveryCompletionModal — переименование
-- или вложение сломало бы обе поверхности молча (H2).

create or replace function public.check_delivery_completion("p_project_id" uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
DECLARE
  v_project    public.projects%ROWTYPE;
  v_open       jsonb;
  v_open_items jsonb;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'delivery_gate_check_denied: project not found'
      USING ERRCODE = '42501';
  END IF;
  IF v_project.type <> 'delivery' THEN
    RAISE EXCEPTION 'delivery_gate_check_denied: project is not delivery'
      USING ERRCODE = '42501';
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_org_member(v_project.org_id) THEN
    RAISE EXCEPTION 'delivery_gate_check_denied: not a member of project org'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('id', t.id, 'text', t.text, 'phase', pc.name, 'lane', t.lane)
      ORDER BY t.text
    ),
    '[]'::jsonb
  )
  INTO v_open
  FROM public.tasks t
  LEFT JOIN public.project_columns pc ON pc.id = t.column_id
  WHERE t.project_id = p_project_id
    AND t.is_milestone
    AND t.lane <> 'done';

  -- НОВОЕ (084): незакрытые обязательные пункты sign-off чеклистов проекта.
  -- Проектов без чеклистов это не касается: агрегат по нулю строк → '[]' → ready как раньше.
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'checklist_id', c.id,
        'checklist',    c.title,
        'key',          x->>'key',
        'label',        x->>'label'
      )
      ORDER BY c.title, x->>'label'
    ),
    '[]'::jsonb
  )
  INTO v_open_items
  FROM public.project_checklists c,
       LATERAL jsonb_array_elements(c.items) x
  WHERE c.project_id = p_project_id
    AND COALESCE((x->>'required')::boolean, false)
    AND NOT COALESCE((x->>'checked')::boolean, false);

  RETURN jsonb_build_object(
    'ready',                jsonb_array_length(v_open) = 0
                            AND jsonb_array_length(v_open_items) = 0,
    'open_milestones',      v_open,
    'open_checklist_items', v_open_items
  );
END;
$$;

comment on function public.check_delivery_completion(uuid) is
  'Гейт завершения внедрения (038; расширен 084). Возвращает {ready, open_milestones, '
  'open_checklist_items}. open_milestones — контракт клиента с 038, имя и форма неизменны. '
  'ready=false, если есть открытая веха ИЛИ неотмеченный required-пункт чеклиста.';

-- ═══════════════════════════════════════════════════════════════════
-- 3. enforce_delivery_completion — DETAIL отдаёт весь результат
-- ═══════════════════════════════════════════════════════════════════
-- Раньше в DETAIL уходил только open_milestones. Теперь ready может быть false из-за
-- чеклистов — и клиент получил бы пустой массив вех с текстом «завершение заблокировано,
-- но закрывать нечего». Отдаём объект целиком, клиент разбирает по ключам.

create or replace function public.enforce_delivery_completion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
DECLARE
  v_result jsonb;
BEGIN
  IF NEW.type = 'delivery' AND OLD.status = 'open' AND NEW.status = 'completed' THEN
    v_result := public.check_delivery_completion(NEW.id);
    IF NOT (v_result->>'ready')::boolean THEN
      -- DETAIL = ВЕСЬ результат (объект), а не только вехи (было `v_result->'open_milestones'`).
      RAISE EXCEPTION 'delivery_gate_failed'
        USING DETAIL = v_result::text, ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 4. instantiate_project_checklists + вызов из spawn_delivery_project
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.instantiate_project_checklists(
  p_project_id uuid,
  p_direction  public.direction_t,
  p_kind       text
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org   uuid;
  v_count int := 0;
begin
  select org_id into v_org from public.projects where id = p_project_id;
  if v_org is null then return 0; end if;

  -- ⚠️ Правка гейта: `distinct on (checklist_type)` + приоритет специфичности.
  -- uq_checklist_templates_slot различает шаблоны по (direction, delivery_kind), поэтому
  -- общий (direction=null) и адресный (direction='erp') шаблоны ОДНОГО checklist_type
  -- сосуществуют легально. Оба матчатся ERP-внедрению, обе строки летят в один
  -- `unique (project_id, checklist_type)`, и `on conflict do nothing` оставлял бы
  -- произвольную — то есть адресный шаблон мог молча проиграть общему.
  -- Порядок: сначала тот, у кого больше непустых квалификаторов.
  insert into public.project_checklists (org_id, project_id, checklist_type, title, items)
  select distinct on (t.checklist_type)
         v_org, p_project_id, t.checklist_type, t.title,
         -- пункты шаблона превращаются в пункты экземпляра: + checked/checked_by/checked_at.
         -- `with ordinality` — порядок пунктов есть смысл (jsonb_agg его иначе не держит).
         (select coalesce(jsonb_agg(
                   x || jsonb_build_object('checked',    false,
                                           'checked_by', null,
                                           'checked_at', null)
                   order by ord), '[]'::jsonb)
            from jsonb_array_elements(t.items) with ordinality as e(x, ord))
  from public.checklist_templates t
  where t.org_id = v_org and t.is_active
    and (t.direction is null or t.direction = p_direction)
    and (t.delivery_kind is null or t.delivery_kind = p_kind)
  order by t.checklist_type,
           (t.direction is not null) desc,
           (t.delivery_kind is not null) desc,
           t.created_at desc            -- тай-брейк, чтобы выбор был детерминирован всегда
  on conflict (project_id, checklist_type) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Служебная: её зовёт только spawn_delivery_project (DEFINER от владельца).
-- Паттерн 056b — функции, которые зовут только другие функции, EXECUTE у authenticated
-- не получают. `from authenticated` обязателен: default ACL 082 даёт X новой функции.
revoke all on function public.instantiate_project_checklists(uuid, public.direction_t, text)
  from public, anon, authenticated;

comment on function public.instantiate_project_checklists(uuid, public.direction_t, text) is
  'R2-P1-G (084): развернуть активные шаблоны org в project_checklists нового внедрения. '
  'Служебная — EXECUTE только у владельца, зовётся из spawn_delivery_project. '
  'Отсутствие подходящих шаблонов — не ошибка, возвращает 0.';

-- ── spawn_delivery_project: тело ДОСЛОВНО из живой БД (pg_proc.prosrc = 073) плюс
--    одна строка вызова. Миграции неизменяемы — 073 не редактируется, функция
--    переписывается целиком через create or replace (сигнатура та же → GRANT'ы целы).
create or replace function public.spawn_delivery_project(
  p_deal_id uuid, p_kind text, p_template_id uuid default null::uuid, p_owner_id uuid default null::uuid
)
returns uuid
language plpgsql
security definer
set search_path to public, pg_temp
as $function$
declare
  v_deal        record;
  v_privileged  boolean;
  v_pipeline_id uuid;
  v_first_stage uuid;
  v_new_id      uuid;
  v_template_id uuid;
begin
  if p_kind not in ('launch','experiment') then
    raise exception 'invalid delivery_kind' using errcode = '22023';
  end if;

  select * into v_deal from public.projects
   where id = p_deal_id and org_id = public.current_org_id() and public.current_org_id() is not null;
  if v_deal.id is null then
    raise exception 'deal not found or access denied' using errcode = '42501';
  end if;
  if v_deal.type <> 'client' or v_deal.status <> 'won' then
    raise exception 'delivery can be spawned only from a won client deal' using errcode = 'P0001';
  end if;

  select exists(
    select 1 from public.memberships m
    where m.profile_id = auth.uid() and m.org_id = v_deal.org_id and m.role in ('owner','admin')
  ) into v_privileged;
  if not (v_deal.owner_id = auth.uid() or v_deal.created_by = auth.uid() or v_privileged) then
    raise exception 'only deal owner or org admin can spawn delivery' using errcode = '42501';
  end if;

  if p_owner_id is not null and not exists(
    select 1 from public.memberships m where m.profile_id = p_owner_id and m.org_id = v_deal.org_id
  ) then
    raise exception 'assigned owner is not a member of the org' using errcode = '42501';
  end if;

  select id into v_pipeline_id from public.pipelines
   where entity_type='project' and direction=v_deal.direction and is_default=true limit 1;
  if v_pipeline_id is null then
    raise exception 'no project pipeline for direction %', v_deal.direction using errcode='P0001';
  end if;
  select id into v_first_stage from public.pipeline_stages
   where pipeline_id=v_pipeline_id order by order_index limit 1;

  if p_template_id is not null then
    select id into v_template_id from public.delivery_templates
    where id = p_template_id and org_id = v_deal.org_id and is_active;
    if v_template_id is null then
      raise exception 'template not found' using errcode = '22023';
    end if;
  else
    select id into v_template_id from public.delivery_templates
    where org_id = v_deal.org_id and direction = v_deal.direction
      and kind = p_kind and is_active
    limit 1;
  end if;

  -- ← БЕЗ `stage`: колонка не существует (073). stage_id = v_first_stage, status = 'open'.
  insert into public.projects (
    org_id, owner_id, created_by, name, type, direction,
    pipeline_id, stage_id, status, company_id, contact_id, parent_deal_id, delivery_kind
  ) values (
    v_deal.org_id,
    coalesce(p_owner_id, v_deal.owner_id, auth.uid()),
    auth.uid(),
    v_deal.name || ' — внедрение', 'delivery', v_deal.direction,
    v_pipeline_id, v_first_stage, 'open',
    v_deal.company_id, v_deal.contact_id, p_deal_id, p_kind
  ) returning id into v_new_id;

  if v_template_id is not null then
    perform public.copy_delivery_template(v_new_id, v_template_id);
  end if;

  -- НОВОЕ (084): чеклисты sign-off. Отсутствие шаблонов — не ошибка спавна.
  perform public.instantiate_project_checklists(v_new_id, v_deal.direction, p_kind);

  return v_new_id;
end $function$;
