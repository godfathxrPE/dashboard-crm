import { describe, it, expect } from 'vitest';
import { buildTodayModel, touchesSinceKey, type TodayDealSource, type TodayModelInput, type TodayQuote } from '@/lib/domain/today-model';
import { touchesFromRows, type DealTouch } from '@/lib/domain/deal-touch';
import { TODAY_2026_10_03 } from './fixtures/today-2026-10-03';

// «Сейчас» — аргументом, вечер 03.10 по МСК, как в эталоне DOMAIN-1.
const NOW = new Date('2026-10-03T19:00:00+03:00');
// Срок `zerde` 26.08 минус 30 дней.
const SINCE_KEY = '2026-07-27';

function deals(): TodayDealSource[] {
  return TODAY_2026_10_03.map((d) => ({
    id: d.id,
    name: d.id,
    companyName: null,
    contactId: null,
    status: 'open',
    type: 'client',
    next_step: 'Шаг',
    next_action_date: d.nextActionDate,
    created_at: d.createdAt,
    // Сумма из фикстуры уже посчитана по `dealHeaderAmount` — подаётся бюджетом.
    budget: d.amount,
    stage: { name: 'Стадия', phase_group: d.phaseGroup, order_index: d.stageOrder },
  }));
}

function touches(): Map<string, DealTouch[]> {
  const map = new Map<string, DealTouch[]>();
  for (const d of TODAY_2026_10_03) {
    const fromLog =
      touchesFromRows(
        [],
        d.stageLog.map((r) => ({ project_id: d.id, event_type: r.event_type, created_at: r.created_at, payload: r.payload })),
      ).get(d.id) ?? [];
    map.set(d.id, [...d.touches, ...fromLog]);
  }
  return map;
}

function quotes(): Map<string, TodayQuote[]> {
  const map = new Map<string, TodayQuote[]>();
  for (const d of TODAY_2026_10_03) {
    if (d.quotes.length === 0) continue;
    map.set(d.id, d.quotes.map((q) => ({ ...q, amount: 390000000 })));
  }
  return map;
}

function input(over: Partial<TodayModelInput> = {}): TodayModelInput {
  return {
    deals: deals(),
    touches: touches(),
    quotes: quotes(),
    tasks: [{ id: 't-fitnes', project_id: 'fitnes', lane: 'now', deadline: '2026-09-15T12:00:00+03:00', text: 'Задача' }],
    calls: [],
    meetings: [],
    snoozedDealIds: new Set(),
    sinceKey: SINCE_KEY,
    ...over,
  };
}

function view(model: ReturnType<typeof buildTodayModel>, id: string) {
  const all = [...model.moves, ...model.groups.flatMap((g) => g.rows), ...model.snoozed];
  const v = all.find((x) => x.source.id === id);
  if (!v) throw new Error(`нет сделки ${id}`);
  return v;
}

function group(model: ReturnType<typeof buildTodayModel>, key: string) {
  const g = model.groups.find((x) => x.key === key);
  if (!g) throw new Error(`нет группы ${key}`);
  return g;
}

describe('buildTodayModel: снимок 03.10.2026', () => {
  const model = buildTodayModel(input(), NOW);

  it('total 17, noStepAhead 14, noAmount 11', () => {
    expect(model.total).toBe(17);
    expect(model.noStepAhead).toBe(14);
    expect(model.noAmount).toBe(11);
  });

  it('ходы: lorenz, nytva, hn', () => {
    expect(model.moves.map((v) => v.source.id)).toEqual(['lorenz', 'nytva', 'hn']);
    expect(model.moves.map((v) => v.slot)).toEqual(['fresh', 'fresh', 'biggest']);
  });

  it('группы: fresh 3 (2 в ходах, строка ar); decide 8 (1 в ходах, 7 строк); stale 3; risk fitnes; plan 2', () => {
    expect(model.groups.map((g) => g.key)).toEqual(['fresh', 'risk', 'stale', 'decide', 'plan']);
    expect(group(model, 'fresh')).toMatchObject({ total: 3, inMoves: 2 });
    expect(group(model, 'fresh').rows.map((v) => v.source.id)).toEqual(['ar']);
    expect(group(model, 'decide')).toMatchObject({ total: 8, inMoves: 1 });
    expect(group(model, 'decide').rows).toHaveLength(7);
    expect(group(model, 'stale').rows).toHaveLength(3);
    expect(group(model, 'risk').rows.map((v) => v.source.id)).toEqual(['fitnes']);
    expect(group(model, 'plan').rows).toHaveLength(2);
  });

  it('fitnes: сигналы quote_expired и task_overdue, одна просроченная задача', () => {
    const v = view(model, 'fitnes');
    expect(v.signals.map((s) => s.key)).toEqual(['quote_expired', 'task_overdue']);
    expect(v.tasks).toHaveLength(1);
    expect(v.tasks[0].overdue).toBe(true);
    expect(v.amount).toMatchObject({ amount: 390000000, source: 'quote' });
  });

  it('after по сделкам', () => {
    expect(view(model, 'lorenz').after.kind).toBe('silence_after_due');
    expect(view(model, 'ar').after.kind).toBe('silence_after_due');
    expect(view(model, 'glorus').after).toMatchObject({ kind: 'touched_after_due', dateKey: '2026-09-30', touchKind: 'stage' });
    expect(view(model, 'hn').after).toMatchObject({ kind: 'silence_since', dateKey: '2026-09-17' });
    expect(view(model, 'mdm').after).toMatchObject({ kind: 'silence_since', dateKey: '2026-09-16' });
    expect(view(model, 'agros').after.kind).toBe('no_touches');
    expect(view(model, 'fitnes').after.kind).toBe('signals');
    expect(view(model, 'stroy').after).toMatchObject({ kind: 'last_touch', dateKey: '2026-10-02' });
  });

  it('no_touches: создана позже sinceKey → wholeLife true; раньше → false', () => {
    expect(view(model, 'agros').after.wholeLife).toBe(true);
    const old = buildTodayModel(
      input({ deals: deals().map((d) => (d.id === 'agros' ? { ...d, created_at: '2026-07-01T12:00:00+03:00' } : d)) }),
      NOW,
    );
    expect(view(old, 'agros').after).toMatchObject({ kind: 'no_touches', wholeLife: false });
  });

  it('candidates — 17; computed совпадает с moves по id и порядку', () => {
    expect(model.candidates).toHaveLength(17);
    expect(model.computed.map((m) => m.id)).toEqual(model.moves.map((v) => v.source.id));
  });
});

