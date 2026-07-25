# Claude Code Prompt — Sprint S-TEAM-ROLES-1: расширение проектных ролей + фильтр по типу проекта

## WHY
Фидбек живого юза (Олег, п.1+5): в команде проекта сейчас только 3 роли (`manager`/`implementer`/`installer` = менеджер/внедренец/монтажник). Нужны полноценные роли внедрения (РП, аналитик, архитектор, программист, руководитель запуска), причём набор зависит от типа проекта: ERP-проектам не нужны монтажник/внедренец, IIoT — нужны.

**Решения (утв. Олегом):**
- **8 ролей** в одном DB-enum (суперсет), UI фильтрует доступные по типу проекта. РП и «руководитель запуска» — РАЗНЫЕ роли (РП над проектом, РЗ на go-live).
- **РОП — НЕ добавляем** в project_members (это sales-должность над воронкой, не функция на проекте внедрения).

**Граница (важно, не нарушать):** `project_members.role` — это ЯРЛЫК функции, он **не участвует в RLS** (write-политики project_members завязаны на owner/admin ∨ владельца проекта, роль не читают — сверено по схеме). Org-роли (owner/admin/manager/viewer в memberships) — НЕ трогаем. Это разные слои.

## РАЗВЕДКА (живая БД + код — до правок)
```bash
cd ~/Downloads/dashboard-crm
# 1. Текущий CHECK на живой БД (НЕ доверять только папке миграций — learnings §«миграции ≠ источник истины»):
#    (Cowork-гейт сверит через Supabase MCP information_schema.check_constraints;
#     CC — грепом по baseline:)
grep -n "project_members_role_check" supabase/migrations/20260712230000_baseline.sql   # ожидаем ARRAY['manager','implementer','installer']
grep -n "role" supabase/migrations/*.sql | grep -i "project_members\|DEFAULT 'manager'"  # есть ли DEFAULT на role
# 2. Тип + константы:
grep -n "ProjectMemberRole" src/types/database.ts                     # L~397 union из 3
grep -n "PROJECT_MEMBER_ROLE_LABELS\|PROJECT_MEMBER_ROLE_ORDER" src/lib/constants/delivery-phases.ts  # L~94/101
# 3. UI команды:
sed -n '55,185p' src/components/projects/ProjectTeam.tsx              # add-select L~179, edit-select L~131, grouped L~106
grep -n "ProjectTeam" src/components/projects/ProjectDetail.tsx        # монтаж L~764 (isDelivery only)
grep -n "project\.\(direction\|type\)\|const project\|useProject\b" src/components/projects/ProjectDetail.tsx | head  # откуда взять direction/type
grep -n "groupMembersByRole\|PROJECT_MEMBER_ROLE_ORDER" src/lib/hooks/use-project-members.ts  # группировка
```

## Финальная таксономия (8 ролей)
| key | лейбл | ERP | IIoT | internal |
|-----|-------|:--:|:--:|:--:|
| `pm` | Руководитель проекта | ✓ | ✓ | ✓ |
| `manager` | Менеджер проекта *(есть)* | ✓ | ✓ | ✓ |
| `analyst` | Аналитик | ✓ | ✓ | ✓ |
| `architect` | Архитектор | ✓ | | |
| `developer` | Программист | ✓ | | |
| `implementer` | Внедренец *(есть)* | | ✓ | |
| `installer` | Монтажник *(есть)* | | ✓ | |
| `launch_lead` | Руководитель запуска | | ✓ | |

Категория проекта: `type='internal'` → internal; иначе по `direction` (`iiot`→iiot, иначе erp). Команда сейчас монтируется только на delivery (у него direction NOT NULL = erp/iiot), internal-набор — задел на будущее (см. NEXT).

---

## ЗАДАЧА 1 — Миграция 063 (аддитивный CHECK-swap)
**⚠️ Номер 063 сверить:** backlog=062 применена (S-SCHEDULE-1a). Гейт подтвердит через `list_migrations`. **CC пишет+коммитит, НЕ применяет** (применяет гейт Cowork через `apply_migration`).

Новый файл `supabase/migrations/063_project_member_roles_expand.sql`:
```sql
-- S-TEAM-ROLES-1: расширение project_members.role до 8 значений.
-- Аддитивно: новый набор — суперсет старого (manager/implementer/installer ∈ new),
-- ни одна существующая строка не нарушит CHECK. role НЕ участвует в RLS (только ярлык).
-- Применяется гейтом атомарно (без BEGIN/COMMIT — конвенция apply_migration).

ALTER TABLE public.project_members DROP CONSTRAINT project_members_role_check;

ALTER TABLE public.project_members ADD CONSTRAINT project_members_role_check
  CHECK (role = ANY (ARRAY[
    'pm','manager','analyst','architect','developer',
    'implementer','installer','launch_lead'
  ]::text[]));
```
- НЕ менять DEFAULT (если есть `DEFAULT 'manager'` — оставить, `manager` валиден и во всех категориях).
- НЕ трогать RLS-политики project_members (роль в них не читается).
- `role` — это `text`+CHECK, НЕ pg enum → `generate_typescript_types` тип не поменяет; `ProjectMemberRole` в `database.ts` правим руками (Задача 2).

