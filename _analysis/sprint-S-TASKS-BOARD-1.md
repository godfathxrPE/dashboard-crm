# Claude Code Prompt — Sprint S-TASKS-BOARD-1: третий вид «Доска» в разделе Задачи

Добавить в `/tasks` третий вид рядом со «Список» и «Таблица» — **канбан по срокам**.
Колонки = дата-бакеты (`DateBucket`), перетаскивание карточки = смена `deadline`.
Колонка «Без даты» — зона разбора: там сегодня 373 задачи, и доска существует
ровно затем, чтобы их разгребать перетаскиванием на день.

**Миграций в спринте НЕТ.** Ни одной новой колонки: `deadline` (timestamptz) уже
есть, `--info-l` уже объявлен в `globals.css`. Всё изменение — клиентское.

Опорный макет (открыть в браузере перед началом, это эталон вёрстки):
`_analysis/kanban-mockups/kanban-sroki-final.html`

---

## РАЗВЕДКА

Выполнить целиком, результат приложить к отчёту. Ни одной правки до этого шага.

```bash
cd ~/Downloads/dashboard-crm

# 1. Файлы, которые будем менять, — существуют и в ожидаемом состоянии
ls -la src/components/tasks/{TasksView,TaskStream,TaskStreamRow,TasksTable,KanbanBoard}.tsx
sed -n '55,75p' src/components/tasks/TasksView.tsx      # разбор ?view — сейчас 'table' | 'stream'
cat src/components/tasks/index.ts

# 2. Ось бакетов и её приватные хелперы (мы дописываем В ЭТОТ файл)
grep -n "shiftKey\|endOfWeekKey\|BUCKET_ORDER\|taskDateBucket\|groupByBucket" src/lib/utils/task-view.ts

# 3. Календарные хелперы, которые обязаны использоваться (свою математику не писать)
grep -n "mskEndOfDayIso\|mskDeadlineInDays\|mskDateKey\|shiftDateKeyByBuckets" src/lib/utils/date-helpers.ts

# 4. Токен --info-l существует во всех темах через :root-алиас (НЕ в .t-*)
grep -n -- "--info:\|--info-l:" src/app/globals.css
grep -c -- "--blue-l:" src/app/globals.css      # ожидание: 7 (по числу тем) + :root

# 5. dnd-kit в стеке, версия
grep -n "dnd-kit" package.json

# 6. Мутация, которой будем двигать дедлайн (optimistic уже внутри)
grep -n "export function useUpdateTask" -A 20 src/lib/hooks/use-tasks.ts

# 7. Сброс напоминания при смене дедлайна делает ТРИГГЕР БД, а не клиент — убедиться
grep -rn "reset_reminded_at" supabase/migrations/ | head -3

# 8. Куда кладутся тесты (include — ТОЛЬКО tests/unit/**)
cat vitest.config.ts
```

**Стоп-условия разведки.** Если п.4 не находит `--info-l`, п.5 не находит `@dnd-kit`,
или п.7 не находит триггер — остановиться и написать об этом в отчёте, не выдумывать
обходной путь.

---

## ЗАДАЧА 1 — обратная функция оси: бакет → дедлайн

Файл: **`src/lib/utils/task-view.ts`** (дописать в конец).

Почему сюда, а не в `lib/domain/`: в этом файле уже живёт `taskDateBucket`
(дата → бакет) и приватные `shiftKey`/`endOfWeekKey`. Обратная функция обязана
стоять рядом с прямой — разведённые по файлам, они разойдутся при первой правке
границ недели, и разойдутся молча.

