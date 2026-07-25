# Ревью: S-TEAM-VISIBILITY-1 — SELECT проекта / файлов / задач для `project_members`

**Дата:** 2026-07-18  
**Ревьюер:** Grok (верификация по коду `main` @ `0ac3189`; crm-architect `schema.md` / `architecture.md` / `learnings.md`)  
**Объект:** `_analysis/sprint-S-TEAM-VISIBILITY-1.md` — аддитивный RLS: helper `is_project_member` + SELECT на `projects` / `project_files` / `tasks` для участников команды  
**Контекст:** S-TEAM-ROLES-1 (063 роли-ярлыки); S-PROJECT-WORKSPACE-1 (064 `comment`); baseline `projects_select` / `tasks_select` / files own-only; 055 storage own-path; learnings §self-ref RLS 42P17 / SECURITY DEFINER; предыдущее ревью 8.5/10 (W1–W3) вшито в хвост спринта

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| WHY / блокировка ролей и S-CHAT | ✅ |
| РАЗВЕДКА vs baseline | ✅ |
| Helper DEFINER + `search_path` + initplan + ACL | ✅ |
| Аддитивные SELECT (projects + files + **tasks**) | ✅ |
| Write / storage / existing policies не трогать | ✅ |
| Честные EDGE (download ❌, write ❌) | ✅ (после правок) |
| GRANT `service_role` (паритет `is_org_member`) | ✅ (итоговый SQL) |
| Имена колонок / индексы / `pm_select` | ✅ |
| W2 `canManage` vs `projects_update` (NEXT) | ✅ факт в коде |
| Номер **065** / CC не apply | ✅ процесс; **файл уже в git** |
| Два SQL-блока (Задача 1 vs «ИТОГОВЫЙ») | 🟡 |
| `task_dependencies` NEXT | 🟡 неточность (SELECT уже org-wide) |
| schema.md / skill post-apply | 🟡 S-DOCS-SYNC |
| Live `list_migrations` / apply 065 | 🟡 только гейт |

**Оценка: 9/10.** Узкий, правильный RLS-фикс; правки после 8.5 закрыли overclaim (доска + download) и ACL. SQL согласован с baseline и skill.  
**Рекомендация:** **в CC заново писать миграцию не нужно** — `supabase/migrations/065_team_visibility.sql` уже на `main` (`0ac3189`) и совпадает с «ИТОГОВЫМ SQL». Остаётся **гейт Cowork: list_migrations → apply 065 → JWT-симуляции → advisors → UI-смок**. Если CC всё же гоняют — только сверка файла с итоговым блоком, **не apply**.

---

## Статус (репо)

| Заход | Live / git |
|-------|------------|
| `projects_select` без `project_members` | ✅ baseline L3607: org ∧ (owner\|admin ∨ owner_id ∨ created_by) |
| `project_files` ALL own-only | ✅ baseline L3180: org ∧ `user_id = auth.uid()` |
| `tasks_select` без membership | ✅ baseline L3656: owner\|admin ∨ assigned_to ∨ created_by |
| `project_columns_select` org-wide | ✅ baseline L3580 |
| `pm_select` org-wide, projects не читает | ✅ baseline L3542 |
| `is_project_member` | ✅ **создан в 065** (L9–23) |
| `is_org_member` образец | ✅ baseline L641–648; REVOKE/GRANT L3779–3781 |
| `idx_project_members_profile` | ✅ baseline L2378 |
| unique `(project_id, profile_id)` | ✅ baseline L2159–2160 |
| Storage `project-files` SELECT | ✅ 055 L29–31: path `[1] = auth.uid()` |
| `task_dep_select` | ✅ 048 L105–106: **org-wide** (не membership) |
| `canManageDeliveryProject` + `created_by` | ✅ `project-permissions.ts` L10–17 |
| `projects_update` без `created_by` | ✅ baseline L3611 |
| `064_project_files_comment.sql` | ✅ в репо |
| `065_team_visibility.sql` | ✅ **есть**, commit `0ac3189`, 3 политики + helper |
| Apply 065 в проде | ❓ только `list_migrations` на гейте |
| Prior review `review-sprint-S-TEAM-VISIBILITY-1` | ✅ был (8.5); спринт новее (22:28 > 22:24) |

---

## Разведка (факт vs спринт)

