import { describe, it, expect } from 'vitest';
import {
  afterText,
  dayText,
  dayWeekdayText,
  deadlineText,
  dueText,
  inMovesText,
  moveWhy,
  namesText,
  planItemText,
  plannedText,
  signalsText,
} from '@/lib/utils/today-text';
import type { AfterInfo, TodayDealView } from '@/lib/domain/today-model';
import type { TodayDealClass } from '@/lib/domain/today-deals';

// Вид собирается руками, без `buildTodayModel`: здесь проверяются слова, а не модель.

function cls(over: Partial<TodayDealClass> = {}): TodayDealClass {
  return {
    group: 'fresh',
    stepAhead: false,
    noStep: false,
    overdueDays: null,
    touchedAfterDue: false,
    lastTouchAt: null,
    assignedToday: null,
    ...over,
  };
}

function view(over: {
  cls?: Partial<TodayDealClass>;
  after?: Partial<AfterInfo>;
  next_action_date?: string | null;
  next_step?: string | null;
  planned?: TodayDealView['planned'];
  signals?: TodayDealView['signals'];
} = {}): TodayDealView {
  return {
    source: {
      id: 'd1',
      name: 'Стройпарк',
      companyName: null,
      contactId: null,
      status: 'open',
      type: 'client',
      next_step: over.next_step === undefined ? 'Позвонить' : over.next_step,
      next_action_date: over.next_action_date === undefined ? '2026-09-30' : over.next_action_date,
      created_at: '2026-08-01T12:00:00+03:00',
      budget: null,
      stage: { name: 'Квалификация', phase_group: 'attraction', order_index: 2 },
    },
    cls: cls(over.cls),
    signals: over.signals ?? [],
    amount: { amount: null, source: 'none', version: null },
    planned: over.planned ?? null,
    touches: [],
    after: { kind: 'no_touches', dateKey: null, touchKind: null, wholeLife: false, ...over.after },
    tasks: [],
    calls: [],
    slot: null,
  };
}

describe('dayText / dayWeekdayText', () => {
  it('30 сент; пт 9 окт без запятой', () => {
    expect(dayText('2026-09-30')).toBe('30 сент');
    expect(dayWeekdayText('2026-10-09')).toBe('пт 9 окт');
  });
});

describe('dueText', () => {
  it('просрочка 4 дня, срок 30.09', () => {
    expect(dueText(view({ cls: { overdueDays: 4 } }))).toEqual({ label: 'срок 30 сент', days: '4 дн.' });
  });

  it('шаг впереди на 09.10', () => {
    expect(dueText(view({ next_action_date: '2026-10-09', cls: { stepAhead: true, group: 'plan' } })))
      .toEqual({ label: 'шаг пт 9 окт', days: null });
  });

  it('шага нет', () => {
    expect(dueText(view({ next_step: null, next_action_date: null, cls: { noStep: true, group: 'stale' } })))
      .toEqual({ label: 'шага нет', days: null });
  });
});

describe('afterText', () => {
  it('по каждому виду', () => {
    expect(afterText(view({ after: { kind: 'silence_after_due' } }))).toBe('после срока тишина');
    expect(afterText(view({ after: { kind: 'touched_after_due', dateKey: '2026-09-30', touchKind: 'stage' } })))
      .toBe('после срока: 30 сент — смена стадии');
    expect(afterText(view({ after: { kind: 'silence_since', dateKey: '2026-09-17' } }))).toBe('тишина с 17 сент');
    expect(afterText(view({ after: { kind: 'no_touches', wholeLife: true } }))).toBe('касаний не было');
    expect(afterText(view({ after: { kind: 'no_touches', wholeLife: false } }))).toBe('давно без касаний');
    expect(afterText(view({ after: { kind: 'last_touch', dateKey: '2026-10-02', touchKind: 'note' } })))
      .toBe('касание 2 окт — заметка');
  });

  it('signals и planned — тексты signalsText и plannedText', () => {
    const signals = [{ key: 'quote_expired' as const, since: '2026-09-18' }];
    expect(afterText(view({ after: { kind: 'signals' }, signals }))).toBe(signalsText(signals));
    const planned = { dateKey: '2026-10-08', time: '14:00', kind: 'meeting' as const };
    expect(afterText(view({ after: { kind: 'planned' }, planned }))).toBe(plannedText(planned));
  });
});

