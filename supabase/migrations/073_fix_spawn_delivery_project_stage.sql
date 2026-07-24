-- 073_fix_spawn_delivery_project_stage.sql
-- ФИКС прод-бага: «Создать внедрение» падал с
--   column "stage" of relation "projects" does not exist
-- Причина: spawn_delivery_project() в INSERT перечисляла колонку `stage` (значение NULL),
-- которой у projects нет — есть только `stage_id` (→ pipeline_stages). Дрейф: когда-то
-- projects.stage был текстом, схема ушла на stage_id, функцию не поправили → спавн падал всегда.
-- ЛЕЧЕНИЕ: убрать `stage` (и её NULL) из INSERT. stage_id уже выставляется (v_first_stage).
-- Тело функции в остальном байт-в-байт как в проде (SECURITY DEFINER, search_path, все гарды).
-- create or replace сохраняет существующие GRANT (сигнатура не меняется).
--
-- КОНТРАКТ: коммитится из CC, применяет гейт Cowork (apply_migration).

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

  -- ← БЕЗ `stage`: колонка не существует. stage_id = v_first_stage, status = 'open'.
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

  return v_new_id;
end $function$;