```ts
// ─── Обратная ось: бакет → дедлайн (S-TASKS-BOARD-1) ────────────────────────
// Доска по срокам роняет карточку в колонку — это ЗАПИСЬ дедлайна. Правило
// одно: результат обязан вернуться в ТУ ЖЕ колонку при следующем рендере,
// иначе карточка «отскакивает». Инвариант проверяется тестом (round-trip).
//
// Время суток — всегда конец дня по МСК (mskEndOfDayIso, конвенция проекта:
// дедлайн «сегодня» не может быть моментом клика, иначе задача просрочена
// через секунду). Свою арифметику над UTC не писать — только хелперы.

/** Результат дропа. `deadline: null` — осознанная очистка («Без даты»). */
export interface BucketDrop {
  deadline: string | null;
}

/**
 * Дедлайн, который положит задачу в бакет `bucket` относительно `now`.
 * `null` — бакет НЕ принимает дроп (нет представимого дня или бакет бессмысленен
 * как цель). Колонка с `null` рендерится без droppable.
 *
 * - overdue    → null. Ронять в просрочку намеренно нельзя: это состояние,
 *                а не план. Единственный способ туда попасть — время.
 * - today      → конец сегодняшнего дня
 * - tomorrow   → конец завтрашнего
 * - this_week  → конец недели (вс). NB: в сб/вс конец недели совпадает с
 *                сегодня/завтра — бакет схлопывается, дропа нет → null.
 * - later      → конец первого дня ПОСЛЕ конца недели (всегда > this_week)
 * - no_date    → { deadline: null } — очистить срок
 */
export function deadlineForBucket(bucket: DateBucket, now: Date): BucketDrop | null {
  const todayKey = mskDateKey(now);

  switch (bucket) {
    case 'overdue':
      return null;
    case 'no_date':
      return { deadline: null };
    case 'today':
      return { deadline: mskEndOfDayIso(todayKey) };
    case 'tomorrow':
      return { deadline: mskEndOfDayIso(shiftKey(todayKey, 1)) };
    case 'this_week': {
      const eow = endOfWeekKey(todayKey);
      // Схлопывание: вс → eow === today; сб → eow === tomorrow.
      if (eow <= shiftKey(todayKey, 1)) return null;
      return { deadline: mskEndOfDayIso(eow) };
    }
    case 'later':
      return { deadline: mskEndOfDayIso(shiftKey(endOfWeekKey(todayKey), 1)) };
  }
}

/** Все бакеты в порядке оси, включая пустые: колонка-приёмник обязана
 *  существовать, даже когда в ней ноль карточек. Отличие от groupByBucket,
 *  который пустые опускает (список их и не рисует). */
export function boardColumns(
  tasks: Task[],
  now: Date,
): { bucket: DateBucket; tasks: Task[] }[] {
  const map = new Map<DateBucket, Task[]>();
  for (const t of tasks) {
    const b = taskDateBucket(t, now);
    (map.get(b) ?? map.set(b, []).get(b)!).push(t);
  }
  return BUCKET_ORDER.map((b) => ({
    bucket: b,
    tasks: (map.get(b) ?? []).sort((x, y) => compareInBucket(x, y, b)),
  }));
}
```

Импорт в шапке файла дополнить: `import { mskDateKey, mskEndOfDayIso } from './date-helpers';`
(`mskDateKey` уже импортирован — добавить только `mskEndOfDayIso`).

**Проверка после задачи:** `npx tsc --noEmit` зелёный.

---

## ЗАДАЧА 2 — тест инварианта (до компонентов)

Файл: **`tests/unit/task-board-axis.test.ts`** (именно `tests/unit/**` — иначе vitest
файл не подхватит, а прогон отрапортует зелёным).

```ts
import { describe, it, expect } from 'vitest';
import {
  BUCKET_ORDER,
  deadlineForBucket,
  taskDateBucket,
  boardColumns,
  type DateBucket,
} from '@/lib/utils/task-view';
import type { Task } from '@/types/entities';

const t = (deadline: string | null, lane = 'now'): Task =>
  ({ id: 'x', text: 't', deadline, lane } as unknown as Task);

// Опорные дни: будни, суббота, воскресенье (границы схлопывания this_week).
// Полдень МСК — чтобы тест не зависел от часа прогона.
const WED = new Date('2026-08-12T09:00:00Z'); // ср
const SAT = new Date('2026-08-15T09:00:00Z'); // сб
const SUN = new Date('2026-08-16T09:00:00Z'); // вс

describe('deadlineForBucket — round-trip', () => {
  for (const now of [WED, SAT, SUN]) {
    for (const bucket of BUCKET_ORDER) {
      it(`${bucket} @ ${now.toISOString().slice(0, 10)}`, () => {
        const drop = deadlineForBucket(bucket, now);
        if (drop === null) {
          // Недроппабельные: overdue всегда; this_week в сб/вс.
          expect(
            bucket === 'overdue' || (bucket === 'this_week' && now !== WED),
          ).toBe(true);
          return;
        }
        // ГЛАВНЫЙ ИНВАРИАНТ: карточка остаётся в той колонке, куда её бросили.
        expect(taskDateBucket(t(drop.deadline), now)).toBe(bucket);
      });
    }
  }
});

describe('deadlineForBucket — семантика', () => {
  it('no_date очищает срок, а не «не принимает дроп»', () => {
    expect(deadlineForBucket('no_date', WED)).toEqual({ deadline: null });
  });
  it('overdue не принимает дроп', () => {
    expect(deadlineForBucket('overdue', WED)).toBeNull();
  });
  it('this_week схлопывается в сб и вс', () => {
    expect(deadlineForBucket('this_week', SAT)).toBeNull();
    expect(deadlineForBucket('this_week', SUN)).toBeNull();
    expect(deadlineForBucket('this_week', WED)).not.toBeNull();
  });
  it('later строго дальше this_week', () => {
    const week = deadlineForBucket('this_week', WED)!.deadline!;
    const later = deadlineForBucket('later', WED)!.deadline!;
    expect(later > week).toBe(true);
  });
});

describe('boardColumns', () => {
  it('возвращает ВСЕ бакеты, включая пустые, в порядке оси', () => {
    const cols = boardColumns([t(null)], WED);
    expect(cols.map((c) => c.bucket)).toEqual([...BUCKET_ORDER]);
    expect(cols.find((c) => c.bucket === 'no_date')!.tasks).toHaveLength(1);
    expect(cols.find((c) => c.bucket === 'today')!.tasks).toHaveLength(0);
  });
});
```

