# Claude Code Prompt — S-DEPS-1 FIX: Gantt «Maximum update depth exceeded»

> **Блокер найден Chrome-смоком (Cowork).** Таб «Гант» на любом проекте с датированными задачами падает в рантайме: `Maximum update depth exceeded` в `src/components/tasks/GanttTimeline.tsx` (measurement-`useLayoutEffect` со `setEdges`). tsc/build проходят — это рантайм-луп, статикой не ловится. БД (миграция 048) в порядке, не трогать.

## ROOT CAUSE
Effect измерения стрелок (сейчас ~строка 347) зацикливается по двум причинам вместе:
1. `setEdges(next)` отдаёт **новый массив** на каждом прогоне → re-render даже когда пути идентичны.
2. Deps-массив `[dependencies, filteredSwimlanes, zoom, filter]`: `filteredSwimlanes` — новый reference **на каждый рендер** (`useMemo(... swimlanes.map ...)`), а `dependencies` при пустых данных дефолтится в новый `[]`. → effect гоняется на КАЖДОМ рендере.

Вместе: `render → effect (deps ≠) → setEdges(новый) → render → effect (deps ≠) → …` без остановки. ResizeObserver добавляет второй путь того же цикла.

## РАЗВЕДКА
```bash
grep -n "setEdges\|filteredSwimlanes\|ResizeObserver\|useLayoutEffect\|data-task-bar" src/components/tasks/GanttTimeline.tsx
```
Подтверди: measurement-effect с `setEdges(next)` и deps `[dependencies, filteredSwimlanes, zoom, filter]`; что `GanttBar` реально рендерит атрибут `data-task-bar={gt.task.id}` на позиционируемом элементе бара (иначе `querySelector` не найдёт → стрелок не будет).

## ФИКС (2 правки в measurement-`useLayoutEffect`)

### 1. Дедуп setEdges — рвёт цикл setState→render
Заменить `setEdges(next);` внутри `measure()` на функциональное обновление, возвращающее **prev** при идентичных путях (React бейлит, re-render не происходит):
```ts
setEdges((prev) => {
  if (
    prev.length === next.length &&
    prev.every((e, i) => e.id === next[i].id && e.d === next[i].d)
  ) return prev;                 // без изменений — тот же reference, без re-render
  return next;
});
```

### 2. Стабилизировать deps — effect не должен гоняться каждый рендер
Вынести стабильную сигнатуру рёбер и убрать нестабильный `filteredSwimlanes` из deps (measure и так читает живой DOM через `querySelector`, ему не нужен объект swimlanes в зависимостях):
```ts
// рядом с dependencies:
const depSig = useMemo(
  () => dependencies.map((d) => `${d.id}:${d.predecessor_id}>${d.successor_id}`).join('|'),
  [dependencies],
);
```
Deps measurement-effect'а: `[dependencies, filteredSwimlanes, zoom, filter]` → **`[depSig, zoom, filter]`**.
`zoom`/`filter` — примитивы (меняют ширину бакетов → ResizeObserver на bodyRef и так перемеряет). `depSig` — строка, стабильна между рендерами при тех же рёбрах.

> **Почему хватит #1+#2:** #1 гарантирует, что идентичный результат measure НЕ вызывает re-render (даже если effect прогонится лишний раз). #2 убирает прогон effect'а на каждом рендере. Оба вместе — цикл невозможен. #1 — критичная (без неё луп остаётся), #2 — устраняет лишние перемеры.

### Известное ограничение v1 (не чинить сейчас, отметить комментом)
Если список задач меняется БЕЗ смены ширины body/zoom/filter (напр. добавили датированную задачу в тот же диапазон), стрелки могут не перемериться до следующего toggle зума/фильтра. ResizeObserver ловит изменения размера; чистой перестановки в пределах той же ширины он не видит. Для v1 приемлемо (deps по `depSig` перемеряют при смене набора рёбер). Комментом: `// v1: перемер при смене рёбер/зума/фильтра/размера; чистый reflow строк — по следующему триггеру`.

## ГЕЙТЫ CC
```bash
npx tsc --noEmit      # 0
npm run build         # exit 0
git diff --stat       # только GanttTimeline.tsx
```
Затем локально открой таб «Гант» на проекте «Аграрная группа — внедрение» — страница не должна падать, консоль чистая (React не должен ругаться на update depth).

## КОММИТ
```bash
git add src/components/tasks/GanttTimeline.tsx
git commit -m "fix(gantt): S-DEPS-1 — устранить infinite-loop измерения стрелок (dedupe setEdges + стабильные deps)"
```

## ПОСЛЕ ТЕБЯ — Cowork
Повторный Chrome-смок: стрелки рисуются pred.end→succ.start, держатся при зуме day/week/month + multi-lane, W4-skip скрытых фильтром концов, link-mode create/delete, drag баров отключён в link-mode, консоль чистая.

## VERIFICATION
```
Type Safety:            NOT_VERIFIED (правка типобезопасна; подтвердить tsc)
Runtime (loop fixed):   NOT_VERIFIED (подтвердить локальным открытием таба «Гант»)
Backward Compatibility: PASS (только measurement-effect; рендер/данные не тронуты)
```
