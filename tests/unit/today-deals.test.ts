import { describe, it, expect } from 'vitest';
import {
  classifyDeal,
  compareByWeight,
  countNoStepAhead,
  phaseRank,
  pickMoves,
  riskSignals,
  type MoveCandidate,
  type TodayDealClass,
  type TodayDealInput,
  type TodayGroup,
} from '@/lib/domain/today-deals';
import { dropStageBounces, touchKindOfActivity, type DealTouch } from '@/lib/domain/deal-touch';
import { TODAY_2026_10_03, type FixtureDeal } from './fixtures/today-2026-10-03';

// «Сейчас» — аргументом, середина дня по МСК.
const NOW = new Date('2026-10-03T12:00:00+03:00');

/** 12:00 МСК дня `YYYY-MM-DD`. */
function noon(day: string): string {
  return `${day}T12:00:00+03:00`;
}

function input(over: Partial<TodayDealInput> = {}): TodayDealInput {
  return {
    id: 'd1',
    status: 'open',
    next_step: 'Позвонить',
    next_action_date: '2026-10-02',
    created_at: noon('2026-08-01'),
    touches: [],
    signals: [],
    planned: null,
    ...over,
  };
}

function cls(over: Partial<TodayDealClass> = {}): TodayDealClass {
  return {
    group: 'fresh',
    stepAhead: false,
    noStep: false,
    overdueDays: 1,
    touchedAfterDue: false,
    lastTouchAt: null,
    assignedToday: null,
    ...over,
  };
}

function cand(id: string, over: Partial<Omit<MoveCandidate, 'cls'>> & { cls?: Partial<TodayDealClass> } = {}): MoveCandidate {
  const { cls: clsOver, ...rest } = over;
  return { id, phaseRank: 0, stageOrder: 1, amount: null, snoozed: false, ...rest, cls: cls(clsOver) };
}

describe('classifyDeal', () => {
  it('срок вчера, касаний после нет → fresh, overdueDays 1', () => {
    const c = classifyDeal(input({ next_action_date: '2026-10-02' }), NOW);
    expect(c.group).toBe('fresh');
    expect(c.overdueDays).toBe(1);
    expect(c.touchedAfterDue).toBe(false);
  });

  it('касание в день срока → fresh; на следующий день → stale', () => {
    const due = '2026-09-30';
    const onDue = classifyDeal(input({ next_action_date: due, touches: [{ at: noon(due), kind: 'note' }] }), NOW);
    expect(onDue.group).toBe('fresh');
    const after = classifyDeal(
      input({ next_action_date: due, touches: [{ at: noon('2026-10-01'), kind: 'note' }] }),
      NOW,
    );
    expect(after.group).toBe('stale');
    expect(after.touchedAfterDue).toBe(true);
  });

  it('срок 14 дней назад, тишина → fresh; 15 дней → decide', () => {
    expect(classifyDeal(input({ next_action_date: '2026-09-19' }), NOW).group).toBe('fresh');
    const c = classifyDeal(input({ next_action_date: '2026-09-18' }), NOW);
    expect(c.group).toBe('decide');
    expect(c.overdueDays).toBe(15);
  });

  it('срок 40 дней назад, касание через день после срока, дальше тишина → decide', () => {
    const c = classifyDeal(
      input({ next_action_date: '2026-08-24', touches: [{ at: noon('2026-08-25'), kind: 'note' }] }),
      NOW,
    );
    expect(c.overdueDays).toBe(40);
    expect(c.touchedAfterDue).toBe(true);
    expect(c.group).toBe('decide');
  });

  it('касание после срока: тишина 14 дней → stale; 15 дней → decide', () => {
    const at = (day: string) =>
      classifyDeal(input({ next_action_date: '2026-08-24', touches: [{ at: noon(day), kind: 'note' }] }), NOW).group;
    expect(at('2026-09-19')).toBe('stale');
    expect(at('2026-09-18')).toBe('decide');
  });

  it('тишина считается от последнего касания, а не от первого после срока', () => {
    const c = classifyDeal(
      input({
        next_action_date: '2026-08-24',
        touches: [
          { at: noon('2026-08-25'), kind: 'note' },
          { at: noon('2026-10-01'), kind: 'call' },
        ],
      }),
      NOW,
    );
    expect(c.group).toBe('stale');
  });

  it('касание завтрашним днём в правиле «после срока» не участвует', () => {
    const c = classifyDeal(
      input({ next_action_date: '2026-10-02', touches: [{ at: noon('2026-10-04'), kind: 'note' }] }),
      NOW,
    );
    expect(c.group).toBe('fresh');
    expect(c.lastTouchAt).toBeNull();
  });

  it('шаг сегодня → plan, assignedToday { time: null }', () => {
    const c = classifyDeal(input({ next_action_date: '2026-10-03' }), NOW);
    expect(c.group).toBe('plan');
    expect(c.stepAhead).toBe(true);
    expect(c.assignedToday).toEqual({ time: null });
  });

  it('шаг через неделю и quote_expired → risk', () => {
    const c = classifyDeal(
      input({ next_action_date: '2026-10-10', signals: [{ key: 'quote_expired', since: '2026-10-01' }] }),
      NOW,
    );
    expect(c.group).toBe('risk');
    expect(c.assignedToday).toBeNull();
  });

  it('шага нет, сделке 3 дня, касаний нет → stale, noStep; сделке 20 дней → decide', () => {
    const young = classifyDeal(input({ next_step: null, next_action_date: null, created_at: noon('2026-09-30') }), NOW);
    expect(young.group).toBe('stale');
    expect(young.noStep).toBe(true);
    expect(young.overdueDays).toBeNull();
    const old = classifyDeal(input({ next_step: null, next_action_date: null, created_at: noon('2026-09-13') }), NOW);
    expect(old.group).toBe('decide');
  });

  it('шага нет, тишина отсчитывается от более позднего из касания и создания', () => {
    const c = classifyDeal(
      input({
        next_step: null,
        next_action_date: null,
        created_at: noon('2026-08-01'),
        touches: [{ at: noon('2026-09-25'), kind: 'call' }],
      }),
      NOW,
    );
    expect(c.group).toBe('stale');
  });

  it('шага нет, встреча через два дня → plan, noStep; встреча сегодня в 14:00 → assignedToday 14:00', () => {
    const later = classifyDeal(
      input({ next_step: null, planned: { dateKey: '2026-10-05', time: '11:00', kind: 'meeting' } }),
      NOW,
    );
    expect(later.group).toBe('plan');
    expect(later.noStep).toBe(true);
    expect(later.assignedToday).toBeNull();
    const today = classifyDeal(
      input({ next_step: null, planned: { dateKey: '2026-10-03', time: '14:00', kind: 'meeting' } }),
      NOW,
    );
    expect(today.assignedToday).toEqual({ time: '14:00' });
  });

  it('время встречи побеждает пустое время шага', () => {
    const c = classifyDeal(
      input({ next_action_date: '2026-10-03', planned: { dateKey: '2026-10-03', time: '09:30', kind: 'call' } }),
      NOW,
    );
    expect(c.assignedToday).toEqual({ time: '09:30' });
  });

  it('шаг из одних пробелов — шага нет', () => {
    const c = classifyDeal(input({ next_step: '   ', next_action_date: '2026-10-10' }), NOW);
    expect(c.noStep).toBe(true);
    expect(c.stepAhead).toBe(false);
    expect(c.group).not.toBe('plan');
  });
});

