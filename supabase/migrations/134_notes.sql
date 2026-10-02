-- ═══════════════════════════════════════════════════════════════════════════
-- 134 — S-NOTES-1: заметка становится сущностью (`public.notes`).
-- СТАТУС: НАПИСАНА, НЕ ПРИМЕНЕНА. НЕ ПРИМЕНЯТЬ из Claude Code — apply делает
-- гейт Cowork (apply_migration → gen-types → advisors → ролевые смоки).
--
-- ⚠️ НОМЕР СВЕРЕН ЗАПРОСОМ к `supabase_migrations.schema_migrations` (правило 4)
--    2026-10-02: последняя применённая — `20260926102002 cron_io_budget` (133) ⇒ 134.
--
-- ЧТО БЫЛО. Заметка — строка `activity_log` с `event_type='comment_added'`. У журнала
-- нет UPDATE-политики (select · insert own · delete own), и это правильно: аудит не
-- правят. Отсюда: заметку нельзя изменить, закрепить, удалить с отменой.
--
-- ЧТО СТАЛО. Отдельная таблица `notes` (тело — markdown), права на уровне колонок,
-- три RPC (закрепить / удалить / вернуть), перенос 78 заметок из журнала, мост для
-- старого клиента, `entity_timeline` читает `notes` (`kind='note'`) и принимает
-- `p_search`, `convert_lead` переносит заметки лида, `export_org_data` выгружает `notes`.
--
-- ⚠️ SOFT-DELETE ЗДЕСЬ — РЕШЕНИЕ ВЛАДЕЛЬЦА 02.10 (эпик S-NOTES), а не недосмотр.
--    Общее правило проекта «hard delete, `deleted_at` нет ни у одной таблицы» этим
--    спринтом сознательно нарушено ради «Вернуть»; `notes` — единственное исключение.
--    Физического DELETE нет (DELETE-политики и гранта нет).
--
-- ⚠️ FK по конвенции CLAUDE.md «Новая org-таблица» (правка гейта 02.10): `org_id` —
--    `on delete cascade`, `created_by` — nullable, `on delete set null` (как у quotes /
--    deal_stakeholders; `calls` старше конвенции). Родители заметки — `on delete cascade`, а НЕ
--    `set null`, как у `calls`: у `notes` есть check `notes_has_parent`, и `set null`
--    на последнем родителе уронил бы удаление сделки/лида ошибкой 23514.
--
-- ⚠️ ЧТЕНИЕ `notes` — ORG-WIDE, как у `calls` и `activity_log` сегодня: заметки журнала
--    и так читались всей организацией. Паритет, не регрессия. Сужение до видимости
--    сделки — отдельное решение, в этот спринт не входит.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ 1. Таблица ═══
create table if not exists public.notes (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizations(id) on delete cascade,
  project_id         uuid references public.projects(id)  on delete cascade,
  lead_id            uuid references public.leads(id)     on delete cascade,
  company_id         uuid references public.companies(id) on delete cascade,
  contact_id         uuid references public.contacts(id)  on delete cascade,
  body               text not null,
  kind               text not null default 'note',
  meta               jsonb not null default '{}'::jsonb,
  pinned_at          timestamptz,
  pinned_by          uuid references public.profiles(id) on delete set null,
  created_by         uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  updated_by         uuid references public.profiles(id) on delete set null,
  edited_at          timestamptz,
  deleted_at         timestamptz,
  legacy_activity_id uuid unique,
  constraint notes_has_parent check (num_nonnulls(project_id, lead_id, company_id, contact_id) >= 1),
  constraint notes_body_len   check (length(btrim(body)) between 1 and 20000),
  constraint notes_kind_check check (kind in ('note','stage_comment')),
  constraint notes_pin_pair   check ((pinned_at is null) = (pinned_by is null))
);

comment on table public.notes is
  'S-NOTES-1. Заметка на сделку/лид/компанию/контакт. Тело — markdown. Soft-delete (решение владельца 02.10). Закрепить/удалить/вернуть — только RPC set_note_pinned / soft_delete_note / restore_note.';
comment on column public.notes.kind is
  'note — обычная; stage_comment — комментарий перехода стадии (meta: from_stage_id, to_stage_id).';
comment on column public.notes.legacy_activity_id is
  'id строки activity_log (comment_added), из которой заметка перенесена/скопирована мостом. Ключ идемпотентности.';

-- ═══ 2. Индексы (частичные — удалённое в ленте не нужно) ═══
create index if not exists idx_notes_project_created on public.notes (project_id, created_at desc) where deleted_at is null;
create index if not exists idx_notes_lead_created    on public.notes (lead_id,    created_at desc) where deleted_at is null;
create index if not exists idx_notes_company_created on public.notes (company_id, created_at desc) where deleted_at is null;
create index if not exists idx_notes_contact_created on public.notes (contact_id, created_at desc) where deleted_at is null;
create index if not exists idx_notes_org_created     on public.notes (org_id,     created_at desc) where deleted_at is null;
create index if not exists idx_notes_created_by      on public.notes (created_by)                  where deleted_at is null;
create index if not exists idx_notes_project_pinned  on public.notes (project_id) where pinned_at is not null and deleted_at is null;

-- ═══ 3. Триггеры ═══
-- `notes_touch`: INVOKER. Автора и дату создания не подменить; edited_at — только при смене тела.
create or replace function public.notes_touch()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  -- Автора не переназначить. Обнуление разрешено: это FK-действие `on delete set null`
  -- при удалении профиля (правка гейта 02.10) — без этой ветки удаление профиля падало бы.
  if new.created_by is not null and new.created_by is distinct from old.created_by then
    new.created_by := old.created_by;
  end if;
  new.created_at := old.created_at;
  return new;
end;
$$;

revoke all on function public.notes_touch() from public, anon;

create trigger trg_set_org_id
  before insert on public.notes
  for each row execute function public.set_org_id();

-- Заморозка org_id — руками: автоцикл 054 покрывает только таблицы, бывшие на момент 054.
create trigger trg_aa_freeze_org_id
  before update of org_id on public.notes
  for each row
  when (old.org_id is distinct from new.org_id)
  execute function public.freeze_org_id();

create trigger set_updated_at
  before update on public.notes
  for each row execute function public.update_updated_at();