describe('buildTodayModel: вариации', () => {
  it('ar отложена → нет в ходах и строках, есть в snoozed; noStepAhead 14; второй ход nytva', () => {
    const model = buildTodayModel(input({ snoozedDealIds: new Set(['ar']) }), NOW);
    expect(model.moves.map((v) => v.source.id)).not.toContain('ar');
    expect(model.groups.flatMap((g) => g.rows).map((v) => v.source.id)).not.toContain('ar');
    expect(model.snoozed.map((v) => v.source.id)).toEqual(['ar']);
    expect(model.noStepAhead).toBe(14);
    expect(model.total).toBe(17);
    expect(model.moves[1].source.id).toBe('nytva');
    expect(model.groups.find((g) => g.key === 'fresh')?.total).toBe(2);
  });

  it('звонок pending сегодня в 11:00 по stroy → planned 11:00, первый ход assigned', () => {
    const model = buildTodayModel(
      input({ calls: [{ id: 'c1', project_id: 'stroy', status: 'pending', date: '2026-10-03T11:00:00+03:00' }] }),
      NOW,
    );
    const v = view(model, 'stroy');
    expect(v.planned).toEqual({ dateKey: '2026-10-03', time: '11:00', kind: 'call' });
    expect(v.calls).toEqual([{ id: 'c1', date: '2026-10-03T11:00:00+03:00', overdue: false }]);
    expect(model.moves[0].source.id).toBe('stroy');
    expect(model.moves[0].slot).toBe('assigned');
  });

  it('встреча впереди: время из meetings.time без секунд', () => {
    const model = buildTodayModel(
      input({ meetings: [{ id: 'm1', project_id: 'anfish', date: '2026-10-08', time: '14:00:00' }] }),
      NOW,
    );
    expect(view(model, 'anfish').planned).toEqual({ dateKey: '2026-10-08', time: '14:00', kind: 'meeting' });
  });

  it('задача без project_id на модель не влияет', () => {
    const base = buildTodayModel(input(), NOW);
    const withOrphan = buildTodayModel(
      input({
        tasks: [
          ...input().tasks,
          { id: 't-x', project_id: null, lane: 'now', deadline: '2026-09-01T12:00:00+03:00', text: 'Сирота' },
        ],
      }),
      NOW,
    );
    expect(withOrphan.groups.map((g) => g.total)).toEqual(base.groups.map((g) => g.total));
    expect(withOrphan.groups.flatMap((g) => g.rows).flatMap((v) => v.tasks).map((t) => t.id)).not.toContain('t-x');
  });

  it('задача сделки lane = now без дедлайна → в tasks, overdue false, сигнала нет', () => {
    const model = buildTodayModel(
      input({ tasks: [{ id: 't1', project_id: 'stroy', lane: 'now', deadline: null, text: 'Позвонить' }] }),
      NOW,
    );
    const v = view(model, 'stroy');
    expect(v.tasks).toEqual([{ id: 't1', text: 'Позвонить', deadline: null, overdue: false }]);
    expect(v.signals).toEqual([]);
  });

  it('пустой вход → пять пустых групп, нули в счётчиках', () => {
    const model = buildTodayModel(
      { deals: [], touches: new Map(), quotes: new Map(), tasks: [], calls: [], meetings: [], snoozedDealIds: new Set(), sinceKey: SINCE_KEY },
      NOW,
    );
    expect(model.groups.map((g) => [g.key, g.total, g.rows.length])).toEqual([
      ['fresh', 0, 0],
      ['risk', 0, 0],
      ['stale', 0, 0],
      ['decide', 0, 0],
      ['plan', 0, 0],
    ]);
    expect(model).toMatchObject({ total: 0, noStepAhead: 0, noAmount: 0, moves: [], computed: [], snoozed: [] });
  });
});

describe('touchesSinceKey', () => {
  it('самый ранний просроченный срок минус 30 дней: на снимке — 27.07', () => {
    expect(touchesSinceKey(deals(), NOW)).toBe(SINCE_KEY);
  });

  it('просроченных нет — сегодня минус 30 дней', () => {
    expect(touchesSinceKey([{ next_action_date: '2026-10-09' }, { next_action_date: null }], NOW)).toBe('2026-09-03');
  });

  it('не глубже 120 дней от сегодня', () => {
    expect(touchesSinceKey([{ next_action_date: '2026-01-10' }], NOW)).toBe('2026-06-05');
  });
});