| Утверждение спринта | Проверка |
|---------------------|----------|
| `projects_select` = org ∧ (owner\|admin ∨ owner_id ∨ created_by), нет members | ✅ baseline L3607 |
| `project_files` ALL own | ✅ L3180 |
| `tasks_select` без membership → «дырявая» доска | ✅ L3656; `useProjectBoard` `.eq('project_id')` — RLS отфильтрует |
| `pm_select` org-wide → прямой EXISTS формально не 42P17 | ✅ L3542; helper всё равно правилен (learnings) |
| `is_org_member` есть; `is_project_member` до 065 — нет | ✅ (до коммита); теперь в 065 |
| 064 applied; 065 слот | 🟡 064/065 в git; live — гейт |
| Индекс `idx_project_members_profile` | ✅; EXISTS ещё выигрывает от UNIQUE |
| Storage own-path → download чужих fail | ✅ 055 + `useDownloadProjectFile` L101–103 |
| Аддитивность (permissive OR) | ✅ PG OR-ит SELECT-политики |
| `TO authenticated` | ✅ ок; baseline projects/files без TO — стиль как `pm_*` |
| Роль в `project_members` не даёт прав | ✅ 063: CHECK 8 ролей; RLS membership = факт строки |
| Итоговый SQL = файл 065 | ✅ helper + 3 policy + GRANT service_role |
| Задача 1 SQL (2 policy, GRANT без service_role) | 🟡 **устарел** относительно итога |

---

## С чем согласен полностью

### 1. WHY
Рядовой `project_members` (org manager/viewer, не owner/admin, не owner_id/created_by) не проходит `projects_select` → server `projects/[id]/page.tsx` / client `useProject` → «Проект не найден» (`ProjectDetail.tsx` ~L223). Роли 063 бесполезны без SELECT. `project_files` own-only режет п.9 (чужие метаданные/комменты). Диагноз точный.

### 2. Helper, не inline EXISTS
Learnings §self-ref RLS → 42P17. `SECURITY DEFINER` + `SET search_path = public, pg_temp` + initplan `(SELECT …)` — конвенция `is_org_member`. Тело: `project_id` + `profile_id = (SELECT auth.uid())` — корректные колонки (`project_members.profile_id`).

### 3. Скоуп после правок ревью
Итоговый 065:
1. `is_project_member`
2. `projects_select_member` — ProjectDetail, pinned_note RO
3. `project_files_select_member` — список + comment (не storage)
4. `tasks_select_member` — полная kanban-доска

Write (`tasks_update/delete`, files ALL own, `projects_update`) не тронут — верно.

### 4. EDGE / gate honesty
Участник: проект ✅, заметка RO ✅, доска ✅, список файлов ✅; download чужих ❌; write чужого ❌. Non-member → 0. Advisors +1 DEFINER WARN — принятый класс.

### 5. Процесс
CC не apply; gate: JWT member/non-member + UI-смок Иваном. Откат: DROP 3 policies + function. schema.md → S-DOCS-SYNC.

### 6. W2 (canManage) — вне скоупа
`canManageDeliveryProject` ⊋ `projects_update` (created_by) — подтверждено. NEXT клиентский align — верный дефолт.

---

## Блокеры (критично — исправить до запуска)

**Нет SQL/schema-блокеров.** Имена таблиц/колонок, hardening, org-first, аддитивность, границы SELECT — согласованы с baseline и skill.

Единственный операционный caveat: **миграция уже в `main`**. Повторный «CC: write + commit» без проверки даст no-op или конфликт ожиданий, не баг SQL.

---

## Предупреждения (желательно исправить)

### W1. Два SQL-блока в одном спринте
- **Задача 1:** 2 политики, `GRANT … TO authenticated` only  
- **«ИТОГОВЫЙ SQL»:** 3 политики + `service_role` — authoritative; **= файл 065**

**Риск:** CC/исполнитель возьмёт верхний блок.  
**Действие:** пометить Задачу 1 deprecated / «заменено итогом» одной строкой; при re-run сверять только `065_team_visibility.sql`.

### W2. Статус спринта vs репо
Спринт формулирует «CC пишет+коммитит» — **уже сделано** (`0ac3189`, msg совпадает по смыслу).  
**Действие:** для гейта: «миграция в git → list → apply → smoke», не «написать 065».

