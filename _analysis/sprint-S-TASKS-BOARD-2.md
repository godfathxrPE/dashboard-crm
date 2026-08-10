# Claude Code Prompt — Sprint S-TASKS-BOARD-2: доработка доски по итогам гейта

Три задачи по доске из S-TASKS-BOARD-1 + один дефект, найденный на гейте.
Миграций нет. **Два коммита**: A — задачи 1–3 (мелкие, независимые), B — задача 4
(клавиатура). Если B буксует — A уже чистый и мержится сам.

Ветка: `feat/tasks-board-polish` **от main, если `feat/tasks-board-view` уже
смёржена**; если ещё нет — от `feat/tasks-board-view`. Проверить перед стартом,
не гадать.

---

## РАЗВЕДКА

```bash
cd ~/Downloads/dashboard-crm

# 0. От чего ветвиться
git log --oneline -1 main | cat
git branch --contains 672a787 | cat        # смёржена ли доска в main

# 1. Файлы доски на месте
ls -la src/components/tasks/{TaskBoard,BoardColumn,BoardCard}.tsx

# 2. Точки правки задач 1–3
grep -n "handleDragEnd" -A 22 src/components/tasks/TaskBoard.tsx
grep -n "dayCaption\|caption =" -B 2 -A 10 src/components/tasks/BoardColumn.tsx
grep -n "overdueBy\|daysOverdue\|hasMeta" src/components/tasks/BoardCard.tsx

# 3. Что уже есть в date-helpers (свой форматтер не плодить)
grep -n "^export function" src/lib/utils/date-helpers.ts | grep -i "msk"

# 4. Шаблон клавиатуры, который повторяем по конвенциям (НЕ правим этот файл)
sed -n '1,60p' src/lib/hooks/use-keyboard-nav.ts

# 5. Чем гейтится клавиатура: ui-store + modalOpen
grep -n "activeModal\|commandPaletteOpen" src/lib/stores/ui-store.ts | head
grep -n "modalOpen" src/components/tasks/TasksView.tsx

# 6. Тесты живут только здесь
grep -n "include" vitest.config.ts
```

---

# КОММИТ A — задачи 1–3

## ЗАДАЧА 1 — протухший `now` при записи дедлайна

Файл: **`src/components/tasks/TaskBoard.tsx`**, `handleDragEnd`.

**Дефект.** `now` приходит из `TasksView` как `useMemo(() => new Date(), [tasks])`.
React Query делает структурное разделение: если рефетч вернул те же данные, ссылка
на массив **не меняется** — значит `useMemo` не пересчитывается, и в долгоживущей
вкладке `now` живёт со вчера. Для Списка это косметика (бакет подписан неверно), для
Доски — **запись**: дроп в «Сегодня» со вчерашним `now` персистит вчерашний конец
дня, и задача мгновенно становится просроченной. Молча, без ошибки.

**Фикс — читать часы в момент действия, а не в момент рендера:**

```ts
const handleDragEnd = useCallback((event: DragEndEvent) => {
  setActiveTask(null);
  const { active, over } = event;
  if (!over) return;

  const overId = String(over.id);
  if (!isBucket(overId)) return;

  const task = tasks.find((t) => t.id === active.id);
  if (!task) return;

  // Дроп — ДЕЙСТВИЕ, а не рендер: часы читаем здесь, а не берём `now` пропом.
  // `now` из TasksView пересчитывается только при смене ССЫЛКИ на tasks, а
  // React Query её сохраняет, когда данные не изменились, — во вкладке, открытой
  // через полночь, проп указывает на вчера, и в БД уехал бы вчерашний конец дня.
  // Правило «никаких Date.now() в домене» не нарушено: домен по-прежнему
  // получает «сейчас» аргументом, просто его читает тот, кто совершает действие.
  const at = new Date();

  if (taskDateBucket(task, at) === overId) return;
  const drop = deadlineForBucket(overId, at);
  if (drop === null) return;

  updateTask.mutate({ id: task.id, deadline: drop.deadline });
}, [tasks, updateTask]);
```

`now` из зависимостей `useCallback` убрать — он больше не читается.

**Следствие, которое НЕ баг:** если сутки сменились при открытой вкладке, карточка
после дропа встанет не в ту колонку, куда её бросили. Это верно — день реально
другой; следующий рефетч перерисует доску целиком. Чинить «подгонкой под ожидание»
нельзя: правильна запись, а не оптический результат.

