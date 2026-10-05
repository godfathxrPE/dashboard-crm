import { describe, it, expect } from 'vitest';
import {
  afterText,
  amountSourceText,
  clockCaption,
  dayText,
  dayWeekdayText,
  deadlineText,
  doneText,
  dueText,
  focusKicker,
  inMovesText,
  namesText,
  planItemText,
  plannedText,
  quoteLineText,
  rowPill,
  signalsText,
} from '@/lib/utils/today-text';
import type { AfterInfo, TodayDealView } from '@/lib/domain/today-model';
import type { TodayDealClass } from '@/lib/domain/today-deals';
import type { DecideClock } from '@/lib/domain/decide-clock';

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


describe('doneText', () => {
  it('итог в памяти: записано, перенесено, закрыто', () => {
    expect(doneText(view(), { outcome: 'written', dateKey: '2026-10-06', moveCount: 0 })).toBe('Записано в сделку · шаг вт 6 окт');
    expect(doneText(view(), { outcome: 'moved', dateKey: '2026-10-12', moveCount: 7 }))
      .toBe('Перенесён на пн 12 окт · в сделке «перенесён 7 раз»');
    expect(doneText(view(), { outcome: 'cleared', dateKey: null, moveCount: 0 })).toBe('Шаг закрыт · сделка осталась без шага');
  });

  it('после перезагрузки — по сделке: шаг впереди или шага нет', () => {
    expect(doneText(view({ next_action_date: '2026-10-06', cls: { stepAhead: true, group: 'plan' } }), null))
      .toBe('Записано в сделку · шаг вт 6 окт');
    expect(doneText(view({ next_step: null, next_action_date: null, cls: { noStep: true, group: 'stale' } }), null))
      .toBe('Шаг закрыт · сделка осталась без шага');
  });
});

// ── S-TODAY-FOCUS-1 ──

/** `now` экрана — фиксированный день: 04.10.2026, полдень МСК. */
const NOW = new Date('2026-10-04T12:00:00+03:00');

function quote(over: Partial<Parameters<typeof quoteLineText>[0] & object> = {}): NonNullable<Parameters<typeof quoteLineText>[0]> {
  return {
    status: 'draft',
    amount: null,
    created_at: '2026-09-07T10:00:00+03:00',
    sent_at: null,
    accepted_at: null,
    valid_until: null,
    updated_at: '2026-09-20T10:00:00+03:00',
    ...over,
  };
}

describe('focusKicker', () => {
  it('ход 1 из 3, свежий срыв 4 дня', () => {
    const v = { ...view({ cls: { overdueDays: 4, group: 'fresh' } }), slot: 'fresh' as const };
    expect(focusKicker(v, { n: 1, of: 3 })).toEqual({ lead: 'Ход 1 из 3 · Свежий срыв', days: '4 дн.', hot: true });
  });

  it('строка «Обновить шаг», 26 дней после срока', () => {
    expect(focusKicker(view({ cls: { overdueDays: 26, group: 'stale' } }), null))
      .toEqual({ lead: 'Обновить шаг', days: '26 дн. после срока', hot: false });
  });

  it('строка без шага — «шага нет»', () => {
    const v = view({ next_step: null, next_action_date: null, cls: { noStep: true, group: 'decide' } });
    expect(focusKicker(v, null)).toEqual({ lead: 'Решить судьбу', days: 'шага нет', hot: false });
  });

  it('шаг впереди — дней нет', () => {
    const v = view({ next_action_date: '2026-10-09', cls: { stepAhead: true, group: 'plan' } });
    expect(focusKicker(v, null).days).toBeNull();
  });
});

describe('amountSourceText', () => {
  it('черновик, отправлено, принято, бюджет, суммы нет', () => {
    expect(amountSourceText('quote', 'draft')).toBe('черновик КП');
    expect(amountSourceText('quote', 'sent')).toBe('КП отправлено');
    expect(amountSourceText('quote', 'accepted')).toBe('КП принято');
    expect(amountSourceText('budget', null)).toBe('бюджет сделки');
    expect(amountSourceText('none', null)).toBe('суммы нет');
  });

  it('КП с другим статусом или без него — «по КП»', () => {
    expect(amountSourceText('quote', 'rejected')).toBe('по КП');
    expect(amountSourceText('quote', null)).toBe('по КП');
  });
});

