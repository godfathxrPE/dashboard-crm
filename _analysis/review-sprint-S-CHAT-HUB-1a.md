# Ревью: S-CHAT-HUB-1a — фундамент чат-хаба (conversations + messages)

**Дата:** 2026-08-02  
**Ревьюер:** Grok (верификация по коду `main` @ `5eae31b`; 065/067/068, `ProjectChat`/`use-project-messages`/`use-message-reactions`, seed `seed_project_columns`)  
**Объект:** `_analysis/sprint-S-CHAT-HUB-1a.md` — миграции **094** + **095**, переключение кода, без хаб-UI  
**Контекст:** эпик CHAT-HUB фаза 1/2; legacy `project_messages` (067) + `message_reactions` (068); 1b = `/chat` + sidebar. Следующая свободная после **093** — **094** ✅.

**Шкала:** 0–100; **≥ 85 = GO**. Открытый B* → max 84.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Модель conversation + kind CHECK (general/project/group/dm) | ✅ |
| Без membership-таблицы; `is_conversation_member` ≈ 067 | ✅ |
| Сохранение `messages.id` = legacy id (FK reactions) | ✅ |
| 094 + 095 split (drop после smoke) | ✅ |
| `094`/`095` свободны | ✅ |
| Зеркало 067 RLS (select/insert/update/delete) | ✅ |
| Хуки rename + MessageThread extract | ✅ |
| UI 1a no visible change / 1b out | ✅ |
| Seed DEFINER как `seed_project_columns` | ✅ (паттерн найден) |
| `window.confirm` в ProjectChat (сохранится) | 🟡 anti-pattern, 1a freeze |
| freeze_org_id на новых таблицах | 🟡 нет в сниппете |
| Стабы типов (gen vs database.ts) | 🟡 уточнить |
| Edge «Пользователь удалён» | 🟡 факт: «Участник» |
| PostgREST last-message embed | 🟡 1b-ready, fragile |

**Оценка: 89/100 (GO).** Фундамент правильный: generalized model до адопции, dual migration safety, member helper без double-sync. Executable; warnings — hygiene и точность edge-case copy.  
- Порог: **≥ 85**.  
- Открытых B* нет.

**Рекомендация:** запускать в CC на `feat/chat-hub-1a` от `main` @ `5eae31b`. **Не apply 094/095.** Runtime UI — NOT_VERIFIED до гейта (ожидаемо).

---

## Статус (репо)

| Заход | Статус |
|-------|--------|
| HEAD | `5eae31b` (docs schema 093) |
| 091–093 | на месте; **094/095 free** |
| `project_messages` / `message_reactions` | 067/068 applied (gen + hooks) |
| `ProjectChat.tsx` | ~541 LOC; tab in `ProjectDetail:864` |
| `is_project_member` | 065 DEFINER STABLE |
| `seed_project_columns` | baseline DEFINER + `trg_zz_seed_columns` |
| Review | не было (этот документ) |
| Tests (local) | **604** passed (спринт baseline не фиксирует число — ок) |

---

## С чем согласен полностью

### 1. Generalized `conversations` сейчас, не после адопции

2 сообщения / 0 реакций — дешёвый момент. `kind` + `project_id` CHECK `(kind='project')=(project_id IS NOT NULL)` + partial unique general/project — корректная схема. `group`/`dm` в CHECK без create-path — фаза 2 без re-narrow.

### 2. Членство без таблицы участников

`is_conversation_member` зеркалит 067 visibility: org → general; project → owner/admin org ∨ project owner/creator ∨ `is_project_member`. Не копировать `project_members` (урок phone dual-source). `group`/`dm` → false до фазы 2.

### 3. `messages` с сохранением id + rehang FK reactions

Бэкфилл `insert … select pm.id, …` → `message_reactions.message_id` FK на `messages` без rewrite. Порядок: backfill messages → drop/add FK → rewrite reaction policies EXISTS → `messages`.

### 4. 095 отдельно

Drop `project_messages` только после smoke 094 + переключённого кода — Migration Safety Protocol. Комментарий в шапке 095 обязателен.

### 5. Клиент: rename hooks + thin ProjectChat

`useMessages(conversationId)`, key `['messages', conversationId]`, TEMP_PREFIX optimistic, realtime `messages`. `useProjectConversation` → thread. `useMarkRead` — фундамент unread 1b. Reactions: filter `.in('message_id', messageIds)` — table FK меняется, client logic почти та же (ключ → conversationId).

### 6. Сидеры DEFINER

`seed_project_columns` (baseline): `SECURITY DEFINER`, `search_path`, insert с `NEW.org_id`/`NEW.id`, trigger `trg_zz_seed_*`. Зеркалить для general (AFTER INSERT organizations) и project (AFTER INSERT projects).

### 7. Scope 1a

Вкладка на карточке = тот же тред; хаб/sidebar — 1b. Нет UI redesign.

---

## Блокеры

**Нет.**

---

## Предупреждения

### W1. `freeze_org_id` на новых org-таблицах

092/088 явно вешают `trg_aa_freeze_org_id`. 067 (legacy chat) — нет freeze (старее конвенции). Для **conversations / messages / conversation_reads** в 094 добавить freeze (BEFORE UPDATE OF org_id + WHEN distinct) — паритет с текущей конвенцией и 054.

### W2. Стабы типов: не «как D3 Stub-имя»

- 067/068: стаб **в `supabase.gen.ts`**, алиасы в `entities.ts`.  
- D3: `deal_stakeholders` уже в gen.  
Спринт: «не трогать gen», стабы в `database.ts` (`ConversationStub`…).  

