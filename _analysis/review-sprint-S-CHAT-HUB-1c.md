# Ревью: S-CHAT-HUB-1c — произвольные группы

**Дата:** 2026-08-02  
**Ревьюер:** Grok (верификация по коду `main` @ `a4321d1` post-1b; 094 `is_conversation_member`, ChannelList/ChatView/use-conversations, 088 RPC ACL, `update_updated_at`)  
**Объект:** `_analysis/sprint-S-CHAT-HUB-1c.md` — миграция **096**, `conversation_members`, RPC `create_group_conversation`, GroupModal  
**Контекст:** 1a модель + 1b хаб/бейджи; 1d files out. Следующая свободная миграция — **096** ✅.

**Шкала:** 0–100; **≥ 85 = GO**. Открытый B* → max 84.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| RPC create (атомарность) vs INSERT policy | ✅ |
| Members only for `kind='group'` | ✅ |
| Manage = author ∨ org owner/admin; leave self | ✅ |
| Groups always visible (не за expand) | ✅ product |
| Hard delete + inline confirm (no window.confirm) | ✅ |
| `updated_at` + rename path | ✅ (planned in 094 comments) |
| `is_conversation_member` replace risk called out | ✅ |
| 096 free; ACL sample create_webhook_endpoint | ✅ |
| ChannelList/title hooks need careful 1c delta | 🟡 |
| Realtime list when added to group | 🟡 |
| MessageThread header API for group chrome | 🟡 |

**Оценка: 90/100 (GO).** Модель и RPC-дизайн стыкуются с 1a/1b; главный риск (rewrite membership helper) осознан и покрыт gate re-smoke. Executable.  
- Порог: **≥ 85**.  
- Открытых B* нет.

**Рекомендация:** запускать в CC на `feat/chat-hub-1c` от `main` @ `a4321d1`. **096 не apply.** Runtime NOT_VERIFIED до гейта — ожидаемо.

---

## Статус (репо)

| Заход | Статус |
|-------|--------|
| HEAD | `a4321d1` Merge `feat/chat-hub-1b` |
| 094/095 | applied; `is_conversation_member` → false for group/dm |
| conversations grants | **SELECT only** (094:168) |
| ChannelList | general → non-empty non-general → empty expand |
| useConversations title | general \| **project name only** (group → bug «Проект») |
| ChatView unknown `?c=` | clear + «Канал недоступен» ✅ |
| MessageThread | className/listClassName; header title only |
| `window.confirm` | MessageThread delete + tasks/gantt/videos (legacy) |
| `update_updated_at` | baseline; no moddatetime extension |
| 096 | **free** |
| Review | не было (этот документ) |

---

## РАЗВЕДКА (факты для отчёта CC)

### (1) ACL RPC-образец — `create_webhook_endpoint` (088)

- `language plpgsql` + `security definer` + `set search_path = public, pg_temp`
- Ручной гейт: `current_org_id()` / `current_org_role()`; null → `42501`
- `revoke all … from public, anon`; `grant execute to authenticated`
- `comment on function`
- Валидация входа + explicit `org_id` в INSERT

Для `create_group_conversation`: тот же каркас; **роль owner/admin не требуется** (любой член org) — только `auth.uid()` + org membership, как в спринте.

### (2) `updated_at`

Расширения `moddatetime` **нет**. Проект: `public.update_updated_at()` + trigger  
`trg_set_updated_at before update … execute function public.update_updated_at()` (053/077/…).

### (3) `window.confirm`

Живёт в `MessageThread` (delete msg, TODO polish), Gantt, Kanban, ProjectVideos.  
WebhooksSection / DealStakeholders — **inline**. Новые подтверждения 1c — **только inline** (5 с).

---

## С чем согласен полностью

### 1. RPC, не INSERT-policy на conversations

Группа = conversation + N members атомарно. DEFINER + filter members by `memberships` + always insert author. Сохраняет инвариант 1a: kind/create path только БД.

### 2. Members table только для group

general/project membership остаётся вычисляемым. Не дублировать project_members (phone lesson).

### 3. RBAC: author ∨ org owner/admin; self-leave

Без «админа группы». Автор не выходит (edge) — иначе «видит по политике, не видит в списке».

### 4. Empty groups always listed

В отличие от seed-empty projects. Expand button остаётся только для **пустых project**.

### 5. Hard delete cascade + group title CHECK

`conversations_group_title_chk`; 19 existing rows pass (no groups). 094 already noted updated_at deferred until rename path — 1c is that path.

### 6. `is_conversation_member` risk

General/project branches **byte-identical** from 094 (incl. `coalesce(…, false)` on project — fix `1471a59`). Only tail becomes members EXISTS for `group`/`dm`. Gate: **full multi-kind re-smoke**.

### 7. UI surfaces

ChannelList + GroupModal + thread header; validators in feature folder; Modal pattern like webhooks.

---

## Блокеры

**Нет.**

---

## Предупреждения

### W1. `useConversations` title — обязательная ветка `group`

Сейчас (1b):

```ts
title: kind === 'general' ? GENERAL : project?.name ?? 'Проект'
```

`kind='group'` → **«Проект»**. 1c MUST:

```ts
kind === 'general' → GENERAL_CHANNEL_TITLE
kind === 'group'   → conversation.title ?? 'Группа'
else               → project?.name ?? 'Проект'
```

