# Ревью: S-TEAM-ROLES-1 — 8 проектных ролей + UI-фильтр ERP/IIoT

**Дата:** 2026-07-18  
**Ревьюер:** Grok (верификация по коду `main` @ `2938630` + WIP; crm-architect `schema.md` / `architecture.md` / `learnings.md`)  
**Объект:** `_analysis/sprint-S-TEAM-ROLES-1.md` — CHECK-суперсет 8 ролей (миграция 063) + `rolesForProject` + фильтр дропдаунов  
**Контекст:** P2b / 037 `project_members` (3 роли); org-роли `memberships` **не** трогать; 062 = `task_dep_update_policy` (S-SCHEDULE-1a); предыдущее ревью 8.5/10 **вшито** в приложение «ПОПРАВКИ ПО РЕВЬЮ»; в working tree уже есть **частичный WIP**

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| WHY / 8 ролей / РП ≠ `launch_lead` / без РОП | ✅ |
| Граница: label ≠ RLS; org-роли отдельно | ✅ |
| РАЗВЕДКА + process (CC write, gate apply) | ✅ |
| CHECK-swap суперсет (3 ⊂ 8) | ✅ |
| Нумерация **063** (062 есть; слот логичен) | ✅ (файл уже WIP untracked) |
| `role` text+CHECK → hand-edit `ProjectMemberRole` | ✅ |
| RLS write не читает `project_members.role` | ✅ baseline `pm_*` |
| UI filter + legacy option в edit-select | ✅ |
| `groupMembersByRole` полный ORDER (не фильтр) | ✅ |
| Категории: `Direction` / `ProjectType` | ✅ L140 / L151 |
| Unit tests в скоупе (приложение B1) | ✅ в приложении; ❌ ещё не сделаны в коде |
| Empty-state copy (приложение W1) | 🟡 только в приложении |
| schema.md / skill | 🟡 NEXT / S-DOCS-SYNC (после apply) |
| КОММИТ-блок vs приложение | 🟡 main `git add` без tests |
| DEFAULT на `project_members.role` | 🟡 в БД **нет** DEFAULT (см. W8) |
| Partial WIP (063 + types) | 🟡 не дублировать / довести целиком |

**Оценка: 9/10.** Архитектура, границы RLS и аддитивная миграция верны; прежний блокер B1 **закрыт в тексте спринта** (приложение). Остаются процессные шероховатости (main-коммит без tests, partial WIP, nit про DEFAULT) и желательный empty-state.  
**Рекомендация:** **запускать в CC** (или продолжать WIP), строго с **полным** промптом включая приложение «ПОПРАВКИ». CC **не** apply 063. Фронт с новыми option-values — **после** gate `apply_migration`.

---

## Статус (репо)

| Заход | Live |
|-------|------|
| CHECK 3 роли (baseline) | ✅ `20260712230000_baseline.sql` L1819 `manager\|implementer\|installer` |
| DEFAULT на `project_members.role` | ❌ **нет** — `role text NOT NULL` без DEFAULT (L1816); DEFAULT `'manager'` есть у `invitations`/`memberships` |
| RLS `pm_select/insert/update/delete` | ✅ org + (owner/admin ∨ project `owner_id`/`created_by`); колонка **role не в предикате** |
| `ProjectMemberRole` | 🟡 **WIP** unstaged: уже 8-union в `database.ts` L397–401; HEAD был 3 |
| LABELS / ORDER | ✅ ещё 3 ключа; manager = «Менеджер» (`delivery-phases.ts` L94–101) |
| `rolesForProject` / `PROJECT_ROLES_BY_CATEGORY` | ❌ нет |
| `ProjectTeam` props | ✅ `{ projectId, canManage }` only; selects L131 / L179 |
| Mount | ✅ `ProjectDetail.tsx` L764 `isDelivery && <ProjectTeam …>` |
| Empty-state | ✅ L102 «менеджера, внедренца или монтажника» |
| `062_task_dep_update_policy.sql` | ✅ в репо (S-SCHEDULE-1a) |
| `063_project_member_roles_expand.sql` | 🟡 **untracked WIP** — SQL совпадает со спринтом |
| Unit tests | ✅ `tests/unit/project-members.test.ts` — жёстко 3 роли + «Менеджер» |
| 063 applied в live DB | ❓ гейт: `list_migrations` (не сверено MCP в этом заходе) |

---

## Разведка (факт vs спринт)

