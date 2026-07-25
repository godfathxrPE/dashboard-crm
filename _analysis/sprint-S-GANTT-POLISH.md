# S-GANTT-POLISH — undo сдвига, печать, навигация

**Ветка:** `feat/gantt-polish` от `main`. Тип D2. UI-only, миграций нет.
Три задачи — три коммита, ~9 ч. Задачи независимы, **резать снизу**.

> Типы связей SS/FF/SF вынесены в отдельный спринт `_analysis/sprint-S-GANTT-DEPTYPES.md`.
> В этом спринте их нет — не подтягивать, не «заодно», не оставлять заготовок.

---

## РАЗВЕДКА — выполнить целиком до первой правки

```bash
git branch --show-current                       # ожидание: feat/gantt-polish (создать от main)
git --no-pager log --oneline -1 main            # ожидание: b4bbc83 chore(docs): спринты и ревью волны Ганта
git status --short                              # ожидание: чисто

grep -n "export function computeCascade\|export function computeCpm" src/lib/utils/gantt-schedule.ts
grep -n "proposeCascade\|const commitDates" src/components/tasks/GanttTimeline.tsx
grep -n "todayIdx" src/components/tasks/GanttTimeline.tsx
grep -n "export function useShiftTasks\|export function useUpdateTaskDates" src/lib/hooks/use-tasks.ts
grep -n "export function mskDateKey" src/lib/utils/date-helpers.ts
grep -n "html2canvas" package.json || echo NO_HTML2CANVAS
grep -n '"sonner"' package.json                 # ожидание: ^2.0.7 (cancel есть в types)
grep -n "@media print" src/app/globals.css || echo NO_PRINT_STYLES
grep -n "surface2" tailwind.config.*            # ожидание: surface2: 'var(--surface2)'
ls tests/unit/gantt-schedule.test.ts
npx tsc --noEmit && echo TSC_OK
```

**STOP-условия** — останавливаешься и пишешь, что нашёл, не адаптируя молча:

1. Нет `computeCascade` / `computeCpm` в `gantt-schedule.ts` → волна не влита, спринт не начинать.
2. `grep todayIdx` пусто → линия «сегодня» и модель бакетов изменились, Задача 3 написана
   по устаревшему коду.
3. `html2canvas` нашёлся в `package.json` → противоречит Задаче 2, сказать.
4. `@media print` уже есть в `globals.css` → печать кто-то начал, показать что там.
5. `tsc` красный **до** твоих правок.
6. В `src/` есть незакоммиченные правки.

---

## ЗАДАЧА 1 — Undo последнего сдвига дат (~3,5 ч, риск низкий)

Любой драг применяется сразу, откат — только ручной драг назад. После S-SCHEDULE-1B
цена ошибки выросла: одно подтверждение двигает десяток задач.

### Что уже есть в коде — читать до реализации

- `commitDates` (GanttTimeline.tsx ~L758) = `updateDates.mutate(v, { onError, onSuccess: proposeCascade })`.
- `proposeCascade` (~L727) **не применяет каскад молча**: тост `Сдвинуть N задач?` с
  `action: { label: 'Сдвинуть' }`, `duration: 12_000`, пересчёт shifts по свежему
  `scheduleRef` уже на клике. При `shifts.length === 0` — молчание.
- `useShiftTasks` (use-tasks.ts L396) — батч через `Promise.allSettled`,
  `meta: { silentError: true }`, тостит сам в `onSuccess`: `failed === 0` →
  `Сдвинуто задач: N`, иначе `Сдвинуто X из N — остальные отклонены (нет прав)`.
- `pluralDependent` (L371) уже в файле.

### Ruling 1 — один тост на действие, undo через `cancel`

Наивный вариант («тост успеха получает `action: Отменить`») ломается о то, что после
драга уже висит предложение каскада на 12 с. Два тоста про разное, с кнопками рядом →
пользователь жмёт «Отменить», а предложение каскада продолжает висеть и указывает на
анкор, которого уже нет.