**`now` пропом НЕ трогать** ни в `TasksView`, ни в Списке. Пересчёт оси на таймере —
другой разговор и другой blast radius; здесь чиним запись, а не рендер.

## ЗАДАЧА 2 — правая мета карточки решается БАКЕТОМ, а не задачей

Файлы: **`BoardCard.tsx`**, **`BoardColumn.tsx`**, **`date-helpers.ts`**.

**Два дефекта одной природы — карточка не знает, что уже сказала шапка.**

1. В колонке «Позже» дня не видно нигде: шапка даты не называет (её там нет как
   понятия), карточка тоже. Задача с дедлайном 25 августа и 25 октября выглядят
   одинаково.
2. **Найдено на гейте:** `BoardCard` считает `daysOverdue(task, now)` без оглядки
   на бакет, а `taskDateBucket` отправляет **выполненную** задачу с прошедшим
   сроком в `later` (не в `overdue`). Значит в режиме «Выполнено» карточки в
   «Позже» горят красным «N дн.» — просрочка у того, что уже сделано.
   В Списке этого нет: `TaskStream` передаёт `isOverdue={bucket === 'overdue'}`,
   а `BoardCard` решает сам.

**Фикс — один и тот же: правую позицию меты определяет колонка.**

`BoardCard` получает новый проп `bucket: DateBucket` (у `BoardColumn` он уже есть,
прокинуть). Правая мета:

| бакет | что справа | почему |
|---|---|---|
| `overdue` | `N дн.` цветом `--danger-text` | шапка дня не называет; просрочка — главное |
| `later` | дата `25 авг` | шапка дня не называет, а у задачи он есть |
| `today` · `tomorrow` · `this_week` | ничего | день уже назван в шапке колонки |
| `no_date` | ничего | дня нет |

То есть `daysOverdue` считается **только при `bucket === 'overdue'`**. Это и
закрывает дефект 2 структурно, а не заплаткой на `lane !== 'done'`.

Форматтер — **общий, в `date-helpers.ts`**, чтобы шапка и карточка не разошлись:

```ts
/** Короткая дата по МСК: «9 авг», с `weekday` — «вс, 9 авг».
 *  Одна календарная ось на проект: и подпись колонки, и дата на карточке идут
 *  отсюда, иначе на границе суток они назовут разные дни.
 *  Intl в ru-RU отдаёт «авг.» с точкой — режем. */
export function mskDayCaption(iso: string, opts?: { weekday?: boolean }): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    ...(opts?.weekday ? { weekday: 'short' as const } : {}),
    day: 'numeric',
    month: 'short',
  })
    .format(new Date(iso))
    .replace(/\.$/, '');
}
```

Локальный `dayCaption` из `BoardColumn.tsx` **удалить**, заменить вызовом
`mskDayCaption(drop.deadline, { weekday: true })`. Карточка зовёт
`mskDayCaption(task.deadline)` без `weekday`.

Стиль даты на карточке — как у остальной меты: `ml-auto shrink-0 text-meta
tabular-nums text-text-mute`. Не акцентная: это справка, а не сигнал.

`hasMeta` пересчитать — теперь правый элемент зависит от бакета, а не от `overdueBy`.

## ЗАДАЧА 3 — тесты на задачи 1–2

Файл: **`tests/unit/task-board-axis.test.ts`** (дописать в существующий).

```ts
describe('устойчивость к протухшему now (S-TASKS-BOARD-2)', () => {
  it('вчерашний now пишет вчерашний конец дня — поэтому часы читаются при дропе', () => {
    const yesterday = new Date('2026-08-11T09:00:00Z');
    const today = new Date('2026-08-12T09:00:00Z');
    const stale = deadlineForBucket('today', yesterday)!.deadline!;
    // Документирующий тест: именно это и уехало бы в БД, если бы `now` брался
    // пропом из рендера. Проверяем ПРИЧИНУ, а не обходной путь.
    expect(taskDateBucket({ deadline: stale, lane: 'now' } as Task, today)).toBe('overdue');
    const fresh = deadlineForBucket('today', today)!.deadline!;
    expect(taskDateBucket({ deadline: fresh, lane: 'now' } as Task, today)).toBe('today');
  });
});

describe('mskDayCaption', () => {
  it('день берётся по МСК, а не по локали браузера', () => {
    // 21:30 UTC = 00:30 МСК следующих суток — граница, на которой врёт local.
    expect(mskDayCaption('2026-08-11T21:30:00.000Z')).toBe('12 авг');
  });
  it('weekday добавляет день недели и не оставляет точку', () => {
    expect(mskDayCaption('2026-08-09T09:00:00.000Z', { weekday: true })).toBe('вс, 9 авг');
  });
});
```

