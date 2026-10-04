// src/lib/domain/today-deals.ts — S-TODAY-V3-DOMAIN-1
//
// Правила экрана «Сегодня» v3: группа сделки, сигналы риска, вес и тройка ходов.
// Экран делит сделки по ТИПУ РЕШЕНИЯ, а не по типу сущности; правило одно и
// проверяется без сети. Основание — `_analysis/today-v3-spec.md`, п. 2.
//
// Две оси дня (спека, п. 2 «Сегодня»): `date`-колонки (`next_action_date`,
// `valid_until`) сравниваются с `localDateKey(now)` — как у `getDealHealth`;
// день события из `timestamptz` — `mskDateKey`.
//
// `now` — аргумент, `Date.now()` внутри нет.

import type { DealStatus } from '@/types/database';
import { DEAL_PHASE_ORDER } from '@/lib/constants/phase-labels';
import { diffDaysKey, localDateKey, mskDateKey } from '@/lib/utils/date-helpers';
import { getDealHealth, getNextActionOverdueDays } from '@/lib/utils/deal-health';
import { lastTouchAt as lastTouchAtOf, type DealTouch } from './deal-touch';
import { pickActiveQuote, type QuoteLike } from './quote-version';
import { quoteValidity } from './quote-validity';

export type TodayGroup = 'fresh' | 'risk' | 'stale' | 'decide' | 'plan';

/** Порядок групп на экране. */
export const TODAY_GROUP_ORDER: readonly TodayGroup[] = ['fresh', 'risk', 'stale', 'decide', 'plan'];

export interface TodayThresholds {
  /** Дней тишины, после которых сделка без шага впереди уходит в «решить судьбу». */
  decideDays: number;
  /** Ходов на день. */
  movesLimit: number;
}
export const DEFAULT_TODAY_THRESHOLDS: TodayThresholds = { decideDays: 14, movesLimit: 3 };

// ── Сигналы риска ─────────────────────────────────────────

export type RiskSignalKey = 'quote_expired' | 'task_overdue' | 'call_overdue';

export interface RiskSignal {
  key: RiskSignalKey;
  /** День, с которого сигнал горит: 'YYYY-MM-DD'. */
  since: string;
}

export interface RiskInput {
  /** `QuoteLike` — из `quote-version.ts`: его требует `pickActiveQuote`. */
  quotes: readonly (QuoteLike & { valid_until: string | null })[];
  tasks: readonly { lane: string; deadline: string | null }[];
  calls: readonly { status: string; date: string }[];
}

/** Самый ранний ключ дня из списка; `null` — список пуст. */
function earliestKey(keys: readonly string[]): string | null {
  let best: string | null = null;
  for (const k of keys) if (best === null || k < best) best = k;
  return best;
}

/**
 * Сигналы риска сделки. Порядок в массиве фиксирован:
 * `quote_expired`, `task_overdue`, `call_overdue`.
 *
 * Только они переводят сделку с шагом впереди в `risk`. Норма стадии сюда НЕ входит
 * намеренно: на снимке 03.10 она превышена у 12 сделок из 17 — сигнал горел бы всегда.
 */
export function riskSignals(input: RiskInput, now: Date): RiskSignal[] {
  const todayKey = localDateKey(now);
  const out: RiskSignal[] = [];

  // Черновик и принятое КП сигнала не дают: истёк срок только у того КП, ответа на
  // которое мы ждём.
  const active = pickActiveQuote(input.quotes);
  if (
    active &&
    active.status === 'sent' &&
    active.valid_until &&
    quoteValidity(active.valid_until, now).level === 'expired'
  ) {
    out.push({ key: 'quote_expired', since: active.valid_until.slice(0, 10) });
  }

  const taskSince = earliestKey(
    input.tasks
      .filter((t) => t.lane !== 'done' && t.deadline)
      .map((t) => mskDateKey(t.deadline as string))
      .filter((k) => k < todayKey),
  );
  if (taskSince) out.push({ key: 'task_overdue', since: taskSince });

  const callSince = earliestKey(
    input.calls
      .filter((c) => c.status === 'pending')
      .map((c) => mskDateKey(c.date))
      .filter((k) => k < todayKey),
  );
  if (callSince) out.push({ key: 'call_overdue', since: callSince });

  return out;
}

// ── Группа сделки ─────────────────────────────────────────

export interface PlannedEvent {
  /** День события: 'YYYY-MM-DD'. */
  dateKey: string;
  /** 'HH:MM' по МСК; `null` — времени нет. */
  time: string | null;
  kind: 'meeting' | 'call';
}

export interface TodayDealInput {
  id: string;
  /** Тот же тип статуса, что у параметра `getDealHealth` (`DealStatus`). */
  status: DealStatus;
  next_step: string | null;
  next_action_date: string | null;
  created_at: string;
  touches: readonly DealTouch[];
  signals: readonly RiskSignal[];
  /** Ближайшая встреча или звонок сделки с днём сегодня или позже; `null` — нет. */
  planned: PlannedEvent | null;
}

