# Ревью: M4 — Чат проекта, глубина и детализация (D2)

**Дата:** 2026-07-19  
**Ревьюер:** Grok (верификация по коду `feat/deal-card` @ `4e515b1`)  
**Объект:** `_analysis/sprint-m4-chat-depth.md` — токены пузырей 7 тем, слои канваса, disabled send, empty-state  
**Контекст:** post-M1/M1.1/M2/M3; S-CHAT-1 → 1.1 → 1.2 → 2; v1.1 спринта (отклонён глобальный `text-white`, принят `--chat-own-fg`); предыдущий review-файл устарел относительно v1.1

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА (команды / якоря) | ✅ есть; 🟡 line-drift globals |
| Диагноз (minimal / fuji / слои) | ✅ live 1:1 |
| Задача 1a токен `--chat-own-fg` | ✅ правильная схема; ❌ JSX-сниппет не live |
| Задача 1a реакции + scope CSS vars | 🟡 / ❌ инструкция «только text-[var]» без класса/hoist ломает DoD |
| Задача 1b–1d (fuji/washi/dark solid) | ✅ |
| Задача 2 (канвас / дата-чип) | ✅ |
| Задача 3 (автор) | ✅ скип верен |
| Задача 4 (send disabled) | ✅ |
| Задача 5 (empty-state) | ❌ `MessageSquare` **не** импортирован |
| SQL / RLS / миграции | ✅ N/A |
| Scope / commit files | ✅ 2 файла |
| crm-architect checklist | ✅ (CSS vars, theme-scoped; solid dark ≈ learnings) |

**Оценка: 7/10.** Диагноз и v1.1-токен-схема сильные; as-is CC рискует сломать разметку пузыря и упасть на tsc (иконка).  
**Рекомендация:** запускать в CC **только после** правок B1–B3 в спринт (или с жёстким addendum в промпт).

---

## Live-разведка (подтверждено)

| Claim спринта | Live | Вердикт |
|---------------|------|---------|
| `.t-minimal .chat-own` отсутствует | `globals.css` L1653–1658: 6 тем (aura…tidal), **minimal нет** | ✅ |
| Fuji = washi-red | L1655 `rgba(194,59,59,0.20)` + comment «fuji остаётся тёпло-красным (identity)» | ✅ |
| Fuji accent indigo | `.t-fuji` L394 `--accent: #2B5078` | ✅ (1b корректен) |
| Washi 0.22 | L1654 `0.22` / `0.34` | ✅ |
| Dark semi-transparent | frost/aurora/tidal L1656–1658 | ✅ |
| Канвас `bg-bg` без border | `ProjectChat.tsx` L277 | ✅ |
| Дата-чип `bg-surface2` | L422 | ✅ |
| Автор у чужих | L460–462 `groupStart` + `full_name` | ✅ **скип Task 3** |
| `text-text-main` на теле своего | L438 `<p className="… text-sm text-text-main">` | ✅ (конфликт с solid black) |
| Mine reactions `text-text-main` | L372 | ✅ |
| Send `disabled:opacity-50` | L531–532 | ✅ |
| Emoji/textarea 42px | L502, L525 | ✅ no-op |
| Empty text-only | L283–286 | ✅ |
| `MessageSquare` already L4 | L4: **`MessageCircle`**, не MessageSquare | ❌ |
| globals «~L1570» | фактический блок **L1642–1658** | 🟡 drift |
| `cn(...)` в предложенном JSX | `cn` **не** импортирован; файл на template strings | ❌ |
| chat-color-preview.html | в репо **нет** | 🟡 цифры контраста не верифицированы |

Структура своего пузыря (live), не совпадает со сниппетом спринта:

```434:440:src/components/projects/ProjectChat.tsx
                        <div
                          className={`chat-own flex max-w-[72%] flex-col rounded-[var(--radius-m)] bg-[var(--chat-own-bg)] border border-[color:var(--chat-own-border)] px-3 py-1.5 ${
                            groupEnd ? 'rounded-br-[4px]' : ''
                          } ${temp ? 'opacity-60' : ''} ${animate ? 'animate-appear' : ''}`}
                        >
                          <p className="whitespace-pre-wrap break-words text-sm text-text-main">
                            {m.body}
```

Реакции — **siblings** пузыря (не потомки `.chat-own`), L474 `{reactionChips}` снаружи ветки mine/other.

---

## С чем согласен полностью

### 1. Диагноз minimal / fuji / слои

Без `.t-minimal .chat-own` → `--chat-own-bg` undefined → прозрачный контур. Fuji на torii-red при theme accent indigo — чужая краска (коммент L1652 прямо запрещает indigo; M4 осознанно ломает этот lock). Канвас `bg-bg` + чип `bg-surface2` на том же «уровне» — читаемость даты слабая.