## ЗАДАЧА 2 — Типы + константы
`src/types/database.ts` (~L397):
```ts
export type ProjectMemberRole =
  | 'pm' | 'manager' | 'analyst' | 'architect' | 'developer'
  | 'implementer' | 'installer' | 'launch_lead';
```
`src/lib/constants/delivery-phases.ts`:
```ts
export const PROJECT_MEMBER_ROLE_LABELS: Record<string, string> = {
  pm: 'Руководитель проекта',
  manager: 'Менеджер проекта',
  analyst: 'Аналитик',
  architect: 'Архитектор',
  developer: 'Программист',
  implementer: 'Внедренец',
  installer: 'Монтажник',
  launch_lead: 'Руководитель запуска',
};
// полный порядок отображения (группировка показывает любую присутствующую роль)
export const PROJECT_MEMBER_ROLE_ORDER = [
  'pm','manager','analyst','architect','developer','implementer','installer','launch_lead',
] as const;

// селектируемые роли по категории проекта (UI-фильтр; БД хранит один суперсет)
export const PROJECT_ROLES_BY_CATEGORY: Record<'erp'|'iiot'|'internal', ProjectMemberRole[]> = {
  erp:      ['pm','manager','analyst','architect','developer'],
  iiot:     ['pm','manager','analyst','implementer','installer','launch_lead'],
  internal: ['pm','manager','analyst'],
};
export function rolesForProject(direction: string | null, type: string): ProjectMemberRole[] {
  if (type === 'internal') return PROJECT_ROLES_BY_CATEGORY.internal;
  if (direction === 'iiot') return PROJECT_ROLES_BY_CATEGORY.iiot;
  return PROJECT_ROLES_BY_CATEGORY.erp; // delivery/client с erp — дефолт
}
```
(`import type { ProjectMemberRole }` в этом файле — учесть циклы; если constants уже импортит из database.ts, ок.)

## ЗАДАЧА 3 — UI: фильтр дропдаунов по типу проекта
`ProjectDetail.tsx` (~L764) — прокинуть direction+type:
```tsx
{isDelivery && <ProjectTeam projectId={projectId} canManage={canManage}
  direction={project.direction} type={project.type} />}
```
(взять `direction`/`type` из уже загруженного объекта проекта — РАЗВЕДКА покажет имя переменной.)

`ProjectTeam.tsx`:
1. Пропсы: `+ direction: string | null; type: string;`
2. `const selectable = rolesForProject(direction, type);`
3. **Add-member select** (~L179): `PROJECT_MEMBER_ROLE_ORDER.map` → `selectable.map`.
4. **Edit-member select** (~L131): options = `selectable`, НО если `m.role` не входит в `selectable` (легаси-участник роли вне категории) — добавить его в начало, чтобы не потерять текущее значение:
   ```tsx
   {(selectable.includes(m.role) ? selectable : [m.role, ...selectable]).map((r) => (
     <option key={r} value={r}>{PROJECT_MEMBER_ROLE_LABELS[r]}</option>
   ))}
   ```
5. Дефолт `newRole`: оставить `'manager'` (в каждой категории присутствует). Если предпочитаешь — `selectable[0]`, но не обязательно.
6. **Группировку НЕ фильтровать**: `groupMembersByRole` в `use-project-members.ts` итерирует полный `PROJECT_MEMBER_ROLE_ORDER` — оставить (дисплей пермиссивный: показывает любую роль с участниками, включая легаси). Пустые группы уже скрываются.

## EDGE CASES
- Легаси-участник с ролью вне категории (напр. installer на ERP после общего периода) — виден в списке (группировка полная) и его роль остаётся в edit-select (п.4).
- ERP-delivery: дропдаун без монтажника/внедренца/РЗ; IIoT — с ними. internal — команда пока не монтируется (delivery-only гейт), набор задел.
- Нативный `<select>` кросс-браузерно не темизируется (см. S-UI-POLISH-1) — не в скоупе, только сокращаем список опций.

## VERIFICATION LABELS
```
Type Safety:            PASS (union 8; ORDER as const; BY_CATEGORY: ProjectMemberRole[]; tsc 0)
RLS Coverage:           PASS (не менялась; role не читается ни одной политикой — сверено по схеме)
Backward Compatibility: PASS (CHECK-суперсет, строки валидны; группировка полная — легаси видно)
Runtime Tested:         NOT_VERIFIED (гейт: apply_migration 063 + смок ролями + advisors)
Regional Availability:  NOT_APPLICABLE
```

## КОММИТ
```bash
git add supabase/migrations/063_project_member_roles_expand.sql \
        src/types/database.ts src/lib/constants/delivery-phases.ts \
        src/components/projects/ProjectTeam.tsx src/components/projects/ProjectDetail.tsx
git commit -m "S-TEAM-ROLES-1: 8 проектных ролей (миграция 063) + UI-фильтр по типу проекта (ERP/IIoT/internal)"
git push
```
Гейт Cowork: `list_migrations` (номер) → `apply_migration` 063 → смок (добавить участника на ERP-проекте — нет монтажника; на IIoT — есть; редактирование роли; легаси-роль не теряется) → `get_advisors`.

