import { diffDaysKey, mskDateKey, shiftDateKeyByBuckets } from '@/lib/utils/date-helpers';

// ═══════════════════════════════════════════════════════
// S-DEAL-DEADLINES-1 (W3): окно дедлайнов на две недели — «что горит» до того,
// как человек открыл списки.
//
// Чистая логика: «сейчас» аргументом, ноль запросов, юнит-тесты в tests/unit.
//
// ⚠️ Ключ дня — `mskDateKey`, а не `new Date(...).getDate()`: `tasks.deadline` —
// `timestamptz`, то есть МОМЕНТ времени, и без приведения к календарному дню МСК
// вечерний дедлайн уезжает на сутки (тот же класс, что в PULSE-1).
//
// ⚠️ Арифметика дней — `shiftDateKeyByBuckets`/`diffDaysKey` из date-helpers
// (UTC-полдень), а не свой `setDate`. Вторая формула сдвига дня разошлась бы с
// бакетами Ганта на границах суток, а именно от неё и защищает UTC-полдень.
//
// ⚠️ Норма стадии приходит АРГУМЕНТОМ (`stageNormDateKey` → `resolveStageNorm`):
// считать её здесь значило бы завести вторую формулу нормы рядом с кокпитом.
// ═══════════════════════════════════════════════════════

/** Сколько дней окна лежит ДО сегодняшнего (спека W3: сегодня−2 … сегодня+12). */
const DAYS_BEFORE = 2;
const DAYS_AFTER = 12;
/** Делитель `pct`: 15 меток ⇒ 14 интервалов, крайний день даёт ровно 100%. */
const SPAN = DAYS_BEFORE + DAYS_AFTER;

export type MarkState = 'overdue' | 'today' | 'ahead' | 'waiting';

export interface TrackMark {
  taskId: string;
  title: string;
  dateKey: string; // 'YYYY-MM-DD'
  pct: number; // 0..100, позиция на оси
  state: MarkState;
}

export interface DeadlineTrack {
  from: string;
  to: string; // границы окна, ключи дней
  days: { key: string; pct: number; isToday: boolean }[]; // 15 меток оси
  marks: TrackMark[];
  /** Дни, где меток больше одной — рисуются стеком «+N». */
  stacks: { dateKey: string; pct: number; count: number }[];
  todayPct: number;
  /** null, если норма стадии не определена — пунктир не рисуется. */
  normPct: number | null;
  normDateKey: string | null;
  /** Задачи с дедлайном ВНЕ окна — в подпись «ещё N за окном». */
  outsideCount: number;
}

/** Позиция дня окна по его индексу: `pct(d) = d / 14 × 100`. */
function pctOfIndex(index: number): number {
  return (index / SPAN) * 100;
}

export function buildDeadlineTrack(
  tasks: readonly { id: string; text: string; deadline: string | null; lane: string }[],
  normDateKey: string | null,
  now: Date,
): DeadlineTrack {
  const todayKey = mskDateKey(now);
  const from = shiftDateKeyByBuckets(todayKey, 'day', -DAYS_BEFORE);
  const to = shiftDateKeyByBuckets(todayKey, 'day', DAYS_AFTER);

  const days = Array.from({ length: SPAN + 1 }, (_, i) => {
    const key = shiftDateKeyByBuckets(from, 'day', i);
    return { key, pct: pctOfIndex(i), isToday: key === todayKey };
  });

  const marks: TrackMark[] = [];
  let outsideCount = 0;

  for (const task of tasks) {
    // Задачи без срока — не событие оси: молча мимо, в `outsideCount` не идут.
    if (!task.deadline) continue;
    // Готовые в таймлайн не попадают ВОВСЕ (и в счётчик «за окном» тоже): виджет
    // про то, что впереди, а не про архив. `lane === 'done'` для задач с
    // project_id деривативен от колонки доски (trg_aa_resolve_board, 032).
    if (task.lane === 'done') continue;

    const parsed = new Date(task.deadline);
    if (Number.isNaN(parsed.getTime())) continue;

    const dateKey = mskDateKey(parsed);
    const index = diffDaysKey(from, dateKey);
    if (index < 0 || index > SPAN) {
      outsideCount++;
      continue;
    }

    // Порядок веток значим: просроченная задача в ожидании — всё-таки `overdue`,
    // а сегодняшняя — `today`. `waiting` описывает только то, что впереди.
    const state: MarkState =
      dateKey < todayKey ? 'overdue'
      : dateKey === todayKey ? 'today'
      : task.lane === 'wait' ? 'waiting'
      : 'ahead';

    marks.push({ taskId: task.id, title: task.text, dateKey, pct: pctOfIndex(index), state });
  }

  // Хронологический порядок дорожек. Сортировка стабильна (ES2019), поэтому
  // внутри одного дня сохраняется порядок задач с доски (sort_order).
  marks.sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0));

  // `stacks` считается ВСЕГДА, даже когда дорожки рисуются по одной: решение
  // «схлопывать или нет» принимает компонент, а домен отдаёт обе проекции.
  const byDay = new Map<string, { pct: number; count: number }>();
  for (const mark of marks) {
    const cur = byDay.get(mark.dateKey);
    if (cur) cur.count++;
    else byDay.set(mark.dateKey, { pct: mark.pct, count: 1 });
  }
  const stacks = [...byDay.entries()]
    .filter(([, v]) => v.count > 1)
    .map(([dateKey, v]) => ({ dateKey, pct: v.pct, count: v.count }));

  // Норма вне окна ⇒ пунктира нет. К краю НЕ прижимаем: линия на границе
  // читается как «норма сегодня», то есть врёт про срок.
  const normIndex = normDateKey ? diffDaysKey(from, normDateKey) : null;
  const normInWindow = normIndex !== null && normIndex >= 0 && normIndex <= SPAN;

  return {
    from,
    to,
    days,
    marks,
    stacks,
    todayPct: pctOfIndex(DAYS_BEFORE),
    normPct: normInWindow ? pctOfIndex(normIndex) : null,
    normDateKey: normInWindow ? normDateKey : null,
    outsideCount,
  };
}
