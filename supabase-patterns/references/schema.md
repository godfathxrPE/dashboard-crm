# Schema & Migration Patterns

---

## Table Design

### Standard Columns

Every user-facing table should include:

```sql
CREATE TABLE public.[entities] (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- multi-tenant: org-first
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- ownership → profiles (or your project's users table), not auth.users
  owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- entity-specific columns --
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS + grants
ALTER TABLE public.[entities] ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.[entities] FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.[entities] TO authenticated;

-- Index every column the policies filter by
CREATE INDEX IF NOT EXISTS idx_[entities]_org_id     ON public.[entities](org_id);
CREATE INDEX IF NOT EXISTS idx_[entities]_owner_id   ON public.[entities](owner_id);
CREATE INDEX IF NOT EXISTS idx_[entities]_created_by ON public.[entities](created_by);
```

**Ownership = `owner_id` / `created_by` → `profiles` (or your project's users table)**, org-first (`org_id not null`,
первый конъюнкт политики). `user_id` — только там, где колонка действительно означает
пользователя, а не владельца сущности (`leads`, `activity_log` — актор записи журнала).

**Rules.** Tables only via migration; `revoke all on <t> from anon`, explicit grants to
`authenticated`. Money: `bigint` kopecks or `numeric(p,s)`, never `float`. Text: `text`,
not `varchar(n)`.

**Why `timestamptz`**: always use `timestamptz`, never `timestamp`.
Timezone-aware timestamps prevent conversion bugs across regions.

### auto-updated `updated_at`

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON [entities]
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

---

## Foreign Key Strategies

### ON DELETE Options

| Strategy | When to use | Example |
|----------|-------------|---------|
| `SET NULL` | Parent deletion shouldn't delete children | project deleted -> tasks.project_id = NULL |
| `CASCADE` | Children have no meaning without parent | project deleted -> project_files deleted |
| `RESTRICT` | Prevent deletion if children exist | company with active projects -> block delete |

### Decision Table

| Relationship | Strategy | Reasoning |
|-------------|----------|-----------|
| Project -> Tasks | SET NULL | Tasks survive project deletion |
| Project -> Files | CASCADE | Files belong to project |
| Company -> Projects | SET NULL | Projects survive company deletion |
| Contact <-> Company (junction) | CASCADE | Link has no meaning without both sides |
| Org -> Everything (`org_id`) | CASCADE | Tenant deletion removes its data |
| Profile -> owned rows (`owner_id`, `created_by`) | SET NULL | Rows survive the user leaving |

### Always Index FK Columns

```sql
CREATE INDEX IF NOT EXISTS idx_[table]_[fk_column] ON [table]([fk_column]);
```

Without an index, FK lookups and CASCADE/SET NULL operations do full table scans.

---

## Junction Tables (M:N)

```sql
CREATE TABLE contact_company (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contact_id, company_id)
);

CREATE INDEX idx_cc_contact ON contact_company(contact_id);
CREATE INDEX idx_cc_company ON contact_company(company_id);
```

---

## Trigger Functions

### Per-Table Trigger Pattern (CORRECT)

```sql
CREATE OR REPLACE FUNCTION public.log_project_deletion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  -- activity_log.user_id — актор записи журнала, не владелец сущности
  INSERT INTO public.activity_log (user_id, event_type, payload)
  VALUES (
    auth.uid(),
    'entity_deleted',
    jsonb_build_object(
      'entity_type', 'project',
      'entity_name', OLD.name,
      'entity_id', OLD.id
    )
  );
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  RETURN OLD;  -- never block the deletion
END;
$$;

CREATE TRIGGER trg_log_project_delete
  BEFORE DELETE ON projects
  FOR EACH ROW EXECUTE FUNCTION log_project_deletion();
```

DEFINER only when the trigger writes where the caller can't (here: `activity_log`);
default INVOKER.

### Generic Trigger Anti-Pattern (NEVER)

```sql
-- THIS FAILS — PostgreSQL resolves OLD.name and OLD.title at PARSE TIME
CREATE FUNCTION log_deletion() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'projects' THEN
    INSERT INTO log VALUES (OLD.name);  -- fails on tables without 'name'
  ELSIF TG_TABLE_NAME = 'tasks' THEN
    INSERT INTO log VALUES (OLD.title);
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
```

### Safe Patterns for Triggers

| Pattern | Safe? | Notes |
|---------|-------|-------|
| `NEW.column` in INSERT/UPDATE trigger | Yes | Column must exist on THIS table |
| `OLD.column` in DELETE/UPDATE trigger | Yes | Column must exist on THIS table |
| `TG_TABLE_NAME` branching with `OLD.*` | No | Resolves at parse time, not runtime |
| SECURITY DEFINER + INSERT to other table | Yes | Bypasses RLS for the insert; pin `search_path` |
| EXCEPTION WHEN OTHERS | Yes | Prevents trigger from blocking main operation |

---

## TypeScript Type Generation

### Codegen — through a safe wrapper

Regenerate types after every migration using the project's type-generation step (see the
project's *-architect skill). Not a bare `npx supabase gen types … > file`: redirection
truncates the target before the command runs, and any failure (no CLI, no network, an
interactive npx prompt) leaves an empty or garbage types file. No such step yet — write a
wrapper first: temp file → sanity checks → `mv`. Generated files are never edited by hand.

Run it after EVERY applied migration. Types must match the schema.

### Using Generated Types

