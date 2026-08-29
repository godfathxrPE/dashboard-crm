# Prompt Examples

Five complete examples across different task types and stacks.
Use as reference for structure, level of detail, and verification patterns.

---

## Example 1: Feature — Add Search to a List Page

**Context**: Next.js app, need to add search/filter to an existing entity list.

```markdown
# Claude Code Prompt — Add Search to Contacts Page

## РАЗВЕДКА

```bash
# 1. Current contacts page structure
head -40 src/app/contacts/page.tsx

# 2. How data is fetched
grep -n "useQuery\|useContacts\|supabase" src/app/contacts/page.tsx | head -10

# 3. Check if search already exists somewhere
grep -rn "search\|filter\|query" src/app/contacts/page.tsx | head -10

# 4. Current hook — what fields are available
grep -n "select\|from(" src/lib/hooks/use-contacts.ts | head -10
```

## ЗАДАЧА 1: Add search state to contacts page

В `src/app/contacts/page.tsx`:

1. Добавить useState для поиска:
```tsx
const [search, setSearch] = useState('');
```

2. Добавить инпут поиска над таблицей:
```tsx
<input
  type="search"
  placeholder="Поиск по имени, компании, email..."
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  className="..."
  aria-label="Поиск контактов"
/>
```

## ЗАДАЧА 2: Filter data client-side

Добавить фильтрацию после получения данных:

```tsx
const filtered = useMemo(() => {
  if (!search.trim()) return contacts;
  const q = search.toLowerCase();
  return contacts.filter(c =>
    c.first_name?.toLowerCase().includes(q) ||
    c.last_name?.toLowerCase().includes(q) ||
    c.email?.toLowerCase().includes(q) ||
    c.phone?.includes(q)
  );
}, [contacts, search]);
```

Использовать `filtered` вместо `contacts` в рендере таблицы.

## ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -10
grep -n "filtered\|search" src/app/contacts/page.tsx | head -10
```

## КОММИТ

```bash
git add .
git commit -m "feat(contacts): add client-side search by name, email, phone"
```
```

**Why this works**: simple client-side filter is good for <1000 records.
For larger datasets, move filtering to Supabase query with `.ilike()`.

---

## Example 2: Bug Fix — Modal Doesn't Close After Submit

**Context**: React app, modal stays open after form submission.

```markdown
# Claude Code Prompt — Fix: Modal Stays Open After Submit

## РАЗВЕДКА

```bash
# 1. Find the modal component
grep -rn "TaskModal\|task.*modal" src/components/modals/ --include="*.tsx" -l

# 2. Check onSuccess / close handler
grep -n "onSuccess\|onClose\|onOpenChange\|setOpen" src/components/modals/TaskModal.tsx | head -10

# 3. Check how mutation handles success
grep -n "onSuccess\|onSettled\|mutate\|mutateAsync" src/components/modals/TaskModal.tsx | head -15

# 4. Check how modal is opened from parent
grep -rn "TaskModal" src/ --include="*.tsx" | head -10
```

## ГИПОТЕЗА

Modal's `onSuccess` callback from the mutation likely runs BEFORE the modal's
`onOpenChange` is called, or `onSuccess` isn't wired to close the modal.

## ЗАДАЧА 1: Verify and fix close-on-success

В `src/components/modals/TaskModal.tsx`:

Найти mutation onSuccess:
```bash
sed -n '/useMutation\|create\|update/,/onSuccess/p' src/components/modals/TaskModal.tsx | head -20
```

Убедиться что onSuccess вызывает close:
```tsx
onSuccess: () => {
  form.reset();
  onOpenChange(false);  // ← если этого нет — добавить
},
```

Если `onOpenChange` не доступен в scope мутации — проверить, передаётся ли
как prop и доступен ли в замыкании.

## ПРОВЕРКА

```bash
grep -n "onOpenChange\|onSuccess" src/components/modals/TaskModal.tsx
npx tsc --noEmit 2>&1 | head -10
```

## КОММИТ

```bash
git add .
git commit -m "fix(modal): close TaskModal on successful submit"
```
```

---

## Example 3: Migration — Add Priority Field to Tasks

**Context**: Supabase + Next.js, adding a new column.

```markdown
# Claude Code Prompt — Migration: Add Priority to Tasks

## РАЗВЕДКА

```bash
# 1. Verify column doesn't already exist
grep -n "priority" src/types/database.ts | head -5

# 2. Check existing migrations
ls supabase/migrations/ | tail -5

# 3. Find next migration number
ls supabase/migrations/ | tail -1
```

## ЗАДАЧА 1: Create SQL migration

Создать `supabase/migrations/007_tasks_priority.sql`:

```sql
-- Add priority column to tasks table
-- Apply manually: Supabase Dashboard → SQL Editor

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'medium'
  CHECK (priority IN ('low', 'medium', 'high'));

CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
```

