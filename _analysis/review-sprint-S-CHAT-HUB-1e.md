# Ревью: S-CHAT-HUB-1e — аватары, переход в проект, чипы сущностей

**Дата:** 2026-08-02  
**Ревьюер:** Grok (верификация по коду `main` @ `3094a55` post-1d; chat-hub 1a–1d, `project-href`, MessageThread/ChatView/ChannelList)  
**Объект:** `_analysis/sprint-S-CHAT-HUB-1e.md` — косметика + контекст, **миграций нет**  
**Контекст:** 094–097 applied; хаб/группы/вложения в проде. 1f (mentions/Telegram) later. Свободный слот 098 **не** занимать.

**Шкала:** 0–100; **≥ 85 = GO**. Открытый B* → max 84.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Scope: no migrations / no DB | ✅ |
| Prerequisite paths (`projectHref`, body :563/:596, routes) | ✅ |
| `headerExtra` slot / ProjectChat untouched | ✅ |
| Task 1 ChannelAvatar (stable hash, kind specials) | ✅ |
| Task 2 project embed `type` + projectHref | ✅ |
| Task 3 parseEntityLinks pure + XSS constraints | ✅ |
| Nested Link-in-button in ChannelRow | 🟡 must restructure |
| Hex palette vs CSS-variables rule | 🟡 intentional nav exception |
| deal+project title batch (same table) | 🟡 |

**Оценка: 90/100 (GO).** Чистый UI-спринт; якоря 1b–1d точны; entity-chips design правильный (pure parse + batch titles + no `dangerouslySetInnerHTML`).  
- Порог: **≥ 85**.  
- Открытых B* нет (вложенный Link — W must-fix, не блокирует старт CC).

**Рекомендация:** запускать в CC на `feat/chat-hub-1e` от `main` @ `3094a55`.

---

## Статус (репо)

| Заход | Статус |
|-------|--------|
| HEAD | `3094a55` Merge `feat/chat-hub-1d` |
| Migrations | 097 last; **098 free** — 1e must not add |
| `projectHref` | `src/lib/utils/project-href.ts` — client/null → `/deals`, else `/projects` |
| Detail routes | deals/projects/companies/contacts `[id]` exist |
| `useConversations` | embed `project:projects(name)` only — need `type` |
| ChannelList | Hash/Users icons — replace with ChannelAvatar |
| MessageThread | body `whitespace-pre-wrap` @ **563–564** (own) and **595–597** (other); edit → textarea `m.body` |
| headerExtra | group-only in ChatView — extend for project open |
| ProjectChat | thin wrapper; **do not touch** |
| Review | не было (этот документ) |

---

## С чем согласен полностью

### 1. No migrations

1e is pure presentation + client resolve. Stop if “need column” — correct.

### 2. ChannelAvatar (Telegram-style)

djb2(id) → fixed 8 gradient pairs; no `Math.random`. Initials from title (Cyrillic OK).  
`general` → neutral + `MessagesSquare` (identity, not uniqueness).  
`group` → Users corner badge.  
`<div>` gradient, not SVG — parallel to AuthorAvatar pattern.

### 3. Open project

`project:projects(name, type)` + `projectHref`. Thread header only for `kind==='project'`.  
Row affordance with stopPropagation so open-project ≠ select channel.  
ProjectChat no button (already on card).

### 4. Entity chips XSS model

Pure `parseEntityLinks(body, origins)` — no `window` in util. Whitelist 4 entity paths only.  
Render via React children (escape preserved). href from validated uuid + type map, **not** raw user string.  
Batch titles via RQ + `.in('id')`; RLS miss → «Недоступно». Edit mode stays raw textarea.

### 5. Tests + screenshots + no migration in diff

Executable VERIFY list.

---

## Блокеры

**Нет.**

---

## Предупреждения

### W1. Nested interactive: do **not** put `<Link>` inside ChannelRow `<button>`

Сейчас `ChannelRow` — `<button type="button">` (ChannelList:106+).  
Спринт: `<Link>` стрелки с `stopPropagation` **внутри** — invalid HTML / a11y (interactive in interactive).

**Сделать так (intent sprint, valid DOM):**
- outer `div` / flex row; main hit area `button` (select channel);  
- arrow: separate `button type="button"` or `Link` **sibling**, `onClick` stopPropagation if needed;  
- or arrow `button` → `router.push(href)` without Link.

### W2. Hex palette vs project CSS rule

