# Claude Code Prompt — Sprint F1: S-CHAT-1

**Чат проекта: лента сообщений команды + realtime (отдельный модуль, НЕ Активность)**

> Якоря сверены Cowork по живому коду `@bb2f0b7`. **Миграция 067.** Эпик — самый крупный заход волны. **MVP-скоуп** (см. «Не в скоупе»): плоская лента + realtime + правка/удаление своих. Без unread-бейджа/тредов/вложений/реакций/@упоминаний — follow-up.

## Контекст
- `dashboard-crm` (Next.js 15 + TS + Tailwind + Supabase, Vercel). `origin/main = bb2f0b7`, миграции по **066** → **эта 067**.
- Цель (фидбек Олега, п.7): команда проекта общается в чате прямо на странице проекта — сообщения появляются в реальном времени.
- **Граница (решение Олега, locked):** чат — **отдельный модуль**, НЕ прокачка «Активности». Отдельная таблица `project_messages` (≠ `activity_log`), отдельный таб «Чат» (≠ таб «Активность»), отдельный хук (≠ `EntityTimeline`/`ActivityComposer`). Не трогать Активность. ⚠️ риск дубля с Активностью — UAT через 2 недели.
- **Migration-спринт:** CC пишет+коммитит `067_project_messages.sql`, **НЕ применяет**. Гейт Cowork применит + RLS-смок + advisors + проверка realtime. **Мёрж в main — только ПОСЛЕ apply.**

### Якоря (живой код @bb2f0b7)
| Что | Факт |
|---|---|
| Realtime-менеджер | `useRealtimeSync(table)` — `lib/hooks/use-realtime.ts` (refcount, один канал на таблицу, дебаунс; AUDIT 1.5). Пример: `useRealtimeSync('notifications')` в `use-notifications.ts:17` |
| Realtime publication | `supabase_realtime` = activities, ai_runs, calls, dashboard_sync, meetings, notifications, project_columns, project_members, projects, tasks → **+`project_messages`** |
| Кто видит проект (зеркалим для SELECT) | `projects_select`: `org AND (role∈owner/admin OR owner_id=uid OR created_by=uid)` + `projects_select_member`: `org AND is_project_member(id)` |
| Helper участника (065) | `is_project_member(p_project_id uuid) → bool` |
| set_org_id | `trg_set_org_id BEFORE INSERT` — org_id НЕ передавать |
| Автор (профиль) | `profiles`: `id, full_name, avatar_url`; `useTeamMembers()` (`use-team-members.ts`) резолвит id→имя/аватар |
| Табы | `ProjectDetail.tsx:151` `type Tab = 'activity'|'board'|'timeline'|'quotes'` → **+`'chat'`**; список табов ~842–847; рендер-секции ~863–890 |
| Типы (паттерн quotes/project_videos) | ручной stub в `supabase.gen.ts` + alias в `entities.ts` |
| vitest / относительное время | `lib/utils/activity-events.ts` (`relativeTime`/`describeEvent`) — переиспользовать для времени сообщений |

### Data Model (Data-Model-First)
`project_messages` (1:N к projects): `id`, `org_id`(NN, set_org_id), `project_id`(NN → projects CASCADE), `author_id`(→ profiles **ON DELETE SET NULL**, nullable — история переживает ушедшего автора), `body`(NN, CHECK length 1–4000), `edited_at`(nullable — при правке), `created_at`(NN default now()). **Hard delete** (в проекте нет `deleted_at`-инфраструктуры — консистентно; «сообщение удалено» — follow-up). **Realtime ON** (чат live).

### RLS (ключевое отличие от F2 — писать может ВСЯ команда)
- **SELECT** = зеркало `projects_select` (кто видит проект — читает чат): `org AND (role∈owner/admin OR project ownership OR is_project_member)`.
- **INSERT** = participant + автор — это сам: `org AND author_id=auth.uid() AND (role∈owner/admin OR project ownership OR is_project_member)`. **Рядовой участник пишет** (в отличие от видео/фаз=canManage).
- **UPDATE** (правка своих) = `author_id=auth.uid()` (with check тоже — автора не переназначить).
- **DELETE** = `author_id=auth.uid() OR role∈owner/admin` (свои + модерация admin).

## ⚠️ ГОЧИ
1. **CC миграцию НЕ применяет.** Мёрж после apply.
2. **Realtime:** добавить `project_messages` в publication (`alter publication supabase_realtime add table public.project_messages`). RLS применяется к realtime → участник получает события ТОЛЬКО своих проектов (не вся org). Клиент — `useRealtimeSync('project_messages')` (refcount-менеджер, не свой канал).
3. **Граница с Активностью:** новая таблица/таб/хук. НЕ писать в `activity_log`, НЕ трогать `ActivityComposer`/`EntityTimeline`/таб «Активность».
4. **XSS:** `body` рендерить как **текст** (React экранирует по умолчанию — НЕ `dangerouslySetInnerHTML`). Ссылки — опц. линкификация позже.
5. **org_id не передавать** (set_org_id); `author_id` — default `auth.uid()` (не передавать с клиента). FK `org_id→organizations CASCADE`, `author_id→profiles SET NULL`.
6. **Автоскролл:** к низу при своём новом сообщении и если пользователь уже внизу; НЕ дёргать вниз, если он листает историю выше.
7. **Composer:** Enter — отправить, Shift+Enter — перенос строки. Пустое/пробельное не отправлять. Оптимистичная вставка (temp id), realtime подтянет реальное (патчить кэш аккуратно — без дублей: dedupe по id при realtime-инвалидации).
8. **Типы-stub** (миграция не применена): ручной блок `project_messages` в `supabase.gen.ts` + alias в `entities.ts` (как `project_videos`/`quotes`).
9. **CSS-канон:** `bg-surface`/`var(--border)`/`text-text-*`/`bg-accent`; аватар — `avatar_url` или инициалы (fallback). Portal не нужен (встроенная панель).

