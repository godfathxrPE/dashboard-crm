import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  matchSegment,
  applySegment,
  __resetSegmentWarnings,
  type SegmentRow,
} from '@/lib/domain/segment-eval';
import type { SegmentClause, SegmentPredicate } from '@/types/database';

// Фиксированный «сейчас»: 2026-07-26 09:00 UTC = 12:00 MSK. День MSK = 2026-07-26.
const NOW = new Date('2026-07-26T09:00:00Z');

const pred = (...and: SegmentClause[]): SegmentPredicate => ({ version: 1, and });

const deal = (over: SegmentRow = {}): SegmentRow => ({
  id: 'd1',
  status: 'open',
  direction: 'erp',
  stage_id: 's1',
  owner_id: 'u1',
  company_id: 'c1',
  budget: 500_000,
  probability: 40,
  next_step: 'Отправить КП',
  next_action_date: '2026-07-20',
  stage_entered_at: '2026-07-01T10:00:00Z',
  ...over,
});

const match = (clause: SegmentClause, row: SegmentRow = deal()) =>
  matchSegment(row, pred(clause), 'deals', NOW);

beforeEach(() => __resetSegmentWarnings());

describe('matchSegment — по одному кейсу на оператор', () => {
  it('eq', () => {
    expect(match({ field: 'status', op: 'eq', value: 'open' })).toBe(true);
    expect(match({ field: 'status', op: 'eq', value: 'won' })).toBe(false);
  });

  it('neq', () => {
    expect(match({ field: 'status', op: 'neq', value: 'won' })).toBe(true);
    expect(match({ field: 'status', op: 'neq', value: 'open' })).toBe(false);
  });

  it('gt / gte', () => {
    expect(match({ field: 'budget', op: 'gt', value: 400_000 })).toBe(true);
    expect(match({ field: 'budget', op: 'gt', value: 500_000 })).toBe(false);
    expect(match({ field: 'budget', op: 'gte', value: 500_000 })).toBe(true);
  });

  it('lt / lte', () => {
    expect(match({ field: 'probability', op: 'lt', value: 50 })).toBe(true);
    expect(match({ field: 'probability', op: 'lt', value: 40 })).toBe(false);
    expect(match({ field: 'probability', op: 'lte', value: 40 })).toBe(true);
  });

  it('gt на нечисловом значении — false, не исключение', () => {
    expect(match({ field: 'next_step', op: 'gt', value: 1 })).toBe(false);
    expect(match({ field: 'budget', op: 'gt', value: 'много' as unknown as number })).toBe(false);
  });

  it('in', () => {
    expect(match({ field: 'direction', op: 'in', value: ['erp', 'iiot'] })).toBe(true);
    expect(match({ field: 'direction', op: 'in', value: ['iiot'] })).toBe(false);
  });

  it('in: значение не массив → false, не throw', () => {
    expect(() => match({ field: 'direction', op: 'in', value: 'erp' })).not.toThrow();
    expect(match({ field: 'direction', op: 'in', value: 'erp' })).toBe(false);
  });

  it('in: несовпадение типов → false', () => {
    // budget = 500000 (число), в списке строки
    expect(match({ field: 'budget', op: 'in', value: ['500000'] })).toBe(false);
  });

  it('contains — регистронезависимо', () => {
    expect(match({ field: 'next_step', op: 'contains', value: 'кп' })).toBe(true);
    expect(match({ field: 'next_step', op: 'contains', value: 'ОТПРАВИТЬ' })).toBe(true);
    expect(match({ field: 'next_step', op: 'contains', value: 'договор' })).toBe(false);
  });

  it('contains на не-text поле → false', () => {
    expect(match({ field: 'budget', op: 'contains', value: '500' })).toBe(false);
  });

  it('is_null / not_null', () => {
    expect(match({ field: 'next_step', op: 'is_null' }, deal({ next_step: null }))).toBe(true);
    expect(match({ field: 'next_step', op: 'is_null' })).toBe(false);
    expect(match({ field: 'next_step', op: 'not_null' })).toBe(true);
    expect(match({ field: 'next_step', op: 'not_null' }, deal({ next_step: null }))).toBe(false);
  });

  it('пустая строка считается «не заполнено»', () => {
    expect(match({ field: 'next_step', op: 'is_null' }, deal({ next_step: '' }))).toBe(true);
    expect(match({ field: 'next_step', op: 'not_null' }, deal({ next_step: '' }))).toBe(false);
  });

  it('days_since_gt — MSK-день, 0 = «строго в прошлом»', () => {
    // next_action_date 2026-07-20, сегодня MSK 2026-07-26 → прошло 6 дней
    expect(match({ field: 'next_action_date', op: 'days_since_gt', value: 0 })).toBe(true);
    expect(match({ field: 'next_action_date', op: 'days_since_gt', value: 5 })).toBe(true);
    expect(match({ field: 'next_action_date', op: 'days_since_gt', value: 6 })).toBe(false);
  });

  it('days_since_lt', () => {
    expect(match({ field: 'next_action_date', op: 'days_since_lt', value: 7 })).toBe(true);
    expect(match({ field: 'next_action_date', op: 'days_since_lt', value: 6 })).toBe(false);
  });

  it('days_since_gt: дата сегодня → 0 дней (не просрочено)', () => {
    const row = deal({ next_action_date: '2026-07-26' });
    expect(match({ field: 'next_action_date', op: 'days_since_gt', value: 0 }, row)).toBe(false);
  });

  it('days_since_gt: дата в будущем → отрицательные дни, не просрочено', () => {
    const row = deal({ next_action_date: '2026-08-01' });
    expect(match({ field: 'next_action_date', op: 'days_since_gt', value: 0 }, row)).toBe(false);
    expect(match({ field: 'next_action_date', op: 'days_since_lt', value: 0 }, row)).toBe(true);
  });

  it('days_since_* на timestamptz — граница суток берётся по MSK, не по UTC', () => {
    // 2026-07-25T22:00:00Z = 2026-07-26 01:00 MSK → это «сегодня», 0 дней назад.
    // По UTC-дню было бы 25-е → 1 день, и сегмент «просрочен» ложно бы сработал.
    const row = deal({ stage_entered_at: '2026-07-25T22:00:00Z' });
    expect(match({ field: 'stage_entered_at', op: 'days_since_gt', value: 0 }, row)).toBe(false);
  });

  it('days_since_*: нечисловое значение или не-дата → false', () => {
    expect(match({ field: 'next_action_date', op: 'days_since_gt', value: 'вчера' })).toBe(false);
    const row = deal({ next_action_date: 'не дата' });
    expect(match({ field: 'next_action_date', op: 'days_since_gt', value: 0 }, row)).toBe(false);
  });
});

