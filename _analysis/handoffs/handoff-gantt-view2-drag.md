# Claude Code — S-GANTT-VIEW-2 · Drag-to-resize/move на Гантте (§9.3, только drag)

**Режим:** /code · D2. **Стек незыблем** (Next 15 + TS strict + Tailwind + Supabase). Сверься с `crm-architect` (SKILL.md).
**Контекст:** VIEW-1 (§9.2 read-only) закрыт. Этот заход — **только drag-часть §9.3**: тянуть полосу/край → менять
`start_date`/`end_date` задачи. **НЕ в scope:** зависимости, стрелки, critical path (это отдельный S-DEPS-1), resource
histogram, baseline. **БД не трогаем** — колонки `tasks.start_date`/`end_date` (`date`, nullable) уже есть (миграция 046,
CHECK `tasks_dates_order_chk`: `end_date IS NULL OR start_date IS NULL OR end_date >= start_date`).

## WHY
KPI adoption (roadmap §11.1) «% delivery с заполненными датами задач» ~0%. Сейчас даты правятся только через
TaskModal (`<input type=date>`). Drag на Гантте — самый быстрый визуальный способ проставить/подвинуть даты на
планёрке РП. Паттерн rough-cut Gantt (Monday/gantt-task-react): bar drag = move, edge drag = resize, snap к сетке.

## ⚠️ ГЛАВНАЯ ГРАБЛЯ (cache-key mismatch — закрыть в первую очередь)
`GanttTimeline`→`useProjectSchedule`→`useProjectBoard(projectId)` читает кэш **`['tasks','board',projectId]`**.
Существующий `useUpdateTask.onMutate` оптимистично патчит **`QUERY_KEY = ['tasks']`** — ДРУГОЙ ключ. Повесишь drag на
`useUpdateTask` — полоса НЕ сдвинется оптимистично, дёрнется назад и «прыгнет» только после `invalidateQueries(['tasks'])`
(prefix-инвалидация зацепит board → рефетч). Джанк.
**Решение:** новая мутация **`useUpdateTaskDates(projectId)`** — `onMutate` патчит **оба** ключа
(`['tasks','board',projectId]` и `['tasks']`), `onError` откат обоих, `onSettled` invalidate `['tasks']` +
`['dashboard-stats']`,`['timeline']` (как в `useUpdateTask`; `['projects']`/`['delivery-gate']` НЕ нужны — даты не
влияют на progress/gate). `mutationFn`: `supabase.from('tasks').update({start_date,end_date}).eq('id',id).select().single()`.

## WHAT (scope, строго)
1. **Move (drag тела бара):** сдвиг `start_date` И `end_date` на одинаковую бакет-дельту (длительность сохраняется).
2. **Resize left (левый край):** меняет только `start_date`; клэмп `start ≤ end` (упрёшься в end — start=end).
3. **Resize right (правый край):** только `end_date`; клэмп `end ≥ start`.
4. **Milestone (ромб):** drag двигает веху → `start_date = end_date = newKey` (span у вехи start==end).
5. **Snap к бакету** текущего zoom. Дельта считается в датах через новый хелпер `shiftDateKeyByBuckets` (см. HOW),
   НЕ прибавлением пикселей к дате. day → ±N дней, week → ±N×7 дней (сохраняет день недели), month → ±N календарных
   месяцев (день месяца сохраняется). Month-zoom — грубо (шаг в целый месяц), это ОК для «на вскидку», оставить включённым.
6. **Материализация deadline-only:** если бар позиционирован только из `deadline` (нет явных `start_date`/`end_date`),
   первый же drag ПИШЕТ явные `start_date`/`end_date` (из текущего span). Это фича, не баг — конвертирует «только
   дедлайн» в план (кормит KPI). **Дефолт: включено.** Если Олег против — заменить на «drag только когда есть явные даты».
7. **Click-vs-drag:** сохранить `onClick → onEditTask`. Порог: смещение < ~4px = клик (открыть модалку), ≥ порог = drag.
   Не ломать существующие tooltip/aria.

## HOW
- **Pixel→bucket:** ширину бакета мерить в рантайме — `ref` на грид-контейнер таймлайна (шапка бакетов или body),
  `bucketPx = grid.getBoundingClientRect().width / buckets.length`, снять на `pointerdown` (сетка `minmax(28px,1fr)` —
  ширина динамическая, хардкодить нельзя).
- **Взаимодействие — нативные Pointer Events, БЕЗ @dnd-kit.** @dnd-kit — для дискретного reorder (Kanban), не для
  continuous edge-resize со снапом по оси. Это согласуется с решением спайка «растим кастомный Гант».
  `onPointerDown` на баре/крае → `setPointerCapture` → трекать `clientX`; во время движения — **живой фидбэк через
  CSS `transform: translateX()`/ширину на самом баре** (НЕ пересчитывать `gridColumn` покадрово); на `pointerup`:
  `bucketDelta = Math.round(dx / bucketPx)`, если `!== 0` → `updateDates.mutate(...)`, сбросить transform.
- **Зоны краёв:** по ~6px слева/справа внутри бара = resize-хендлы (курсор `ew-resize`), центр = move (курсор `grab`).
  На узких барах (1 бакет) — приоритет move (или resize по всей ширине, реши по месту — узкий бар резать некуда).