**Проверка:** `npx vitest run tests/unit/task-board-axis.test.ts` — все кейсы зелёные,
и в выводе видно, что файл ВОШЁЛ в прогон (не «No test files found»).

---

## ЗАДАЧА 3 — карточка доски

Файл: **`src/components/tasks/BoardCard.tsx`** (новый).

Не переиспользуем `TaskCard` — у него другая анатомия (lane-борд, свой confirm,
свой набор действий). Копипаста здесь дешевле связывания двух видов одним
компонентом с ветвлениями.

Анатомия (1:1 с макетом):
1. Верхняя строка: круглый чекбокс «Готово» (18px) + текст задачи, `line-clamp-2`.
2. Нижняя строка мета (только если есть что показать), отступ слева `pl-[23px]`
   под чекбокс: точка приоритета → чип связи (проект/компания) → чип тайм-блока →
   срок/просрочка справа (`ml-auto`).

Требования:
- Точка приоритета — семантические токены inline, как в `TaskStreamRow`:
  `critical → var(--danger)`, `important → var(--warning)`, `normal` — точку не рисуем вовсе.
- Просрочка: `daysOverdue(task, now)` → `N дн.` цветом `var(--danger-text)`, `font-semibold`.
- Тайм-блок: `mskTimeRange(task.scheduled_start, task.scheduled_end)`.
- Чип связи — `<Link>` с `e.stopPropagation()`, роутинг-сплит как в `TaskStreamRow`
  (`project.type === 'client' ? '/deals/' : '/projects/'`).
- Клик по карточке → `onEdit(task)`; клик по чекбоксу → `updateTask.mutate({ id, lane })`
  с `e.stopPropagation()`.
- Тень карточки — `var(--shadow-card)` / hover `var(--shadow-card-hover)`.
  **НЕ `elevation-*`** (канон: elevation только для floating-слоёв) и **не**
  `hover:elevation-N` (утилита не реагирует на hover-вариант).
- Числа — `tabular-nums`.
- Внутри карточки **никаких поповеров/тултипов на JS**: доска лежит в
  `overflow-x-auto`, всплывашка там клиппится. Только нативный `title`.

Drag: карточка — `useDraggable({ id: task.id })` из `@dnd-kit/core`, при
`isDragging` — `opacity-40`.

---

## ЗАДАЧА 4 — колонка

Файл: **`src/components/tasks/BoardColumn.tsx`** (новый).

`useDroppable({ id: bucket, disabled: !droppable })`.

**Фон колонки — inline `style`, токенами:**

```tsx
const WELL: Partial<Record<DateBucket, string>> = {
  overdue: 'var(--danger-l)',
  today: 'var(--info-l)',
};
// остальные: 'var(--surface2)'; no_date: прозрачный + dashed-рамка
```

⚠️ **`--accent-l` для «Сегодня» НЕ использовать.** В `t-washi` `--accent` — это
тот же торий `#C23B3B`, что и `--red` (Δhue = 0, так задумана тема), и две первые
колонки становятся одинаково красными. Пара `--danger` / `--info` различима во всех
семи темах, потому что палитра обязана держать `--red` и `--blue` раздельно.
Проверено на макете во всех 7 темах.

