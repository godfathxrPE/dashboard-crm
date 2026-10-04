// src/lib/domain/today-model.ts — S-TODAY-V3-SCREEN-1
//
// Модель экрана «Сегодня»: «сделка + касания + КП + задачи + звонки + встречи →
// ходы и группы». Это место, где ошибку не видно глазами, поэтому сборка вынесена
// из компонента и проверяется без сети и без React (`tests/unit/today-model.test.ts`).
//
// Правила групп, сигналов и ходов здесь НЕ живут — они в `today-deals.ts`. Модель
// только раскладывает входные строки по сделкам, зовёт домен и решает, что печатать
// во второй строке колонки срока (`after`): компонент сам ничего не выбирает.
//
// `now` — аргумент. Ось дня: `date`-колонки — `localDateKey(now)`, `timestamptz` —
// `mskDateKey` (спека, п. 2 «Сегодня»).

import type { DealStatus } from '@/types/database';
import { localDateKey, mskDateKey, mskTime, shiftDateKeyByBuckets } from '@/lib/utils/date-helpers';
import { dealHeaderAmount, type DealHeaderAmount, type QuoteAmountLike } from './deal-amount';
import type { DealTouch, TouchKind } from './deal-touch';
import {
  DEFAULT_TODAY_THRESHOLDS,
  TODAY_GROUP_ORDER,
  classifyDeal,
  compareByWeight,
  countNoStepAhead,
  phaseRank,
  pickMoves,
  riskSignals,
  type Move,
  type MoveCandidate,
  type MoveSlot,
  type PlannedEvent,
  type RiskSignal,
  type TodayDealClass,
  type TodayGroup,
  type TodayThresholds,
} from './today-deals';

export interface TodayDealSource {
  id: string;
  name: string;
  companyName: string | null;
  contactId: string | null;
  /** `DealStatus`, а не `string`: его требует `classifyDeal` (через `getDealHealth`). */
  status: DealStatus;
  type: string;
  next_step: string | null;
  next_action_date: string | null;
  created_at: string;
  budget: number | null;
  stage: { name: string; phase_group: string | null; order_index: number } | null;
}

export interface TodayDealTask { id: string; text: string; deadline: string | null; overdue: boolean }
export interface TodayDealCall { id: string; date: string; overdue: boolean }

/** Что печатать во второй строке колонки срока. Выбор — в модели, текст — в компоненте. */
export type AfterKind =
  | 'silence_after_due'   // срок прошёл, касаний после него нет, группа fresh
  | 'touched_after_due'   // после срока было касание: день и вид последнего
  | 'silence_since'       // группа decide, касания были: день последнего
  | 'no_touches'          // касаний в окне нет
  | 'last_touch'          // шаг впереди или шага нет: день и вид последнего касания
  | 'signals'             // шаг впереди, есть сигналы риска
  | 'planned';            // шага нет, впереди встреча или звонок

export interface AfterInfo {
  kind: AfterKind;
  /** День последнего касания, если он нужен формулировке. */
  dateKey: string | null;
  touchKind: TouchKind | null;
  /** Для `no_touches`: окно касаний покрывает всю жизнь сделки. */
  wholeLife: boolean;
}

export interface TodayDealView {
  source: TodayDealSource;
  cls: TodayDealClass;
  signals: RiskSignal[];
  amount: DealHeaderAmount;
  planned: PlannedEvent | null;
  /** Касания сделки по возрастанию времени — для полосы «Было». */
  touches: DealTouch[];
  after: AfterInfo;
  /** Задачи сделки: в работе (`lane === 'now'`) либо не закрытые с дедлайном сегодня или раньше. */
  tasks: TodayDealTask[];
  /** Мои `pending`-звонки сделки с днём сегодня или раньше. */
  calls: TodayDealCall[];
  /** Слот хода; `null` — сделка не в ходах. */
  slot: MoveSlot | null;
}

export interface TodayGroupView {
  key: TodayGroup;
  /** Строки группы: без ходов и без отложенных, по `compareByWeight`. */
  rows: TodayDealView[];
  /** Всего сделок группы, включая ходы, без отложенных. */
  total: number;
  inMoves: number;
}

export interface TodayModel {
  /** Кандидаты в ходы по всем сделкам — вход `pickMoves`; понадобятся набору дня в ACT-1. */
  candidates: MoveCandidate[];
  /** Результат `pickMoves` по кандидатам. */
  computed: Move[];
  moves: TodayDealView[];
  groups: TodayGroupView[];
  snoozed: TodayDealView[];
  total: number;
  noStepAhead: number;
  noAmount: number;
}

/** КП в объёме, нужном сумме (`dealHeaderAmount`) и сигналу `quote_expired`. */
export type TodayQuote = QuoteAmountLike & { valid_until: string | null };

