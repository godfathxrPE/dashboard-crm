# Claude Code Prompt — Sprint W1: Безопасность данных (RLS WITH CHECK, storage, anon, headers, safeHref, AI-дедуп)

Контекст: dashboard-crm (Next.js 15 + Supabase, multi-tenant: organizations/memberships, org_id ставит BEFORE INSERT триггер `set_org_id()`, роли через `current_org_role()`). Ревью 2026-07-18 (`_analysis/REVIEW-2026-07-18-senior-pm.md`) нашло межтенантную дыру на write-стороне RLS и хвосты по storage/headers.

**Правила спринта:**
- Миграции ПИШЕМ и коммитим, НЕ применяем — применяет гейт Cowork через `apply_migration` (атомарно, без BEGIN/COMMIT).
- Живые тела политик/функций сверяем интроспекцией (Supabase MCP read-only), не папкой миграций.
- Новые функции — по hardening-конвенции: `SECURITY DEFINER SET search_path = public, pg_temp` + адресный ACL (триггерные: REVOKE PUBLIC, GRANT service_role).
- Org-граница — первым конъюнктом, initplan-обёртка `( SELECT ... )`.

## РАЗВЕДКА

```bash
ls supabase/migrations/ | tail -5   # последняя — 053_quotes.sql; новые: 054, 055, 056
grep -rn "safeHref" src/ || echo "safeHref не существует — создаём"
grep -n "do_url" src/components/projects/ProjectDetail.tsx src/components/projects/DealDeliveryHub.tsx
grep -n "document_url" src/components/projects/QuotesTab.tsx
grep -n "Strict-Transport\|Content-Security" netlify.toml || echo "HSTS/CSP нет"
grep -n "ai_summary_at" supabase/functions/ai-summarize/index.ts | head
```

Интроспекция живой БД (Supabase MCP, read-only) — результат вставить в план миграции 054:

```sql
-- 1) Все UPDATE-политики без WITH CHECK (это и есть список для фикса):
select tablename, policyname, qual
from pg_policies
where schemaname='public' and cmd='UPDATE' and with_check is null
order by tablename;

-- 2) Все таблицы public с колонкой org_id (список для freeze-триггера):
select table_name from information_schema.columns
where table_schema='public' and column_name='org_id' order by 1;

-- 3) Текущее состояние бакета:
select id, name, public, file_size_limit, allowed_mime_types from storage.buckets;
select policyname, cmd, qual, with_check from pg_policies
where schemaname='storage' and tablename='objects';
```

Ожидаемые кандидаты без WITH CHECK (сверить с выводом №1): `calls_update`, `companies_update`, `contacts_update`, `leads_update`, `meetings_update`, `projects_update`, `tasks_update`, `project_columns_update`, `quotes_update`. Если разведка найдёт другие — включить и их.

**NB (grok-ревью):** baseline — снимок прода ДО 040, поэтому список из файла врёт минимум по `notif_update` (WITH CHECK добавлен 040 в live). Источник истины — только вывод №1 из живой БД. Для найденных политик БЕЗ org_id решение явное: `profiles_update_own` → `with check (id = ( select auth.uid() ))`; `org_update_owner` и прочие не-tenant → WITH CHECK = зеркало USING (у этих таблиц нет reassignment-флоу, зеркало ничего не ломает). Если политика уже с WITH CHECK (как `project_columns` в baseline) — пропуск с комментарием в миграции.

## ЗАДАЧА 1: Миграция 054 — WITH CHECK на UPDATE-политики + freeze org_id

Файл `supabase/migrations/054_rls_update_with_check.sql`.

**1a. WITH CHECK.** Для каждой политики из разведки №1 — `ALTER POLICY` с org-границей. НЕ зеркалим ролевые/ownership-условия из USING: WITH CHECK проверяет NEW-строку, и зеркало сломало бы легитимную смену `owner_id`/`assigned_to` менеджером (AssigneeSelect). Достаточно org-границы — межтенантный перенос закрывается, семантика приложения не меняется:

