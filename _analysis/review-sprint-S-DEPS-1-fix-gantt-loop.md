# Ревью: S-DEPS-1 FIX — Gantt infinite-loop (setEdges)

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main` @ `0463596`, crm-architect `schema.md` / `architecture.md` / `learnings.md`)  
**Объект:** `_analysis/sprint-S-DEPS-1-fix-gantt-loop.md` — runtime-фикс `Maximum update depth exceeded` в measurement-`useLayoutEffect` стрелок Ганта  
**Контекст:** S-DEPS-1 уже в репо (`048_task_dependencies.sql`, `use-task-dependencies.ts`, стрелки/link-mode в `GanttTimeline.tsx`); блокер пойман Chrome-смоком, tsc/build зелёные

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА (grep + line claims) | ✅ |
| ROOT CAUSE: `setEdges(next)` каждый раз новый массив | ✅ |
| ROOT CAUSE: нестабильные deps effect'а | ✅ (см. W1 — нюанс про `filteredSwimlanes`) |
| `data-task-bar` на позиционируемом элементе | ✅ L196 |
| Фикс #1 (дедуп `setEdges`) — рвёт цикл | ✅ |
| Фикс #2 (`depSig`, убрать `filteredSwimlanes`) | ✅ |
| Scope: только `GanttTimeline.tsx`, БД/048 не трогать | ✅ |
| Гейты tsc/build + diff-stat + smoke | ✅ |
| Миграции / RLS / schema (N/A для runtime-fix) | ✅ |
| Ветка `if (!body) setEdges([])` без дедупа | 🟡 |
| Stale arrows после drag (VIEW-2) — known limitation | 🟡 |
| crm-architect schema ещё без 048 (не scope фикса) | 🟡 backlog |

**Оценка: 9/10.** Диагноз совпадает с live-кодом, фикс минимальный и правильный по React-семантике, scope хирургический. Блокеров нет.  
**Рекомендация:** **запускать в CC** (W1–W3 — одной-двумя строками в HOW / комменте, не блокируют старт).

---

## Статус

| Заход | Статус в репо |
|-------|---------------|
| 046 gantt dates | ✅ `supabase/migrations/046_gantt_dates_on_tasks.sql` |
| VIEW-1 / VIEW-2 Gantt | ✅ `src/components/tasks/GanttTimeline.tsx` (622 строки) |
| S-DEPS-1: 048 + hooks + стрелки | ✅ `048_task_dependencies.sql`, `use-task-dependencies.ts`, commit `0463596` |
| Runtime loop fix (этот спринт) | ❌ ещё не применён — `setEdges(next)` @ L373, deps @ L380 |

---

## Разведка (факт vs спринт)

Команда спринта (`grep -n "setEdges|…"`) на live `GanttTimeline.tsx`:

| Утверждение спринта | Live | Вердикт |
|---------------------|------|---------|
| measurement-effect ~строка 347 | `useLayoutEffect` @ **L347–380** | ✅ |
| `setEdges(next)` без дедупа | **L373** `setEdges(next);` | ✅ |
| deps `[dependencies, filteredSwimlanes, zoom, filter]` | **L380** ровно так | ✅ |
| `filteredSwimlanes` через `swimlanes.map` | **L312–316** `useMemo` → `swimlanes.map((sl) => ({ ...sl, tasks: … }))` | ✅ (см. W1) |
| `dependencies` дефолт `= []` | **L282** `const { data: dependencies = [] } = useTaskDependencies(…)` | ✅ |
| `ResizeObserver` на `bodyRef` | **L377–379** `new ResizeObserver(measure); ro.observe(body)` | ✅ |
| `data-task-bar={gt.task.id}` на баре | **L194–197** на outer `div` с `gridColumn` (не на внутреннем button) | ✅ |
| querySelector по `[data-task-bar=…]` | **L356** | ✅ |
| Путь файла | `src/components/tasks/GanttTimeline.tsx` = architecture.md | ✅ |
| 048 в порядке / не трогать | файл миграции есть; спринт не трогает SQL | ✅ |
| tsc/build не ловят loop | ожидаемо (статический анализ) | ✅ |

Цепочка цикла (подтверждена):

1. Effect deps содержат `dependencies` (при `data === undefined` — **новый `[]` каждый рендер**) и `filteredSwimlanes` (новый ref при смене `swimlanes`/`filter`).  
2. `measure()` → `setEdges(next)` всегда с **новым массивом** → React re-render даже при идентичных `id`/`d`.  
3. Re-render → (нестабильные deps и/или `ResizeObserver` после монтирования SVG @ L548+) → effect/measure снова → **Maximum update depth exceeded**.

---

## С чем согласен полностью

### 1. Хирургический scope

Один файл, один effect, без миграций, без хуков, без RLS. «БД (миграция 048) в порядке, не трогать» — верно: loop в клиентском measure, не в схеме. Соответствует process-контракту learnings (CC не apply'ит миграции — здесь миграций нет вовсе).

### 2. Фикс #1 — обязательный

Функциональный `setEdges((prev) => … return prev)` при совпадении `id`+`d` — канонический способ заставить React bail-out'нуть. Без него даже «лишний» прогон effect/RO снова пушит state и крутит цикл. Спринт верно помечает #1 как critical.

### 3. Фикс #2 — правильная стабилизация deps

`depSig` из `id:pred>succ` — строка-примитив, меняется только при реальной смене набора рёбер. Убрать `filteredSwimlanes` из deps обосновано: measure читает DOM через `querySelector`, объект swimlanes в deps не нужен. `zoom`/`filter` — примитивы, остаются.

### 4. `data-task-bar` уже на правильном узле

Атрибут на outer wrapper с `gridColumn` (L194–197) — `getBoundingClientRect` даёт реальную геометрию бара, не пустой hit-target. querySelector найдёт элемент; спринт верно просит это подтвердить в разведке, а не «чинить» атрибут.

### 5. Known limitation v1 — честно задокументирована

Перемер только по `depSig` / zoom / filter / ResizeObserver; чистый reflow строк без смены ширины — на следующий триггер. Для crash-fix это приемлемо; комментарий в коде — хорошая страховка от «почему стрелки не прыгнули».

### 6. Гейты и коммит

`tsc` + `build` + `git diff --stat` only `GanttTimeline.tsx` + smoke таба «Гант» — достаточный контракт. Commit message scoped (`fix(gantt): S-DEPS-1 — …`).

---

## Блокеры (критично — исправить до запуска)

**Нет.** Спринт можно отдавать в Claude Code as-is.

---

## Предупреждения (желательно исправить)

### W1. Формулировка «`filteredSwimlanes` — новый reference на каждый рендер» слегка завышена

Live: `filteredSwimlanes` обёрнут в `useMemo([swimlanes, filter])` (L312–316). Пока `swimlanes` из `useProjectSchedule` стабилен (там тоже `useMemo`), reference **не** новый каждый рендер.

Главный стабильно-плохой ref в deps — **`dependencies = []`**: при `data === undefined` (loading / `enabled: false`) каждый рендер даёт новый `[]` → effect перезапускается всегда. После success RQ отдаёт стабильный массив из кэша.

**Импакт на фикс:** нулевой — убрать `filteredSwimlanes` и заменить `dependencies` на `depSig` всё равно правильно. В ROOT CAUSE можно уточнить: «нестабилен `dependencies` при `data == null` (+ RO-путь с `setEdges(next)`)».

### W2. Ветка `if (!body) { setEdges([]); return; }` (L349) без дедупа

При loading/error early-return body не монтируется (`bodyRef` = null), но hooks уже выполнены. Голый `setEdges([])` тоже создаёт **новый** `[]` → при нестабильных deps теоретически тот же класс бага.

**Предложение (1 строка в HOW):** ту же functional-форму применить и здесь:

```ts
if (!body) {
  setEdges((prev) => (prev.length === 0 ? prev : []));
  return;
}
```

### W3. После VIEW-2 drag стрелки могут «отстать» до toggle zoom/filter

С `filteredSwimlanes` вне deps и без date-сигнатуры баров: drag move/resize меняет `gridColumn` баров, ширина `body` часто та же → RO молчит → `d` старый. Спринт это признаёт как v1 OK.

Для smoke Cowork: после фикса loop **осознанно** проверить, что create/delete dep (меняется `depSig`) перемеривает; drag — optional note, не регрессия crash-fix'а. Если в том же заходе хочется дешевле закрыть stale-drag: добавить в deps примитив вроде  
`taskLayoutSig = dated tasks map id:start:end` — **не обязательно**, out of scope v1.

### W4. crm-architect `schema.md` / `architecture.md` ещё без 048

В skill-reference нет `task_dependencies` (grep пустой); в `architecture.md` Gantt описан без deps. Это backlog после S-DEPS-1, **не** scope данного fix-спринта. Не смешивать.

---

## Пропущенные места

| Файл | Строки | Действие |
|------|--------|----------|
| `GanttTimeline.tsx` | 347–380 | **Единственная** точка фикса (measure effect) |
| `GanttTimeline.tsx` | 349 | Желательно functional `setEdges` при `!body` (W2) |
| `GanttTimeline.tsx` | 196 | `data-task-bar` — **не трогать**, уже верно |
| `use-task-dependencies.ts` | — | Не трогать |
| `048_*.sql` / schema | — | Не трогать |

Ложных целей (другие `useLayoutEffect` / setState-лупы в Gantt) grep не нашёл: второй `useLayoutEffect` — только Esc/link-mode (L292–297).

---

## Предлагаемые правки в спринт

1. **W2:** явно включить functional-update и для `setEdges([])` при `!body`.  
2. **W1 (косметика ROOT CAUSE):** акцент на `dependencies = []` + `setEdges(next)` + RO, а не «`filteredSwimlanes` каждый рендер».  
3. Опционально в комментарии v1: упомянуть drag-bar (VIEW-2) рядом с «добавили задачу» — один класс stale measure.

Ни одна правка не блокирует CC.

---

## Чеклист crm-architect (condensed)

- [x] Есть РАЗВЕДКА (grep до правок)
- [x] Таблицы/колонки — N/A (SQL нет); 048 не трогаем
- [x] Реальный путь: `src/components/tasks/GanttTimeline.tsx` (architecture.md)
- [x] learnings: нет conflict (нет client Supabase overrides, нет migration apply из CC)
- [x] Миграции: не создаются / не apply'ятся
- [x] org_id / RLS: N/A
- [x] SECURITY DEFINER: N/A
- [x] CSS variables / themes: не трогаем (`var(--text-mute)` остаётся)
- [x] schema.md update: N/A для этого спринта

---

## Чеклист перед CC

- [ ] Прочитать L347–380 `GanttTimeline.tsx` (не полагаться только на «~347»)
- [ ] Внести #1: functional `setEdges` с сравнением `id`+`d`
- [ ] Внести #2: `depSig` + deps effect = `[depSig, zoom, filter]`
- [ ] (Желательно) functional `setEdges` в ветке `!body` (W2)
- [ ] Коммент v1 про limitation remeasure
- [ ] `npx tsc --noEmit` → 0; `npm run build` → 0
- [ ] `git diff --stat` → только `GanttTimeline.tsx`
- [ ] Локальный smoke: таб «Гант» на проекте с датированными задачами — нет update depth, консоль чистая
- [ ] Коммит с message из спринта
- [ ] Cowork: повторный Chrome-смок (стрелки, zoom, filter W4-skip, link-mode, drag disabled in link-mode)

---

## Итог

Спринт **готовый handoff**: root cause верифицирован по live-коду (`setEdges(next)` @ L373 + deps @ L380 + `dependencies = []` @ L282 + RO), фикс минимальный и достаточный, scope не расползается на 048/хуки. Запускать в Claude Code; W2 желателен в том же диффе одной строкой.
