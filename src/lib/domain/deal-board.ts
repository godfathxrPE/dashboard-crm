import { mskDateKey, mskDayCaption } from '@/lib/utils/date-helpers';
import type { ColumnCategory, TaskLane } from '@/types/database';

// ═══════════════════════════════════════════════════════
// S-DEAL-BOARD-1 (W3 · КОЛОНКИ): чистая логика колонок доски сделки.
//
// «Сейчас» аргументом, ноль запросов, юнит-тесты в tests/unit.
//
// ⚠️ Состояние карточки считается от КАТЕГОРИИ колонки, в которой она стоит,
// а не от `task.lane`. `lane` для задач проекта деривативен от колонки
// (trg `resolve_task_board`), но выставляет его сервер: после DnD в «Готово»
// оптимистичный кэш уже переложил задачу в новую колонку, а `lane` ещё старый —
// карточка в «Готово» была бы не зачёркнута до рефетча.
//
// ⚠️ Ключ дня — `mskDateKey`, как у таймлайна дедлайнов (`deadline-track.ts`):
// «просрочено»/«сегодня» на карточке и точка на оси обязаны назвать один день.
// ═══════════════════════════════════════════════════════

/** Зеркало `public.category_to_lane` — для оптимистичного lane при добавлении в колонку. */
export function categoryToLane(category: ColumnCategory): TaskLane {
  switch (category) {
    case 'backlog':
      return 'next';
    case 'started':
      return 'now';
    case 'paused':
      return 'wait';
    default:
      return 'done';
  }
}

export type CardDeadlineTone = 'overdue' | 'today' | 'waiting' | 'plain' | 'done';

export interface CardDeadline {
  tone: CardDeadlineTone;
  label: string;
}

/**
 * Строка срока на карточке (спека W3: «сегодня», «просрочено · 3 сент»,
 * «ждём до 15 сент», просто «9 сент»). Без дедлайна — null.
 *
 * Порядок веток значим и совпадает с таймлайном: готовая задача не бывает
 * просроченной, просроченная в ожидании — всё-таки просрочена.
 */
export function cardDeadline(
  deadline: string | null,
  category: ColumnCategory,
  now: Date,
): CardDeadline | null {
  if (!deadline) return null;
  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) return null;

  const caption = mskDayCaption(deadline);
  if (category === 'done') return { tone: 'done', label: caption };

  const key = mskDateKey(parsed);
  const today = mskDateKey(now);
  if (key < today) return { tone: 'overdue', label: `просрочено · ${caption}` };
  if (key === today) return { tone: 'today', label: 'сегодня' };
  if (category === 'paused') return { tone: 'waiting', label: `ждём до ${caption}` };
  return { tone: 'plain', label: caption };
}

export interface DropPlan {
  /** Перенос самой задачи: новая колонка и/или позиция. */
  move: { id: string; column_id: string; sort_order: number } | null;
  /** Соседи в целевой колонке, чей sort_order сдвинулся. */
  reorder: { id: string; sort_order: number }[];
}

interface DropTask {
  id: string;
  column_id: string | null;
  sort_order: number | null;
}

/**
 * План DnD между колонками — та же механика, что у `ProjectBoard` (перенос =
 * смена колонки, lane пересчитает БД), вынесенная в чистую функцию ради тестов.
 * `overId` — id колонки ЛИБО id задачи, над которой отпустили.
 * null — бросили мимо или на своё же место.
 */
export function planBoardDrop(
  tasksByColumn: Record<string, readonly DropTask[]>,
  columnIds: readonly string[],
  activeId: string,
  overId: string,
): DropPlan | null {
  const all = Object.values(tasksByColumn).flat();
  const task = all.find((t) => t.id === activeId);
  if (!task) return null;

  let targetCol: string | null = null;
  if (columnIds.includes(overId)) targetCol = overId;
  else targetCol = all.find((t) => t.id === overId)?.column_id ?? null;
  if (!targetCol) return null;

  const current = tasksByColumn[targetCol] ?? [];
  const others = current.filter((t) => t.id !== activeId);

  let idx = others.length;
  if (overId !== targetCol) {
    const i = others.findIndex((t) => t.id === overId);
    if (i !== -1) idx = i;
  }

  if (task.column_id === targetCol && current.findIndex((t) => t.id === activeId) === idx) {
    return null;
  }

  const list = [...others.slice(0, idx), task, ...others.slice(idx)];
  const plan: DropPlan = { move: null, reorder: [] };
  list.forEach((t, i) => {
    if (t.id === activeId) {
      if (task.column_id !== targetCol || t.sort_order !== i) {
        plan.move = { id: t.id, column_id: targetCol, sort_order: i };
      }
    } else if (t.sort_order !== i) {
      plan.reorder.push({ id: t.id, sort_order: i });
    }
  });
  return plan;
}
