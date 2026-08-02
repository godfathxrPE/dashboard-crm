# Claude Code — S-CHAT-HUB-1a: фундамент чат-хаба (conversations + унификация messages)

**Эпик CHAT-HUB (фаза «Фундамент», спринт 1 из 2).** Цель эпика: чат — отдельный раздел
`/chat` в сайдбаре, general-канал организации + автоканалы проектов, unread-бейджи.
**Этот спринт (1a) — только модель данных и перевод существующего чата на неё.
Видимого UI-изменения НЕТ**: вкладка «Чат» на карточке сделки работает как раньше,
но поверх новой схемы. Хаб-UI и сайдбар — S-CHAT-HUB-1b, после гейта 1a.

**Почему generalized-модель:** сообщения привязываются к `conversation` (контейнеру),
а не к проекту напрямую — паттерн Bitrix24/Monday. Project-чат становится conversation
с `kind='project'`; general-канал и будущие группы/DM ложатся в ту же таблицу без
перестройки. Миграция дешёвая **сейчас** (в `project_messages` 2 строки, 0 реакций) и
дорогая после адопции.

**Ветка:** `feat/chat-hub-1a`. Миграции **094** (аддитивная + бэкфилл) и **095** (drop
legacy). **ОБЕ НЕ ПРИМЕНЯТЬ — применяет гейт Cowork через MCP.** 095 гейт применит
только после проверки, что чат живёт на новой схеме (Migration Safety Protocol).

---

## РАЗВЕДКА (выполнить до правок, результаты — в отчёт)

```bash
cd ~/Downloads/dashboard-crm
git checkout main && git pull --ff-only origin main
git checkout -b feat/chat-hub-1a
ls supabase/migrations/ | tail -5
grep -n "is_project_member" supabase/migrations/065_team_visibility.sql
grep -n "trg_zz_seed_columns\|seed_default_columns\|SECURITY DEFINER" supabase/migrations/20260712230000_baseline.sql | head -10
grep -rn "project_messages" src --include="*.ts" --include="*.tsx" -l
grep -n "ProjectMessageWithAuthor" src/types/entities.ts
grep -n "useRealtimeSync" src/lib/hooks/use-project-messages.ts src/lib/hooks/use-message-reactions.ts
```

Проверь: как сидер колонок (`trg_zz_seed_columns`) обходит RLS при вставке из триггера
(DEFINER-функция или INSERT-политика) — **зеркаль этот же приём** для сидеров conversations.

## КЛЮЧЕВЫЕ РЕШЕНИЯ (принять как есть)

1. **`conversations.kind`** — CHECK `('general','project','group','dm')`, но в 1a
   создаются только `general` и `project`, и только системно (бэкфилл + триггеры).
   INSERT-политики для authenticated НЕТ — клиент каналы не создаёт. `group`/`dm` в
   CHECK — чтобы фаза 2 не трогала constraint; путей создания у них пока нет.
2. **Членство — по kind, БЕЗ таблицы участников в 1a:** `general` = вся org,
   `project` = зеркало видимости проекта (ровно логика RLS из 067). Выносится в хелпер
   `is_conversation_member(uuid)` — по образцу `is_project_member` (065): SECURITY
   DEFINER STABLE, `SET search_path = public, pg_temp`, NULL-safe сравнения, REVOKE
   PUBLIC/anon. Участников проекта в отдельную таблицу НЕ копируем (двойная
   синхронизация — урок `companies.phone`).
3. **`messages` — новая таблица, id сохраняются.** Бэкфилл переносит 2 строки
   `project_messages` с теми же `id` → FK `message_reactions.message_id` перевешивается
   на `messages` без потери данных (реакций 0, но приём обязан быть корректным).
4. **`conversation_reads`** — (conversation_id, user_id, last_read_at), PK по паре.
   Фундамент unread-бейджей 1b. Пишет каждый только свою строку.
5. **Вкладка «Чат» на карточке остаётся** — тот же тред, источник — conversation
   проекта. Хаб (1b) откроет ту же conversation. Один источник, две точки входа.
6. **Realtime** — `messages` добавить в publication; у `messages` REPLICA IDENTITY
   FULL не нужен (реакций-паттерн W2 не про сообщения; DELETE сообщений
   инвалидируется по id из события — как сейчас в 067-чате).

## ЗАДАЧА 1 — Миграция `094_chat_hub.sql` (НЕ применять!)

Секции по порядку:

