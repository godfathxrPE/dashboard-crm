-- ═══════════════════════════════════════════════════════════════════════════
-- 118 — S-LEAD-CORE-1: лид входит в граф активностей.
--
-- ⚠️ Идёт СТРОГО после 117 (там появляются `first_contacted_at`/`qualified_at`,
--    которые штампует триггер ниже).
--
-- ЧТО БЫЛО. Звонок по лиду до конверсии либо не фиксировался, либо создавался
-- «висячим»: у `calls`/`tasks` нет ссылки на лид, у `activity_log` — тоже.
-- История продажи начиналась только со сделки, время реакции и число касаний
-- до квалификации были невосстановимы. Лид не логировался нигде — даже удаление.
--
-- ЧТО СТАЛО. `lead_id` на трёх таблицах (042-паттерн: nullable FK + partial index),
-- штампы времени по смене статуса и две записи в журнал: смена статуса и удаление.
--
-- ⚠️ КАСКАДОВ СТАТУСА ИЗ ТРИГГЕРОВ ЗДЕСЬ НЕТ НАМЕРЕННО. Грабля проекта — два
--    пересекающихся триггера на смене стадии `projects` (`trg_sync_deal_stage_fields`
--    и `trg_sync_project_stage`, порядок алфавитный, второй выигрывает) — не
--    чинилась до сих пор. Статус лида меняет ТОЛЬКО клиент; триггеры штампуют
--    время и пишут журнал, ничего не решая за него. Авто-прогресс «залогирован
--    звонок → contacted» живёт в мутации клиента (use-calls.ts), и это видно.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ Entity-links ═══
-- ON DELETE у активностей — SET NULL: звонок пережил лид и остаётся историей
-- (после конверсии он уже привязан к контакту/компании/сделке — 119).
-- У журнала — CASCADE, как у остальных entity-links `activity_log`.

alter table public.calls
  add column lead_id uuid references public.leads(id) on delete set null;
alter table public.tasks
  add column lead_id uuid references public.leads(id) on delete set null;
alter table public.activity_log
  add column lead_id uuid references public.leads(id) on delete cascade;

create index idx_calls_lead        on public.calls(lead_id)        where lead_id is not null;
create index idx_tasks_lead        on public.tasks(lead_id)        where lead_id is not null;
create index idx_activity_log_lead on public.activity_log(lead_id) where lead_id is not null;

comment on column public.calls.lead_id is
  'Звонок по лиду до конверсии. После конверсии (119) НЕ зануляется — связь остаётся для аналитики «жизни до сделки»';

-- ═══ Штампы времени по смене статуса (образец — stamp_quote_status, 053) ═══
-- `first_contacted_at` — только на переходе new → contacted: возврат из
-- disqualified в contacted первое касание не переписывает.
-- Порядок BEFORE-триггеров алфавитный: trg_aa_freeze_org_id → trg_leads_updated_at
-- → trg_zz_stamp_lead_status. Штамп видит уже вычищенный org_id, конфликтов нет.

create or replace function public.stamp_lead_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'contacted' and old.status = 'new' and new.first_contacted_at is null then
    new.first_contacted_at := now();
  end if;
  if new.status = 'qualified' and new.qualified_at is null then
    new.qualified_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.stamp_lead_status() from public, anon, authenticated;

create trigger trg_zz_stamp_lead_status
  before update of status on public.leads
  for each row
  when (old.status is distinct from new.status)
  execute function public.stamp_lead_status();

-- ═══ Журнал смены статуса ═══
-- AFTER UPDATE, `return null` — возврат AFTER-триггера игнорируется (тот же приём,
-- что в log_stage_transition из 078). Актор — `auth.uid()`: смену делает человек
-- из UI, служебных путей смены статуса лида в проекте нет.

create or replace function public.log_lead_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.activity_log (org_id, lead_id, user_id, event_type, payload)
  values (
    new.org_id, new.id, auth.uid(), 'lead_status_changed',
    jsonb_build_object(
      'from', old.status,
      'to', new.status,
      'disqualify_reason', new.disqualify_reason,
      'title', new.title
    )
  );
  return null;
end;
$$;
revoke all on function public.log_lead_status_change() from public, anon, authenticated;

create trigger trg_zy_log_lead_status
  after update of status on public.leads
  for each row
  when (old.status is distinct from new.status)
  execute function public.log_lead_status_change();

-- ═══ Журнал удаления (образец — живое тело log_delete_call, 009/011) ═══
-- ⚠️ `lead_id` в эту запись НЕ пишется: FK выше — ON DELETE CASCADE, и запись
--    снесло бы тем же удалением. Журнал удаления у всех сущностей проекта живёт
--    без entity-link, сущность опознаётся по payload.
-- Ключи payload — `entity_type`/`entity_name`/`entity_id`, как у остальных
-- log_delete_*: их читает ENTITY_TYPE_LABEL в activity-events.ts.
-- `exception when others then return old` — из образца: журнал не имеет права
-- отменить удаление.

create or replace function public.log_delete_lead()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.activity_log (org_id, user_id, event_type, payload)
  values (
    coalesce(old.org_id, public.current_org_id()),
    coalesce(old.owner_id, old.user_id, auth.uid()),
    'entity_deleted',
    jsonb_build_object(
      'entity_type', 'leads',
      'entity_name', old.title,
      'entity_id', old.id,
      'status', old.status
    )
  );
  return old;
exception when others then return old;
end;
$$;
revoke all on function public.log_delete_lead() from public, anon, authenticated;

create trigger trg_log_delete_leads
  before delete on public.leads
  for each row
  execute function public.log_delete_lead();
