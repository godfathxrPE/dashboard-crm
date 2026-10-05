// src/lib/domain/decide-clock.ts — S-TODAY-FOCUS-3
//
// Таймер остывания хода: сколько из `decideDays` дней срыва или тишины уже прошло и
// в какой день сделка уйдёт в «Решить судьбу». Основание — `_analysis/today-focus-spec.md`,
// §6 (решения F-16, F-17).
//
// Ветки — те же, что в `classifyDeal`, и в том же порядке: таймер и группа обязаны
// совпадать (`state === 'over'` ⇔ группа `decide` для основ `overdue`/`silence`).
// Правило групп живёт в `classifyDeal`; здесь только счёт дней от уже готового `cls`.
//
// `now` — аргумент, `Date.now()` внутри нет.

import { addDaysKey, diffDaysKey, mskDateKey } from '@/lib/utils/date-helpers';
import { DEFAULT_TODAY_THRESHOLDS, type TodayThresholds } from './today-deals';
import type { TodayDealView } from './today-model';

export type ClockBasis = 'overdue' | 'silence' | 'none';
export type ClockState = 'calm' | 'warn' | 'over' | 'none' | 'done';

export interface DecideClock {
  basis: ClockBasis;
  /** Дней после срока (overdue) или тишины (silence); null — таймера нет. */
  days: number | null;
  /** Доля кольца, 0…1. */
  ratio: number;
  /** День перехода в «Решить судьбу», 'YYYY-MM-DD'; null — таймера нет. */
  tipKey: string | null;
  state: ClockState;
}

/** Остаток дней окна, с которого кольцо — `--warning`. */
export const DECIDE_WARN_DAYS = 5;

export function decideClock(
  view: Pick<TodayDealView, 'source' | 'cls' | 'planned'>,
  now: Date,
  done: boolean,
  thresholds: TodayThresholds = DEFAULT_TODAY_THRESHOLDS,
): DecideClock {
  const W = thresholds.decideDays;
  const { cls, source } = view;
  const eventTodayKey = mskDateKey(now);

  let basis: ClockBasis;
  let days: number | null = null;
  let fromKey: string | null = null;

  if (cls.stepAhead || (cls.noStep && view.planned !== null)) {
    basis = 'none';
  } else if (cls.overdueDays !== null && cls.touchedAfterDue && cls.lastTouchAt) {
    // Касание после срока: отсчёт тишины от него — та же ветка, что «stale/decide» в
    // `classifyDeal`. `lastTouchAt` проверен там же: без него `classifyDeal` уходит
    // в ветку срыва, и сюда — тоже.
    basis = 'silence';
    fromKey = mskDateKey(cls.lastTouchAt);
    days = diffDaysKey(fromKey, eventTodayKey);
  } else if (cls.overdueDays !== null) {
    basis = 'overdue';
    fromKey = source.next_action_date as string;
    days = cls.overdueDays;
  } else if (cls.noStep) {
    // День отсчёта — поздний из последнего касания и создания сделки (`classifyDeal`).
    basis = 'silence';
    const createdKey = mskDateKey(source.created_at);
    const touchKey = cls.lastTouchAt ? mskDateKey(cls.lastTouchAt) : null;
    fromKey = touchKey && touchKey > createdKey ? touchKey : createdKey;
    days = diffDaysKey(fromKey, eventTodayKey);
  } else {
    // Шаг есть, не впереди и не просрочен — у открытой сделки не бывает; закрытая
    // (`getDealHealth` → 'ok') уходит в первую ветку. Таймера нет.
    basis = 'none';
  }

  const tipKey = fromKey !== null ? addDaysKey(fromKey, W + 1) : null;

  let state: ClockState;
  if (done) state = 'done';
  else if (basis === 'none' || days === null) state = 'none';
  else if (days > W) state = 'over';
  else if (W - days <= DECIDE_WARN_DAYS) state = 'warn';
  else state = 'calm';

  const ratio =
    state === 'over' || state === 'done' ? 1
    : state === 'none' || days === null ? 0
    : Math.min(1, Math.max(0, days / W));

  return { basis, days, ratio, tipKey, state };
}
