# Prompt Templates

Seven templates for common task types. Copy the structure, fill in project-specific
details. Each template shows: РАЗВЕДКА pattern, task structure, verification strategy.

---

## 1. Feature (new functionality)

When: adding a new capability that doesn't exist yet.

```markdown
# Claude Code Prompt — [Feature Name]

## РАЗВЕДКА

```bash
# 1. Verify project structure
ls src/app/ | head -20
ls src/components/ | head -20
ls src/lib/hooks/ | head -10

# 2. Check if similar feature already exists
grep -rn "[keyword]" src/ --include="*.tsx" --include="*.ts" | head -10

# 3. Check DB schema (if feature needs data)
grep -n "[table_name]" src/types/database.ts | head -10

# 4. Check dependencies
cat package.json | grep -E "(dependency_name)" | head -5
```

## ЗАДАЧА 1: Database layer (if needed)
- Migration SQL with IF NOT EXISTS
- Update types file
- Update validators

## ЗАДАЧА 2: Data hook
- CRUD hook following existing patterns
- Optimistic updates
- React Query key convention

## ЗАДАЧА 3: UI Component
- New component or modify existing
- Follow existing patterns in the project
- Responsive, accessible

## ЗАДАЧА 4: Wire up
- Import in page
- Route if new page needed
- Navigation entry if needed

## ТЕСТЫ
- Чистая логика из ЗАДАЧ 1–2 (парсеры, расчёты, статусы, валидаторы) лежит в `src/lib/`
  и получает `[name].test.ts` рядом (vitest)
- Кейсы описаны поведением: «пустой ввод → []», «дата в прошлом → status=overdue»,
  граничные значения, повтор операции (идемпотентность)
- Параметры времени/рандома передаются аргументом (`now: Date`), не читаются внутри —
  иначе функция не тестируется
- Если в спринте нет новой логики (только разметка/стили) — написать:
  «Тестов нет: только UI, логика не менялась»

```bash
npx vitest run src/lib/[path] 2>&1 | tail -15
```

## ФИНАЛЬНАЯ ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -20
npx vitest run 2>&1 | tail -10
npm run build 2>&1 | tail -10
```

## КОММИТ

```bash
git add .
git commit -m "feat([scope]): [description]"
```
```

**Key principle**: dependency order. DB → Types → Tests (lib/) → Hook → Component → Page.
Тест — часть спринта, не «потом»: тест, написанный после мержа, зеркалит реализацию.

---

## 2. Bug Fix

When: something is broken, user reports the symptom.

```markdown
# Claude Code Prompt — Fix: [Bug Description]

## РАЗВЕДКА (heavy — diagnosis is the work)

```bash
# 1. Locate the affected component
grep -rn "[error keyword]" src/ --include="*.tsx" --include="*.ts" | head -15

# 2. Check the suspected file
grep -n "[function/component name]" [suspected file] | head -20

# 3. Show the relevant code block
sed -n '[start],[end]p' [file]

# 4. Check related files that might cause the issue
grep -rn "[related pattern]" src/ --include="*.tsx" | head -10

# 5. Verify the data layer
grep -n "[column/table]" src/types/database.ts | head -5
```

## ГИПОТЕЗА
[Explain what you think is wrong and why]

## ЗАДАЧА 1: Fix
- Exact file and location
- Before/after code (str_replace with unique anchors)
- Why this fixes the root cause, not just the symptom

## ЗАДАЧА 2: Regression test
- Тест, который **воспроизводит баг до фикса** (красный) и проходит после (зелёный) —
  если логика в `src/lib/`. Для чисто UI-бага — guard clause / validation + строка
  «регрессионного теста нет: баг в разметке, воспроизводится только визуально»
- Note for future in `learnings.md`: "this pattern should be avoided because..."

## ПРОВЕРКА

```bash
# Verify the fix
grep -n "[fixed pattern]" [file]

# Regression test
npx vitest run [path/to/test] 2>&1 | tail -10

# Typecheck
npx tsc --noEmit 2>&1 | head -10

# Build
npm run build 2>&1 | tail -5
```

## КОММИТ

```bash
git add .
git commit -m "fix([scope]): [what was fixed and why]"
```
```

**Key principle**: РАЗВЕДКА is 60% of the work. Invest in diagnosis.

---

## 3. Refactor

When: restructuring code without changing behavior.

```markdown
# Claude Code Prompt — Refactor: [What and Why]

## РАЗВЕДКА

```bash
# 1. Map current state — what files are involved
find src -name "[pattern]" -type f
grep -rn "[function/pattern]" src/ --include="*.tsx" -l

# 2. Count usages (to know scope of change)
grep -rn "[old pattern]" src/ --include="*.tsx" --include="*.ts" | wc -l

# 3. Show current implementation
grep -n "[function]" [file] -A 10
```

## ПЛАН
- What changes structurally
- What stays the same (behavior)
- How to verify behavior didn't change

## ЗАДАЧА 1: [Structural change]
- Move / rename / split / merge
- Update all imports

## ЗАДАЧА 2: Update references
```bash
# Find and update all usages
grep -rn "[old import]" src/ --include="*.tsx" --include="*.ts"
```

## ЗАДАЧА 3: Verify behavior preserved
```bash
# Before: capture current behavior
# After: confirm same behavior

npx tsc --noEmit 2>&1 | head -20
npm run build 2>&1 | tail -10
```

