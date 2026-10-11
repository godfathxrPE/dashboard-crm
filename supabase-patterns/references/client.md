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

export function use[Entities]() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  // READ
  const query = useQuery({
    queryKey: ['[entities]'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('[entities]')
        .select('*, companies(*), contacts(*)')
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
        .select('*, companies(*), contacts(*)')
        .single();
      if (error) throw error;
      return data;
    },
    onMutate: async (newItem) => {
      await queryClient.cancelQueries({ queryKey: ['[entities]'] });
      const previous = queryClient.getQueryData(['[entities]']);
      queryClient.setQueryData(['[entities]'], (old: any[]) =>
        [{ ...newItem, id: 'temp-' + Date.now() }, ...(old ?? [])]
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

  // UPDATE
  const update = useMutation({
    mutationFn: async ({ id, ...values }: EntityUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('[entities]')
        .update(values)
        .eq('id', id)
        .select('*, companies(*), contacts(*)')
        .single();
      if (error) throw error;
      return data;
    },
    onMutate: async (updated) => {
      await queryClient.cancelQueries({ queryKey: ['[entities]'] });
      const previous = queryClient.getQueryData(['[entities]']);
      queryClient.setQueryData(['[entities]'], (old: any[]) =>
        (old ?? []).map(item => item.id === updated.id ? { ...item, ...updated } : item)
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
      const previous = queryClient.getQueryData(['[entities]']);
      queryClient.setQueryData(['[entities]'], (old: any[]) =>
        (old ?? []).filter(item => item.id !== id)
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

  const { error } = await supabase
    .from('tasks')
    .insert({ ...parsed.data, user_id: user.id });

  if (error) return { error: error.message };

  revalidatePath('/tasks');
  return { success: true };
}
```

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
  .select('*, companies(*), contacts(*), projects(*)')
  .order('created_at', { ascending: false });
```

### Filtered Queries

```typescript
const { data } = await supabase
  .from('calls')
  .select('*')
  .eq('status', 'planned')
  .gte('scheduled_date', new Date().toISOString())
  .order('scheduled_date', { ascending: true });
```

### Pagination

```typescript
const PAGE_SIZE = 20;
const { data, count } = await supabase
  .from('contacts')
  .select('*', { count: 'exact' })
  .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
  .order('created_at', { ascending: false });
```

### Search

```typescript
const { data } = await supabase
  .from('contacts')
  .select('*')
  .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`);
```

For better performance on large tables, use PostgreSQL full-text search
(`tsvector` + `tsquery`) with a GIN index.

---

## Error Handling

### Standard Pattern

```typescript
const { data, error } = await supabase.from('tasks').select('*');

if (error) {
  console.error('Supabase error:', error.message);
  throw error; // Let React Query handle it
}

return data ?? []; // Always return array, never null
```

### Common Error Codes

| Code | Meaning | Fix |
|------|---------|-----|
| `PGRST301` | Row not found (.single()) | Check if ID exists, handle empty |
| `42501` | Permission denied (RLS) | Check RLS policies |
| `23505` | Unique constraint violation | Handle duplicate, show user message |
| `23503` | FK constraint violation | Referenced row doesn't exist |
| `42703` | Column doesn't exist | Schema mismatch, run migration |

---

## CSV Export with Cyrillic

```typescript
export function exportToCSV(data: any[], filename: string) {
  const BOM = '\uFEFF'; // Required for Excel to read Cyrillic
  const headers = Object.keys(data[0]).join(',');
  const rows = data.map(row =>
    Object.values(row).map(v =>
      typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : v
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
