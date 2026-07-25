# Claude Code Prompt — S-CRIT-PATH: критический путь на Гантте (longest path в DAG)

> **/code D2. Схема НЕ меняется.** Всё есть: рёбра `task_dependencies` (FS) + `start_date`/`end_date` задач. Критический путь = **самая длинная по длительности цепочка зависимых задач** в DAG. Считается **чисто клиентски** в `GanttTimeline.tsx` (useMemo), рисуется поверх существующих баров+стрелок. Read-only, ничего не пишет. Стек незыблем.

## WHY
После S-DEPS-1 Гант рисует зависимости, но не отвечает на PM-вопрос «какая цепочка задаёт длительность проекта». Критический путь — самая длинная цепь связанных задач; её задержка двигает весь проект. DAG-инвариант гарантирован триггером 048 (циклов нет) → longest-path вычислим за один топологический проход.

> **Границы v1.** Критический путь = **longest path по сумме длительностей задач** в графе рёбер (не полный CPM со slack/ES-LS — даты у нас пользовательские, не выводятся из длительностей; FS как constraint не enforced, см. S-DEPS-1 W7). Полный CPM (ES/EF/LS/LF/float) — возможный v2. Явно комментом.

## РАЗВЕДКА
```bash
grep -n "useTaskDependencies\|const \[edges\|dependencies\|GanttBar\|filteredSwimlanes\|model\b\|gt.start\|gt.end\|bucketKeyOf" src/components/tasks/GanttTimeline.tsx | head -40
sed -n '255,300p' src/components/tasks/GanttTimeline.tsx   # где dependencies/edges/model; тип gt.start/gt.end
grep -n "GanttTask" src/lib/hooks/use-project-schedule.ts  # форма GanttTask (start/end — Date? ключ?)
grep -n "data-task-bar\|isLinkSource\|linkMode" src/components/tasks/GanttTimeline.tsx  # как GanttBar принимает флаги подсветки
```
Подтверди: (1) тип `gt.start`/`gt.end` (Date vs date-key) — от этого расчёт длительности; (2) как `GanttBar` уже получает булевы флаги (`isLinkSource` — образец для `isCritical`); (3) как формируется `edges` (массив `{id, d}`), чтобы пометить критические рёбра.

## ЗАДАЧА 1 — Алгоритм (useMemo, чистая функция)

Добавь `useMemo`, считающий критический путь по текущим видимым задачам и рёбрам.

```ts
// длительность задачи в днях (inclusive). ИСПОЛЬЗУЙ существующую date-логику проекта
// (mskDateKey / ms-diff) — НЕ изобретай TZ заново (бары уже считают корректно).
const durDays = (gt: GanttTask): number => {
  const ms = /* end - start в мс через ту же нормализацию, что бары */;
  return Math.max(1, Math.round(ms / 86_400_000) + 1); // +1 — день начала считается
};

const critical = useMemo(() => {
  // узлы: только ВИДИМЫЕ датированные задачи (те, что реально имеют бар — как в arrows/W4).
  const nodes = new Map<string, GanttTask>();
  for (const sl of filteredSwimlanes) for (const gt of sl.tasks) nodes.set(gt.task.id, gt);

  // рёбра только между видимыми узлами (консистентно со стрелками)
  const adjPreds = new Map<string, { edgeId: string; pred: string }[]>(); // succ -> [{edge, pred}]
  for (const d of dependencies) {
    if (!nodes.has(d.predecessor_id) || !nodes.has(d.successor_id)) continue;
    (adjPreds.get(d.successor_id) ?? adjPreds.set(d.successor_id, []).get(d.successor_id)!)
      .push({ edgeId: d.id, pred: d.predecessor_id });
  }

  // longest path DP по топологическому порядку (DAG гарантирован триггером 048 → циклов нет).
  // best[id] = max суммарная длительность цепи, заканчивающейся на id; from[id] = {pred, edgeId}.
  // Топосорт: Kahn по adjPreds ИЛИ мемо-DFS с visited (граф ацикличен).
  const best = new Map<string, number>();
  const from = new Map<string, { pred: string; edgeId: string } | null>();
  const order = /* топологический порядок узлов */;
  for (const id of order) {
    const gt = nodes.get(id)!;
    let bestPredSum = 0; let pick: { pred: string; edgeId: string } | null = null;
    for (const { pred, edgeId } of adjPreds.get(id) ?? []) {
      const s = best.get(pred) ?? 0;
      if (s > bestPredSum) { bestPredSum = s; pick = { pred, edgeId }; }
    }
    best.set(id, bestPredSum + durDays(gt));
    from.set(id, pick);
  }

  // глобальный максимум → бэктрек цепи
  let endId: string | null = null; let max = 0;
  for (const [id, v] of best) if (v > max) { max = v; endId = id; }
  const taskIds = new Set<string>(); const edgeIds = new Set<string>();
  let cur = endId;
  while (cur) {
    taskIds.add(cur);
    const step = from.get(cur);
    if (!step) break;
    edgeIds.add(step.edgeId);
    cur = step.pred;
  }
  // критический путь имеет смысл только при ≥1 ребре (цепочка из 2+ задач)
  return { taskIds: edgeIds.size ? taskIds : new Set<string>(), edgeIds, totalDays: edgeIds.size ? max : 0 };
}, [filteredSwimlanes, dependencies]);
```
> Топосорт: DAG гарантирован (циклы отбивает триггер 048 при вставке) — можно Kahn (in-degree по adjPreds) или memoized-DFS. Если граф пуст/без рёбер → `taskIds` пуст, подсветки нет.
> `[filteredSwimlanes, dependencies]` — те же нестабильные ссылки, что и measurement-effect. Здесь это **useMemo** (не effect со setState), лишний пересчёт безвреден и лупа не даёт. Не тащи это в effect-deps со setState (см. learnings — S-DEPS-1 луп).