Sonner v2 даёт на один тост **и** `action`, **и** `cancel`. Используем это:

```ts
toast(`Сдвинуть ${n} ${pluralDependent(n)}?`, {
  duration: 12_000,
  action: { label: 'Сдвинуть', onClick: () => { /* существующий каскад */ } },
  cancel: { label: 'Вернуть как было', onClick: () => undoAnchor() },
});
```

Когда зависимых нет (`shifts.length === 0`) — отдельный короткий тост (8 с) **только**
с `cancel`. Так тост на любое перемещение ровно один.

### Ruling 2 — undo только при полном успехе

`useShiftTasks` не атомарен by design (комментарий над хуком). При `failed > 0`
обратный батч попытается «вернуть» и те строки, что не менялись, и отрапортует об
отмене того, чего не было. Undo вешать **только** в ветке `failed === 0`. При частичном
отказе — существующий error-тост без кнопок.

### Ruling 3 — chip из «Без дат» под undo не попадает

`useUpdateTaskDates` типизирован как `{ id; start_date: string; end_date: string }` —
**не** nullable. Драг chip'а из «Без дат» переводит задачу из `null/null` в даты,
обратной операции этой мутацией не существует. Для undated-drag undo не предлагать
вовсе: задача видна на таймлайне, ручной возврат в «Без дат» есть в модалке.
Расширять `useUpdateTaskDates` до nullable ради краевого случая — не в этом спринте.

### Ruling 4 — после применённого каскада undo возвращает якорь И каскад

Дыра, которой не было в первой редакции: тост один, и клик по `action: Сдвинуть` его
закрывает вместе с единственной кнопкой undo. Дальше откатить нельзя ни каскад, ни
исходный драг — а это ровно основной сценарий после 1B.

Поэтому: при клике «Сдвинуть» prev якоря передаётся в батч, и тост успеха
`Сдвинуто задач: N` сам несёт `cancel: Вернуть как было`, который одним обратным
батчем возвращает **якорь + все сдвинутые**. Undo обратного батча не предлагается
(иначе кнопка «вернуть возврат» бесконечно).

### Ruling 5 — тип провода, а не `CascadeShift`

`CascadeShift` требует `deltaDays > 0` («v1 — только вперёд») и `reason`. У обратного
батча дельта отрицательная, причины нет. Поэтому `useShiftTasks` принимает более
узкий тип, которому `CascadeShift` удовлетворяет структурно — существующий вызов
компилируется без правок семантики:

```ts
export interface DateWrite { id: string; start: string; end: string }
```

### Реализация — `use-tasks.ts`

`useShiftTasks` меняет форму переменных (вызов ровно один — GanttTimeline L383/L741):

```ts
export interface ShiftTasksVars {
  shifts: DateWrite[];
  /** false — это и есть обратный батч undo: повторный undo не предлагаем */
  undoable?: boolean;
  /** строки, дописываемые в обратный батч: якорь драга писался через useUpdateTaskDates
   *  и в shifts не входит (Ruling 4) */
  undoExtra?: DateWrite[];
}
```

- `mutationFn` берёт `vars.shifts`, остальное не трогает.
- `onMutate`: **до** `patchTaskCaches` собрать `prev: DateWrite[]` — текущие
  `start_date`/`end_date` по id из кеша (`queryClient.getQueriesData<Task[]>({ queryKey: QUERY_KEY })`,
  первое попадание по id). Строки, у которых в кеше `start_date`/`end_date` пустые,
  в `prev` **не** класть — записать их обратно нечем. Вернуть `{ snapshots, prev }`.
  `snapshotTaskCaches` для этого не годится: это снимок для отката кеша, а не
  источник значений для записи в БД.
