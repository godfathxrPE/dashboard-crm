# Claude Code Prompt — Sprint 26: Уведомления + приглашения (финал фазы 1)

## Контекст

S23–S25 применены и верифицированы: тенанты, org-RLS, RBAC (memberships.role),
владение (assigned_to/owner_id), AssigneeSelect в модалках, useOrgRole()/useTeamMembers().
S26 делает multi-user реально используемым: приглашение второго человека в org
и уведомление «тебе назначили». Плюс хвосты гейтов S24/S25.

**Контракт прежний**: миграции пишешь, НЕ применяешь. Применение + smoke — Cowork MCP.
Для разведки используй Supabase MCP read-only (pg_get_functiondef, pg_policies,
pg_publication_tables).

## Продуктовые решения (зафиксированы)

1. **Invite без email-отправки** (email-инфра появится в S30): owner/admin создаёт
   приглашение (email + роль) → получает invite-ссылку для ручной передачи →
   приглашённый регистрируется обычным signup → membership создаётся автоматически
   по совпадению email. Отправка письма — вне скоупа.
2. **Уведомления v1**: только «тебе назначили» (task.assigned_to, project.owner_id).
   Колокольчик в UI, unread badge, mark as read. Email-канал — S30.
3. **Логика инвайт-матчинга — в отдельной функции** `apply_pending_invites()`,
   вызываемой из handle_new_user: тестируется напрямую, без симуляции signup.

## РАЗВЕДКА

```bash
# 1. Куда вешать колокольчик (header/sidebar структура)
grep -n "export" src/components/layout/*.tsx | head
# 2. Realtime-механизм (паттерн подписки для notifications)
sed -n '1,60p' src/lib/hooks/use-realtime.ts
# 3. Settings page (куда встраивать Team-секцию)
grep -n "section\|Tab\|бейдж\|role" src/app/settings/page.tssx src/app/settings/page.tsx 2>/dev/null | head
# 4. Есть ли auth-callback/redirect логика (для invite-ссылки)
grep -rn "signUp\|signInWith" src/ --include="*.ts" --include="*.tsx" | head
```

Через Supabase MCP:
```sql
-- Живое тело handle_new_user (будем расширять — менять минимально!)
SELECT pg_get_functiondef(oid) FROM pg_proc
WHERE pronamespace='public'::regnamespace AND proname='handle_new_user';
-- Realtime publication: включены ли таблицы
SELECT * FROM pg_publication_tables WHERE pubname='supabase_realtime';
-- Точные FK-имена converted_* (для 025)
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid='public.leads'::regclass AND contype='f';
```

## ЗАДАЧА 1: Миграция 025_fk_converted_set_null.sql (микро, отдельно)

Гейт S25 поймал: удаление сконвертированной сделки падает с 23503.
Для каждого из трёх FK (converted_deal_id, converted_company_id, converted_contact_id):

```sql
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS <имя_из_разведки>;
ALTER TABLE public.leads ADD CONSTRAINT <имя> FOREIGN KEY (<col>)
  REFERENCES public.<таблица>(id) ON DELETE SET NULL;
```

Имена констрейнтов взять из разведки, не угадывать.

## ЗАДАЧА 2: Миграция 026_notifications_invitations.sql

### 2.1. Таблицы

```sql
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
  UNIQUE(org_id, email)
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
  ON public.notifications(recipient_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON public.invitations(lower(email));
```

⚠️ trg_set_org_id на эти таблицы НЕ вешать: org_id всегда задаётся явно
(триггерами уведомлений / UI приглашений), маскировка ошибок не нужна.

### 2.2. RLS

```sql
ALTER TABLE public.invitations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- invitations: видят и управляют owner/admin своей org
CREATE POLICY inv_select ON public.invitations FOR SELECT USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( SELECT public.current_org_role() ) IN ('owner','admin')
);
CREATE POLICY inv_insert ON public.invitations FOR INSERT WITH CHECK (
  org_id = ( SELECT public.current_org_id() )
  AND ( SELECT public.current_org_role() ) IN ('owner','admin')
);
CREATE POLICY inv_delete ON public.invitations FOR DELETE USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( SELECT public.current_org_role() ) IN ('owner','admin')
);

-- notifications: получатель видит/читает/удаляет свои; INSERT только definer-триггеры
CREATE POLICY notif_select ON public.notifications FOR SELECT USING (
  org_id = ( SELECT public.current_org_id() )
  AND recipient_id = ( SELECT auth.uid() )
);
CREATE POLICY notif_update ON public.notifications FOR UPDATE USING (
  org_id = ( SELECT public.current_org_id() )
  AND recipient_id = ( SELECT auth.uid() )
);
CREATE POLICY notif_delete ON public.notifications FOR DELETE USING (
  org_id = ( SELECT public.current_org_id() )
  AND recipient_id = ( SELECT auth.uid() )
);
```

### 2.3. Write-политики memberships (хвост S24)

```sql
-- owner/admin管理 членством; роль 'owner' назначает/снимает только owner
CREATE POLICY membership_insert ON public.memberships FOR INSERT WITH CHECK (
  org_id = ( SELECT public.current_org_id() )
  AND ( SELECT public.current_org_role() ) IN ('owner','admin')
  AND ( role <> 'owner' OR ( SELECT public.current_org_role() ) = 'owner' )
);
CREATE POLICY membership_update ON public.memberships FOR UPDATE
USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( SELECT public.current_org_role() ) IN ('owner','admin')
)
WITH CHECK (
  org_id = ( SELECT public.current_org_id() )
  AND ( role <> 'owner' OR ( SELECT public.current_org_role() ) = 'owner' )
);
CREATE POLICY membership_delete ON public.memberships FOR DELETE USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
        OR profile_id = ( SELECT auth.uid() ) )  -- выйти из org можно самому
);

-- Гард «последний owner»: BEFORE UPDATE/DELETE на memberships
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
```

