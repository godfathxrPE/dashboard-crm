-- ═══════════════════════════════════════════════════════
-- Sprint T2 — 059: admin не трогает owner (жёсткий RLS-гейт)
--
-- Дыра до этой миграции:
--   membership_update USING = «org + роль IN (owner,admin)» — admin проходит на
--   ЛЮБУЮ строку своей org, включая owner. WITH CHECK ловил только назначение
--   role='owner', но не role='admin' → admin поднимал manager→admin.
--   membership_delete USING = то же «owner|admin» → admin удалял owner.
--   protect_last_owner() спасал лишь край (последний owner), не разжалование.
--
-- Правило T2:
--   • owner  — трогает кого угодно (owner/admin/manager/viewer);
--   • admin  — только manager/viewer, и НЕ может выставить admin/owner;
--   • сам себя всегда можно удалить (выйти из org) — оставляем self-delete.
--
-- Двойная проверка на UPDATE обязательна (grok W1): USING смотрит СТАРУЮ строку
-- (кого трогаю), WITH CHECK — НОВУЮ (какую роль выставляю). Без WITH CHECK
-- admin эскалировал бы через SET role='admin'/'owner'.
--
-- NULL-safe: current_org_role() IS NULL → сравнения дают NULL → AND даёт NULL →
-- строка отфильтрована (deny). initplan-обёртки ( SELECT … ) как в остальных
-- политиках. protect_last_owner() оставлен как нижняя граница.
-- ═══════════════════════════════════════════════════════

-- ── UPDATE: USING по старой роли + WITH CHECK по новой ──
drop policy if exists membership_update on public.memberships;
create policy membership_update on public.memberships
  for update
  using (
    org_id = ( select public.current_org_id() )
    and (
      ( select public.current_org_role() ) = 'owner'
      or (
        ( select public.current_org_role() ) = 'admin'
        and role in ('manager', 'viewer')
      )
    )
  )
  with check (
    org_id = ( select public.current_org_id() )
    and (
      ( select public.current_org_role() ) = 'owner'
      or (
        ( select public.current_org_role() ) = 'admin'
        and role in ('manager', 'viewer')
      )
    )
  );

-- ── DELETE: USING тот же предикат (+ self-delete: всегда можно выйти) ──
drop policy if exists membership_delete on public.memberships;
create policy membership_delete on public.memberships
  for delete
  using (
    org_id = ( select public.current_org_id() )
    and (
      ( select public.current_org_role() ) = 'owner'
      or (
        ( select public.current_org_role() ) = 'admin'
        and role in ('manager', 'viewer')
      )
      or profile_id = ( select auth.uid() )
    )
  );