Claude.md: no hardcoded colors. Sidebar already uses section hex (`#14B8A6` etc.). 1e reuses those — acceptable **nav-adjacent exception**. Prefer documenting palette in `src/lib/constants/chat-avatars.ts` (named pairs). White text only on **dark** gradient ends; if light end used for text, fail contrast.

### W3. MessageThread avatar needs data

Header today: MessageCircle + title. Avatar needs `{id, title, kind}` — MessageThread has title only.  
Options: props `channelId` + `kind` (minimal) or `leading?: ReactNode` from ChatView (consistent with `headerExtra` philosophy). Prefer **leading slot** so thread stays dumb.

### W4. Task 2 headerExtra composition

ChatView currently:

```tsx
headerExtra={kind === 'group' ? <GroupHeaderActions …> : undefined}
```

For project: compose `<OpenProjectButton />` **or** group actions; both if never both kinds.  
`project_id` + `type` null → no button (edge).

### W5. Entity titles: deal ≡ project table

`deal` and `project` both live in `projects`.  
`useEntityTitles` should merge ids into **one** `.from('projects').select('id,name,type')` (type optional for display), not two round-trips. companies/contacts separate.

### W6. Origins list for paste from prod on localhost

Caller: `[window.location.origin]` alone misses chips when body has `https://dashboard-crm-ten.vercel.app/...` while developing on localhost.  
Pass `[window.location.origin, 'https://dashboard-crm-ten.vercel.app']` (or env `NEXT_PUBLIC_*` if exists). Relative `/deals/uuid` always works.

### W7. parseEntityLinks edge cases for tests

Cover: full origin, relative path, bad uuid, wrong host, external url as plain text, multiple links, trailing punctuation (`/deals/uuid.`), query/hash after uuid (prefer **not** match if not pure uuid segment).

### W8. Hover arrow vs unread dot layout

Row already has stamp + unread dot. Arrow on hover must not collide; place before stamp or only `md:` and `opacity-0 group-hover:opacity-100`.

### W9. Optional polish (out of scope unless free)

- `dm` kind avatar (same as group fallback).  
- Chip icons: DollarSign/Folder/Building2/User.  
- Do not parse URLs inside code fences (N/A — no markdown).

---

## Пропущенные места (grep)

| Файл | Факт | 1e action |
|------|------|-----------|
| `ChannelList.tsx` ChannelRow | Hash/Users icons | ChannelAvatar + open-project control (W1) |
| `MessageThread.tsx` ~380 header, 563/596 body | title; raw body | leading avatar; `renderBody` |
| `ChatView.tsx` headerExtra | group only | + project open |
| `use-conversations.ts` select | `projects(name)` | `projects(name, type)` + list item field |
| `project-href.ts` | ready | import only |
| `ProjectChat.tsx` | no change | skip |
| `tests/unit/` | no entity-links | `entity-links.test.ts` |
| `supabase/migrations/**` | | **git diff empty** |

---

## Предлагаемые правки в спринт (необяз.)

1. Explicit: arrow is sibling control, not Link-in-button.  
2. Origins: include production host for paste.  
3. useEntityTitles: single projects query for deal+project ids.

---

## Чеклист crm-architect

- [x] No migration / no apply  
- [x] Real paths and line anchors (body 563/596)  
- [x] XSS: no dangerouslySetInnerHTML; href whitelist  
- [x] ProjectChat out of scope  
- [x] CSS: rem sizes; palette exception documented  
- [x] Types: no `any`; extend ConversationRow  

---

## Чеклист перед CC

- [ ] Branch `feat/chat-hub-1e` from `3094a55`  
- [ ] ChannelAvatar + list + thread leading  
- [ ] project type embed + open project (header + row)  
- [ ] entity-links util + tests + EntityChip + renderBody ×2  
- [ ] Edit mode still plain textarea  
- [ ] tsc / lint / test / build  
- [ ] `git diff` — **zero** migration files  
- [ ] Screenshots: avatars list + chip in thread  

---

## Баллы

| | Макс | Факт |
|--|------|------|
| Scope honesty / prerequisites | 25 | 25 |
| Task designs (avatar / href / chips) | 40 | 36 |
| Integration with 1b–1d UI | 20 | 17 |
| Tests / XSS / process | 15 | 12 |
| **Итого** | **100** | **90** |

**Итог: 90/100 GO** — можно в Claude Code.