export interface TodayModelInput {
  deals: readonly TodayDealSource[];
  touches: ReadonlyMap<string, readonly DealTouch[]>;
  quotes: ReadonlyMap<string, readonly TodayQuote[]>;
  tasks: readonly { id: string; project_id: string | null; lane: string; deadline: string | null; text: string }[];
  calls: readonly { id: string; project_id: string | null; status: string; date: string }[];
  /** `meetings.date` — колонка `date`, `meetings.time` — `time` ('HH:MM:SS'). */
  meetings: readonly { id: string; project_id: string | null; date: string; time: string | null }[];
  snoozedDealIds: ReadonlySet<string>;
  /**
   * ACT-1: набор ходов дня (`day-moves.ts`). Задан — `moves` это сделки из него в
   * этом порядке (id без сделки пропускаются), строки групп и `inMoves` считаются
   * относительно него. Не задан — ходы дня это `computed`.
   */
  picked?: readonly string[];
  /** Слот хода на момент взятия в набор — для «почему здесь» сделанного хода. */
  pickedSlots?: Readonly<Record<string, MoveSlot>>;
  /**
   * ACT-1: группа ПОКАЗА записанной сегодня сделки. Строка остаётся на своём месте до
   * перезагрузки, а не прыгает в «По плану» сразу после записи. Действует только на
   * строки групп: `noStepAhead` — по настоящему классу, на сделки из `picked` карта
   * не действует.
   */
  pinnedGroups?: ReadonlyMap<string, TodayGroup>;
  /** День, с которого загружены касания: 'YYYY-MM-DD'. */
  sinceKey: string;
}

/** Запас касаний до самого старого просроченного срока: видно, что было ДО срыва. */
export const TOUCH_LEAD_DAYS = 30;
/** Глубже окно касаний не уходит: касание старше для экрана не существует. */
export const TOUCH_MAX_DAYS = 120;

/**
 * День, с которого грузятся касания экрана (спека, п. 2 «Окно касаний»): самый
 * ранний просроченный срок шага минус 30 дней; просроченных нет — сегодня минус 30;
 * не глубже 120 дней от сегодня. Это день, а не время: ключ запроса не должен
 * меняться каждую миллисекунду.
 */
export function touchesSinceKey(deals: readonly { next_action_date: string | null }[], now: Date): string {
  const todayKey = localDateKey(now);
  let earliest: string | null = null;
  for (const d of deals) {
    const key = d.next_action_date?.slice(0, 10) ?? null;
    if (key && key < todayKey && (earliest === null || key < earliest)) earliest = key;
  }
  const from = shiftDateKeyByBuckets(earliest ?? todayKey, 'day', -TOUCH_LEAD_DAYS);
  const floor = shiftDateKeyByBuckets(todayKey, 'day', -TOUCH_MAX_DAYS);
  return from < floor ? floor : from;
}

/** Строки по `project_id`; строки без сделки отбрасываются. */
function byProject<T extends { project_id: string | null }>(rows: readonly T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    if (!r.project_id) continue;
    const list = map.get(r.project_id);
    if (list) list.push(r);
    else map.set(r.project_id, [r]);
  }
  return map;
}

/** Ближайшее событие: раньше день, затем раньше время; без времени — после событий со временем. */
function comparePlanned(a: PlannedEvent, b: PlannedEvent): number {
  if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? -1 : 1;
  if (a.time === b.time) return 0;
  if (a.time === null) return 1;
  if (b.time === null) return -1;
  return a.time < b.time ? -1 : 1;
}

function afterOf(
  cls: TodayDealClass,
  signals: readonly RiskSignal[],
  planned: PlannedEvent | null,
  touches: readonly DealTouch[],
  wholeLife: boolean,
): AfterInfo {
  const last = cls.lastTouchAt ? touches.find((t) => t.at === cls.lastTouchAt) ?? null : null;
  const lastInfo = (kind: AfterKind): AfterInfo => ({
    kind,
    dateKey: last ? mskDateKey(last.at) : null,
    touchKind: last ? last.kind : null,
    wholeLife,
  });
  const bare = (kind: AfterKind): AfterInfo => ({ kind, dateKey: null, touchKind: null, wholeLife });

  if (cls.overdueDays !== null) {
    if (cls.group === 'stale') return lastInfo('touched_after_due');
    if (cls.group === 'fresh') return bare('silence_after_due');
    if (cls.group === 'decide') return last ? lastInfo('silence_since') : bare('no_touches');
  }
  if (cls.stepAhead && signals.length > 0) return bare('signals');
  if (cls.noStep && planned) return bare('planned');
  return last ? lastInfo('last_touch') : bare('no_touches');
}

