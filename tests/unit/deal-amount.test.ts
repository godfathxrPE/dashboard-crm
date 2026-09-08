import { describe, test, expect } from 'vitest';
import { dealHeaderAmount, type QuoteAmountLike } from '@/lib/domain/deal-amount';

/**
 * S-DEAL-HEADER-1: какая сумма стоит в шапке сделки и откуда она взялась.
 *
 * `created_at` в фикстурах — по возрастанию версии: домен сортирует вход сам
 * (`orderQuotes`), но читать тест проще, когда порядок совпадает с нумерацией.
 */
const q = (
  id: string,
  status: QuoteAmountLike['status'],
  created_at: string,
  amount: number | null,
): QuoteAmountLike => ({ id, status, created_at, amount });

describe('dealHeaderAmount — источник суммы шапки', () => {
  test('accepted КП с суммой перебивает бюджет', () => {
    const quotes = [
      q('a', 'draft', '2026-01-01T00:00:00Z', 100_00),
      q('b', 'accepted', '2026-01-02T00:00:00Z', 280_000_000),
    ];
    expect(dealHeaderAmount(quotes, 999_000_000)).toEqual({
      amount: 280_000_000,
      source: 'quote',
      version: 2,
    });
  });

  test('без accepted активным становится sent — и он же даёт версию', () => {
    const quotes = [
      q('a', 'rejected', '2026-01-01T00:00:00Z', 100_000_000),
      q('b', 'sent', '2026-01-02T00:00:00Z', 250_000_000),
    ];
    expect(dealHeaderAmount(quotes, 999_000_000)).toEqual({
      amount: 250_000_000,
      source: 'quote',
      version: 2,
    });
  });

  test('КП есть, но цена не проставлена — считаем по бюджету', () => {
    const quotes = [q('a', 'sent', '2026-01-01T00:00:00Z', null)];
    expect(dealHeaderAmount(quotes, 500_000_000)).toEqual({
      amount: 500_000_000,
      source: 'budget',
      version: null,
    });
  });

  test('КП нет вовсе — бюджет без версии', () => {
    expect(dealHeaderAmount([], 500_000_000)).toEqual({
      amount: 500_000_000,
      source: 'budget',
      version: null,
    });
    expect(dealHeaderAmount(undefined, 500_000_000)).toEqual({
      amount: 500_000_000,
      source: 'budget',
      version: null,
    });
  });

  test('ни КП, ни бюджета — суммы нет, и это не ноль', () => {
    expect(dealHeaderAmount([], null)).toEqual({
      amount: null,
      source: 'none',
      version: null,
    });
  });

  test('три КП, активное второе — версия 2, а не 3 (регресс S-DEAL-ORG-1)', () => {
    const quotes = [
      q('a', 'rejected', '2026-01-01T00:00:00Z', 100_000_000),
      q('b', 'accepted', '2026-01-02T00:00:00Z', 200_000_000),
      q('c', 'draft', '2026-01-03T00:00:00Z', 300_000_000),
    ];
    const got = dealHeaderAmount(quotes, null);
    expect(got.version).toBe(2);
    expect(got.amount).toBe(200_000_000);
  });

  test('порядок входа не значим: нумерация идёт по created_at, не по массиву', () => {
    const asc = [
      q('a', 'rejected', '2026-01-01T00:00:00Z', 100_000_000),
      q('b', 'accepted', '2026-01-02T00:00:00Z', 200_000_000),
      q('c', 'draft', '2026-01-03T00:00:00Z', 300_000_000),
    ];
    // `useQuotes` отдаёт свежие сверху — именно в таком порядке шапка их и видит.
    expect(dealHeaderAmount([...asc].reverse(), null)).toEqual(dealHeaderAmount(asc, null));
  });
});
