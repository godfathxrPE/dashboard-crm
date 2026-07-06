-- Migration 025 — FK leads.converted_* → ON DELETE SET NULL
-- ─────────────────────────────────────────────────────────────
-- Гейт S25 поймал: удаление сконвертированной сделки/компании/контакта
-- падало с 23503 (foreign_key_violation), т.к. три FK от leads.converted_*
-- были без ON DELETE. Перевешиваем каждый на SET NULL — удаление сущности
-- обнуляет ссылку в лиде, а не блокируется.
--
-- Имена констрейнтов взяты интроспекцией живой БД (pg_constraint), не угаданы:
--   leads_converted_deal_id_fkey    → projects(id)
--   leads_converted_company_id_fkey → companies(id)
--   leads_converted_contact_id_fkey → contacts(id)
--
-- Применяется вручную: Supabase Dashboard → SQL Editor. Не через CLI/db push.

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_converted_deal_id_fkey;
ALTER TABLE public.leads ADD  CONSTRAINT leads_converted_deal_id_fkey
  FOREIGN KEY (converted_deal_id) REFERENCES public.projects(id) ON DELETE SET NULL;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_converted_company_id_fkey;
ALTER TABLE public.leads ADD  CONSTRAINT leads_converted_company_id_fkey
  FOREIGN KEY (converted_company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_converted_contact_id_fkey;
ALTER TABLE public.leads ADD  CONSTRAINT leads_converted_contact_id_fkey
  FOREIGN KEY (converted_contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;
