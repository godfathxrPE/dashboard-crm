# Claude Code Prompt — Sprint D: S-GANTT-UX-2 (v2, после ревью Grok 6.5/10)

**Gantt UX: удаление задач/фаз прямо в Ганте + drag задачи из «Без дат» на таймлайн**

> **Что поправлено против v1 (ревью Grok, сверка по коду @`0ac3189`):**
> B1 `useUpdateTaskDates()` — **без** `projectId`; B2 удаление фазы — **пикер target как на доске** (не `window.confirm`); B3 **fallback-ось** при only-undated (иначе основной сценарий ломается); W1 `canManage` из `ProjectDetail.tsx`, не `page.tsx`; W2 CSS `text-red`/`text-text-mute`; W3 hover-Trash + guard `isSummary`; W5 Trash фазы только для real phase-id; W6 click-threshold на chip; W4 `canManage` = **UI-гейт, не RLS-факт** + `toast` на 42501.

## Контекст
- `dashboard-crm` (Next.js 15 + TS + Tailwind + Supabase, Vercel auto из `main`).
- `origin/main = 0ac3189`, миграции по **065**. **КЛИЕНТСКИЙ спринт — миграций НЕТ, RLS НЕ трогаем.** Переиспользуем существующие мутации (их RLS уже покрыт).
- Гант: `src/components/tasks/GanttTimeline.tsx` (~1033 стр., кастомный CSS-grid, нативные Pointer Events; drag move/resize баров — VIEW-2; link-mode стрелки — S-DEPS-1; удаление ребра — `window.confirm` ~1019). Данные — `src/lib/hooks/use-project-schedule.ts` (swimlane = `column_id` → колонка `category='phase'`, НЕ `phase_group`). Date-математика — `src/lib/utils/date-helpers.ts` (`mskDateKey`, UTC-полдень, `shiftDateKeyByBuckets`/`bucketKeyOf`).

### Цель (фидбек Олега, п.10+11)
1. Удалять ошибочную **задачу** прямо из Ганта.
2. Управлять **фазами** (свимлейнами) в Ганте — удаление, как на доске «План».
3. Тянуть задачу из зоны **«Без дат»** на таймлайн → проставлять `start_date`/`end_date`.

### Решения (зафиксированы, не переспрашивать)
- **Роль-гейт = `canManage`** (значение `canManageDeliveryProject`, уже считается в `ProjectDetail.tsx:248`). Прокинуть пропом в `GanttTimeline` (сейчас его там НЕТ — только `projectId`, `onEditTask`). Гейтить: удаление задачи, удаление фазы, drag из «Без дат», **и существующий drag move/resize баров** (он тоже write — после 065 member видит Гант и словит `42501`). **`canManage` — UI-гейт, не RLS-факт**: на любой write-путь повесить `onError → toast.error` (sonner уже в layout) на случай RLS `42501`.
- **Удаление фазы — через пикер target** (модалка + `<select>`, как на доске), НЕ `window.confirm`. RPC `delete_project_column` без target падает на непустой колонке (контракт 032/033). `window.confirm` — только для **задачи** и ребра.
- **Drop из «Без дат»** → `start_date = end_date = день дропа` (нулевая длительность; дальше resize краёв, он есть). На зуме Неделя/Месяц день = ключ бакета (Пн / 1-е), не weekday под пикселем — как bar-snap VIEW-2.
- **Два коммита**: (1) удаление задачи+фазы, (2) drag из «Без дат».

---

