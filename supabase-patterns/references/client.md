# Client Patterns

Browser/server client setup, React Query integration, realtime subscriptions,
optimistic updates, and Server Actions.

---

## Client Architecture

```
                    ┌─────────────────────┐
                    │   Next.js App        │
                    │                     │
  Server ──────────>│ createServerClient() │──── reads cookies from headers
  (RSC, API,        │                     │     used in middleware, RSC, API,
   middleware,      │                     │     Server Actions
   Server Actions)  │                     │
                    │                     │
  Browser ─────────>│ createBrowserClient()│──── reads cookies from document
  ('use client')    │                     │     used in client components
                    └────────┬────────────┘
                             │
                             v
                    ┌─────────────────────┐
                    │   Supabase          │
                    │   (RLS enforced)    │
                    └─────────────────────┘
```

**Rule**: never import `createBrowserClient` in a Server Component or Server Action.
Never import `createServerClient` in a Client Component.

---

## React Query Integration

### Hook Pattern

```typescript
// src/lib/hooks/use-[entities].ts
'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/types/database';

type Row = Database['public']['Tables']['[entities]']['Row'];
type EntityInsert = Database['public']['Tables']['[entities]']['Insert'];
type EntityUpdate = Database['public']['Tables']['[entities]']['Update'];

// Explicit columns, never `*` / `rel(*)`: payload and coupling grow with every new column.
const LIST_SELECT = 'id,title,status,created_at,company:companies(id,name)';
type ListItem = Pick<Row, 'id' | 'title' | 'status' | 'created_at'> & {
  company: { id: string; name: string } | null;
};

export function use[Entities]() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  // READ
  const query = useQuery({
    queryKey: ['[entities]'],
    queryFn: async (): Promise<ListItem[]> => {
      const { data, error } = await supabase
        .from('[entities]')
        .select(LIST_SELECT)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // CREATE (optimistic)
  const create = useMutation({
    mutationFn: async (values: EntityInsert) => {
      const { data, error } = await supabase
        .from('[entities]')
        .insert(values)
        .select(LIST_SELECT)
        .single();
      if (error) throw error;
      return data;
    },
    onMutate: async (newItem) => {
      await queryClient.cancelQueries({ queryKey: ['[entities]'] });
      const previous = queryClient.getQueryData<ListItem[]>(['[entities]']);
      queryClient.setQueryData<ListItem[]>(['[entities]'], (old = []) => [
        {
          id: 'temp-' + Date.now(),
          title: newItem.title,
          status: newItem.status ?? null,
          created_at: new Date().toISOString(),
          company: null,
        },
        ...old,
      ]);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['[entities]'], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['[entities]'] });
    },
  });

  // UPDATE
  const update = useMutation({
    mutationFn: async ({ id, ...values }: EntityUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('[entities]')
        .update(values)
        .eq('id', id)
        .select(LIST_SELECT)
        .single();
      if (error) throw error;
      return data;
    },
    onMutate: async (updated) => {
      await queryClient.cancelQueries({ queryKey: ['[entities]'] });
      const previous = queryClient.getQueryData<ListItem[]>(['[entities]']);
      queryClient.setQueryData<ListItem[]>(['[entities]'], (old = []) =>
        old.map(item => item.id === updated.id ? { ...item, ...updated } : item)
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['[entities]'], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['[entities]'] });
    },
  });

  // DELETE
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('[entities]')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['[entities]'] });
      const previous = queryClient.getQueryData<ListItem[]>(['[entities]']);
      queryClient.setQueryData<ListItem[]>(['[entities]'], (old = []) =>
        old.filter(item => item.id !== id)
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['[entities]'], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['[entities]'] });
    },
  });

  return { ...query, create, update, remove };
}
```

### Query Key Convention

```
['entities']              — all entities (list)
['entity', id]            — single entity by ID
['entities', { status }]  — filtered list
['activity-log', entityId] — scoped to parent
```