describe('riskSignals', () => {
  const empty = { quotes: [], tasks: [], calls: [] };

  it('КП sent со сроком вчера → quote_expired; draft и accepted → пусто', () => {
    const q = (status: 'sent' | 'draft' | 'accepted') => ({
      id: 'q1',
      status,
      created_at: noon('2026-09-01'),
      valid_until: '2026-10-02',
    });
    expect(riskSignals({ ...empty, quotes: [q('sent')] }, NOW)).toEqual([
      { key: 'quote_expired', since: '2026-10-02' },
    ]);
    expect(riskSignals({ ...empty, quotes: [q('draft')] }, NOW)).toEqual([]);
    expect(riskSignals({ ...empty, quotes: [q('accepted')] }, NOW)).toEqual([]);
  });

  it('задача done с прошлым дедлайном → пусто; две задачи now (10-е и 15-е) → один сигнал с 10-го', () => {
    expect(riskSignals({ ...empty, tasks: [{ lane: 'done', deadline: noon('2026-09-10') }] }, NOW)).toEqual([]);
    expect(
      riskSignals(
        {
          ...empty,
          tasks: [
            { lane: 'now', deadline: noon('2026-09-15') },
            { lane: 'now', deadline: noon('2026-09-10') },
          ],
        },
        NOW,
      ),
    ).toEqual([{ key: 'task_overdue', since: '2026-09-10' }]);
  });

  it('звонок pending вчера → call_overdue; done → пусто', () => {
    expect(riskSignals({ ...empty, calls: [{ status: 'pending', date: noon('2026-10-02') }] }, NOW)).toEqual([
      { key: 'call_overdue', since: '2026-10-02' },
    ]);
    expect(riskSignals({ ...empty, calls: [{ status: 'done', date: noon('2026-10-02') }] }, NOW)).toEqual([]);
  });

  it('порядок фиксирован: quote_expired, task_overdue, call_overdue', () => {
    const keys = riskSignals(
      {
        quotes: [{ id: 'q1', status: 'sent', created_at: noon('2026-09-01'), valid_until: '2026-09-20' }],
        tasks: [{ lane: 'now', deadline: noon('2026-09-15') }],
        calls: [{ status: 'pending', date: noon('2026-09-01') }],
      },
      NOW,
    ).map((s) => s.key);
    expect(keys).toEqual(['quote_expired', 'task_overdue', 'call_overdue']);
  });
});

