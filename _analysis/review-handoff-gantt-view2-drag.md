# Ревью: handoff-gantt-view2-drag (S-GANTT-VIEW-2)

**Дата:** 2026-07-16  
**Ревьюер:** Grok (верификация по коду `main`, roadmap §9.3, VIEW-1 `GanttTimeline.tsx`, `use-tasks.ts`)  
**Объект:** `_analysis/handoff-gantt-view2-drag.md` — drag-to-resize/move на Гантте (только drag из §9.3)  
**Контекст:** VIEW-1 (§9.2 read-only) реализован; миграция 046 (`tasks.start_date`/`end_date` + CHECK); **VIEW-2 в коде ещё не начат**

---

## Вердикт

| Аспект | Оценка |
|--------|--------|
| Диагноз cache-key mismatch (board vs `['tasks']`) | ✅ Критично верно |
| Scope: только drag, без deps/critical path | ✅ Согласовано с §9.3 |
| Pointer Events вместо @dnd-kit для continuous drag | ✅ |
| `shiftDateKeyByBuckets` + UTC-полдень (как VIEW-1) | ✅ |
| Материализация deadline-only → KPI §11.1 | ✅ Продуктово обосновано |
| Click-vs-drag порог + регресс VIEW-1 | ✅ |
| РАЗВЕДКА vs живой `GanttTimeline` / `use-tasks` | ✅ |
| Путь к файлу в Integration | 🟡 `components/tasks/`, не корень |
| Payload материализации: `gt.start`/`gt.end` vs `task.*` | 🟡 Явно не зафиксирован |
| Tooltip + pointer drag на одном элементе | 🟡 Нужна строка в HOW |
| `noonMs`/`keyOfMs` — private в `date-helpers` | 🟡 Экспорт не специфицирован |

**Оценка: 9.5/10.** Handoff — сильный техспринт: главная грабля (кэш) названа первой, решение (`useUpdateTaskDates`) и взаимодействие (native pointer + snap) согласуются со спайком и живым VIEW-1. **Можно отдавать в Claude Code** с 3–4 строками уточнений в HOW.

---

## Статус

| Заход | Статус в репо |
|-------|---------------|
| VIEW-1 (zoom, swimlane, milestone, today, filter, tooltip) | ✅ `src/components/tasks/GanttTimeline.tsx` |
| VIEW-2 (drag move/resize) | ❌ нет `useUpdateTaskDates`, `shiftDateKeyByBuckets`, pointer-хендлеров |
| §9.3 FS-зависимости / critical path | ⏳ отложено → S-DEPS-1 (handoff верно) |

---

## С чем согласен полностью

### 1. Главная грабля — подтверждена кодом

Цепочка данных Ганта:

```
GanttTimeline → useProjectSchedule → useProjectBoard(projectId)
  queryKey: ['tasks', 'board', projectId]
```

`useUpdateTask` (`use-tasks.ts:253–259`) в `onMutate` патчит **только** `QUERY_KEY = ['tasks']`.

Итог без отдельной мутации: оптимистик на Ганте не сработает → бар «отскочит» назад до `invalidateQueries(['tasks'])` (prefix зацепит board). Handoff правильно ставит **`useUpdateTaskDates(projectId)`** с патчем **обоих** ключей — это must, не nice-to-have.

Прецедент board-only optimistic уже есть в `useMoveTask` (`use-tasks.ts:125–134`), но для Ганта недостаточен: нужен и board, и глобальный `['tasks']` (Today, таймлайны).

### 2. Scope §9.3 — корректно сужен

Roadmap §9.3 включает FS-зависимости, critical path и drag. Handoff берёт **только drag** и явно отсылает deps → **S-DEPS-1**. Не конфликтует с §9.2 (read-only v1 закрыт).

WHY привязан к KPI §11.1 («% delivery с заполненными датами» ~0%) — уместно; материализация deadline-only при первом drag логично кормит метрику.

### 3. РАЗВЕДКА vs VIEW-1

| Якорь handoff | Факт в коде |
|---------------|-------------|
| Бары/ромбы — `<button onClick={onEditTask}>` | `GanttTimeline.tsx:210–230` |
| Tooltip fixed + mouse handlers | `209–227`, поповер `271–280` |
| Zoom day/week/month + `minmax(28px, 1fr)` | `27–31`, `95`, `181` |
| Split-layout (labels вне scroll) | `152–178` |
| `effectiveSpan` + deadline fallback | `use-project-schedule.ts:30–36` |
| `undated` — чипсы, не на оси | `251–267` |
| CHECK `tasks_dates_order_chk` | `046_gantt_dates_on_tasks.sql:7–8` |
| Таб «Гант» в ProjectDetail | `ProjectDetail.tsx:768, 791–795` |
| TaskModal уже пишет `start_date`/`end_date` | `TaskModal.tsx:248–257` |

### 4. Техника drag — согласована со спайком

- **@dnd-kit** в `package.json` — для дискретного reorder (Kanban), не для continuous resize по оси дат. Handoff: native Pointer Events — верно (`review-spike-gantt-lib-vs-custom.md`).
- **Snap через бакеты**, не «пиксели → дата» — согласовано с `bucketKeyOf` / `buildBuckets` (`date-helpers.ts`).
- **Живой фидбэк через `transform`**, commit на `pointerup` — разумно (не пересчитывать `gridColumn` каждый кадр).
- **Клэмп `start ≤ end` на клиенте** до мутации — обязателен (не полагаться на 23514 + откат как UX resize).

