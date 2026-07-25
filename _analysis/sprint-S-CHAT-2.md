# Claude Code Prompt — Sprint S-CHAT-2: реакции на сообщения (migration 068)

> **v2** — учтено ревью Grok (6.5→после правок; B1–B3 блокеры исправлены и сверены по живому коду Cowork на `main @ 35835d5`, W1–W8 вшиты).
> **Тип:** D3 · **migration-спринт**. CC пишет миграцию + типы + hook + UI и **коммитит, но НЕ применяет миграцию**. Гейт Cowork применяет через MCP `apply_migration` + RLS-смок ролями + advisors + regen типов + schema.md.
> **Стек:** Next 15 + TS strict + Tailwind + Supabase. RLS на всех user-facing таблицах. `var(--token)`. Radix нет.
> **База:** `main` (после мёржа S-CHAT-1.2 @ `35835d5`). Ветка: `feat/chat-reactions`.

---

## WHY + CRM-аналоги

Junction **message ↔ user ↔ emoji** с агрегацией чипами и toggle (Slack/Linear/GitHub reactions: `(reactable_id, user_id, emoji)`, UNIQUE по тройке, чип `эмодзи × count`, клик = свою add/remove). Salesforce Chatter «like» — вырожденный случай. **Hard-delete** (реакция эфемерна, не бизнес-запись → исключение из soft-delete default, задокументировано; в проекте soft-delete инфраструктуры нет — паритет `project_messages`/`project_videos`).

## DATA MODEL

- **message_reactions** — junction. `message_id → project_messages` **CASCADE**, `user_id → profiles` **CASCADE**, `org_id NOT NULL` (trg_set_org_id).
- Ownership: `user_id` = реактор. Lifecycle: нет (add/remove). `UNIQUE(message_id, user_id, emoji)`; дубль → 23505.

### RBAC / RLS матрица

```
                       | React own | Read (видимое сообщение) | Unreact own | Модерация чужих |
owner/admin (org)      |    ✓      |    ✓                     |    ✓        |    ✗ |
manager (org)          |    ✓      |    ✓                     |    ✓        |    ✗ |
participant (project   |    ✓      |    ✓                     |    ✓        |    ✗ |
member / viewer)       |           |                          |             |      |
```

«participant» = `is_project_member(project_id)`, **не** org-роль. SELECT-видимость **наследуется** от `project_messages` через `EXISTS` (owner/admin/member-логику не дублируем — паттерн `ai_runs` «по сущности»). Чужие реакции никто не снимает.

---

## РАЗВЕДКА (Cowork сверил живой код; CC переподтверждает Supabase MCP read-only + grep)

**БД (Supabase MCP, ref `uoiavcabxgdjugzryrmj`):**
- Следующая миграция = **068** (последняя применённая — `067_project_messages`). Skill `schema.md` знает 067 и «следующая 068» — доверять.
- `project_messages`: `id, org_id, project_id(→projects CASCADE), author_id(→profiles SET NULL, DEFAULT auth.uid()), body, edited_at, created_at`; единственный триггер `trg_set_org_id BEFORE INSERT EXECUTE set_org_id()`.
- RLS `project_messages` SELECT (зеркалим через EXISTS): `org_id=(SELECT current_org_id()) AND ((SELECT current_org_role()) IN ('owner','admin') OR EXISTS(projects p WHERE p.id=project_id AND (owner_id=uid OR created_by=uid)) OR (SELECT is_project_member(project_id)))`. Политики 067 объявлены `TO authenticated`.
- `message_reactions` не существует. Хелперы: `current_org_id/current_org_role/is_org_member/set_org_id/is_project_member`. `supabase_realtime` включает `project_messages` — добавить `message_reactions`.

