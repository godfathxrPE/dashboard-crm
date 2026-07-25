# Ревью: S-GANTT-UX-2 v2 (удаление + drag «Без дат»)

**Дата:** 2026-07-18  
**Ревьюер:** Grok (верификация по коду `main` @ `0ac3189`, schema/architecture/learnings crm-architect)  
**Объект:** `_analysis/sprint-S-GANTT-UX-2.md` — v2 после ревью 6.5/10; удаление задач/фаз в Ганте + drag из «Без дат» → даты  
**Контекст:** клиентский спринт, миграций нет; VIEW-2 drag баров, S-DEPS-1, 065 visibility; RPC `delete_project_column` (032/033); `useUpdateTaskDates` + `patchTaskCaches`. Предыдущие B1–B3 из v1 закрыты в тексте v2.

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| РАЗВЕДКА перед правками | ✅ |
| Scope: клиент only, без миграций/RLS | ✅ |
| `origin/main = 0ac3189`, миграции по 065 | ✅ |
| B1 `useUpdateTaskDates()` без args | ✅ закрыт |
| B2 удаление фазы = пикер target | ✅ закрыт |
| B3 fallback-ось only-undated | ✅ закрыт |
| `canManage` из `ProjectDetail`, не `page.tsx` | ✅ |
| CSS `text-red` / `text-text-mute` | ✅ |
| Гочи (confirm/CDP, cache, loop, TZ, CASCADE, CHECK) | ✅ |
| `canManage` = UI-гейт + toast | ✅ (с оговоркой W2) |
| Пустые / only-undated фазы в UI Ганта | 🟡 |
| Absolute drop vs delta bar-drag | 🟡 |
| linkMode × undated-drag | 🟡 |

**Оценка: 8.5/10.** v2 закрыла все блокеры v1; якоря, хуки и scope сверены с живым кодом. Можно запускать в CC; ниже — предупреждения, которые не ломают основной сценарий, но стоит учесть в шагах/смоке.

**Рекомендация:** запускать в CC (желательно с правками W1–W3 в спринте или как ad-hoc в CC).

---

## Статус (живой код)

| Заход | Статус в репо |
|-------|---------------|
| `GanttTimeline.tsx` (1033 стр.), pointer drag move/resize | ✅ |
| Props: только `projectId`, `onEditTask` — **`canManage` нет** | ✅ как в спринте |
| `useUpdateTaskDates()` без args + `patchTaskCaches` | ✅ `use-tasks.ts:327` |
| `useDeleteTask()` | ✅ `use-tasks.ts:429` |
| `useDeleteColumn(projectId)` → RPC | ✅ `use-project-columns.ts:100–116` |
| Target-пикер колонки | ✅ inline `ProjectBoard.tsx:451–485` |
| Зона «Без дат» chips → только `onEditTask` | ✅ `952–969` |
| Удаление задачи/фазы в Ганте | ❌ ещё нет |
| Drag undated → даты | ❌ ещё нет |
| Bar drag / resize без `canManage` | ✅ (после 065 member видит UI write) |
| `canManage` в `ProjectDetail.tsx:248`, монтаж Ганта `866–869` | ✅ |
| `page.tsx` projects/[id] | ✅ thin wrapper → `<ProjectDetail />` |
| Sonner `Toaster` в layout + global `mutationCache.onError` | ✅ |
| 065 SELECT-only member; write tasks не расширен | ✅ |

---

## С чем согласен полностью

### 1. Контекст и разведка

- `HEAD`/`main` = `0ac3189` (`S-TEAM-VISIBILITY-1`), миграции до `065_team_visibility.sql` — совпадает.  
- `GanttTimeline.tsx` ~1033, CSS-grid + Pointer Events; `window.confirm` на ребро ~1019; `CLICK_PX = 4` (стр. 86).  
- `use-project-schedule`: swimlane = `column_id` / `category='phase'`, ids `column.id | '__none__' | '__flat__'`.  
- `date-helpers`: `mskDateKey`, UTC-полдень, `buildBuckets` / `bucketKeyOf` / `shiftDateKeyByBuckets`.  
- РАЗВЕДКА-команды дают ожидаемые якоря; ложных путей нет.

### 2. Мутации — as-is, не дублировать

| Действие | Хук (факт) | Сигнатура |
|----------|------------|-----------|
| Удалить задачу | `useDeleteTask()` | `mutate(id: string)` |
| Удалить фазу | `useDeleteColumn(projectId)` | `mutate({ id, targetId? })` → `delete_project_column` |
| Даты | `useUpdateTaskDates()` | `mutate({ id, start_date, end_date })` — **без** `projectId` |

Инвалидация: delete/dates → префикс `['tasks']`; delete column → `['project_columns', projectId]` + `['tasks']`. Drop **обязан** идти через `useUpdateTaskDates` (уже используется в Ганте: стр. 313, `onDates={updateDates.mutate}`).

### 3. Гочи — подтверждены