### 5. `shiftDateKeyByBuckets` — правильное место и математика

`noonMs` / `GANTT_DAY_MS` / month через `setUTCMonth` уже в `date-helpers.ts` (строки 32–56) с тем же UTC-полднем, что VIEW-1. Новый хелпер рядом с `nextBucketKey` — логично.

Week: `±n×7` дней сохраняет день недели. Month: грубый шаг — handoff честно помечает как «на вскидку» для планёрки.

### 6. Инвалидации `onSettled`

Совпадает с `useUpdateTask`: `['tasks']`, `['dashboard-stats']`, `['timeline']`. Исключение `['projects']` / `['delivery-gate']` — верно (даты не трогают progress/gate, в отличие от `lane`/`column_id`).

### 7. Edge cases и смок

Сценарии (клэмп, 0-bucket → click, milestone, undated, month 31-е, concurrent) — покрывают реальные риски. Смок Cowork (6 пунктов + проверка БД для deadline-only) — достаточен для гейта.

---

## Рекомендации (не блокеры)

### 1. Явно зафиксировать payload материализации

Для deadline-only задачи `task.start_date`/`task.end_date` в БД = `null`, но `GanttTask.start`/`end` из `effectiveSpan` заполнены.

**Добавить в HOW:**

> При мутации брать базовые даты из **`gt.start` / `gt.end`** (текущий span на экране), не из `task.start_date`/`task.end_date`. После первого drag писать оба поля явно.

Иначе CC может отправить `{ start_date: null, end_date: null }`.

### 2. Tooltip vs drag

Сейчас на баре/ромбе висят `onMouseEnter` / `onMouseMove` / `onMouseLeave` (`GanttTimeline.tsx:213–227`).

**Добавить в HOW:**

- на `pointerdown` → `setTip(null)`;
- на `pointerup` после drag → **не** вызывать `onEditTask`;
- suppress `mouseenter` tooltip пока `pointerId` captured.

Иначе тултип будет «ездить» во время drag и может мелькать после отпускания.

### 3. Экспорт `noonMs` / `keyOfMs`

`shiftDateKeyByBuckets` в handoff вызывает `noonMs` и `keyOfMs` — оба **private** в `date-helpers.ts` (строки 35–39).

Варианты (одна строка в промпт):

- экспортировать `noonMs` + `keyOfMs`; или
- реализовать `shiftDateKeyByBuckets` в том же модуле без export internals.

### 4. Путь в Integration

Указать полный путь: **`src/components/tasks/GanttTimeline.tsx`** (не корневой `GanttTimeline.tsx`).

### 5. `isPending` / повторный drag

Пока `updateDates.isPending` — не начинать новый drag на том же баре (или игнорировать `pointerdown`). Одна строка, снижает гонки optimistic snapshot.

### 6. Задачи `lane === 'done'`

При фильтре «Открытые» done-баров нет. При «Все» — бары с `opacity-50` (`GanttTimeline.tsx:228`). Handoff не запрещает drag на done — ок для «перепланировать завершённое»; если продуктово нужен read-only для done — добавить `gt.task.lane === 'done' → pointer-events` или skip handlers.

### 7. Скролл во время drag

Как в review VIEW-1-E: горизонтальный scroll без движения мыши. На drag менее критично (`setPointerCapture`), но при отпускании вне видимой области — смок «бар на новом месте после scroll» не лишний.

---

## Чеклист crm-architect

- [x] РАЗВЕДКА с реальными путями и строками
- [x] Без миграций / без apply из CC
- [x] Типы `start_date`/`end_date` в `supabase.gen.ts` — есть
- [x] VIEW-1 регрессии перечислены (tooltip, click, today, filter, zoom)
- [x] Optimistic mutation — новый хук, не reuse `useUpdateTask` вслепую
- [x] `npx tsc --noEmit` — главный гейт (сейчас зелёный)
- [ ] Payload из `gt.start`/`gt.end` — **добавить в handoff**
- [ ] Tooltip suppress при drag — **добавить в handoff**

---

## Сводка для гейта Cowork (после VIEW-2)

1. `npx tsc --noEmit` — 0
2. **Дифф `useUpdateTaskDates`:** `onMutate` патчит `['tasks','board',projectId]` **и** `['tasks']`; `onError` откатывает оба
3. **Move:** длительность сохраняется; бар не прыгает назад после отпускания
4. **Resize L/R:** клэмп на границе; нет 23514 в консоли при штатном resize
5. **Milestone:** ромб двигается, `start_date = end_date`
6. **Click < ~4px** → TaskModal; drag ≥ порога → без модалки
7. **Deadline-only:** после drag в БД появились `start_date`/`end_date` (`select … from tasks where id=…`)
8. **Регресс VIEW-1:** zoom, фильтры, today-line, tooltip (hover без drag), «Без дат»
9. Zoom day/week/month — snap без off-by-one на границах недели/месяца

---

## Итог

Handoff VIEW-2 — **зрелый спринт-промпт**: правильно идентифицирует единственный архитектурный блокер (cache-key), не тащит @dnd-kit на ось дат, сохраняет математику бакетов VIEW-1 и честно отрезает deps/critical path.

**Статус исполнения на 2026-07-16:** спринт **не выполнен**. После уточнений по payload span, tooltip+pointer и export `date-helpers` — **готов к запуску в Claude Code.**