**Rule**: invalidate the list key after any mutation. For detail pages,
also invalidate the specific key.

---

## Optimistic Updates

### Pattern

```
1. onMutate:  cancel queries -> save previous -> update cache
2. onError:   restore previous (rollback)
3. onSettled: invalidate queries (sync with server truth)
```

### Common Mistakes

| Mistake | Fix |
|---------|-----|
| Not cancelling queries before optimistic update | `queryClient.cancelQueries` prevents race conditions |
| Not saving previous state | Without it, can't rollback on error |
| Forgetting `onSettled` invalidation | Cache stays stale if onMutate diverges from server |
| Optimistic ID doesn't match server ID | Use temp ID in onMutate, invalidation replaces it |
| Not spreading existing item in update | `{ ...item, ...updated }` preserves unaffected fields |

---

## Server Actions

Server Actions are the preferred way to handle mutations in Next.js 15.
They run on the server, have access to cookies, and can use the server Supabase client.

### Basic Server Action

```typescript
// src/app/actions/tasks.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { taskSchema } from '@/lib/validators/task';

export async function createTask(formData: FormData) {
  const supabase = await createClient();

  const parsed = taskSchema.safeParse({
    title: formData.get('title'),
    status: formData.get('status'),
    priority: formData.get('priority'),
  });

  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Not authenticated' };

  // created_by: default auth.uid() in the table; ownership is owner_id / created_by, never user_id
  const { error } = await supabase
    .from('tasks')
    .insert({ ...parsed.data, owner_id: user.id });

  if (error) return { error: error.message };

  revalidatePath('/tasks');
  return { success: true };
}
```

### Server Action = public endpoint

A Server Action is a public endpoint: safeParse → `getUser()` → authz. With the
user-scoped server client RLS is the authz layer; with service-role or SECURITY
DEFINER RPC check org membership and role explicitly. Write `owner_id`/`created_by`,
never `user_id`.

### Server Action with React Query

When using React Query for client-side cache, call the Server Action
from a mutation and invalidate queries on success:

```typescript
// In client component
const create = useMutation({
  mutationFn: async (formData: FormData) => {
    const result = await createTask(formData);
    if (result.error) throw new Error(JSON.stringify(result.error));
    return result;
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  },
});
```

### When to Use Server Actions vs Client Mutations

| Scenario | Approach | Why |
|----------|----------|-----|
| Form submission (create/update) | Server Action | Validation on server, no client bundle |
| Optimistic UI (drag-drop, inline edit) | Client mutation (React Query) | Instant feedback, rollback on error |
| Delete with confirmation | Server Action | Simple, no optimistic needed |
| Real-time collaborative editing | Client mutation + realtime | Need instant sync across clients |

---

## Realtime Subscriptions

### Basic Pattern

```typescript
// src/lib/hooks/use-realtime.ts
'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

export function useRealtimeSync(table: string) {
  const queryClient = useQueryClient();
  const supabase = createClient();

  useEffect(() => {
    const channel = supabase
      .channel(`realtime-${table}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          queryClient.invalidateQueries({ queryKey: [table] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, queryClient, supabase]);
}
```

### Enabling Realtime

Realtime must be enabled per table in Supabase Dashboard:
Database -> Replication -> Enable for specific tables.

If realtime isn't firing:
1. Check replication is enabled for the table
2. Check RLS allows SELECT for the user
3. Check channel name is unique per component instance
4. Check the component unmounts cleanly (removeChannel in cleanup)

---

## Data Fetching Patterns

### Select with Relations

```typescript
const { data } = await supabase
  .from('tasks')
  .select('id,title,status,due_date,company:companies(id,name),project:projects(id,title)')
  .order('created_at', { ascending: false });
```

Explicit columns in every select — never `*` / `rel(*)`.

### Filtered Queries

```typescript
const { data } = await supabase
  .from('calls')
  .select('id,subject,status,scheduled_date')
  .eq('status', 'planned')
  .gte('scheduled_date', new Date().toISOString())
  .order('scheduled_date', { ascending: true });
