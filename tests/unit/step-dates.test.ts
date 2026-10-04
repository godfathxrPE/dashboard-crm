import { describe, it, expect } from 'vitest';
import { quickStepDates } from '@/lib/domain/step-dates';

// Середина дня по МСК: `localDateKey` на машине в МСК и в UTC даёт тот же день.
const at = (day: string) => new Date(`${day}T12:00:00+03:00`);
const labels = (day: string) => quickStepDates(at(day)).map((d) => d.label);

describe('quickStepDates', () => {
  it('суббота 03.10 → Пн 5 окт, Вт 6, Ср 7, Пн 12', () => {
    expect(labels('2026-10-03')).toEqual(['Пн 5 окт', 'Вт 6', 'Ср 7', 'Пн 12']);
  });

  it('понедельник 05.10 → Вт 6 окт, Ср 7, Чт 8, Пн 12', () => {
    expect(labels('2026-10-05')).toEqual(['Вт 6 окт', 'Ср 7', 'Чт 8', 'Пн 12']);
  });

  it('четверг 08.10 → Пт 9 окт, Пн 12, Вт 13, Пн 19', () => {
    expect(labels('2026-10-08')).toEqual(['Пт 9 окт', 'Пн 12', 'Вт 13', 'Пн 19']);
  });

  it('пятница 30.10 → Пн 2 ноя, Вт 3, Ср 4, Пн 9: месяц в первой подписи — новый', () => {
    expect(labels('2026-10-30')).toEqual(['Пн 2 ноя', 'Вт 3', 'Ср 4', 'Пн 9']);
  });

  it('среда 28.10 → Чт 29 окт, Пт 30, Пн 2 ноя, Пн 9', () => {
    expect(labels('2026-10-28')).toEqual(['Чт 29 окт', 'Пт 30', 'Пн 2 ноя', 'Пн 9']);
  });

  it('ключи YYYY-MM-DD, все разные и по возрастанию', () => {
    const keys = quickStepDates(at('2026-10-28')).map((d) => d.key);
    expect(keys).toEqual(['2026-10-29', '2026-10-30', '2026-11-02', '2026-11-09']);
    expect(keys.every((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))).toBe(true);
    expect([...keys].sort()).toEqual(keys);
    expect(new Set(keys).size).toBe(4);
  });
});