## РАЗВЕДКА (ПЕРЕД правками)
```bash
cd ~/Downloads/dashboard-crm && git switch -c feat/chat && git log --oneline -1
ls supabase/migrations | tail -3                              # 067 свободна
grep -n "is_project_member\|projects_select\|add table" supabase/migrations/065*.sql supabase/migrations/066*.sql | head

# realtime-образец
sed -n '1,80p' src/lib/hooks/use-realtime.ts                  # useRealtimeSync + refcount
# табы + монтаж
grep -n "type Tab\|activeTab\|value: '\|=== 'activity'" src/components/projects/ProjectDetail.tsx | head -20
# автор + относительное время
sed -n '1,50p' src/lib/hooks/use-team-members.ts
grep -n "relativeTime\|export function" src/lib/utils/activity-events.ts | head
# граница: НЕ трогать
grep -rn "ActivityComposer\|EntityTimeline" src/components/projects/ProjectDetail.tsx | head
# stub-образец
grep -n "project_videos:\|quotes:" src/types/supabase.gen.ts | head
```
**Свод:** 067 свободна; `useRealtimeSync` (refcount); SELECT-предикат = копия `projects_select`+`_member`; INSERT participant + author=uid; куда встанет таб «Чат».

---

## ЗАДАЧА 1 — Миграция 067 + realtime + типы-stub  [риск: средний, DDL]
**Steps.**
1. `supabase/migrations/067_project_messages.sql`:
```sql
create table if not exists public.project_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null default auth.uid(),
  body text not null check (length(body) between 1 and 4000),
  edited_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.project_messages enable row level security;

create trigger trg_set_org_id before insert on public.project_messages
  for each row execute function public.set_org_id();

create index if not exists idx_project_messages_project on public.project_messages(project_id, created_at);
create index if not exists idx_project_messages_org on public.project_messages(org_id);
create index if not exists idx_project_messages_author on public.project_messages(author_id);

-- SELECT: зеркало projects_select (кто видит проект — читает чат)
create policy project_messages_select on public.project_messages for select to authenticated using (
  org_id = (select public.current_org_id())
  and (
    (select public.current_org_role()) in ('owner','admin')
    or exists (select 1 from public.projects p where p.id = project_id
               and (p.owner_id = (select auth.uid()) or p.created_by = (select auth.uid())))
    or (select public.is_project_member(project_id))
  )
);
-- INSERT: участник проекта пишет от своего имени (вся команда, НЕ только canManage)
create policy project_messages_insert on public.project_messages for insert to authenticated with check (
  org_id = (select public.current_org_id())
  and author_id = (select auth.uid())
  and (
    (select public.current_org_role()) in ('owner','admin')
    or exists (select 1 from public.projects p where p.id = project_id
               and (p.owner_id = (select auth.uid()) or p.created_by = (select auth.uid())))
    or (select public.is_project_member(project_id))
  )
);
-- UPDATE: правка только своих (автор не переназначается)
create policy project_messages_update on public.project_messages for update to authenticated
  using (org_id = (select public.current_org_id()) and author_id = (select auth.uid()))
  with check (org_id = (select public.current_org_id()) and author_id = (select auth.uid()));
-- DELETE: свои + модерация admin/owner
create policy project_messages_delete on public.project_messages for delete to authenticated using (
  org_id = (select public.current_org_id())
  and (author_id = (select auth.uid()) or (select public.current_org_role()) in ('owner','admin'))
);

alter publication supabase_realtime add table public.project_messages;

grant select, insert, update, delete on public.project_messages to authenticated;
revoke all on public.project_messages from anon;
```
> Свериться разведкой: SELECT/INSERT participant-предикат = точная копия `projects_select`+`projects_select_member` (без manager).
2. Типы-stub `project_messages` в `supabase.gen.ts` + alias `ProjectMessage`/`ProjectMessageInsert` в `entities.ts`. Тип для UI с автором: `ProjectMessageWithAuthor = ProjectMessage & { author: Pick<Profile,'id'|'full_name'|'avatar_url'> | null }`.
3. **НЕ применять.**

**Verification.** `npx tsc --noEmit`. `067` закоммичена, не применена.

---