## ЗАДАЧА 2 — Тумблер «Крит. путь»

В панель контролов (рядом с «Связи») добавь `<button aria-pressed>` `showCritical` (default **off**). Когда включён и `critical.taskIds.size > 0` — рядом бейдж «Крит. путь: {totalDays} дн».
- Взаимодействие с link-mode: независимы (можно включить оба; но подсветка — только визуал, клики link-mode не трогает).

## ЗАДАЧА 3 — Подсветка баров

`GanttBar` получает новый проп `isCritical: boolean` (образец — существующий `isLinkSource`). Прокинь `isCritical={showCritical && critical.taskIds.has(gt.task.id)}`.
- Стиль критического бара: акцентная рамка/заливка через **CSS-переменную** (`var(--accent)` рамка или `ring`), НЕ хардкод hex (6 тем). Не ломай существующие состояния бара (drag/hover/link-source) — добавляй, не заменяй.

## ЗАДАЧА 4 — Подсветка критических стрелок

В measurement-`useLayoutEffect` (тот, что строит `edges`) добавь в элемент каждого ребра флаг критичности: `edges` → `{ id, d, critical }`, где `critical = showCritical && critical.edgeIds.has(dep.id)`.
- В SVG: критический `<path>` — `stroke: var(--accent)`, `strokeWidth 2.5` (обычный 1.5), маркер акцентного цвета. Некритические — как сейчас (`var(--text-mute)`).
- **ВНИМАНИЕ (S-DEPS-1 грабля):** сохрани dedupe `setEdges` — теперь сравнивай и `critical` тоже (`e.critical === next[i].critical`), иначе тумблер не перерисует стрелки ИЛИ вернётся луп. Effect-deps measurement'а: добавь `showCritical` и стабильную сигнатуру крит-множества (напр. `critSig = [...critical.edgeIds].sort().join(',')`), НЕ объект `critical`.

## EDGE CASES
- Нет рёбер / нет видимых цепочек → подсветки нет, бейдж не показываем (`edgeIds.size === 0`).
- Фильтр Гантта (`Открытые`/`Вехи`) прячет задачи → критический путь считается по ВИДИМЫМ (консистентно со стрелками W4). Комментом: «крит. путь — по текущему фильтру; полный — на `Все`».
- Задачи без дат (нет бара) в расчёт не входят (нет позиции; deps к ним и так скипаются).
- Одна задача без рёбер не может быть «критическим путём» (нужно ≥1 ребро).
- Смена зума day/week/month — `critical` от дат не зависит (длительности те же), меняется только геометрия стрелок (measurement перемеряет).

## ГЕЙТЫ CC
```bash
npx tsc --noEmit      # 0 (no any; GanttTask/DependencyEdge типы уже есть)
npm run build         # exit 0
git diff --stat       # только GanttTimeline.tsx (+ возможно GanttBar, если он в отд. файле — проверь)
```
Локально: открой «Гант» проекта с цепочкой рёбер (создай 2-3 связи в link-mode), включи «Крит. путь» → подсветилась самая длинная цепь + бейдж дней; toggle off убирает; смена фильтра/зума не роняет; консоль чистая (без update-depth).

## КОММИТ
```bash
git add src/components/tasks/GanttTimeline.tsx
git commit -m "feat(gantt): S-CRIT-PATH — подсветка критического пути (longest path в DAG)"
```

## ПОСЛЕ ТЕБЯ — Cowork
Chrome-смок: создать цепь 1.1→1.3→(ещё) в link-mode, включить «Крит. путь» → подсветка + «N дн» верны; ветвление (две цепи) → подсвечена длиннейшая; фильтр/зум держат; toggle off. Restore рёбер.

## VERIFICATION
```
Type Safety:            NOT_VERIFIED (подтвердить tsc; без any)
Runtime:                NOT_VERIFIED (локальный смок + Cowork Chrome)
Backward Compatibility: PASS (аддитивно: useMemo + флаги подсветки; данные/рендер не ломаются)
Loop-safety:            WARNING (сохранить dedupe setEdges + стабильные deps — критично, см. S-DEPS-1)
```
