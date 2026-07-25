# Claude Code Prompt — Sprint S-WBS-1.1: rollup undated-родителя в Gantt (закрытие F1)

Контекст: доработка после S-WBS-1 (F1, задокументирован в `s-wbs-1-gate.md`). Сейчас задача без собственных дат (`start_date`/`end_date`/`deadline` все null), но С датированными детьми, НЕ становится сводным баром: она уходит в `undated`-бакет и не попадает в свимлейн, а её дети по правилу W7 всплывают отдельными корнями. Ожидание СДР: пакет «1.3 Документация» без своих дат должен рисоваться сводной скобкой поверх дат детей. **Миграций нет** — данные (`parent_task_id`, даты) уже есть; правка чисто в деривации расписания. Стек: Next 15 + TS strict.

Главный файл: `src/lib/hooks/use-project-schedule.ts`. Возможно затронуть `src/components/tasks/GanttTimeline.tsx` (рендер), но сводные бары там уже есть с S-WBS-1 — скорее всего рендер не менять, только проверить.

## РАЗВЕДКА (до правок)
```bash
cd ~/Downloads/dashboard-crm
sed -n '1,175p' src/lib/hooks/use-project-schedule.ts   # effectiveSpan(33-49), buildTree/visit(49-93), сборка свимлейнов+undated(103-133)
grep -n "isSummary\|undated\|datesFromChildren\|summary\|span" src/components/tasks/GanttTimeline.tsx | head -30
grep -n "GanttTask\b" src/lib/hooks/use-project-schedule.ts   # тип узла (start/end/isSummary/depth/parentId)
# как рендерится undated-бакет и сводный бар сейчас:
grep -n "undated\|Без дат\|isSummary" src/components/tasks/GanttTimeline.tsx | head
```
Зафиксировать: (1) поля `GanttTask` (нужно понять, можно ли пометить «даты из детей»); (2) как `visit()` (стр. ~71-88) вычисляет сводный span — он уже берёт `minS/maxE` из детей и пишет `node.start=minS` для summary; (3) как Gantt рендерит `undated`-бакет vs сводный бар.

## WHY
`effectiveSpan(task)` возвращает null для полностью undated-задачи → строка 108 сбрасывает её в `undated` ДО построения дерева. `buildTree`/`visit` уже умеют считать span сводного узла из детей — проблема лишь в том, что undated-родитель не доходит до дерева. Нужно: undated-задача, у которой есть датированный потомок В ТОМ ЖЕ свимлейне, должна попасть в лейн как summary-only узел (span целиком из детей), а не в `undated`. Кросс-фазовые деревья остаются split (v1, как в S-WBS-1) — undated-родитель без датированных детей в своём лейне остаётся undated.

## ЗАДАЧА 1 — материализовать undated-предков датированных задач

HOW (в `useProjectSchedule`, блок сборки, стр. ~103-133):

1. **Два прохода вместо одного.**
   - Проход A: раздели `tasks` на `dated` (есть `effectiveSpan`) и `undatedAll` (нет).
   - Вычисли множество `keepUndated` = undated-задачи, у которых есть ХОТЯ БЫ ОДИН датированный потомок (по цепочке `parent_task_id`), лежащий в ТОМ ЖЕ свимлейне (том же `column_id` в phaseMode; в flat-режиме свимлейн один). Построй `childrenByParent: Map<parentId, Task[]>` по всем задачам, затем для каждой undated-задачи DFS вниз: есть ли достижимый датированный узел в её лейне. Кэшируй результат (мемо по id), т.к. цепочки пересекаются.
   - Остальные undated (`undatedAll \ keepUndated`) → в `undated`-бакет (как сейчас).

2. **Summary-only узлы в лейн.** Для каждой `keepUndated`-задачи создай `GanttTask` с флагом «span из детей»: добавь в тип `GanttTask` поле `datesFromChildren?: boolean` (или переиспользуй `isSummary`, но безопаснее явный флаг — `visit` всё равно переставит span). Начальные `start`/`end` можно поставить в пустую строку/сентинел — `visit()` их перезапишет из детей. Помести узел в лейн по её `column_id` (phaseMode) / `__flat__`.

3. **`visit()` должен пережить узел без собственного span.** Сейчас (стр. ~71-88) для summary он делает `node.start = minS; node.end = maxE`. Убедись, что для `datesFromChildren`-узла НЕ используется его (пустой) собственный span как кандидат min/max — считать span СТРОГО из детей. Если у `datesFromChildren`-узла вдруг нет датированных детей в дереве (не должно случиться после шага 1, но защитно) — не роняй: исключи узел или оставь как есть с пустым span (и залогируй в dev). Каскад работает рекурсивно: undated-родитель → undated-ребёнок → датированный внук (промежуточные undated-узлы тоже материализуются, если в `keepUndated`).

4. **Сортировка/порядок** (`bySpan`, стр. ~75) — summary-only узлы должны корректно сортироваться среди детей: сортируй по ВЫЧИСЛЕННОМУ span (после visit) либо клади их по первому датированному ребёнку. Не сломать существующий порядок «родитель → дети».

## ЗАДАЧА 2 — рендер (проверить, вероятно без правок)
Сводный бар для undated-родителя рисуется тем же путём, что S-WBS-1 summary (скобка-обёртка + chevron + depth-отступ). Проверь в `GanttTimeline.tsx`, что summary-бар не завязан на наличие собственного `start_date`/`deadline` у задачи (а берёт вычисленные `gt.start/gt.end`). Если где-то есть гард «нет своих дат → не рисуем» — снять для summary. Undated-бакет теперь содержит только истинно-undated (без датированных потомков) — подпись/пустое состояние бакета проверить.

## EDGE CASES / TESTS (сценарии, не полный suite)
- Undated-родитель + 2 датированных ребёнка (тот же column_id) → родитель рисуется сводной скобкой span=обёртка детей; из `undated`-бакета исчез.
- Цепочка undated→undated→датированный внук → оба undated-предка материализуются вложенными summary.
- Undated-родитель, чьи дети ВСЕ в другой фазе → остаётся в `undated` (v1 cross-phase split, без регресса S-WBS-1).
- Полностью undated лист (нет детей) → остаётся в `undated`-бакете.
- Датированный родитель + датированные дети (обычный S-WBS-1 кейс) → без регресса, span-обёртка как была.
- Цикл `parent_task_id` невозможен (гард 048/052), но DFS должен иметь visited-защиту на всякий.
- Пустой проект / все undated → бакет как раньше, лейны пустые, не падать.

## VERIFICATION LABELS (ожидаемые)
```
Type Safety:            WARNING (новый флаг в GanttTask + два прохода — проверить типы)
RLS Coverage:           NOT_APPLICABLE (клиент, деривация; данные под существующей RLS)
Backward Compatibility: WARNING (S-WBS-1 датированные деревья + cross-phase split НЕ должны регрессить — проверить смоком)
Runtime Tested:         NOT_VERIFIED (Chrome-смок на реальном delivery с undated-пакетом)
```

## КОММИТ
Миграций нет — чистый клиент, Vercel задеплоит с пуша. Явный список файлов (не `git add -A`): `use-project-schedule.ts` (+ `GanttTimeline.tsx` если правился рендер).
```
git add src/lib/hooks/use-project-schedule.ts src/components/tasks/GanttTimeline.tsx
git commit -m "S-WBS-1.1: rollup undated-родителя в Gantt (закрытие F1)"
git push
```
Смок после деплоя: на delivery с undated-пакетом-родителем и датированными детьми — сводная скобка появилась, из «без дат» ушла; cross-phase и обычные деревья без регресса.
