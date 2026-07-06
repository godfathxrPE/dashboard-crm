-- Migration 026 — Уведомления + приглашения (Sprint 26)
-- ─────────────────────────────────────────────────────────────
-- Делает multi-user реально используемым:
--   1. invitations   — owner/admin приглашает по email+роли, ссылка передаётся
--                      вручную; membership создаётся при signup по совпадению email.
--   2. notifications — «тебе назначили» (task.assigned_to / project.owner_id),
--                      колокольчик + realtime.
--   3. Хвост S24: write-политики memberships + гард «последний owner».
--
-- Применяется вручную: Supabase Dashboard → SQL Editor. Не через CLI/db push.
-- Реальные имена/колонки взяты интроспекцией живой БД (см. sprint recon).

-- ═══════════════════════════════════════════════════════════════
-- 1. ТАБЛИЦЫ
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email       text NOT NULL,
  role        text NOT NULL DEFAULT 'manager'
                CHECK (role IN ('admin','manager','viewer')),  -- owner НЕ приглашается
  token       uuid NOT NULL DEFAULT gen_random_uuid(),
  invited_by  uuid REFERENCES public.profiles(id),
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '14 days',
  accepted_at timestamptz,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (org_id, email)
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  type         text NOT NULL CHECK (type IN ('task_assigned','project_assigned')),
  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,
  payload      jsonb DEFAULT '{}',
  read_at      timestamptz,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient
  ON public.notifications (recipient_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invitations_email
  ON public.invitations (lower(email));

-- ⚠️ trg_set_org_id на эти таблицы НЕ вешаем: org_id всегда задаётся явно
-- (definer-триггерами уведомлений / UI приглашений), маскировка ошибок не нужна.

-- ═══════════════════════════════════════════════════════════════
-- 2. RLS
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.invitations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- invitations: видят и управляют owner/admin своей org.
-- INSERT только через definer-триггеры/фон отсутствует — пишет UI под owner/admin.
DROP POLICY IF EXISTS inv_select ON public.invitations;
CREATE POLICY inv_select ON public.invitations FOR SELECT USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( SELECT public.current_org_role() ) IN ('owner','admin')
);
DROP POLICY IF EXISTS inv_insert ON public.invitations;
CREATE POLICY inv_insert ON public.invitations FOR INSERT WITH CHECK (
  org_id = ( SELECT public.current_org_id() )
  AND ( SELECT public.current_org_role() ) IN ('owner','admin')
);
DROP POLICY IF EXISTS inv_delete ON public.invitations;
CREATE POLICY inv_delete ON public.invitations FOR DELETE USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( SELECT public.current_org_role() ) IN ('owner','admin')
);

-- notifications: получатель видит/читает(update read_at)/удаляет свои.
-- INSERT политики НЕТ — пишут только SECURITY DEFINER триггеры (bypass RLS).
DROP POLICY IF EXISTS notif_select ON public.notifications;
CREATE POLICY notif_select ON public.notifications FOR SELECT USING (
  org_id = ( SELECT public.current_org_id() )
  AND recipient_id = ( SELECT auth.uid() )
);
DROP POLICY IF EXISTS notif_update ON public.notifications;
CREATE POLICY notif_update ON public.notifications FOR UPDATE USING (
  org_id = ( SELECT public.current_org_id() )
  AND recipient_id = ( SELECT auth.uid() )
);
DROP POLICY IF EXISTS notif_delete ON public.notifications;
CREATE POLICY notif_delete ON public.notifications FOR DELETE USING (
  org_id = ( SELECT public.current_org_id() )
  AND recipient_id = ( SELECT auth.uid() )
);

-- ═══════════════════════════════════════════════════════════════
-- 3. WRITE-ПОЛИТИКИ memberships (хвост S24)
--    До 026 у memberships была только SELECT-политика — INSERT/UPDATE/DELETE
--    были наглухо закрыты. Открываем управление членством owner/admin.
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS membership_insert ON public.memberships;
CREATE POLICY membership_insert ON public.memberships FOR INSERT WITH CHECK (
  org_id = ( SELECT public.current_org_id() )
  AND ( SELECT public.current_org_role() ) IN ('owner','admin')
  AND ( role <> 'owner' OR ( SELECT public.current_org_role() ) = 'owner' )
);

DROP POLICY IF EXISTS membership_update ON public.memberships;
CREATE POLICY membership_update ON public.memberships FOR UPDATE
USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( SELECT public.current_org_role() ) IN ('owner','admin')
)
WITH CHECK (
  org_id = ( SELECT public.current_org_id() )
  AND ( role <> 'owner' OR ( SELECT public.current_org_role() ) = 'owner' )
);

