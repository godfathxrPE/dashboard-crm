# Claude Code Prompt — Sprint S-SCHEDULE-1B: авто-каскад сдвига зависимых задач

> **Тип:** D2 (ядро — чистая функция + тесты), **UI-only, миграций НЕТ**.
> Продолжение S-SCHEDULE-1a (soft-warn FS-нарушений) — доводим сигнал до действия.
> **Ветка:** `feat/schedule-1b-cascade` от свежего `main`.
> Смежные доки: `sprint-S-GANTT-CPM.md` (следующий спринт, строится на том же модуле).

## РАЗВЕДКА (факты сверены по коду 2026-07-25 — перепроверь на свежем main)

Что **уже есть** и переиспользуется без изменений:

- **`src/lib/utils/date-helpers.ts`** — `shiftDateKeyByBuckets(dateKey, zoom, n)` на UTC-полудне
  (`T12:00:00Z`), `bucketKeyOf`, `buildBuckets`, `mskDateKey`. Приватный `noonMs()` — там же,
  поэтому новый `diffDaysKey` живёт в этом файле, а не в модуле расписания.
- **`src/lib/hooks/use-project-schedule.ts`** — `GanttTask { task, start, end, isMilestone, depth,
  isSummary, parentId, datesFromChildren? }`, свимлейны, `effectiveSpan`, `buildTree`.
  ⚠️ `GanttTask.parentId` — родитель **в том же свимлейне** (W7-сплит). Для каскада это НЕ годится:
  дерево строим по сырому `task.parent_task_id` по всем лейнам сразу.
- **`src/lib/hooks/use-task-dependencies.ts`** — `DependencyEdge { id, predecessor_id, successor_id,
  dep_type, lag_days }`, оптимистик-паттерн 5 шагов, `parseDependencyError`, `meta:{silentError:true}`.
- **`GanttTimeline.tsx`** — `commitDates(...)` (единственная точка записи дат из Ганта: drag-move,
  resize обеих ручек, дроп undated-чипа), тост на RLS 42501, Kahn-топосорт внутри крит-пути,
  soft-warn FS в эффекте, который считает `violSig`.
- **Семантика FS в 1a (ЗАКОН, не менять):**
  `earliest = shiftDateKeyByBuckets(pred.end, 'day', lag_days)`, нарушение при `succ.start < earliest`.
  То есть при `lag=0` старт последователя в **тот же день**, что и конец предшественника, — легален.
  Каскад ОБЯЗАН считать по этой же формуле, иначе предупреждение и каскад разойдутся.

Диагностика перед стартом:

```bash
cd ~/Downloads/dashboard-crm && git checkout main && git pull --ff-only origin main
git checkout -b feat/schedule-1b-cascade
find src -name "*.test.ts" -o -name "*.test.tsx" | head          # где живут vitest-тесты (НЕ угадывай)
grep -n "queryKey\|projectBoardKey\|onMutate" src/lib/hooks/use-tasks.ts | head -40
grep -n "commitDates\|canManage\|toast\." src/components/tasks/GanttTimeline.tsx
grep -n "dep_type\|DepType" src/types/database.ts                 # какие значения реально в enum
grep -n "shiftDateKeyByBuckets\|noonMs" src/lib/utils/date-helpers.ts
```

## WHY

Сейчас нарушение FS — красная стрелка и подсказка. Пользователь видит проблему и чинит её руками,
задача за задачей: на цепочке из 6 звеньев это 6 драгов. Во всех взрослых планировщиках (MS Project
«reschedule dependent tasks», Smartsheet dependency-driven shift, Bryntum `SchedulingMode`) сдвиг
предшественника автоматически двигает хвост.

Философия проекта — **«система предлагает, пользователь подтверждает»** (как AI Hub): не двигаем молча.
После коммита дат показываем тост «Сдвинуть N зависимых задач?» с кнопкой; один клик — один батч-апдейт.
Отказ = ничего не произошло, красные стрелки остались как раньше.

## КЛЮЧЕВОЕ РЕШЕНИЕ: вся алгоритмика — в чистом модуле, ноль React

