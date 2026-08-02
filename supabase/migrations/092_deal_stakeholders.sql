-- ═══════════════════════════════════════════════════════
-- 092 — deal_stakeholders: карта участников сделки со стороны клиента (S-R2-D3).
--
-- Аналог OpportunityContactRole (Salesforce) / association labels (HubSpot):
-- junction projects↔contacts с ролью в СДЕЛКЕ (не должностью — должность живёт в
-- contacts.position, а contact_company.role оказался её свободнотекстовым дублем).
--
-- Основной контакт НЕ дублируется флагом `is_primary`: primary = строка, где
-- contact_id = projects.contact_id. Второго источника истины нет, синхронизирующего
-- триггера нет намеренно — любой UPDATE public.projects будит trg_zz_run_automations
-- и цепочку BEFORE-синков стадии, и «добавил контакт → прогнал движок автоматизаций»
-- было бы побочным эффектом. Урок companies.phone ↔ phones[]: инвариант, который
-- держит только клиент, не держится.
--
-- Бэкфилла из projects.contact_id НЕТ: primary вычисляется, дублировать нечего.
--
-- ⚠️ НЕ применена — применяет гейт (apply → advisors → ролевые смоки → gen-types).
--
-- Откат:
--   drop table public.deal_stakeholders cascade;
--   alter publication supabase_realtime drop table public.deal_stakeholders;
-- ═══════════════════════════════════════════════════════

create table if not exists public.deal_stakeholders (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  project_id  uuid not null references public.projects(id)      on delete cascade,
  contact_id  uuid not null references public.contacts(id)      on delete cascade,
  -- nullable намеренно: контакт попадает в карту раньше, чем понятна его роль.
  -- Обязательный выбор при добавлении даёт 60% `decision_maker` по умолчанию.
  role        text,
  note        text,
  -- profiles, НЕ auth.users — конвенция проекта (FK на auth.users ломает каскады).
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint deal_stakeholders_role_chk check (
    role is null or role in
      ('decision_maker','economic_buyer','champion','expert','end_user','blocker')
  ),
  constraint deal_stakeholders_note_chk check (note is null or char_length(note) <= 500),
  -- Hard delete + unique: soft-delete породил бы «невидимые» строки, ломающие эту пару.
  constraint deal_stakeholders_uniq unique (project_id, contact_id)
);

create index if not exists idx_deal_stakeholders_project on public.deal_stakeholders(project_id);
create index if not exists idx_deal_stakeholders_contact on public.deal_stakeholders(contact_id);
create index if not exists idx_deal_stakeholders_org     on public.deal_stakeholders(org_id);

-- ═══ Триггеры ═══
-- org_id клиент не передаёт (RelaxOrgId в types/database.ts) — ставит set_org_id,
-- как в project_members (037) / project_messages (067). Имена функций сверены с
-- baseline: set_org_id / freeze_org_id / update_updated_at (`set_updated_at` в схеме НЕТ).
--
-- Заморозка org_id — руками: автоцикл 054 покрыл только таблицы, существовавшие на его
-- момент. Префикс `aa_` не косметика — порядок триггеров в Postgres алфавитный.
drop trigger if exists trg_set_org_id on public.deal_stakeholders;
create trigger trg_set_org_id
  before insert on public.deal_stakeholders
  for each row execute function public.set_org_id();

drop trigger if exists trg_aa_freeze_org_id on public.deal_stakeholders;
create trigger trg_aa_freeze_org_id
  before update of org_id on public.deal_stakeholders
  for each row
  when (old.org_id is distinct from new.org_id)
  execute function public.freeze_org_id();

drop trigger if exists trg_set_updated_at on public.deal_stakeholders;
create trigger trg_set_updated_at
  before update on public.deal_stakeholders
  for each row execute function public.update_updated_at();

-- ═══ RLS ═══
-- org-first; current_org_*() строго в обёртке ( select … ) — initplan-оптимизация,
-- иначе функция вычисляется построчно (advisor WARN).
-- Раздельные политики на операцию, не FOR ALL (урок 036b: FOR ALL дублирует SELECT).
--
-- Матрица: read — все члены org; insert/update/delete — owner/admin/manager.
-- manager получает и DELETE (шире, чем cc_delete у contact_company) — намеренно:
-- асимметрия «добавить может, убрать не может» гарантирует мусор в карте, а риск от
-- удаления ссылки нулевой (контакт и сделка остаются).
alter table public.deal_stakeholders enable row level security;

create policy ds_select on public.deal_stakeholders for select to authenticated
  using ( org_id = ( select public.current_org_id() ) );

create policy ds_insert on public.deal_stakeholders for insert to authenticated
  with check (
    org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin','manager')
  );

-- WITH CHECK повторяет USING — урок 054: без него строку можно перенести в чужую org
-- (org_id прикрыт ещё и trg_aa_freeze_org_id) или в проект чужого тенанта.
create policy ds_update on public.deal_stakeholders for update to authenticated
  using (
    org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin','manager')
  )
  with check (
    org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin','manager')
  );

create policy ds_delete on public.deal_stakeholders for delete to authenticated
  using (
    org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin','manager')
  );

-- ═══ Гранты ═══
-- `revoke truncate, references, trigger` НЕ пишем: 082 сузил дефолтные привилегии
-- postgres в public в корне (authenticated = arwd), новая таблица приходит ровно с
-- нужным набором. `revoke ... from anon` остаётся: default ACL роли supabase_admin
-- всё ещё раздаёт anon полный набор. `grant` выписан явно — миграция должна читаться
-- как самодостаточное описание прав, а не как «доверься 082».
revoke all on public.deal_stakeholders from anon;

grant select, insert, update, delete on public.deal_stakeholders to authenticated;  -- поверх RLS

-- ═══ Realtime ═══
-- Guard как в 068: голый `alter publication … add table` падает на повторном apply.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'deal_stakeholders'
  ) then
    alter publication supabase_realtime add table public.deal_stakeholders;
  end if;
end $$;

comment on table public.deal_stakeholders is
  'Карта стейкхолдеров сделки (S-R2-D3, 092): junction projects↔contacts с ролью в сделке. '
  'Роль — закрытый MEDDIC-словарь (decision_maker/economic_buyer/champion/expert/end_user/'
  'blocker), nullable. Основной контакт НЕ помечается флагом: primary — строка, где '
  'contact_id = projects.contact_id; синхронизирующего триггера на projects нет намеренно '
  '(разбудил бы trg_zz_run_automations). Hard delete, бэкфилла нет.';

comment on column public.deal_stakeholders.role is
  'Роль в СДЕЛКЕ, не должность (должность — contacts.position). NULL = роль ещё не понята.';