**Клиентские якоря (сверено по коду — важно для B1–B3):**
- **Типы:** stub-таблицы живут в `src/types/supabase.gen.ts` (`project_messages` ~L1600), алиасы — в `src/types/entities.ts` (L52–60). `Database` (`src/types/database.ts`) собран из `GenDatabase` через `RelaxOrgId<Insert>` (org_id → optional). Клиент — `createClient(): SupabaseClient<Database>`. **Свободный `interface` НЕ добавит таблицу в `Database` → `.from(...)` не типизируется.**
- **Realtime:** `useRealtimeSync(table, queryKey?)` (`use-realtime.ts:105–109`), `key = queryKey ?? [table]`. `useRealtimeSync('message_reactions')` → инвалидирует `['message_reactions']` (underscore).
- **ProjectChat actions:** `ProjectChat.tsx:271–324` — `canEdit=mine&&!temp`, `canDelete=(mine||isModerator)&&!temp`, `actions=(canEdit||canDelete)&&…` (Pencil/Trash). Composer-пикер: `emojiOpen`/`emojiBtnRef` (L115–117, 427–438). `isTempMessage`/`temp-` из `use-project-messages.ts:20–22`.

grep для CC:
```
grep -n "project_messages" src/types/supabase.gen.ts | head
grep -n "ProjectMessage\|RelaxOrgId" src/types/entities.ts src/types/database.ts
grep -n "key = queryKey\|useRealtimeSync" src/lib/hooks/use-realtime.ts
grep -n "const actions\|canEdit\|canDelete\|emojiOpen\|isTempMessage" src/components/projects/ProjectChat.tsx
grep -rn "ChatEmojiPicker\|EMOJI_CATEGORIES" src   # переиспользуем пикер S-CHAT-1.2
```

---

## ЗАДАЧА 1 — Миграция `supabase/migrations/068_message_reactions.sql` (CC пишет+коммитит, НЕ применяет)

```sql
-- 068_message_reactions.sql — S-CHAT-2: реакции на сообщения чата
-- Junction message<->user<->emoji. Hard-delete (эфемерная сущность, не бизнес-запись).
-- Tenant через существующий set_org_id(). Новых функций нет.
-- CC: НЕ ПРИМЕНЯТЬ. Гейт Cowork применит через MCP apply_migration.

CREATE TABLE IF NOT EXISTS public.message_reactions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.organizations(id)    ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.project_messages(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL DEFAULT auth.uid()
                          REFERENCES public.profiles(id)          ON DELETE CASCADE,
  emoji      text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_reactions_uniq UNIQUE (message_id, user_id, emoji)
);

-- message_id покрыт ведущей колонкой UNIQUE; org_id (RLS) + user_id (FK/RLS)
CREATE INDEX IF NOT EXISTS idx_message_reactions_org  ON public.message_reactions(org_id);
CREATE INDEX IF NOT EXISTS idx_message_reactions_user ON public.message_reactions(user_id);

-- org_id проставляет существующий set_org_id() (как на project_messages)
DROP TRIGGER IF EXISTS trg_set_org_id ON public.message_reactions;
CREATE TRIGGER trg_set_org_id BEFORE INSERT ON public.message_reactions
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id();

-- W2: полный old-row для realtime DELETE-событий под RLS (unreact должен долетать до клиентов)
ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- SELECT: видит реакцию тот, кто видит сообщение (EXISTS под RLS project_messages). W1: TO authenticated.
CREATE POLICY message_reactions_select ON public.message_reactions
  FOR SELECT TO authenticated USING (
    org_id = (SELECT public.current_org_id())
    AND EXISTS (SELECT 1 FROM public.project_messages m WHERE m.id = message_reactions.message_id)
  );

-- INSERT: своя реакция, на видимое сообщение, в своей org
CREATE POLICY message_reactions_insert ON public.message_reactions
  FOR INSERT TO authenticated WITH CHECK (
    org_id  = (SELECT public.current_org_id())
    AND user_id = (SELECT auth.uid())
    AND EXISTS (SELECT 1 FROM public.project_messages m WHERE m.id = message_reactions.message_id)
  );

-- DELETE: только свою (реакция личная; чужую не модерируем; при удалении сообщения — CASCADE)
CREATE POLICY message_reactions_delete ON public.message_reactions
  FOR DELETE TO authenticated USING (
    org_id = (SELECT public.current_org_id())
    AND user_id = (SELECT auth.uid())
  );
-- UPDATE-политики НЕТ: реакции не редактируются.

-- Grants (в духе 056): anon — ничего; authenticated под RLS. UPDATE не выдаём.
REVOKE ALL ON public.message_reactions FROM anon, public;
GRANT SELECT, INSERT, DELETE ON public.message_reactions TO authenticated;

-- Realtime (idempotent-guard на повторный apply)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
  END IF;
END $$;
```