Структура:
- Шапка: название бакета (`BUCKET_LABELS`) + счётчик + справа дата-подпись
  для `today` / `tomorrow` / `this_week` (формат «вс, 9 авг» — через `Intl` с
  `timeZone: 'Europe/Moscow'`, не browser-local).
- Для `no_date` — подсказка под шапкой: «Перетащи на день — срок поставится сам.»
- Тело: скролл по Y, карточки, gap 8px.
- **Кап рендера: `PAGE = 50` карточек.** Ниже — кнопка «Показать ещё N».
  Молчаливого усечения быть не должно: кнопка называет остаток числом.
  (Серверной пагинации в проекте нет, `useTasks` тянет всё — кап чисто рендерный.)
- Пустая колонка: блок с `data-kanban-empty` (существующий семантический атрибут),
  текст «Пусто — перетащи сюда»; для недроппабельных (`overdue`, схлопнутая
  `this_week`) — без этого текста, просто пусто.
- Подсветка приёмника при `isOver`: `outline: 1px dashed var(--accent-text)` +
  фон `var(--accent-l)`.
- Радиус колонки — `var(--radius-l)`.

---

## ЗАДАЧА 5 — сама доска

Файл: **`src/components/tasks/TaskBoard.tsx`** (новый).

Пропсы — 1:1 с `TaskStream`: `{ tasks, now, onEdit, canEdit, canDelete }`
(`canDelete` пока не используется — удаление на доске в этот спринт не входит,
см. «Что осознанно НЕ делаем»).

```tsx
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  useSensor(KeyboardSensor),
);
```
(те же значения, что в `KanbanBoard` — поведение drag во всём приложении одинаковое)

`onDragEnd`:
```
1. over?.id → DateBucket; нет — выход.
2. Бакет источника (taskDateBucket(task, now)) === целевой → выход (no-op).
3. drop = deadlineForBucket(target, now); drop === null → выход.
4. updateTask.mutate({ id: task.id, deadline: drop.deadline });
```

Важно:
- **Одна мутация на дроп**, `useUpdateTask` уже несёт optimistic + патч всех срезов
  кэша. Никаких `reorder_tasks`: `sort_order` на этой доске не трогаем вовсе —
  он lane-scoped, и перемешивание его датами сломает порядок lane-борда и Ганта.
- **`reminded_at` руками не занулять** — это делает триггер БД на изменении
  `deadline`. Клиентский дубль разойдётся с ним при первой правке триггера.
- `DragOverlay` — тот же вид, что в `KanbanBoard` (текст задачи, `elevation-3`,
  лёгкий поворот). Здесь elevation уместен: это floating-слой.
- Контейнер: `overflow-x-auto`, колонки `flex`, ширина колонки 288px,
  «Без даты» 302px и отделена `border-l border-dashed`.

---

## ЗАДАЧА 6 — интеграция в TasksView

Файл: **`src/components/tasks/TasksView.tsx`**.

1. Тип вида: `'stream' | 'table' | 'board'`. Разбор параметра:
```ts
const raw = searchParams.get('view');
const view: 'stream' | 'table' | 'board' =
  raw === 'table' ? 'table' : raw === 'board' ? 'board' : 'stream';
```
`switchView` — так же: `stream` удаляет параметр, остальные пишут значение.
Неизвестное значение молча падает в `stream` (как сейчас) — это сознательно.

2. Третья кнопка в переключателе, иконка `Columns3` из `lucide-react`, подпись
   «Доска». Стили — копия соседних кнопок.

3. Рендер:
```tsx
) : view === 'board' ? (
  <TaskBoard tasks={queried} now={now} onEdit={openEdit} canEdit={canEdit} canDelete={canDeleteRow} />
) : view === 'table' ? (
```

4. `modalOpen` в `TaskBoard` **не** пробрасывать: j/k на доске нет (см. ниже),
   гейт клавиатуры не нужен.

5. `src/components/tasks/index.ts` — добавить `export { TaskBoard } from './TaskBoard';`

**Что НЕ трогаем в этом файле:** фильтры, счётчики, поиск, пустые состояния,
массовое удаление. Доска получает уже отфильтрованный `queried` — ту же выборку,
что Список и Таблица. Режим «Выполнено» на доске работает как есть: выполненные с
прошедшим сроком уходят в «Позже» по существующей логике `taskDateBucket` — это не
дефект, а свойство оси.

---

## ЗАДАЧА 7 — проверка