**1.1 `conversations`**
```sql
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('general','project','group','dm')),
  project_id uuid references public.projects(id) on delete cascade,
  title text check (title is null or length(title) between 1 and 120),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint conversations_project_kind_chk check ((kind = 'project') = (project_id is not null))
);
create unique index if not exists uq_conversations_general_per_org
  on public.conversations(org_id) where kind = 'general';
create unique index if not exists uq_conversations_project
  on public.conversations(project_id) where kind = 'project';
create index if not exists idx_conversations_org on public.conversations(org_id);
```
`trg_set_org_id` BEFORE INSERT (существующий `set_org_id()`), RLS on. Политики:
SELECT = `org_id = (select current_org_id()) and (select is_conversation_member(id))`;
INSERT/UPDATE/DELETE — не выдаём (v1: каналы системные). Grants: `grant select` to
authenticated, `revoke all from anon`.

**1.2 Хелпер `is_conversation_member(p_conversation_id uuid) returns boolean`**
SECURITY DEFINER STABLE, hardening-конвенция. Логика:
```
select kind, project_id, org_id from conversations where id = p_conversation_id;
если строки нет или org_id != current_org_id() (NULL-safe!) → false
kind='general' → true (в свою org попал через первую проверку)
kind='project' → current_org_role() in ('owner','admin')
                 or exists(projects p: p.id=project_id and (p.owner_id=auth.uid() or p.created_by=auth.uid()))
                 or is_project_member(project_id)
иначе (group/dm) → false  -- фаза 2 заменит функцию
```
REVOKE PUBLIC/anon, GRANT EXECUTE to authenticated, service_role.

**1.3 `messages`** — копия структуры `project_messages` c `conversation_id` вместо
`project_id` (body CHECK 1..4000, edited_at, author_id SET NULL DEFAULT auth.uid()).
`trg_set_org_id`. Индексы: `(conversation_id, created_at)`, `(org_id)`, `(author_id)`.
Политики — зеркало 067 с заменой project-условия на `is_conversation_member(conversation_id)`:
- SELECT: org + member;
- INSERT: org + `author_id = (select auth.uid())` + member;
- UPDATE: только свои, WITH CHECK = USING (автора не переназначить);
- DELETE: свои + org owner/admin.
Grants как в 067. `alter publication supabase_realtime add table public.messages;`
(с idempotent-guard как в 068).

**1.4 `conversation_reads`**
```sql
create table if not exists public.conversation_reads (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists idx_conversation_reads_user on public.conversation_reads(user_id);
create index if not exists idx_conversation_reads_org on public.conversation_reads(org_id);
```
`trg_set_org_id`. RLS: SELECT/INSERT/UPDATE только своё (`user_id = (select auth.uid())`
+ org + для INSERT member). DELETE не выдаём. Hard delete OK (эфемерная, как reactions).

**1.5 Сидеры.** DEFINER-функции по hardening-конвенции (или приём из
`trg_zz_seed_columns` — что найдёшь в разведке):
- `trg_zz_seed_general_conversation` AFTER INSERT ON organizations → INSERT general;
- `trg_zz_seed_project_conversation` AFTER INSERT ON projects → INSERT project-канал.
Имена с `zz_` (порядок триггеров именем — конвенция).

**1.6 Бэкфилл (в этой же миграции):**
```sql
insert into conversations (org_id, kind) select id, 'general' from organizations
  on conflict do nothing;
insert into conversations (org_id, kind, project_id)
  select org_id, 'project', id from projects on conflict do nothing;
insert into messages (id, org_id, conversation_id, author_id, body, edited_at, created_at)
  select pm.id, pm.org_id, c.id, pm.author_id, pm.body, pm.edited_at, pm.created_at
  from project_messages pm join conversations c on c.project_id = pm.project_id;
```
`on conflict do nothing` — на partial unique. **1.7** Перевесить FK реакций:
`alter table message_reactions drop constraint message_reactions_message_id_fkey;`
→ `add constraint ... references messages(id) on delete cascade;` Плюс в
SELECT/INSERT-политиках `message_reactions` EXISTS-подзапрос теперь к `messages`
(DROP/CREATE политик — политики 068 ссылались на `project_messages`).

## ЗАДАЧА 2 — Миграция `095_drop_project_messages.sql` (отдельный файл, НЕ применять)

`alter publication supabase_realtime drop table public.project_messages;` +
`drop table public.project_messages;` (политики и триггеры уйдут с таблицей).
Комментарий в шапке: «применять только после смока 094 + переключённого кода».

## ЗАДАЧА 3 — Типы (стаб до apply)