Заметки: initplan-обёртки `(SELECT …)` обязательны. `user_id DEFAULT auth.uid()` + WITH CHECK — клиент шлёт только `{message_id, emoji}`. Вставка **только клиентская под JWT**. Новых функций нет → hardening-хвоста нет.

---

## ЗАДАЧА 2 — Типы (B1: stub в gen + алиасы; НЕ database.ts)

**Живой паттерн (сверено):** таблицы-стабы миграций-без-regen кладутся в `src/types/supabase.gen.ts`, алиасятся в `src/types/entities.ts`. `RelaxOrgId` в `database.ts` сам делает `Insert.org_id` optional — руками `database.ts` не трогать.

1. В `src/types/supabase.gen.ts`, в блоке `Tables` рядом с `project_messages` (~L1600) — **STOPGAP-стаб** (заменит regen на гейте):
```ts
message_reactions: {
  Row: { id: string; org_id: string; message_id: string; user_id: string; emoji: string; created_at: string }
  Insert: { id?: string; org_id?: string; message_id: string; user_id?: string; emoji: string; created_at?: string }
  Update: { id?: string; org_id?: string; message_id?: string; user_id?: string; emoji?: string; created_at?: string }
  Relationships: [
    { foreignKeyName: "message_reactions_message_id_fkey"; columns: ["message_id"]; isOneToOne: false; referencedRelation: "project_messages"; referencedColumns: ["id"] },
    { foreignKeyName: "message_reactions_org_id_fkey"; columns: ["org_id"]; isOneToOne: false; referencedRelation: "organizations"; referencedColumns: ["id"] },
    { foreignKeyName: "message_reactions_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }
  ]
}
// STOPGAP S-CHAT-2 — заменить regenerated после apply 068 (гейт Cowork)
```
2. В `src/types/entities.ts` (рядом с ProjectMessage, L52–60):
```ts
export type MessageReaction = Database['public']['Tables']['message_reactions']['Row'];
export type MessageReactionInsert = Database['public']['Tables']['message_reactions']['Insert'];
export type MessageReactionWithUser = MessageReaction & { user: Pick<Profile, 'full_name' | 'avatar_url'> | null };
```
(Сверить имя `Profile` в entities.) Без `any`.

---

## ЗАДАЧА 3 — Hook `src/lib/hooks/use-message-reactions.ts`

**API (W4):** `useMessageReactions(projectId: string, messageIds: string[])` — `messageIds` приходят от `useProjectMessages`, без повторного fetch ленты.

- **Fetch:** `supabase.from('message_reactions').select('id, message_id, user_id, emoji, user:profiles(full_name, avatar_url)').in('message_id', messageIds)`. **W3: `enabled: messageIds.length > 0`** (пустой `.in()` → PostgREST ошибка), при пустом — `[]`.
- **QueryKey (B2): `['message_reactions', projectId]`** (underscore). `useRealtimeSync('message_reactions')` — дефолтный `['message_reactions']` префиксно инвалидирует ключ проекта (как `use-project-messages` с `['project_messages', projectId]`).
- **Агрегация на клиенте:** `Map<messageId, Array<{ emoji, count, mine, users: {name}[] }>>` — группировка по `(message_id, emoji)`; `mine = есть строка user_id===myId`.
- **`useToggleReaction()`** — optimistic `(messageId, emoji)`: `mine` → `DELETE .match({message_id, user_id: myId, emoji})`; иначе `INSERT {message_id, emoji}`. onMutate cancel+patch, onError rollback, onSettled invalidate `['message_reactions', projectId]`. **W5: `23505` → silent success + invalidate** (как `use-task-dependencies`/`use-project-members`), без toast. Ключ агрегации `(message_id,user_id,emoji)` идемпотентен — optimistic и realtime-эхо не удваиваются.

---

## ЗАДАЧА 4 — UI в `src/components/projects/ProjectChat.tsx` (B3)

