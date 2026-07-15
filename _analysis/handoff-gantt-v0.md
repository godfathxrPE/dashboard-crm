# Claude Code — Sprint: S-GANTT-V0-1 (таблица-таймлайн без либы, таб на ProjectDetail)

Контекст: у `tasks` есть `start_date`/`end_date date` (nullable, миграция 046) + `deadline timestamptz`.
Цель v0 — доказать рендер Gantt-баров в CSS-grid без сторонней либы (её НЕ дефолтим под 9 тем — решение Волны 2),
темизация через существующие CSS-токены. Это spike: день-колонки, read-only + клик по бару = редактирование задачи.
Дальше (v1) — zoom неделя/месяц, drag. Сейчас НЕ делаем.

Место: новый таб **«Таймлайн»** на детальной вьюхе проекта (`components/projects/ProjectDetail.tsx`),
данные — `useProjectBoard(projectId)` (RLS уже покрыт). Клик по бару переиспользует уже смонтированный
`<TaskModal>` (`editingTask`/`taskModalOpen` в компоненте есть).

## РАЗВЕДКА (ничего не меняем — architecture.md устарел, сверяем по факту)
```bash
cd ~/Downloads/dashboard-crm/src
# 1. таб-стейт и список табов (ожидаем useState<'activity' | 'board'>)
grep -n "useState<'activity'\|tab === 'board'\|value: 'board'\|ProjectBoard projectId\|setEditingTask(t); setTaskModalOpen" ../src/components/projects/ProjectDetail.tsx
grep -n "import { ProjectBoard }" components/projects/ProjectDetail.tsx
# 2. сигнатура useProjectBoard (ожидаем возвращает tasks, isLoading, isError)
grep -n "export function useProjectBoard" -A 30 lib/hooks/use-tasks.ts
# 3. токены баров/бордеров — подтвердить, что есть bg-accent/bg-red/bg-yellow/bg-green и что opacity-модиф работают
grep -rn "border-accent/30\|bg-accent\b\|bg-red\b\|bg-green\b\|bg-yellow\b" components/tasks/TaskModal.tsx components/tasks/ProjectBoard.tsx | head
# 4. date-helpers — куда добавить mskDateKey
grep -n "localDateKey\|export function" lib/utils/date-helpers.ts
# 5. поля Task доступны (start_date/end_date/deadline/lane/priority)
grep -n "start_date\|end_date" types/supabase.gen.ts | head
```

## ЗАДАЧА 1 — MSK-хелпер (`src/lib/utils/date-helpers.ts`)
В конец файла добавить (client-эквивалент SQL `(ts AT TIME ZONE 'Europe/Moscow')::date`, TZ-независим от браузера —
`deadline` это timestamptz, голый `.slice(0,10)`/browser-local съедет для полуночных дедлайнов):
```ts
/** Календарная дата YYYY-MM-DD в таймзоне Europe/Moscow — для timestamptz-полей (напр. deadline).
 *  en-CA форматирует как YYYY-MM-DD. Client-аналог `(ts AT TIME ZONE 'Europe/Moscow')::date`. */
export function mskDateKey(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(d);
}
```