Новый файл **`src/lib/utils/gantt-schedule.ts`** — чистые функции над примитивами, без React, без
Supabase, без импортов из хуков. Причина не косметическая: это **фундамент S-GANTT-CPM** (следующий
спринт переносит сюда же прямой/обратный проход и total float, а крит-путь в `GanttTimeline` начинает
читать float вместо своего inline-DP). Модуль покрывается vitest на 100% — единственный способ
проверить графовую математику без прод-смоука.

В этом спринте `GanttTimeline` **не отдаёт** свой Kahn-топосорт в модуль (у модуля будет свой) —
дедупликацию делает CPM-спринт, когда inline-DP всё равно удаляется. Смысл: не трогать крит-путь
в спринте про каскад, чтобы диф читался.

## ЗАДАЧА 1: `diffDaysKey` в date-helpers

```ts
/** Разница в календарных днях между YYYY-MM-DD (b - a). Та же UTC-полдень математика,
 *  что shiftDateKeyByBuckets: diffDaysKey(a, shiftDateKeyByBuckets(a,'day',n)) === n. */
export function diffDaysKey(a: string, b: string): number {
  return Math.round((noonMs(b) - noonMs(a)) / GANTT_DAY_MS);
}
```

## ЗАДАЧА 2: `src/lib/utils/gantt-schedule.ts` — расчёт каскада

Типы входа — намеренно узкие, чтобы модуль не зависел от `Task`/`GanttTask`:

```ts
export interface ScheduleNode {
  id: string;
  start: string;          // YYYY-MM-DD — эффективный span (у сводных = обёртка детей)
  end: string;
  hasOwnDates: boolean;   // false у datesFromChildren-узлов: писать в БД нечего
  parentTaskId: string | null;  // СЫРОЙ task.parent_task_id (кросс-лейн!), не GanttTask.parentId
}
export interface ScheduleEdge {
  predecessor_id: string;
  successor_id: string;
  dep_type: string;
  lag_days: number;
}
export interface CascadeShift {
  id: string;
  deltaDays: number;      // всегда > 0 (v1 — только вперёд)
  start: string;          // новые даты
  end: string;
  reason: 'dependency' | 'subtree';  // сдвинут связью или как потомок сводной
}
```

Правила v1 — фиксируй их комментарием в шапке файла, это контракт:

1. **Только `dep_type === 'FS'`.** Остальные типы (когда появятся в S-GANTT-POLISH) молча
   пропускаются — каскад по ним считать нельзя, пока не описана их семантика.
2. **Только вперёд.** Если `succ.start > earliest` (запас есть) — НЕ подтягиваем назад. Подтяжка
   назад = ASAP-планирование, оно конфликтует с пользовательскими фиксированными датами и рвёт
   ручные буферы. Это осознанный отказ, не забытая ветка.
3. **Длительность сохраняется:** `newStart = shift(start, +Δ)`, `newEnd = shift(end, +Δ)`, где
   `Δ = diffDaysKey(succ.start, earliest)`.
4. **Якоря не двигаются:** узлы из `anchors: Set<string>` (только что закоммиченная задача +
   всё, что уже попало в результат как якорь) исключены из сдвига, но участвуют как предшественники.
5. **Сводные узлы двигаются поддеревом.** Если у сдвигаемого узла есть дети (по `parentTaskId`),
   тот же `Δ` применяется рекурсивно ко всем потомкам с датами. Собственные даты сводного пишутся,
   только если `hasOwnDates` (иначе в БД писать нечего — span вычислен из детей). `reason:'subtree'`.
6. **Узлы без дат** (не попавшие в расписание) в графе отсутствуют — сдвигать нечего, ребро игнор.
7. **Цикл-гард:** БД-валидатор 048 циклы не пускает, но модуль обязан быть устойчив к мусору —
   счётчик итераций `≤ nodes.length * 4`, при превышении вернуть посчитанное и `console.warn`
   в dev. Гант не роняем никогда.

Сигнатура:

```ts
export function computeCascade(
  nodes: ScheduleNode[],
  edges: ScheduleEdge[],
  anchors: Set<string>,
): CascadeShift[];
```

Алгоритм: топосорт Kahn по FS-рёбрам → проход в топопорядке, на каждом узле
`earliest = max(shiftDateKeyByBuckets(end[pred],'day',lag))` по входящим рёбрам (беря **уже
обновлённые** даты предшественников из рабочей мапы) → если `start < earliest`, фиксируем сдвиг и
раскатываем поддерево. Узлы вне топопорядка (остаток от цикла) — пропуск.