export interface TodayDealClass {
  group: TodayGroup;
  /** Шаг с датой сегодня или позже. */
  stepAhead: boolean;
  /** Шага или его даты нет. */
  noStep: boolean;
  /** Календарных дней после срока шага; `null` — срока нет или он не прошёл. */
  overdueDays: number | null;
  /** Было касание в день строго после дня срока. */
  touchedAfterDue: boolean;
  /** ISO последнего касания с днём не позже дня `now`. */
  lastTouchAt: string | null;
  /** Назначено на сегодня; `time` — у встречи или звонка. */
  assignedToday: { time: string | null } | null;
}

/**
 * Группа сделки экрана «Сегодня». Порядок проверок — таблица спринта:
 *
 * 1. шаг впереди, сигналов нет → `plan`;          2. шаг впереди, сигнал есть → `risk`;
 * 3. срок прошёл, касание после дня срока, от последнего касания ≤ decideDays → `stale`;
 *    касание после дня срока было, но тишина после него > decideDays → `decide`;
 * 4. срок прошёл, касаний после нет, просрочка ≤ decideDays → `fresh`; 5. > decideDays → `decide`;
 * 6. шага нет, есть встреча/звонок впереди → `plan`;
 * 7. шага нет, тишина ≤ decideDays → `stale`;     8. тишина > decideDays → `decide`.
 *
 * Трихотомию «впереди / просрочен / нет шага» даёт `getDealHealth` — второй формулы
 * нет. Проверок `status` сверх её собственной тоже нет: вызывающий код отдаёт только
 * сделки экрана (спека, п. 2).
 */
export function classifyDeal(
  input: TodayDealInput,
  now: Date,
  thresholds: TodayThresholds = DEFAULT_TODAY_THRESHOLDS,
): TodayDealClass {
  const health = getDealHealth(input, now);
  const todayKey = localDateKey(now);
  // Ось событий — МСК; та же отсечка «не позже сегодня», что у `lastTouchAt`.
  const eventTodayKey = mskDateKey(now);

  const noStep = !input.next_step?.trim() || !input.next_action_date;
  const stepAhead = !noStep && health === 'ok';
  const dueKey = noStep ? null : (input.next_action_date as string);

  const overdueDays =
    health === 'overdue-action' && dueKey ? getNextActionOverdueDays(dueKey, now) : null;

  // Касание в сам день срока «после срока» не считается — строго `>` по ключам дня.
  const touchedAfterDue =
    dueKey !== null &&
    input.touches.some((t) => {
      const key = mskDateKey(t.at);
      return key > dueKey && key <= eventTodayKey;
    });

  const lastTouchAt = lastTouchAtOf(input.touches, now);

  // Время встречи или звонка побеждает пустое время шага — поэтому `planned` первым.
  let assignedToday: { time: string | null } | null = null;
  if (input.planned && input.planned.dateKey === todayKey) {
    assignedToday = { time: input.planned.time };
  } else if (stepAhead && dueKey === todayKey) {
    assignedToday = { time: null };
  }

  let group: TodayGroup;
  if (health === 'ok') {
    group = input.signals.length > 0 ? 'risk' : 'plan';
  } else if (health === 'overdue-action') {
    if (touchedAfterDue && lastTouchAt) {
      // Касание после срока держит сделку в «Обновить шаг», пока оно свежее. Дальше —
      // та же тишина, что у сделки без шага (правила 7–8): порог один на оба случая.
      const silentDays = diffDaysKey(mskDateKey(lastTouchAt), eventTodayKey);
      group = silentDays <= thresholds.decideDays ? 'stale' : 'decide';
    } else {
      group = (overdueDays ?? 0) <= thresholds.decideDays ? 'fresh' : 'decide';
    }
  } else if (input.planned) {
    group = 'plan';
  } else {
    // День отсчёта тишины — более поздний из последнего касания и создания сделки:
    // новая сделка без касаний не должна сразу уходить в «решить судьбу».
    const createdKey = mskDateKey(input.created_at);
    const touchKey = lastTouchAt ? mskDateKey(lastTouchAt) : null;
    const fromKey = touchKey && touchKey > createdKey ? touchKey : createdKey;
    group = diffDaysKey(fromKey, eventTodayKey) <= thresholds.decideDays ? 'stale' : 'decide';
  }

  return { group, stepAhead, noStep, overdueDays, touchedAfterDue, lastTouchAt, assignedToday };
}

// ── Вес и тройка ходов ────────────────────────────────────

export interface MoveCandidate {
  id: string;
  cls: TodayDealClass;
  /** Индекс фазы в `DEAL_PHASE_ORDER` (`lib/constants/phase-labels.ts`): attraction 0 … closing 3; неизвестная фаза — 0. */
  phaseRank: number;
  /** `pipeline_stages.order_index`. */
  stageOrder: number;
  /** Копейки, из `dealHeaderAmount`; `null` — суммы нет. */
  amount: number | null;
  snoozed: boolean;
}

