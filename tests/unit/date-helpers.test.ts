import { describe, it, expect } from 'vitest';
import { addDaysKey, diffDaysKey } from '@/lib/utils/date-helpers';

describe('addDaysKey', () => {
  it('30.09 + 15 → 15.10', () => {
    expect(addDaysKey('2026-09-30', 15)).toBe('2026-10-15');
  });

  it('через границу года: 25.12 + 10 → 04.01', () => {
    expect(addDaysKey('2026-12-25', 10)).toBe('2027-01-04');
  });

  it('−1 — предыдущий день, в том числе через начало месяца и високосный февраль', () => {
    expect(addDaysKey('2026-10-04', -1)).toBe('2026-10-03');
    expect(addDaysKey('2026-10-01', -1)).toBe('2026-09-30');
    expect(addDaysKey('2028-03-01', -1)).toBe('2028-02-29');
  });

  it('через переход на летнее время: 28.03.2027 + 2', () => {
    expect(addDaysKey('2027-03-27', 2)).toBe('2027-03-29');
  });

  it('обратная к diffDaysKey', () => {
    for (const k of ['2026-09-30', '2026-12-31', '2027-03-27']) {
      expect(diffDaysKey(k, addDaysKey(k, 15))).toBe(15);
      expect(diffDaysKey(k, addDaysKey(k, -7))).toBe(-7);
    }
  });
});
