# Claude Code Prompt — Sprint S-TEAM-VISIBILITY-1: участник проекта видит проект + файлы (RLS)

## WHY
Обнаружено на гейте C (сверка живых политик прода): **`projects_select` не знает про `project_members`** → рядовой участник команды (org manager/viewer, добавлен в проект, но не owner/admin и не owner_id/created_by) **не может открыть delivery-проект вообще** — ни заметки (п.6), ни доску, ни файлы. `project_files` — own-only → комментарии к файлам (п.9) видит только загрузчик. Это блокирует ценность S-TEAM-ROLES-1 (роли для тех, кто не видит проект) и заранее ломает S-CHAT-1.

**Цель:** участник проекта (`project_members`) получает **SELECT** на свой проект и его файлы. Роли по-прежнему НЕ дают прав — доступ даёт факт членства.

### RBAC (что меняется)
| Субъект | projects SELECT | project_files SELECT | Запись (не меняем) |
|---------|:---:|:---:|---|
| owner/admin (org) | ✅ (было) | ✅ | как было |
| owner_id / created_by проекта | ✅ (было) | ✅ own | как было |
| **участник project_members** | ➕ **теперь ✅** | ➕ **теперь ✅ (файлы проекта)** | без изменений (own) |
| не-участник, не-владелец | ❌ | ❌ | ❌ |

**Только расширение SELECT. Ни одна запись/удаление/чужой доступ не трогается.**

## РАЗВЕДКА (живые политики — Cowork уже снял, привожу для CC-сверки)
```
projects_select (r): org AND (org_role∈{owner,admin} OR owner_id=uid OR created_by=uid)   -- НЕТ project_members
project_files "Users can manage own project files" (ALL): org AND uid=user_id               -- own-only
project_members pm_select (r): org_id=current_org_id()                                       -- org-wide, projects НЕ читает → рекурсии не будет
is_org_member — есть (SECURITY DEFINER); is_project_member — НЕТ (создаём)
```
CC перед правкой: `grep -n "is_org_member\|is_project_member" supabase/migrations/*.sql | head` (взять образец hardening — search_path, REVOKE/GRANT).

## Почему helper, а не EXISTS в политике
Learnings §«self-ref RLS → рекурсия 42P17»: RLS применяется и к подзапросам. Хоть `pm_select` сейчас projects не читает (прямой EXISTS формально не зациклит), **SECURITY DEFINER helper обходит RLS внутри → нулевой риск рекурсии при любых будущих правках** + чисто оборачивается в initplan `(select …)`. Конвенция проекта — как `is_org_member`.

---

## ЗАДАЧА 1 — Миграция 065 (helper + 2 АДДИТИВНЫЕ SELECT-политики)
**Номер 065 сверить** (064 applied; гейт `list_migrations`). **CC пишет+коммитит, НЕ применяет.**

`supabase/migrations/065_team_visibility.sql`:
```sql
-- S-TEAM-VISIBILITY-1: участник project_members видит проект и его файлы (SELECT).
-- ЧИСТО АДДИТИВНО: helper + 2 новые permissive SELECT-политики.
-- Existing политики НЕ трогаем — доступ только расширяется (сузиться не может).

-- 1. Helper: SECURITY DEFINER (обходит RLS → без рекурсии), hardened как is_org_member.
CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.profile_id = (SELECT auth.uid())
  );
$$;
REVOKE ALL ON FUNCTION public.is_project_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_project_member(uuid) TO authenticated;

-- 2. projects: аддитивная SELECT-политика для участников.
CREATE POLICY projects_select_member ON public.projects
  FOR SELECT TO authenticated
  USING (
    org_id = (SELECT public.current_org_id())
    AND (SELECT public.is_project_member(id))
  );

-- 3. project_files: аддитивная SELECT-политика для команды проекта.
--    (existing ALL-политика own остаётся → write по-прежнему own; SELECT = own OR участник)
CREATE POLICY project_files_select_member ON public.project_files
  FOR SELECT TO authenticated
  USING (
    org_id = (SELECT public.current_org_id())
    AND (SELECT public.is_project_member(project_id))
  );
```
- Индекс `project_members(profile_id)` уже есть (`idx_project_members_profile`, сейчас advisor «unused» — после этого будет использоваться).
- **Типы/код НЕ меняются** (только политики+функция) — gen-типы, tsc, компоненты не трогаем.
- Роль в новых политиках — `TO authenticated` (anon без auth.uid() → is_project_member=false, безопасно). Сверить, что existing политики не таргетят иначе; если таргетят конкретную роль иначе — привести к их стилю.

