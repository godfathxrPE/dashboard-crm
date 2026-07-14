-- 045: won → уведомление владельцу «создай внедрение» (S-WON-AUTO-1)
--
-- Хардкод-автоматизация (не общий движок автоматизаций — тот в Волне 3).
-- Триггер на projects: при переходе client-сделки в won (OLD.status ≠ won,
-- owner задан) вставляет notification type='deal_won' получателю=owner_id,
-- entity('projects', deal.id), payload {title: deal.name}. Клиент insert НЕ
-- делает — сервер уведомляет сам.
--
-- SECURITY DEFINER + EXCEPTION-safe (сбой нотификации НЕ роллбэчит выигрыш,
-- в отличие от гейта S27) + search_path зафиксирован. ACL: PUBLIC/anon revoke.
--
-- ВАЖНО (S-WON-AUTO-1 smoke-фикс): триггер вешаем на `AFTER UPDATE` БЕЗ `OF status`.
-- Статус сделки status='won' НЕ пишется клиентом напрямую — его выводит BEFORE-триггер
-- trg_sync_deal_stage_fields из stage_id (is_won). Postgres `UPDATE OF status` срабатывает
-- только если `status` в SET-списке SQL-UPDATE; клиент шлёт stage_id/won_reason/…, но не
-- status → `OF status` НЕ фичит вовсе. Поэтому фильтр по колонке снят; WHEN-условие
-- (вычисляется ПОСЛЕ BEFORE-триггеров, там уже NEW.status='won') оставляет только
-- переходы в выигрыш. Изначальный prod-вариант Cowork'а был `OF status` — молча не
-- уведомлял (EXCEPTION-safe глотает, но тут даже не доходило до тела).
--
-- Функция уже на проде; триггер пере-создан этим спринтом. Идемпотентно (CREATE OR
-- REPLACE + DROP TRIGGER IF EXISTS), повтор безопасен.

-- Тип 'deal_won' должен быть в CHECK notifications.type, иначе INSERT падает и
-- EXCEPTION-safe тело молча его глотает (второй smoke-баг исходной prod-версии).
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY['task_assigned'::text, 'project_assigned'::text, 'deal_won'::text]));

CREATE OR REPLACE FUNCTION public.notify_deal_won()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.type='client' AND NEW.status='won' AND OLD.status IS DISTINCT FROM 'won'
     AND NEW.owner_id IS NOT NULL THEN
    INSERT INTO public.notifications
      (org_id, recipient_id, actor_id, type, entity_type, entity_id, payload)
    VALUES (NEW.org_id, NEW.owner_id, auth.uid(), 'deal_won', 'projects', NEW.id,
            jsonb_build_object('title', NEW.name));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END; $function$;

-- ACL: функцию-триггер не должен звать напрямую никто (PUBLIC/anon revoke)
REVOKE ALL ON FUNCTION public.notify_deal_won() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_deal_won() FROM anon;

DROP TRIGGER IF EXISTS trg_notify_deal_won ON public.projects;
CREATE TRIGGER trg_notify_deal_won
  AFTER UPDATE ON public.projects
  FOR EACH ROW
  WHEN (NEW.type = 'client' AND NEW.status = 'won' AND OLD.status IS DISTINCT FROM 'won')
  EXECUTE FUNCTION public.notify_deal_won();
