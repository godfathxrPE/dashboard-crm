-- ═══════════════════════════════════════════════════════
-- 093 — UPDATE-политика для contact_company (хвост #12).
--
-- У таблицы были только SELECT / INSERT / DELETE (cc_select / cc_insert / cc_delete):
-- роль контакта в компании нельзя было отредактировать — под RLS это не ошибка доступа,
-- а тихий 0 изменённых строк (UI показал бы «сохранено», в базе бы не изменилось ничего).
-- Роли те же, что у cc_insert (owner/admin/manager): кто может завести связь,
-- тот может и поправить у неё роль.
--
-- WITH CHECK повторяет USING — урок 054: без него строку можно перенести в чужую org
-- (org_id прикрыт ещё и trg_aa_freeze_org_id, он на таблице есть).
--
-- Форма — дословно с ds_update из 092.
--
-- Откат: drop policy if exists cc_update on public.contact_company;
-- ═══════════════════════════════════════════════════════

drop policy if exists cc_update on public.contact_company;

create policy cc_update on public.contact_company for update to authenticated
  using (
    org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin','manager')
  )
  with check (
    org_id = ( select public.current_org_id() )
    and ( select public.current_org_role() ) in ('owner','admin','manager')
  );