### 2. v1.1: `--chat-own-fg`, не глобальный `text-white`

Предыдущий совет «`text-white` в JSX» действительно убил бы washi/aura/fuji (тёмный `--text` на светлом тинте).  
```css
.chat-own { color: var(--chat-own-fg, var(--text)); }
.t-minimal .chat-own { --chat-own-fg: #fff; … }
```
— правильная theme-scoped схема; fallback `--text` для светлых тинтов.

### 3. 1b–1d значения

- Fuji `rgba(43,80,120,…)` = `#2B5078` theme accent.  
- Washi 0.22→0.16 — косметика.  
- Dark solid hex вместо rgba — в духе learnings (opaque fills на glass/dark, без «просветов»).

### 4. Task 2 / 4

`border border-border/50` на канвасе; чип `bg-surface border border-border/60`; send `disabled:bg-surface3 disabled:text-text-mute` (`surface3`/`text-mute` есть в `tailwind.config.ts`) — ок. Opacity-only disabled — справедливо.

### 5. Task 3

Имя автора уже live — скип корректен.

### 6. Scope

Только `globals.css` + `ProjectChat.tsx`, без миграций/RLS/push — ок.

---

## Блокеры (критично — исправить до запуска)

### B1. JSX-сниппет 1a не соответствует live-разметке

Спринт предлагает:

```tsx
className={cn('rounded-2xl px-3 py-2 text-sm', isMine ? 'chat-own' : 'bg-surface2 text-text-main')}
```

Live: отдельные ветки mine/other; outer `div.chat-own` уже несёт `bg-[var(--chat-own-bg)]` + border + `rounded-[var(--radius-m)]` + group corners; **`text-text-main` сидит на inner `<p>` (L438)**; **`cn` не подключён**.

Буквальное применение → потеря токенов заливки/рамки, radius, temp/animate, groupEnd corners + ReferenceError/`cn is not defined`.

**Заменить инструкцию на точечную:**

```tsx
// L438 — СВОЁ тело: убрать text-text-main, наследовать color с .chat-own
<p className="whitespace-pre-wrap break-words text-sm">
  {m.body}
</p>

// L465 — ЧУЖОЕ: text-text-main оставить
<p className="whitespace-pre-wrap break-words text-sm text-text-main">
```

Outer `div.chat-own` (L433–436) **не** переписывать.

### B2. Реакции: `var(--chat-own-fg)` вне `.chat-own` не резолвится

Mine-чипы (L372) **не** имеют класса `chat-own` и стоят **снаружи** пузыря.  
`--chat-own-*` задаются селектором `.t-X .chat-own` → на чипе `var(--chat-own-fg, var(--text))` → **fallback `--text`** = тёмный на (потенциально) чёрном; то же исторически ломает `--chat-own-bg` на чипах (pre-existing S-CHAT-2 gap).

Ветка спринта «добавить только `text-[color:var(--chat-own-fg,var(--text))]`» **недостаточна** для DoD «тело И реакции белые на minimal».

**Один из путей (предпочтительно A):**

**A.** На mine-чипе добавить класс `chat-own` + убрать `text-text-main`:

```tsx
r.mine
  ? 'chat-own border-[color:var(--chat-own-border)] bg-[var(--chat-own-bg)]'
  : 'border-border bg-surface2 text-text-dim hover:text-text-main'
```

(тогда `.chat-own { color: … }` + theme vars на самом чипе).

**B.** Поднять токены на корень темы:

```css
.t-minimal {
  --chat-own-bg: var(--text);
  --chat-own-border: var(--text);
  --chat-own-fg: #fff;
  --chat-time: rgba(255,255,255,0.75);
}
```

и на чипе явно `text-[color:var(--chat-own-fg,var(--text))]`.

### B3. Task 5: `MessageSquare` не импортирован

Claim «MessageSquare уже импортирован (L4)» — **ложный**. Live L4:

`MessageCircle, Pencil, Trash2, SendHorizontal, Smile, SmilePlus`

Header L263 уже использует `MessageCircle`.

**Фикс:** empty-state на `MessageCircle` (консистентно, import не трогать) **или** добавить `MessageSquare` в import. Иначе tsc fail.

---

## Предупреждения (желательно исправить)

### W1. Line-drift globals «~L1570»

Блок чата: **L1642–1658**. РАЗВЕДКА через `grep` спасает; в тексте задачи лучше «секция `/* ═══ Чат проекта`».

### W2. File-comment L102 «цвета текста… не менять»

Аудит-lock на `text-text-main` в пузырях. После 1a — обновить комментарий: «чужие — text-text-main; свои — `var(--chat-own-fg, var(--text))` / inherit».