- `onSuccess(data, vars, ctx)`: при `failed === 0` и `vars.undoable !== false` и
  непустом `[...(vars.undoExtra ?? []), ...ctx.prev]` — тот же `toast.success`,
  но с `duration: 12_000` и
  `cancel: { label: 'Вернуть как было', onClick: () => mutate({ shifts: reverse, undoable: false }) }`.
  Иначе — существующий тост без кнопок. Ветка `failed > 0` не меняется вообще.
- `onError` / `onSettled` не трогать.

### Реализация — `GanttTimeline.tsx`

- Prev якоря для одиночного драга берётся из `gt.start` / `gt.end` в замыкании
  обработчика **до** вызова `commitDates`. `commitDates` получает необязательный
  второй аргумент `undo?: DateWrite`; путь undated-drag его не передаёт (Ruling 3).
- Хранить последний якорь в `useRef<DateWrite | null>`, не в state: перерисовка на
  запись undo не нужна, лишний рендер в драг-бёрсте — знакомая грабля этого файла.
- `proposeCascade(anchorId, undo?)`: тост получает `cancel`, если `undo` передан;
  внутри `action.onClick` — `shiftTasks.mutate({ shifts: fresh, undoExtra: undo ? [undo] : [] })`.
- Ветка `shifts.length === 0`: если `undo` есть — короткий тост
  `toast('Даты изменены', { duration: 8_000, cancel: { label: 'Вернуть как было', ... } })`;
  если нет — как сейчас, молчание.
- Обратный батч всегда идёт через `useShiftTasks` — оптимистик, частичный отказ и
  инвалидация уже написаны, нового кода почти нет.
- Окно undo = время жизни тоста. Горячей клавиши нет, стека нет, ref держит одно
  последнее действие. Это осознанно: undo достижим только из тоста, значит
  устаревание ref'а роли не играет.

**Смоук:** драг бара с зависимыми → «Вернуть как было» до клика «Сдвинуть»; драг →
«Сдвинуть» → «Вернуть как было» (проверить, что якорь тоже вернулся); драг задачи без
зависимых; драг chip'а из «Без дат» (кнопки undo быть не должно); драг под ролью без
прав (частичный отказ — кнопки undo быть не должно).

---

## ЗАДАЧА 2 — Печать Ганта (~3 ч, риск низкий)

### `window.print()` — единственный путь, html2canvas запрещён

`html2canvas` в `package.json` отсутствует. Правило репозитория: новые зависимости —
только с явного разрешения. Отдельно: html2canvas плохо работает с `color-mix()` и
современными цветовыми функциями, а темы проекта построены на CSS-переменных — риск
снимка в неправильных цветах реален и вылезет только на прогоне. `npm i html2canvas`
**не делать**. Понадобится PNG — отдельная задача с отдельным «да».

### Ruling 1 — печатается документ, а не контейнер

`window.print()` печатает всю страницу вместе с сайдбаром и шапкой. Без явного
правила на выходе будет скриншот приложения. Механика:

- Корню Ганта — `data-print-root`, тулбару/фильтрам/тумблеру крит-пути/селекту
  базового плана — `data-print-hide`, скролл-контейнеру (`div.flex-1.overflow-x-auto`,
  ~L1108) — `data-print-scroll`.
- Кнопка «Печать» вешает класс `printing-gantt` на `document.documentElement`, зовёт
  `window.print()`, снимает класс в обработчике `afterprint` (**не** сразу после
  вызова: в части браузеров `print()` возвращается до отрисовки).
- Прятать через `visibility`, не `display: none` — `display: none` на предках рвёт
  раскладку абсолютных оверлеев (стрелки зависимостей, today-линия).

### Ruling 2 — светлая тема на печати через переопределение переменных

Темы — классы на `documentElement` (`t-aura`, `t-fuji`, …), значения в CSS-переменных.
Печатать тёмную тему нельзя (тонер + нечитаемо). Форсим светлые значения **переменных**,
а не `color: black` на элементах: селектор `html[class]` (специфичность 0,1,1) бьёт
`.t-aura` (0,1,0), поэтому переопределение работает для всех тем разом.