## EDGE CASES / что проверить
- Участник (project_members, НЕ owner) теперь SELECT'ит проект → открывает ProjectDetail, видит заметки read-only, доску, файлы команды.
- Не-участник, не-владелец — по-прежнему НЕ видит (обе новые политики требуют membership).
- Owner/admin/owner_id/created_by — без изменений (их ветки в старых политиках).
- Файлы: участник видит файлы проекта (не только свои); write/delete — по-прежнему own.
- Рекурсии нет (helper SECURITY DEFINER).

## VERIFICATION LABELS
```
Type Safety:            NOT_APPLICABLE (только SQL-политики/функция, кода нет)
RLS Coverage:           WARNING → PASS после смока ролями (аддитивно; helper hardened; рекурсии нет)
Backward Compatibility: PASS (чисто аддитивно — existing SELECT-политики и все write не тронуты; доступ только шире)
Runtime Tested:         NOT_VERIFIED (гейт: apply 065 + симуляция JWT участника + advisors)
Regional Availability:  NOT_APPLICABLE
```

## КОММИТ
```bash
git add supabase/migrations/065_team_visibility.sql
git commit -m "S-TEAM-VISIBILITY-1: участник project_members видит проект и файлы (RLS, аддитивно, helper is_project_member)"
git push
```

