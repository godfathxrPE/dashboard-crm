---
name: supabase-patterns
description: >
  Supabase patterns, anti-patterns, and solutions for Next.js projects. Use whenever
  the user works with Supabase: auth, RLS, database schema, triggers, migrations,
  realtime, storage, edge functions, server actions, or client setup. Triggers:
  "Supabase", "RLS", "Row Level Security", "supabase client", "auth", "trigger function",
  "миграция", "realtime subscription", "supabase storage", "edge function (Supabase)",
  "политики доступа", "server action supabase", "upload file", "signed URL",
  "bucket policy", "типы из базы", "codegen". Also trigger on errors mentioning
  "policy", "RLS", "JWT", "auth.uid()", "permission denied", "new row violates",
  or Supabase-related 400/401/403 errors. Works for any Next.js + Supabase project.
  Do NOT use for generic PostgreSQL questions unrelated to Supabase.
  Do NOT use for other BaaS (Firebase, Appwrite).
  Do NOT use for Netlify Edge Functions — netlify-deploy.
---

# Supabase Patterns

Battle-tested patterns for building Next.js applications with Supabase.
Covers auth, RLS, schema design, triggers, realtime, storage, edge functions,
and client architecture. Every pattern includes the "why" and common failure modes.

## Reference Files

| File | Read when | Contents |
|------|-----------|----------|
| `references/auth.md` | Auth setup, session issues, middleware, RLS policies | Auth flow, cookies, middleware, RLS patterns, common auth errors |
| `references/schema.md` | Table design, FK, triggers, migrations, indexes, types | Schema patterns, FK strategies, triggers, migration workflow, TypeScript codegen |
| `references/client.md` | Client setup, data fetching, realtime, optimistic updates, server actions | Browser/server clients, React Query, realtime, Server Actions |
| `references/storage.md` | File uploads, downloads, signed URLs, bucket policies | Storage patterns, RLS on buckets, image optimization |
| `references/edge-functions.md` | Serverless functions, webhooks, scheduled tasks | Edge Function patterns, secrets, CORS, invocation |

Always read the relevant reference BEFORE generating code or diagnosing errors.

## Output Format Decision

| Situation | Output format |
|-----------|---------------|
| User asks "how to set up auth/client/realtime" | Code snippet with explanation |
| User reports an error (401, 403, RLS violation) | Diagnosis → cause → fix (code) |
| User asks to design a table / schema | SQL migration file (numbered, with template) |
| User asks for a hook / data fetching | TypeScript hook code (React Query pattern) |
| User asks "how should I structure X" | Architecture recommendation with code examples |
| User asks to add Storage / upload | Storage setup + RLS policy + client code |
| User asks about Edge Function | Function template + deployment notes |
| User needs a Server Action | Server Action code with Supabase server client |

## Decision Flow

```
User has a Supabase question
  │
  ├─ Auth / session / login issue
  │    → Read references/auth.md
  │
  ├─ Schema / migration / trigger / FK / types
  │    → Read references/schema.md
  │
  ├─ Client setup / data fetching / realtime / server actions
  │    → Read references/client.md
  │
  ├─ File upload / download / storage / buckets
  │    → Read references/storage.md
  │
  ├─ Edge Function / webhook / cron
  │    → Read references/edge-functions.md
  │
  ├─ RLS policy issue
  │    → Read references/auth.md (RLS section)
  │    → Cross-reference with references/schema.md (FK/trigger interaction)
  │
  ├─ Error diagnosis (400/401/403/500)
  │    → Check Quick Diagnosis table below
  │
  └─ Architecture question ("how should I structure X")
       → Read all references, synthesize recommendation
```

## Quick Diagnosis

| Error / Symptom | Likely cause | Reference |
|----------------|-------------|-----------|
| 401 Unauthorized | Expired JWT, wrong client, missing auth header | auth.md |
| 403 Forbidden | RLS policy blocks the operation | auth.md §RLS |
| 400 Bad Request | Schema mismatch (missing column, wrong type) | schema.md |
| "new row violates row-level security" | INSERT policy missing or `owner_id`/`created_by` not set | auth.md §RLS |
| "permission denied for table" (42501) | Missing GRANT for the role | auth.md §Common RLS Errors |
| Query returns 0 rows, no error | RLS enabled with no matching policy — RLS never raises on SELECT | auth.md §RLS |
| Slow list query, advisor `auth_rls_initplan` | Bare `auth.uid()` in a policy is evaluated per row | auth.md §RLS Performance |
| Infinite redirect loop | `storageKey` or `flowType` override in client | auth.md §Client Config |
| Trigger error "column X does not exist" | Generic trigger on multiple tables | schema.md §Triggers |
| Data visible to wrong user | Missing or wrong RLS policy | auth.md §RLS |
| Realtime not firing | Missing replication, wrong channel config | client.md §Realtime |
| Optimistic update reverts | Mutation error swallowed, cache not rolled back | client.md §Optimistic |
| Storage upload 403 | Bucket RLS policy missing or wrong | storage.md §RLS |
| Edge Function timeout | Cold start or >2s execution | edge-functions.md |