Блок кладётся в конец `src/app/globals.css` с секционным комментарием, как остальные:

```css
/* ═══ S-GANTT-POLISH: печать Ганта (window.print) ═══ */
@page { size: landscape; margin: 10mm; }

@media print {
  /* светлая палитра поверх любой темы: значения — из блока Claude (default, light) */
  html[class] {
    --bg: #f5f4ef; --surface: #ffffff; --surface2: #f0efe9; --surface3: #e5e3dc;
    --border: #e5e3dc; --border2: #d4d2ca;
    --text: #1a1916; --text-dim: #6b6860; --text-mute: #6f6d68;
    --accent: #b5622a; --accent-l: rgba(181,98,42,0.08);
  }
  html.printing-gantt body * { visibility: hidden; }
  html.printing-gantt [data-print-root],
  html.printing-gantt [data-print-root] * { visibility: visible; }
  html.printing-gantt [data-print-root] {
    position: absolute; left: 0; top: 0; width: 100%;
  }
  html.printing-gantt [data-print-hide] { display: none; }
  html.printing-gantt [data-print-scroll] { overflow: visible !important; }
}
```

Значения переменных копируются из блока `:root` (Claude, light) в `globals.css` —
сверить построчно, не выдумывать. Хардкод-hex допустим **только** внутри этого
print-блока (это и есть определение палитры); grep-проверка на hex в `src/components`
остаётся строгой.

### Ruling 3 — многостраничность принимается, а не лечится

Длинный горизонт в зуме `day` разъедется на несколько листов. Масштабирование
(`transform: scale`) ломает выравнивание SVG-стрелок с сеткой — не делать. Вместо
этого: `title` у кнопки — «Печать: для широкого проекта выберите зум «Месяц»».

**Смоук:** Chrome → «Печать» → предпросмотр в PDF, темы aura + fuji, зумы day / week /
month. Проверить: сайдбара нет, тулбара нет, горизонт не обрезан по правому краю,
стрелки на месте, фон белый.

---

## ЗАДАЧА 3 — Навигация и читаемость (~2,5 ч, риск низкий)

### Линия «сегодня» уже в коде — заново не писать

`GanttTimeline.tsx` L1190–1194, оверлей поверх шапки и рядов:

```tsx
{todayIdx !== -1 && (
  <div className="pointer-events-none absolute inset-0 grid" style={gridCols}>
    <div style={{ gridColumn: `${todayIdx + 1}` }} className="border-l border-accent" />
  </div>
)}
```

`todayIdx` считается внутри `model` как `bucketIndexOf(mskDateKey(new Date()), zoom, buckets)`.
`mskDateKey` живёт в `src/lib/utils/date-helpers.ts` (L88); в `gantt-schedule.ts`
MSK-хелпера нет и второй заводить не надо. Новый расчёт текущей даты не писать.

Доводка линии (z-index / толщина) — **только** если смоук покажет, что она уходит под
бары или теряется на сетке. Видна нормально — не трогать.

### Что действительно новое

**Кнопка «Сегодня» + автоскролл.** Сейчас таймлайн открывается на начале горизонта,
на длинном проекте это пустое поле.

- Кнопка в `controls`, стиль как у соседей (`rounded-lg border border-border px-2.5 py-1
  text-xs font-medium text-text-mute`). При `todayIdx === -1` — `disabled` с
  `title="Сегодня вне горизонта проекта"`, а не скролл в никуда.
- Скролл: ref на div today-колонки (тот, что с `gridColumn`), вызов
  `scrollIntoView({ inline: 'center', block: 'nearest' })`. `block: 'nearest'`
  обязательно — иначе уедет вертикальный скролл всей страницы.
- Автоскролл — **один раз**, флаг в `useRef<boolean>`, эффект срабатывает при первом
  рендере, когда `buckets.length > 0 && todayIdx !== -1`. Не на каждое изменение
  `model`, иначе позиция будет уезжать после каждого драга и каждого переключения фильтра.