## ⚠️ КРИТИЧЕСКИЕ ГОЧИ
1. **`window.confirm` в Ганте морозит CDP-скрин.** Конвенция проекта → оставляем для **задачи/ребра** (НЕ для фазы — у неё пикер target). Смок удаления — ручным кликом, не автоскрином.
2. **Cache-key.** Даты пишет **`useUpdateTaskDates()` (без args!)** — внутри `patchTaskCaches` правит все срезы префикса `['tasks']` (board + личный). Drop из «Без дат» **обязан** идти через этот хук, не через ad-hoc update. Удаление задачи — `useDeleteTask()`; удаление колонки — `useDeleteColumn(projectId)` (инвалидирует `['project_columns', projectId]` + `['tasks']`).
3. **Measurement-loop (tsc/build НЕ ловят).** `setEdges` в `useLayoutEffect` уже дедуплен (`GanttTimeline.tsx:619–627`). Для undated-drag держать ту же дисциплину: дедуп `setState` (bail при идентичном) + стабильная строковая сигнатура в deps. Ловится **только рантайм-смоком** (dev + консоль).
4. **TZ.** День — `mskDateKey`; бакеты/инкремент — UTC-полдень (`T12:00:00Z`). Маппинг `clientX → bucketKey` бери из существующего drag-move баров, не изобретай.
5. **FK-cleanup — на БД.** Удаление задачи: `task_dependencies` pred/succ → `ON DELETE CASCADE` (048); `parent_task_id` → `ON DELETE SET NULL` (052). Клиентский cleanup НЕ делать.
6. **CHECK `tasks_dates_order_chk`**: `start = end` валиден (046).
7. **CSS-токены (канон проекта, НЕ выдумывать).** Danger-иконка: `text-red` / `var(--red)` / `var(--red-text)` (как Trash2 на доске и «Удалить связь» в Ганте). Приглушённый: `text-text-mute` / `var(--text-mute)`. **НЕ** `--danger` / `--text-muted` (в части тем пропадёт).
8. **Only-undated → таймлайна нет.** Бакеты (`GanttTimeline.tsx:559–569`) строятся ТОЛЬКО из датированных задач; если все в «Без дат» → `buckets=[]` → блок таймлайна не рендерится. Основной сценарий Task 3 (проект из шаблона, даты пустые) без fallback-оси **мёртв** — см. Задача 3 step 1.

---

## РАЗВЕДКА (ПЕРЕД правками — верифицировать по коду)
```bash
cd ~/Downloads/dashboard-crm && git switch -c feat/gantt-ux-2 && git log --oneline -1

# canManage: где считается и куда уходит (НЕ page.tsx — она тонкая обёртка)
grep -n "canManage\|GanttTimeline" src/components/projects/ProjectDetail.tsx        # ~248 canManage, ~866-869 <GanttTimeline>
grep -n "canManageDeliveryProject" src/lib/utils/project-permissions.ts             # формулу не дублировать

# Гант: props, бары, зона «Без дат», swimlane-заголовок, click-threshold
grep -n "onEditTask\|projectId\|canManage" src/components/tasks/GanttTimeline.tsx | head   # props 27-30
grep -n "CLICK_PX\|onPointerDown\|onPointerUp\|bucketPx\|shiftDateKeyByBuckets\|isSummary" src/components/tasks/GanttTimeline.tsx
grep -n "Без дат\|undated\|__none__\|__flat__\|phaseMode" src/components/tasks/GanttTimeline.tsx    # undated chips ~952-969, swimlane header ~749-752
grep -n "buckets\|buildBuckets\|model" src/components/tasks/GanttTimeline.tsx | head            # ~559-569

# Мутации (as-is, сигнатуры — из ревью)
grep -n "useDeleteTask\|useUpdateTaskDates" src/lib/hooks/use-tasks.ts                # 429 / 327
grep -n "useDeleteColumn\|delete_project_column" src/lib/hooks/use-project-columns.ts # 100-116

# Образец пикера target при удалении колонки (inline, НЕ reusable-компонент)
grep -n "useDeleteColumn\|targetColId\|deletingCol\|<select" src/components/tasks/ProjectBoard.tsx    # диалог ~451-485
```
**Свод перед кодом:** сигнатуры `useDeleteTask()` / `useUpdateTaskDates()` / `useDeleteColumn(projectId)` = живой код; как `ProjectBoard` строит пикер target (модалка + `<select>`, `targetId = hasTasks ? col : null`); список real phase-id (не `__none__`/`__flat__`); значение `CLICK_PX`.

---

## ЗАДАЧА 1 — Удаление задачи из Ганта  [риск: низкий]
**Context.** Задача (бар и chip «Без дат») удаляется прямо из Ганта той же мутацией, что на доске. Рёбра/дети снимет БД.

