# Ревью: M5b — компактный степпер (v1.1 + post-land)

**Дата:** 2026-07-19  
**Ревьюер:** Grok (верификация по коду `feat/deal-card` @ `95cf07d`, parent `3ebbb32`)  
**Объект:** `_analysis/sprint-m5b-stepper.md` — D2: active full-chevron / done+future chips  
**Контекст:** v1.1 закрыл B1/W1/W5/W6 из `_analysis/review-sprint-m5b-stepper.md` (22:43). Спринт новее ревью (22:47). Коммит M5b **уже в ветке**: `95cf07d refactor(project): компактный стептер — …`. M6 analytics на parent. Миграций нет.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА (claims vs pre-M5b) | ✅ на parent `3ebbb32` 1:1 |
| Scope = один файл, render-only | ✅ |
| Gate / Segment / onStageClick | ✅ Task 4 соблюдена в land |
| Task 1 `trackStateOf` (v1.1) | ✅ формула = live pre-инлайн |
| Tasks 2–3 chips + coalesce + FullTrack | ✅ в коде 1:1 со смыслом |
| SQL / RLS / schema.md | ✅ N/A |
| crm-architect checklist | ✅ (UI-only, CSS vars) |
| Псевдокод Task 2 (копипаста as-is) | 🟡 shorthand, не type-safe |
| Повторный прогон CC | ⚪ **не нужен** — уже закоммичено |

**Оценка: 9/10** (промпт v1.1 после правок — GO; работа **уже landed**).  
**Рекомендация:** **не запускать CC повторно** на `feat/deal-card`. Для smoke — UI. Если база без `95cf07d` — CC as-is ок (с осторожностью к псевдокоду Task 2, см. W1).

---

## Статус

| Заход | Статус в репо |
|-------|---------------|
| Pre-M5b (`3ebbb32`) | `tracks.map` full UI на каждый трек; `useMemo` only |
| Sprint M5b v1.1 | Промпт готов (B1 исправлен) |
| Land `95cf07d` | `trackStateOf` + `expandedKey` + `FullTrack` + `TrackChip` + coalesce |
| tsc | 0 (`npx tsc --noEmit`) |
| Diff scope | **1 файл**, +206/−75: `src/components/projects/StackedPipeline.tsx` |
| Push | ветка ahead origin на 1 (`95cf07d`) — **не пушить без подтверждения** (как в спринте) |

---

## Live-разведка

### Pre-M5b (то, что описывает РАЗВЕДКА спринта)

| Claim | Parent `3ebbb32` |
|-------|------------------|
| `tracks.map((track) => …)` full header + `flex h-9` | L125–198 |
| `trackState` / `trackHasCurrent` инлайн | L126–139 |
| `Segment` + `onClick` | L184–191, L218+ |
| Progress bar после треков | L200–209 |
| `import { useMemo }` only | L3 |
| Consumers | `ProjectDetail.tsx` L604 (IIoT), L633 (delivery) |

### Post-M5b (текущий HEAD)

| Символ | Live |
|--------|------|
| `import { useMemo, useState, type ReactNode }` | L3 |
| `trackStateOf(...)` | L71–88 |
| `expandedKey` / `setExpandedKey` | L99 |
| coalesce `nodes` / `flush` / chips | L152–195 |
| `FullTrack` + collapse `button` | L221–311 |
| `TrackChip` | L319–343 |
| `Segment` body hash pre/post | **идентичен** (`2aa1fc72…`) |
| `tracks.map` | **снят** (ожидаемо) |

### Канон trackState (pre → helper)

Pre-инлайн L132–139:

```ts
isWon || (currentOrder >= 0 && currentOrder > lastOrder) ? 'done'
  : trackHasCurrent ? 'active'
  : currentOrder >= 0 && currentOrder >= firstOrder ? 'active'
  : 'future'
```

`trackStateOf` в HEAD L78–87 — **та же семантика**; `trackHasCurrent = s.id === currentStageId` (placeholder `''` из v1 **снят**).

---

## С чем согласен полностью

### 1. Scope и граница гейтов

Только render-слой `StackedPipeline.tsx`. `Segment` / расчёт `state` сегмента / `locked` / `onStageClick` → `moveToStageId` в `ProjectDetail` не в scope. Hash `function Segment` pre/post совпал — Task 4 выполнена.

### 2. v1.1 fix B1

Сигнатура с `currentStageId` + `isWon` и возврат `{ state, trackHasCurrent }` — обязательно для pill в FullTrack. В land: FullTrack L255–261 использует `trackHasCurrent` как pre L152–158.

### 3. Вариант 2 UX

Active (или manual expand) → full chevrons; done/future → chips; соседние chips → одна `flex-wrap` строка. Прогресс-% после списка (L201–210) без изменений формулы `pct`.

### 4. TrackChip без fill категории

Точка + label + ✓; CSS vars (`--text-mute`, `--text-dim`, `border-border`, `hover:bg-surface2`) — в духе theme/CSS-vars checklist.