describe('compareByWeight', () => {
  it('closing > approval > working > attraction', () => {
    const list = ['attraction', 'closing', 'working', 'approval'].map((p) => cand(p, { phaseRank: phaseRank(p) }));
    expect([...list].sort(compareByWeight).map((c) => c.id)).toEqual(['closing', 'approval', 'working', 'attraction']);
  });

  it('неизвестная фаза — 0', () => {
    expect(phaseRank('initiated')).toBe(0);
    expect(phaseRank(null)).toBe(0);
  });

  it('при равной фазе большая сумма выше, без суммы ниже, дальше — order_index', () => {
    const list = [
      cand('none-low', { amount: null, stageOrder: 1 }),
      cand('small', { amount: 100 }),
      cand('none-high', { amount: null, stageOrder: 5 }),
      cand('big', { amount: 1000 }),
    ];
    expect([...list].sort(compareByWeight).map((c) => c.id)).toEqual(['big', 'small', 'none-high', 'none-low']);
  });
});

describe('pickMoves', () => {
  it('назначено пять при лимите три → все пять, добора нет', () => {
    const list = [
      ...['a1', 'a2', 'a3', 'a4', 'a5'].map((id) => cand(id, { cls: { group: 'plan', assignedToday: { time: null } } })),
      cand('f1', { amount: 999 }),
    ];
    const moves = pickMoves(list, 3);
    expect(moves).toHaveLength(5);
    expect(moves.every((m) => m.slot === 'assigned')).toBe(true);
  });

  it('назначенные: со временем по времени, затем без времени по весу', () => {
    const list = [
      cand('noTime-low', { cls: { group: 'plan', assignedToday: { time: null } }, stageOrder: 1 }),
      cand('t14', { cls: { group: 'plan', assignedToday: { time: '14:00' } } }),
      cand('noTime-high', { cls: { group: 'plan', assignedToday: { time: null } }, stageOrder: 5 }),
      cand('t09', { cls: { group: 'plan', assignedToday: { time: '09:00' } } }),
    ];
    expect(pickMoves(list, 3).map((m) => m.id)).toEqual(['t09', 't14', 'noTime-high', 'noTime-low']);
  });

  it('сумм в пуле нет → третий слот — следующая fresh', () => {
    const list = [cand('f1', { stageOrder: 3 }), cand('f2', { stageOrder: 2 }), cand('f3', { stageOrder: 1 })];
    expect(pickMoves(list, 3)).toEqual([
      { id: 'f1', slot: 'fresh' },
      { id: 'f2', slot: 'fresh' },
      { id: 'f3', slot: 'fresh' },
    ]);
  });

  it('свежих нет → biggest, затем stale по весу, затем decide', () => {
    const list = [
      cand('d1', { cls: { group: 'decide' }, stageOrder: 9 }),
      cand('s-low', { cls: { group: 'stale' }, stageOrder: 1 }),
      cand('big', { cls: { group: 'decide' }, amount: 5000 }),
      cand('s-high', { cls: { group: 'stale' }, stageOrder: 4 }),
    ];
    expect(pickMoves(list, 4)).toEqual([
      { id: 'big', slot: 'biggest' },
      { id: 's-high', slot: 'fill' },
      { id: 's-low', slot: 'fill' },
      { id: 'd1', slot: 'fill' },
    ]);
  });

  it('отложенная сделка не попадает ни в один слот', () => {
    const list = [
      cand('snoozed-assigned', { snoozed: true, cls: { group: 'plan', assignedToday: { time: '10:00' } } }),
      cand('snoozed-big', { snoozed: true, amount: 10_000 }),
      cand('f1'),
      cand('s1', { cls: { group: 'stale' } }),
    ];
    const ids = pickMoves(list, 3).map((m) => m.id);
    expect(ids).not.toContain('snoozed-assigned');
    expect(ids).not.toContain('snoozed-big');
    expect(ids).toEqual(['f1', 's1']);
  });

  it('risk и plan в добор не идут', () => {
    const list = [cand('r1', { cls: { group: 'risk' }, amount: 10 }), cand('p1', { cls: { group: 'plan' } })];
    expect(pickMoves(list, 3)).toEqual([]);
  });

  it('вход перемешан → результат тот же', () => {
    const list = [
      cand('a', { cls: { group: 'plan', assignedToday: { time: null } } }),
      cand('f1', { stageOrder: 3 }),
      cand('f2', { stageOrder: 2 }),
      cand('big', { cls: { group: 'stale' }, amount: 700 }),
      cand('s1', { cls: { group: 'stale' } }),
    ];
    const expected = pickMoves(list, 4);
    expect(pickMoves([...list].reverse(), 4)).toEqual(expected);
    expect(pickMoves([list[3], list[0], list[4], list[2], list[1]], 4)).toEqual(expected);
  });
});