**Steps.**
1. Прокинь в `GanttTimeline` проп `canManage: boolean` из `ProjectDetail.tsx` (значение `canManage` со стр. ~248; монтаж Ганта ~866–869). **Не** трогать `page.tsx`.
2. `import { useDeleteTask } from '@/lib/hooks/use-tasks'` → `mutate(id)`.
3. **Hover-кнопка** `Trash2` (Lucide) на баре (`GanttBar` ~111–308) и в chip «Без дат» (~952–969) — своего toolbar на баре нет, вешаем hover-иконку. Рендерить **только при `canManage`**. `stopPropagation` (не открывать edit / не стартовать drag); прятать в `linkMode`.
4. **Guard `isSummary`**: у summary-задачи (WBS-родитель) удаление — осторожно (дети `parent_task_id → SET NULL`); подтверждение должно это назвать. Не давать удалять summary случайно вместе с resize/link.
5. `onClick`: `if (!window.confirm('Удалить задачу «' + task.text + '»? Действие необратимо.')) return;` → `deleteTask.mutate(task.id)`. `onError: () => toast.error('Не удалось удалить (нет прав или сеть)')`.
6. CSS: `text-red` / `var(--red)` (иконка), hover — как у существующих action-иконок. Без hex/Tailwind-палитры.

**Verification.** `npx tsc --noEmit`. Ручной смок (dev): бар → hover → Trash2 → confirm → задача исчезла из Ганта и с доски; рёбра к ней пропали; summary — дети остались (parent обнулён). Без `canManage` иконки нет.

---

## ЗАДАЧА 2 — Удаление фазы (свимлейна) из Ганта  [риск: средний]
**Context.** Свимлейны = фаза-колонки (`category='phase'`). Удаление на доске — **модалка + `<select>` target** (куда переселить задачи), НЕ `confirm`. RPC `delete_project_column` без target падает на непустой колонке. Переиспользуем хук; UI пикера на доске **inline** в `ProjectBoard` — скопировать/минимально вынести, не искать «готовый компонент».

**Steps.**
1. `import { useDeleteColumn } from '@/lib/hooks/use-project-columns'` → `mutate({ id, targetId })` (RPC). Инвалидацию делает хук.
2. Кнопка `Trash2` в заголовке свимлейна (~749–752) — **только при `canManage` И только для real phase-id**: `phaseMode && sl.id` ∈ `project_columns` (исключить `__none__` «Без фазы» и `__flat__` non-phase-board), иначе RPC/`42501`/мусор.
3. Клик → **тот же UX, что доска** (`ProjectBoard.tsx` ~451–485): если в фазе есть задачи — модалка со `<select>` target-колонки → `mutate({ id: sl.id, targetId: selected })`; если 0 задач — `targetId: null` (можно короткий `confirm`). Не хардкодить соседа как дефолт.
4. Ошибка RPC (последняя/защищённая колонка, гард 033) → `toast.error(...)` (sonner), не `alert`, не белый экран.

**Verification.** `npx tsc --noEmit`. Ручной смок: заголовок фазы с задачами → Trash2 → модалка → выбрать target → задачи переехали (проверить на доске «План»), свимлейн исчез. Пустая фаза → удаляется без пикера. Свимлейны «Без фазы»/flat — кнопки нет. Без `canManage` — кнопки нет.

### КОММИТ 1
```bash
npx tsc --noEmit && git add -A && git commit -m "feat(gantt): удаление задачи (confirm) и фазы (пикер target, useDeleteColumn) в Ганте — гейт canManage, toast на 42501"
```

---

## ЗАДАЧА 3 — Drag задачи из «Без дат» на таймлайн → даты  [риск: средний-высокий]
**Context.** Задачи без дат — chips в зоне «Без дат» (сейчас `<button onClick={onEditTask}>`, ~952–969). Тащим chip на таймлайн → под курсором день → `start=end=день`. Расширяем нативный Pointer-drag (как бары), не тащим @dnd-kit.