Импорт `mskDayCaption` из `@/lib/utils/date-helpers`.

## Проверка и коммит A

```bash
npx tsc --noEmit
npx vitest run tests/unit/task-board-axis.test.ts
npm run lint

git add src/components/tasks/TaskBoard.tsx \
        src/components/tasks/BoardCard.tsx \
        src/components/tasks/BoardColumn.tsx \
        src/lib/utils/date-helpers.ts \
        tests/unit/task-board-axis.test.ts
git commit -m "fix(tasks/board): часы при дропе, дата в «Позже», ложная просрочка у выполненных

Дедлайн писался из now, взятого в рендере: React Query сохраняет ссылку на
tasks при неизменных данных, useMemo не пересчитывается, и во вкладке через
полночь в БД уезжал вчерашний конец дня. Дроп — действие, часы читаются в нём.

Правую мету карточки теперь решает бакет, а не задача: «Позже» показывает дату
(шапка её не называет), «N дн.» считается только в «Просрочено». Побочно чинит
красную просрочку у ВЫПОЛНЕННЫХ задач — taskDateBucket кладёт их в later, а
карточка звала daysOverdue без оглядки на колонку.

Форматтер даты — общий mskDayCaption: шапка и карточка обязаны называть один день."
```

---

# КОММИТ B — задача 4: клавиатура на доске

## Почему не переиспользуем `use-keyboard-nav`

Существующий хук держит **плоскую** очередь: `activeIndex`, `Math.min(i+1,
itemCount-1)`, `ArrowUp/Down` = `j/k`. Доска двумерна. Править общий хук нельзя —
его читают `TodayView`, `TaskStream` и `DataTable`, это три экрана blast radius
ради одного нового. Делаем **свой** хук доски и повторяем в нём конвенции
(гарды `isInputFocused` / модификаторы / `ui-store`, `e.code` вместо `e.key` для
букв, G-префикс перед `d`), а не сигнатуру.

**Фокус хранится как `focusedId: string | null`, а не как координата.** Тогда он
переживает любую перестройку набора — realtime, оптимистичный дроп, смену фильтра —
и, главное, едет за карточкой при переносе клавишами. Координата вычисляется из id
на каждом рендере. Это лучше, чем `activeIndex` в старом хуке (тот сбрасывается на
любое изменение `itemCount`), но старый **не трогаем**.

## Раскладка

| клавиша | действие |
|---|---|
| `j` / ↓ | ниже по колонке (в пределах колонки, без перехода) |
| `k` / ↑ | выше по колонке |
| `h` / ← | в ближайшую **непустую** колонку слева, строка клампится |
| `l` / → | то же вправо |
| `Shift+H` | **перенести** карточку в ближайшую дроппабельную колонку слева |
| `Shift+L` | то же вправо |
| `Enter` | открыть `TaskModal` |
| `d` | готово / вернуть в работу (гард G-префикса, 600 мс) |
| `Esc` | снять фокус |

`Shift+H` из «Без даты» ведёт в «Позже» → «Эта неделя» → «Завтра» → «Сегодня»:
это и есть разбор 88 задач без мыши. Недроппабельные бакеты (`overdue`, схлопнутая
в сб/вс `this_week`) пропускаются сами — их отсеивает `deadlineForBucket === null`,
второго списка исключений не заводить.

## ЗАДАЧА 4.1 — чистая логика навигации

Файл: **`src/lib/domain/board-nav.ts`** (новый). Ни React, ни DOM, «сейчас» —
аргументом (конвенция `lib/domain`).