И **не** читать `title` для general/project.

### W2. ChannelList filter — groups ≠ empty projects

Сейчас:

```ts
const projects = conversations.filter(kind !== 'general');
const empty = projects.filter(lastMessageAt === null);
```

Пустая **группа** уйдёт за «Показать все проекты (N)» — прямо против решения 4.  
Нужно:

- `general`
- `live = groups (all) ∪ project with messages` — sort already from hook
- `emptyProjects = kind==='project' && !lastMessageAt` only  
- Icons: `Users` vs `Hash`

Кнопка N = only empty projects.

### W3. Realtime: добавили в группу без сообщений

Список инвалидируется на `messages` only. Новый участник / empty group может не появиться у других до focus refetch (staleTime 60s).  
Рекомендация: `useRealtimeSync('conversation_members', ['conversations', 'list'])` и/или publication add `conversation_members` (idempotent 068-style). Минимум — invalidate list on create/add/remove/leave (mutations already).

### W4. MessageThread header for groups

Header today: icon + title + count. Sprint: «N участников» + settings / leave.  
Options: `headerExtra?: ReactNode` from ChatView, or group-specific props (`kind`, `memberCount`, `canManage`, callbacks). Не раздувать thread business logic — **ChatView/GroupModal orchestrate**, thread accepts slots.

### W5. `CONVERSATION_COLS` + stub types

После 096: `updated_at` in select if needed. Stub `ChatGroupsStub` / Database merge for `conversation_members` + conversations.updated_at — same 1a/1b pattern; **не** hand-edit gen until gate.

### W6. RPC / policy SQL hygiene

- Member INSERT/DELETE policies: EXISTS conversation `kind='group'` + (created_by = auth.uid() OR role in owner/admin); DELETE also `profile_id = auth.uid()`.
- WITH CHECK UPDATE: `kind = 'group'` and keep `project_id is null` (existing CHECK helps).
- `grant update, delete on conversations to authenticated` (select already).
- `trg_aa_freeze_org_id` + `trg_set_org_id` on `conversation_members`.
- Group branch of helper: `profile_id = (select auth.uid())` + NULL-safe if no session.
- Filter `p_member_ids` via `memberships` where `org_id = v_org`.

### W7. Viewer can create groups

RPC only requires org membership — viewers included. Acceptable for chat; if product wants manager+, add role gate like webhooks. Document in report.

### W8. Empty group sort

Hook sorts empty by `created_at` among empties; UI pulls all groups into main list — OK. Empty group has no time stamp — OK (ChannelList already null stamp).

### W9. Gate re-smoke scope

Not only groups: general SELECT, project write, message insert, reads, **UPDATE/DELETE general → deny**, foreign member_ids dropped.

---

## Пропущенные места (grep)

| Файл | Факт | Действие 1c |
|------|------|-------------|
| `094_chat_hub.sql` `is_conversation_member` | group/dm → false | replace tail only |
| `094` grants conversations | select only | + update/delete |
| `use-conversations.ts` title + cols | no group title | W1; create/rename/delete hooks |
| `ChannelList.tsx` | non-general split | W2 + New group button |
| `ChatView.tsx` | unavailable mechanism | reuse for kicked member |
| `MessageThread.tsx` header | title only | slot/actions |
| `use-team-members.ts` | profiles + memberships | GroupModal checklist |
| `088 create_webhook_endpoint` | DEFINER ACL | RPC template |
| `update_updated_at` | baseline | conversations trigger |
| `validators/` | no conversation.ts | new zod |

---

## Предлагаемые правки в спринт (необяз.)

1. Явный pseudo-code ChannelList filters (W2).  
2. Realtime note for members table.  
3. MessageThread: `headerExtra` prop rather than re-fork.  
4. Optional: who may create groups (viewer?).

CC can implement without markdown edits if careful.

---

## Чеклист crm-architect

- [x] РАЗВЕДКА  
- [x] Migration file, not apply  
- [x] DEFINER + search_path + ACL  
- [x] org-first RLS; initplan roles  
- [x] freeze_org_id on new table  
- [x] Hard delete CASCADE  
- [x] No soft-delete; no window.confirm for new UX  
- [x] general/project membership unchanged (copy paste)  
- [ ] schema.md — **gate** after apply  

---

## Чеклист перед CC

- [ ] Branch `feat/chat-hub-1c` from `a4321d1`  
- [ ] `096_chat_groups.sql` complete (members, updated_at, helper, policies, RPC)  
- [ ] Diff helper: only group/dm tail changed  
- [ ] Stubs + hooks members/create/rename/delete/leave  
- [ ] ChannelList layout + icons + GroupModal  
- [ ] Title branch group; empty filter project-only  
- [ ] Inline delete confirm 5s  
- [ ] tsc/lint/test/build; no apply  
- [ ] Report: NOT_VERIFIED runtime; ACL/updated_at/confirm findings  

---

## Баллы

| | Макс | Факт |
|--|------|------|
| Data model / RPC / RLS | 35 | 33 |
| 1a/1b integration risk handling | 25 | 23 |
| UI / hooks completeness | 25 | 21 |
| Process / edge / hygiene | 15 | 13 |
| **Итого** | **100** | **90** |

**Итог: 90/100 GO** — можно в Claude Code.