## ГЕЙТ Cowork (RLS — тестировать симуляцией ролей ОБЯЗАТЕЛЬНО)
1. `list_migrations` → 065 свободен.
2. `apply_migration` 065.
3. **Симуляция участника** (execute_sql в транзакции): взять uid реального project_member (не owner) и delivery-проект, где он в команде; `set local role authenticated; set local request.jwt.claims=... ; select id from projects where id=<proj>` → должна вернуть строку (было 0). Проверить `project_files` того же проекта.
4. **Симуляция не-участника** → 0 строк (доступ не разъехался).
5. `get_advisors` — ожидается +1 security WARN (is_project_member SECURITY DEFINER — принятый класс, как остальные helper'ы). Больше ничего.
6. Реального смока: залогиниться Иваном Петровым (org manager, участник) → открыть delivery-проект → видит заметки/доску/файлы. Владелец — без регрессий.
- Аддитивность = откат тривиален (DROP 2 политик + функции), но не потребуется.

## NEXT (fast-follow, отдельно)
- **W2:** `canManageDeliveryProject` (owner|admin|owner_id|**created_by**) ⊋ `projects_update` (owner|admin|owner_id) → created_by-only юзер видит UI-редактор заметки, но UPDATE даёт 42501. Дешёвый клиентский фикс: убрать `created_by` из canManage (привести к server-truth) ИЛИ добавить `created_by` в `projects_update` (расширить право). Дефолт — клиентский align (нулевой RLS-риск). Не в этом спринте.
- **Файлы: write для команды?** Сейчас участник видит, но удалять/редактировать может только свои. Если нужно «командное файлохранилище» с общим управлением — отдельное решение.
- docs: schema.md +065 (is_project_member + 2 политики) — S-DOCS-SYNC.

---

## ПОПРАВКИ ПО РЕВЬЮ GROK 8.5/10 (сверено на живых политиках — ЭТО authoritative-версия миграции)

SQL-блокеров нет, но я **переоценил результат**: только projects+files не делают рабочую зону видимой. Сверка прода:
- **W2:** `tasks_select` = `org ∧ (owner|admin ∨ assigned_to ∨ created_by)` — **без membership** → участник видит доску только со своими задачами (дырявую). `tasks` имеет `project_id`+`org_id` → добавляю `tasks_select_member` (тот же аддитивный паттерн). Иначе фича полудохлая.
- **W1:** storage 055 пускает download по своему path (`foldername[1]=auth.uid()`) → участник видит **метаданные+комменты** `project_files`, но чужой файл **не скачает**. Не обещать «скачивает файлы команды». Download по membership — S-TEAM-VISIBILITY-2 (storage.objects, риск выше).
- **W3:** `is_org_member` = GRANT `authenticated, service_role` → helper так же.

### Миграция 065 — ИТОГОВЫЙ SQL (заменяет блок из Задачи 1)
```sql
-- 1. Helper (GRANT authenticated + service_role — паритет is_org_member, W3)
CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.profile_id = (SELECT auth.uid())
  );
$$;
REVOKE ALL ON FUNCTION public.is_project_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_project_member(uuid) TO authenticated, service_role;

-- 2. projects: участник видит проект (заметки п.6, шапка)
CREATE POLICY projects_select_member ON public.projects
  FOR SELECT TO authenticated
  USING (org_id = (SELECT public.current_org_id()) AND (SELECT public.is_project_member(id)));

-- 3. project_files: участник видит МЕТАДАННЫЕ+комменты файлов проекта (п.9)
--    (download чужих — НЕ здесь: storage own-path; write остаётся own через ALL-политику)
CREATE POLICY project_files_select_member ON public.project_files
  FOR SELECT TO authenticated
  USING (org_id = (SELECT public.current_org_id()) AND (SELECT public.is_project_member(project_id)));

-- 4. tasks: участник видит ВСЮ доску проекта (не только свои задачи) — W2
--    write (tasks_update/delete) НЕ трогаем — правит только assigned/created/owner
CREATE POLICY tasks_select_member ON public.tasks
  FOR SELECT TO authenticated
  USING (org_id = (SELECT public.current_org_id()) AND (SELECT public.is_project_member(project_id)));
```
Комментарий в миграции: «НЕ трогает tasks write, task_dependencies, storage, project_columns (уже org-wide)».

### EDGE CASES — ИСПРАВЛЕНО (честные ожидания для гейт-смока)
Участник (project_members, НЕ owner) после 065:
- ✅ открывает ProjectDetail (projects_select_member), шапка/стадии;
- ✅ читает заметки проекта (pinned_note, read-only — canManage=false);
- ✅ видит **полную kanban-доску** (tasks_select_member + project_columns org-wide);
- ✅ видит **список файлов + комментарии** (project_files_select_member);
- ❌ **не скачивает чужие файлы** (storage own-path — S-TEAM-VISIBILITY-2);
- ❌ не редактирует чужие задачи/заметки (write-политики не тронуты — правильно);
- Гант с зависимостями: `task_dependencies_select` не membership-gated, но deps в проде = 0 → неактуально; тривиальный NEXT при надобности.
Не-участник, не-владелец → 0 строк (доступ не разъехался).

### ГЕЙТ — ожидания (обновлено)
JWT-симуляция участника: `projects` строка ✅, `project_files` строки ✅, `tasks` строки проекта ✅; не-участник → 0 везде; **signedUrl чужого файла по-прежнему fail** (storage не трогаем — known gap). Advisors: +1 DEFINER WARN (принято). UI-смок Иваном: открывает проект + видит доску/заметки/список файлов; скачивание чужого — известный gap.

### NEXT (fast-follow, отдельно)
- **S-TEAM-VISIBILITY-2:** storage `project-files` SELECT по membership (download командных файлов) — surface storage.objects, риск выше, path-layout `{uid}/{projectId}/…`.
- **W2 (canManage vs projects_update):** клиентский align — убрать created_by из `canManageDeliveryProject` ИЛИ добавить в `projects_update`. Дефолт — клиентский (нулевой RLS-риск).
- task_dependencies membership-SELECT — только если Гант понадобится команде (deps=0 сейчас).