```ts
import { deadlineForBucket, type DateBucket } from '@/lib/utils/task-view';
import type { Task } from '@/types/entities';

export type BoardColumns = { bucket: DateBucket; tasks: Task[] }[];
export type NavDir = 'up' | 'down' | 'left' | 'right';

/** Координата карточки в наборе колонок; null — карточки в наборе нет. */
export function locate(columns: BoardColumns, id: string | null): { col: number; row: number } | null

/**
 * Куда уедет фокус. Возвращает id новой карточки либо null — «остаёмся».
 * - фокуса нет → первая карточка первой непустой колонки (для любого направления);
 * - up/down — в пределах своей колонки, БЕЗ перескока в соседнюю: на доске
 *   вертикаль принадлежит колонке, и перескок ломает пространственную модель;
 * - left/right — ближайшая НЕПУСТАЯ колонка, строка клампится к её длине.
 */
export function moveFocus(columns: BoardColumns, focusedId: string | null, dir: NavDir): string | null

/**
 * Куда уедет САМА карточка при Shift+H/L. null — переносить некуда.
 * Цель — ближайший в направлении бакет, принимающий дроп
 * (`deadlineForBucket(b, now) !== null`), отличный от текущего.
 */
export function moveTarget(
  columns: BoardColumns,
  focusedId: string | null,
  dir: 'left' | 'right',
  now: Date,
): { taskId: string; bucket: DateBucket } | null
```

Реализовать по этим контрактам. Никаких `Date.now()` внутри.

## ЗАДАЧА 4.2 — тест чистой логики

Файл: **`tests/unit/board-nav.test.ts`** (новый).

Обязательные кейсы:
- `moveFocus` без фокуса → первая карточка первой непустой колонки;
- `down` на последней строке колонки → `null` (НЕ перескок в соседнюю);
- `right` через пустую колонку → приземляется в следующую непустую;
- `right`/`left` с длинной строки на короткую колонку → клампится, а не `undefined`;
- `moveTarget('left')` из `no_date` в **среду** → `later`;
- `moveTarget('left')` из `tomorrow` в **воскресенье** → `today`, а не схлопнутая
  `this_week` (главный кейс: пропуск недроппабельного);
- `moveTarget('left')` из `today` → `null` (слева только `overdue`, он не цель);
- `moveTarget` для id, которого нет в наборе → `null`.

Опорные даты — те же `WED` / `SUN`, что в `task-board-axis.test.ts`.

## ЗАДАЧА 4.3 — хук

Файл: **`src/lib/hooks/use-board-nav.ts`** (новый).

Сигнатура:
```ts
useBoardNav({
  columns: BoardColumns,
  onSelect: (task: Task) => void,
  onAction?: (task: Task) => void,        // d
  onMove?: (taskId: string, bucket: DateBucket) => void,  // Shift+H/L
  isActive?: () => boolean,
  containerRef?: RefObject<HTMLElement | null>,
  enabled?: boolean,
}): { focusedId: string | null }
```

Требования, каждое — с причиной:
- Гарды один в один со старым хуком: `isInputFocused()`, отсечка
  `metaKey/ctrlKey/altKey`, `activeModal !== null || commandPaletteOpen` из
  `useUiStore.getState()`, затем `isActive()`.
- Буквы — через `e.code` (`KeyJ`/`KeyK`/`KeyH`/`KeyL`/`KeyD`): не зависит от
  раскладки, у владельца ru/en.
- `Shift+H/L` — `e.code === 'KeyH' && e.shiftKey`. Проверять `shiftKey` **до**
  ветки обычного `h`, иначе Shift+H отработает как навигация.
- Колбэки — через `useRef`, как в старом хуке: обработчик регистрируется в
  `useEffect` и иначе замкнёт устаревшие ссылки (stale closure, learnings).
- `columns` в обработчике читать **тоже из ref**: набор меняется на каждый
  оптимистичный апдейт, а слушатель перевешивать на каждое изменение нельзя.
- Часы для `onMove` читать **в момент нажатия** (`new Date()`), не пропом —
  ровно та же причина, что в задаче 1.
- `scrollIntoView({ block: 'nearest', inline: 'nearest' })` по
  `[data-task-id="…"]` — `inline` обязателен, доска ещё и горизонтальна.
  `prefers-reduced-motion` уважать, как в старом хуке.
- Если `focusedId` пропал из набора (задачу удалили/отфильтровали) — сбросить в
  `null`, а не держать мёртвую ссылку.

## ЗАДАЧА 4.4 — подключение

**`TaskBoard.tsx`:**
- новый проп `modalOpen?: boolean`, прокинуть из `TasksView`
  (`TaskModal` сидит на `shared/Modal.tsx`, а не в `ui-store` — автогейт
  `activeModal` его не видит; это ровно та грабля, что уже описана для
  `TaskStream`);