```

### No N+1, parallel independent reads

- **No N+1**: related rows come through embedding (`company:companies(id,name)`) or ONE
  `.in('id', ids)` — never a query per row in a loop. Guard `.in()` on both ends: an empty
  list → skip the request; a long one overflows the URL length limit (ids are sent in
  the query string) → split into chunks of ~100–200 ids and merge the results.
- **Independent queries — `Promise.all`** in a queryFn / Route Handler / Server Action;
  `await` each result in the branch that actually needs it.

```typescript
const [deals, tasks] = await Promise.all([
  supabase.from('projects').select('id,title,stage_id').eq('owner_id', userId),
  supabase.from('tasks').select('id,title,due_date').eq('assigned_to', userId),
]);
```

### Upsert and Bulk Import

```typescript
// Requires a UNIQUE constraint on (org_id, inn) + INSERT, UPDATE and SELECT policies
await supabase.from('companies').upsert(rows, { onConflict: 'org_id,inn' });
```

Bulk import (CSV / Excel): batches of 500–1000 rows, one `.insert(array)` per
batch (or an RPC) — never a request per row.

### Pagination

Lists default to keyset:
`.order('created_at',{ascending:false}).order('id').lt('created_at', cursor).limit(N)`;
ties → `(created_at, id)`:

```typescript
const PAGE_SIZE = 20;
let q = supabase
  .from('contacts')
  .select('id,first_name,last_name,created_at')
  .order('created_at', { ascending: false })
  .order('id', { ascending: false })
  .limit(PAGE_SIZE);
if (cursor) {
  // tie-safe: rows with the same created_at continue by id
  q = q.or(
    `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`
  );
}
const { data } = await q;
```

`.range()` only for small bounded tables. `count: 'exact'` only when the UI shows a
total; prefer `'estimated'` / `head: true`.

### Search

Escape user input before `.or()` / `.ilike()`: `%`, `_`, `\` are LIKE wildcards;
`,` `(` `)` split a PostgREST `.or()` filter.

```typescript
const esc = (s: string) => s.replace(/[\\%_]/g, '\\$&').replace(/[,()]/g, ' ');
const term = esc(query.trim());
const { data } = await supabase
  .from('contacts')
  .select('id,first_name,last_name,email')
  .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`);
```

On large tables substring search needs `pg_trgm` + GIN, word search — a `tsvector`
column + GIN (see schema.md → Indexes).

---

## Error Handling

### Standard Pattern

```typescript
const { data, error } = await supabase.from('tasks').select('id,title,status');

if (error) {
  console.error('Supabase error:', error.message);
  throw error; // Let React Query handle it
}

return data ?? []; // Always return array, never null
```

### Common Error Codes

| Code | Meaning | Fix |
|------|---------|-----|
| `PGRST116` | `.single()` got 0 or >1 rows | Check if ID exists; `.maybeSingle()` when absence is normal |
| `42501` | Missing GRANT, or a write rejected by RLS `WITH CHECK` | Check grants, then policies. RLS on SELECT never raises — it returns 0 rows |
| `23505` | Unique constraint violation | Handle duplicate, show user message |
| `23503` | FK constraint violation | Referenced row doesn't exist |
| `42703` | Column doesn't exist | Schema mismatch, run migration |

---

## CSV Export with Cyrillic

```typescript
export function exportToCSV(data: Record<string, unknown>[], filename: string) {
  const BOM = '\uFEFF'; // Required for Excel to read Cyrillic
  const headers = Object.keys(data[0]).join(',');
  const rows = data.map(row =>
    Object.values(row).map(v =>
      typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : String(v ?? '')
    ).join(',')
  );
  const csv = BOM + [headers, ...rows].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
```

**Key**: `\uFEFF` BOM prefix. Without it, Excel shows broken characters for Russian text.