1. **`window.confirm`** — конвенция (Гант deps, Kanban, доска задач). CDP-freeze — валидный запрет автоскрина.  
2. **Cache-key** — только через хук дат / `patchTaskCaches`.  
3. **Measurement-loop** — дедуп `setEdges` `619–627`; для undated-drag — та же дисциплина.  
4. **TZ** — `mskDateKey` + UTC noon.  
5. **FK:** `task_dependencies` pred/succ → `ON DELETE CASCADE` (048); `parent_task_id` → `ON DELETE SET NULL` (052, migration). Клиентский cleanup не нужен.  
6. **CHECK** `tasks_dates_order_chk`: `start = end` валиден (046).  
7. **CSS:** `text-red` / `text-text-mute` — как Trash2 на доске и «Удалить связь».  
8. **Only-undated:** `model` `559–569` строится только из датированных в `visibleSwimlanes`; `buckets=[]` → таймлайн не рендерится (`741`). Fallback-ось в Task 3 обязательна — верно.

### 4. Решения v2 (закрытие блокеров v1)

- **B1:** везде `useUpdateTaskDates()` без args — совпадает с `use-tasks.ts:327` и текущим вызовом в Ганте.  
- **B2:** фаза = модалка + `<select>` target как `ProjectBoard` (не `window.confirm`); `window.confirm` — задача/ребро. RPC без target на непустой колонке падает (032/033 / learnings).  
- **B3:** `buildBuckets(today±N, zoom)` при undated && `buckets.length===0` — закрывает основной сценарий шаблона.  
- **W1–W6 v1** отражены: `ProjectDetail` для props; CSS; hover-Trash; real phase-id; `CLICK_PX`; UI-гейт + toast.

### 5. `canManage` как продуктовый write-гейт

`canManageDeliveryProject` (`project-permissions.ts:10–18`): org owner/admin **или** `owner_id`/`created_by`. Уже в `ProjectDetail:248` → board/team; в Гант **не** прокинут (`866–869`). После 065 member видит Гант, но:

- `tasks_update`: org + (admin/owner **или** assigned_to **или** created_by)  
- `tasks_delete`: org + (admin/owner **или** created_by)  
- фазы: RPC ≈ canManage  

Гейтить delete/phase/undated-drag **и** существующий bar move/resize — правильно (иначе `42501`). Формулировка «UI-гейт, не RLS-факт» — верна.

### 6. Scope и коммиты

«Только Гант; не create phase, не schedule cascade, не app-wide ConfirmDialog; architecture.md read-only — скилл-долг» — корректно (`architecture.md` ~157–158 ещё «PM-Гант read-only»). Два коммита — разумно.

### 7. Drop `start = end = день` + resize

Согласуется с CHECK и resize краёв. Бакет-ключ на week/month (Пн / 1-е) — как bar-snap VIEW-2.

---

## Блокеры (критично — исправить до запуска)

**Нет.** Все B1–B3 из ревью v1 закрыты в тексте v2; живой код подтверждает якоря.

---

## Предупреждения (желательно исправить)

### W1. Пустая / only-undated фаза: заголовка в Ганте нет

`laneRows` (`GanttTimeline.tsx:651`):

```ts
const laneRows = visibleSwimlanes.filter((sl) => sl.tasks.length > 0);
```

В swimlane попадают только задачи **со span** (или summary-from-children). Чистые undated живут в `undated`, не в `sl.tasks`. Пустые колонки и фазы «только без дат» **не рисуют** заголовок → Trash фазы недоступен.

Смок спринта: *«Пустая фаза → удаляется без пикера»* — **в текущем UI недостижим**, пока не показать пустые phase-headers.

**Правка (одно из):**

1. В смоке: пустую фазу проверять **на доске**; в Ганте — только фазы с ≥1 датированной/summary-задачей; **или**  
2. Step Task 2: при `phaseMode && canManage` рендерить заголовки **всех** real phase-id (в т.ч. `tasks.length === 0`), чтобы Trash был.

`hasTasks` для RPC: считать **все** задачи с `column_id === sl.id` (dated + undated), не только `sl.tasks` — как `getColumnTasks` на доске (`tasksByColumn`). Иначе при появлении empty/undated-only headers возможен `targetId: null` при непустой колонке → RPC error.

### W2. Двойной toast на `onError`

Global `mutationCache.onError` (`QueryProvider.tsx`) уже делает `toast.error(humanizeError(error))` для 42501 → *«Недостаточно прав…»*. Локальный `onError: () => toast.error('Не удалось…')` на `mutate` **удвоит** тост.

Паттерн проекта (deps): `meta: { silentError: true }` + свой toast **или** полагаться на global (без локального toast).  
**Правка в спринт:** «toast — через global mutationCache; локальный toast только с `meta.silentError` на хуке, **или** явный wrap без дубля». Для CC достаточно: не дублировать; достаточно global + rollback в хуке.

### W3. Absolute drop ≠ delta bar-drag

Bar move: `rawDx` / `bucketPx` → **относительный** `shiftDateKeyByBuckets`.  
Undated-drop: нужен **абсолютный** индекс:

`(clientX - gridRef.getBoundingClientRect().left) / bucketPx` → `buckets[idx].key`.

Спринт пишет «тот же расчёт, что drag-move» — идея верная (те же `bucketPx` / `gridRef`), но формула не copy-paste из `startDrag`/`onMove`. Уточнить: absolute index + clamp в `[0, buckets.length)`.

### W4. `linkMode` и undated-drag

Bar drag уже off в `linkMode`. Для chip: `onPointerDown` только при `canManage` — добавить **и** `!linkMode` (и скрыть grab-cursor), иначе link-mode ломается жестом chip.

### W5. Target-list для пикера фазы

Отдельного export-компонента нет — верно. Источник target: `useProjectColumns(projectId)` **или** real swimlanes (`id !== '__none__'/'__flat__'`, `id !== deleting`). Имена — `sl.label` / `column.name`. Не хардкодить соседа — спринт ок.

### W6. `isSummary` delete copy

Summary-бар: дети `parent_task_id → SET NULL` (052). Confirm должен назвать родителя/детей. Undated-chip summary почти не бывает (undated-parent с dated kids материализуется в лейн) — guard в основном на барах.

### W7. Architecture.md «read-only»

Устарело после VIEW-2; спринт верно выносит из scope CC. Не блокер.

---

## Пропущенные места (grep)

| Файл | Строки / якорь | Действие |
|------|----------------|----------|
| `src/components/projects/ProjectDetail.tsx` | 248 `canManage`; 866–869 `<GanttTimeline>` | `canManage={canManage}` |
| `src/components/tasks/GanttTimeline.tsx` | props 27–30; `GanttBar` 111–308; undated 952–969; header 749–752; model 559–569; `laneRows` 651 | props, delete UI, fallback buckets, undated pointer-drag, gate bar drag |
| `src/lib/hooks/use-tasks.ts` | `useUpdateTaskDates` 327; `useDeleteTask` 429 | import/use as-is |
| `src/lib/hooks/use-project-columns.ts` | `useDeleteColumn` 100–116 | фаза |
| `src/components/tasks/ProjectBoard.tsx` | dialog 451–485; `getColumnTasks` 226–229 | образец UX + подсчёт hasTasks |
| `src/lib/utils/project-permissions.ts` | `canManageDeliveryProject` | не дублировать |
| `src/app/(dashboard)/projects/[id]/page.tsx` | thin wrapper | **не** трогать |
| `src/components/layout/QueryProvider.tsx` | global toast | учесть W2 |

Ложных путей («Гант в другом файле», `useUpdateTaskDates(projectId)`) в v2 нет.

---

## Предлагаемые правки в спринт (опционально до/во время CC)

1. **W1:** смок «пустая фаза» → доска **или** step: показывать phase-headers при 0 dated; `hasTasks` = dated + undated по `column_id`.  
2. **W2:** не дублировать toast (global уже есть).  
3. **W3:** absolute `clientX → bucket index` через `gridRef`, clamp.  
4. **W4:** undated-drag off в `linkMode`.  
5. Lucide: добавить `Trash2` к импорту (`ChevronDown`/`ChevronRight` уже есть).  
6. Fallback-пад: `shiftDateKeyByBuckets(mskDateKey(new Date()), 'day', ±N)` → `buildBuckets(min, max, zoom)` — явная формула в step 1 Task 3.

---

## Чеклист crm-architect

- [x] Есть РАЗВЕДКА  
- [x] Реальные table/column/RPC (`tasks.start_date/end_date`, `delete_project_column`, CASCADE deps)  
- [x] Миграций нет / CC не apply  
- [x] Сигнатуры хуков = живой код (`useUpdateTaskDates()` без args)  
- [x] UI удаления фазы = контракт RPC target  
- [x] FK cleanup на БД, не клиент  
- [x] CSS tokens канон (`text-red` / `text-text-mute`)  
- [x] Нет `flowType: 'implicit'`  
- [x] Edge only-undated покрыт (fallback-ось)  
- [x] learnings: confirm, measurement dedupe, msk/UTC noon, 033 target RPC, canManage UI vs RLS  
- [x] schema.md / migration update — N/A (миграций нет)

---

## Чеклист перед CC

- [x] B1–B3 v1 закрыты в тексте v2  
- [ ] (опц.) W1 empty-phase smoke / headers  
- [ ] (опц.) W2 no double toast  
- [ ] (опц.) W3 absolute bucket index; W4 linkMode  
- [ ] CC: ветка `feat/gantt-ux-2`, 2 коммита как в спринте  
- [ ] `npx tsc --noEmit`; build не при живом dev  
- [ ] Смоки: confirm task; phase picker + target; only-undated fallback drop; click vs drag chip; без canManage — нет write UI; console без max update depth  
- [ ] Не apply migrations; не app-wide ConfirmDialog; не `page.tsx`

---

## Вердикт одной строкой

**v2 ready for CC:** блокеры v1 сняты, якоря и хуки совпадают с `0ac3189`; остались UX-детали (пустые фазы, toast, absolute drop, linkMode) — не стопят запуск.
