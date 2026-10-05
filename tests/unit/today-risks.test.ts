import { describe, it, expect } from 'vitest';
import { focusRiskRows } from '@/lib/domain/today-risks';
import { riskSignals } from '@/lib/domain/today-deals';
import { buildTodayModel, type TodayDealSource } from '@/lib/domain/today-model';
import type { TodayDealCall, TodayDealTask } from '@/lib/domain/today-model';

// «Сейчас» — аргументом, середина дня 05.10.2026 по МСК.
const NOW = new Date('2026-10-05T12:00:00+03:00');

type Q = { id: string; status: 'draft' | 'sent' | 'accepted'; created_at: string; valid_until: string | null; sent_at: string | null };

function quote(over: Partial<Q> = {}): Q {
  return {
    id: 'q1',
    status: 'sent',
    created_at: '2026-09-01T12:00:00+03:00',
    valid_until: '2026-09-18',
    sent_at: '2026-09-09T10:00:00+03:00',
    ...over,
  };
}

function task(over: Partial<TodayDealTask> = {}): TodayDealTask {
  return { id: 't1', text: 'Позвонить Александру', deadline: '2026-10-04T12:00:00+03:00', overdue: true, ...over };
}

function call(over: Partial<TodayDealCall> = {}): TodayDealCall {
  return { id: 'c1', date: '2026-10-02T11:00:00+03:00', overdue: true, ...over };
}

const empty = { quotes: [], tasks: [], calls: [] };

describe('focusRiskRows', () => {
  it('отправленное КП со сроком 18.09 → quote_expired с датой и sentAt', () => {
    expect(focusRiskRows({ ...empty, quotes: [quote()] }, NOW)).toEqual([
      { kind: 'quote_expired', quoteId: 'q1', validUntil: '2026-09-18', sentAt: '2026-09-09T10:00:00+03:00' },
    ]);
  });

  it('черновик КП с прошедшим сроком → строки нет', () => {
    expect(focusRiskRows({ ...empty, quotes: [quote({ status: 'draft', sent_at: null })] }, NOW)).toEqual([]);
  });

  it('принятое КП → строки нет', () => {
    expect(focusRiskRows({ ...empty, quotes: [quote({ status: 'accepted' })] }, NOW)).toEqual([]);
  });

  it('задача со сроком вчера → строка; со сроком сегодня 13:00 → строки нет', () => {
    expect(focusRiskRows({ ...empty, tasks: [task()] }, NOW)).toEqual([
      { kind: 'task_overdue', taskId: 't1', text: 'Позвонить Александру', deadline: '2026-10-04T12:00:00+03:00' },
    ]);
    const today = task({ deadline: '2026-10-05T13:00:00+03:00', overdue: false });
    expect(focusRiskRows({ ...empty, tasks: [today] }, NOW)).toEqual([]);
  });

  it('две просроченные задачи → две строки по сроку', () => {
    const rows = focusRiskRows(
      {
        ...empty,
        tasks: [
          task({ id: 't-late', deadline: '2026-10-01T12:00:00+03:00' }),
          task({ id: 't-early', deadline: '2026-09-20T12:00:00+03:00' }),
        ],
      },
      NOW,
    );
    expect(rows.map((r) => (r.kind === 'task_overdue' ? r.taskId : null))).toEqual(['t-early', 't-late']);
  });

  it('звонок overdue → call_overdue', () => {
    expect(focusRiskRows({ ...empty, calls: [call()] }, NOW)).toEqual([
      { kind: 'call_overdue', callId: 'c1', date: '2026-10-02T11:00:00+03:00' },
    ]);
  });

  it('порядок: КП → задачи → звонки', () => {
    const rows = focusRiskRows({ quotes: [quote()], tasks: [task()], calls: [call()] }, NOW);
    expect(rows.map((r) => r.kind)).toEqual(['quote_expired', 'task_overdue', 'call_overdue']);
  });
});

// ── Сверка с группой «Под риском» ──
// Оба входа строятся из одних сырых данных: `riskSignals` получает строки БД, а
// `focusRiskRows` — задачи и звонки из вида сделки, собранного `buildTodayModel`.

describe('focusRiskRows ⇔ riskSignals: сверка с группой', () => {
  const deal: TodayDealSource = {
    id: 'd1',
    name: 'Сделка',
    companyName: null,
    contactId: null,
    status: 'open',
    type: 'client',
    next_step: 'Шаг',
    next_action_date: '2026-10-09',
    created_at: '2026-08-01T12:00:00+03:00',
    budget: null,
    stage: { name: 'Стадия', phase_group: 'attraction', order_index: 2 },
  };

  const combos = [false, true].flatMap((q) =>
    [false, true].flatMap((t) => [false, true].map((c) => ({ q, t, c }))),
  );

  it.each(combos)('КП просрочено: $q, задача: $t, звонок: $c', ({ q, t, c }) => {
    const quotes = [{ ...quote({ valid_until: q ? '2026-09-18' : '2026-10-20' }), amount: 100 }];
    const tasks = [
      { id: 't1', project_id: 'd1', lane: 'now', text: 'Задача', deadline: t ? '2026-10-04T12:00:00+03:00' : '2026-10-05T13:00:00+03:00' },
    ];
    const calls = [
      { id: 'c1', project_id: 'd1', status: 'pending', date: c ? '2026-10-02T11:00:00+03:00' : '2026-10-05T15:00:00+03:00' },
    ];

    const model = buildTodayModel(
      {
        deals: [deal],
        touches: new Map(),
        quotes: new Map([['d1', quotes]]),
        tasks,
        calls,
        meetings: [],
        snoozedDealIds: new Set(),
        sinceKey: '2026-09-05',
      },
      NOW,
    );
    const view = [...model.moves, ...model.groups.flatMap((g) => g.rows), ...model.snoozed].find((v) => v.source.id === 'd1');
    if (!view) throw new Error('нет сделки d1');

    const signals = riskSignals({ quotes, tasks, calls }, NOW);
    const rows = focusRiskRows({ quotes, tasks: view.tasks, calls: view.calls }, NOW);

    expect(rows.length > 0).toBe(signals.length > 0);
    expect(rows.length > 0).toBe(view.cls.group === 'risk');
    expect(rows.length).toBe(Number(q) + Number(t) + Number(c));
  });
});