describe('signalsText', () => {
  it('КП и задача; звонок', () => {
    expect(signalsText([
      { key: 'quote_expired', since: '2026-09-18' },
      { key: 'task_overdue', since: '2026-09-15' },
    ])).toBe('КП истекло 18 сент · задача с 15 сент');
    expect(signalsText([{ key: 'call_overdue', since: '2026-10-01' }])).toBe('звонок с 1 окт');
  });
});

describe('plannedText', () => {
  it('встреча со временем; звонок без времени', () => {
    expect(plannedText({ dateKey: '2026-10-08', time: '14:00', kind: 'meeting' })).toBe('встреча 8 окт, 14:00');
    expect(plannedText({ dateKey: '2026-10-05', time: null, kind: 'call' })).toBe('звонок 5 окт');
  });
});

describe('moveWhy', () => {
  it('fresh, 4 дня, 6 переносов: стадия и «перенесён 6 раз», без «после срока тишина»', () => {
    const why = moveWhy(view({ cls: { overdueDays: 4 }, after: { kind: 'silence_after_due' } }), 'fresh', 6);
    expect(why.lead).toBe('Свежий срыв.');
    expect(why.due?.days).toBe('4 дн.');
    expect(why.facts).toContain('Квалификация');
    expect(why.facts).toContain('перенесён 6 раз');
    expect(why.facts).not.toContain('после срока тишина');
  });

  it('1 перенос — слова «перенесён» нет', () => {
    const why = moveWhy(view({ cls: { overdueDays: 4 }, after: { kind: 'silence_after_due' } }), 'fresh', 1);
    expect(why.facts.join(' ')).not.toContain('перенесён');
  });

  it('biggest, decide, silence_since 17.09: days null, «тишина с 17 сент»', () => {
    const why = moveWhy(
      view({ cls: { group: 'decide', overdueDays: 16 }, after: { kind: 'silence_since', dateKey: '2026-09-17' } }),
      'biggest',
      0,
    );
    expect(why.lead).toBe('Крупнейшая сумма без шага.');
    expect(why.due?.days).toBeNull();
    expect(why.facts).toContain('тишина с 17 сент');
  });

  it('assigned со временем 11:00: due null, первый факт — время', () => {
    const why = moveWhy(
      view({ cls: { group: 'plan', stepAhead: true, assignedToday: { time: '11:00' } }, after: { kind: 'last_touch' } }),
      'assigned',
      0,
    );
    expect(why.due).toBeNull();
    expect(why.facts[0]).toBe('11:00');
  });
});

describe('inMovesText', () => {
  it('одна / две / 3', () => {
    expect(inMovesText(1)).toBe('одна — в ходах наверху');
    expect(inMovesText(2)).toBe('две — в ходах наверху');
    expect(inMovesText(3)).toBe('3 — в ходах наверху');
  });
});

describe('namesText', () => {
  it('пять — все; семь — пять и «и ещё 2»', () => {
    expect(namesText(['А', 'Б', 'В', 'Г', 'Д'])).toBe('А, Б, В, Г, Д');
    expect(namesText(['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж'])).toBe('А, Б, В, Г, Д и ещё 2');
  });
});

describe('planItemText', () => {
  it('шаг впереди на 05.10; шага нет, встреча 08.10 в 14:00', () => {
    expect(planItemText(view({ next_action_date: '2026-10-05', cls: { stepAhead: true, group: 'plan' } })))
      .toBe('Стройпарк — пн 5 окт');
    expect(planItemText(view({
      next_step: null,
      next_action_date: null,
      cls: { noStep: true, group: 'plan' },
      planned: { dateKey: '2026-10-08', time: '14:00', kind: 'meeting' },
    }))).toBe('Стройпарк — чт 8 окт, 14:00');
  });
});

describe('deadlineText', () => {
  it('другой год, прошедший, будущий в этом году, сегодня', () => {
    expect(deadlineText('2027-08-14', '2026-10-04')).toBe('Дедлайн сделки · 14 авг 2027');
    expect(deadlineText('2026-09-30', '2026-10-04')).toBe('Дедлайн сделки был 30 сент');
    expect(deadlineText('2026-12-01', '2026-10-04')).toBe('Дедлайн сделки · 1 дек');
    expect(deadlineText('2026-10-04', '2026-10-04')).toBe('Дедлайн сделки · 4 окт');
  });
});
