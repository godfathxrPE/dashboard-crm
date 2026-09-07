import { describe, it, expect } from 'vitest';
import {
  orderQuotes,
  quoteVersionMap,
  pickActiveQuote,
  pickPreviousQuote,
  type QuoteLike,
} from '@/lib/domain/quote-version';
import type { QuoteStatus } from '@/lib/validators/quote';

/** КП с датой создания «день N сентября 2026» — id читается в падении теста. */
function q(id: string, day: number, status: QuoteStatus = 'draft'): QuoteLike {
  return { id, status, created_at: `2026-09-${String(day).padStart(2, '0')}T10:00:00Z` };
}

/** Вход в том виде, в каком его отдаёт useQuotes: created_at DESC. */
function asFromHook(quotes: QuoteLike[]): QuoteLike[] {
  return [...quotes].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

describe('quoteVersionMap', () => {
  it('нумерует 1-based по created_at asc на списке, пришедшем в desc', () => {
    const input = asFromHook([q('первое', 1), q('второе', 5), q('третье', 9)]);
    expect(input[0].id).toBe('третье'); // вход действительно desc

    const versions = quoteVersionMap(input);
    expect(versions.get('первое')).toBe(1);
    expect(versions.get('второе')).toBe(2);
    expect(versions.get('третье')).toBe(3);
  });

  it('один элемент — версия 1', () => {
    expect(quoteVersionMap([q('одно', 3)]).get('одно')).toBe(1);
  });

  it('пустой список — пустая карта', () => {
    expect(quoteVersionMap([]).size).toBe(0);
  });

  it('одинаковый created_at — порядок детерминирован (тай-брейк по id)', () => {
    const a: QuoteLike = { id: 'aaa', status: 'draft', created_at: '2026-09-01T10:00:00Z' };
    const b: QuoteLike = { id: 'bbb', status: 'draft', created_at: '2026-09-01T10:00:00Z' };
    expect(quoteVersionMap([b, a]).get('aaa')).toBe(1);
    expect(quoteVersionMap([a, b]).get('aaa')).toBe(1);
  });

  it('вход не мутируется', () => {
    const input = [q('второе', 5), q('первое', 1)];
    const copy = [...input];
    orderQuotes(input);
    quoteVersionMap(input);
    expect(input).toEqual(copy);
  });
});

describe('pickActiveQuote', () => {
  it('accepted перебивает более свежий sent', () => {
    const input = asFromHook([q('принято', 1, 'accepted'), q('отправлено', 9, 'sent')]);
    expect(pickActiveQuote(input)?.id).toBe('принято');
  });

  it('без accepted берётся ПОСЛЕДНЕЕ sent, а не первое', () => {
    const input = asFromHook([
      q('старое-sent', 1, 'sent'),
      q('свежее-sent', 5, 'sent'),
      q('черновик', 9, 'draft'),
    ]);
    expect(pickActiveQuote(input)?.id).toBe('свежее-sent');
  });

  it('без accepted и без sent — последнее любое', () => {
    const input = asFromHook([q('старое', 1, 'rejected'), q('свежее', 7, 'expired')]);
    expect(pickActiveQuote(input)?.id).toBe('свежее');
  });

  it('пустой список — null', () => {
    expect(pickActiveQuote([])).toBeNull();
  });
});

describe('pickPreviousQuote', () => {
  it('отдаёт КП версии N−1 относительно активного', () => {
    const input = asFromHook([q('v1', 1, 'rejected'), q('v2', 5, 'accepted'), q('v3', 9, 'draft')]);
    const active = pickActiveQuote(input);
    expect(active?.id).toBe('v2');
    expect(pickPreviousQuote(input, active)?.id).toBe('v1');
  });

  it('у первой версии предыдущей нет', () => {
    const input = [q('v1', 1, 'sent')];
    expect(pickPreviousQuote(input, pickActiveQuote(input))).toBeNull();
  });

  it('без активного — null', () => {
    expect(pickPreviousQuote([q('v1', 1)], null)).toBeNull();
  });
});
