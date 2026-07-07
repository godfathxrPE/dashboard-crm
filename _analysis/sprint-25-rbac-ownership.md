# Claude Code Prompt — Sprint 25: RBAC-финализация + владение записями

## Контекст

S23–S24 применены к живой БД (ref `uoiavcabxgdjugzryrmj`): org-scoped RLS на
current_org_role(), изоляция верифицирована (владелец / чужак / tamper), advisors чистые.
Схема владения уже существует: tasks.assigned_to, projects/companies/contacts.owner_id,
везде created_by. Хук useOrgRole() создан в S24, к UI не подключён.

S25 добивает ролевую модель до продуктовой:
1. Командная видимость leads + activity_log (решение Олега: вариант «командная»).
2. Триггерные log-функции наследуют OLD.org_id (инцидент S24: лог из service-контекста
   получил org_id NULL и уронил NOT NULL-миграцию; сейчас такие логи молча теряются).
3. Гард внутри convert_lead (SECURITY DEFINER без проверки владения — IDOR-риск).
4. Чистка legacy: DROP user_role(), DROP profiles.role.
5. UI назначения: assigned_to в TaskModal, owner_id в Project/Company/ContactModal.

**Контракт тот же**: миграции пишешь, НЕ применяешь. Применение + верификация —
Cowork MCP. У тебя есть Supabase MCP read-only интроспекция — используй для разведки.

## РАЗВЕДКА

```bash
# 1. Никто не читает profiles.role / user_role (кроме types)
grep -rn "user_role\|profiles.*role\|role.*profiles" src/ --include="*.ts" --include="*.tsx" | grep -v "OrgRole\|contact_company" | head
# 2. Типы: где UserRole и profiles.role в database.ts / entities.ts
grep -n "UserRole\|role" src/types/database.ts | head -20
# 3. Модалки: текущие поля форм
grep -n "assigned_to\|owner_id" src/components/modals/*.tsx src/lib/validators/*.ts | head -20
# 4. Хук команды: есть ли уже запрос профилей
grep -rn "profiles" src/lib/hooks/*.ts | head
```

Через Supabase MCP (read-only):
```sql
-- Точные тела функций перед правкой (источник истины)
SELECT pg_get_functiondef(oid) FROM pg_proc
WHERE pronamespace='public'::regnamespace
  AND proname IN ('log_delete_task','log_delete_project','log_delete_contact',
                  'log_delete_company','log_delete_call','log_delete_meeting',
                  'log_stage_change','convert_lead','handle_new_user');
-- Текущие политики leads / activity_log (для точных DROP-имён)
SELECT policyname, cmd FROM pg_policies
WHERE schemaname='public' AND tablename IN ('leads','activity_log');
```

## ЗАДАЧА 1: Миграция 024_team_visibility_and_hardening.sql

Без BEGIN/COMMIT (применяется атомарно через MCP).

### 1.1. Командная видимость leads (паттерн companies)

```sql
DROP POLICY IF EXISTS leads_select_own ON public.leads;
DROP POLICY IF EXISTS leads_update_own ON public.leads;
DROP POLICY IF EXISTS leads_delete_own ON public.leads;
-- insert остаётся own: лид создаёт владелец
-- (leads_insert_own НЕ трогать)

CREATE POLICY leads_select ON public.leads FOR SELECT USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
        OR user_id = ( SELECT auth.uid() ) )
);
CREATE POLICY leads_update ON public.leads FOR UPDATE USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
        OR user_id = ( SELECT auth.uid() ) )
);
CREATE POLICY leads_delete ON public.leads FOR DELETE USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
        OR user_id = ( SELECT auth.uid() ) )
);
```

### 1.2. Командный activity-фид

```sql
DROP POLICY IF EXISTS "Users see own logs" ON public.activity_log;

CREATE POLICY "Users see own logs" ON public.activity_log FOR SELECT USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
        OR user_id = ( SELECT auth.uid() ) )
);
-- INSERT/DELETE политики не трогать (own).
```

### 1.3. Log-функции: org_id из OLD, не из auth-контекста

Для КАЖДОЙ из log_delete_task/project/contact/company/call/meeting и log_stage_change:
взять живое тело из pg_get_functiondef и изменить ТОЛЬКО INSERT INTO activity_log —
добавить колонку org_id со значением `COALESCE(OLD.org_id, public.current_org_id())`
(для log_stage_change — NEW.org_id). Остальное тело не трогать, EXCEPTION-блок сохранить.
Одна функция = один CREATE OR REPLACE, по одной на таблицу (грабли миграции 011).