```typescript
// src/types/database.ts is auto-generated — never edit manually
import { Database } from '@/types/database';

// Row type (SELECT result)
type Task = Database['public']['Tables']['tasks']['Row'];

// Insert type (INSERT payload)
type TaskInsert = Database['public']['Tables']['tasks']['Insert'];

// Update type (UPDATE payload — all fields optional)
type TaskUpdate = Database['public']['Tables']['tasks']['Update'];
```

### Typed Supabase Client

```typescript
import { createBrowserClient } from '@supabase/ssr';
import { Database } from '@/types/database';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

### Zod Validation Sync

When a migration adds a new column that appears in a form, update the Zod schema:

```typescript
// src/lib/validators/task.ts
import { z } from 'zod';

export const taskSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  status: z.enum(['todo', 'in_progress', 'done']),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  // Add new fields here after migration
});

export type TaskFormValues = z.infer<typeof taskSchema>;
```

**Rule**: database.ts is generated (source of truth for types).
Zod schemas are manual (source of truth for validation). Keep them in sync.

---

## Migration Workflow

### File Naming

```
supabase/migrations/
├── 001_initial_schema.sql
├── 002_calls_meetings.sql
├── 003_contact_company_junction.sql
└── ...
```

Numbered sequentially. Descriptive name. One concern per file.
**Number from the applied-migrations history, not the folder**: numbers get lost in the
folder (applied without a file, reserved, cancelled).

### Migration Template

```sql
-- Migration: [NNN]_[description].sql
-- Purpose: [what this migration does]
-- Apply: through the project's single migration path
-- Rollback: [how to undo, if applicable]

-- 1. Schema changes
ALTER TABLE [table]
  ADD COLUMN IF NOT EXISTS [column] [type] [constraints];

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_[table]_[column] ON [table]([column]);

-- 3. RLS policies (if new table)
ALTER TABLE [table] ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON [table] FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON [table] TO authenticated;
DROP POLICY IF EXISTS "select_own" ON [table];
CREATE POLICY "select_own" ON [table] FOR SELECT TO authenticated
  USING (owner_id = (select auth.uid()));

-- 4. Triggers (if needed)
```

### Migration Rules

1. Always `IF NOT EXISTS` for columns, indexes, tables. `IF NOT EXISTS` doesn't exist
   for `ADD CONSTRAINT` / `CREATE POLICY`: use `drop policy if exists` + create, or a
   DO-block guard on `pg_constraint`.
2. Always `IF EXISTS` for DROP operations
3. One migration = one concern
4. Apply migrations through the project's single migration path (CLI, MCP or CI) —
   never ad-hoc. Two paths at once cause schema drift
5. Number from the applied-migrations history, not the folder
6. Regenerate types after every migration using the project's type-generation step
7. Update Zod validators if new form fields added

### After Migration Checklist

- [ ] Applied through the project's migration path; version present in the applied-migrations history
- [ ] Types regenerated with the project's type-generation step
- [ ] Zod validators updated (if new form field)
- [ ] Hook updated (select, insert, update queries)
- [ ] Tested in app (create/read/update/delete)

---

## Indexes

### When to Add Indexes

| Column type | Index? | Why |
|-------------|--------|-----|
| `org_id` / `owner_id` / `created_by` / `assigned_to` (RLS filter) | Always | Every policy filters by these |
| FK columns | Always | JOIN and CASCADE operations |
| `created_at` | If sorting by date | ORDER BY queries |
| `status` / `lane` / `stage` | If filtering frequently | WHERE clause optimization |
| `name` / `title` | Usually not | Unless search needed — see below |
| `notes` / `description` | Never | Large text, rarely queried |

### Composite Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_tasks_org_status_created
  ON tasks(org_id, status, created_at);
```

Equality columns first, range/sort last: `(org_id, status, created_at)`.
Leftmost-prefix: won't serve `where created_at > …` alone.

### Partial, Search and JSONB Indexes

```sql
-- Partial: only the rows the hot query reads
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications(user_id) WHERE read_at IS NULL;

-- Substring search on name / ИНН / email (ilike '%…%')
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_companies_name_trgm
  ON companies USING gin (name gin_trgm_ops);

-- Word search: generated tsvector + GIN
ALTER TABLE notes ADD COLUMN IF NOT EXISTS search tsvector
  GENERATED ALWAYS AS (to_tsvector('russian', coalesce(body, ''))) STORED;
CREATE INDEX IF NOT EXISTS idx_notes_search ON notes USING gin (search);

-- JSONB containment (@>) → jsonb_path_ops; a single key → expression index
CREATE INDEX IF NOT EXISTS idx_events_payload ON events USING gin (payload jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_events_kind ON events ((payload->>'kind'));
```

| Query shape | Index |
|---|---|
| Hot subset (`… where read_at is null`) | partial index |
| Substring on name / ИНН / email | `pg_trgm` + `gin (col gin_trgm_ops)` |
| Word search | generated `tsvector` (`'russian'`) + GIN |
| JSONB `@>` | GIN `jsonb_path_ops` |
| One JSONB key in `where` | expression index `((payload->>'key'))` |

---

## Enum Alternatives

### CHECK Constraint (preferred)

```sql
ALTER TABLE tasks
  ADD COLUMN priority text DEFAULT 'medium'
  CHECK (priority IN ('low', 'medium', 'high'));
```

Easy to modify. Use for values that might change.

### PostgreSQL ENUM (use sparingly)

```sql
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high');
```

Strict type safety but can't remove values. Use only for truly fixed sets.