`src/types/supabase.gen.ts` НЕ трогать. В `src/types/database.ts` — временные стабы
`ConversationStub`, `MessageStub`, `ConversationReadStub` с комментарием
`// TODO: снимается регенерацией после apply 094 (scripts/gen-types.sh)` — точный
приём D3 (`DealStakeholdersStub`). В `src/types/entities.ts`:
`ProjectMessageWithAuthor` → `MessageWithAuthor` (поле `conversation_id` вместо
`project_id`; author-джойн как был), `Conversation`, `ConversationRead`.

## ЗАДАЧА 4 — Хуки

**4.1 `src/lib/hooks/use-conversations.ts` (новый):**
- `useProjectConversation(projectId)` — `select id from conversations where project_id = eq`,
  `enabled: !!projectId`, staleTime длинный (канал не меняется);
- `useConversations()` — список каналов юзера (пойдёт в 1b, но написать сейчас):
  `conversations` + embed `messages(created_at)` order desc limit 1 (PostgREST embed) +
  свои `conversation_reads`; отдаёт `{ conversation, lastMessageAt, hasUnread }[]`;
- `useMarkRead(conversationId)` — upsert `conversation_reads` (`onConflict:
  'conversation_id,user_id'`) с `last_read_at: now`.
- realtime: `useRealtimeSync('conversations')` не нужен (каналы статичны в 1a) —
  инвалидация списка по `messages`-событиям (ключ среза).

**4.2 `use-project-messages.ts` → `use-messages.ts`:** переписать на
`messages`/`conversation_id`. Сигнатуры хуков: `useMessages(conversationId)`,
`useSendMessage(conversationId)` и т.д. Сохранить ВСЁ: optimistic с TEMP_PREFIX,
замену temp-строки в onSuccess, `useRealtimeSync('messages')`, query key
`['messages', conversationId]`. Файл `use-project-messages.ts` удалить.

**4.3 `use-message-reactions.ts`:** проверить EXISTS/джойны — если хук ссылается на
`project_messages` или ключи `['project_messages', ...]` — перевести на messages-ключи.

## ЗАДАЧА 5 — `ProjectChat.tsx`: тред отдельно, привязка через conversation

Разбить: **`src/components/chat/MessageThread.tsx`** — весь тред (лента, инпут,
edit/delete, реакции), проп `conversationId` (+ `emptyText?`). Это переезд ~500 строк
из ProjectChat с заменой хуков — **поведение и разметку не менять** (1a — не
UI-спринт). `ProjectChat.tsx` худеет до обёртки: `useProjectConversation(project.id)`
→ `<MessageThread conversationId={...}>`; состояния loading (канала ещё нет —
скелетон) и error сохранить. Плюс: при открытом треде вызывать `useMarkRead` на
маунт и на приход нового сообщения (фундамент unread для 1b).

## EDGE CASES

- Канал проекта не найден (проект создан до apply 094 при незапущенном бэкфилле —
  не должно случиться, но): «Чат недоступен» + console.warn, не крэш.
- `messages` optimistic: `conversation_id` в temp-строке, `org_id: ''` как было.
- Юзер без прав на проект не получает realtime-события чужого канала (RLS на
  publication — как в 067, проверит гейт).
- Удалённый автор: `author: null` → рендер «Пользователь удалён» (как сейчас — проверь,
  что при переносе не сломал).

## ГЕЙТЫ CC

```bash
npx tsc --noEmit   # 0 ошибок, no any
npm run lint       # чисто
npm test           # зелёные
npm run build      # exit 0
git diff --stat    # миграции 094/095, types, 3 хука, chat/, ProjectChat; лишнего нет
```
Локально: открыть карточку сделки → вкладка «Чат» → отправка/правка/удаление/реакция
работают как до спринта (на живой БД до apply это НЕ проверить — так и напиши в
отчёте: runtime NOT_VERIFIED до гейта, это ожидаемо).

## КОММИТЫ (по задачам, conventional)

1. `feat(chat): 094 conversations + messages + reads, 095 drop legacy (не применены)`
2. `feat(chat): типы-стабы + хуки use-conversations / use-messages`
3. `refactor(chat): MessageThread из ProjectChat, привязка через conversation`

## ПОСЛЕ ТЕБЯ — гейт Cowork

Apply 094 → advisors → смоки RLS (owner/manager-участник/manager-чужой/viewer:
SELECT general, SELECT/INSERT project-канала, tamper author_id → 42501, reads только
свои) → сверка бэкфилла (2 сообщения с теми же id, 19 conversations: 1 general + 18
project) → смок вкладки «Чат» в UI → apply 095 → реген типов `scripts/gen-types.sh`
(снять стабы) → `docs/schema.md` + зеркало в скилле. Мерж — Олег.
