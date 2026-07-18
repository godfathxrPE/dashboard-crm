-- S-VIDEO-EMBED-1: видео-материалы проекта (embed YouTube/VK/Rutube, прочее — ссылкой).
-- Таблица project_videos: url + stored provider (только для badge — embed на рендере
-- строится из parseVideoUrl(url), stored provider НЕ доверяем).
-- RLS SELECT = ЗЕРКАЛО projects_select + projects_select_member (065):
-- org AND (owner/admin OR project ownership OR is_project_member). БЕЗ manager —
-- иначе видео виднее самого проекта. INSERT/DELETE = canManage (owner/admin OR ownership).
-- NO UPDATE-политики — редактирование не предусмотрено (удалить и добавить заново).

create table if not exists public.project_videos (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  url text not null check (length(url) between 1 and 2048),
  provider text not null check (provider in ('youtube', 'vk', 'rutube', 'other')),
  title text,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.project_videos enable row level security;

-- org_id проставляет триггер (клиент его НЕ передаёт) — паритет quotes 053.
create trigger trg_set_org_id before insert on public.project_videos
  for each row execute function public.set_org_id();

create index if not exists idx_project_videos_project on public.project_videos(project_id, sort_order);
create index if not exists idx_project_videos_org on public.project_videos(org_id);
create index if not exists idx_project_videos_created_by on public.project_videos(created_by);

-- SELECT: зеркало видимости проекта (projects_select + projects_select_member).
create policy project_videos_select on public.project_videos
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

-- INSERT/DELETE: canManageDeliveryProject (owner/admin OR project ownership вкл. created_by).
create policy project_videos_insert on public.project_videos
  for insert to authenticated
  with check (
    org_id = (select public.current_org_id())
    and (
      (select public.current_org_role()) in ('owner', 'admin')
      or exists (
        select 1 from public.projects p
        where p.id = project_id
          and (p.owner_id = (select auth.uid()) or p.created_by = (select auth.uid()))
      )
    )
  );

create policy project_videos_delete on public.project_videos
  for delete to authenticated
  using (
    org_id = (select public.current_org_id())
    and (
      (select public.current_org_role()) in ('owner', 'admin')
      or exists (
        select 1 from public.projects p
        where p.id = project_id
          and (p.owner_id = (select auth.uid()) or p.created_by = (select auth.uid()))
      )
    )
  );

grant select, insert, delete on public.project_videos to authenticated;
revoke all on public.project_videos from anon;