export function buildTodayModel(
  input: TodayModelInput,
  now: Date,
  thresholds: TodayThresholds = DEFAULT_TODAY_THRESHOLDS,
): TodayModel {
  const todayKey = localDateKey(now);
  const tasksBy = byProject(input.tasks);
  const callsBy = byProject(input.calls);
  const meetingsBy = byProject(input.meetings);

  const views: TodayDealView[] = [];
  const candidates: MoveCandidate[] = [];
  const candidateById = new Map<string, MoveCandidate>();

  for (const deal of input.deals) {
    const touches = [...(input.touches.get(deal.id) ?? [])];
    const quotes = input.quotes.get(deal.id) ?? [];
    const dealTasks = tasksBy.get(deal.id) ?? [];
    const dealCalls = callsBy.get(deal.id) ?? [];
    const dealMeetings = meetingsBy.get(deal.id) ?? [];

    const signals = riskSignals({ quotes, tasks: dealTasks, calls: dealCalls }, now);

    // Ближайшее «впереди»: встреча с днём сегодня или позже, `pending`-звонок так же.
    const plannedAll: PlannedEvent[] = [
      ...dealMeetings
        .filter((m) => m.date.slice(0, 10) >= todayKey)
        .map((m): PlannedEvent => ({
          dateKey: m.date.slice(0, 10),
          time: m.time ? m.time.slice(0, 5) : null,
          kind: 'meeting',
        })),
      ...dealCalls
        .filter((c) => c.status === 'pending' && mskDateKey(c.date) >= todayKey)
        .map((c): PlannedEvent => ({ dateKey: mskDateKey(c.date), time: mskTime(c.date), kind: 'call' })),
    ].sort(comparePlanned);
    const planned = plannedAll[0] ?? null;

    const cls = classifyDeal(
      {
        id: deal.id,
        status: deal.status,
        next_step: deal.next_step,
        next_action_date: deal.next_action_date,
        created_at: deal.created_at,
        touches,
        signals,
        planned,
      },
      now,
      thresholds,
    );

    // То, что раньше стояло отдельными строками экрана («Задачи в работе», звонки),
    // теперь живёт внутри сделки — и не должно пропасть при переезде.
    const tasks: TodayDealTask[] = dealTasks
      .filter((t) => t.lane === 'now' || (t.lane !== 'done' && !!t.deadline && mskDateKey(t.deadline) <= todayKey))
      .map((t) => ({
        id: t.id,
        text: t.text,
        deadline: t.deadline,
        overdue: !!t.deadline && mskDateKey(t.deadline) < todayKey,
      }));
    const calls: TodayDealCall[] = dealCalls
      .filter((c) => c.status === 'pending' && mskDateKey(c.date) <= todayKey)
      .map((c) => ({ id: c.id, date: c.date, overdue: mskDateKey(c.date) < todayKey }));

    const amount = dealHeaderAmount(quotes, deal.budget);
    const wholeLife = mskDateKey(deal.created_at) >= input.sinceKey;

    const candidate: MoveCandidate = {
      id: deal.id,
      cls,
      phaseRank: phaseRank(deal.stage?.phase_group ?? null),
      stageOrder: deal.stage?.order_index ?? 0,
      amount: amount.amount,
      snoozed: input.snoozedDealIds.has(deal.id),
    };
    candidates.push(candidate);
    candidateById.set(deal.id, candidate);

    views.push({
      source: deal,
      cls,
      signals,
      amount,
      planned,
      touches,
      after: afterOf(cls, signals, planned, touches, wholeLife),
      tasks,
      calls,
      slot: null,
    });
  }

  const computed = pickMoves(candidates, thresholds.movesLimit);
  const slotById = new Map(computed.map((m) => [m.id, m.slot] as const));
  const viewById = new Map(views.map((v) => [v.source.id, v] as const));

  // Ходы дня: набор дня, если он задан, иначе `computed`. id без сделки (закрыта,
  // ушла с экрана) пропускается молча — набор хранится до конца дня.
  const moveIds = input.picked
    ? input.picked.filter((id) => viewById.has(id))
    : computed.map((m) => m.id);
  const inMoves = new Set(moveIds);
  for (const v of views) {
    const id = v.source.id;
    v.slot = inMoves.has(id) ? input.pickedSlots?.[id] ?? slotById.get(id) ?? 'fill' : null;
  }

  const byWeight = (a: TodayDealView, b: TodayDealView) =>
    compareByWeight(candidateById.get(a.source.id) as MoveCandidate, candidateById.get(b.source.id) as MoveCandidate);

  const visible = views.filter((v) => !input.snoozedDealIds.has(v.source.id));
  const shownGroup = (v: TodayDealView): TodayGroup =>
    (!inMoves.has(v.source.id) && input.pinnedGroups?.get(v.source.id)) || v.cls.group;
  const groups: TodayGroupView[] = TODAY_GROUP_ORDER.map((key) => {
    const members = visible.filter((v) => shownGroup(v) === key).sort(byWeight);
    return {
      key,
      rows: members.filter((v) => !inMoves.has(v.source.id)),
      total: members.length,
      inMoves: members.filter((v) => inMoves.has(v.source.id)).length,
    };
  });

  return {
    candidates,
    computed,
    moves: moveIds.map((id) => viewById.get(id)).filter((v): v is TodayDealView => !!v),
    groups,
    snoozed: views.filter((v) => input.snoozedDealIds.has(v.source.id)).sort(byWeight),
    // Отложенные считаются: это факт о книге сделок, а не о видимых строках.
    total: views.length,
    noStepAhead: countNoStepAhead(views.map((v) => v.cls)),
    noAmount: views.filter((v) => v.amount.amount === null).length,
  };
}
