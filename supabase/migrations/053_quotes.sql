-- 053: quotes — КП на сделке (S-QUOTE-1).
-- Hard-delete через CASCADE (soft-delete в проекте нет ни у одной таблицы).
-- Аддитивно: новая таблица/enum/триггеры/RLS. Существующее не трогаем.

create type public.quote_status as enum ('draft','sent','accepted','rejected','expired');

create table public.quotes (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  project_id   uuid not null references public.projects(id) on delete cascade,   -- сделка (client)
  status       public.quote_status not null default 'draft',
  amount       bigint check (amount is null or amount >= 0),   -- КОПЕЙКИ (как projects.budget)
  currency     text not null default 'RUB',
  document_url text,                                           -- ссылка на HTML/PDF из kp-master
  notes        text,
  valid_until  date,
  sent_at      timestamptz,
  accepted_at  timestamptz,
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_quotes_org     on public.quotes(org_id);
create index idx_quotes_project on public.quotes(project_id);
create index idx_quotes_status  on public.quotes(status);

-- W4: не более одной accepted-квоты на сделку (accept-flow однозначен: чтобы
-- принять другую — сначала отклонить текущую; второй accept упадёт по этому индексу).
create unique index quotes_one_accepted_per_project
  on public.quotes(project_id) where status = 'accepted';

-- org_id автозаполнение (паттерн tenant-таблиц; функция public.set_org_id() — baseline)
create trigger trg_set_org_id before insert on public.quotes
  for each row execute function public.set_org_id();
-- updated_at (общий триггер проекта public.update_updated_at() — baseline)
create trigger set_updated_at before update on public.quotes
  for each row execute function public.update_updated_at();

-- Стемпинг sent_at/accepted_at при смене статуса (DB enforcement > UI).
-- W5: ловим и INSERT сразу со status='sent'|'accepted' (не только UPDATE).
-- На INSERT old = NULL → обращение к old.status под guard TG_OP='INSERT' (short-circuit OR).
create or replace function public.stamp_quote_status()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    if new.status = 'sent'     and new.sent_at     is null then new.sent_at     := now(); end if;
    if new.status = 'accepted' and new.accepted_at is null then new.accepted_at := now(); end if;
  end if;
  return new;
end $$;
revoke all on function public.stamp_quote_status() from public, anon;
grant execute on function public.stamp_quote_status() to authenticated, service_role;
create trigger trg_zz_stamp_quote_status
  before insert or update of status on public.quotes
  for each row execute function public.stamp_quote_status();

-- RLS: SELECT org-wide; INSERT/UPDATE/DELETE — owner/admin/manager (паттерн 048).
alter table public.quotes enable row level security;
create policy quotes_select on public.quotes for select
  using ( org_id = ( select public.current_org_id() ) );
create policy quotes_insert on public.quotes for insert
  with check ( org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin','manager') );
create policy quotes_update on public.quotes for update
  using ( org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin','manager') );
create policy quotes_delete on public.quotes for delete
  using ( org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin','manager') );

grant select, insert, update, delete on public.quotes to authenticated;
revoke all on public.quotes from anon;
