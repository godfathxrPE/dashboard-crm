import { describe, test, expect } from 'vitest';
import { relativeTime } from '@/lib/utils/relative-time';

const NOW = Date.parse('2026-09-26T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('relativeTime (вынесен из EntityTimeline без изменения поведения)', () => {
  test('минуты, часы, дни назад', () => {
    expect(relativeTime(ago(5 * MIN), NOW)).toBe('5м назад');
    expect(relativeTime(ago(10 * HOUR), NOW)).toBe('10ч назад');
    expect(relativeTime(ago(4 * DAY), NOW)).toBe('4д назад');
  });

  test('меньше минуты — «только что»', () => {
    expect(relativeTime(ago(20_000), NOW)).toBe('только что');
  });

  test('неделя и больше — дата', () => {
    const iso = ago(11 * DAY);
    expect(relativeTime(iso, NOW)).toBe(
      new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
    );
    expect(relativeTime(iso, NOW)).toMatch(/15 сент/);
  });

  test('будущее (задача со сроком) — «вперёд»', () => {
    expect(relativeTime(new Date(NOW + 2 * DAY + HOUR).toISOString(), NOW)).toBe('2д вперёд');
    expect(relativeTime(new Date(NOW + 3 * HOUR + MIN).toISOString(), NOW)).toBe('3ч вперёд');
  });
});
