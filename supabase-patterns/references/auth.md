# Auth & RLS Patterns

---

## Auth Architecture in Next.js

### Two Clients, Two Contexts

```
Browser (Client Components)          Server (RSC, API routes, middleware)
─────────────────────────            ──────────────────────────────────
createBrowserClient()                createServerClient()
Reads cookies from browser           Reads cookies from request headers
Used in 'use client' components      Used in Server Components, API routes
Auto-refreshes JWT                   Manual cookie refresh in middleware
```

**Rule**: never import the wrong client. If you see `'use client'` at the top,
use `createBrowserClient()`. If you're in a Server Component or API route,
use `createServerClient()`.

### Browser Client Setup

```typescript
// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    // No storageKey, no flowType, no custom storage.
    // Defaults work. Overrides cause redirect loops.
  );
}
```

### Server Client Setup

```typescript
// src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll fails in Server Components (read-only)
            // This is expected — middleware handles refresh
          }
        },
      },
    }
  );
}
```

### Middleware (session refresh)

```typescript
// src/middleware.ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Refresh session — IMPORTANT: do not remove
  const { data: { user } } = await supabase.auth.getUser();

  // Redirect unauthenticated users to login
  if (!user && !request.nextUrl.pathname.startsWith('/login')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg)$).*)'],
};
```

---

## Client Config: What NOT to Override

| Option | Default | Never set to | Why |
|--------|---------|-------------|-----|
| `storageKey` | `'sb-[ref]-auth-token'` | Any custom value | Causes browser/server mismatch |
| `flowType` | `'pkce'` | `'implicit'` | Implicit flow ломает server-side code exchange в SSR |
| `storage` | `cookieStorage` | `localStorage` | Server can't read localStorage |
| `autoRefreshToken` | `true` | `false` | Session expires, 401 errors |
| `persistSession` | `true` | `false` | User logged out on refresh |

**The default config works for 99% of Next.js apps. Do not override.**

---

## RLS (Row Level Security)

### Why RLS Matters

Without RLS, the anon key grants full access to all rows. RLS is not optional —
it's your primary security layer.

### Standard Policies (per table)

```sql
-- Enable RLS
ALTER TABLE [table] ENABLE ROW LEVEL SECURITY;

-- Users see only their own rows (ownership column: owner_id / created_by → profiles (or your project's users table))
CREATE POLICY "select_own" ON [table]
  FOR SELECT TO authenticated
  USING (owner_id = (select auth.uid()));

CREATE POLICY "insert_own" ON [table]
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY "update_own" ON [table]
  FOR UPDATE TO authenticated
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY "delete_own" ON [table]
  FOR DELETE TO authenticated
  USING (owner_id = (select auth.uid()));
```

`TO authenticated` — политика не вычисляется для `anon` вовсе. Мультитенантный
проект: первым конъюнктом `org_id = (select public.current_org_id())`, роль —
`(select public.current_org_role())` — имена хелперов берутся из проекта.

### RLS Performance

Wrap stable no-arg calls in a subselect so the planner evaluates them once
(initplan): `(select auth.uid())`, `(select public.current_org_role())`. Bare
`auth.uid()` = per-row (advisor `auth_rls_initplan`). Same for storage policies.
Index every column a policy references (`org_id`, `owner_id`, `created_by`,
`assigned_to`). SECURITY DEFINER helpers: `set search_path = ''` (or
`public, pg_temp`) with schema-qualified names; internal helpers in schema
`private`; `revoke execute … from public, anon`; check `(select auth.uid())`
NULL-safely inside.

### RLS + Triggers

Trigger functions run as the calling user by default (SECURITY INVOKER) —
RLS-политики применяются к каждой операции внутри триггера. SECURITY
DEFINER нужен только если триггер пишет в таблицу, недоступную
пользователю (e.g., activity_log):

```sql
CREATE OR REPLACE FUNCTION log_something()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.activity_log (user_id, event_type, payload)
  VALUES (auth.uid(), 'something_happened', '{}'::jsonb);  -- user_id = actor of the log entry
  RETURN NEW;
END;
$$;
```

**SECURITY DEFINER** = runs with the permissions of the function owner — not
superuser (in Supabase migrations the owner is usually `postgres`). Use only when
the trigger genuinely needs to bypass RLS; default is INVOKER. Always pin
`search_path` (advisor: mutable search_path).

### RLS + FK Deletion

When user A deletes a project, the DB needs to SET NULL on tasks.project_id.
But RLS prevents user A from updating task rows (they "belong" to user A,
but the UPDATE happens inside the FK constraint engine).

**Solution**: `ON DELETE SET NULL` at the FK level. PostgreSQL handles this
at the constraint level, BEFORE RLS is evaluated. No client-side cleanup needed.

### Common RLS Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "new row violates row-level security" | INSERT policy missing, or `owner_id`/`created_by` not set | Add INSERT policy with WITH CHECK; default `created_by` to `auth.uid()` |
| "permission denied for table X" (42501) | Missing GRANT for the role. RLS with no policies does NOT raise — it returns 0 rows silently | `grant select, insert, update, delete on <t> to authenticated`; then add policies |
| Data from other users visible | SELECT policy too permissive or missing | Check USING clause: `owner_id = (select auth.uid())`, org-first in multi-tenant |
| Trigger INSERT blocked | Trigger runs as calling user (INVOKER) | SECURITY DEFINER on the trigger function — runs as function owner, not superuser; pin `search_path` |

---

## Auth Error Patterns

### Infinite Redirect Loop
**Symptom**: login page -> redirect -> login page -> redirect...
**Causes**:
1. `storageKey` override — browser and server read different cookie names
2. `flowType: 'implicit'` — implicit flow возвращает токены в URL fragment, который сервер не видит; server-side code exchange (`exchangeCodeForSession`) перестаёт работать
3. Middleware calls `getUser()` but doesn't pass cookies correctly

**Fix**: remove all client overrides. Use default config. Verify middleware
passes cookies in both `getAll` and `setAll`.

### 401 After Refresh
**Symptom**: app works, but after ~1 hour user gets 401.
**Cause**: JWT expired and wasn't refreshed.
**Fix**: middleware must call `supabase.auth.getUser()` on every request.
This triggers token refresh via cookies.

### Session Lost on Navigation
**Symptom**: user appears logged out on page transitions.
**Cause**: server client not reading cookies, or middleware not refreshing them.
**Fix**: verify `createServerClient` cookie handlers match middleware pattern above.