DROP POLICY IF EXISTS membership_delete ON public.memberships;
CREATE POLICY membership_delete ON public.memberships FOR DELETE USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
        OR profile_id = ( SELECT auth.uid() ) )  -- выйти из org можно самому
);

-- Гард «последний owner»: BEFORE UPDATE/DELETE на memberships.
CREATE OR REPLACE FUNCTION public.protect_last_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.role = 'owner' AND (TG_OP = 'DELETE' OR NEW.role <> 'owner') THEN
    IF (SELECT count(*) FROM public.memberships
        WHERE org_id = OLD.org_id AND role = 'owner') <= 1 THEN
      RAISE EXCEPTION 'cannot remove the last owner of the organization'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
REVOKE EXECUTE ON FUNCTION public.protect_last_owner() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.protect_last_owner() TO service_role;

DROP TRIGGER IF EXISTS trg_protect_last_owner ON public.memberships;
CREATE TRIGGER trg_protect_last_owner
  BEFORE UPDATE OR DELETE ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION public.protect_last_owner();

-- ═══════════════════════════════════════════════════════════════
-- 4. ТРИГГЕРЫ НАЗНАЧЕНИЯ → УВЕДОМЛЕНИЕ (per-table, грабли 011)
--    Единая функция обрабатывает INSERT и UPDATE OF <col>:
--    для INSERT ветка OLD не вычисляется (OR short-circuit по TG_OP).
--    Уведомление НИКОГДА не блокирует запись (EXCEPTION → RETURN NEW).
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to)
     AND NEW.assigned_to <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  THEN
    INSERT INTO public.notifications
      (org_id, recipient_id, actor_id, type, entity_type, entity_id, payload)
    VALUES
      (NEW.org_id, NEW.assigned_to, auth.uid(), 'task_assigned', 'tasks', NEW.id,
       jsonb_build_object('title', NEW.text));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;  -- уведомление никогда не блокирует запись
END; $$;
REVOKE EXECUTE ON FUNCTION public.notify_task_assigned() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.notify_task_assigned() TO service_role;

CREATE OR REPLACE FUNCTION public.notify_project_assigned()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.owner_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.owner_id IS DISTINCT FROM OLD.owner_id)
     AND NEW.owner_id <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  THEN
    INSERT INTO public.notifications
      (org_id, recipient_id, actor_id, type, entity_type, entity_id, payload)
    VALUES
      (NEW.org_id, NEW.owner_id, auth.uid(), 'project_assigned', 'projects', NEW.id,
       jsonb_build_object('title', NEW.name));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.notify_project_assigned() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.notify_project_assigned() TO service_role;

DROP TRIGGER IF EXISTS trg_notify_task_assigned ON public.tasks;
CREATE TRIGGER trg_notify_task_assigned
  AFTER INSERT OR UPDATE OF assigned_to ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.notify_task_assigned();

DROP TRIGGER IF EXISTS trg_notify_project_assigned ON public.projects;
CREATE TRIGGER trg_notify_project_assigned
  AFTER INSERT OR UPDATE OF owner_id ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.notify_project_assigned();

-- ═══════════════════════════════════════════════════════════════
-- 5. apply_pending_invites + расширение handle_new_user
-- ═══════════════════════════════════════════════════════════════

-- Матчит непринятые непросроченные приглашения по email и создаёт membership.
-- Идемпотентна: повторный вызов не плодит дублей (ON CONFLICT DO NOTHING),
-- accepted_at выставляется один раз. Возвращает число созданных membership.
CREATE OR REPLACE FUNCTION public.apply_pending_invites(p_profile_id uuid, p_email text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_count integer := 0;
BEGIN
  WITH matched AS (
    UPDATE public.invitations
    SET accepted_at = now()
    WHERE lower(email) = lower(p_email)
      AND accepted_at IS NULL
      AND expires_at > now()
    RETURNING org_id, role
  ), inserted AS (
    INSERT INTO public.memberships (org_id, profile_id, role)
    SELECT org_id, p_profile_id, role FROM matched
    ON CONFLICT (org_id, profile_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM inserted;
  RETURN v_count;
END; $$;
REVOKE EXECUTE ON FUNCTION public.apply_pending_invites(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.apply_pending_invites(uuid, text) TO service_role;

-- handle_new_user: живое тело (recon) + вызов apply_pending_invites В КОНЕЦ.
-- Триггер висит на auth.users → NEW.email доступен. Остальное тело не менялось.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));

  PERFORM public.apply_pending_invites(NEW.id, NEW.email);

  RETURN NEW;
END; $$;

-- ═══════════════════════════════════════════════════════════════
-- 6. REALTIME
--    notifications отсутствовала в публикации (recon) → добавляем,
--    чтобы колокольчик обновлялся без ручного refetch.
-- ═══════════════════════════════════════════════════════════════

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
