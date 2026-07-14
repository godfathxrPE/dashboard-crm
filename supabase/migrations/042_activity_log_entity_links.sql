-- 042: entity-agnostic notes — прямая привязка activity_log к contact/company
-- Аддитивно: nullable FK + партиал-индексы. RLS не меняется — SELECT-политика
-- уже гейтит по org_id/user_id (owner/admin видят всё, менеджер — своё), новые
-- колонки наследуют это без правок. org_id на insert ставит существующий триггер.
--
-- Идемпотентно (IF NOT EXISTS): на проде схема уже применена вручную в SQL Editor
-- на этапе планирования спринта — этот файл фиксирует её как источник истины и
-- безопасен к повторному прогону на любой среде.

ALTER TABLE public.activity_log
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_activity_log_contact ON public.activity_log(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_log_company ON public.activity_log(company_id) WHERE company_id IS NOT NULL;