`.from('messages')` / `.from('conversations')` типизируются через gen `Tables`. Без расширения gen **или** merge в `Database` type — tsc упадёт.  
**CC:** либо временные Table-блоки в `supabase.gen.ts` (как 067 WARNING-комментарий), либо расширить `Database['public']['Tables']` в `database.ts`; в отчёте — снять после `scripts/gen-types.sh` на гейте. Не free-floating interfaces без связи с client.

### W3. Edge-case copy: «Пользователь удалён»

Факт в UI: `m.author?.full_name ?? 'Участник'` (`ProjectChat:463`), avatar `?`. Не «Пользователь удалён». При переносе **сохранить текущий** текст; не «чинить» copy в 1a.

### W4. `window.confirm` в delete

`ProjectChat:251` — `window.confirm('Удалить сообщение?')`. Конвенция проекта (Gantt/webhooks) запрещает; 1a говорит «разметку/поведение не менять» → anti-pattern **переезжает** в `MessageThread`.  
Не блокер 1a; записать follow-up (inline confirm) в 1b/polish. В self-check 1a: **не** требовать 0 `window.confirm` в chat.

### W5. `useConversations` embed last message

PostgREST nested `messages(created_at)` + order/limit — хрупкий синтаксис; при сомнении — fetch last message client-side или отдельный RPC в 1b. Для 1a достаточно, если compile/type ok; hasUnread null-safe: never-read ⇒ unread if any message.

### W6. Reactions API rename

`useMessageReactions(projectId, messageIds)` — `projectId` только cache key. Переименовать в `conversationId` + key `['message_reactions', conversationId]` для симметрии; query по-прежнему `.in('message_id', …)`.

### W7. Мелочи SQL/process

- Policies: `to authenticated` + initplan `(select current_org_id())` — как 067.  
- Realtime add `messages` — idempotent DO-block как 068.  
- 095: `alter publication … drop table project_messages` может упасть, если таблицы нет в publication — guard.  
- Backfill `on conflict do nothing` без target — OK для any unique violation (partial indexes).  
- `conversations` grants: только SELECT — ок; seeds DEFINER.  
- `created_by default auth.uid()` — в seed/backfill может быть null; nullable OK.  
- Три коммита conventional — ок.  
- Gate smoke counts (2 messages, 19 conversations) — сверить live, не хардкодить в миграции.

### W8. Импорт-граф

Переименование ломает: `use-project-messages`, `ProjectMessageWithAuthor`, keys. Grep-all + `MessageWithAuthor`. `ChatEmojiPicker` остаётся в `projects/` — MessageThread импортирует оттуда (или move later).

---

## Пропущенные места (grep)

| Файл | Факт | Действие |
|------|------|----------|
| `067_project_messages.sql` | full RLS + grants + realtime | mirror → messages |
| `068_message_reactions.sql` | FK + policies EXISTS project_messages | rehang + EXISTS messages |
| `065 is_project_member` | DEFINER STABLE ACL | template for is_conversation_member |
| `baseline seed_project_columns` | DEFINER insert NEW.org_id | seed conversations |
| `use-project-messages.ts` | keys/table/cols project_id | → use-messages.ts |
| `use-message-reactions.ts` | key projectId; .in message_id | rename key; FK via messages |
| `ProjectChat.tsx` ~541 | full UI | extract MessageThread; thin wrapper |
| `ProjectDetail.tsx:864` | tab chat | keep ProjectChat |
| `entities.ts:66-84` | ProjectMessage* types | MessageWithAuthor + Conversation* |
| `scripts/gen-types.sh` | exists | gate regen |

Пропусков consumer'ов `project_messages` вне chat-стека **нет** (src list = hooks + ProjectChat + types).

---

## Предлагаемые правки в спринт (необяз.)

1. 094: `trg_aa_freeze_org_id` на 3 таблицы.  
2. HOW types: явный путь tsc (gen stub **или** Database merge).  
3. Edge author: «Участник», не «Пользователь удалён».  
4. Note: window.confirm сохраняется → follow-up.  
5. Reactions: param `conversationId`.

---

## Чеклист crm-architect

- [x] РАЗВЕДКА commands  
- [x] Real schema (067/068/065)  
- [x] Real paths  
- [x] DEFINER + search_path + ACL helpers  
- [x] org-first RLS; no client channel create  
- [x] Hard delete; CASCADE on project conversation  
- [x] Migrations not applied from CC  
- [x] 095 after smoke  
- [ ] freeze_org_id — **добавить** (W1)  
- [ ] schema.md — **gate** after apply  

---

## Чеклист перед CC

- [ ] Branch `feat/chat-hub-1a` from `5eae31b`  
- [ ] `094_chat_hub.sql` + `095_drop_project_messages.sql` (не apply)  
- [ ] Helper + seeds + backfill + FK rehang + reaction policies  
- [ ] Types stubs → hooks use-conversations / use-messages  
- [ ] MessageThread + thin ProjectChat + useMarkRead  
- [ ] tsc / lint / test / build  
- [ ] `git diff` no hub UI / no sidebar  
- [ ] 3 conventional commits  
- [ ] Report: runtime NOT_VERIFIED; stub strategy; seed pattern used  

---

## Баллы

| | Макс | Факт |
|--|------|------|
| Data model / migration safety | 30 | 28 |
| RLS / helper / seeds | 25 | 23 |
| Client refactor (hooks/thread) | 25 | 22 |
| Scope / accuracy / process | 20 | 16 |
| **Итого** | **100** | **89** |

**Итог: 89/100 GO** — можно в Claude Code.