### W3. `task_dependencies` NEXT — неточность
Спринт: «membership-SELECT при надобности Ганта».  
Факт: `task_dep_select` (048 L105–106) = **`org_id = current_org_id()`** — org-wide, шире membership. После `tasks_select_member` Гант получает tasks; deps уже видны org-wide.  
**Действие:** NEXT по deps снять или переформулировать («не блокер; SELECT уже org-wide»).

### W4. «064/065 applied» только на гейте
Git ≠ prod history. Если 064 pending — порядок 064→065. `CREATE POLICY` не идемпотентен — повторный apply упадёт (норма для one-shot).

### W5. schema.md / crm-architect
После apply: `is_project_member` + 3 policy names в schema.md / skill — S-DOCS-SYNC. Не блокер исполнения.

### W6. Nit: имя политики deps
Спринт пишет `task_dependencies_select`; в коде — `task_dep_select`. На SQL 065 не влияет.

### W7. UI download gap (known)
После 065 список чужих файлов появится; `createSignedUrl` на чужой path → fail (055). UX: «скачать» без понятной ошибки. Acceptable known gap → S-TEAM-VISIBILITY-2; не раздувать 065 storage.

---

## Пропущенные места (grep)

| Файл | Факт | Действие |
|------|------|----------|
| baseline L3607 | `projects_select` | покрыто `projects_select_member` |
| baseline L3180 | files own ALL | + SELECT member; write own |
| baseline L3656 | `tasks_select` | + `tasks_select_member` |
| baseline L3580 | columns org-wide | ничего |
| 055 L29–31 | storage own-path | NEXT VISIBILITY-2 |
| 048 L105–106 | `task_dep_select` org-wide | NEXT deps не нужен |
| `project-permissions.ts` L10–17 | canManage + created_by | NEXT W2 |
| `use-project-files.ts` L97–115 | signed URL | storage gap |
| `use-tasks.ts` ~L92–102 | `useProjectBoard` | после 065 полная доска |
| `ProjectDetail.tsx` ~L223 | empty project | member откроет |
| `065_team_visibility.sql` | уже = итог | CC write skip |

Пропущенных **таблиц для этого скоупа** (открыть delivery + доска + список файлов) нет. Quotes — org-wide SELECT, tab только `type=client` — N/A для delivery.

---

## Предлагаемые правки в спринт (косметика)

1. В шапке/Задаче 1: «**065 уже в git (`0ac3189`); CC не переписывать; гейт apply.**»  
2. Задачу 1 SQL пометить superseded итоговым блоком (или удалить дубль).  
3. NEXT deps: убрать/поправить (SELECT уже org-wide).  
4. Остальное (EDGE, gate, VISIBILITY-2, canManage) — оставить.

---

## crm-architect checklist

- [x] РАЗВЕДКА в начале  
- [x] Реальные table/column (`projects`, `project_files`, `tasks`, `project_members.profile_id`, `project_id`, `org_id`)  
- [x] Пути миграций; CC ≠ apply  
- [x] learnings: DEFINER, search_path, initplan, 42P17  
- [x] Миграция отдельным файлом  
- [x] org boundary first; роль org не расширяем  
- [x] New fn: SECURITY DEFINER + search_path + REVOKE + GRANT authenticated **+ service_role**  
- [x] Нет `flowType: 'implicit'`  
- [x] DELETE/CASCADE не в скоупе  
- [x] CSS N/A  
- [ ] schema.md после apply — S-DOCS-SYNC  

---

## Чеклист перед гейтом / CC

- [x] Итоговый SQL = `supabase/migrations/065_team_visibility.sql` (3 policy + helper)  
- [x] Не переписывать 065 без diff к итогу  
- [ ] `list_migrations` — 064 status; 065 pending/absent в history  
- [ ] `apply_migration` 065 (Cowork, не CC)  
- [ ] JWT участник: `projects` row ✅, `project_files` ✅, `tasks` проекта ✅  
- [ ] JWT не-участник: 0 везде  
- [ ] signedUrl чужого path — по-прежнему fail (expected)  
- [ ] `get_advisors` — +1 DEFINER WARN ок  
- [ ] UI: Иван открывает delivery → шапка/заметка RO/доска/список файлов  
- [ ] Не трогать: write RLS, storage, gen-types, UI  
- [ ] schema.md — S-DOCS-SYNC post-apply  

**Итог:** спринт (итоговая версия) **годен**; SQL **уже закоммичен**. Главный следующий шаг — **apply + ролевые симуляции на гейте**, не повторная разработка в CC.
