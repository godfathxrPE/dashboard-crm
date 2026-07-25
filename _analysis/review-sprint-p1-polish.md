# Ревью: P1 — polish (checkbox minimal + мета /tasks)

**Дата:** 2026-07-19  
**Ревьюер:** Grok (live `feat/deal-card` @ `698d737`)  
**Объект:** `_analysis/sprint-p1-polish.md`  
**Контекст:** M1–M8 на ветке (M3 header meta `4e515b1`, M8 gantt import HEAD); track-токены / current-chevron **out of scope** — ок

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА checkbox + meta | ✅ 1:1 |
| Task 1 minimal checkbox → `--text` | ✅ SSOT с `.bg-accent` remap |
| Task 2 `text-[13px]` → `text-sm` | ✅ live L45 |
| Scope / no migrations | ✅ |
| Smoke path «Настройки» | 🟡 native checkbox почти только DataTable |
| Specificity vs global checkbox | ✅ `.t-minimal input…` > global |

**Оценка: 9/10 GO.** Две точечные правки, claims верны.  
**Рекомендация:** запускать в CC as-is.

---

## Live-разведка

| Claim | Live |
|-------|------|
| Global checked/indeterminate → `var(--accent)` | `globals.css` L873–883 |
| Minimal accent = terracotta `#C05A2E` | L646 |
| Minimal `--text` = `#1A1A1E` (black primary) | L643 |
| `.t-minimal .bg-accent` → `var(--text)` | L682 |
| Minimal unlayered block ends ~focus-day | L716–720 (chat-own later L1659) |
| Meta `text-[13px] text-text-mute` | `KanbanBoard.tsx` L45–46 |
| `activeCount` / `weekNum` | L227, L234–235 |
| «Перетаскивай» subtitle | **уже убран** M3 — ok |
| HEAD M3–M8 | ✅ `4e515b1`…`698d737` |

### Native checkbox inventory

| Location | Native `input[type=checkbox]`? |
|----------|--------------------------------|
| `DataTable.tsx` L232, L299 | **да** (selectable rows + indeterminate) |
| TaskCard «checkbox» | custom UI, не native |
| Settings gates | **нет** в src (smoke-claim устарел) |

---

## С чем согласен

### 1. Task 1 — checkbox = primary black

Сейчас checked fill = `--accent` (терракота) при primary buttons уже на `--text` (M1.1).  
Override:

```css
.t-minimal input[type="checkbox"]:checked,
.t-minimal input[type="checkbox"]:indeterminate {
  background-color: var(--text);
  border-color: var(--text);
}
.t-minimal input[type="checkbox"]:hover { border-color: var(--text); }
```

- Специфичность `.t-minimal input[type=…]` **выше** global `input[type=…]` → сработает и если правило **выше** L860 в файле.  
- `background-image` (белая галочка) не трогать — на `#1A1A1E` ок (~17:1).  
- Остальные темы не задеты.  
- Место: сразу после `.t-minimal .focus-day-card` (L716–720) — рядом с unlayered minimal A11Y, как просит спринт.

### 2. Task 2 — typo scale

```45:46:src/components/tasks/KanbanBoard.tsx
        <span className="text-[13px] text-text-mute">
          {activeCount} активных · неделя {weekNum}
```

`text-[13px]` → `text-sm` (14px). `text-text-mute` оставить.  
Если уже `text-sm` — skip (сейчас **нужна** замена).

### 3. Out of scope

Track tokens dark / stepper current chevron — correctly deferred.

### 4. Commit

Только `globals.css` + `KanbanBoard.tsx` — ок.

---

## Блокеры

**Нет.**

---

## Предупреждения

### W1 — smoke: где смотреть чек

Не «Настройки → гейты» (native checkbox там нет).  
**Смок:** таблица с multi-select (`DataTable` selectable) — contacts/companies/etc. — minimal → checked/indeterminate **чёрные**.

### W2 — DataTable `accent-accent` class

```tsx
className="… accent-accent cursor-pointer"
```

При global `appearance: none` fill идёт из CSS background, не `accent-color`. После P1 minimal override должен выиграть. Если визуально останется терракота — снять `accent-accent` только под minimal (маловероятно, out of default scope).

### W3 — hover unchecked

Сейчас global hover = accent border; minimal override → text border. Согласовано с black primary. Ок.

---

## Nice-to-have

- N1: comment `/* Minimal: checkbox fill = primary black (не terracotta accent) */`  
- N2: grep residual `text-[13px]` in tasks/ — only this meta if M3 left one  

---

## Чеклист перед CC

- [x] Claims verified on live tree  
- [x] No SQL  
- [ ] CSS after focus-day block  
- [ ] Meta class swap only  
- [ ] Smoke: DataTable select + /tasks meta; other themes unchanged  
- [ ] tsc 0; no push  

---

## Итог

| | |
|--|--|
| **Вердикт** | **9/10 GO** |
| **Blockers** | нет |
| **Should** | W1 smoke path = DataTable |
| **Файлы** | `globals.css`, `KanbanBoard.tsx` |
| **В CC?** | Да, as-is |