describe('null-матрица: только is_null/not_null определены на null', () => {
  const NULL_ROW = deal({ next_action_date: null, next_step: null, budget: null, direction: null });

  const cases: SegmentClause[] = [
    { field: 'direction', op: 'eq', value: 'erp' },
    { field: 'direction', op: 'neq', value: 'erp' },
    { field: 'budget', op: 'gt', value: 0 },
    { field: 'budget', op: 'gte', value: 0 },
    { field: 'budget', op: 'lt', value: 1 },
    { field: 'budget', op: 'lte', value: 1 },
    { field: 'direction', op: 'in', value: ['erp', 'iiot'] },
    { field: 'next_step', op: 'contains', value: 'кп' },
    { field: 'next_action_date', op: 'days_since_gt', value: 0 },
    { field: 'next_action_date', op: 'days_since_lt', value: 999 },
  ];

  it.each(cases.map((c) => [`${c.field} ${c.op}`, c] as const))(
    '%s при null → false (не «истина по умолчанию»)',
    (_label, clause) => {
      expect(match(clause, NULL_ROW)).toBe(false);
    },
  );

  it('neq при null тоже false — «не равно» не значит «пусто»', () => {
    expect(match({ field: 'direction', op: 'neq', value: 'iiot' }, NULL_ROW)).toBe(false);
  });
});

describe('неизвестное поле / оператор — клауза false + один warn', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => warn.mockRestore());

  it('поле вне whitelist → false, страница не падает', () => {
    expect(() => match({ field: 'secret_margin', op: 'eq', value: 1 })).not.toThrow();
    expect(match({ field: 'secret_margin', op: 'eq', value: 1 })).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1); // дедуп: второй вызов той же причины молчит
  });

  it('неизвестный оператор → false + warn', () => {
    const clause = { field: 'status', op: 'regex', value: '^o' } as unknown as SegmentClause;
    expect(match(clause)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('warn не заливает консоль при фильтрации списка', () => {
    const rows = Array.from({ length: 50 }, (_, i) => deal({ id: `d${i}` }));
    applySegment(rows, pred({ field: 'nope', op: 'eq', value: 1 }), 'deals', NOW);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('предикат целиком', () => {
  it('пустой and пропускает все строки', () => {
    expect(matchSegment(deal(), pred(), 'deals', NOW)).toBe(true);
    const rows = [deal(), deal({ status: 'won' })];
    expect(applySegment(rows, pred(), 'deals', NOW)).toHaveLength(2);
  });

  it('predicate = null → список не фильтруется', () => {
    const rows = [deal(), deal({ status: 'won' })];
    expect(applySegment(rows, null, 'deals', NOW)).toBe(rows);
  });

  it('смешанный предикат из трёх клауз — AND', () => {
    const p = pred(
      { field: 'status', op: 'eq', value: 'open' },
      { field: 'direction', op: 'eq', value: 'erp' },
      { field: 'next_action_date', op: 'days_since_gt', value: 0 },
    );
    expect(matchSegment(deal(), p, 'deals', NOW)).toBe(true);
    // ломаем по одной клаузе за раз
    expect(matchSegment(deal({ status: 'won' }), p, 'deals', NOW)).toBe(false);
    expect(matchSegment(deal({ direction: 'iiot' }), p, 'deals', NOW)).toBe(false);
    expect(matchSegment(deal({ next_action_date: '2026-08-10' }), p, 'deals', NOW)).toBe(false);
  });

  it('сид «Без next_step» ловит и null, и пустую строку', () => {
    const p = pred(
      { field: 'status', op: 'eq', value: 'open' },
      { field: 'next_step', op: 'is_null' },
    );
    const rows = [
      deal({ id: 'a', next_step: null }),
      deal({ id: 'b', next_step: '' }),
      deal({ id: 'c', next_step: 'Позвонить' }),
      deal({ id: 'd', next_step: null, status: 'won' }),
    ];
    expect(applySegment(rows, p, 'deals', NOW).map((r) => r.id)).toEqual(['a', 'b']);
  });
});
