import { describe, test, expect } from 'vitest';
import {
  datetimeLocalToIso,
  isoToDatetimeLocal,
  localDateTimeKey,
} from '@/lib/utils/date-helpers';

// TZ выставляется через env TZ при запуске vitest. jsdom/node читают process.env.TZ
// на старте процесса, поэтому эти проверки инвариантны к зоне: конвертеры round-trip'ят
// вне зависимости от того, в какой TZ крутится CI. Отдельные зоно-специфичные значения
// вынесены в проверки ниже, которые вычисляют ожидание из самого Date, а не хардкодят.

describe('datetimeLocalToIso', () => {
  test('null/undefined/пусто → null', () => {
    expect(datetimeLocalToIso(null)).toBeNull();
    expect(datetimeLocalToIso(undefined)).toBeNull();
    expect(datetimeLocalToIso('')).toBeNull();
  });

  test('мусор → null', () => {
    expect(datetimeLocalToIso('не дата')).toBeNull();
  });

  test('локальное время парсится как локальное (совпадает с new Date)', () => {
    const local = '2026-07-18T15:00';
    expect(datetimeLocalToIso(local)).toBe(new Date(local).toISOString());
  });
});

describe('isoToDatetimeLocal', () => {
  test('null/undefined/пусто → null', () => {
    expect(isoToDatetimeLocal(null)).toBeNull();
    expect(isoToDatetimeLocal(undefined)).toBeNull();
    expect(isoToDatetimeLocal('')).toBeNull();
  });

  test('ISO → значение datetime-local в локальной зоне', () => {
    const iso = '2026-07-18T12:00:00.000Z';
    expect(isoToDatetimeLocal(iso)).toBe(localDateTimeKey(new Date(iso)));
  });
});

describe('round-trip datetime-local ↔ ISO', () => {
  test('local → iso → local неизменен', () => {
    for (const local of ['2026-07-18T15:00', '2026-01-01T00:00', '2026-12-31T23:59']) {
      const iso = datetimeLocalToIso(local);
      expect(iso).not.toBeNull();
      expect(isoToDatetimeLocal(iso)).toBe(local);
    }
  });

  test('iso → local → iso неизменен (с точностью до минут)', () => {
    const iso = '2026-07-18T12:30:00.000Z';
    const local = isoToDatetimeLocal(iso);
    expect(datetimeLocalToIso(local)).toBe(iso);
  });
});

describe('граничный поздний вечер не «уезжает» на другой день', () => {
  test('isoToDatetimeLocal сохраняет тот же локальный день, что и Date', () => {
    // Берём локальный «23:30», конвертим в ISO и обратно — день локально не меняется.
    const local = '2026-07-18T23:30';
    const iso = datetimeLocalToIso(local)!;
    const back = isoToDatetimeLocal(iso)!;
    expect(back.slice(0, 10)).toBe('2026-07-18');
    expect(back).toBe(local);
  });
});