## ЗАДАЧА 2 — компонент `src/components/tasks/GanttTimeline.tsx` (новый файл)
Ядро — дата-математика (effective span + fallback + сборка оси). Токены/классы сверить с РАЗВЕДКА, при
расхождении подогнать (логику не трогать). Если opacity-модиф на токенах не работает (в TaskModal `border-accent/30`
есть → должен) — замени `border-border/40` на `border-border`, `bg-green/70` на `bg-green` + `opacity-50`.
```tsx
'use client';

import { useMemo } from 'react';
import { useProjectBoard } from '@/lib/hooks/use-tasks';
import { mskDateKey } from '@/lib/utils/date-helpers';
import type { Task } from '@/types/entities';

interface GanttTimelineProps {
  projectId: string;
  onEditTask: (task: Task) => void;
}

const DAY_MS = 86_400_000;
const LABEL_W = '12.5rem'; // колонка названий (rem — конвенция проекта, не px)

// цвет бара по приоритету; done — приглушённо
function barClass(task: Task): string {
  if (task.lane === 'done') return 'bg-green';
  switch (task.priority) {
    case 'critical': return 'bg-red';
    case 'important': return 'bg-yellow';
    default: return 'bg-accent';
  }
}

// эффективный интервал задачи (YYYY-MM-DD). deadline (timestamptz) → MSK-дата.
function taskSpan(task: Task): { start: string; end: string } | null {
  const dl = task.deadline ? mskDateKey(task.deadline) : null;
  const start = task.start_date ?? task.end_date ?? dl;
  let end = task.end_date ?? dl ?? task.start_date;
  if (!start || !end) return null;   // ни дат, ни дедлайна → «без дат»
  if (end < start) end = start;      // fallback по deadline мог инвертировать порядок
  return { start, end };
}

// [min..max] включительно; UTC-полдень → без TZ-дрейфа при инкременте дня
function buildDays(min: string, max: string): string[] {
  const days: string[] = [];
  let t = Date.parse(`${min}T12:00:00Z`);
  const end = Date.parse(`${max}T12:00:00Z`);
  while (t <= end) {
    days.push(new Date(t).toISOString().slice(0, 10));
    t += DAY_MS;
  }
  return days;
}

export function GanttTimeline({ projectId, onEditTask }: GanttTimelineProps) {
  const { tasks, isLoading, isError } = useProjectBoard(projectId);

  const model = useMemo(() => {
    const list = tasks ?? [];
    const dated: { task: Task; start: string; end: string }[] = [];
    const undated: Task[] = [];
    for (const task of list) {
      const span = taskSpan(task);
      if (span) dated.push({ task, ...span });
      else undated.push(task);
    }
    const index = new Map<string, number>();
    if (dated.length === 0) return { days: [] as string[], index, dated, undated, todayIdx: -1 };
    const min = dated.reduce((m, d) => (d.start < m ? d.start : m), dated[0].start);
    const max = dated.reduce((m, d) => (d.end > m ? d.end : m), dated[0].end);
    const days = buildDays(min, max);
    days.forEach((d, i) => index.set(d, i));
    dated.sort((a, b) => (a.start === b.start ? a.end.localeCompare(b.end) : a.start.localeCompare(b.start)));
    return { days, index, dated, undated, todayIdx: index.get(mskDateKey(new Date())) ?? -1 };
  }, [tasks]);

  if (isLoading) return <div className="py-8 text-center text-xs text-text-mute">Загрузка…</div>;
  if (isError)   return <div className="py-8 text-center text-xs text-red">Не удалось загрузить задачи</div>;

  const { days, index, dated, undated, todayIdx } = model;

  if (days.length === 0 && undated.length === 0) {
    return <div className="py-8 text-center text-xs text-text-mute">Нет задач для таймлайна</div>;
  }

  const gridCols = { gridTemplateColumns: `repeat(${days.length}, minmax(28px, 1fr))` };

  return (
    <div className="mb-4 overflow-x-auto rounded-xl border border-border bg-surface p-3">
      {days.length > 0 && (
        <div className="min-w-max">
          {/* Шапка: спейсер + дни */}
          <div className="flex">
            <div className="shrink-0" style={{ width: LABEL_W }} />
            <div className="grid flex-1" style={gridCols}>
              {days.map((d, i) => (
                <div
                  key={d}
                  className={`border-l border-border/40 px-1 py-1 text-center text-[10px] tabular-nums ${
                    i === todayIdx ? 'font-semibold text-accent' : 'text-text-mute'
                  }`}
                >
                  {d.slice(8, 10)}
                  {(i === 0 || d.slice(8, 10) === '01') && <div className="text-text-dim">{d.slice(5, 7)}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Строки задач */}
          {dated.map(({ task, start, end }) => {
            const s = index.get(start)!;
            const e = index.get(end)!;
            return (
              <div key={task.id} className="flex items-center border-t border-border/40">
                <div
                  className="shrink-0 truncate py-1.5 pr-2 text-xs text-text-main"
                  style={{ width: LABEL_W }}
                  title={task.text}
                >
                  {task.text}
                </div>
                <div className="grid flex-1" style={gridCols}>
                  <button
                    type="button"
                    onClick={() => onEditTask(task)}
                    style={{ gridColumn: `${s + 1} / ${e + 2}`, gridRow: 1 }}
                    className={`my-1 h-4 rounded ${barClass(task)} ${task.lane === 'done' ? 'opacity-50' : 'opacity-90'} transition-opacity hover:opacity-100`}
                    title={`${start} → ${end}`}
                    aria-label={`${task.text}: ${start} → ${end}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Без дат */}
      {undated.length > 0 && (
        <div className="mt-3 border-t border-border/40 pt-2">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-text-mute">Без дат</div>
          <div className="flex flex-wrap gap-1.5">
            {undated.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => onEditTask(task)}
                className="max-w-[200px] truncate rounded border border-border px-2 py-1 text-xs text-text-dim hover:text-text-main"
                title={task.text}
              >
                {task.text}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

## ЗАДАЧА 3 — вкладка в `ProjectDetail.tsx` (4 точечных правки, по содержимому не по номерам строк)
3.1 Импорт рядом с `import { ProjectBoard } from '@/components/tasks/ProjectBoard';`:
```ts
import { GanttTimeline } from '@/components/tasks/GanttTimeline';
```
3.2 Тип таба:
```
- const [tab, setTab] = useState<'activity' | 'board'>('activity');
+ const [tab, setTab] = useState<'activity' | 'board' | 'timeline'>('activity');
```
3.3 В массив табов после строки `{ value: 'board' as const, label: isDelivery ? 'План' : 'Доска задач' },` добавить:
```tsx
          { value: 'timeline' as const, label: 'Таймлайн' },
```
3.4 Сразу после закрытия блока `{tab === 'board' && ( ... )}` вставить:
```tsx
      {tab === 'timeline' && (
        <GanttTimeline
          projectId={projectId}
          onEditTask={(t) => { setEditingTask(t); setTaskModalOpen(true); }}
        />
      )}
```

## ПРОВЕРКА
```bash
npx tsc --noEmit          # главный гейт (union таба, index-Map типы)
# build — нативно на Маке отдельно (через мост SWC arm64 не грузится)
```
Ручной смок (в проекте с задачами):
- Задать паре задач start/end → в табе «Таймлайн» бары на нужных днях, цвет по приоритету.
- Задача только с deadline (без start/end) → бар на дне дедлайна (MSK, не съезжает у полуночных).
- Задача **только со start_date** (без end и без deadline) → однодневный бар на дне начала (проверка fallback `end = start`).
- Задача без дат и дедлайна → в группе «Без дат», без бара.
- **Delivery-проект** (`type='delivery'`) → таб «Таймлайн» рядом с «План», те же задачи что на фазовой доске (основной потребитель Gantt).
- Клик по бару → открывается TaskModal на редактирование (тот же `task.id`).
- Сегодняшняя колонка в шапке — акцентом. Широкий диапазон → горизонтальный скролл (колонки ≥28px).

## КОММИТ
```bash
git add -A && git commit -m "feat(gantt): v0 таблица-таймлайн (таб на проекте, CSS-grid без либы)"
# НЕ пушить — пуш всех коммитов Волны 2 разом после нативного build.
```

---

## Заметки гейта (Cowork)
- **Дата-математика — ядро.** `taskSpan`: fallback end на deadline может инвертировать порядок относительно start → `if (end < start) end = start` обязателен (DB CHECK гарантирует порядок только когда обе даты заданы, deadline вне CHECK). Гейтить именно этот кейс (задача start=15-е, deadline=10-е).
- **TZ:** `deadline` timestamptz → `mskDateKey` (Intl en-CA, Europe/Moscow), НЕ `localDateKey` (browser-local) и НЕ `.slice(0,10)` (UTC). `today` — тоже через mskDateKey, чтобы колонка «сегодня» совпала с осью.
- **buildDays на UTC-полдне** — иначе инкремент дня в +TZ прыгает через полночь (классический off-by-one). Не переписывать на локальные Date.
- **Типы Task derived** — start_date/end_date уже в gen.ts (спринт DATES). Ничего в типах не трогать.
- **`index` в model инициализирован пустой Map в обеих ветках** — иначе tsc ругнётся на union формы возврата useMemo.
- **Место монтирования — таб проекта.** Если CC решит иначе (глобальная страница) — стоп, сверься: v0 намеренно per-project (данные useProjectBoard, RLS, «план во времени» = план проекта).
- **Широкий диапазон (>~120 дней) — НЕ оптимизировать в v0.** `buildDays` даёт колонку на день, шапка = N узлов; горизонтальный скролл — ок для spike. Window/padding оси — долг v1, не трогать сейчас.
- **a11y:** бар — пустая кнопка → `aria-label` обязателен (добавлен). Чипы «Без дат» уже содержат видимый текст `task.text` → им aria-label НЕ нужен (accessible name из содержимого).
- build через мост невозможен (SWC linux/arm64 vs macOS node_modules) — только нативно на Маке.