- `useBoardNav({ columns, onSelect: onEdit, onAction: canEdit ? toggleDone : undefined,
  onMove: canEdit ? (id, bucket) => updateTask.mutate({ id, deadline:
  deadlineForBucket(bucket, new Date())!.deadline }) : undefined,
  isActive: () => !modalOpen, containerRef, enabled: columns.some(c => c.tasks.length) })`;
- `focusedId` пробросить в `BoardColumn` → `BoardCard`.

**`BoardCard.tsx`:**
- проп `focused?: boolean`;
- `data-task-id={task.id}` — по нему хук делает `scrollIntoView`;
- `aria-selected={focused}` и визуал фокуса классом `kbd-focus-row`
  (существующий, тот же, что у `TaskStreamRow` — не изобретать второй);
- ⚠️ **`tabIndex` карточке НЕ добавлять.** Карточка — `useDraggable`, и с реальным
  DOM-фокусом `KeyboardSensor` из dnd-kit перехватит `Space` и стрелки на себя
  (подъём и перемещение). Наш фокус визуальный, как в `TaskStream`, — конфликта
  нет ровно поэтому. Отсюда же известный долг: навигация не объявлена
  скрин-ридеру. Это конвенция всего проекта, а не регресс доски; полный a11y —
  `a11y-auditor`, отдельный эпик.

## Проверка и коммит B

```bash
npx tsc --noEmit
npx vitest run tests/unit/board-nav.test.ts tests/unit/task-board-axis.test.ts
npm run lint
```

**Рантайм-смок обязателен** — клавиатура ровно тот класс, который `tsc` и тесты не
видят (прецедент S-TASKS-BOARD-1: `disabled` у droppable). Проверить в `t-minimal`:

1. `j/k` ходит внутри колонки и **не перескакивает** в соседнюю на последней строке.
2. `h/l` перескакивает пустые колонки, строка клампится (встать на 40-ю карточку
   «Без даты» → `h` в колонку из 3 карточек → фокус на 3-й, не пропал).
3. `Shift+H` из «Без даты» четырьмя нажатиями доводит до «Сегодня», в Network
   ровно 4 PATCH, фокус всё время на той же карточке.
4. Сегодня не вс/сб → «Эта неделя» участвует; **проверить и в воскресенье**
   (перевести системную дату либо довериться тесту 4.2 — сказать в отчёте, что
   именно сделано).
5. `Enter` открывает `TaskModal`; внутри модалки `j/k/h/l` **не двигают** доску.
6. Фокус в поиске — `j` печатает букву, а не двигает фокус.
7. Горизонтальный `scrollIntoView`: `l` до крайней правой колонки доскроллил доску.

## КОММИТ B

```bash
git add src/lib/domain/board-nav.ts \
        src/lib/hooks/use-board-nav.ts \
        src/components/tasks/TaskBoard.tsx \
        src/components/tasks/BoardCard.tsx \
        src/components/tasks/BoardColumn.tsx \
        src/components/tasks/TasksView.tsx \
        tests/unit/board-nav.test.ts
git commit -m "feat(tasks/board): клавиатура — j/k/h/l, Shift+H/L переносит карточку

Свой хук доски вместо правки use-keyboard-nav: тот держит плоскую очередь и
читается TodayView/TaskStream/DataTable — три экрана blast radius ради одного
нового. Конвенции повторены (e.code, гарды ui-store, G-префикс перед d).

Фокус хранится как id задачи, а не как индекс: переживает realtime, оптимистичный
дроп и смену фильтра, и едет за карточкой при переносе клавишами.

Shift+H/L пропускает недроппабельные бакеты через deadlineForBucket === null —
второго списка исключений нет. tabIndex карточке не добавлен намеренно: с DOM-
фокусом KeyboardSensor из dnd-kit перехватил бы Space и стрелки."
```

**Не мержить и не пушить** — мерж руками после гейта.

---

## Если задача 4 буксует

Остановиться, закоммитить A, отчитаться по A. Клавиатура на доске — единственная
часть этого спринта с открытым дизайном; A от неё не зависит ни строкой.

## Отчёт

Итог → Что проверено → Находки → Что я поправил → Твои действия → Дальше.
Приложить: вывод РАЗВЕДКИ, `tsc`/`vitest`/`lint`, `git show --stat` обоих коммитов,
скриншот «Позже» с датами на карточках, скриншот режима «Выполнено» (убедиться, что
красной просрочки в «Позже» больше нет), и **явным пунктом** — что именно проверено
для воскресенья в п.4 смока: живой прогон или только тест.