**Steps.**
1. **B3 — fallback-ось (ОБЯЗАТЕЛЬНО, иначе фича мертва).** Если есть undated-задачи, но `buckets.length === 0` (все даты пустые — проект из шаблона), построй временную ось: `buildBuckets(today − N, today + N, zoom)` от `mskDateKey(new Date())` с паддингом (напр. N=14 дней), чтобы было куда дропать. Обычная ось (из датированных задач) сохраняется, когда она есть.
2. На chip повесь `onPointerDown` (**только при `canManage`**) → drag-state `{ draggingUndatedId }`, курсор `grabbing`. **Click-threshold (W6):** тот же `CLICK_PX` (~4, стр. ~167–168), что у баров — сдвиг < порога = клик → `onEditTask`; ≥ порога = drag. Иначе drag перебьёт открытие edit.
3. `onPointerMove` над таймлайном: подсветить бакет под `clientX` (тот же расчёт индекса, что drag-move баров: `(clientX − timelineLeft)/bucketPx`), лёгкий призрак дня.
4. `onPointerUp`:
   - над таймлайном → `bucketKey` (хелпер из `date-helpers.ts`, UTC-полдень) → `useUpdateTaskDates().mutate({ id, start_date: bucketKey, end_date: bucketKey })`;
   - вне таймлайна → отмена. Сбросить drag-state в обеих ветках.
5. **Cache (гоча 2):** только через `useUpdateTaskDates()` — `patchTaskCaches` уберёт chip из «Без дат» и покажет бар (у задачи появились даты → `use-project-schedule` перекинет в лейн). Не писать свой dual-key update. `onError → toast.error`.
6. **Measurement-loop (гоча 3):** если добавляешь измерение/эффект под drag — дедуп `setState` + стабильная строковая сигнатура в deps (как `619–627`). Объект drag-state в deps измерения не класть.
7. **Гейт существующего bar-drag:** обернуть move/resize баров тем же `canManage` (W4) — после 065 иначе member ловит `42501`. `onError → toast.error` на `useUpdateTaskDates`.

**Verification.**
```bash
npx tsc --noEmit
rm -rf .next && npm run dev
```
Рантайм-смок (dev, **обязателен** — луп сборкой не ловится):
- проект, где ВСЕ задачи без дат → зона «Без дат» есть, ось-fallback отрисовалась → тащу chip на день → появился бар, chip ушёл из «Без дат», в консоли **нет `Maximum update depth exceeded`**;
- обычный проект (есть датированные) → drag chip на день работает; края бара тянутся resize'ом;
- клик по chip (без сдвига) → открылся edit (не drop);
- drop мимо таймлайна → без изменений;
- зум Месяц↔Неделя: дата = **ключ бакета** (Пн / 1-е число), не weekday под пикселем — это ожидаемо (bar-snap VIEW-2);
- роль без `canManage` → chips не тащатся, бары не двигаются/не ресайзятся.

### КОММИТ 2
```bash
npx tsc --noEmit && git add -A && git commit -m "feat(gantt): drag задачи из «Без дат» на таймлайн → даты (fallback-ось, click-threshold, useUpdateTaskDates, гейт canManage+toast)"
```

---

## ФИНАЛЬНАЯ ПРОВЕРКА
```bash
npx tsc --noEmit                 # 0 ошибок
npm run build                    # НЕ при живом dev (SWC/.next) — останови dev
npx vitest run                   # если тронуты date-helpers / use-project-schedule
git push -u origin feat/gantt-ux-2
```
Затем PR/мёрж в `main` → Vercel auto-deploy.

## Для гейта Cowork (справочно, CC не делает)
Миграций нет → `apply_migration`/`advisors` не нужны. Смок Cowork: удаление задачи/фазы **ручным кликом** (CDP морозит `confirm`); фаза — проверить переезд задач в target; drag из «Без дат» — Chrome-смок localhost+прод-БД, вкл. only-undated fallback; под симуляцией JWT рядового участника write-UI скрыт, прямой write → `42501` (ожидаемо: UI-гейт + RLS).

## Не выходить за скоуп
Только Гант. НЕ трогать: создание фаз (только удаление), каскад дат по связям (S-SCHEDULE-1b/1c — за волной), storage-download (VISIBILITY-2), app-wide `ConfirmDialog`. Пометку "read-only" в `architecture.md` ~158 (устарела после VIEW-2) правит скилл-долг Cowork, не CC.