| Утверждение спринта | Live |
|---------------------|------|
| `project_members_role_check` = 3 роли | ✅ baseline L1819 |
| `ProjectMemberRole` L~397 | ✅; **сейчас WIP 8** (частично сделано) |
| LABELS/ORDER L~94/101 | ✅ 3 роли |
| `ProjectTeam` add L~179, edit L~131 | ✅ L179–181, L131–133 |
| `ProjectDetail` L~764 | ✅ L764 |
| `groupMembersByRole` + ORDER | ✅ `use-project-members.ts` L31–37 |
| 062 = S-SCHEDULE-1a, 063 свободен | ✅ 062 file; 063 = WIP untracked (не конфликтует с 061/062) |
| role не в RLS | ✅ policies use `current_org_role()` + ownership |
| `Direction` / `ProjectType` | ✅ `database.ts` L140 / L151 |
| delivery → `direction NOT NULL` | ✅ schema `projects_type_pipeline_chk` (delivery + direction) |
| grep DEFAULT на role | 🟡 ловит **memberships/invitations**, не `project_members` |

---

## С чем согласен полностью

### 1. Продуктовая таксономия и границы
8 ключей, матрица ERP/IIoT/internal, РП ≠ руководитель запуска, РОП не в `project_members` — согласовано с WHY. Org-роли (`owner|admin|manager|viewer`) — другой слой; не трогать.

### 2. Миграция 063 (аддитивный CHECK-swap)
`DROP CONSTRAINT` + `ADD CHECK` суперсет: существующие `manager|implementer|installer` остаются валидны. RLS не менять. text+CHECK → `generate_typescript_types` union не поменяет; hand-edit `ProjectMemberRole` — верно. CC пишет+коммитит, **не** apply (learnings / gate).

### 3. UI: фильтр select, дисплей пермиссивный
`rolesForProject` → selectable для add/edit; legacy out-of-category prepend в edit; группировка через полный `PROJECT_MEMBER_ROLE_ORDER` — корректно для «installer на ERP».

### 4. Резолюция категории
```ts
type === 'internal' → internal
direction === 'iiot' → iiot
else → erp
```
Совпадает с `Direction`/`ProjectType`. Команда монтируется только при `isDelivery` → на практике `type='delivery'` + `direction` NOT NULL; fallback erp при странном null — безопасен. internal-набор — задел (NEXT).

### 5. Дефолт `newRole = 'manager'`
`manager` есть во всех трёх массивах BY_CATEGORY; совпадает с текущим `useState`.

### 6. Приложение «ПОПРАВКИ»
B1 (тесты), W1 (empty-state), W4/W6/W7 (типизация/fallback), W5 (порядок деплоя) — правильные и достаточные дополнения к телу спринта.

### 7. Потребители
`PROJECT_MEMBER_ROLE_*` / `ProjectMemberRole` — widget + hooks + constants + tests. Чужих UI-потребителей нет. `supabase.gen.ts` уже `role: string` — gen не блокер.

---

## Блокеры (критично — исправить до запуска)

**Нет блокеров уровня «не запускать CC».**  
Прежний B1 (тесты) **в тексте спринта** (приложение) — обязателен **при исполнении**, иначе `vitest` упадёт. Это задача CC, а не дыра в промпте.

---

## Предупреждения (желательно исправить / держать в голове)

### W1. Empty-state copy (только в приложении)
`ProjectTeam.tsx` L102: «добавь менеджера, внедренца или монтажника» — врёт на ERP. HOW в приложении верен: «добавь участников команды». **Внести в ЗАДАЧУ 3** или явно чеклистом, чтобы CC не пропустил приложение.

### W2. schema.md / skill
NEXT → S-DOCS-SYNC ок. По learnings schema обновляет **гейт при apply**, не обязательно CC. Не блокирует код.

### W3. Main «КОММИТ» vs приложение
Тело L143–146:
```bash
git add …063… database.ts delivery-phases.ts ProjectTeam ProjectDetail
```
**Без** `tests/unit/project-members.test.ts` (и без явного empty-state). Приложение B1 требует `git add` tests.  
**HOW:** расширить КОММИТ-блок:
```bash
git add supabase/migrations/063_project_member_roles_expand.sql \
  src/types/database.ts src/lib/constants/delivery-phases.ts \
  src/components/projects/ProjectTeam.tsx src/components/projects/ProjectDetail.tsx \
  tests/unit/project-members.test.ts
```

### W4. Partial WIP — не пересоздавать вслепую
Уже есть:
- untracked `supabase/migrations/063_project_member_roles_expand.sql` (SQL = спринту; комментарий про DEFAULT чуть неточен)
- unstaged `database.ts` — 8-union `ProjectMemberRole`

Constants / UI / tests **ещё нет** → промежуточное состояние: типы шире ORDER/LABELS. CC должен **дописать** остальное, не плодить второй 063 и не откатывать types без нужды.

