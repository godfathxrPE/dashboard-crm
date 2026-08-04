# Claude Code — S-CHAT-HUB-1c: произвольные группы

**Эпик CHAT-HUB, фаза 1c.** 1a дала модель (`conversations`/`messages`/`conversation_reads`),
1b — раздел `/chat` с общим каналом, автоканалами проектов и бейджами. Теперь — **каналы,
которые заводит человек**: произвольная группа с названием и составом участников, не
привязанная к проекту.

**Ветка:** `feat/chat-hub-1c` от `main`. Миграция **096** — писать и коммитить, **НЕ
применять**, применяет гейт. Файлы и вложения — 1d, здесь их нет.

---

## РАЗВЕДКА (до правок, результаты — в отчёт)

```bash
cd ~/Downloads/dashboard-crm
git checkout main && git pull --ff-only origin main
git checkout -b feat/chat-hub-1c
ls supabase/migrations/ | tail -4
grep -n "is_conversation_member" -A 60 supabase/migrations/094_chat_hub.sql | head -80
grep -n "create_webhook_endpoint\|p_name text" supabase/migrations/08*.sql | head
grep -n "moddatetime\|updated_at" supabase/migrations/*.sql | head
grep -n "export function useTeamMembers" -A 25 src/lib/hooks/use-team-members.ts
grep -n "window.confirm" src/components -r
grep -n "kind\|GENERAL_CHANNEL_TITLE\|title" src/lib/hooks/use-conversations.ts
```

Проверь и напиши в отчёт: (1) как оформлен ACL у существующей RPC-обёртки
(`create_webhook_endpoint` — образец для нашей), (2) есть ли в проекте расширение
`moddatetime` или свой триггер `updated_at`, (3) где ещё живёт `window.confirm` — новые
подтверждения через него **не делать** (блокирует браузерные смоки, в `MessageThread` уже
висит TODO на inline-confirm).

## КЛЮЧЕВЫЕ РЕШЕНИЯ (принять как есть)

1. **INSERT-политики на `conversations` по-прежнему НЕТ.** Группу создаёт RPC
   `create_group_conversation(p_title text, p_member_ids uuid[])` — SECURITY DEFINER.
   Причина не в удобстве: создание группы это вставка канала **плюс** N строк участников,
   и без атомарности отвалившийся второй шаг оставляет группу, в которую никто не входит,
   включая автора. Конвенция проекта — «database functions для атомарных multi-row
   операций». Заодно сохраняется инвариант 1a: второго, неконтролируемого пути создания
   каналов не появляется, `kind` навсегда остаётся под контролем БД.
2. **Участники — только у групп.** `conversation_members` заполняется для `kind='group'`
   и ни для чего больше. Для `general` и `project` членство по-прежнему **вычисляется**
   (вся org / зеркало видимости проекта). Копировать состав проекта в таблицу участников
   канала нельзя — это второй источник истины с ручной синхронизацией (урок
   `companies.phone` ↔ `phones[]`, и ровно поэтому в 1a таблицы участников не было).
3. **Управление группой — автор + org owner/admin.** Отдельной роли внутри канала
   (админ группы) НЕ заводим: это второй слой RBAC поверх существующего, и на команде из
   пяти человек он не окупается. Участник может **выйти сам** — удалить свою строку.
4. **Группы не прячутся за кнопкой «Показать все проекты».** Кнопка существует потому, что
   проектные каналы заводит сидер пачками; группу человек создал руками, и прятать её,
   пока в ней не написали, — значит прятать результат только что сделанного действия.
   Пустая группа видна всегда.
5. **Удаление группы — hard delete, каскадом уносит сообщения.** Конвенция проекта
   (`deleted_at`-инфраструктуры нет). Подтверждение — **inline, не `window.confirm`**:
   кнопка «Удалить» превращается в «Точно удалить?» / «Отмена» на 5 секунд.
6. **`conversations.updated_at` заводим сейчас** — в 1a его не было намеренно, потому что
   не было UPDATE-пути. Теперь путь есть (переименование), и колонка появляется вместе с
   ним, как и планировалось. Триггер — тем же приёмом, что в остальном проекте (найдёшь в
   разведке).

## ЗАДАЧА 1 — Миграция `096_chat_groups.sql` (НЕ применять!)