## ЗАДАЧА 2 — Хук use-project-messages (realtime)  [риск: средний]
**Steps.** `src/lib/hooks/use-project-messages.ts`:
- `useProjectMessages(projectId)` — `queryKey ['project_messages', projectId]`; select `*, author:profiles!author_id(id, full_name, avatar_url)` order `created_at asc`; `useRealtimeSync('project_messages')` (live). Вернуть `{ messages, isLoading }`.
- `useSendMessage(projectId)` — insert `{ project_id, body }` (org_id/author_id НЕ передавать — БД). Оптимистичная вставка (temp id + текущий user из `useAuth`/профиля); `onSettled` invalidate. Dedupe: при realtime-инвалидации temp-строка заменяется реальной по возврату.
- `useEditMessage(projectId)` — update `{ id, body, edited_at: now }`.
- `useDeleteMessage(projectId)` — delete by id (hard); optimistic.

**Verification.** `npx tsc --noEmit`.

---

## ЗАДАЧА 3 — Компонент ProjectChat  [риск: средний]
**Steps.** `src/components/projects/ProjectChat.tsx` → `ProjectChat({ projectId })`:
1. `useProjectMessages(projectId)` + текущий пользователь (id — для «своё/чужое»).
2. **Лента** (скролл-контейнер `max-h`, `overflow-y-auto`): по каждому сообщению — аватар (`avatar_url` или инициалы) + имя автора (`author?.full_name ?? 'Участник'`) + `relativeTime(created_at)` + `body` (как текст, `whitespace-pre-wrap`) + «изм.» если `edited_at`. Свои — визуально выделить (выравнивание/фон). Группировка по дню (разделитель-дата) — опц., если просто.
3. **Свои сообщения:** hover → правка (инлайн-textarea → `useEditMessage`) и удаление (`window.confirm` → `useDeleteMessage`). Чужие — админ/owner видит удаление (модерация; гейт по org-роли).
4. **Composer** (низ): `<textarea>` + кнопка «Отправить». Enter — отправить, Shift+Enter — перенос. Пустое не шлём. `onError → toast.error`. После отправки — очистить + скролл вниз.
5. **Автоскролл** (гоча 6): к низу на маунте и при новом своём/входящем, если пользователь уже внизу; иначе не дёргать (показать «↓ новые» опц.).
6. Пустое состояние: «Сообщений пока нет — начните обсуждение».

**Verification.** `npx tsc --noEmit`.

---

## ЗАДАЧА 4 — Таб «Чат» на ProjectDetail  [риск: низкий]
**Steps.**
1. `type Tab` (стр.151) += `'chat'`.
2. В список табов (~842–847) добавить `{ value: 'chat' as const, label: 'Чат' }` (на всех проектах — и delivery, и client).
3. Рендер-секция: `{activeTab === 'chat' && <ProjectChat projectId={projectId} />}` (рядом с board/timeline/quotes).
4. Composer виден всем, кто открыл проект (SELECT прошёл = участник по зеркалу; RLS INSERT — бэкап, `onError` toast). Отдельный гейт не нужен.

**Verification.**
```bash
npx tsc --noEmit
npm run build   # НЕ при живом dev
```
Ручной смок (**после** apply 067): таб «Чат» → отправить сообщение → появилось; во второй вкладке/у другого юзера проекта — **появляется live** (realtime); правка/удаление своих; чужое рядовой не удаляет; не-участник проекта чат не видит.

### КОММИТ (миграция+хук / UI — 2 коммита)
```bash
# после Задач 1–2:
npx tsc --noEmit && git add -A && git commit -m "feat(chat): миграция 067 project_messages (RLS команда + realtime) + хук use-project-messages"
# после Задач 3–4:
npx tsc --noEmit && npm run build && git add -A && git commit -m "feat(chat): панель ProjectChat (лента + composer + правка/удаление своих) + таб «Чат»"
git push -u origin feat/chat
```

## ФИНАЛЬНАЯ ПРОВЕРКА
`npx tsc --noEmit` (0) · `npx vitest run` · `npm run build` (не при живом dev) · push → PR. **Мёрж — ПОСЛЕ apply 067 гейтом.**

## Для гейта Cowork
1. `apply_migration('067_project_messages')` → `get_advisors` → проверить `project_messages` в `supabase_realtime` publication.
2. **RLS-смок матрицей (JWT + rollback):** участник — SELECT видит + INSERT (author=self) ✅; посторонний — SELECT 0, INSERT → 42501; чужое сообщение — UPDATE/DELETE не-автором → 0/deny; автор — edit/delete свои ✅; admin — delete чужое ✅; INSERT с `author_id ≠ auth.uid()` → 42501 (подмена автора).
3. Только после apply — мёрж → regen типов (снять stub) → docs/schema.

## Не в скоупе (MVP — follow-up)
Unread-счётчик/бейдж на табе (нужна `project_message_reads` + last_read); треды/reply; вложения (есть project_files); реакции; @упоминания (+ notify); «сообщение удалено» soft-delete; линкификация/markdown; поиск. НЕ трогать: Активность (`activity_log`/`EntityTimeline`/`ActivityComposer`), notifications. Realtime — только `project_messages`.