describe('quoteLineText', () => {
  it('КП нет, сумма из бюджета — «Создать КП»', () => {
    expect(quoteLineText(null, 'budget', NOW))
      .toEqual({ text: 'КП не заведено · сумма — из бюджета сделки', warn: false, action: 'create' });
    expect(quoteLineText(null, 'none', NOW).text).toBe('КП не заведено · суммы нет');
  });

  it('черновик на 14,3 млн', () => {
    // formatBudget ставит неразрывные пробелы: «14,3 млн ₽».
    expect(quoteLineText(quote({ amount: 1_430_000_000 }), 'quote', NOW))
      .toEqual({ text: 'Черновик от 7 сент · 14,3\u00a0млн\u00a0₽ · не отправлено', warn: false, action: 'open' });
  });

  it('черновик без суммы — сегмент суммы пропущен', () => {
    expect(quoteLineText(quote(), 'budget', NOW).text).toBe('Черновик от 7 сент · не отправлено');
  });

  it('отправлено, срок вчера — warn и «истекло»', () => {
    const r = quoteLineText(quote({ status: 'sent', sent_at: '2026-09-20T10:00:00+03:00', valid_until: '2026-10-03' }), 'quote', NOW);
    expect(r).toEqual({ text: 'Отправлено 20 сент · истекло 3 окт', warn: true, action: 'open' });
  });

  it('отправлено, срок скоро — warn и «действует до»', () => {
    const r = quoteLineText(quote({ status: 'sent', sent_at: '2026-09-20T10:00:00+03:00', valid_until: '2026-10-06' }), 'quote', NOW);
    expect(r.text).toBe('Отправлено 20 сент · действует до 6 окт');
    expect(r.warn).toBe(true);
  });

  it('отправлено без valid_until — сегмента «действует до» нет', () => {
    const r = quoteLineText(quote({ status: 'sent', sent_at: '2026-09-20T10:00:00+03:00' }), 'quote', NOW);
    expect(r).toEqual({ text: 'Отправлено 20 сент', warn: false, action: 'open' });
  });

  it('принято, отклонено', () => {
    expect(quoteLineText(quote({ status: 'accepted', accepted_at: '2026-09-25T10:00:00+03:00', amount: 50_000_000 }), 'quote', NOW).text)
      .toBe('Принято 25 сент · 500\u00a0тыс.\u00a0₽');
    expect(quoteLineText(quote({ status: 'rejected' }), 'budget', NOW))
      .toEqual({ text: 'Отклонено 20 сент', warn: false, action: 'open' });
  });

  it('истекло без valid_until — дата из updated_at', () => {
    expect(quoteLineText(quote({ status: 'expired' }), 'budget', NOW))
      .toEqual({ text: 'Истекло 20 сент', warn: true, action: 'open' });
  });
});

// ── S-TODAY-FOCUS-2 ──

