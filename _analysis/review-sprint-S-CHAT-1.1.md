# Ревью: Sprint S-CHAT-1.1 — чат «Telegram-lite»

**Дата:** 2026-07-19  
**Ревьюер:** Grok (верификация по коду `feat/chat` @ `8d3647f`)  
**Объект:** `_analysis/sprint-S-CHAT-1.1.md` — клиентский редизайн `ProjectChat` (пузыри, время/день, глубина, a11y)  
**Контекст:** S-CHAT-1 (067 + хук + UI) живёт на **`feat/chat`**, **не** на `main`; миграций нет

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА (пути/символы) | ✅ `ProjectChat.tsx` ~282 строки, якоря сходятся |
| Scope: только UI, без hook/RLS | ✅ |
| Цветовые токены (audit-locked) | ✅ `--text` / `--accent-l` / surface+border; запрет `--accent-text` верен |
| `mskDateKey` / TZ | ✅ helper есть; 🟡 «Сегодня/Вчера» недоспецифицированы |
| Autoscroll / XSS / механика | ✅ порог 80, pre-wrap, edit/delete — сохранить |
| A11y hover→keyboard | 🟡 `focus-visible` на child при `opacity-0` parent **не сработает** |
| Анимация + reduced-motion | 🟡 критерий «входящих» + scope «1 строка» vs keyframes |
| База ветки vs «main merged» | ❌ **B1** |
| Миграции / RLS / hook | ✅ out-of-scope верно |

**Оценка: 7.5/10.**  
**Рекомендация:** **GO after B1** (ветка от `feat/chat`). W1–W5 — вписать в промпт.

---

## Статус (живой код)

| Заход | Факт |
|-------|------|
| `main` + `ProjectChat` / 067 | ❌ **нет** (`git show main:…ProjectChat` → missing) |
| `feat/chat` @ `8d3647f` | ✅ `ProjectChat` 282 строки + hook + tab + 067 |
| `feat/chat-ui` | ❌ ветки нет |
| `relativeTime` в ленте | ✅ L16 import, L183 |
| Порог автоскролла 80 | ✅ L85; scroll **мгновенный** (`scrollTop =`) |
| XSS `whitespace-pre-wrap` | ✅ L221 (`text-text-dim` → спринт сменит на `--text`) |
| Hover edit/delete | ✅ L225: `opacity-0 group-hover:opacity-100`, **без** focus-within |
| Composer | ✅ placeholder L264; **label нет** (только placeholder) |
| `mskDateKey` | ✅ `date-helpers.ts:39` |
| Aura-оверрайды | ✅ `.t-aura .bg-accent`, `--aura-pill-text` |
| `--shadow-xs` / `--radius-m` / `--ease-out` | ✅ во всех 6 темах |
| `--accent-text` в tidal / fuji | ❌ отсутствует (спринт прав) |
| `chat-own` / `chat-time` / `chat-msg-enter` | ❌ ещё нет |

---

## С чем согласен полностью

### 1. Scope
Только представление: `ProjectChat.tsx` + точечный CSS. Хук / realtime / optimistic / RLS / unread / треды — locked. `relativeTime` в `activity-events.ts` и других компонентах **не** трогать.

### 2. Цветовая матрица (audit-locked)
- Текст обоих пузырей = `var(--text)` / `text-text-main` — **не** `var(--accent-text)` (нет в tidal/fuji; washi впритык).
- Своё: `var(--accent-l)`, без бордера.
- Чужое: `var(--surface)` + `border: 1px solid var(--border)` (+ опц. `shadow-xs`) — **не** `--surface2` (на glass почти сливается с `--bg`).
- Время: `var(--chat-time, var(--text-dim))` + aura: `.t-aura .chat-own { --chat-time: var(--text); }`.
- Без новых `--bubble-*` / hex.

### 3. Инверсия глубины + Telegram-lite
Лента inset на `var(--bg)`, composer вне скролла на `var(--surface)`, max-width ~72%, своё справа / чужое слева, tail-radius, группировка ≤5 мин — здраво.

### 4. TZ
`mskDateKey` + `Europe/Moscow` — правильный якорь (не browser-local `isToday` / `toISOString`).

### 5. XSS / механика
Body = текст + `whitespace-pre-wrap`; send/edit/delete/confirm/toast/optimistic — не ломать.

### 6. crm-architect (клиент)
РАЗВЕДКА есть; SQL нет; CSS variables + scoped `.t-aura`; schema.md не нужен.