```sql
alter policy "calls_update" on public.calls
  with check (org_id = ( select public.current_org_id() ));
-- ... то же для companies, contacts, leads, meetings, projects, tasks,
--     project_columns, quotes и всего, что нашла разведка №1.
```

NB: если в списке окажется `meeting_attendees` (org_id нет, тенантность через join) — WITH CHECK зеркалит его USING (EXISTS к meetings), не org_id.

**1b. Freeze org_id.** Ремень + подтяжки: org_id иммутабелен на UPDATE. Молча возвращаем старое значение, НЕ raise — optimistic-объекты хуков содержат org_id-заглушки, и явно переданное значение не должно ронять легитимный апдейт:

```sql
create or replace function public.freeze_org_id()
returns trigger
language plpgsql
security definer set search_path = public, pg_temp
as $$
begin
  new.org_id := old.org_id;
  return new;
end $$;

revoke all on function public.freeze_org_id() from public, anon, authenticated;
grant execute on function public.freeze_org_id() to service_role;

-- Триггер на КАЖДУЮ таблицу из разведки №2 (aa_ — первым, до прочих BEFORE UPDATE):
do $$
declare t text;
begin
  for t in
    select table_name from information_schema.columns
    where table_schema='public' and column_name='org_id'
      and table_name in (select tablename from pg_tables where schemaname='public')
  loop
    execute format(
      'drop trigger if exists trg_aa_freeze_org_id on public.%I;
       create trigger trg_aa_freeze_org_id
         before update of org_id on public.%I
         for each row
         when (old.org_id is distinct from new.org_id)
         execute function public.freeze_org_id();',
      t, t);
  end loop;
end $$;
```

## ЗАДАЧА 2: Миграция 055 — storage-политики project-files в git

Файл `supabase/migrations/055_storage_project_files.sql`. Сначала сверить с разведкой №3 — существующие политики бакета переносим/заменяем осознанно, ничего не дублируем. Клиентский путь: `use-project-files.ts` пишет в `<user_id>/<projectId>/<uuid>.<ext>`, читает через `createSignedUrl`, метаданные в `public.project_files` (RLS own-only). Политики паритетны метаданным — own-path:

```sql
update storage.buckets
set public = false, file_size_limit = 52428800  -- 50 MB
where id = 'project-files';

drop policy if exists "project_files_select" on storage.objects;
create policy "project_files_select" on storage.objects for select to authenticated
  using (bucket_id = 'project-files'
     and (storage.foldername(name))[1] = ( select auth.uid() )::text);

drop policy if exists "project_files_insert" on storage.objects;
create policy "project_files_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'project-files'
     and (storage.foldername(name))[1] = ( select auth.uid() )::text);

drop policy if exists "project_files_delete" on storage.objects;
create policy "project_files_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'project-files'
     and (storage.foldername(name))[1] = ( select auth.uid() )::text);
```

Если разведка №3 покажет, что имена существующих политик другие — дропаем именно их (зафиксировать имена в комментарии миграции).

## ЗАДАЧА 3: Миграция 056 — снять anon с default privileges

Файл `supabase/migrations/056_revoke_anon_defaults.sql`. Вход в приложение только по magic link; под anon public-схема не нужна. Убирает класс риска «новая таблица без ENABLE RLS = публичная»:

```sql
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
```

Функции НЕ трогаем скопом — у definer-функций адресные ACL уже выставлены (024/034/040), скоп-revoke с них ничего не даёт, а сюрпризы возможны.

## ЗАДАЧА 4: netlify.toml — HSTS + CSP-lite

В существующий блок `[[headers]]` добавить (полный CSP с nonce для theme-init — отдельная задача, тут только то, что ничего не ломает):

```toml
    Strict-Transport-Security = "max-age=63072000; includeSubDomains; preload"
    Content-Security-Policy = "object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
```

