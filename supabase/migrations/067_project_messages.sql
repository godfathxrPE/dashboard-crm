-- S-CHAT-1: чат проекта — отдельный модуль (НЕ activity_log, граница locked).
-- Плоская лента сообщений команды + realtime. Hard delete (deleted_at-инфраструктуры
-- в проекте нет — консистентно; «сообщение удалено» — follow-up).
-- RLS: SELECT = зеркало projects_select + projects_select_member (065) — кто видит
-- проект, читает чат. INSERT — ВСЯ команда (participant), не только canManage,
-- и строго от своего имени (author_id = auth.uid() — подмена автора → 42501).
-- UPDATE — только свои (WITH CHECK не даёт переназначить автора).
-- DELETE — свои + модерация org owner/admin.

create table if not exists public.project_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  -- nullable + SET NULL: история чата переживает ушедшего автора
  author_id uuid references public.profiles(id) on delete set null default auth.uid(),
  body text not null check (length(body) between 1 and 4000),
  edited_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.project_messages enable row level security;

-- org_id проставляет триггер (клиент его НЕ передаёт) — паритет quotes 053 / 066.
create trigger trg_set_org_id before insert on public.project_messages
  for each row execute function public.set_org_id();

create index if not exists idx_project_messages_project on public.project_messages(project_id, created_at);
create index if not exists idx_project_messages_org on public.project_messages(org_id);
create index if not exists idx_project_messages_author on public.project_messages(author_id);

-- SELECT: зеркало видимости проекта (projects_select + projects_select_member, без manager)
create policy project_messages_select on public.project_messages
  for select to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.current_org_role()) in ('owner', 'admin')
      or exists (
        select 1 from public.projects p
        where p.id = project_id
          and (p.owner_id = (select auth.uid()) or p.created_by = (select auth.uid()))
      )
      or (select public.is_project_member(project_id))
    )
  );

-- INSERT: участник проекта пишет от своего имени (вся команда, НЕ только canManage)
create policy project_messages_insert on public.project_messages
  for insert to authenticated
  with check (
    org_id = (select public.current_org_id())
    and author_id = (select auth.uid())
    and (
      (select public.current_org_role()) in ('owner', 'admin')
      or exists (
        select 1 from public.projects p
        where p.id = project_id
          and (p.owner_id = (select auth.uid()) or p.created_by = (select auth.uid()))
      )
      or (select public.is_project_member(project_id))
    )
  );

-- UPDATE: правка только своих; WITH CHECK зеркалит USING — автора не переназначить
create policy project_messages_update on public.project_messages
  for update to authenticated
  using (
    org_id = (select public.current_org_id())
    and author_id = (select auth.uid())
  )
  with check (
    org_id = (select public.current_org_id())
    and author_id = (select auth.uid())
  );

-- DELETE: свои + модерация org owner/admin
create policy project_messages_delete on public.project_messages
  for delete to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      author_id = (select auth.uid())
      or (select public.current_org_role()) in ('owner', 'admin')
    )
  );

-- Realtime: чат live. RLS применяется и к realtime-событиям — участник получает
-- события только своих проектов, не всей org.
alter publication supabase_realtime add table public.project_messages;

grant select, insert, update, delete on public.project_messages to authenticated;
revoke all on public.project_messages from anon;