-- Алфавитный порядок BEFORE UPDATE: set_updated_at → trg_aa_freeze_org_id → trg_notes_touch.
create trigger trg_notes_touch
  before update on public.notes
  for each row execute function public.notes_touch();

-- ═══ 4. RLS ═══
alter table public.notes enable row level security;

-- читать: своя организация; удалённое видят только автор и owner/admin (для «Вернуть»)
create policy notes_select on public.notes for select to authenticated
  using ( org_id = (select current_org_id())
          and ( deleted_at is null
                or created_by = (select auth.uid())
                or (select current_org_role()) in ('owner','admin') ) );

-- создать: не viewer; автор = я; родитель — из моей организации (FK орг не проверяет).
-- `exists(...)` идёт под RLS вызывающего: чужая организация не видна, сослаться на неё нельзя.
create policy notes_insert on public.notes for insert to authenticated
  with check ( org_id = (select current_org_id())
               and (select current_org_role()) in ('owner','admin','manager')
               and created_by = (select auth.uid())
               and (project_id is null or exists (select 1 from public.projects  x where x.id = project_id))
               and (lead_id    is null or exists (select 1 from public.leads     x where x.id = lead_id))
               and (company_id is null or exists (select 1 from public.companies x where x.id = company_id))
               and (contact_id is null or exists (select 1 from public.contacts  x where x.id = contact_id)) );

-- править текст: автор-manager или owner/admin; удалённое не правится
create policy notes_update on public.notes for update to authenticated
  using ( org_id = (select current_org_id())
          and deleted_at is null
          and ( (select current_org_role()) in ('owner','admin')
                or ( created_by = (select auth.uid())
                     and (select current_org_role()) = 'manager' ) ) )
  with check ( org_id = (select current_org_id()) );
-- DELETE-политики нет: физического удаления нет.

-- ═══ 5. Права на уровне колонок — клиент пишет только содержимое ═══
-- pinned_*, deleted_at, created_by, org_id, updated_*, edited_at клиент не пишет вообще.
-- created_by/org_id при INSERT приходят из DEFAULT auth.uid() и триггера set_org_id.
revoke all on public.notes from anon, authenticated;
grant select on public.notes to authenticated;
grant insert (project_id, lead_id, company_id, contact_id, body, kind, meta)
  on public.notes to authenticated;
grant update (body) on public.notes to authenticated;
grant all on public.notes to service_role;

-- ═══ 6. Realtime ═══
alter publication supabase_realtime add table public.notes;

-- ═══ 7. RPC: закрепить / удалить / вернуть ═══
-- SECURITY DEFINER обходит RLS, поэтому организация и права проверяются ВНУТРИ.
-- `for update` по строке, скрытой RLS читающего (удалённая чужая), из DEFINER видна —
-- на RLS здесь не полагаться.

