# Claude Code Prompt — Sprint 24: RLS-рефактор на org-membership

## Контекст

S23 применён к живой БД: organizations/memberships/org_id существуют, backfill выполнен,
триггер set_org_id() заполняет org_id на INSERT. Текущие политики — ролевые
(user_role() ∈ admin/pm/member + ownership-колонки), но НЕ org-scoped: admin/pm видят
все строки таблицы глобально, contact_company читается вообще всеми (`USING true`).

**Цель S24: перевести семантику политик 1:1 на org-модель.** Поведение для текущего
пользователя не меняется. Расширение/сужение видимости (командные фиды, шаринг лидов) —
S25, здесь ТОЛЬКО добавление org-границы и перенос ролей на memberships.

**Разделение труда**: ты пишешь миграцию и правки кода в репо. НЕ применяешь к БД.
Применение — через Cowork (MCP) после security-review, как в S23.

## Маппинг ролей (зафиксирован backfill'ом 022)

| profiles.role (legacy) | memberships.role (новая) |
|---|---|
| admin | owner |
| pm | admin |
| member | manager |
| viewer | viewer |

Соответствие в политиках: `user_role() IN ('admin','pm')` → `current_org_role() IN ('owner','admin')`;
`IN ('admin','pm','member')` → `IN ('owner','admin','manager')`; `user_role()='admin'` → `= 'owner'`.

## Живой инвентарь политик (источник истины, снят с pg_policies 2026-07-05)

Семантика по таблицам (сохранить 1:1, добавив org-границу):

| Таблица | SELECT | INSERT (check) | UPDATE | DELETE |
|---|---|---|---|---|
| companies | adm/pm ∨ owner_id ∨ created_by | adm/pm/member | adm/pm ∨ owner_id | adm/pm ∨ owner_id ∨ created_by |
| contacts | adm/pm ∨ owner_id ∨ created_by | adm/pm/member | adm/pm ∨ owner_id | adm/pm ∨ owner_id ∨ created_by |
| projects | adm/pm ∨ owner_id ∨ created_by | adm/pm/member | adm/pm ∨ owner_id | **admin** ∨ owner_id |
| tasks | adm/pm ∨ assigned_to ∨ created_by | adm/pm/member | adm/pm ∨ assigned_to ∨ created_by | adm/pm ∨ created_by |
| calls | adm/pm ∨ created_by | adm/pm/member | adm/pm ∨ created_by | adm/pm ∨ created_by |
| meetings | adm/pm ∨ created_by | adm/pm/member | adm/pm ∨ created_by | adm/pm ∨ created_by |
| activities | adm/pm ∨ created_by | adm/pm/member | — | — |
| contact_company | **true** (дыра) | adm/pm/member | — | adm/pm |
| meeting_attendees | ALL: через meetings (adm/pm ∨ m.created_by) | | | |
| leads | own (user_id) все команды | | | |
| activity_log | own (user_id) S/I/D | | | |
| project_files | ALL: own (user_id) | | | |
| kpi_entries, call_tracker_days, scheduled_calls | ALL: own (profile_id) | | | |
| user_settings | ALL: own (profile_id) — org_id НЕТ, не трогать | | | |
| dashboard_sync | own (user_id), org_id НЕТ — вне скоупа S24, решение в S25 | | | |
| profiles | own ∨ user_role()='admin' | — | own | — |
| pipelines, pipeline_stages | authenticated true (глобальные словари) — не трогать | | | |

Все существующие политики используют initplan-паттерн `( SELECT auth.uid() )` — сохранить его.

## РАЗВЕДКА

```bash
# 1. Использует ли клиентский код user_role() / profiles.role напрямую
grep -rn "user_role\|\.role" src/ --include="*.ts" --include="*.tsx" | grep -v "OrgRole\|Membership" | head -20

# 2. RPC-вызовы convert_lead (сигнатура не меняется, но проверить)
grep -rn "convert_lead\|rpc(" src/lib/hooks/*.ts | head -10

# 3. Есть ли обращения к таблицам memberships/organizations из кода (не должно быть, кроме types)
grep -rn "memberships\|organizations" src/ --include="*.ts" --include="*.tsx" | grep -v types | head

# 4. Последняя миграция
ls supabase/migrations/ | tail -3
```