- **Чипы реакций под пузырём** (свой и чужой): ряд `flex flex-wrap gap-1`, выравнивание как у пузыря. Чип = `<button>` `{emoji} {count}` (`tabular-nums`), подсвечен если `mine` (`bg-[var(--chat-own-bg)] border-[color:var(--chat-own-border)]`), иначе `bg-surface2 border-border`. Клик → `toggleReaction(m.id, emoji)`. `title` = имена из `users`.
- **Кнопка добавления — ОТДЕЛЬНО от `actions`** (B3-фикс): рендерить `SmilePlus` (lucide) для **всех non-temp** сообщений (не внутри `(canEdit||canDelete)`), на hover. `actions` (Pencil/Trash) оставить как есть под canEdit/canDelete.
- **Отдельный state пикера реакций** (НЕ шарить composer'ный `emojiOpen`/`emojiBtnRef`):
  ```ts
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const reactionAnchorRef = useRef<HTMLButtonElement | null>(null);
  // на клик SmilePlus: reactionAnchorRef.current = e.currentTarget; setReactionPickerFor(m.id)
  ```
  Один `ChatEmojiPicker` при `reactionPickerFor`: `anchorRef={reactionAnchorRef}`, `onPick={(e)=>{ toggleReaction(reactionPickerFor!, e); setReactionPickerFor(null); }}`, `onClose={()=>setReactionPickerFor(null)}`. Пикер (портал+clamp+над/под) — генерик, не менять.
- **temp:** для `isTempMessage(m)` — чипы и кнопку скрыть.
- Стили на токенах, `tabular-nums`, reduced-motion, эмодзи как текст (XSS цел).

---

## ГРАНИЦЫ SCOPE

Только реакции. **НЕ** треды/unread/вложения/упоминания/редактирование чужих реакций. **НЕ** трогать контраст пузырей и composer-пикер S-CHAT-1.2. Единственная новая таблица — `message_reactions`.

---

## ПРОВЕРКА (CC — миграцию НЕ применяет)

```bash
rm -rf .next
npx tsc --noEmit 2>&1 | head -20    # со stub в gen.ts — чисто (свободный interface НЕ прошёл бы)
npm run build 2>&1 | tail -8        # НЕ при живом dev на :3000
# 068 — только файл, apply НЕ запускать
```

## КОММИТ (B1/W8 — типы в gen+entities, НЕ database.ts)

```bash
git switch -c feat/chat-reactions   # от main @ >= 35835d5
git add supabase/migrations/068_message_reactions.sql \
        src/types/supabase.gen.ts \
        src/types/entities.ts \
        src/lib/hooks/use-message-reactions.ts \
        src/components/projects/ProjectChat.tsx
git commit -m "feat(chat): реакции на сообщения — message_reactions + RLS + realtime + UI (S-CHAT-2, migration 068 не применена)"
```

## ГЕЙТ COWORK (после пуша — НЕ CC)

1. Ревью diff+миграции. 2. `apply_migration('068_message_reactions')`. 3. **RLS-смок ролями:** участник INSERT→ok; дубль→**23505**; DELETE своей→ok; чужую DELETE→**0**; посторонний SELECT→**0**, INSERT→**42501**; tamper org_id/user_id→отказ WITH CHECK. 4. `pg_publication_tables` ∋ `message_reactions` + `relreplident='f'` (FULL). 5. `get_advisors` — без новых WARN. 6. `generate_typescript_types` → заменить stopgap; `tsc`. 7. **schema.md** (docs+skill): секция `message_reactions` (068), realtime, RLS «по сущности».

---

## VERIFICATION (сборка v2, Cowork)

```
Grok review:       6.5→addressed — B1(типы gen+entities), B2(queryKey underscore), B3(actions-рефактор+свой picker state) исправлены и сверены по коду; W1/W2/W3/W4/W5/W6/W7/W8 вшиты
Разведка БД:       PASS   — Supabase MCP: 068 free, project_messages RLS/триггер/realtime сняты
Data model + RLS:  PASS   — junction, EXISTS-наследование видимости, own-only, initplan, anon revoke, TO authenticated, REPLICA IDENTITY FULL
Type Safety:       WARNING — stopgap-stub в gen.ts до гейт-regen (помечен); без any
Backward Compat:   PASS   — новая таблица
Runtime:           NOT_VERIFIED — apply + смок на гейте
Migration:         NOT_APPLIED — CC пишет/коммитит, гейт применяет (068)
```
