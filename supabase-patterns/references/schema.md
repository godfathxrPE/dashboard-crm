# Schema & Migration Patterns

---

## Table Design

### Standard Columns

Every user-facing table should include:

```sql
CREATE TABLE [entities] (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- entity-specific columns --
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE [entities] ENABLE ROW LEVEL SECURITY;

-- Index on user_id (RLS queries filter by this)
CREATE INDEX idx_[entities]_user_id ON [entities](user_id);
```

**Why `user_id` as NOT NULL**: every row belongs to a user. This is the RLS
filter column. Without it, policies can't work.

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
| User -> Everything | CASCADE | User deletion removes all their data |

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
CREATE OR REPLACE FUNCTION log_project_deletion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO activity_log (user_id, event_type, payload)
  VALUES (
    OLD.user_id,
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
| SECURITY DEFINER + INSERT to other table | Yes | Bypasses RLS for the insert |
| EXCEPTION WHEN OTHERS | Yes | Prevents trigger from blocking main operation |

---

## TypeScript Type Generation

### Codegen with Supabase CLI

```bash
# Generate types from remote database
npx supabase gen types typescript --project-id YOUR_PROJECT_REF > src/types/database.ts
```

Run this command after EVERY migration. Types must match the schema.

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

### Migration Template

```sql
-- Migration: [NNN]_[description].sql
-- Purpose: [what this migration does]
-- Apply: Supabase Dashboard -> SQL Editor
-- Rollback: [how to undo, if applicable]

-- 1. Schema changes
ALTER TABLE [table]
  ADD COLUMN IF NOT EXISTS [column] [type] [constraints];

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_[table]_[column] ON [table]([column]);

-- 3. RLS policies (if new table)
ALTER TABLE [table] ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_own" ON [table] FOR SELECT USING (auth.uid() = user_id);

-- 4. Triggers (if needed)
```

### Migration Rules

1. Always `IF NOT EXISTS` for columns, indexes, tables
2. Always `IF EXISTS` for DROP operations
3. One migration = one concern
4. Apply manually in Supabase Dashboard SQL Editor
5. Never `supabase db push` — causes schema drift
6. Run `npx supabase gen types typescript` after every migration
7. Update Zod validators if new form fields added

### After Migration Checklist

- [ ] SQL executed successfully in Dashboard
- [ ] `npx supabase gen types typescript` run, database.ts updated
- [ ] Zod validators updated (if new form field)
- [ ] Hook updated (select, insert, update queries)
- [ ] Tested in app (create/read/update/delete)

---

## Indexes

### When to Add Indexes

| Column type | Index? | Why |
|-------------|--------|-----|
| `user_id` (RLS filter) | Always | Every query filters by this |
| FK columns | Always | JOIN and CASCADE operations |
| `created_at` | If sorting by date | ORDER BY queries |
| `status` / `lane` / `stage` | If filtering frequently | WHERE clause optimization |
| `name` / `title` | Usually not | Unless full-text search needed |
| `notes` / `description` | Never | Large text, rarely queried |

### Composite Indexes

```sql
CREATE INDEX idx_tasks_user_status ON tasks(user_id, status);
```

Order matters: most selective column first (usually `user_id`).

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