⚠️ Если разведка №1 найдёт UI-логику на profiles.role (меню, кнопки) — НЕ переписывай её
в этом спринте, только зафиксируй список файлов в комментарии коммита. UI-переезд на
useOrgRole() — S25.

## ЗАДАЧА 1: Миграция 023_org_rls.sql

Один файл, без BEGIN/COMMIT (применяется атомарно через MCP apply_migration).

### 1.1. Новые helpers (initplan-friendly, по hardening-конвенции)

```sql
-- Роль текущего пользователя в его текущей организации.
-- No-arg + STABLE → планировщик вычисляет один раз (initplan), не per-row.
CREATE OR REPLACE FUNCTION public.current_org_role()
RETURNS text AS $$
  SELECT m.role FROM public.memberships m
  WHERE m.profile_id = auth.uid()
    AND m.org_id = public.current_org_id();
$$ LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.current_org_role() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.current_org_role() TO authenticated, service_role;

-- Состоит ли профиль p в одной org с текущим пользователем (для profiles_select)
CREATE OR REPLACE FUNCTION public.shares_org_with(p_profile uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships a
    JOIN public.memberships b ON a.org_id = b.org_id
    WHERE a.profile_id = auth.uid() AND b.profile_id = p_profile
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.shares_org_with(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.shares_org_with(uuid) TO authenticated, service_role;
```

### 1.2. Шаблон политики

Каждая бизнес-политика получает org-границу первым конъюнктом:

```sql
org_id = ( SELECT public.current_org_id() )
```

и роль через `( SELECT public.current_org_role() )`. Ownership-ветки — как в инвентаре,
с `( SELECT auth.uid() )`. UPDATE-политики без WITH CHECK наследуют USING — org-граница
автоматически запрещает перенос строки в чужую org.

### 1.3. Полный список политик (DROP + CREATE)

Для каждой таблицы: `DROP POLICY IF EXISTS <имя> ON public.<таблица>;` для ВСЕХ политик
из инвентаря, затем CREATE по шаблону. Пример для projects (остальные — по матрице):

```sql
DROP POLICY IF EXISTS projects_select ON public.projects;
DROP POLICY IF EXISTS projects_insert ON public.projects;
DROP POLICY IF EXISTS projects_update ON public.projects;
DROP POLICY IF EXISTS projects_delete ON public.projects;

CREATE POLICY projects_select ON public.projects FOR SELECT USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
        OR owner_id   = ( SELECT auth.uid() )
        OR created_by = ( SELECT auth.uid() ) )
);

CREATE POLICY projects_insert ON public.projects FOR INSERT WITH CHECK (
  org_id = ( SELECT public.current_org_id() )
  AND ( SELECT public.current_org_role() ) IN ('owner','admin','manager')
);

CREATE POLICY projects_update ON public.projects FOR UPDATE USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) IN ('owner','admin')
        OR owner_id = ( SELECT auth.uid() ) )
);

CREATE POLICY projects_delete ON public.projects FOR DELETE USING (
  org_id = ( SELECT public.current_org_id() )
  AND ( ( SELECT public.current_org_role() ) = 'owner'
        OR owner_id = ( SELECT auth.uid() ) )
);
```

Дальше по матрице инвентаря:

- **companies, contacts**: как projects, но UPDATE-ветка owner_id; DELETE — ('owner','admin') ∨ owner_id ∨ created_by; в SELECT ветки owner_id и created_by.
- **tasks**: ownership = assigned_to ∨ created_by (SELECT/UPDATE), DELETE — ('owner','admin') ∨ created_by.
- **calls, meetings, activities**: ownership = created_by. У activities только SELECT+INSERT (UPDATE/DELETE политик нет — НЕ добавлять).
- **contact_company**: SELECT `USING true` заменить на `org_id = (SELECT public.current_org_id())`. INSERT: org + роль ('owner','admin','manager'). DELETE: org + ('owner','admin').
- **meeting_attendees** (`attendees_own`, ALL): сохранить join-паттерн через meetings, внутри JOIN-условия роль переписать на current_org_role() IN ('owner','admin') ∨ m.created_by = (SELECT auth.uid()). org-граница приходит транзитивно из meetings.
- **leads, activity_log, project_files**: сохранить own-семантику (user_id = auth.uid()) + добавить org-границу `org_id = (SELECT public.current_org_id())` в каждую политику.
- **kpi_entries, call_tracker_days, scheduled_calls**: own (profile_id) + org-граница.
- **profiles**: `profiles_select` заменить на `id = (SELECT auth.uid()) OR public.shares_org_with(id)`. `profiles_update_own` не трогать.
- **organizations**: добавить UPDATE-политику: `USING (id = (SELECT public.current_org_id()) AND (SELECT public.current_org_role()) = 'owner')`.
- **memberships**: write-политики НЕ добавлять (invites — S26; пока управление членством только с service-стороны).
- **user_settings, dashboard_sync, pipelines, pipeline_stages**: не трогать.

### 1.4. Фиксы security advisors (legacy)

```sql
-- convert_lead: закрыть anon-вызов через REST RPC + search_path
REVOKE EXECUTE ON FUNCTION public.convert_lead(uuid,text,text,text,text,text,text,text,numeric,uuid,uuid) FROM PUBLIC, anon;
ALTER  FUNCTION public.convert_lead(uuid,text,text,text,text,text,text,text,numeric,uuid,uuid)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.sync_project_stage() SET search_path = public, pg_temp;
```

### 1.5. Дожать NOT NULL на служебных таблицах (после 022 нулей нет, триггеры заполняют)

```sql
ALTER TABLE public.activities        ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.activity_log      ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.project_files     ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.kpi_entries       ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.call_tracker_days ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.scheduled_calls   ALTER COLUMN org_id SET NOT NULL;
-- ⚠️ service_role-писатели (если появятся) обязаны передавать org_id явно:
-- current_org_id() под service-контекстом возвращает NULL.
```

### 1.6. Деприкация user_role()

НЕ удалять (может использоваться в UI — см. разведку №1). Добавить SQL-комментарий:

```sql
COMMENT ON FUNCTION public.user_role() IS
  'DEPRECATED S24: политики переведены на current_org_role(). Удалить в S25 после переезда UI.';
```

## ЗАДАЧА 2: Типы и хук роли (минимум для S25)

1. `src/types/database.ts` — тип уже есть (OrgRole). Ничего не менять.
2. Новый хук `src/lib/hooks/use-org-role.ts`:
   - React Query, ключ `['org-role']`, staleTime 5 мин
   - `supabase.rpc('current_org_role')` → OrgRole | null
   - Экспорт: `useOrgRole()` — в этом спринте НЕ подключать к UI, только создать
     (S25 переведёт условия видимости кнопок с profiles.role на него).

## ЗАДАЧА 3: docs/schema.md

Секцию «RLS-модель» переписать: org-scoped политики, шаблон, helpers
(current_org_id, is_org_member, current_org_role, shares_org_with), маппинг ролей,
деприкация user_role(). Pending-раздел S23 снять (применён), 023 пометить pending
до применения.

## ПРОВЕРКА (repo-уровень; БД-верификация — на стороне Cowork)

```bash
npx tsc --noEmit 2>&1 | head -10
npm run build 2>&1 | tail -5
# Политики: каждая бизнес-таблица имеет org-конъюнкт
grep -c "current_org_id" supabase/migrations/023_org_rls.sql   # ожидаемо ≥ 30
```

## КОММИТ

```bash
git add supabase/migrations/023_org_rls.sql src/lib/hooks/use-org-role.ts docs/schema.md
git commit -m "Sprint 24: org-scoped RLS — политики на current_org_role(), org-граница на всех tenant-таблицах, фикс advisors (convert_lead anon, search_path)"
```

## Гейт после коммита (Cowork-сторона, не твоя)

1. Security-review миграции (tenant isolation, IDOR, эскалация ролей).
2. Применение 023 через MCP + верификация: smoke под двумя симулированными
   юзерами (member другой org не видит данных первой), advisors повторно.
