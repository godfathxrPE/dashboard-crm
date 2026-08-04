# Ревью: S-CHAT-HUB-1b — раздел «Чат» + общий канал + бейджи

**Дата:** 2026-08-02  
**Ревьюер:** Grok (верификация по коду `main` @ `49b3045`; post-1a: 094/095 applied, gen types, `use-conversations` / `MessageThread` / sidebar)  
**Объект:** `_analysis/sprint-S-CHAT-HUB-1b.md` — `/chat`, ChannelList, nav + unread badge; **миграций нет**  
**Контекст:** 1a merge + types cleanup (`49b3045`); хаб-UI на готовой модели `conversations`/`messages`/`conversation_reads`. 1c/1d (group/files) out.

**Шкала:** 0–100; **≥ 85 = GO**. Открытый B* → max 84.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Prerequisite 1a (094/095, hooks, MessageThread) | ✅ на `main` |
| Нет миграций / нет INSERT conversations | ✅ |
| Product: hide empty project channels + expand | ✅ |
| URL `?c=` без auto-select | ✅ |
| Badge = count unread *channels* (не messages) | ✅ |
| `useConversations` + project embed + titles | ✅ plan |
| Page shell как `leads/page.tsx` | ✅ |
| Nav 3-е место после «Обзор» + badgeKey | ✅ |
| Verify embed first / fallback | ✅ явный gate |
| markRead on new msg + visibility | 🟡 partially done in 1a |
| MessageThread hub chrome/height | 🟡 props incomplete |
| CommandPalette `/chat` | 🟡 не в scope, gap |
| PostgREST embed live | 🟡 verify first (RAZVEDKA) |

**Оценка: 91/100 (GO).** Чистый UI-спринт на закрытом фундаменте; решения (empty hide, URL state, channel-count badge) здравые; paths/API 1a совпадают.  
- Порог: **≥ 85**.  
- Открытых B* нет.

**Рекомендация:** запускать в CC на `feat/chat-hub-1b` от `main` @ `49b3045`. Первым шагом — живой smoke `useConversations` embed (как в РАЗВЕДКЕ).

---

## Статус (репо)

| Заход | Статус |
|-------|--------|
| HEAD | `49b3045` — stubs removed, types regen |
| 094 / 095 | applied (schema: 095 `20260802135816`) |
| `use-conversations.ts` | list + markRead + projectConversation |
| `MessageThread` | `conversationId` / `title` / `emptyText`; markRead on mount + `lastPersistedId` |
| `ProjectChat` tab | thin wrapper, **не трогать** |
| `/chat` route | **нет** |
| MAIN_NAV chat | **нет** |
| section-colors `/chat` | **нет** |
| PAGE_TITLES `/chat` | **нет** |
| Review | не было (этот документ) |

---

## С чем согласен полностью

### 1. Нет миграций

Модель 094 достаточна. INSERT на `conversations` не открывать. «Нужна колонка» → stop, не 096.

### 2. Пустые project-каналы скрыты

Сидер → N пустых каналов = шум. Always-on general + non-empty projects + «Показать все (N)» — правильный UX. Expand local state, не URL.

### 3. `?c=` без автовыбора

Shareable link; auto-select + live reorder = UX-ловушка. Empty state «Выберите канал».

### 4. Badge = число каналов с `hasUnread`

`last_read_at` vs last message — уже в `useConversations` (1a:109-111). Не считать messages. Не в `badgeUrgent` (не просрочка).

### 5. Две точки входа

Вкладка на карточке + хаб → один `MessageThread` / conversation. 1a уже развёл.

### 6. `useConversations` titles

`project:projects(name)` — FK `conversations_project_id_fkey` в gen есть.  
`GENERAL_CHANNEL_TITLE` / project name / fallback `'Проект'`. Не использовать `conversations.title` (1c).

### 7. Nav placement + registration triad

После «Обзор» (index 2): daily surface + badge.  
`section-colors` + `PAGE_TITLES` + optional aura group — полный checklist разделов.

### 8. РАЗВЕДКА: embed first

`.order/limit(…, { referencedTable: 'messages' })` написан в 1a, live не гонялся. Fallback одним query messages + client group — правильный plan B, не silent invent.

---

## Блокеры

**Нет.**

---

## Предупреждения

### W1. Task 5 partially already in 1a

`MessageThread:148-155` уже зовёт `markRead` на mount **и** на смену `lastPersistedId` (новое non-temp сообщение).  
Не хватает только **`document.visibilityState === 'visible'`** (и при желании focus), чтобы фоновая вкладка не гасила бейдж.  
CC: дописать guard в существующий effect, не дублировать markRead.

### W2. MessageThread shell для хаба

Сейчас корень всегда card-chrome + scroll `h-[min(55vh,40rem)]` (`MessageThread:289-305`). Props: только `conversationId` / `title` / `emptyText` — **нет** `className` / `heightClass`.  
На `/chat` будет «карточка в карточке» + низкая лента.  
Спринт: «прокинуть prop». Явно:  
- `className` на root (или `variant: 'card' | 'page'`);  
- `listClassName` / `heightClass` на scroll region.  
Project tab defaults сохраняются.

### W3. Время в ChannelList — уже есть helpers

`mskTime` + `mskDateKey` в `date-helpers.ts`. Не обязательно тащить MSK_TIME_FMT из MessageThread; лучше reuse `mskTime` + локальный DD.MM через `mskDateKey`. Если выносите форматтеры из MessageThread — один путь, без дубля.

### W4. Sidebar cost