## ЗАДАЧА 3: vitest — `computeCascade`

Кейсы (минимум, все на чистых литералах, без моков):

- цепочка A→B→C, сдвиг A на +3 → B и C сдвинуты на +3, длительности целы;
- `lag_days = 2` → `B.start === A.end + 2` (и НЕ +3: проверка совпадения с семантикой 1a);
- у B был запас 5 дней, A сдвинулся на 2 → B **не двигается**, C тоже (правило 2);
- ромб A→B, A→C, B→D, C→D с разными lag → D встаёт по максимуму из двух ветвей;
- `dep_type: 'SS'` в списке рёбер → полностью игнорируется;
- successor — сводный узел с двумя детьми → сдвинуты оба ребёнка + сам узел (если `hasOwnDates`);
- successor уже в `anchors` → не двигается, но его хвост считается от его текущих дат;
- искусственный цикл A→B→A → функция возвращает результат без зависания.

## ЗАДАЧА 4: `useShiftTasks` — батч-апдейт

Новый хук в `src/lib/hooks/use-tasks.ts` (рядом с `useUpdateTask`, тот же ключ кэша борда):

```ts
export function useShiftTasks(projectId: string)
```

- `mutationFn(shifts: CascadeShift[])`: `Promise.allSettled` из
  `supabase.from('tasks').update({ start_date, end_date }).eq('id', s.id)`.
  Вернуть `{ ok: number, failed: number }`.
- `meta: { silentError: true }` — тостим сами.
- `onMutate`: **один** оптимистичный патч кэша борда (мапой по id), snapshot в `context.previous`.
- `onError` → полный откат из snapshot.
- `onSettled` → один `invalidateQueries` ключа борда (и ключа зависимостей не надо — рёбра не менялись).
- Тост результата: `ok === shifts.length` → `toast.success('Сдвинуто N задач')`; частичный отказ →
  `toast.error('Сдвинуто K из N — остальные отклонены (нет прав)')` + инвалидация вернёт правду из БД.

> **Долг, назвать вслух:** батч НЕ атомарен — при RLS-отказе на части строк применится часть.
> Осознанно: атомарность стоит миграции (RPC `shift_tasks_dates(jsonb)` + apply-гейт), а спринт
> держим UI-only. Если частичные сдвиги реально всплывут на проде — v2 через RPC.

## ЗАДАЧА 5: wiring в `GanttTimeline`

Единственная точка врезки — **после успешного `commitDates`** (покрывает и drag-move, и обе
ручки resize, и дроп undated-чипа — врезаться в три места не нужно).

- Гейт: `canManage` false → каскад не считаем вообще.
- Собрать `ScheduleNode[]` из всех свимлейнов (`schedule.swimlanes.flatMap(sl => sl.tasks)`),
  `hasOwnDates = !gt.datesFromChildren`, `parentTaskId = gt.task.parent_task_id`.
- `computeCascade(nodes, deps, new Set([draggedId]))` → пусто ⇒ выходим молча.
- Иначе тост-предложение:

```ts
toast(`Сдвинуть ${shifts.length} зависимых задач?`, {
  duration: 12_000,
  action: { label: 'Сдвинуть', onClick: () => { /* см. ниже */ } },
});
```

- **Пересчёт на клике, а не в замыкании.** Между показом тоста и кликом юзер мог утащить ещё что-то.
  Держи `scheduleRef` (актуальные nodes+edges, обновляется в эффекте) и в `onClick` считай
  `computeCascade` заново от того же якоря; пусто ⇒ тихий выход, иначе `shiftTasks.mutate(fresh)`.
  Это тот же приём, что уже применён для undated-чипа (`undatedDragRef`) — состояние в замыкании отстаёт.
- Плюрализация в тосте — по правилу «N задач/задачи/задачу» (если в проекте уже есть хелпер — взять
  его: `grep -rn "plural\|склон" src/lib/utils`).

**Чего в спринте НЕТ (сознательно):**
«Строгий режим» проекта (каскад без подтверждения) требует колонки `projects.schedule_strict` →
миграция → apply-гейт. Выносим в долги: сначала посмотрим, как ощущается тост.

