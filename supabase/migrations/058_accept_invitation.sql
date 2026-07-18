-- 058_accept_invitation.sql — Sprint T1a (приём инвайта, токен-flow).
-- Отвязывает приём инвайта от тайминга подтверждения auth.users: клиент под своим JWT
-- зовёт RPC с токеном из ссылки → membership для auth.uid(). DEFINER обходит RLS memberships
-- (self-join прямым INSERT запрещён политикой membership_insert: требует
-- current_org_role() ∈ owner/admin, а у приглашённого org-контекста ещё нет — и должен).
-- Идемпотентно (on conflict + accepted_at-гард).
--
-- Первопричина (аудит 2026-07-18, подтверждено на живой БД): handle_new_user →
-- apply_pending_invites(id, email, email_confirmed_at IS NOT NULL) на INSERT auth.users
-- под magic-link даёт email_confirmed_at = NULL → гард p_email_confirmed = false → 0 строк;
-- подтверждение приходит на UPDATE, где триггера нет. handle_new_user НЕ трогаем — его
-- email-путь остаётся безобидным no-op (на INSERT не сработает, но и не мешает токен-flow).
--
-- TRADE-OFF (токен-only приём): токен — bearer-секрет (как invite-ссылки GitHub/Slack).
-- Убирает трение «email при регистрации должен точно совпасть с приглашённым» и чинит
-- тайминг подтверждения. Если нужна привязка к email — добавить в проверку
--   and lower((select email from auth.users where id = v_uid)) = lower(v_invite.email)
-- + отдельный статус 'wrong_email'. По умолчанию НЕ добавляем: владелец шлёт токен
-- известному человеку, трение дороже секретности одноразовой uuid-ссылки с TTL.
--
-- ⚠️ Гейт Cowork: миграция закоммичена, НЕ применена. apply_migration + get_advisors
--    (проверить, что EXECUTE адресный: authenticated, НЕ public/anon).

create or replace function public.accept_invitation(p_token uuid)
returns jsonb
language plpgsql
security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_invite record;
begin
  if v_uid is null then
    return jsonb_build_object('status','unauthenticated');
  end if;

  select id, org_id, role into v_invite
    from public.invitations
   where token = p_token
     and accepted_at is null
     and expires_at > now()
   for update;

  if not found then
    -- нет / принят / истёк — деталей не палим (не помогаем перебору токенов)
    return jsonb_build_object('status','invalid');
  end if;

  insert into public.memberships (org_id, profile_id, role)
  values (v_invite.org_id, v_uid, v_invite.role)
  on conflict (org_id, profile_id) do nothing;

  update public.invitations set accepted_at = now() where id = v_invite.id;

  return jsonb_build_object('status','accepted',
    'org_id', v_invite.org_id, 'role', v_invite.role);
end $$;

revoke all on function public.accept_invitation(uuid) from public, anon;
grant execute on function public.accept_invitation(uuid) to authenticated;