`useConversations` без `staleTime` (calls/leads ≈ 60s). После глобального mount на каждой странице — добавить `staleTime` порядка 30–60s (realtime всё равно invalidate на messages).  
Realtime key `['conversations', 'list']` + debounce 150 ms — ок; не плодить второй `useRealtimeSync('messages')` в sidebar.

### W5. `CommandPalette` без `/chat`

`CommandPalette` nav list не упомянут. После появления раздела — пользователь ⌘K не найдёт «Чат». **Рекомендация:** одна строка `nav-chat` (как tasks/leads). Не блокер, если scope жёсткий — в отчёт.

### W6. Invalid `?c=`

`useMessages` на чужой/несуществующий id: RLS → пустая лента, не 404.  
Edge case спринта: «Канал недоступен» + clear param — детектить **по списку** `useConversations` (id ∉ list after load), не по empty messages (пустой general валиден).

### W7. Empty expand rule edge

«Если непустых нет вообще — сразу показываем всё» — при 0 non-empty + 17 empty: **без** кнопки показать все 17? Спринт: «сразу показываем всё без кнопки». Альтернатива (общий + кнопка 17) — в edge «все пустые» (строка 168-169). **Конфликт:**

- §Ключевые решения / раскладка п.3: непустых нет → show all without button  
- EDGE: все пустые → general + «Показать все проекты (17)»  

**Победитель для UX:** EDGE (общий сверху + expand 17) — иначе 17 project rows + general = 18 строк noise on first paint.  
Зафиксировать: **general always; empty projects always behind expand if N>0; if N=0 empty projects — no button.** «Непустых нет» ≠ «показать empty сразу».

Перечитаю задачу 3:

"Если непустых нет вообще — сразу показываем всё без кнопки (иначе на старте пользователь видит один общий канал и не понимает, где проекты)."

vs EDGE: "общий канал сверху + кнопка «Показать все проекты (17)»."

Это реальный conflict. Product intent in KEY decisions was hide empty by default always. EDGE matches "all empty real state". The "if no non-empty show all" was to avoid "only general visible, user confused where projects are" - but expand button solves that.

**Recommend:** always hide empty behind expand when N_empty > 0; never dump all empty into main list. If N_empty > 0 and N_nonempty = 0: general + button. **Override "show all without button"** as NO-GO product copy — treat as W7 fix in sprint/CC.

I'll mark W7 as product conflict — prefer EDGE (button) over auto-expand all empties.

### W8. Aura / section-colors

`/chat` → `'chat'`. Aura groups: leads/projects, tasks/calendar/meetings, analytics, contacts/companies/calls, settings. Chat → логично **contacts/companies/calls** (comms) или отдельный. Default ok; report.

### W9. Color `#14B8A6`

Соседи: overview slate, tasks `#8B7CF6`. Teal свободен; projects `#10B981` — отличим. OK as proposed.

### W10. Screenshot required

Спринт требует скриншот — enforce в gate; layout height without blind calc.

---

## Пропущенные места (grep)

| Файл | Факт | Действие |
|------|------|----------|
| `use-conversations.ts:18-126` | no project embed, no `title` on list item | Task 1 |
| `MessageThread.tsx:23-28, 148-155, 289-305` | props; markRead; card height | height prop + visibility |
| `TextNavSidebar.tsx:22-34, 105-119` | MAIN_NAV, badges, badgeKey union | Task 4 |
| `ContentHeader.tsx:13-25` | PAGE_TITLES | `/chat` |
| `section-colors.ts` | no `/chat` | add |
| `leads/page.tsx` | page pattern | copy for chat/page |
| `date-helpers.ts` `mskTime`/`mskDateKey` | MSK format | ChannelList times |
| `CommandPalette.tsx` nav | no chat | optional W5 |
| `ProjectChat` / Detail tab | keep | do not touch |
| migrations | none in 1b | verify git diff |

---

## Предлагаемые правки в спринт (необяз.)

1. Task 5: только visibility guard (логика 1a уже на new message).  
2. Task 3 empty-list rule: **всегда** empty projects behind expand if N>0 (снять «показать всё без кнопки»).  
3. MessageThread: explicit `className` + `listClassName`.  
4. Optional: CommandPalette + `staleTime` on list.

---

## Чеклист crm-architect

- [x] РАЗВЕДКА + embed verify  
- [x] No new SQL / apply  
- [x] Real hooks/components paths  
- [x] CSS variables for UI (nav hex = existing pattern)  
- [x] Project tab untouched  
- [x] RLS via existing membership (list filtered server-side)  
- [ ] schema.md — N/A (no migration)  

---

## Чеклист перед CC

- [ ] Branch `feat/chat-hub-1b` from `49b3045`  
- [ ] Live verify `referencedTable` embed → report + fallback if needed  
- [ ] Titles + GENERAL_CHANNEL_TITLE  
- [ ] `/chat` page + ChatView + ChannelList  
- [ ] section-colors / PAGE_TITLES / MAIN_NAV #3 + badge  
- [ ] markRead visibility guard  
- [ ] MessageThread height/root class for page  
- [ ] tsc / lint / test / build; **no migrations in diff**  
- [ ] Screenshot in report  
- [ ] 3 conventional commits  

---

## Баллы

| | Макс | Факт |
|--|------|------|
| Product decisions (list/URL/badge) | 25 | 23 |
| Fit on 1a foundation / paths | 25 | 24 |
| Tasks completeness / a11y | 25 | 22 |
| Process / edge accuracy / extras | 25 | 22 |
| **Итого** | **100** | **91** |

**Итог: 91/100 GO** — можно в Claude Code.