**1.1 `conversation_members`**
```sql
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  profile_id      uuid not null references public.profiles(id)      on delete cascade,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  added_by        uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);
```
Индексы: `(profile_id)`, `(org_id)`. `trg_set_org_id` + `trg_aa_freeze_org_id` — как на
трёх таблицах 094. RLS on.

**1.2 `conversations`: `updated_at` + инвариант заголовка**
- `alter table ... add column if not exists updated_at timestamptz not null default now();`
- триггер обновления `updated_at` (приём из разведки);
- `alter table ... add constraint conversations_group_title_chk check (kind <> 'group' or title is not null);`
  Существующие 19 строк проходят (групп нет) — валидация не упадёт.

**1.3 `is_conversation_member` — `create or replace`, ветка `group`**

⚠️ **Это самая рискованная правка спринта.** Функция гейтит доступ ко ВСЕМ каналам, а не
только к группам: её зовут `conversations_select`, `messages_select`, `messages_insert`,
`conversation_reads_*`. Ветки `general` и `project` **скопировать из 094 без единого
изменения символа** — сверь диффом. Меняется только хвост:
```
if v_kind in ('group','dm') then
  return exists (
    select 1 from public.conversation_members m
     where m.conversation_id = p_conversation_id
       and m.profile_id = auth.uid()
  );
end if;
return false;
```
`dm` кладём в ту же ветку: механика членства у него та же, а путей создания всё ещё нет.
Сигнатура, `stable`, `security definer`, `set search_path = public, pg_temp`, ACL —
не трогать.

**1.4 Политики `conversation_members`**
- **SELECT:** `org_id = current_org_id() and is_conversation_member(conversation_id)` —
  состав канала виден его участникам (нужно UI списку участников).
- **INSERT:** org + канал `kind='group'` + добавляющий это автор канала
  (`conversations.created_by = auth.uid()`) **или** org owner/admin.
- **DELETE:** те же, **плюс** `profile_id = auth.uid()` (выйти самому).
- **UPDATE-политики НЕТ** — строка участника не редактируется, только появляется и исчезает.
- Grants: `revoke all from anon`; `grant select, insert, delete to authenticated`.

**1.5 Политики `conversations` на UPDATE/DELETE (только группы!)**
```
using ( org_id = current_org_id() and kind = 'group'
        and ( created_by = auth.uid() or current_org_role() in ('owner','admin') ) )
```
В `WITH CHECK` для UPDATE — то же самое **плюс** `kind = 'group'`, чтобы переименованием
нельзя было превратить группу в общий канал или подсунуть `project_id`. `general` и
`project` под эти политики не попадают ни при каком раскладе — проверить смоком.
`grant update, delete on conversations to authenticated` (SELECT уже выдан в 094).

**1.6 RPC `create_group_conversation(p_title text, p_member_ids uuid[])`**
SECURITY DEFINER, hardening-конвенция (`set search_path = public, pg_temp`, `revoke all
from public, anon`, `grant execute to authenticated`). Тело:
- гард: `auth.uid()` не NULL и есть членство в org — иначе `raise exception ... 42501`
  (NULL-safe сравнения, урок 094);
- нормализовать `p_title`: `trim`, длина 1..120, иначе исключение с внятным текстом;
- `insert into conversations (org_id, kind, title) values (current_org_id(), 'group', ...)`
  returning id;
- вставить автора участником **всегда** (иначе создатель не увидит свою группу — членство
  группы вычисляется по таблице);
- вставить `p_member_ids`, **отфильтровав по членству в той же org** (`memberships`) и
  `on conflict do nothing`; чужие id молча отбрасываются, а не роняют вызов;
- вернуть `uuid` нового канала.
Отдельного сидер-триггера на автора не заводи — вставка внутри той же функции и так
атомарна, а лишний триггер это ещё один невидимый путь.

Комментарии `comment on table/function` — как в 094. В шапке миграции: зачем, что,
и блок отката.

## ЗАДАЧА 2 — Типы и хук

**Типы.** До apply — временный стаб по приёму 1a (`ChatHubStub` можно взять образцом из
истории: `git show 49b3045~1:src/types/database.ts`), назови `ChatGroupsStub`, тип
`conversation_members` + новое поле `updated_at` у `conversations`. В шапке — комментарий
«снимается регенерацией после apply 096». `supabase.gen.ts` руками НЕ трогать.