### 2.4. Триггеры назначения → уведомление (per-table, грабли 011)

```sql
CREATE OR REPLACE FUNCTION public.notify_task_assigned()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL
     AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to
     AND NEW.assigned_to <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
  THEN
    INSERT INTO public.notifications (org_id, recipient_id, actor_id, type, entity_type, entity_id, payload)
    VALUES (NEW.org_id, NEW.assigned_to, auth.uid(), 'task_assigned', 'tasks', NEW.id,
            jsonb_build_object('title', NEW.text));
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;  -- уведомление никогда не блокирует запись
END; $$;
```

Аналогично `notify_project_assigned()` (owner_id, type 'project_assigned',
payload title = NEW.name). Триггеры AFTER INSERT OR UPDATE OF assigned_to /
owner_id. Для INSERT: OLD нет — использовать TG_OP-ветку или два триггера
(INSERT: уведомлять если assigned_to задан и ≠ auth.uid()).
ACL по паттерну триггерных (только service_role).

### 2.5. apply_pending_invites + расширение handle_new_user

```sql
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
    SELECT org_id, role FROM matched
    ON CONFLICT (org_id, profile_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM inserted;
  RETURN v_count;
END; $$;
REVOKE EXECUTE ON FUNCTION public.apply_pending_invites(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.apply_pending_invites(uuid, text) TO service_role;
```

⚠️ Оператор INSERT...SELECT в memberships пропишет profile_id откуда? Исправь:
`SELECT org_id, p_profile_id, role FROM matched` с явным списком колонок
`(org_id, profile_id, role)`. Проверь себя дважды.

handle_new_user: взять живое тело (разведка), добавить В КОНЕЦ (после INSERT
профиля) вызов `PERFORM public.apply_pending_invites(NEW.id, NEW.email);`.
Остальное тело не менять. SECURITY DEFINER/search_path сохранить как в живом.

### 2.6. Realtime

Если разведка показала, что notifications нет в publication:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
```

## ЗАДАЧА 3: Типы + хуки

1. `database.ts`: Invitation, Notification (+ Tables-записи).
2. `use-notifications.ts`: список (limit 30, unread first) + unreadCount +
   markRead(id) / markAllRead() (UPDATE read_at) + useRealtimeSync('notifications').
3. `use-invitations.ts`: список pending (owner/admin), create(email, role) →
   возвращает invite-ссылку `${origin}/login?invited=1` (токен в ссылку НЕ класть —
   матчинг по email при signup; параметр только для UX-текста), revoke(id).
4. `use-team-members.ts`: добавить роль из memberships (join или второй запрос) —
   для Team-страницы.

## ЗАДАЧА 4: UI

1. **Колокольчик** в layout (рядом с ActivityDrawer-триггером): unread badge
   (счётчик), dropdown-список (по z-иерархии: dropdown = z-50), клик по
   уведомлению → mark read + переход к сущности (задача/сделка). Скрыть для
   viewer не нужно — уведомления получают все.
2. **Settings → Team**: список членов (имя, роль-бейдж), pending-инвайты
   (email, роль, кнопка revoke, кнопка «копировать ссылку»), форма приглашения
   (email + роль select: admin/manager/viewer) — видна только owner/admin
   (useOrgRole). Смена роли члена (select, только owner может назначать owner —
   RLS подстрахует, UI не должен давать попытку). Кнопка «удалить из команды»
   (owner/admin, не себя).
3. Scandi-правила: токены, без хардкода, эмодзи нет, Lucide.

## ЗАДАЧА 5: docs/schema.md

invitations/notifications + RLS, write-политики memberships + protect_last_owner,
notify-триггеры, apply_pending_invites в handle_new_user, 025 (FK SET NULL).
Header: 025/026 pending.

## ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -10
npm run build 2>&1 | tail -5
grep -c "SECURITY DEFINER" supabase/migrations/026_notifications_invitations.sql  # ≥ 4
```

## КОММИТ

```bash
git add supabase/migrations/025_*.sql supabase/migrations/026_*.sql src/ docs/schema.md
git commit -m "Sprint 26: notifications (колокольчик, realtime) + invitations (Team page, apply_pending_invites) + write-политики memberships + FK converted_* SET NULL"
```

## Гейт (Cowork): применение 025→026 + smoke
- FK: удаление сконвертированной сделки больше не 23503, lead.converted_deal_id → NULL.
- apply_pending_invites: прямой вызов с тестовым email → membership создан, повторный вызов идемпотентен, просроченный инвайт не матчится.
- Назначение задачи (UPDATE assigned_to на другого) → уведомление появилось; самоназначение → нет.
- last-owner: UPDATE роли единственного owner → 42501.
- Эскалация: admin пытается INSERT membership с role='owner' → отказ.
- Advisors повторно.

## Ручной шаг Олега (не миграция)
Supabase Dashboard → Authentication → Passwords → включить Leaked password
protection (advisors WARN висит с S23).