## КОММИТ

```bash
git add .
git commit -m "refactor([scope]): [what changed structurally, behavior preserved]"
```
```

**Key principle**: prove behavior didn't change. Typecheck + build minimum.

---

## 4. DB Migration

When: changing database schema (new table, new column, FK change).

```markdown
# Claude Code Prompt — Migration: [What Changes]

## РАЗВЕДКА

```bash
# 1. Current schema
grep -n "[table]" src/types/database.ts | head -20

# 2. Existing migrations
ls supabase/migrations/ 2>/dev/null || echo "no migrations dir"

# 3. Check FK references
grep -rn "[table_name]" src/lib/hooks/ --include="*.ts" | head -10
```

## ЗАДАЧА 1: SQL Migration

Create `supabase/migrations/[NNN]_[description].sql`:

```sql
-- [Description of what this migration does]
-- Apply manually: Supabase Dashboard → SQL Editor

ALTER TABLE [table]
  ADD COLUMN IF NOT EXISTS [column] [type] [constraints];

CREATE INDEX IF NOT EXISTS idx_[table]_[column] ON [table]([column]);
```

⚠️ Apply this SQL manually in Supabase SQL Editor BEFORE proceeding.

## ЗАДАЧА 2: Update TypeScript types

In `src/types/database.ts`, add the new column to Row, Insert, and Update types.

## ЗАДАЧА 3: Update validator (if form field added)

In `src/lib/validators/[entity].ts`, add Zod field for new column.

## ЗАДАЧА 4: Update hook

In `src/lib/hooks/use-[entities].ts`:
- Add column to select query
- Add to create/update mutations
- Include in optimistic update

## ЗАДАЧА 5: Update UI (if visible to user)

In the relevant component/modal, add form field or display.

## ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -20
npm run build 2>&1 | tail -10
```

## КОММИТ

```bash
git add .
git commit -m "feat(db): [migration description], types and hooks updated"
```
```

**Key principle**: SQL applied manually first. Then types. Then code.
⚠️ always reminds user to run SQL in Dashboard before proceeding.

---

## 5. New Component

When: building a standalone UI component.

```markdown
# Claude Code Prompt — Component: [Name]

## РАЗВЕДКА

```bash
# 1. Check existing component patterns
ls src/components/
head -30 src/components/[similar-component].tsx

# 2. Check UI library usage
grep -rn "from.*@radix\|from.*shadcn" src/components/ --include="*.tsx" | head -10

# 3. Check styling approach
grep -n "className\|style=" src/components/[similar].tsx | head -10
```

## ЗАДАЧА 1: Create component

Create `src/components/[path]/[Name].tsx`:

```tsx
// [Component description in Russian]
'use client';

import { ... } from '...';

interface [Name]Props {
  // typed props
}

export function [Name]({ ... }: [Name]Props) {
  return (
    // semantic HTML, accessible
  );
}
```

Requirements:
- Semantic HTML (button, dialog, nav — not div)
- Keyboard accessible (focus-visible, tab order)
- Theme-aware (CSS variables, not hardcoded colors)
- Responsive (mobile-first)

## ЗАДАЧА 2: Integrate

Import and use in the target page/layout.

## ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -10
npm run build 2>&1 | tail -5
```

## КОММИТ

```bash
git add .
git commit -m "feat(ui): add [Name] component"
```
```

---

## 6. Deployment / Config

When: build config, env vars, deploy settings, CI/CD.

```markdown
# Claude Code Prompt — Config: [What]

## РАЗВЕДКА

```bash
# 1. Current config
cat next.config.ts
cat package.json | head -20
cat .env.local 2>/dev/null | grep -v "KEY\|SECRET" | head -10

# 2. Build status
npm run build 2>&1 | tail -15
```

## ЗАДАЧА 1: [Config change]

⚠️ NEVER commit secrets or API keys.
⚠️ Always verify build passes after config changes.

## ПРОВЕРКА

```bash
npm run build 2>&1 | tail -10
npm run dev & sleep 5 && curl -s http://localhost:3000 | head -5 && kill %1
```

## КОММИТ

```bash
git add .
git commit -m "chore(config): [description]"
```
```

---

## 7. Cleanup / Polish

When: removing dead code, fixing warnings, improving code quality.

```markdown
# Claude Code Prompt — Cleanup: [Scope]

## РАЗВЕДКА

```bash
# 1. Find the mess
grep -rn "console.log\|TODO\|FIXME\|HACK" src/ --include="*.tsx" --include="*.ts" | head -20

# 2. Unused imports
npx tsc --noEmit 2>&1 | grep "declared but" | head -10

# 3. Unused files
find src -name "*.tsx" -newer src/app/layout.tsx | head -20
```

## ЗАДАЧА 1: [Specific cleanup]

Remove/fix items found in РАЗВЕДКА.
No behavior changes — only code quality.

## ПРОВЕРКА

```bash
npx tsc --noEmit 2>&1 | head -10
npm run build 2>&1 | tail -5
# Confirm app still works identically
```

## КОММИТ

```bash
git add .
git commit -m "chore(cleanup): [what was cleaned]"
```
```

**Key principle**: zero behavior change. Build must pass before and after.