### W5. Порядок деплоя (гейт)
UI с `pm`/`analyst`/… **до** apply 063 → CHECK violation. Порядок: `list_migrations` → `apply_migration` 063 → smoke → advisors → потом фронт.

### W6–W7 (приложение, желательно)
- `Record<ProjectMemberRole, string>` + `import type` в `delivery-phases.ts` (цикл: type-only, `database.ts` constants не импортит — ок).
- `rolesForProject(direction: Direction | null, type: ProjectType)`.
- UI: `PROJECT_MEMBER_ROLE_LABELS[r] ?? r`.

### W8. DEFAULT — уточнение факта
У `project_members.role` **нет** `DEFAULT 'manager'` (в отличие от memberships). Спринт формулирует условно («если есть») — безвредно. WIP-комментарий в 063 «DEFAULT не меняем» слегка вводит в заблуждение; insert всегда шлёт `role` с UI. **Не менять** колонку — верно.

### W9. Тесты `groupMembersByRole` сохранить
Ниже L42 в `project-members.test.ts` — кейсы группировки + `hasTaskProgress`. Приложение: не удалять. После ORDER из 8 пустые группы по-прежнему скрываются — старые ожидания `['manager','installer']` остаются валидны; опционально добавить кейс с `pm`/`analyst`.

---

## Пропущенные места

| Файл | Строки / статус | Действие |
|------|-----------------|----------|
| `supabase/migrations/063_project_member_roles_expand.sql` | untracked WIP | оставить/сверить; **не** apply из CC |
| `src/types/database.ts` | L397–401 WIP 8-union | оставить; дописать комментарий ок |
| `src/lib/constants/delivery-phases.ts` | L94–101 | LABELS×8, ORDER×8, BY_CATEGORY, `rolesForProject` |
| `src/components/projects/ProjectTeam.tsx` | props; L102; L131; L179 | direction/type, selectable, empty-state, fallback label |
| `src/components/projects/ProjectDetail.tsx` | L764 | `direction={project.direction} type={project.type}` |
| `tests/unit/project-members.test.ts` | L9–27 + ниже | B1 rewrite + сохранить group/hasTaskProgress |
| hooks / RLS SQL | — | **не трогать** |
| `src/types/supabase.gen.ts` | `role: string` | не обязателен |

---

## Чеклист crm-architect

- [x] РАЗВЕДКА в начале  
- [x] Реальные table/column (`project_members.role`, constraint name)  
- [x] Реальные пути (`ProjectTeam`, `ProjectDetail`, `delivery-phases`, `database.ts`)  
- [x] learnings: CC не apply; text+CHECK; gate apply  
- [x] Миграция отдельным файлом  
- [x] RLS / `org_id`: не ломаем; role не в write-политиках  
- [x] Нет новых SECURITY DEFINER  
- [x] Нет `flowType: 'implicit'`  
- [x] CSS out of scope  
- [ ] schema.md в этом же заходе — **отложено в NEXT** (приемлемо; гейт/S-DOCS-SYNC)

---

## Предлагаемые правки в спринт (опционально, не блокер)

1. В **КОММИТ** добавить `tests/unit/project-members.test.ts` (и empty-state уже в ProjectTeam).  
2. В **ЗАДАЧУ 3** одной строкой: empty-state W1 (не только в приложении).  
3. В РАЗВЕДКЕ/задаче 1: явно «`project_members.role` **без** DEFAULT; DEFAULT у memberships не трогать».  
4. Пометка **WIP**: 063 + `ProjectMemberRole` уже начаты — continue, don't recreate.

---

## Чеклист перед / во время CC

- [ ] Прочитать **всё** приложение «ПОПРАВКИ»  
- [ ] Не плодить второй `063_*`; дописать constants/UI/tests  
- [ ] B1: `tests/unit/project-members.test.ts` + `git add`  
- [ ] W1: нейтральный empty-state  
- [ ] CC **не** `apply_migration`  
- [ ] Superset CHECK only; RLS policies не трогать  
- [ ] UI: ERP без installer/implementer/launch_lead; IIoT с ними; legacy в edit-select  
- [ ] `npx vitest run tests/unit/project-members.test.ts`  
- [ ] `npx tsc --noEmit`  
- [ ] Gate: `list_migrations` → apply 063 → smoke (ERP/IIoT dropdown + legacy) → `get_advisors`  
- [ ] Деплой фронта **после** apply  

---

## Итог

Спринт зрелый: правильная граница «ярлык ≠ RLS», аддитивная миграция, UI-фильтр без потери легаси, приложение закрывает прежний must-fix по тестам. **GO для Claude Code** с исполнением приложения и аккуратным continue поверх WIP (063 + types). Остаточный риск — пропуск appendix при коммите/empty-state и выкат UI раньше apply 063.