## Core Principles

1. **RLS is your firewall** — never trust client-side filtering. RLS is the only reliable access control.
2. **Two clients, two contexts** — browser client (cookies) vs server client (headers). Never mix.
3. **Migrations go through the project's gate** — SQL files in `supabase/migrations/`, applied via the project's migration gate (dashboard-crm: Supabase MCP `apply_migration` — see crm-architect; a migration with `drop`/`delete` — by the owner in SQL Editor, MCP hangs on it). Next number — from `schema_migrations`, not from the folder. No `supabase db push`.
4. **Triggers are per-table** — generic multi-table triggers fail (`OLD.column` resolves at parse time).
5. **FK deletions at DB level** — `ON DELETE SET NULL` or `CASCADE`. Client-side cleanup fails under RLS.
6. **Schema is source of truth** — TypeScript types mirror DB schema. Regenerate after every migration with the project's script (dashboard-crm: `scripts/gen-types.sh`), never by hand.
7. **Server Actions for mutations** — prefer Server Actions over API routes for form submissions in Next.js 15.

## Workflow

1. **Identify** — determine what the user needs: auth, schema, client, storage, edge function, or error diagnosis.
2. **Route** — use Decision Flow to select the correct reference file(s).
3. **Read** — load the relevant reference(s) before writing any code.
4. **Apply** — generate code following the patterns from references. Use code templates as-is, adapting only entity names and columns.
5. **Verify** — check output against the Quality Checklist below.
6. **Deliver** — present code with brief explanation of WHY each piece is needed.

## Quality Checklist

Before delivering any Supabase code:

- [ ] RLS enabled on all new tables; `revoke all … from anon` + explicit grants to `authenticated`
- [ ] RLS policies cover SELECT, INSERT, UPDATE, DELETE, each `TO authenticated`
- [ ] Policies org-first, ownership via `owner_id`/`created_by`; INSERT has `WITH CHECK (owner_id = (select auth.uid()))`
- [ ] `auth.uid()` / role helpers wrapped in `(select …)` (initplan)
- [ ] Browser client in 'use client' components only
- [ ] Server client in Server Components / API routes / Server Actions only
- [ ] No `storageKey` or `flowType` overrides in client config
- [ ] Migration SQL uses `IF NOT EXISTS` / `IF EXISTS` where they exist; `ADD CONSTRAINT` / `CREATE POLICY` — `drop … if exists` + create, or a DO-guard on `pg_constraint`
- [ ] TypeScript types regenerated with the project script after migration
- [ ] Selects list explicit columns — no `*` / `rel(*)`
- [ ] FK constraints use appropriate ON DELETE strategy
- [ ] Trigger functions are per-table, not generic
- [ ] Indexes on every column a policy references (`org_id`, `owner_id`, `created_by`, `assigned_to`) and on FK columns
- [ ] Storage buckets have RLS policies (if applicable)

## Anti-Patterns (NEVER)

| Anti-pattern | Why | Do instead |
|-------------|-----|------------|
| `storageKey` in client config | Session mismatch, redirect loops | Use defaults |
| `flowType: 'implicit'` override | Breaks server-side code exchange in SSR | Use defaults (pkce) |
| Generic trigger for N tables | `OLD.column` parse-time resolution | Per-table trigger function |
| Client-side FK cleanup on DELETE | RLS blocks cross-user updates | `ON DELETE SET NULL/CASCADE` |
| `supabase db push` | Schema drift, migration conflicts | Project's migration gate (dashboard-crm: MCP `apply_migration`) |
| RLS disabled "temporarily" | Forgotten, data exposed | Always-on, SECURITY DEFINER for admin |
| Service key in client bundle | Full bypass of RLS | Anon key only in browser |
| `.single()` without error handling | Throws on 0 or 2+ results | Check for error, handle empty |
| Hardcoded user ID | Breaks multi-user, security hole | `(select auth.uid())` in policies, `getUser()` in server code |
| `*` / `rel(*)` in `.select()` | Payload and coupling grow with every new column | Explicit column list |
| API route for simple mutation | Unnecessary boilerplate in Next.js 15 | Server Action with server client |