**`src/lib/hooks/use-conversation-members.ts` (новый):**
- `useConversationMembers(conversationId)` — состав канала с профилями
  (`profile:profiles(id, full_name, avatar_url)`), `enabled` только для групп;
- `useAddMembers(conversationId)` / `useRemoveMember(conversationId)` — optimistic,
  инвалидация состава и списка каналов;
- `useLeaveConversation(conversationId)` — удаление своей строки, после успеха увести с
  канала (снять `?c=`).

**`use-conversations.ts`:** `useCreateGroup()` — `supabase.rpc('create_group_conversation',
{ p_title, p_member_ids })`, инвалидация списка, возврат id (вызывающий сразу открывает
новый канал). `useRenameGroup()` / `useDeleteGroup()` — обычные UPDATE/DELETE.
В `ConversationListItem.title` добавь ветку: `kind='group'` → `conversation.title`
(теперь колонка наконец используется по назначению; для `general`/`project` она
по-прежнему НЕ читается).

## ЗАДАЧА 3 — UI

**`ChannelList`:** кнопка «Новая группа» в шапке панели. Раскладка становится:
общий канал → разделитель → **группы и непустые проектные каналы вместе по свежести** →
кнопка «Показать все проекты (N)» → пустые проектные. Группы в скрываемую часть не
попадают никогда (решение 4). Отличать группу от проекта в строке — иконкой
(`Users` против `Hash`), не текстовой пометкой.

**`GroupModal`** (`src/components/chat/GroupModal.tsx`) — одна модалка на создание и
редактирование (режим по наличию `conversationId`). Поля: название (валидация Zod,
`src/lib/validators/conversation.ts`), чекбокс-список участников из `useTeamMembers()`.
В режиме редактирования: переименование, добавление/удаление участников, кнопка
«Удалить группу» с inline-подтверждением (решение 5). Модалки лежат в фиче-папках, НЕ в
`components/modals/` (learnings).

**Шапка треда:** для группы — «N участников» и кнопка настроек, открывающая `GroupModal`;
для участника, который не автор — вместо настроек «Выйти из группы» с тем же inline-
подтверждением. Для `general`/`project` шапка не меняется.

## EDGE CASES

- Автор вышел из собственной группы: группа остаётся, `created_by` не меняется — он всё
  ещё может ей управлять по политике, но в списке её не видит. **Запрети выход автору**
  (кнопки нет, и это единственное место, где роль автора видна в UI): сначала удалить
  группу или ничего.
- Удалили последнего участника кроме автора — валидное состояние, группа живёт.
- Группа без сообщений — видна в списке, `lastMessageAt = null`, штампа времени нет.
- Одинаковые названия групп разрешены (уникальности нет и не надо) — не изобретай.
- Пользователя удалили из группы, пока у него открыт этот канал: следующий рефетч ленты
  вернёт пусто по RLS → показать «Канал недоступен» и снять `?c=` (механизм уже есть
  в `ChatView`, проверь, что срабатывает).
- `p_member_ids` пустой массив — валидно, группа из одного автора.

## ГЕЙТЫ CC

```bash
npx tsc --noEmit      # 0, no any
npm run lint          # без новых против baseline
npm test              # зелёные
npm run build         # exit 0
git diff --stat       # 096, типы-стаб, 2 хука, ChannelList, GroupModal, MessageThread, валидатор
```
Runtime до apply 096 не проверяется — так и напиши, это ожидаемо.

## КОММИТЫ

1. `feat(chat): 096 conversation_members, группы, RPC создания (не применена)`
2. `feat(chat): типы-стаб + хуки групп и участников`
3. `feat(chat): GroupModal, группы в списке каналов, управление составом`

## ПОСЛЕ ТЕБЯ — гейт Cowork

Apply 096 → advisors → **полный ре-смок ВСЕХ типов каналов** (не только групп: 1.3
переписывает функцию, которая гейтит общий канал и проекты тоже) → смоки групп: создание,
чужак не видит, участник видит, не-автор не переименовывает и не удаляет, выход своей
строкой, RPC с чужими `p_member_ids` их отбрасывает, UPDATE `general`-канала → отказ →
реген типов, снять `ChatGroupsStub` → `docs/schema.md`. Мерж — Олег.