**Затенение выходных, только `zoom === 'day'`.**

- Индексы считать в отдельном `useMemo` от `buckets` и `zoom`; при других зумах —
  пустой массив (в неделе/месяце выходные внутри бакета, красить нечего).
- День недели из ключа бакета по конвенции проекта — UTC-полдень:
  `new Date(key + 'T12:00:00Z').getUTCDay()`, выходные = 0 и 6. `new Date(key)`
  напрямую не использовать.
- Отрисовка — такой же `pointer-events-none absolute inset-0 grid` оверлей с
  `bg-surface2`, **в JSX выше блока today-линии**: они лежат в одном стеке, и заливка
  должна быть под линией, а не над ней.
- Это **не** производственный календарь: праздники РФ вне скоупа, переносы вне скоупа.

**Смоук:** темы aura + fuji, зумы day / week / month; проект, где сегодня вне
горизонта (кнопка disabled); переключение зума после автоскролла (позиция не должна
скакать).

---

## VERIFY / коммиты

```bash
npx tsc --noEmit                                     # 0
npx eslint src/lib/hooks src/components/tasks src/app  # 0 ошибок (scoped, НЕ npm run lint —
                                                     # по репо 16 пред-существующих ошибок в чужих файлах)
npm test                                             # регресс, полный прогон
grep -rn ": any" src/components/tasks src/lib/hooks   # пусто
grep -rEn "#[0-9a-fA-F]{6}|oklch\(" src/components/tasks  # пусто — только токены темы
git --no-pager diff --stat
```

**Новых юнит-тестов в этом спринте нет, и это осознанно.** Undo живёт в
`onSuccess`/`onMutate` React Query, печать — в CSS и `window.print()`, автоскролл — в
`scrollIntoView`; всё три требуют jsdom-моков, которые стоят дороже покрываемой
логики. Единственный кандидат — сборка обратного батча — не выделен в чистую функцию,
и выделять её ради теста в этом спринте не надо. `npm test` гоняется как регресс.

Тесты кладутся **только** в `tests/unit/*.test.ts(x)`: `vitest.config.ts` содержит
`include: ['tests/unit/**/*.test.ts', ...]`, файл под `src/` не запустится и даст
exit 0 при нуле кейсов — ложная зелень. `include` не менять.

Коммиты conventional, **одна задача — один коммит**:

```
feat(gantt): undo последнего сдвига дат
feat(gantt): печать таймлайна через window.print
feat(gantt): кнопка «Сегодня», автоскролл и затенение выходных
```

**Не пушить.** Отчёт — в чат: что изменилось построчно, вывод tsc/eslint/тестов,
и явно — что показал смоук печати (какие темы и зумы прогнаны).

---

## Чего в этом спринте нет — и почему

**`window.confirm` не заменяем.** Два вызова в `GanttTimeline.tsx` (L440 удаление
задачи, L1455 удаление связи) блокируют браузерные смоуки из Cowork, и соблазн
заменить их здесь есть. Не в этом спринте: в проекте нет ни `AlertDialog`, ни radix —
`src/components/ui/` весь рукописный. Значит это либо новая зависимость (нужно
отдельное «да»), либо своя модалка с фокус-ловушкой и Esc. Плюс `window.confirm`
объявлен конвенцией проекта (комментарий L433) и живёт не только здесь — замена в
одном файле создаёт расхождение. Отдельная задача, остаётся в хвостах.

**SS/FF/SF** — `_analysis/sprint-S-GANTT-DEPTYPES.md`, отдельный PR.

---

## Итог

| Задача | Трудоёмкость | Риск |
|---|---|---|
| 1. Undo сдвига | ~3,5 ч | низкий |
| 2. Печать | ~3 ч | низкий |
| 3. Навигация | ~2,5 ч | низкий |

Итого ~9 ч, три независимых коммита, ноль миграций, ноль новых зависимостей.