export type MoveSlot = 'assigned' | 'fresh' | 'biggest' | 'fill';

export interface Move {
  id: string;
  slot: MoveSlot;
}

/** Индекс фазы в `DEAL_PHASE_ORDER`; неизвестная или пустая — 0. Второго списка фаз нет. */
export function phaseRank(phaseGroup: string | null): number {
  if (!phaseGroup) return 0;
  const idx = (DEAL_PHASE_ORDER as readonly string[]).indexOf(phaseGroup);
  return idx < 0 ? 0 : idx;
}

/** `null` — в конце при любом направлении сортировки. */
function compareNullable(a: number | null, b: number | null, dir: 1 | -1): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * dir;
}

/**
 * Вес сделки (меньше — выше): фаза ↓ → сумма ↓ (без суммы в конце) →
 * `order_index` ↓ → просрочка ↑ (без просрочки в конце) → `id`.
 */
export function compareByWeight(a: MoveCandidate, b: MoveCandidate): number {
  if (a.phaseRank !== b.phaseRank) return b.phaseRank - a.phaseRank;
  const byAmount = compareNullable(a.amount, b.amount, -1);
  if (byAmount !== 0) return byAmount;
  if (a.stageOrder !== b.stageOrder) return b.stageOrder - a.stageOrder;
  const byOverdue = compareNullable(a.cls.overdueDays, b.cls.overdueDays, 1);
  if (byOverdue !== 0) return byOverdue;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Ходы дня (спека, п. 2 «Ходы дня»).
 *
 * 1. Назначенное на сегодня — все, даже сверх лимита: со временем по времени, затем
 *    без времени по весу.
 * 2. Свободные слоты, кроме последнего, — `fresh` по весу.
 * 3. Последний свободный — наибольшая сумма среди `fresh`/`stale`/`decide`, ещё не
 *    взятых; сумм нет — следующая `fresh`.
 * 4. Остаток — `stale` по весу, затем `decide` по весу.
 *
 * Отложенные не участвуют нигде. Вход не мутируется, его порядок не значим.
 */
export function pickMoves(candidates: readonly MoveCandidate[], limit: number): Move[] {
  const active = candidates.filter((c) => !c.snoozed);

  const assigned = active
    .filter((c) => c.cls.assignedToday)
    .sort((a, b) => {
      const ta = a.cls.assignedToday?.time ?? null;
      const tb = b.cls.assignedToday?.time ?? null;
      if (ta !== null && tb !== null && ta !== tb) return ta < tb ? -1 : 1;
      if (ta !== null && tb === null) return -1;
      if (ta === null && tb !== null) return 1;
      return compareByWeight(a, b);
    });

  const moves: Move[] = assigned.map((c) => ({ id: c.id, slot: 'assigned' }));
  const free = Math.max(0, limit - assigned.length);
  if (free === 0) return moves;

  const taken = new Set(moves.map((m) => m.id));
  const pool = active
    .filter((c) => !taken.has(c.id))
    .filter((c) => c.cls.group === 'fresh' || c.cls.group === 'stale' || c.cls.group === 'decide')
    .sort(compareByWeight);
  const notTaken = () => pool.filter((c) => !taken.has(c.id));
  const take = (c: MoveCandidate, slot: MoveSlot) => {
    moves.push({ id: c.id, slot });
    taken.add(c.id);
  };

  for (const c of notTaken().filter((x) => x.cls.group === 'fresh').slice(0, free - 1)) {
    take(c, 'fresh');
  }

  // Пул уже отсортирован по весу — первый с максимальной суммой и есть тай-брейк.
  let biggest: MoveCandidate | null = null;
  for (const c of notTaken()) {
    if (c.amount === null) continue;
    if (biggest === null || (biggest.amount ?? 0) < c.amount) biggest = c;
  }
  if (biggest) {
    take(biggest, 'biggest');
  } else {
    const nextFresh = notTaken().find((c) => c.cls.group === 'fresh');
    if (nextFresh) take(nextFresh, 'fresh');
  }

  const fillOrder = [
    ...notTaken().filter((c) => c.cls.group === 'stale'),
    ...notTaken().filter((c) => c.cls.group === 'decide'),
  ];
  for (const c of fillOrder) {
    if (moves.length - assigned.length >= free) break;
    take(c, 'fill');
  }

  // Выход: assigned, fresh, biggest, fill. Резервная `fresh` из шага 3 уже стоит
  // после основных `fresh` и до `fill` — порядок вставки совпадает с порядком выхода.
  return moves;
}

/** «У N из M нет шага впереди»: N — сделки групп `fresh`, `stale`, `decide`. */
export function countNoStepAhead(classes: readonly TodayDealClass[]): number {
  return classes.filter((c) => c.group === 'fresh' || c.group === 'stale' || c.group === 'decide').length;
}