## NEXT (не в этом спринте — флаг)
- Команда сейчас только на delivery (`isDelivery` гейт, ProjectDetail:764). Включение команды на **internal/client**-проектах (Олег упомянул «внутренний» как категорию) — отдельное решение: затрагивает гейт монтирования + проверку RLS для non-delivery. internal-набор ролей уже готов, активировать при расширении.
- Долг docs: строка про 063 + 8 ролей в schema.md/skill (S-DOCS-SYNC).

---

## ПОПРАВКИ ПО РЕВЬЮ GROK 8.5/10 (сверено — учесть при исполнении)

**B1 (БЛОКЕР) — обновить `tests/unit/project-members.test.ts`.** Он жёстко кодит v1 → после смены ORDER/label `vitest run` красный:
- L10: `PROJECT_MEMBER_ROLE_ORDER).toEqual(['manager','implementer','installer'])` → падает.
- L24: `PROJECT_MEMBER_ROLE_LABELS.manager).toBe('Менеджер')` → падает (новый лейбл «Менеджер проекта»).

Переписать describe-блок под 8 ролей + добавить `rolesForProject` (W3) и `git add tests/unit/project-members.test.ts` в commit:
```ts
import { PROJECT_MEMBER_ROLE_LABELS, PROJECT_MEMBER_ROLE_ORDER,
         PROJECT_ROLES_BY_CATEGORY, rolesForProject } from '@/lib/constants/delivery-phases';

describe('project_members — роли (S-TEAM-ROLES-1, миграция 063)', () => {
  test('8 ролей в ORDER', () => {
    expect(PROJECT_MEMBER_ROLE_ORDER).toEqual([
      'pm','manager','analyst','architect','developer','implementer','installer','launch_lead',
    ]);
  });
  test('лейблы полны и согласованы с ORDER', () => {
    for (const role of PROJECT_MEMBER_ROLE_ORDER) expect(PROJECT_MEMBER_ROLE_LABELS[role]).toBeTruthy();
    expect(Object.keys(PROJECT_MEMBER_ROLE_LABELS).sort())
      .toEqual([...PROJECT_MEMBER_ROLE_ORDER].sort());
  });
  test('ключевые лейблы', () => {
    expect(PROJECT_MEMBER_ROLE_LABELS.pm).toBe('Руководитель проекта');
    expect(PROJECT_MEMBER_ROLE_LABELS.manager).toBe('Менеджер проекта');
    expect(PROJECT_MEMBER_ROLE_LABELS.launch_lead).toBe('Руководитель запуска');
  });
  test('rolesForProject: ERP без монтажника/внедренца/РЗ', () => {
    const erp = rolesForProject('erp', 'delivery');
    expect(erp).toContain('architect'); expect(erp).toContain('developer');
    expect(erp).not.toContain('installer'); expect(erp).not.toContain('launch_lead');
  });
  test('rolesForProject: IIoT с монтажником/внедренцем/РЗ, без архитектора/программиста', () => {
    const iiot = rolesForProject('iiot', 'delivery');
    expect(iiot).toContain('implementer'); expect(iiot).toContain('installer');
    expect(iiot).toContain('launch_lead'); expect(iiot).not.toContain('architect');
  });
  test('rolesForProject: internal — только pm/manager/analyst', () => {
    expect(rolesForProject(null, 'internal')).toEqual(['pm','manager','analyst']);
  });
});
```
(проверить, использует ли старый файл `groupMembersByRole`-хелперы ниже L28 — сохранить/адаптировать те кейсы, не удалять полезное.)

**W1 — empty-state copy (ProjectTeam ~L101):** сейчас `' — добавь менеджера, внедренца или монтажника'` вводит в заблуждение на ERP. Заменить нейтрально:
```tsx
{canManage && ' — добавь участников команды'}
```

**W4 — строгая типизация лейблов:** `PROJECT_MEMBER_ROLE_LABELS: Record<ProjectMemberRole, string>` (не `Record<string,string>`) — tsc поймает пропущенный ключ. (Если ломает индексацию `[m.role]` где role уже `ProjectMemberRole` — ок; для внешних строк см. W7.)

**W6 — типы параметров `rolesForProject`:** `direction: Direction | null, type: ProjectType` (оба типа есть: `database.ts` L140/L151) вместо `string` — автокомплит + защита.

**W7 (nit) — fallback лейбла:** в UI использовать `PROJECT_MEMBER_ROLE_LABELS[m.role] ?? m.role` на случай неожиданной строки из БД до обновления types.

**W5 — порядок деплоя (гейту):** фронт с новыми option-values НЕ выкатывать раньше `apply_migration 063` — иначе insert/update `pm`/`analyst`/… → CHECK violation. Порядок в спринте верный (apply → smoke → advisors), просто держать в голове.

Итог ревью: архитектура и границы — GO; единственный must-fix до CC — **B1 (тесты)**, остальное — дешёвые улучшения. Verify: `npx vitest run tests/unit/project-members.test.ts` + `npx tsc --noEmit`.