### 1.4. Гард в convert_lead

В начало тела (после DECLARE) добавить:

```sql
IF NOT EXISTS (
  SELECT 1 FROM public.leads
  WHERE id = p_lead_id
    AND user_id = auth.uid()
    AND org_id = public.current_org_id()
) THEN
  RAISE EXCEPTION 'lead not found or access denied' USING ERRCODE = '42501';
END IF;
```

Тело брать из pg_get_functiondef, менять минимально. Возвращаемый контракт функции
не менять (hooks используют RPC convert_lead).

### 1.5. Чистка legacy

```sql
DROP FUNCTION IF EXISTS public.user_role();
ALTER TABLE public.profiles DROP COLUMN IF EXISTS role;
```

⚠️ Перед этим разведка №1/№2 обязана подтвердить: ни код, ни политики user_role()
не используют (политики переведены в 023; если найдёшь остаток — стоп, репорт).
⚠️ handle_new_user (по интроспекции) profiles.role не пишет — но проверь ещё раз
в живом теле; если пишет — убрать колонку из его INSERT в этой же миграции.

## ЗАДАЧА 2: Хук команды + типы

1. `src/lib/hooks/use-team-members.ts`: React Query ['team-members'],
   `supabase.from('profiles').select('id, full_name, avatar_url')` — RLS сам отдаст
   только со-org-членов (shares_org_with). staleTime 5 мин.
2. `src/types/database.ts`: удалить UserRole и поле role из profiles Row/Insert/Update.
   OrgRole остаётся. tsc покажет, если что-то держалось за role.

## ЗАДАЧА 3: UI назначения

Один переиспользуемый компонент `src/components/shared/AssigneeSelect.tsx`:
select по use-team-members (аватар + имя, значение uuid | null, опция «Не назначено»).
Стилизация — CSS-переменные темы, без хардкода цветов (правила t-scandi).

Подключить:
- TaskModal → поле assigned_to («Исполнитель»)
- ProjectModal → owner_id («Ответственный»)
- CompanyModal, ContactModal → owner_id («Ответственный»)

Валидаторы (src/lib/validators/*): добавить `assigned_to: z.string().uuid().nullable().optional()`
(и owner_id аналогично) — БЕЗ required: назначение опционально.
Хуки не менять: колонки уже в Insert-типах, RLS пропускает.

⚠️ Оптимистичные апдейты: в use-tasks/use-projects объекты кеша уже собираются
с полным Row — новые поля в формах передаются как есть, плейсхолдеры не нужны.

## ЗАДАЧА 4: UI-переезд роли

useOrgRole() подключить в двух местах (минимум S25, без ролевого меню):
1. Sidebar или Settings: бейдж роли текущего пользователя (owner/admin/manager/viewer).
2. Условие «viewer не видит кнопки создания» (dashboard/projects/tasks):
   `const { data: role } = useOrgRole(); const canEdit = role !== 'viewer';`
   Скрывать кнопки create/edit при !canEdit. Это UX-слой, безопасность уже в RLS.

## ЗАДАЧА 5: docs/schema.md

- RLS-секция: leads/activity_log — командная видимость (owner/admin всё, manager своё).
- Log-функции: org_id наследуется из OLD/NEW, не из auth-контекста.
- convert_lead: гард владения.
- profiles.role удалена, user_role() удалена; роли ТОЛЬКО в memberships.
- dashboard_sync: зафиксировать решение — персональная таблица вне тенант-модели
  (аналог user_settings), org_id не добавляется.
- Header: 024 pending до применения.

## ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -10
npm run build 2>&1 | tail -5
grep -c "COALESCE(OLD.org_id\|COALESCE(NEW.org_id" supabase/migrations/024_team_visibility_and_hardening.sql  # = 7
grep -rn "UserRole" src/ | wc -l   # 0
```

## КОММИТ

```bash
git add supabase/migrations/024_team_visibility_and_hardening.sql src/ docs/schema.md
git commit -m "Sprint 25: командная видимость leads/activity_log, org_id в log-функциях, гард convert_lead, DROP user_role()/profiles.role, AssigneeSelect + useOrgRole в UI"
```

## Гейт (Cowork-сторона)

1. Ревью 024: точность переноса тел функций (diff против pg_get_functiondef), гард.
2. apply_migration + smoke: convert_lead чужого лида → 42501; лог удаления из
   service-контекста получает org_id (инцидент S24 не воспроизводится); leads
   видимость под ролями owner/manager.
3. Advisors повторно.
