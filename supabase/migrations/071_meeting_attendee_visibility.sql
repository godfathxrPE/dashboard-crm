-- 071_meeting_attendee_visibility.sql
-- Участник встречи (meeting_attendees.profile_id) видит встречу и состав участников.
-- Google Calendar semantics: attendee видит, но НЕ правит (meetings_update не трогаем).
-- ⚠️ Прямой subquery attendees в политике meetings → взаимная рекурсия 42P17
--    (attendees_own уже ссылается на meetings) → SECURITY DEFINER-хелпер (паттерн is_project_member).

-- 1. Хелпер: текущий юзер — внутренний участник встречи? (definer обходит RLS → рекурсии нет)
create or replace function public.is_meeting_attendee(p_meeting_id uuid)
returns boolean
language sql
stable
security definer
set search_path to public, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1 from public.meeting_attendees ma
    where ma.meeting_id = p_meeting_id
      and ma.profile_id = auth.uid()
  );
$$;

revoke all on function public.is_meeting_attendee(uuid) from public, anon;
grant execute on function public.is_meeting_attendee(uuid) to authenticated, service_role;

-- 2. meetings_select: + ветка участника (аддитивно; org-граница первым конъюнктом — как была)
drop policy if exists meetings_select on public.meetings;
create policy meetings_select on public.meetings
  for select using (
    org_id = (select public.current_org_id())
    and (
      (select public.current_org_role()) in ('owner','admin')
      or created_by = (select auth.uid())
      or public.is_meeting_attendee(id)
    )
  );

-- 3. meeting_attendees: видящий встречу видит её состав (нужно, чтобы дорожки/участники
--    рендерились у manager-участника). attendees_own (ALL: creator/admin пишут) НЕ трогаем —
--    добавляем ТОЛЬКО select. Ссылка на meetings безопасна (meetings→attendees идёт через definer).
drop policy if exists attendees_select_visible on public.meeting_attendees;
create policy attendees_select_visible on public.meeting_attendees
  for select using (
    exists (select 1 from public.meetings m where m.id = meeting_attendees.meeting_id)
  );