// ── Эталон: снимок БД 03.10.2026 ──────────────────────────

function touchesOf(d: FixtureDeal): DealTouch[] {
  // Строки журнала — сырые, как в БД: вид по типу события, отскок снимается до касаний.
  const stageRows = dropStageBounces(
    d.stageLog
      .filter((r) => touchKindOfActivity(r.event_type) === 'stage')
      .map((r) => ({ at: r.created_at, fromStageId: r.payload.from_stage_id, toStageId: r.payload.to_stage_id })),
  );
  return [...d.touches, ...stageRows.map((r) => ({ at: r.at, kind: 'stage' as const }))];
}

function classifySnapshot(now: Date) {
  return TODAY_2026_10_03.map((d) => {
    const c = classifyDeal(
      {
        id: d.id,
        status: 'open',
        next_step: 'Шаг',
        next_action_date: d.nextActionDate,
        created_at: d.createdAt,
        touches: touchesOf(d),
        signals: riskSignals({ quotes: d.quotes, tasks: d.tasks, calls: d.calls }, now),
        planned: null,
      },
      now,
    );
    const candidate: MoveCandidate = {
      id: d.id,
      cls: c,
      phaseRank: phaseRank(d.phaseGroup),
      stageOrder: d.stageOrder,
      amount: d.amount,
      snoozed: false,
    };
    return candidate;
  });
}

function groupsOf(list: readonly MoveCandidate[]): Record<TodayGroup, string[]> {
  const out: Record<TodayGroup, string[]> = { fresh: [], risk: [], stale: [], decide: [], plan: [] };
  for (const c of list) out[c.cls.group].push(c.id);
  return out;
}

describe('эталон: снимок 03.10.2026', () => {
  it('17 сделок в фикстуре', () => {
    expect(TODAY_2026_10_03).toHaveLength(17);
  });

  it('03.10 19:00 МСК: группы 3/1/3/8/2, без шага впереди 14, ходы Лоренц · Нытва · ЭЙЧ ЭНД ЭН', () => {
    const now = new Date('2026-10-03T19:00:00+03:00');
    const list = classifySnapshot(now);
    const groups = groupsOf(list);
    expect(groups.fresh).toEqual(['lorenz', 'ar', 'nytva']);
    expect(groups.risk).toEqual(['fitnes']);
    expect(groups.stale).toEqual(['glorus', 'hleb', 'rodina']);
    expect(groups.decide).toEqual(['prodfond', 'mdm', 'hn', 'lid', 'rus', 'agroh', 'agros', 'zerde']);
    expect(groups.plan).toEqual(['stroy', 'anfish']);
    expect(countNoStepAhead(list.map((c) => c.cls))).toBe(14);
    expect(pickMoves(list, 3)).toEqual([
      { id: 'lorenz', slot: 'fresh' },
      { id: 'nytva', slot: 'fresh' },
      { id: 'hn', slot: 'biggest' },
    ]);
  });

  it('сигналы fitnes — из riskSignals: КП истекло 18.09, задача просрочена с 15.09', () => {
    const fitnes = TODAY_2026_10_03.find((d) => d.id === 'fitnes') as FixtureDeal;
    const now = new Date('2026-10-03T19:00:00+03:00');
    expect(riskSignals({ quotes: fitnes.quotes, tasks: fitnes.tasks, calls: fitnes.calls }, now)).toEqual([
      { key: 'quote_expired', since: '2026-09-18' },
      { key: 'task_overdue', since: '2026-09-15' },
    ]);
  });

  it('отскок «Зерде Фито» не касание: без отсева сделка ушла бы в stale', () => {
    const zerde = TODAY_2026_10_03.find((d) => d.id === 'zerde') as FixtureDeal;
    expect(touchesOf(zerde)).toEqual([]);
  });

  it('05.10 09:00 МСК: ходы Анфиш · Строй (назначены), Лоренц (biggest)', () => {
    const now = new Date('2026-10-05T09:00:00+03:00');
    expect(pickMoves(classifySnapshot(now), 3)).toEqual([
      { id: 'anfish', slot: 'assigned' },
      { id: 'stroy', slot: 'assigned' },
      { id: 'lorenz', slot: 'biggest' },
    ]);
  });
});
