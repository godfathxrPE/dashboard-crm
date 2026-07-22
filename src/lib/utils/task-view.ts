import type { Task } from '@/types/entities';
import { mskDateKey } from './date-helpers';

// ─── Классификатор источника задачи ────────────────────────────────────────
// projects.type: 'client' → sales-задача (сделка), 'internal'|'delivery' →
// WBS-задача проекта внедрения; нет project_id (или не пришёл join) → личная.
// Тип связанного проекта прилетает из join в use-tasks (project.type).

export type TaskSource = 'deal' | 'project' | 'personal';

export function taskSource(task: Task): TaskSource {
  if (!task.project_id || !task.project) return 'personal';
  return task.project.type === 'client' ? 'deal' : 'project';
}

// ─── Предикат «Мои» ─────────────────────────────────────────────────────────
// «Мои» = назначенные мне ИЛИ ничьи, что я создал сам. Неназначенная задача,
// которую создал я (единственный оператор по сделке), — тоже моя работа; иначе
// вся просрочка sales-задач (assigned_to=NULL) выпадает из дефолтного Список/Мои.
// Делегированное другому (assigned_to=чужой) не подхватывается — второе условие
// требует assigned_to IS NULL. `== null` намеренно ловит и optimistic-undefined.
export function isMine(task: Task, userId: string | null): boolean {
  if (!userId) return false;
  if (task.assigned_to === userId) return true;
  return task.assigned_to == null && task.created_by === userId;
}

export const TASK_SOURCES: readonly TaskSource[] = ['deal', 'project', 'personal'];

export const SOURCE_LABELS: Record<TaskSource, string> = {
  deal: 'Сделки',
  project: 'Проекты',
  personal: 'Личное',
};

// ─── Дата-бакеты по дедлайну ────────────────────────────────────────────────
// Сравнение дней — по MSK через mskDateKey (не browser-local/UTC), иначе
// пограничные часы уезжают на сутки (learnings S-GANTT-*). deadline — timestamptz.
// overdue = deadline < сегодня(MSK) И lane !== 'done' (логика 1:1 с taskToEvent):
// выполненная задача с прошедшим сроком не «просрочена», а сворачивается в «Позже».

export type DateBucket = 'overdue' | 'today' | 'tomorrow' | 'this_week' | 'later' | 'no_date';

export const BUCKET_ORDER: readonly DateBucket[] = [
  'overdue',
  'today',
  'tomorrow',
  'this_week',
  'later',
  'no_date',
];

export const BUCKET_LABELS: Record<DateBucket, string> = {
  overdue: 'Просрочено',
  today: 'Сегодня',
  tomorrow: 'Завтра',
  this_week: 'Эта неделя',
  later: 'Позже',
  no_date: 'Без даты',
};

/** Сдвиг YYYY-MM-DD ключа на N дней (на UTC-полдне — без прыжка через полночь). */
function shiftKey(dateKey: string, days: number): string {
  const ms = Date.parse(`${dateKey}T12:00:00Z`) + days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Конец текущей недели (воскресенье) относительно MSK-ключа today. */
function endOfWeekKey(todayKey: string): string {
  const dow = new Date(Date.parse(`${todayKey}T12:00:00Z`)).getUTCDay(); // 0=вс..6=сб
  return shiftKey(todayKey, (7 - dow) % 7);
}

export function taskDateBucket(task: Task, now: Date): DateBucket {
  if (!task.deadline) return 'no_date';

  const todayKey = mskDateKey(now);
  const dKey = mskDateKey(task.deadline);

  if (dKey < todayKey) return task.lane === 'done' ? 'later' : 'overdue';
  if (dKey === todayKey) return 'today';
  if (dKey === shiftKey(todayKey, 1)) return 'tomorrow';
  if (dKey <= endOfWeekKey(todayKey)) return 'this_week';
  return 'later';
}

/** Целых дней просрочки (>0), MSK. Для подписи «N дн.» на overdue-строке. */
export function daysOverdue(task: Task, now: Date): number {
  if (!task.deadline) return 0;
  const todayMs = Date.parse(`${mskDateKey(now)}T12:00:00Z`);
  const dMs = Date.parse(`${mskDateKey(task.deadline)}T12:00:00Z`);
  const diff = Math.round((todayMs - dMs) / 86_400_000);
  return diff > 0 ? diff : 0;
}

/** Группировка задач по бакетам в порядке BUCKET_ORDER; пустые бакеты опущены. */
export function groupByBucket(
  tasks: Task[],
  now: Date,
): { bucket: DateBucket; tasks: Task[] }[] {
  const map = new Map<DateBucket, Task[]>();
  for (const t of tasks) {
    const b = taskDateBucket(t, now);
    (map.get(b) ?? map.set(b, []).get(b)!).push(t);
  }
  return BUCKET_ORDER.filter((b) => map.has(b)).map((b) => ({ bucket: b, tasks: map.get(b)! }));
}