⚠️ СТОП: Скажи пользователю выполнить этот SQL в Supabase SQL Editor
прежде чем переходить к ЗАДАЧЕ 2.

## ЗАДАЧА 2: Update TypeScript types

В `src/types/database.ts`, в секции tasks:

Добавить в Row:
```tsx
priority: 'low' | 'medium' | 'high';
```

Добавить в Insert:
```tsx
priority?: 'low' | 'medium' | 'high';
```

## ЗАДАЧА 3: Update Zod validator

В `src/lib/validators/task.ts`:

```tsx
priority: z.enum(['low', 'medium', 'high']).default('medium'),
```

## ЗАДАЧА 4: Update hook

В `src/lib/hooks/use-tasks.ts`:

Добавить priority в create mutation и optimistic update.

## ЗАДАЧА 5: Add to TaskModal form

В `src/components/modals/TaskModal.tsx`:

Добавить select для priority:
```tsx
<select {...form.register('priority')}>
  <option value="low">Низкий</option>
  <option value="medium">Средний</option>
  <option value="high">Высокий</option>
</select>
```

## ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -20
npm run build 2>&1 | tail -5
```

## КОММИТ

```bash
git add .
git commit -m "feat(tasks): add priority field (low/medium/high) with migration 007"
```
```

---

## Example 4: Refactor — Extract Hook from Component

**Context**: Business logic mixed into component, needs extraction.

```markdown
# Claude Code Prompt — Refactor: Extract useFilters from ProjectsPage

## РАЗВЕДКА

```bash
# 1. Current component size
wc -l src/app/projects/page.tsx

# 2. Find filter-related code
grep -n "filter\|Filter\|search\|status\|stage" src/app/projects/page.tsx | head -20

# 3. Check existing hooks for pattern
head -30 src/lib/hooks/use-tasks.ts
```

## ПЛАН

Извлечь логику фильтрации из ProjectsPage в хук `useProjectFilters`.
- Поведение НЕ меняется — только структура
- Компонент станет чище, хук — переиспользуемый

## ЗАДАЧА 1: Create hook

Создать `src/lib/hooks/use-project-filters.ts`:

Перенести:
- useState для каждого фильтра
- useMemo с логикой фильтрации
- handler функции (onChange, reset)

Экспортировать:
```tsx
export function useProjectFilters(projects: Project[]) {
  // state, filtering logic, handlers
  return { filtered, filters, setFilter, resetFilters };
}
```

## ЗАДАЧА 2: Simplify component

В `src/app/projects/page.tsx`:
- Убрать перенесённый код
- Импортировать хук
- Заменить на `const { filtered, filters, setFilter, resetFilters } = useProjectFilters(projects);`

## ЗАДАЧА 3: Verify behavior preserved

```bash
# Typecheck
npx tsc --noEmit 2>&1 | head -20

# Build
npm run build 2>&1 | tail -5

# Component still references the same data
grep -n "filtered\|filters" src/app/projects/page.tsx
```

## КОММИТ

```bash
git add .
git commit -m "refactor(projects): extract useProjectFilters hook, behavior preserved"
```
```

---

## Example 5: Multi-Sprint — Add Notifications System

**Context**: Large feature broken into sequential sprints.

```markdown
# Sprint 20.1 — Notification Data Layer

## РАЗВЕДКА
[DB + types verification]

## ЗАДАЧА 1: Migration — notifications table
## ЗАДАЧА 2: TypeScript types
## ЗАДАЧА 3: useNotifications hook (CRUD + mark as read)

## КОММИТ
git commit -m "feat(notifications): data layer — table, types, hook"
```

```markdown
# Sprint 20.2 — Notification UI

## РАЗВЕДКА
[Verify 20.1 is complete: table exists, hook works]

## ЗАДАЧА 1: NotificationBell component (header icon + badge count)
## ЗАДАЧА 2: NotificationDropdown (list + mark-read)
## ЗАДАЧА 3: Wire into layout header

## КОММИТ
git commit -m "feat(notifications): UI — bell icon, dropdown, mark as read"
```

```markdown
# Sprint 20.3 — Trigger Notifications on Events

## РАЗВЕДКА
[Verify 20.1 + 20.2 complete]

## ЗАДАЧА 1: DB trigger — create notification on call/meeting scheduled
## ЗАДАЧА 2: Realtime subscription for new notifications
## ЗАДАЧА 3: Toast component for real-time alerts

## КОММИТ
git commit -m "feat(notifications): triggers on call/meeting + realtime toasts"
```

**Key pattern**: each sprint is deployable independently.
Sprint 20.1 = data layer works, no UI yet.
Sprint 20.2 = UI works, shows existing notifications.
Sprint 20.3 = auto-creation + real-time. Full feature complete.