create or replace function public.set_note_pinned(p_note_id uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v        public.notes%rowtype;
  v_role   text := public.current_org_role();
  v_parent uuid;
begin
  select * into v from public.notes
   where id = p_note_id and org_id = public.current_org_id()
   for update;
  if not found then
    raise exception 'note not found' using errcode = 'P0002';
  end if;

  if v_role is null or v_role not in ('owner','admin','manager') then
    raise exception 'insufficient privilege' using errcode = '42501';
  end if;

  if v.deleted_at is not null then
    raise exception 'note not found' using errcode = 'P0002';
  end if;

  if p_pinned then
    if v.pinned_at is not null then
      return;  -- уже закреплена: no-op
    end if;

    v_parent := coalesce(v.project_id, v.lead_id, v.company_id, v.contact_id);
    -- Лимит 3 на основного родителя. Блокировка родителя сериализует два параллельных
    -- закрепления РАЗНЫХ заметок (for update держит только свою строку).
    perform pg_advisory_xact_lock(hashtextextended('notes_pin:' || v_parent::text, 0));

    if (select count(*) from public.notes x
         where x.org_id = v.org_id
           and x.id <> v.id
           and x.pinned_at is not null
           and x.deleted_at is null
           and coalesce(x.project_id, x.lead_id, x.company_id, x.contact_id) = v_parent) >= 3 then
      raise exception 'pin limit' using errcode = 'P0001', hint = 'notes_pin_limit';
    end if;

    update public.notes set pinned_at = now(), pinned_by = auth.uid() where id = v.id;
  else
    update public.notes set pinned_at = null, pinned_by = null where id = v.id;
  end if;
end;
$$;

create or replace function public.soft_delete_note(p_note_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v      public.notes%rowtype;
  v_role text := public.current_org_role();
begin
  select * into v from public.notes
   where id = p_note_id and org_id = public.current_org_id()
   for update;
  if not found then
    raise exception 'note not found' using errcode = 'P0002';
  end if;

  -- coalesce: при NULL-роли `not (null)` не сработал бы, и проверка молча пропустила бы вызов
  if not coalesce( v_role in ('owner','admin')
                   or (v_role = 'manager' and v.created_by = auth.uid()), false ) then
    raise exception 'insufficient privilege' using errcode = '42501';
  end if;

  if v.deleted_at is not null then
    return;  -- уже удалена: no-op
  end if;

  update public.notes
     set deleted_at = now(), pinned_at = null, pinned_by = null
   where id = v.id;
end;
$$;

create or replace function public.restore_note(p_note_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v      public.notes%rowtype;
  v_role text := public.current_org_role();
begin
  select * into v from public.notes
   where id = p_note_id and org_id = public.current_org_id()
   for update;
  if not found then
    raise exception 'note not found' using errcode = 'P0002';
  end if;

  -- coalesce: при NULL-роли `not (null)` не сработал бы, и проверка молча пропустила бы вызов
  if not coalesce( v_role in ('owner','admin')
                   or (v_role = 'manager' and v.created_by = auth.uid()), false ) then
    raise exception 'insufficient privilege' using errcode = '42501';
  end if;

  if v.deleted_at is null then
    return;  -- не удалена: no-op
  end if;

  update public.notes set deleted_at = null where id = v.id;
end;
$$;

revoke all on function public.set_note_pinned(uuid, boolean) from public, anon;
grant execute on function public.set_note_pinned(uuid, boolean) to authenticated;
revoke all on function public.soft_delete_note(uuid) from public, anon;
grant execute on function public.soft_delete_note(uuid) to authenticated;
revoke all on function public.restore_note(uuid) from public, anon;
grant execute on function public.restore_note(uuid) to authenticated;

-- ═══ 8. Перенос заметок из журнала (идемпотентно, строки журнала НЕ удаляются) ═══
-- Замер 02.10: 79 comment_added; одна без привязки остаётся только в журнале ⇒ 78 в notes
-- (из них 10 stage_comment). Максимум длины текста 2066 — check 20000 не упадёт.
insert into public.notes (org_id, project_id, lead_id, company_id, contact_id,
                          body, kind, meta, created_by, created_at, updated_at, legacy_activity_id)
select a.org_id, a.project_id, a.lead_id, a.company_id, a.contact_id,
       a.payload->>'text',
       case when a.payload ? 'to_stage_id' then 'stage_comment' else 'note' end,
       case when a.payload ? 'to_stage_id'
            then jsonb_strip_nulls(jsonb_build_object(
                   'from_stage_id', a.payload->'from_stage_id',
                   'to_stage_id',   a.payload->'to_stage_id'))
            else '{}'::jsonb end,
       a.user_id, a.created_at, a.created_at, a.id
from public.activity_log a
where a.event_type = 'comment_added'
  and btrim(coalesce(a.payload->>'text','')) <> ''
  and num_nonnulls(a.project_id, a.lead_id, a.company_id, a.contact_id) >= 1
  and a.user_id is not null
on conflict (legacy_activity_id) do nothing;
-- trg_notes_touch срабатывает только на UPDATE — перенос его не задевает.

-- ═══ 9. Мост: новые comment_added → notes ═══
-- УДАЛИТЬ В S-NOTES-2, после выката клиента, пишущего в notes. Страховка на окно
-- «миграция применена, старый клиент ещё в проде».
--
-- Триггер стоит на пути записи журнала, поэтому НЕ ДОЛЖЕН ронять INSERT: строка без
-- привязки, с пустым текстом или без профиля автора пропускается молча; слишком длинный
-- текст обрезается (check notes_body_len), а не теряется.
create or replace function public.notes_from_comment_added()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_text text := btrim(coalesce(new.payload->>'text', ''));
begin
  if v_text = ''
     or new.user_id is null
     or num_nonnulls(new.project_id, new.lead_id, new.company_id, new.contact_id) < 1
     or not exists (select 1 from public.profiles p where p.id = new.user_id) then
    return new;
  end if;

  insert into public.notes (org_id, project_id, lead_id, company_id, contact_id,
                            body, kind, meta, created_by, created_at, updated_at, legacy_activity_id)
  values (new.org_id, new.project_id, new.lead_id, new.company_id, new.contact_id,
          left(new.payload->>'text', 20000),
          case when new.payload ? 'to_stage_id' then 'stage_comment' else 'note' end,
          case when new.payload ? 'to_stage_id'
               then jsonb_strip_nulls(jsonb_build_object(
                      'from_stage_id', new.payload->'from_stage_id',
                      'to_stage_id',   new.payload->'to_stage_id'))
               else '{}'::jsonb end,
          new.user_id, new.created_at, new.created_at, new.id)
  on conflict (legacy_activity_id) do nothing;

  return new;
end;
$$;

revoke all on function public.notes_from_comment_added() from public, anon, authenticated;

create trigger trg_zz_notes_bridge
  after insert on public.activity_log
  for each row
  when (new.event_type = 'comment_added')
  execute function public.notes_from_comment_added();

-- ═══ 10. entity_timeline: источник `notes` (kind='note') и параметр `p_search` ═══
--
-- Тело — из 120 (совпадает с прод: md5 тела без комментариев сверен гейтом 02.10).
-- Новая сигнатура с ПОСЛЕДНИМ параметром `p_search text default null` ⇒ для Postgres это
-- ДРУГАЯ функция: `create or replace` оставил бы обе (PGRST203 на вызове без p_search).
-- Поэтому drop + create, ACL восстановлен как был (postgres, authenticated, service_role).
-- SECURITY INVOKER сохраняется — RLS `notes` работает сама.
--
-- Что поменялось в теле:
--   * `kind_types.note` убран, ветки `'note' = any(p_kinds)` в src_activity удалены;
--     `comment_added` из src_activity исключён (иначе дубли с notes);
--   * новый src_notes (прямые связи + проекты компании/контакта из scope_projects);
--   * p_search (>= 2 символов): ищут notes / calls / meetings / tasks; projects,
--     activity и ai_runs при заданном поиске не возвращают ничего.
drop function if exists public.entity_timeline(text, uuid, timestamptz, text, integer, text[]);

create function public.entity_timeline(
  p_entity_type text,
  p_entity_id uuid default null::uuid,
  p_before timestamp with time zone default null::timestamp with time zone,
  p_before_id text default null::text,
  p_limit integer default 50,
  p_kinds text[] default null::text[],
  p_search text default null::text
)
returns table(
  ts timestamp with time zone, id text, source text, kind text, actor_id uuid,
  ref_type text, ref_id uuid, parent_type text, parent_id uuid, payload jsonb
)
language sql
stable
set search_path to 'public', 'pg_temp'
as $function$
with n as (
  select least(greatest(coalesce(p_limit, 50), 1), 200) as v
),
q as (
  -- Поиск короче двух символов не ищет (как null). Экранирование % и _ — на клиенте
  -- (S-NOTES-3): здесь значение идёт в ilike как есть.
  select case when char_length(nullif(btrim(p_search), '')) >= 2 then btrim(p_search) end as v
),
kind_types as (
  -- `note` убран: заметки больше не срез журнала, их отдаёт src_notes (134).
  select array['stage_change','stage_changed'] as stage,
         array['entity_deleted']               as deleted
),
scope_projects as (
  select p.id from projects p
  where (p_entity_type = 'company' and p.company_id = p_entity_id)
     or (p_entity_type = 'contact' and p.contact_id = p_entity_id)
),
scope_children as (
  select c.id from calls c
   where (p_entity_type = 'project' and c.project_id = p_entity_id)
      or (p_entity_type = 'company' and c.company_id = p_entity_id)
      or (p_entity_type = 'contact' and c.contact_id = p_entity_id)
  union all
  select m.id from meetings m
   where (p_entity_type = 'project' and m.project_id = p_entity_id)
      or (p_entity_type = 'company' and m.company_id = p_entity_id)
      or (p_entity_type = 'contact' and m.contact_id = p_entity_id)
),
src_calls as (
  select c.date as ts,
         'call:' || c.id::text as id,
         'calls' as source, 'call' as kind,
         c.created_by as actor_id,
         'call' as ref_type, c.id as ref_id,
         -- ⚠️ порядок case и coalesce обязан совпадать; лид — последним (см. шапку)
         case when c.project_id is not null then 'project'
              when c.company_id is not null then 'company'
              when c.contact_id is not null then 'contact'
              when c.lead_id    is not null then 'lead' end as parent_type,
         coalesce(c.project_id, c.company_id, c.contact_id, c.lead_id) as parent_id,
         jsonb_build_object(
           'status', c.status, 'next_step', c.next_step, 'agreements', c.agreements
         ) as payload
  from calls c
  where (p_kinds is null or 'call' = any(p_kinds))
    and ( p_entity_type = 'org'
       or (p_entity_type = 'project' and c.project_id = p_entity_id)
       or (p_entity_type = 'company' and c.company_id = p_entity_id)
       or (p_entity_type = 'contact' and c.contact_id = p_entity_id)
       or (p_entity_type = 'lead'    and c.lead_id    = p_entity_id) )
    and ( (select v from q) is null
          or (coalesce(c.agreements, '') || ' ' || coalesce(c.next_step, ''))
               ilike '%' || (select v from q) || '%' )
    and (p_before is null or c.date <= p_before)
    and (p_before is null
         or (c.date, 'call:' || c.id::text) < (p_before, coalesce(p_before_id, 'zzzz')))
  order by c.date desc, ('call:' || c.id::text) desc
  limit (select v from n)
),
src_meetings as (
  -- `meetings.lead_id` НЕТ (118 не заводила) — ветка без изменений.
  select (m.date::timestamp at time zone 'UTC') as ts,
         'meeting:' || m.id::text as id,
         'meetings' as source, 'meeting' as kind,
         m.created_by as actor_id,
         'meeting' as ref_type, m.id as ref_id,
         case when m.project_id is not null then 'project'
              when m.company_id is not null then 'company'
              when m.contact_id is not null then 'contact' end as parent_type,
         coalesce(m.project_id, m.company_id, m.contact_id) as parent_id,
         jsonb_build_object(
           'title', m.title, 'next_step', m.next_step, 'notes', m.notes
         ) as payload
  from meetings m
  where (p_kinds is null or 'meeting' = any(p_kinds))
    and ( p_entity_type = 'org'
       or (p_entity_type = 'project' and m.project_id = p_entity_id)
       or (p_entity_type = 'company' and m.company_id = p_entity_id)
       or (p_entity_type = 'contact' and m.contact_id = p_entity_id) )
    and ( (select v from q) is null
          or (coalesce(m.title, '') || ' ' || coalesce(m.notes, '') || ' ' || coalesce(m.next_step, ''))
               ilike '%' || (select v from q) || '%' )
    and (p_before is null or (m.date::timestamp at time zone 'UTC') <= p_before)
    and (p_before is null
         or ((m.date::timestamp at time zone 'UTC'), 'meeting:' || m.id::text)
            < (p_before, coalesce(p_before_id, 'zzzz')))
  order by m.date desc, ('meeting:' || m.id::text) desc
  limit (select v from n)
),
src_tasks as (
  select coalesce(t.deadline, t.created_at) as ts,
         'task:' || t.id::text as id,
         'tasks' as source, 'task' as kind,
         t.created_by as actor_id,
         'task' as ref_type, t.id as ref_id,
         case when t.project_id is not null then 'project'
              when t.company_id is not null then 'company'
              when t.contact_id is not null then 'contact'
              when t.lead_id    is not null then 'lead' end as parent_type,
         coalesce(t.project_id, t.company_id, t.contact_id, t.lead_id) as parent_id,
         jsonb_build_object(
           'text', t.text, 'lane', t.lane,
           'deadline', t.deadline, 'created_at', t.created_at
         ) as payload
  from (
    -- ⚠️ `lead_id` обязан быть и в СПИСКЕ КОЛОНОК подзапроса: внешний select читает
    -- только то, что подзапрос отдал (иначе 42703 на `t.lead_id`).
    select t2.id, t2.text, t2.lane, t2.deadline, t2.created_at, t2.created_by,
           t2.project_id, t2.company_id, t2.contact_id, t2.lead_id
    from tasks t2
    where (p_kinds is null or 'task' = any(p_kinds))
      and ( p_entity_type = 'org'
         or (p_entity_type = 'project' and t2.project_id = p_entity_id)
         or (p_entity_type = 'company' and t2.company_id = p_entity_id)
         or (p_entity_type = 'contact' and t2.contact_id = p_entity_id)
         or (p_entity_type = 'lead'    and t2.lead_id    = p_entity_id) )
      and ( (select v from q) is null
            or t2.text ilike '%' || (select v from q) || '%' )
      and (p_before is null or coalesce(t2.deadline, t2.created_at) <= p_before)
      and (p_before is null
           or (coalesce(t2.deadline, t2.created_at), 'task:' || t2.id::text)
              < (p_before, coalesce(p_before_id, 'zzzz')))
    order by coalesce(t2.deadline, t2.created_at) desc, ('task:' || t2.id::text) desc
    limit (select v from n)
  ) t
),
src_projects as (
  -- `projects.lead_id` НЕТ: связь обратная — `leads.converted_deal_id`. Сделка,
  -- рождённая из лида, в его ленту не попадает намеренно (карточка даёт прямую
  -- ссылку «К сделке»), иначе пришлось бы тащить сюда ещё один источник.
  select p.created_at as ts,
         'project:' || p.id::text as id,
         'projects' as source, 'project' as kind,
         p.created_by as actor_id,
         'project' as ref_type, p.id as ref_id,
         'project' as parent_type, p.id as parent_id,
         jsonb_build_object('name', p.name, 'type', p.type) as payload
  from projects p
  where (p_kinds is null or 'project' = any(p_kinds))
    and (select v from q) is null
    and ( p_entity_type = 'org'
       or (p_entity_type = 'company' and p.company_id = p_entity_id)
       or (p_entity_type = 'contact' and p.contact_id = p_entity_id) )
    and (p_before is null or p.created_at <= p_before)
    and (p_before is null
         or (p.created_at, 'project:' || p.id::text)
            < (p_before, coalesce(p_before_id, 'zzzz')))
  order by p.created_at desc, ('project:' || p.id::text) desc
  limit (select v from n)
),
src_activity as (
  select a.created_at as ts,
         'activity:' || a.id::text as id,
         'activity_log' as source, 'activity' as kind,
         a.user_id as actor_id,
         null::text as ref_type, null::uuid as ref_id,
         case when a.project_id is not null then 'project'
              when a.company_id is not null then 'company'
              when a.contact_id is not null then 'contact'
              when a.lead_id    is not null then 'lead' end as parent_type,
         coalesce(a.project_id, a.company_id, a.contact_id, a.lead_id) as parent_id,
         jsonb_build_object('event_type', a.event_type, 'payload', a.payload) as payload
  from (
    -- ⚠️ `lead_id` добавлен в ОБЕ ветви union: списки колонок обязаны совпадать
    -- (иначе 42601), да и дедуп `union` считает строку целиком.
    ( select al.id, al.event_type, al.payload, al.created_at, al.user_id,
             al.project_id, al.company_id, al.contact_id, al.lead_id
      from activity_log al
      where ( p_kinds is null
           or 'activity' = any(p_kinds)
           or ('stage'   = any(p_kinds) and al.event_type = any((select stage   from kind_types)::text[]))
           or ('deleted' = any(p_kinds) and al.event_type = any((select deleted from kind_types)::text[])) )
        and al.event_type <> 'stage_transition_committed'
        and al.event_type <> 'comment_added'
        and (select v from q) is null
        and ( p_entity_type = 'org'
           or (p_entity_type = 'project' and al.project_id = p_entity_id)
           or (p_entity_type = 'company' and al.company_id = p_entity_id)
           or (p_entity_type = 'contact' and al.contact_id = p_entity_id)
           or (p_entity_type = 'lead'    and al.lead_id    = p_entity_id) )
        and (p_before is null or al.created_at <= p_before)
        and (p_before is null
             or (al.created_at, 'activity:' || al.id::text)
                < (p_before, coalesce(p_before_id, 'zzzz')))
      order by al.created_at desc, ('activity:' || al.id::text) desc
      limit (select v from n) )
    union
    ( select al.id, al.event_type, al.payload, al.created_at, al.user_id,
             al.project_id, al.company_id, al.contact_id, al.lead_id
      from activity_log al
      where ( p_kinds is null
           or 'activity' = any(p_kinds)
           or ('stage'   = any(p_kinds) and al.event_type = any((select stage   from kind_types)::text[]))
           or ('deleted' = any(p_kinds) and al.event_type = any((select deleted from kind_types)::text[])) )
        and p_entity_type in ('company', 'contact')
        and al.event_type <> 'stage_transition_committed'
        and al.event_type <> 'comment_added'
        and (select v from q) is null
        and al.project_id in (select id from scope_projects)
        and (p_before is null or al.created_at <= p_before)
        and (p_before is null
             or (al.created_at, 'activity:' || al.id::text)
                < (p_before, coalesce(p_before_id, 'zzzz')))
      order by al.created_at desc, ('activity:' || al.id::text) desc
      limit (select v from n) )
  ) a
),
src_ai as (
  -- `ai_runs.entity_type` знает project/company/contact — лида там нет и не заводим.
  select r.created_at as ts,
         'ai_run:' || r.id::text as id,
         'ai_runs' as source, 'ai_run' as kind,
         r.created_by as actor_id,
         'ai_run' as ref_type, r.id as ref_id,
         case when r.entity_type in ('project','company') then r.entity_type end as parent_type,
         case when r.entity_type in ('project','company') then r.entity_id end as parent_id,
         jsonb_build_object(
           'preset_key', r.preset_key, 'entity_type', r.entity_type, 'status', r.status
         ) as payload
  from (
    select u.id, u.preset_key, u.entity_type, u.entity_id, u.status, u.created_at, u.created_by
    from (
      ( select ar.id, ar.preset_key, ar.entity_type, ar.entity_id, ar.status,
               ar.created_at, ar.created_by
        from ai_runs ar
        where (p_kinds is null or 'ai_run' = any(p_kinds))
          and (select v from q) is null
          and ( p_entity_type = 'org'
             or ar.entity_id in (select id from scope_children) )
          and (p_before is null or ar.created_at <= p_before)
          and (p_before is null
               or (ar.created_at, 'ai_run:' || ar.id::text)
                  < (p_before, coalesce(p_before_id, 'zzzz')))
        order by ar.created_at desc, ('ai_run:' || ar.id::text) desc
        limit (select v from n) )
      union
      ( select ar.id, ar.preset_key, ar.entity_type, ar.entity_id, ar.status,
               ar.created_at, ar.created_by
        from ai_runs ar
        where (p_kinds is null or 'ai_run' = any(p_kinds))
          and (select v from q) is null
          and p_entity_type in ('project', 'company')
          and ar.entity_type = p_entity_type
          and ar.entity_id = p_entity_id
          and (p_before is null or ar.created_at <= p_before)
          and (p_before is null
               or (ar.created_at, 'ai_run:' || ar.id::text)
                  < (p_before, coalesce(p_before_id, 'zzzz')))
        order by ar.created_at desc, ('ai_run:' || ar.id::text) desc
        limit (select v from n) )
    ) u
    order by u.created_at desc, ('ai_run:' || u.id::text) desc
    limit (select v from n)
  ) r
),
src_notes as (
  -- 134: заметки — отдельный источник (`notes`), не срез журнала. RLS notes отрабатывает
  -- сама (функция INVOKER); удалённые в ленту не попадают ни для кого.
  select u.created_at as ts,
         'note:' || u.id::text as id,
         'notes' as source, 'note' as kind,
         u.created_by as actor_id,
         'note' as ref_type, u.id as ref_id,
         -- ⚠️ порядок case и coalesce обязан совпадать
         case when u.project_id is not null then 'project'
              when u.company_id is not null then 'company'
              when u.contact_id is not null then 'contact'
              when u.lead_id    is not null then 'lead' end as parent_type,
         coalesce(u.project_id, u.company_id, u.contact_id, u.lead_id) as parent_id,
         jsonb_build_object(
           'body', u.body, 'kind', u.kind, 'meta', u.meta,
           'pinned_at', u.pinned_at, 'edited_at', u.edited_at
         ) as payload
  from (
    ( select nt.id, nt.body, nt.kind, nt.meta, nt.pinned_at, nt.edited_at, nt.created_at,
             nt.created_by, nt.project_id, nt.company_id, nt.contact_id, nt.lead_id
      from notes nt
      where nt.deleted_at is null
        and (p_kinds is null or 'note' = any(p_kinds))
        and ( (select v from q) is null
              or nt.body ilike '%' || (select v from q) || '%' )
        and ( p_entity_type = 'org'
           or (p_entity_type = 'project' and nt.project_id = p_entity_id)
           or (p_entity_type = 'company' and nt.company_id = p_entity_id)
           or (p_entity_type = 'contact' and nt.contact_id = p_entity_id)
           or (p_entity_type = 'lead'    and nt.lead_id    = p_entity_id) )
        and (p_before is null or nt.created_at <= p_before)
        and (p_before is null
             or (nt.created_at, 'note:' || nt.id::text)
                < (p_before, coalesce(p_before_id, 'zzzz')))
      order by nt.created_at desc, ('note:' || nt.id::text) desc
      limit (select v from n) )
    union
    ( select nt.id, nt.body, nt.kind, nt.meta, nt.pinned_at, nt.edited_at, nt.created_at,
             nt.created_by, nt.project_id, nt.company_id, nt.contact_id, nt.lead_id
      from notes nt
      where nt.deleted_at is null
        and (p_kinds is null or 'note' = any(p_kinds))
        and ( (select v from q) is null
              or nt.body ilike '%' || (select v from q) || '%' )
        and p_entity_type in ('company', 'contact')
        and nt.project_id in (select id from scope_projects)
        and (p_before is null or nt.created_at <= p_before)
        and (p_before is null
             or (nt.created_at, 'note:' || nt.id::text)
                < (p_before, coalesce(p_before_id, 'zzzz')))
      order by nt.created_at desc, ('note:' || nt.id::text) desc
      limit (select v from n) )
  ) u
)
select all_src.ts, all_src.id, all_src.source, all_src.kind,
       all_src.actor_id, all_src.ref_type, all_src.ref_id,
       all_src.parent_type, all_src.parent_id, all_src.payload
from (
  select * from src_calls
  union all select * from src_meetings
  union all select * from src_tasks
  union all select * from src_projects
  union all select * from src_activity
  union all select * from src_ai
  union all select * from src_notes
) all_src
where p_before is null
   or (all_src.ts, all_src.id) < (p_before, coalesce(p_before_id, 'zzzz'))
order by all_src.ts desc, all_src.id desc
limit (select v from n);
$function$;

revoke all on function public.entity_timeline(text, uuid, timestamptz, text, integer, text[], text) from public, anon;
grant execute on function public.entity_timeline(text, uuid, timestamptz, text, integer, text[], text) to authenticated, service_role;

comment on function public.entity_timeline(text, uuid, timestamptz, text, integer, text[], text) is
$c$Единая лента событий. p_entity_type: project | company | contact | lead | org.
Источники: calls, meetings, tasks, projects, activity_log, ai_runs, notes (134) — но для 'lead'
работают только четыре (calls / tasks / activity_log / notes): колонки lead_id у meetings,
projects и ai_runs нет.
Заметки (kind='note') — из таблицы notes; activity_log.comment_added в ленту НЕ попадает.
p_search (>= 2 символов, ilike; % и _ экранирует клиент): ищут notes, calls, meetings, tasks;
projects/activity/ai_runs при заданном поиске молчат.
Границу организации держит RLS источников — второго предиката в теле нет намеренно
(функция SECURITY INVOKER с 112).
parent_type='lead' возможен только у событий НЕконвертированного лида: convert_lead
проставляет звонку/задаче/заметке project_id, а он в case стоит раньше лида.
Пагинация — keyset по паре (ts, id), дно = неполная страница.$c$;

-- ═══ 11. convert_lead: перенос заметок лида ═══
-- Тело — из 123 (совпадает с прод), одна вставка после блока `UPDATE public.tasks`.
-- Сигнатура та же ⇒ `create or replace`, ACL сохраняется.
create or replace function public.convert_lead(
  p_lead_id uuid,
  p_company_name text default null,
  p_contact_first_name text default null,
  p_contact_last_name text default null,
  p_contact_phone text default null,
  p_contact_email text default null,
  p_direction text default 'iiot',
  p_deal_title text default null,
  p_deal_amount numeric default null,
  p_company_id uuid default null,
  p_contact_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_lead public.leads%rowtype;
  v_user_id uuid;
  v_company_id uuid;
  v_contact_id uuid;
  v_deal_id uuid;
  v_pipeline_id uuid;
  v_first_stage_id uuid;
  v_lead_title text;
  v_note text;
  v_budget_label text;   -- 123
BEGIN
  -- S25 гард (119: зеркало leads_update после переезда ownership на owner_id).
  IF NOT EXISTS (
    SELECT 1 FROM public.leads
    WHERE id = p_lead_id
      AND org_id = public.current_org_id()
      AND (
        public.current_org_role() IN ('owner','admin')
        OR owner_id = auth.uid()
        OR user_id  = auth.uid()
      )
  ) THEN
    RAISE EXCEPTION 'lead not found or access denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_lead
  FROM leads WHERE id = p_lead_id AND status = 'qualified';

  IF v_lead.id IS NULL THEN
    RAISE EXCEPTION 'Lead not found or not in qualified status';
  END IF;

  v_user_id := COALESCE(v_lead.owner_id, v_lead.user_id);
  v_lead_title := v_lead.title;

  -- 1. Компания
  --
  -- Гейт S-LEAD-CARRY-1: org-предикат добавлен вместе с 123-A. До 123 эти два
  -- поиска проверяли только владение, и цена была ограничена кривой ссылкой в
  -- projects.company_id; с 123-A по найденной компании идёт ЗАПИСЬ профиля.
  -- `v_lead.org_id`, не `current_org_id()`: в service-контексте helper = NULL и
  -- предикат стал бы немым (урок 024).
  IF p_company_id IS NOT NULL THEN
    SELECT id INTO v_company_id FROM companies
      WHERE id = p_company_id
        AND org_id = v_lead.org_id
        AND (owner_id = v_user_id OR created_by = v_user_id);
    IF v_company_id IS NULL THEN
      RAISE EXCEPTION 'Company not found or not owned by lead owner';
    END IF;
  ELSE
    IF p_company_name IS NULL OR btrim(p_company_name) = '' THEN
      RAISE EXCEPTION 'Either p_company_id or p_company_name is required';
    END IF;
    INSERT INTO companies (owner_id, created_by, name)
    VALUES (v_user_id, v_user_id, p_company_name)
    RETURNING id INTO v_company_id;
  END IF;

  -- ═══ 123-A: маркировочный профиль лида → компания ═══
  -- Стоит СРАЗУ после блока 1 (v_company_id уже определён) и до создания сделки:
  -- профиль компании не должен зависеть от того, чем кончится вставка сделки.
  --
  -- `AND c.chz_groups IS NULL` — заполняем только пустое. Компания, у которой
  -- профиль уже подтверждён, конверсией НЕ перезаписывается: автослияние массивов
  -- молча смешало бы профили двух разных лидов. Расхождение вместо этого остаётся
  -- видимым человеку — `pinned_note` сделки всегда несёт строку «ЧЗ-группы: …»
  -- с тем, что сказал ЭТОТ лид.
  --
  -- Пустой массив у лида сюда не едет: '{}' — это «выяснили, что групп нет» у ЛИДА,
  -- а не подтверждение профиля по КОМПАНИИ.
  IF v_lead.chz_groups IS NOT NULL AND array_length(v_lead.chz_groups, 1) > 0 THEN
    UPDATE public.companies c
       SET chz_groups = v_lead.chz_groups
     WHERE c.id = v_company_id
       AND c.chz_groups IS NULL;
  END IF;

  -- 2. Контакт
  IF p_contact_id IS NOT NULL THEN
    SELECT id INTO v_contact_id FROM contacts
      WHERE id = p_contact_id
        AND org_id = v_lead.org_id
        AND (owner_id = v_user_id OR created_by = v_user_id);
    IF v_contact_id IS NULL THEN
      RAISE EXCEPTION 'Contact not found or not owned by lead owner';
    END IF;
  ELSE
    IF p_contact_first_name IS NULL OR btrim(p_contact_first_name) = '' THEN
      RAISE EXCEPTION 'Either p_contact_id or p_contact_first_name is required';
    END IF;
    INSERT INTO contacts (owner_id, created_by, first_name, last_name, phone, email)
    VALUES (v_user_id, v_user_id, p_contact_first_name, p_contact_last_name, p_contact_phone, p_contact_email)
    RETURNING id INTO v_contact_id;
  END IF;

  -- 3. Связь контакт—компания (идемпотентно)
  INSERT INTO contact_company (contact_id, company_id)
  SELECT v_contact_id, v_company_id
  WHERE NOT EXISTS (
    SELECT 1 FROM contact_company
    WHERE contact_id = v_contact_id AND company_id = v_company_id
  );

  -- 4. Pipeline + первая стадия
  SELECT id INTO v_pipeline_id FROM pipelines
    WHERE direction = p_direction::direction_t AND entity_type = 'deal' AND is_default = true
    LIMIT 1;

  SELECT id INTO v_first_stage_id FROM pipeline_stages
    WHERE pipeline_id = v_pipeline_id
    ORDER BY order_index
    LIMIT 1;

  -- 5. Сделка
  INSERT INTO projects (
    owner_id, created_by, name, direction, pipeline_id, stage_id,
    company_id, contact_id, budget
  )
  VALUES (
    v_user_id,
    v_user_id,
    COALESCE(p_deal_title, v_lead_title),
    p_direction::direction_t,
    v_pipeline_id,
    v_first_stage_id,
    v_company_id,
    v_contact_id,
    p_deal_amount
  )
  RETURNING id INTO v_deal_id;

  -- ═══ 123-B: контакт лида → карта стейкхолдеров сделки ═══
  -- Строка создаётся ВСЕГДА, даже когда роль не выяснена: контакт, с которым вели
  -- лид, — уже участник решения, а `role IS NULL` карта рендерит честной подписью
  -- «роль не указана» (STAKEHOLDER_ROLE_EMPTY_LABEL). Пустая карта у только что
  -- созданной сделки — потеря знания, а не чистота.
  --
  -- `org_id` ЯВНО из строки лида, не из `current_org_id()`: функция SECURITY DEFINER
  -- и обязана работать в service-контексте, где `auth.uid()` = NULL и helper вернёт
  -- NULL (учебный инцидент 024). Триггер `trg_set_org_id` явное значение переживает —
  -- `set_org_id()` пишет только при NULL (проверено разведкой).
  --
  -- ON CONFLICT — по `deal_stakeholders_uniq(project_id, contact_id)`. У свежей
  -- сделки конфликта быть не может; строка стоит ради идемпотентности повторного
  -- вызова.
  INSERT INTO public.deal_stakeholders (org_id, project_id, contact_id, role)
  VALUES (v_lead.org_id, v_deal_id, v_contact_id, v_lead.decision_role)
  ON CONFLICT (project_id, contact_id) DO NOTHING;

  -- 119: перенос истории лида на созданные сущности
  UPDATE public.calls c
     SET contact_id = COALESCE(c.contact_id, v_contact_id),
         company_id = COALESCE(c.company_id, v_company_id),
         project_id = COALESCE(c.project_id, v_deal_id)
   WHERE c.lead_id = p_lead_id;

  UPDATE public.tasks t
     SET project_id = COALESCE(t.project_id, v_deal_id),
         company_id = COALESCE(t.company_id, v_company_id),
         contact_id = COALESCE(t.contact_id, v_contact_id)
   WHERE t.lead_id = p_lead_id;

  -- 134 (S-NOTES-1): заметки лида переезжают на созданные сущности — как звонки и задачи.
  -- UPDATE из SECURITY DEFINER идёт мимо column-grant'ов клиента — это и нужно.
  -- trg_notes_touch edited_at не ставит: body не меняется. `pinned_note` сделки НЕ трогаем
  -- (S-NOTES-2).
  UPDATE public.notes n
     SET project_id = COALESCE(n.project_id, v_deal_id),
         company_id = COALESCE(n.company_id, v_company_id),
         contact_id = COALESCE(n.contact_id, v_contact_id)
   WHERE n.lead_id = p_lead_id;

  -- 119 + ═══ 123-C ═══: квалификация лида → закреплённая заметка сделки
  --
  -- Ярлыки бюджета — зеркало `LEAD_BUDGET_STATUS_CONFIG`
  -- (`src/lib/validators/lead.ts`). Дубль осознанный и того же класса, что
  -- зеркало chz-groups клиент↔edge: SQL не читает модули TS. Меняешь ярлык в
  -- конфиге — меняй здесь.
  --
  -- `unknown` не пишется намеренно: «бюджет не выяснен» — это отсутствие знания,
  -- а строка о нём в закреплённой заметке создаёт вид, что вопрос закрыт.
  v_budget_label := CASE v_lead.budget_status
    WHEN 'none'      THEN 'Нет бюджета'
    WHEN 'estimated' THEN 'Оценён'
    WHEN 'confirmed' THEN 'Подтверждён'
    ELSE NULL
  END;

  v_note := concat_ws(e'\n',
    nullif('Боль: ' || v_lead.pain, 'Боль: '),
    CASE WHEN v_budget_label IS NOT NULL
         THEN 'Бюджет: ' || v_budget_label END,
    CASE WHEN v_lead.chz_groups IS NOT NULL AND array_length(v_lead.chz_groups, 1) > 0
         THEN 'ЧЗ-группы: ' || array_to_string(v_lead.chz_groups, ', ') END,
    CASE WHEN v_lead.regulatory_deadline IS NOT NULL
         THEN 'Дедлайн маркировки: ' || to_char(v_lead.regulatory_deadline, 'DD.MM.YYYY') END
  );

  IF v_note IS NOT NULL AND v_note <> '' THEN
    UPDATE public.projects p
       SET pinned_note = v_note
     WHERE p.id = v_deal_id
       AND (p.pinned_note IS NULL OR p.pinned_note = '');
  END IF;

  -- 6. Обновляем лид
  UPDATE leads SET
    status = 'converted',
    direction = p_direction,
    converted_deal_id = v_deal_id,
    converted_company_id = v_company_id,
    converted_contact_id = v_contact_id,
    converted_at = now()
  WHERE id = p_lead_id;

  RETURN jsonb_build_object(
    'company_id', v_company_id,
    'contact_id', v_contact_id,
    'deal_id', v_deal_id
  );
END $function$;

-- ═══ 12. export_org_data: + `notes` ═══
-- Тело — из 126 (совпадает с прод), в массив добавлено 'notes' рядом с 'activity_log'.
-- Парный список — EXPORT_TABLES в src/lib/domain/org-export.ts (сверяет тест).
-- SECURITY INVOKER: удалённые заметки выгрузка отдаёт тем, кому их показывает RLS.
create or replace function public.export_org_data(p_org_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_table  text;
  v_rows   jsonb;
  v_tables text[] := array[
    'companies','contacts','contact_company','leads','deal_stakeholders',
    'projects','project_members','project_columns','project_checklists',
    'project_baselines','baseline_tasks',
    'tasks','task_dependencies','recurring_task_templates',
    'calls','scheduled_calls','meetings','transcripts','quotes',
    'stage_transitions','stage_requirements','segments',
    'conversations','conversation_members','messages','message_reactions',
    'kpi_entries','call_tracker_days','activity_log','notes',
    'delivery_templates','delivery_template_phases','delivery_template_tasks',
    'checklist_templates','automation_rules'
  ];
begin
  -- Членство проверяем явно: RLS не даст чужие строки, но без этой проверки
  -- посторонний получил бы объект с пустыми массивами вместо честной ошибки.
  if not exists (
    select 1 from memberships m
    where m.org_id = p_org_id and m.profile_id = ( select auth.uid() )
  ) then
    raise exception 'not a member of organization %', p_org_id
      using errcode = '42501';
  end if;

  foreach v_table in array v_tables loop
    -- Таблица берётся из массива-литерала выше, не из аргумента функции —
    -- пользовательский ввод в идентификатор не попадает.
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from (
         select * from public.%I where org_id = $1 limit 50000
       ) t', v_table)
    into v_rows using p_org_id;
    v_result := v_result || jsonb_build_object(v_table, v_rows);
  end loop;

  return jsonb_build_object(
    'meta', jsonb_build_object(
      'org_id',      p_org_id,
      'exported_at', now(),
      'exported_by', ( select auth.uid() ),
      'format',      'dashboard-crm/org-export@1',
      'tables',      to_jsonb(v_tables)
    ),
    -- Состав организации — отдельным ключом, а не таблицей в `data`:
    -- `memberships` целиком (с id строки) для переноса бесполезна, нужна пара
    -- «кто — в какой роли».
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('profile_id', m.profile_id, 'role', m.role))
      from memberships m where m.org_id = p_org_id
    ), '[]'::jsonb),
    'data', v_result
  );
end;
$$;

-- ═══ Проверки для гейта (после apply; в файле — закомментированы) ═══
-- 1. select count(*) from public.notes;                          -- 78
--    select count(*) from public.notes where kind = 'stage_comment';  -- 10
-- 2. Повторный прогон переноса (блок 8) → 0 новых строк.
-- 3. entity_timeline('project', <АНФИШ>): заметки kind='note', comment_added — ни одного;
--    p_kinds=['note'] — только заметки; p_search='палета' — заметка 02.10, поля/AI не приходят.
-- 4. Ролевые смоки: см. «ПРИЁМКА» в _analysis/sprint-S-NOTES-1.md.