```bash
npx tsc --noEmit
npx vitest run tests/unit/task-board-axis.test.ts
npm run lint
```

**Рантайм-смок обязателен** (`npm run dev`, tsc/build класс дефектов drag-n-drop не
ловят — прецедент S-DEPS-1). Порядок и что именно проверять:

1. **`t-minimal`** (рабочая тема владельца — первой). `/tasks?view=board`:
   - шесть колонок, «Просрочено» розовая, «Сегодня» голубая, остальные серые;
   - «Без даты» — пунктирная зона справа, 50 карточек + «Показать ещё 323»;
   - перетащить карточку из «Без даты» в «Завтра» → карточка осталась в «Завтра»
     (**не отскочила**), F5 → она там же;
   - перетащить обратно в «Без даты» → срок очистился;
   - попытка бросить в «Просрочено» → карточка возвращается на место, мутации нет
     (проверить по вкладке Network: PATCH не ушёл).
2. **`t-washi`** — убедиться, что первые две колонки **разного** цвета.
   Это ровно тот случай, ради которого выбран `--info-l`.
3. **`t-frost`** (стекло) — колонки видны, карточки не сливаются с фоном.
4. Переключение Список ↔ Таблица ↔ Доска: `?view` в URL меняется, фильтры и
   счётчики не сбрасываются.

Тему переключать пикером в UI, **не** записью в `localStorage`: там zustand-блоб
`{"state":{"theme":"t-minimal"},"version":0}`, простая строка не падает, а молча
сбрасывает на `t-aura` — и смок «в минимале» пойдёт в ауре. После смока вернуть
тему владельца. Проверять `document.documentElement.className`, а не своё намерение.

Если dev-сервер отдаёт 404 на собственные чанки или страница вечно крутит спиннер —
это протухший `next dev`, не наши правки: `rm -rf .next && npm run dev`.
`npm run build` при живом dev-сервере не гонять.

---

## Что осознанно НЕ делаем в этом спринте

Перечислено, чтобы отсутствие не выглядело недоделкой:

- **Реордер внутри колонки.** `sort_order` lane-scoped; менять его с датовой доски
  = ломать порядок lane-борда и Ганта. Порядок в колонке — по дедлайну
  (`compareInBucket`), как в Списке.
- **j/k-навигация и peek.** В Списке они есть, на доске — отдельная задача
  (двумерная навигация, не плоская очередь).
- **Удаление и quick-actions на карточке.** Доска — про планирование сроков;
  удаление живёт в Списке в режиме «Выполнено».
- **Виртуализация.** Кап 50 + «Показать ещё» закрывает 373 задачи без библиотеки.
- **Мультиселект / bulk-drag.** Отдельная фича.
- **Мобильная раскладка.** Доска — десктопный вид (1440×900), горизонтальный
  скролл. На узком экране остаются Список и Таблица.

---

## КОММИТ

```bash
git checkout -b feat/tasks-board-view
git add src/lib/utils/task-view.ts \
        src/components/tasks/BoardCard.tsx \
        src/components/tasks/BoardColumn.tsx \
        src/components/tasks/TaskBoard.tsx \
        src/components/tasks/TasksView.tsx \
        src/components/tasks/index.ts \
        tests/unit/task-board-axis.test.ts
git status --short          # в индексе только эти 7 файлов
git commit -m "feat(tasks): доска по срокам — третий вид раздела Задачи

Колонки — дата-бакеты, дроп карточки пишет deadline (конец дня МСК).
«Без даты» — зона разбора: дроп на день ставит срок, обратно — очищает.
Обратная функция оси deadlineForBucket живёт рядом с taskDateBucket,
инвариант round-trip закрыт тестом (вкл. схлопывание this_week в сб/вс).
Заливка первых двух колонок — --danger-l/--info-l: --accent-l дал бы два
красных столбца в t-washi, где accent === red по замыслу темы.
Реордер и sort_order не трогаем — ось lane-scoped."
```

**Ветку не мержить и не пушить** — мерж руками у Олега после гейта Cowork.

---

## Отчёт

Формат: Итог → Что проверено → Находки → Что я поправил → Твои действия → Дальше.
Обязательно приложить:
- вывод РАЗВЕДКИ (все 8 пунктов);
- вывод `tsc` / `vitest` / `lint`;
- `git show --stat` последнего коммита;
- по одному скриншоту доски в `t-minimal` и `t-washi`;
- **явным пунктом**: отскочила ли карточка при дропе хоть раз и в каком бакете.