describe('rowPill', () => {
  const TODAY = '2026-10-04';
  const NB = '\u00a0';

  it('fresh, 4 дня — «4 дн.», hot', () => {
    expect(rowPill(view({ cls: { overdueDays: 4, group: 'fresh' } }), TODAY, null))
      .toEqual({ text: `4${NB}дн.`, tone: 'hot', title: null });
  });

  it('risk, шаг через 3 дня, два сигнала — «через 3 дн.», title из signalsText', () => {
    const signals = [
      { key: 'quote_expired' as const, since: '2026-09-18' },
      { key: 'task_overdue' as const, since: '2026-09-15' },
    ];
    const v = view({ next_action_date: '2026-10-07', cls: { group: 'risk', stepAhead: true }, signals });
    expect(rowPill(v, TODAY, null))
      .toEqual({ text: `через 3${NB}дн.`, tone: 'risk', title: signalsText(signals) });
  });

  it('risk, шаг сегодня — «сегодня»', () => {
    const v = view({
      next_action_date: TODAY,
      cls: { group: 'risk', stepAhead: true },
      signals: [{ key: 'call_overdue', since: '2026-10-01' }],
    });
    expect(rowPill(v, TODAY, null).text).toBe('сегодня');
  });

  it('stale, 26 дней — «26 дн.», plain', () => {
    expect(rowPill(view({ cls: { overdueDays: 26, group: 'stale' } }), TODAY, null))
      .toEqual({ text: `26${NB}дн.`, tone: 'plain', title: null });
  });

  it('шаг впереди без сигналов — день недели и дата', () => {
    const v = view({ next_action_date: '2026-10-09', cls: { group: 'plan', stepAhead: true } });
    expect(rowPill(v, TODAY, null)).toEqual({ text: 'пт 9 окт', tone: 'plain', title: null });
  });

  it('шага нет, впереди встреча — день и время', () => {
    const v = view({
      next_step: null, next_action_date: null,
      cls: { group: 'plan', noStep: true },
      planned: { dateKey: '2026-10-08', time: '14:00', kind: 'meeting' },
    });
    expect(rowPill(v, TODAY, null).text).toBe('чт 8 окт, 14:00');
  });

  it('без шага, встречи нет — «шага нет»', () => {
    const v = view({ next_step: null, next_action_date: null, cls: { group: 'decide', noStep: true } });
    expect(rowPill(v, TODAY, null)).toEqual({ text: 'шага нет', tone: 'plain', title: null });
  });

  it('written с датой — «шаг пн 5 окт», done; без даты — «шага нет», done', () => {
    const v = view({ cls: { overdueDays: 4, group: 'fresh' } });
    expect(rowPill(v, TODAY, { nextDateKey: '2026-10-05' })).toEqual({ text: 'шаг пн 5 окт', tone: 'done', title: null });
    expect(rowPill(v, TODAY, { nextDateKey: null })).toEqual({ text: 'шага нет', tone: 'done', title: null });
  });
});

describe('clockCaption', () => {
  const clock = (over: Partial<DecideClock>): DecideClock => ({
    basis: 'overdue', days: 4, ratio: 4 / 14, tipKey: '2026-10-15', state: 'calm', ...over,
  });

  it('calm → «15 окт — в «Решить судьбу»»', () => {
    expect(clockCaption(clock({}), view())).toBe('15 окт — в «Решить судьбу»');
  });

  it('warn — та же подпись', () => {
    expect(clockCaption(clock({ state: 'warn', days: 9, tipKey: '2026-10-10' }), view())).toBe('10 окт — в «Решить судьбу»');
  });

  it('over → «с 3 окт — в «Решить судьбу»»', () => {
    expect(clockCaption(clock({ basis: 'silence', state: 'over', days: 16, tipKey: '2026-10-03', ratio: 1 }), view()))
      .toBe('с 3 окт — в «Решить судьбу»');
  });

  const none = clock({ basis: 'none', days: null, ratio: 0, tipKey: null, state: 'none' });

  it('none, назначено на сегодня с временем → «назначено на сегодня, 14:00»', () => {
    expect(clockCaption(none, view({ cls: { stepAhead: true, assignedToday: { time: '14:00' } } })))
      .toBe('назначено на сегодня, 14:00');
  });

  it('none, назначено на сегодня без времени', () => {
    expect(clockCaption(none, view({ next_action_date: '2026-10-04', cls: { stepAhead: true, assignedToday: { time: null } } })))
      .toBe('назначено на сегодня');
  });

  it('none, шаг впереди → «шаг пт 9 окт»', () => {
    expect(clockCaption(none, view({ next_action_date: '2026-10-09', cls: { stepAhead: true, group: 'plan' } })))
      .toBe('шаг пт 9 окт');
  });

  it('none, встреча впереди → plannedText', () => {
    expect(clockCaption(none, view({
      next_step: null,
      next_action_date: null,
      cls: { noStep: true, group: 'plan' },
      planned: { dateKey: '2026-10-07', time: '11:00', kind: 'meeting' },
    }))).toBe('встреча 7 окт, 11:00');
  });
});