- **Новый хелпер `shiftDateKeyByBuckets(dateKey, zoom, n)` в `date-helpers.ts`** (рядом с `nextBucketKey`, та же
  UTC-полдень математика):
  ```ts
  export function shiftDateKeyByBuckets(dateKey: string, zoom: GanttZoom, n: number): string {
    if (zoom === 'day')  return keyOfMs(noonMs(dateKey) + n * GANTT_DAY_MS);
    if (zoom === 'week') return keyOfMs(noonMs(dateKey) + n * 7 * GANTT_DAY_MS);
    const d = new Date(noonMs(dateKey)); d.setUTCMonth(d.getUTCMonth() + n);
    return d.toISOString().slice(0, 10); // сохраняет день месяца (clamp末 у setUTCMonth штатный)
  }
  ```
  (`noonMs`/`keyOfMs`/`GANTT_DAY_MS` уже есть в файле — при необходимости расширить export или держать хелпер в том же модуле.)
- **Расчёт новых дат:** move → `start' = shift(start, zoom, Δ)`, `end' = shift(end, zoom, Δ)`. resize-left →
  `start' = shift(start, zoom, Δ)`, клэмп `if (start' > end) start' = end`. resize-right симметрично. Пишем ISO
  `YYYY-MM-DD` прямо в `date`-колонку (без времени).

## Integration
- `GanttTimeline.tsx`: заменить `<button onClick=onEditTask>` бара/ромба на элемент с pointer-хендлерами +
  edge-зонами. Сохранить `barClass`, tooltip (`setTip`), `today`-оверлей, фильтры, zoom, левую колонку, «Без дат».
  Инстанс `const updateDates = useUpdateTaskDates(projectId)`.
- `use-tasks.ts`: добавить `useUpdateTaskDates(projectId)` рядом с `useUpdateTask`.
- `date-helpers.ts`: `shiftDateKeyByBuckets`.
- `ProjectDetail`/таб «Гант» — без изменений (тот же компонент).
- `useRealtimeSync('tasks')` (в `useProjectBoard`) эхнёт апдейт — норм, оптимистик уже показал результат.

## Edge cases / тесты (сценарии, без полного suite)
- Resize left за правый край → клэмп start=end (не нарушить CHECK `tasks_dates_order_chk`); при нарушении — сервер
  вернёт 23514, `onError` откатит оба кэша, бар вернётся. Проверить, что клэмп не даёт долететь до сервера с end<start.
- Drag на 0 бакетов (мелкое движение) → трактовать как click (порог) → `onEditTask`, мутации нет.
- Deadline-only бар: первый drag материализует `start_date`/`end_date`; повторный — двигает их.
- Milestone: диагональный ромб, drag по X меняет одну дату (start=end).
- `undated` (ни start/end/deadline) — на таймлайне нет, остаются чипсами; не draggable.
- Month-zoom: шаг в целый месяц; убедиться, что `setUTCMonth` на 31-х числах не улетает (штатный roll — задокуй в комменте).
- Concurrent/realtime: два дропа подряд — оптимистик по одному id, откат по одному; snapshot берётся per-mutate.
- RLS: без изменений (апдейт tasks уже под политикой); проверок ролей не добавляем.
- a11y: drag — pointer-only; клавиатурный путь редактирования дат остаётся через TaskModal (`onEditTask`). Курсоры
  `grab`/`ew-resize`; `aria-label` бара сохранить.

## ПРОВЕРКА
```bash
cd ~/Downloads/dashboard-crm
npx tsc --noEmit        # 0 — главный гейт
# нативный build на Маке (dev остановить; мост SWC arm64 не тянет)
```
Смок (после деплоя, Cowork через Chrome): открыть delivery-проект → таб «Гант». (1) Потянуть тело бара → сдвиг обеих
дат, длительность та же; отпустить — бар на новом месте, не прыгает назад. (2) Потянуть левый/правый край → resize,
клэмп на границе. (3) Milestone-ромб двигается. (4) Мелкий клик по бару → открывается TaskModal (не drag). (5) Zoom
день/неделя/месяц — снап корректный, без off-by-one на границах. (6) deadline-only задача: drag проставил даты
(проверить в БД `select id,start_date,end_date from tasks where id=…`). Консоль чистая, нет 23514 при штатном drag.

## КОММИТ / ПУШ / ДЕПЛОЙ
```bash
git add -A && git commit -m "feat(gantt): drag-to-resize/move баров — правка start_date/end_date (S-GANTT-VIEW-2)"
git push origin main   # после нативного build
```
Дождаться Netlify Published + смок → доложить Cowork.

## Verification Labels (ожидаемые в ответе CC)
```
Type Safety:            [PASS если tsc 0]
RLS Coverage:           NOT_APPLICABLE (нет изменений схемы/политик; апдейт под существующей RLS)
Backward Compatibility: [PASS — read-only Гант остаётся рабочим, drag аддитивен]
Runtime Tested:         NOT_VERIFIED (смок делает Cowork)
Regional Availability:  NOT_APPLICABLE (нет сторонних сервисов; @dnd-kit НЕ вводим)
```

## Заметки гейта (Cowork)
- Гейт по факту: `useUpdateTaskDates` патчит ИМЕННО board-ключ (иначе janky snap-back) — проверить в диффе onMutate.
- Гейтить, что drag не сломал click→edit, tooltip, today-line, фильтры (регресс VIEW-1).
- CHECK-клэмп на клиенте обязателен (не полагаться только на серверный 23514 + откат — это плохой UX на каждый resize).
- Материализация deadline-only — продуктовое решение; если Олег против, откат на «drag только при явных датах».
- Следующий Gantt-заход — **S-DEPS-1** (task_dependencies + стрелки, /architect: новая сущность + RLS + DAG).
