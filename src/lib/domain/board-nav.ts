import { deadlineForBucket, type DateBucket } from '@/lib/utils/task-view';
import type { Task } from '@/types/entities';

/**
 * S-TASKS-BOARD-2, з.4: чистая логика клавиатурной навигации по доске сроков.
 *
 * Ни React, ни DOM, «сейчас» — аргументом (конвенция `lib/domain`): доска
 * двумерна, и вся арифметика перехода обязана быть тестируемой без рендера.
 *
 * Фокус адресуется **id задачи**, а не координатой (col/row). Координата
 * вычисляется из id на каждом вызове, поэтому фокус переживает любую
 * перестройку набора — realtime, оптимистичный дроп, смену фильтра — и едет за
 * карточкой, когда её переносят клавишами. Индекс (как в `use-keyboard-nav`)
 * сбрасывался бы на каждое изменение длины.
 */

export type BoardColumns = { bucket: DateBucket; tasks: Task[] }[];
export type NavDir = 'up' | 'down' | 'left' | 'right';

/** Координата карточки в наборе колонок; null — карточки в наборе нет. */
export function locate(
  columns: BoardColumns,
  id: string | null,
): { col: number; row: number } | null {
  if (!id) return null;
  for (let col = 0; col < columns.length; col++) {
    const row = columns[col].tasks.findIndex((t) => t.id === id);
    if (row !== -1) return { col, row };
  }
  return null;
}

/** Первая карточка первой непустой колонки; null — доска пуста. */
function firstCard(columns: BoardColumns): string | null {
  for (const c of columns) {
    if (c.tasks.length > 0) return c.tasks[0].id;
  }
  return null;
}

/**
 * Куда уедет фокус. Возвращает id новой карточки либо null — «остаёмся».
 * - фокуса нет (или он выпал из набора) → первая карточка первой непустой
 *   колонки, для ЛЮБОГО направления: первое нажатие обязано дать точку входа;
 * - up/down — в пределах своей колонки, БЕЗ перескока в соседнюю: на доске
 *   вертикаль принадлежит колонке, и перескок ломает пространственную модель;
 * - left/right — ближайшая НЕПУСТАЯ колонка, строка клампится к её длине
 *   (иначе с 40-й карточки «Без даты» фокус ушёл бы в undefined).
 */
export function moveFocus(
  columns: BoardColumns,
  focusedId: string | null,
  dir: NavDir,
): string | null {
  const at = locate(columns, focusedId);
  if (!at) return firstCard(columns);

  if (dir === 'up' || dir === 'down') {
    const col = columns[at.col].tasks;
    const row = at.row + (dir === 'down' ? 1 : -1);
    if (row < 0 || row >= col.length) return null;
    return col[row].id;
  }

  const step = dir === 'right' ? 1 : -1;
  for (let col = at.col + step; col >= 0 && col < columns.length; col += step) {
    const tasks = columns[col].tasks;
    if (tasks.length === 0) continue;
    return tasks[Math.min(at.row, tasks.length - 1)].id;
  }
  return null;
}

/**
 * Куда уедет САМА карточка при Shift+H/L. null — переносить некуда.
 *
 * Цель — ближайший в направлении бакет, принимающий дроп
 * (`deadlineForBucket(b, now) !== null`), отличный от текущего. Недроппабельные
 * (`overdue` всегда, схлопнутая в сб/вс `this_week`) отсеиваются этим же
 * предикатом — второго списка исключений не заводим, иначе он разойдётся с
 * дропом мышью.
 *
 * Пустота колонки цели значения НЕ имеет: перенос — это запись дедлайна,
 * а не переход фокуса по существующим карточкам.
 *
 * `fromBucket` — откуда считать шаг, если колонка, в которой карточка УЖЕ
 * должна стоять, ещё не отрисована. Нужен при быстром повторе клавиши: набор
 * колонок приходит в хук через рендер, и два нажатия внутри одного кадра иначе
 * оба считаются от исходной колонки — четыре нажатия дают два перехода и три
 * PATCH с одним и тем же днём. Поймано смоуком S-TASKS-BOARD-2.
 */
export function moveTarget(
  columns: BoardColumns,
  focusedId: string | null,
  dir: 'left' | 'right',
  now: Date,
  fromBucket?: DateBucket,
): { taskId: string; bucket: DateBucket } | null {
  const at = locate(columns, focusedId);
  if (!at || !focusedId) return null;

  const fromCol = fromBucket ? columns.findIndex((c) => c.bucket === fromBucket) : -1;
  const start = fromCol === -1 ? at.col : fromCol;

  const step = dir === 'right' ? 1 : -1;
  for (let col = start + step; col >= 0 && col < columns.length; col += step) {
    const bucket = columns[col].bucket;
    if (deadlineForBucket(bucket, now) === null) continue;
    return { taskId: focusedId, bucket };
  }
  return null;
}