### W3. Commit message «…, автор, …»

Task 3 = no-op. Лучше:  
`feat(chat): глубина — токены пузырей 7 тем (minimal/fuji), слои канваса, empty-state, disabled send`.

### W4. Контраст-цифры preview

`chat-color-preview.html` в репо нет; AA-цифры (17.4 / 9.0 / …) не воспроизведены. DoD: ручной смок 7 тем + при возможности `scripts/audit-contrast.py` / локальный preview.

### W5. Disabled send + `hover:opacity-90`

Оставить `disabled:bg-surface3 disabled:text-text-mute`; при желании убрать `transition-opacity hover:opacity-90` с disabled-path (не блокер). Активный `bg-accent` + minimal M1.1 black primary — ок.

### W6. Empty copy

Новый текст спокойный, ок. Иконка: `aria-hidden="true"` — верно (декор).

---

## Пропущенные места

| Файл | Строки | Действие |
|------|--------|----------|
| `ProjectChat.tsx` | 438 | Убрать `text-text-main` **только** у своего `<p>` |
| `ProjectChat.tsx` | 372–374 | Mine reaction: `chat-own` и/или hoist tokens (B2) |
| `ProjectChat.tsx` | 283–286 | Empty: icon + copy; **MessageCircle** или import MessageSquare |
| `ProjectChat.tsx` | 277, 422, 531–532 | Канвас border; чип surface+border; disabled send |
| `ProjectChat.tsx` | 4, 102–102 | Import / file-comment |
| `globals.css` | 1642–1658 | +minimal; fuji indigo; washi soften; dark solids; `.chat-own { color: … }`; comment fuji |

Вне scope (не трогать): `use-project-messages`, `use-message-reactions`, activity_log / EntityTimeline, другие theme-токены non-chat, deal card.

---

## Предлагаемые правки в спринт

1. **B1** — заменить JSX-сниппет на правку **только** L438 `<p>` (+ L372 chips по B2); запретить rewrite outer bubble / `cn`.  
2. **B2** — явно: mine reaction **с классом `chat-own`** (путь A) *или* hoist `--chat-own-*` на `.t-minimal` (путь B); убрать sole-reliance на out-of-scope `var(--chat-own-fg)`.  
3. **B3** — empty-state: `MessageCircle` size 20 + `aria-hidden` **или** добавить import `MessageSquare`.  
4. Якорь CSS: «секция Чат проекта ~L1646», не L1570.  
5. Commit message без «автор».  
6. DoD minimal: (1) body white, (2) mine reaction white **и** solid/tint bg виден, (3) time 75% white, (4) washi/fuji text remains dark.

---

## Чеклист crm-architect (condensed)

- [x] РАЗВЕДКА в начале  
- [x] Реальные пути (`globals.css`, `ProjectChat.tsx`)  
- [x] learnings: CSS variables / theme class; solid dark fills  
- [x] Миграций нет; SQL не apply from CC  
- [x] org_id / RLS / SECURITY DEFINER — N/A  
- [x] Нет `flowType: 'implicit'`  
- [x] CSS scoped to `.t-*` + utility tokens  
- [ ] **B1–B3 закрыть до CC**

---

## Чеклист перед CC

- [ ] B1: инструкция = L438 `<p>` without `text-text-main`; outer `chat-own` не ломать  
- [ ] B2: mine reactions получают `--chat-own-fg` / bg (class `chat-own` или hoist)  
- [ ] B3: empty icon = `MessageCircle` **или** import `MessageSquare`  
- [ ] 1a–1d CSS в блок L1642+; comment fuji «red identity» → indigo  
- [ ] Task 2/4/5 точечно; Task 3 skip в отчёте  
- [ ] Смок: 7 тем × (own body, own reaction, other+name, day chip, empty, disabled send)  
- [ ] minimal: белый текст на чёрном (body **и** reactions)  
- [ ] washi/aura/fuji: тёмный текст своих (нет глобального white)  
- [ ] `tsc` 0; commit 2 файла; **не** push  

---

## Итог

| | |
|--|--|
| **Вердикт** | **7/10 — GO after B1–B3** |
| **Сильное** | диагноз live-верный; `--chat-own-fg` лучше `text-white`; fuji indigo; dark solids; Task 3 skip |
| **Блокеры** | B1 wrong JSX / no `cn`; B2 reaction token scope; B3 MessageSquare claim |
| **Файлы** | `src/app/globals.css`, `src/components/projects/ProjectChat.tsx` |
| **В CC?** | Да, после правки промпта (или addendum с B1–B3) |

**Следующий шаг:** вписать B1–B3 в спринт → CC → visual QA minimal + fuji → commit → не push.
