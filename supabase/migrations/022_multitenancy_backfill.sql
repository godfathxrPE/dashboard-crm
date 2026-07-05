-- ============================================
-- Migration 022: Backfill default org + auto-fill trigger
-- Applied manually via Supabase SQL Editor
-- ============================================

BEGIN;

-- 1. Дефолтная организация для существующих данных
INSERT INTO public.organizations (name, created_by)
SELECT 'Default Organization', p.id
FROM public.profiles p
ORDER BY p.created_at LIMIT 1;

-- 2. Членство всем существующим профилям.
--    Маппинг глобальной роли → org-роль: admin→owner, pm→admin,
--    member→manager, viewer→viewer.
INSERT INTO public.memberships (org_id, profile_id, role)
SELECT o.id, p.id,
  CASE p.role
    WHEN 'admin'  THEN 'owner'
    WHEN 'pm'     THEN 'admin'
    WHEN 'viewer' THEN 'viewer'
    ELSE 'manager'
  END
FROM public.profiles p
CROSS JOIN (SELECT id FROM public.organizations ORDER BY created_at LIMIT 1) o
ON CONFLICT (org_id, profile_id) DO NOTHING;

-- 3. Backfill org_id (один UPDATE на таблицу)
DO $$
DECLARE
  v_org uuid;
  t text;
BEGIN
  SELECT id INTO v_org FROM public.organizations ORDER BY created_at LIMIT 1;
  FOREACH t IN ARRAY ARRAY[
    'companies','contacts','contact_company','projects','tasks','calls',
    'meetings','activities','activity_log','leads','project_files',
    'kpi_entries','call_tracker_days','scheduled_calls'
  ] LOOP
    EXECUTE format('UPDATE public.%I SET org_id = $1 WHERE org_id IS NULL', t)
    USING v_org;
  END LOOP;
END $$;

-- 4. Автозаполнение org_id на INSERT — чтобы существующий клиентский код
--    (хуки не передают org_id) продолжил работать без изменений.
--    Одна функция допустима: она ссылается ТОЛЬКО на NEW.org_id, который
--    есть во всех таблицах, куда вешаем триггер (грабли миграции 011
--    касались колонок, существующих не везде).
CREATE OR REPLACE FUNCTION public.set_org_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := public.current_org_id();
  END IF;
  RETURN NEW;
END;
$$;

-- ACL по паттерну триггерных функций (log_delete_*): только postgres/service_role.
-- Триггер срабатывает для любого юзера независимо от EXECUTE (проверка — при
-- создании триггера, не при срабатывании).
REVOKE EXECUTE ON FUNCTION public.set_org_id() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.set_org_id() TO service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'companies','contacts','contact_company','projects','tasks','calls',
    'meetings','activities','activity_log','leads','project_files',
    'kpi_entries','call_tracker_days','scheduled_calls'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_set_org_id ON public.%I;
       CREATE TRIGGER trg_set_org_id BEFORE INSERT ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.set_org_id();', t, t);
  END LOOP;
END $$;

-- 5. NOT NULL — только после backfill и триггеров
ALTER TABLE public.companies         ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.contacts          ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.contact_company   ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.projects          ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.tasks             ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.calls             ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.meetings          ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.leads             ALTER COLUMN org_id SET NOT NULL;
-- activity_log, activities, project_files, kpi_entries, call_tracker_days,
-- scheduled_calls: оставить nullable в этом спринте — в них пишут
-- SECURITY DEFINER триггеры и фоновые сценарии; ужесточим в Sprint 24
-- после аудита всех путей записи.

COMMIT;
