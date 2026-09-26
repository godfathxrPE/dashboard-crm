import { diffDaysKey, mskDateKey } from '@/lib/utils/date-helpers';

// ═══════════════════════════════════════════════════════
// S-DEAL-SUMMARY-1 (W9): чистые вычисления строк «Сводки» сделки.
//
// «Сейчас» — аргумент, ноль React и запросов: юнит-тесты в tests/unit.
//
// ⚠️ Ключ дня — `mskDateKey`, арифметика — `diffDaysKey` (UTC-полдень). Готовый
// `daysSince` (date-helpers) не подходит: он режет сутки по локальной зоне
// браузера (`toDateString`), а `created_at` — `timestamptz`, и сделка, созданная
// в 23:30 МСК, у него «в работе 0 дн.» ещё три часа после полуночи по Москве.
// `daysOverdue` (task-view) считает то же, что здесь, но принимает `Task` —
// сигнатура не наша, а формула та же (`mskDateKey` + полдень).
// ═══════════════════════════════════════════════════════

/** Полных календарных дней (МСК) от создания сделки до «сейчас», ≥ 0. */
export function daysInWork(createdAt: string, now: Date): number {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return 0;
  return Math.max(0, diffDaysKey(mskDateKey(created), mskDateKey(now)));
}

/**
 * Дней просрочки дедлайна сделки (> 0), иначе 0. Дедлайн сегодня — НЕ просрочен:
 * срок «до конца дня», а не «до полуночи вчера».
 *
 * `projects.deadline` — колонка `date` (голый 'YYYY-MM-DD'), поэтому ключ дня
 * берётся срезом, а не через `mskDateKey`: `new Date('2026-08-14')` — это UTC-
 * полночь, и любое приведение к зоне сдвинуло бы календарную дату.
 */
export function deadlineOverdueDays(deadline: string | null | undefined, now: Date): number {
  if (!deadline) return 0;
  const diff = diffDaysKey(deadline.slice(0, 10), mskDateKey(now));
  return Number.isFinite(diff) && diff > 0 ? diff : 0;
}

/** Минимум полей стейкхолдера, нужный выбору ЛПР. */
export interface DecisionMakerCandidate {
  role: string | null;
  created_at: string;
}

/**
 * ЛПР для строки «Сводки»: первый `decision_maker` по `created_at` (тот же ключ,
 * что закрывает слот ЛПР в `resolveRoleSlots`, — строка и слот назовут одного
 * человека) и число остальных для «+N». Нет ни одного — `null`.
 */
export function pickDecisionMaker<T extends DecisionMakerCandidate>(
  stakeholders: readonly T[],
): { first: T; extra: number } | null {
  const dms = stakeholders
    .filter((s) => s.role === 'decision_maker')
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (dms.length === 0) return null;
  return { first: dms[0], extra: dms.length - 1 };
}
