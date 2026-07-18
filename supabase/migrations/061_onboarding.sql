-- 061_onboarding.sql — Sprint S-ONBOARD-1 (профиль self-service + welcome-гейт)
--                      + T1c (invite email-guard).
--
-- Контекст: у всех членов орги profiles.full_name='' («Без имени» в Команде) —
-- handle_new_user берёт имя из raw_user_meta_data->>'full_name', а magic-link/OTP
-- метаданных не несёт. Решение владельца: только self-service — каждый вводит
-- данные о себе сам на /welcome при первом входе, правит в Настройках.
-- Owner чужие профили видит (read), не редактирует — это уже гарантирует RLS
-- profiles_update_own (USING+CHECK id=auth.uid()), доп. кода не требует.
--
-- 060 зарезервирована под будущий W3 contact_last_touch — НЕ занята намеренно.
--
-- ⚠️ Гейт Cowork: миграция закоммичена, НЕ применена. apply_migration + смок
--    ролями + get_advisors. Требует применённой 058 не раньше себя по порядку
--    (CREATE OR REPLACE ниже самодостаточен — включает полное тело функции).

-- ============================================================================
-- [T1c] accept_invitation: email-guard — чужая ссылка не сгорает под залогиненным
-- ============================================================================
-- WHY: 058 принимает инвайт по токену БЕЗ проверки email (trade-off «токен=bearer»).
-- Инцидент 18.07: owner, открыв invite-ссылку коллеги в своей сессии, принял инвайт
-- под своим uid — токен сгорел, коллега выпал из pending. При несовпадении email
-- НЕ стемпим accepted_at (токен остаётся валиден для правильного адресата) и
-- возвращаем 'wrong_email' + invited_email для экрана смены аккаунта в UI.

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

  select id, org_id, role, email into v_invite
    from public.invitations
   where token = p_token
     and accepted_at is null
     and expires_at > now()
   for update;

  if not found then
    -- нет / принят / истёк — деталей не палим (не помогаем перебору токенов)
    return jsonb_build_object('status','invalid');
  end if;

  -- T1c: инвайт адресован другому email — не сжигаем токен под чужой сессией
  if lower((select email from auth.users where id = v_uid)) <> lower(v_invite.email) then
    return jsonb_build_object('status','wrong_email', 'invited_email', v_invite.email);
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

-- ============================================================================
-- [1] Колонки профиля (аддитивно, nullable — backward-compat)
-- ============================================================================
-- Email НЕ добавляем — он в auth.users (single source of truth).

alter table public.profiles
  add column if not exists phone        text,
  add column if not exists job_title    text,
  add column if not exists onboarded_at timestamptz;

-- ============================================================================
-- [2] Backfill: кто уже с именем — онбординг не проходит (не гейтить owner)
-- ============================================================================

update public.profiles set onboarded_at = now()
 where onboarded_at is null and coalesce(full_name,'') <> '';

-- ============================================================================
-- [3] Бакет avatars: публичный read; запись — только своя папка {uid}/…
-- ============================================================================
-- Паттерн 055 (project-files), но ключ пути = uid, не org: аватар — личный
-- ассет, не org-скоупный. public=true покрывает чтение (аватар не секрет),
-- отдельная select-policy не нужна.

insert into storage.buckets (id, name, public) values ('avatars','avatars', true)
  on conflict (id) do nothing;

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects for insert to authenticated
  with check ( bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects for update to authenticated
  using ( bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text )
  with check ( bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects for delete to authenticated
  using ( bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text );

-- ============================================================================
-- [4] RPC session_gate() — один round-trip для middleware
-- ============================================================================
-- Заменяет отдельный current_org_id-вызов в org-guard'е: middleware за один RPC
-- получает и org-контекст, и факт онбординга. Почва под будущий JWT-claim.

create or replace function public.session_gate()
returns jsonb
language sql
stable
security definer set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'org_id', public.current_org_id(),
    'onboarded', exists (
      select 1 from public.profiles p
       where p.id = auth.uid() and p.onboarded_at is not null
    )
  );
$$;

revoke all on function public.session_gate() from public, anon;
grant execute on function public.session_gate() to authenticated;

-- ============================================================================
-- [5] RPC complete_onboarding() — серверный гард «имя обязательно»
-- ============================================================================
-- Гейт нельзя проскочить пустым сабмитом: пустое имя → 23514. Аватар грузится
-- отдельно в storage (RLS выше), тут только текстовые поля. Повторный вызов
-- onboarded_at не сдвигает (coalesce). profiles_update_own RLS не трогаем —
-- own-row update (аватар, правка в Настройках) идёт напрямую под RLS.

create or replace function public.complete_onboarding(
  p_full_name text, p_phone text, p_job_title text
)
returns void
language plpgsql
security definer set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if coalesce(btrim(p_full_name),'') = '' then
    raise exception 'full_name required' using errcode = '23514';
  end if;
  update public.profiles
     set full_name = btrim(p_full_name),
         phone     = nullif(btrim(coalesce(p_phone,'')),''),
         job_title = nullif(btrim(coalesce(p_job_title,'')),''),
         onboarded_at = coalesce(onboarded_at, now())
   where id = auth.uid();
end $$;

revoke all on function public.complete_onboarding(text,text,text) from public, anon;
grant execute on function public.complete_onboarding(text,text,text) to authenticated;