## VERIFY

```bash
npx tsc --noEmit && npx eslint src/lib/utils src/lib/hooks src/components/tasks
npx vitest run src/lib/utils                                   # новые тесты зелёные
grep -rn "\bany\b" src/lib/utils/gantt-schedule.ts             # пусто
grep -rn "from '@/lib/hooks\|react" src/lib/utils/gantt-schedule.ts   # пусто — модуль чистый
git diff --stat main -- src/components/tasks/GanttTimeline.tsx # только врезка после commitDates
```

Ручной смоук (прод, я):

1. Цепочка A→B→C: тащу A вправо на 3 дня → тост «Сдвинуть 2 зависимых задач?» → клик → B и C
   переехали, длительности целы, красные стрелки исчезли; F5 — даты в БД.
2. Отказ: тот же драг, тост проигнорирован/закрыт → в БД сдвинута только A, стрелка красная (как в 1a).
3. `lag_days = 2` на ребре → B встал ровно на `A.end + 2`, не на +3.
4. У B запас 5 дней, A сдвинут на 2 → тоста нет (нечего двигать).
5. Сводная задача как successor → уехало всё поддерево одним куском.
6. Resize правой ручки предшественника и дроп undated-чипа на дату → каскад тоже предлагается.
7. Роль viewer/manager без прав → тоста нет; под ролью с частичными правами — проверить текст
   «Сдвинуто K из N».
8. Темы aura + fuji: тост читаем, кнопка видна.

## КОММИТ (миграций нет)

```bash
git add src/lib/utils/gantt-schedule.ts src/lib/utils/date-helpers.ts \
        src/lib/hooks/use-tasks.ts src/components/tasks/GanttTimeline.tsx \
        src/lib/utils/__tests__   # путь уточнить по РАЗВЕДКЕ
git commit -m "feat(gantt): авто-каскад сдвига зависимых задач (S-SCHEDULE-1B)

- gantt-schedule.ts: чистый computeCascade (Kahn-топосорт + форвард-проход по FS),
  семантика earliest = pred.end + lag — идентична soft-warn из 1a
- v1-правила: только FS, только вперёд, длительность сохраняется, сводные двигаются
  поддеревом по сырому parent_task_id (кросс-лейн), цикл-гард
- diffDaysKey в date-helpers (UTC-полдень, парная к shiftDateKeyByBuckets)
- useShiftTasks: батч-апдейт allSettled + один оптимистичный патч кэша борда
- UI: после commitDates тост-предложение с кнопкой; каскад пересчитывается на клике
  по scheduleRef, а не из замыкания
- vitest: 8 кейсов на computeCascade"
```

## Verification Labels

```
Type Safety:            NOT_VERIFIED (any запрещён — grep; tsc в VERIFY)
RLS Coverage:           PASS (новых таблиц нет; батч идёт обычным tasks_update, отказ по строкам
                        обрабатывается и ресинкается инвалидацией)
Backward Compatibility: PASS (аддитивно: без клика по тосту поведение 1a не меняется;
                        crit-path и inline-DP не тронуты)
Runtime Tested:         NOT_VERIFIED (vitest покрывает чистый модуль; UI — прод-смоук)
```

Трудоёмкость: ~8–11 ч (модуль ~3, тесты ~2, хук ~1.5, wiring+тост ~2, смоук ~1.5).
Риск: средний — вся сложность в чистой функции под тестами, UI-врезка одна.

## Долги на заметку

- «Строгий режим» проекта (каскад молча) — нужна миграция `projects.schedule_strict`.
- Атомарность батча — RPC `shift_tasks_dates(jsonb)`, если частичные отказы всплывут.
- Undo сдвига (тост «Отменить» с обратным батчем) — в S-GANTT-POLISH.
- Рабочий календарь РФ (сдвиг через выходные/праздники) — вне дорожной карты, дорого и требует
  справочника производственного календаря.

---

## Процесс

CC пишет + коммитит → мёрж-гейт (build 0, vitest 0) → я прод-смоук по списку выше.
Миграций нет — apply-гейт не нужен. Следующий спринт — **S-GANTT-CPM**, он расширяет тот же модуль.
