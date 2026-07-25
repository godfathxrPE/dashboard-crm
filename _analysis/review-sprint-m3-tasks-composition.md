# Ревью: M3 — /tasks композиция (D2, референс экран 02)

**Дата:** 2026-07-19  
**Ревьюер:** Grok (live `feat/deal-card` @ `6cb80a9`)  
**Объект:** `_analysis/sprint-m3-tasks-composition.md`  
**Контекст:** post-M2 discipline; шапка / карточка списка / один тег / rail; client-only

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА (header, w-80, company tag, weekNum) | ✅ 1:1 |
| РАЗВЕДКА aura-page-title «только .t-aura» | 🟡 **неверно** — base global |
| Файлы / scope | ✅ |
| weekNumber extract | ✅ формула есть, дубль убрать |
| activeCount | ✅ из `lanes` / tasks |
| Task 3 company-if-no-project | ✅ |
| SQL / RLS | ✅ N/A |
| Готовность к CC | ✅ |

**Оценка: 9/10.** Узкий, сверяемый, без блокеров.  
**Рекомендация:** запускать в CC as-is; учесть W1–W3 (не стоп).

---

## Live-разведка

| Claim | Live |
|-------|------|
| «Перетаскивай…» | `KanbanBoard.tsx` L34 |
| `aura-page-title` h1 | L33 |
| Layout: header + flex list + rail | L216–254 |
| AccordionLane stack | L228–241 `flex flex-col gap-2` |
| TasksSidebar `w-80` | L259 `hidden lg:flex w-80` |
| company + project tags | TaskCard L168–187, оба без mutual exclude |
| weekNum formula | TasksSidebar L38–39 |
| `weekNumber` in date-helpers | **нет** (есть Gantt week bucket ≠ calendar week) |
| `.aura-page-title` | L1039–1043 **global** size/weight; Unbounded only `.t-aura` L1046–1051 |
| global `h1` | L844 `1.5rem / 700` (не используется на /tasks — там class aura-page-title) |

---

## С чем согласен

### 1. Задача 1 — шапка

Удалить обучающий подзаголовок — верно.  
Мета `{active} активных · неделя {weekNum}` — референс.  
Источник active: `lane !== 'done'` по данным `useTasksByLane` уже в `KanbanBoard` — передать в header:

```tsx
const activeCount = taskLanes
  .filter((l) => l !== 'done')
  .reduce((n, l) => n + lanes[l].length, 0);
// или flat filter
```

`weekNumber(date)` → `date-helpers.ts`, ClockWidget импортирует — без дубля.  
Baseline: `flex items-baseline gap-2` (h1 + meta), CTA справа как сейчас.

### 2. Задача 2 — карточка списка

Обернуть **только** стек секций (L228–241), не `TasksSidebar`, не обязательно весь `DndContext` (overlay может остаться sibling).  
Классы surface + border + shadow-xs — ок; на dark `surface` полупрозрачный — смок washi/frost.

### 3. Задача 3 — один тег

Сейчас оба тега (L168 + L178).  
`company only if !project_id` — правильное правило (компания ⊆ проект в CRM).  
phaseMode без project/company tags (M2) — не трогать.

### 4. Задача 5 — rail `w-80` → `w-72`

L259 — одна правка. Список flex-1 выиграет ~32px.

### 5. Commit list

Все 5 файлов реальны; migrations нет.

---

## Блокеры

Нет.

---

## Предупреждения

### W1. Задача 4: claim разведки неточен; эффект мал

Спринт: «если `.aura-page-title` только в `.t-aura`…».  
Live:

```1039:1051:src/app/globals.css
.aura-page-title {
  font-size: clamp(1.25rem, 1.1rem + 0.6vw, 1.5rem);
  font-weight: 600;
  ...
}
.t-aura .aura-page-title { font-family: Unbounded; font-weight: 400; ... }
```

На /tasks уже ~20–24px / 600 во **всех** темах.  
`.t-minimal .aura-page-title { font-size: 1.25rem; font-weight: 600 }` — **пинит** 20px (убирает clamp-верх 24px) — всё ещё полезно, но не «чинит гигантский h1».  
Aura Unbounded не задевается (specificity + font-family).  
`.t-minimal h1` — для других страниц с raw h1; ок, scope minimal.

### W2. `text-[13px]` vs typo-scale

После S-TYPO-SCALE арбитражки 13px изгонялись → `text-sm` (14).  
Для меты: **`text-sm text-text-mute`** или `text-xs` (12) — ближе к дисциплине шкалы, чем `text-[13px]`.

### W3. weekNumber ≠ ISO

Формула ClockWidget — «US-style» week-of-year, не ISO.  
Extract as-is — правильно для консистентности header ↔ clock.  
Не путать с Gantt `bucketKeyOf(..., 'week')` (понедельник ISO) — **не** переиспользовать Gantt.

### W4. Header props / loading

Пока `isLoading` — header не рендерится (early return L195). После load meta ок.  
Альтернатива: header всегда + skeleton count — out of scope.

### W5. Копирайт «неделя W» vs «нед. W»

Clock: `· нед. {weekNum}`.  
Спринт: `· неделя {weekNum}`. Оба ок; для единообразия можно `нед.` как в rail.

### W6. Nested surface

AccordionLane/TaskCard уже `bg-surface` — карточка-обёртка + inner surfaces = double card.  
Референс «список на surface» — смок: не раздуть padding; `px-2 py-1` умеренный.

---

## Пропущенные места

| | |
|--|--|
| `ActivityDrawer` week formula L92 | другая формула — **не** в scope |
| phaseMode TaskCard | не трогать |
| Drag hint empty states AccordionLane | out of scope |

---

## Предлагаемые правки в спринт (опционально)

1. W1: «`.aura-page-title` global size; minimal pins 1.25rem; Unbounded only aura».  
2. W2: meta `text-sm` вместо `text-[13px]`.  
3. Явно: `weekNumber` = copy из ClockWidget L38–39, не Gantt helpers.

---

## Чеклист перед CC

- [x] Live anchors confirmed  
- [ ] `weekNumber` in date-helpers + ClockWidget refactor  
- [ ] TasksPageHeader: no subtitle; meta + activeCount  
- [ ] Wrap lanes in surface card  
- [ ] company tag `&& !task.project_id`  
- [ ] minimal H1/title CSS  
- [ ] `w-80` → `w-72`  
- [ ] tsc; smoke minimal + aura + washi/frost  
- [ ] no push without confirm  

---

## crm-architect

- [x] РАЗВЕДКА  
- [x] Реальные пути  
- [x] date-helpers reuse pattern  
- [x] CSS scoped `.t-minimal` only for task 4  
- [x] No SQL  
- [x] schema N/A  

**Итог:** GO в Claude Code.