---

## Блокеры

### B1. «prod main, F1 S-CHAT-1 смёржен» — **ложь**

| | |
|--|--|
| `main` | **нет** `ProjectChat.tsx` / S-CHAT-1 |
| `feat/chat` | S-CHAT-1 (067 + UI) |
| `feat/chat-ui` | не существует |

РАЗВЕДКА `git switch -c feat/chat-ui` от **текущего** `feat/chat` ок, но от чистого `main` — **файла нет**, push без базы оторвёт 067.

**Правка в спринт:**
```bash
git switch feat/chat && git pull
git switch -c feat/chat-ui   # или работать прямо на feat/chat
```
Контекст: «база = `feat/chat` (S-CHAT-1), **не** main».

---

## Предупреждения

### W1. Scope «+ 1 строка globals» vs анимация

Задача 2: одна строка aura `--chat-time` — ок.  
Задача 3: `.chat-msg-enter` + `@keyframes` + reduced-motion = **несколько строк** (паттерн `.animate-appear` ~698–712).

**Правка:** scope → «ProjectChat + aura override + (опц.) enter keyframes»; или reuse `animate-appear` / `matchMedia` без новых классов.

### W2. A11y: `focus-visible` на кнопке внутри `opacity-0` родителя

Сейчас L225 — opacity на **контейнере**. Opacity родителя перемножается: child `opacity-100` + parent `opacity-0` = **невидимо**. То же с `focus-visible` на кнопке.

**Правка:** `group-focus-within:opacity-100` на контейнере (паттерн `tr:focus-within` в globals) + ring на кнопках.

### W3. «Сегодня / Вчера» только через MSK

```ts
const today = mskDateKey(new Date());
// yesterday = today − 1 календарный день MSK (не date-fns isYesterday / local)
```
Явно вписать в задачу 2.

### W4. Анимация «только входящие» — критерий

Иначе стробоскоп на 50 сообщениях. Пример:
- после first non-loading paint;
- animate iff `added && !mine && !isTemp && id ∉ seenIds`.

### W5. Composer «уже с label» — неточно

Только `placeholder` (L264). Enter-хинт → `title` / `aria-label`, не «сохранить label».

### W6. `aria-hidden="false"` на чипах

Шум — дефолт и так false; обычный текст в потоке.

### W7. Body `text-text-dim` → `text-text-main`

Осознанная смена контраста (L221) — не регрессия.

### W8. Autoscroll smooth

Сейчас мгновенный. Smooth **только** на new message, не на initial load; `prefers-reduced-motion` → instant.

### W9. Commit: не `git add -A`

Только `ProjectChat.tsx` + `globals.css` (в workspace грязь `_analysis/` и т.д.).

---

## Inventory

| Файл | Действие |
|------|----------|
| `src/components/projects/ProjectChat.tsx` | единственная UI-цель |
| `src/app/globals.css` | aura `--chat-time` + (opt) keyframes |
| `src/lib/utils/date-helpers.ts` | **import** `mskDateKey` only |
| `src/lib/hooks/use-project-messages.ts` | **не трогать** |
| `src/lib/utils/activity-events.ts` | **не трогать** `relativeTime` |

---

## Предлагаемые правки в спринт

1. **B1:** база `feat/chat`, не «main merged».  
2. **W2:** `group-focus-within:opacity-100`.  
3. **W3:** today/yesterday через MSK.  
4. **W1/W4:** scope globals + критерий animate.  
5. **W5:** placeholder + title, не «label есть».  
6. **W9:** точечный `git add`.

---

## Чеклист перед CC

- [ ] Ветка от `feat/chat` (B1)  
- [ ] Цвета строго из audit-блока  
- [ ] `.t-aura .chat-own { --chat-time: var(--text); }`  
- [ ] `mskDateKey` + MSK today/yesterday  
- [ ] `group-focus-within` на action-иконках  
- [ ] Animate только remote new; reduced-motion  
- [ ] Не трогать hook / RLS / relativeTime снаружи  
- [ ] `tsc` + build (не при живом dev)  
- [ ] Smoke: 6 тем, aura own-time, glass other-border, Tab→icons, VO aria-live  
- [ ] Commit: только chat-файлы  

---

## Итог

Сильный узкий UI-спринт: токены и TZ-якорь верные, scope чистый, якоря live.  
**Не GO as-is** из‑за **B1** (ложная база main). После правки ветки + W2/W3 — **GO for CC** (~8.5–9/10).