### 5. Collapse a11y (W5)

`button type="button" aria-expanded` + `focus-visible:outline-*` + `ChevronUp` — не `div` onClick (L266–276).

### 6. Нет SQL / RLS

Миграций нет; schema.md трогать не нужно. architecture.md: StackedPipeline multi-track на `stage_id` / `phase_group` — без конфликта.

### 7. Коммит-сообщение

Спринт = land message 1:1. F-10 в message нет (W4 старого ревью закрыт).

---

## Блокеры (критично — исправить до запуска)

**Нет.** B1 из предыдущего ревью закрыт в v1.1 и в `95cf07d`.

---

## Предупреждения (желательно)

### W1 — псевдокод Task 2 нельзя копировать байт-в-байт

В спринте:

```tsx
const st = trackStateOf(track, …);
const full = st === 'active' || …;  // st — объект, не string
// ...
state={trackStateOf(t, …)}  // TrackChip ждёт 'future'|'done', не object
```

Land сделал правильно:

```ts
const { state, trackHasCurrent } = trackStateOf(...);
const full = state === 'active' || expandedKey === track.key;
// TrackChip: trackStateOf(...).state as 'future' | 'done'
```

Если CC/человек вставит sketch as-is на чистую базу — tsc упадёт. Смысл понятен; сигнатура Task 1 выше однозначна.

### W2 — `expandedKey` при смене стадии

Не сбрасывается. Ручное раскрытие «Инициирован» + клик стадии в active → два full-трека до «свернуть». Допустимо; optional `useEffect` на `currentStageId` — out of sprint.

### W3 — lost terminal (pre-existing)

`isLost` → `currentIndex === -1` → треки `future`, не `done`. M5b не чинит. Не scope.

### W4 — РАЗВЕДКА устарела на HEAD

`grep tracks.map` на текущем `StackedPipeline.tsx` пуст. Повторный CC на HEAD без checkout parent = «уже сделано». Для ре-run: `git show 3ebbb32:src/components/projects/StackedPipeline.tsx` или revert файла.

### W5 — TrackChip focus ring

Collapse-кнопка с `focus-visible`; чип — только `hover:bg-surface2`. Keyboard OK (native button), ring слабее. Nice-to-have.

### W6 — `as 'future' | 'done'`

Инвариант: chip только если `state !== 'active'`. Cast безопасен; можно сузить тип хелпером без cast.

---

## Пропущенные места

| Файл | Строки | Действие |
|------|--------|----------|
| `ProjectDetail.tsx` | 604–623, 633+ | **Не трогать** — consumers OK, onStageClick/гейт снаружи |
| `DealProgressBar.tsx` | — | Out of scope (ERP single-track) |
| `architecture.md` StackedPipeline | ~231–235 | Опционально позже: «compact chips for non-active tracks» — не блокер спринта |

Пропущенных **must-touch** файлов нет.

---

## Сверка с crm-architect checklist

- [x] РАЗВЕДКА в начале  
- [x] Реальные поля: `phase_group`, `order_index`, `is_won`/`is_lost`, `stage_id` (через props)  
- [x] Реальный путь: `src/components/projects/StackedPipeline.tsx`  
- [x] learnings: CSS variables only; no Supabase client/RLS/DELETE  
- [x] Миграций нет → schema.md не обновлять  
- [x] Segment/gate не ломать (Task 4)  
- [x] v1.1: live-формула trackState, не placeholder  

---

## Предлагаемые правки в спринт

*Необязательно — land уже есть. Имеет смысл только если промпт пойдёт в CC на чистой базе.*

1. Task 2: явно `const { state, trackHasCurrent } = trackStateOf(...)` и `full = state === 'active' || …`.  
2. TrackChip: `state={trackStateOf(...).state}` + guard «только future|done».  
3. Шапка: «если `trackStateOf`/`TrackChip` уже в файле — skip / verify-only».  
4. Optional: сброс `expandedKey` при смене `currentStageId`.

---

## Чеклист перед CC

- [x] Один файл `StackedPipeline.tsx`  
- [x] Segment/onStageClick out of scope  
- [x] **B1** trackStateOf = live formula + `currentStageId` + `isWon` + `trackHasCurrent`  
- [x] `useState` / `ReactNode` import  
- [x] Task 4: Segment body unchanged (hash match)  
- [x] tsc 0  
- [ ] Smoke UI: delivery «Аграрная группа» + IIoT; chip expand/collapse; stage click + gate; minimal + frost  
- [ ] **Не пушить** без подтверждения  
- [x] **Повторный CC не нужен** на текущем HEAD  

---

## Итог

| | |
|--|--|
| **Вердикт промпта v1.1** | **9/10 GO** (блокеров нет) |
| **Вердикт репо** | **DONE** — `95cf07d` на `feat/deal-card` |
| **Blockers** | нет |
| **Файлы** | только `StackedPipeline.tsx` |
| **В CC?** | Нет (уже сделано). На pre-`95cf07d` — да, с W1 (деструктуризация `trackStateOf`) |