## ЗАДАЧА 5: safeHref — фильтр схемы для href из данных

`do_url`/`document_url` вводятся руками и попадают в `<a href>` без проверки схемы — `javascript:`-URL это stored-XSS по клику коллеги.

1. Новый файл `src/lib/utils/safe-href.ts`:

```ts
/** Пропускает только http/https (опц. mailto/tel). Иначе undefined — ссылка не рендерится. */
export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(mailto|tel):/i.test(trimmed)) return trimmed;
  // голый домен без схемы — считаем https
  if (/^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(trimmed)) return `https://${trimmed}`;
  return undefined;
}
```

2. Применить в трёх местах (точные строки найти grep'ом из разведки):
   - `src/components/projects/ProjectDetail.tsx` (~748) — ссылка «Открыть в 1С:ДО» (`project.do_url`);
   - `src/components/projects/DealDeliveryHub.tsx` (~176) — `d.do_url`;
   - `src/components/projects/QuotesTab.tsx` (~167) — `q.document_url`.
   Паттерн: `const href = safeHref(raw); if (!href) → рендерить текст без <a>` (или не рендерить иконку).
3. Тест `tests/unit/safe-href.test.ts`: http/https проходят, `javascript:alert(1)`, `data:`, `vbscript:` → undefined, голый `example.com` → https, mailto/tel проходят.

## ЗАДАЧА 6: ai-summarize — дедуп повторной генерации

`supabase/functions/ai-summarize/index.ts`: перед вызовом Claude, после того как сущность найдена под RLS, — если `ai_summary_at` моложе 10 минут, вернуть 429 с нейтральным телом `{ error: 'Резюме уже сгенерировано недавно. Попробуйте позже.' }` (клиент достаёт текст из `error.context.json()` — уже умеет, см. `use-ai-summary.ts`). Паттерн ответа скопировать с существующих ошибок функции. Деплой функции — на гейте, не из CC.

## ПРОВЕРКА

```bash
npx tsc --noEmit
npx vitest run tests/unit/safe-href.test.ts
grep -rn "<a href={" src/components/projects/*.tsx | grep -E "do_url|document_url" | grep -v safeHref  # сырых <a href> не осталось (InlineEdit value={...do_url} — легитимен, не матчится)
```

## ГЕЙТ (Cowork, после ревью диффа)

1. `apply_migration` 054 → 055 → 056 по очереди.
2. Смоук 054 симуляцией ролей (паттерн learnings):
   - под членом org A: `update companies set org_id='<uuid org B>' where id='<своя>'` → строка осталась в org A (freeze), либо 42501 от WITH CHECK при прямом PostgREST-пути;
   - обычный `update companies set name=...` — проходит; смена `owner_id` менеджером — проходит.
3. Смоук 055: signed URL на свой файл работает; прямой публичный URL чужого файла → 400/403.
4. Смоук 056: логин по magic link живой, CRUD под authenticated живой.
5. `get_advisors` — без новых WARN.
6. `supabase functions deploy ai-summarize` + повторный вызов подряд → 429.
7. Обновить `docs/schema.md` + skill schema.md (раздел политик: WITH CHECK, freeze-триггер, storage) тем же заходом.

## КОММИТ

```bash
git add supabase/migrations/054_rls_update_with_check.sql supabase/migrations/055_storage_project_files.sql supabase/migrations/056_revoke_anon_defaults.sql netlify.toml src/lib/utils/safe-href.ts src/components/projects/ProjectDetail.tsx src/components/projects/DealDeliveryHub.tsx src/components/projects/QuotesTab.tsx supabase/functions/ai-summarize/index.ts tests/unit/safe-href.test.ts
git commit -m "Sprint W1: security — WITH CHECK+freeze org_id (054), storage policies в git (055), revoke anon defaults (056), HSTS/CSP-lite, safeHref, дедуп ai-summarize"
```
