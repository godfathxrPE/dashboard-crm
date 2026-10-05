import { describe, it, expect } from 'vitest';
import { classifyDeal, type TodayDealInput } from '@/lib/domain/today-deals';
import { decideClock, DECIDE_WARN_DAYS } from '@/lib/domain/decide-clock';
import type { TodayDealView } from '@/lib/domain/today-model';

// «Сейчас» — 04.10.2026 12:00 МСК, окно W = 14 (дефолт порогов).
const NOW = new Date('2026-10-04T12:00:00+03:00');

/** 12:00 МСК дня `YYYY-MM-DD`. */
function noon(day: string): string {
  return `${day}T12:00:00+03:00`;
}

function input(over: Partial<TodayDealInput> = {}): TodayDealInput {
  return {
    id: 'd1',
    status: 'open',
    next_step: 'Позвонить',
    next_action_date: '2026-09-30',
    created_at: noon('2026-08-01'),
    touches: [],
    signals: [],
    planned: null,
    ...over,
  };
}

/** Вид — через настоящий `classifyDeal`: таймер считается от того же `cls`, что и группа. */
function viewOf(inp: TodayDealInput): Pick<TodayDealView, 'source' | 'cls' | 'planned'> {
  return {
    source: {
      id: inp.id,
      name: 'Сделка',
      companyName: null,
      contactId: null,
      status: inp.status,
      type: 'client',
      next_step: inp.next_step,
      next_action_date: inp.next_action_date,
      created_at: inp.created_at,
      budget: null,
      stage: null,
    },
    cls: classifyDeal(inp, NOW),
    planned: inp.planned,
  };
}

const noStep = { next_step: null, next_action_date: null };

describe('decideClock', () => {
  it('срок 30.09, касаний после нет → overdue, 4 дня, переход 15.10, calm', () => {
    const c = decideClock(viewOf(input({ next_action_date: '2026-09-30' })), NOW, false);
    expect(c).toEqual({ basis: 'overdue', days: 4, ratio: 4 / 14, tipKey: '2026-10-15', state: 'calm' });
  });

  it('срок 25.09 → 9 дней, переход 10.10, warn (остаток 5)', () => {
    const c = decideClock(viewOf(input({ next_action_date: '2026-09-25' })), NOW, false);
    expect(c.days).toBe(9);
    expect(c.tipKey).toBe('2026-10-10');
    expect(14 - (c.days ?? 0)).toBe(DECIDE_WARN_DAYS);
    expect(c.state).toBe('warn');
  });

  it('срок 20.09 → 14 дней, warn, доля 1 — ещё не over', () => {
    const c = decideClock(viewOf(input({ next_action_date: '2026-09-20' })), NOW, false);
    expect(c.days).toBe(14);
    expect(c.state).toBe('warn');
    expect(c.ratio).toBe(1);
  });

  it('срок 19.09 → 15 дней, over, переход 04.10', () => {
    const c = decideClock(viewOf(input({ next_action_date: '2026-09-19' })), NOW, false);
    expect(c).toEqual({ basis: 'overdue', days: 15, ratio: 1, tipKey: '2026-10-04', state: 'over' });
  });

  it('срок 10.09, касание 28.09 → silence, 6 дней от 28.09, переход 13.10, calm', () => {
    const c = decideClock(
      viewOf(input({ next_action_date: '2026-09-10', touches: [{ at: noon('2026-09-28'), kind: 'note' }] })),
      NOW,
      false,
    );
    expect(c).toEqual({ basis: 'silence', days: 6, ratio: 6 / 14, tipKey: '2026-10-13', state: 'calm' });
  });

  it('шага нет, создана 18.09, касаний нет → silence, 16 дней, переход 03.10, over', () => {
    const c = decideClock(viewOf(input({ ...noStep, created_at: noon('2026-09-18') })), NOW, false);
    expect(c).toEqual({ basis: 'silence', days: 16, ratio: 1, tipKey: '2026-10-03', state: 'over' });
  });

  it('шага нет, создана 01.08, касание 30.09 → отсчёт от 30.09', () => {
    const c = decideClock(
      viewOf(input({ ...noStep, created_at: noon('2026-08-01'), touches: [{ at: noon('2026-09-30'), kind: 'call' }] })),
      NOW,
      false,
    );
    expect(c.basis).toBe('silence');
    expect(c.days).toBe(4);
    expect(c.tipKey).toBe('2026-10-15');
  });

  it('шаг впереди → none, days null, доля 0', () => {
    const c = decideClock(viewOf(input({ next_action_date: '2026-10-09' })), NOW, false);
    expect(c).toEqual({ basis: 'none', days: null, ratio: 0, tipKey: null, state: 'none' });
  });

  it('шаг на сегодня — тоже впереди → none', () => {
    const c = decideClock(viewOf(input({ next_action_date: '2026-10-04' })), NOW, false);
    expect(c.state).toBe('none');
  });

  it('шага нет, встреча впереди → none', () => {
    const c = decideClock(
      viewOf(input({ ...noStep, created_at: noon('2026-08-01'), planned: { dateKey: '2026-10-07', time: '11:00', kind: 'meeting' } })),
      NOW,
      false,
    );
    expect(c.basis).toBe('none');
    expect(c.state).toBe('none');
  });

  it('done = true при любом входе → done, доля 1', () => {
    for (const inp of [
      input({ next_action_date: '2026-09-30' }),
      input({ next_action_date: '2026-09-19' }),
      input({ next_action_date: '2026-10-09' }),
      input({ ...noStep, created_at: noon('2026-09-18') }),
    ]) {
      const c = decideClock(viewOf(inp), NOW, true);
      expect(c.state).toBe('done');
      expect(c.ratio).toBe(1);
    }
  });

  it('порог из аргумента: W = 7, срок 25.09 → over', () => {
    const c = decideClock(viewOf(input({ next_action_date: '2026-09-25' })), NOW, false, { decideDays: 7, movesLimit: 3 });
    expect(c.state).toBe('over');
    expect(c.tipKey).toBe('2026-10-03');
  });
});

describe('decideClock ⇔ classifyDeal', () => {
  const cases: [string, TodayDealInput][] = [
    ['срок 30.09', input({ next_action_date: '2026-09-30' })],
    ['срок 25.09', input({ next_action_date: '2026-09-25' })],
    ['срок 20.09', input({ next_action_date: '2026-09-20' })],
    ['срок 19.09', input({ next_action_date: '2026-09-19' })],
    ['срок 10.09, касание 28.09', input({ next_action_date: '2026-09-10', touches: [{ at: noon('2026-09-28'), kind: 'note' }] })],
    ['шага нет, создана 18.09', input({ ...noStep, created_at: noon('2026-09-18') })],
    ['шага нет, касание 30.09', input({ ...noStep, touches: [{ at: noon('2026-09-30'), kind: 'call' }] })],
    ['срок 01.09, касание 15.09 — тишина 19 дней', input({ next_action_date: '2026-09-01', touches: [{ at: noon('2026-09-15'), kind: 'note' }] })],
  ];

  it.each(cases)('%s: state over ⇔ группа decide', (_label, inp) => {
    const v = viewOf(inp);
    const c = decideClock(v, NOW, false);
    expect(c.basis).not.toBe('none');
    expect(c.state === 'over').toBe(v.cls.group === 'decide');
  });
});
