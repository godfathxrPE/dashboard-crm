# Ревью: handoff-gantt-view1-E-tooltip (S-GANTT-VIEW-1 · Фаза E)

**Дата:** 2026-07-15  
**Ревьюер:** Grok (верификация по `GanttTimeline.tsx`, theme z-index, паттерны `AssigneeSelect`/`Combobox`)  
**Объект:** `_analysis/handoff-gantt-view1-E-tooltip.md` — фикс тултипа через `position: fixed`  
**Контекст:** VIEW-1 фазы A–D реализованы; §9.2 tooltip (название/исполнитель/lane) заложен в D, но клиппится `overflow-x-auto`

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Диагноз (overflow клиппит `absolute top-full`) | ✅ Верный |
| Решение (`fixed` + cursor-follow, один поповер) | ✅ |
| РАЗВЕДКА vs строки в `GanttTimeline.tsx` | ✅ |
| Scope (только тултип, read-only) | ✅ |
| Смок + коммит | ✅ |
| Уточнения по DOM-позиции / scroll | 🟡 Не блокер |

**Оценка: 9.5/10.** **Можно отдавать в Claude Code без правок.** Узкий hotfix, закрывает дыру §9.2.

---

## С чем согласен полностью

### 1. Диагноз подтверждён кодом

Текущая реализация (`GanttTimeline.tsx:177–230`):

- Timeline-body: `overflow-x-auto` (строка 177).
- Поповер: `absolute left-0 top-full … group-hover:block` (строки 226–230) внутри scroll-контейнера.

Scroll-container с `overflow-x: auto` создаёт clipping context — контент, выходящий за вертикальные границы ячейки/ряда, **обрезается**. Hover технически срабатывает (`group-hover:block`), но тултип не виден — ровно то, что описано в handoff.

Split-layout (C0: левая колонка вне скролла) проблему **не** снимает: поповер висит на баре внутри `overflow-x-auto`.

### 2. Решение согласовано со стеком

- **Radix в `package.json` нет** — handoff корректно отвергает Tooltip-примитив.
- **`position: fixed`** — тот же приём, что в `AssigneeSelect` / `Combobox` (комментарии: «попап … fixed поверх overflow»). Без портала на `document.body` для v1 достаточно: `fixed` считается от viewport и не клиппится предками с `overflow` (кроме `transform`/`filter` на ancestor — у корневого wrapper Ганта их нет).
- **Один общий поповер** вместо N per-bar — меньше DOM, нет повторного клиппинга, проще `z-index`.

### 3. РАЗВЕДКА совпадает с файлом

| Якорь handoff | Факт |
|---------------|------|
| `assignee` / `status` ~203–204 | Строки 203–204: `nameById`, `laneLabel` |
| `group relative` ~207 | Строка 207 |
| `group-hover:block` ~226–230 | Строки 226–230 |
| Две `<button>` (бар + milestone) | 209–216, 218–223 |

Данные тултипа уже считаются в скоупе строки — переиспользование в `onMouseEnter` без дублирования логики верно.

### 4. Контент §9.2 уже закрыт (Фаза D)

- **Исполнитель:** `useTeamMembers` + `nameById` (строки 57, 61, 203).
- **Lane-статус:** `laneLabel` с `phaseMode` → `DELIVERY_TASK_STATUS_LABELS` / `LANE_CONFIG` (строки 48–53, 204) — рекомендация из `review-handoff-gantt-view1.md` уже внедрена.

Фаза E чинит только **доставку** контента пользователю, не данные.

### 5. Хендлеры и регрессии

- Добавляются только `onMouseEnter` / `onMouseMove` / `onMouseLeave` — `onClick → onEditTask` не трогаем ✅
- `pointer-events-none` на поповере — клики проходят к бару ✅
- `z-50` — выше старого `z-20`, ниже модалок (`data-modal` z-index 1000 в `theme-system.md`) ✅

### 6. Гейт и коммит

- `npx tsc --noEmit` — достаточно для такого diff.
- Scope «только `src/`» — уместно для hotfix.
- Смок из handoff покрывает бар, ромб, scroll, mouseleave, клик → TaskModal.

---

## Мелкие уточнения (не блокеры)

### 1. Позиция fixed-поповера в DOM

Handoff: «ВНЕ `overflow-x-auto`-body». Для `position: fixed` это **не строго обязательно** — он эскейпит overflow в любом месте дерева (если нет `transform` на предке). Размещение перед закрывающим тегом корня (`:140`) — хорошая практика для читаемости, не технический must.

### 2. Скролл без движения мыши

При горизонтальном скролле колёсиком/трекпадом курсор на экране не двигается → тултип остаётся на старых `clientX/Y` до следующего `mousemove`. Для read-only v1 приемлемо; handoff честно фиксирует cursor-follow как trade-off. Долг: `onScroll` на timeline-body → `setTip(null)`.

### 3. Убрать `group` и, возможно, `relative`

После удаления `group-hover:block` класс `group` на обёртке (строка 207) не нужен. `relative` тоже станет лишним, если внутри не останется `absolute`-детей — можно упростить до чистого grid-cell без обёртки или с обёрткой без позиционирования.

### 4. Секция «Без дат»

Чипы undated по-прежнему только `title` (строки 254–263). §9.2 tooltip формально про бары на таймлайне; E это не расширяет — ок для scope «ничего больше не трогаем».

### 5. Viewport clamp

`+12` без клэмпа — у края экрана тултип может уехать за край. Handoff помечает как опциональный долг — для v1 согласен.

### 6. Touch / keyboard

Нет `onFocus` для клавиатурной навигации — бары уже с `aria-label`; для read-only v1 вне scope E (как и в D).

---

## Чеклист

- [x] Проблема реальна и воспроизводима
- [x] Fix минимальный, без новых зависимостей
- [x] Не ломает split-layout / zoom / filter / today line
- [x] Закрывает последний gap §9.2 (tooltip visible)
- [x] После E VIEW-1 можно считать завершённым по roadmap (drag → VIEW-2)

---

## Сводка для гейта Cowork

1. `npx tsc --noEmit`
2. Hover на **середине** и **низу** видимой области timeline (где старый тултип обрезался) → три строки видны полностью
3. Горизонтальный скролл + hover → тултип не обрезается
4. Milestone-ромб → тот же контент
5. `mouseleave` → исчезает; клик → TaskModal

---

## Итог

Handoff — **образцовый микро-спринт**: точный диагноз, минимальный diff, понятный смок, без scope creep. **Рекомендация: запускать в CC как есть.**