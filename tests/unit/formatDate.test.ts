import { describe, test, expect, vi } from 'vitest';
import {
  formatDateHuman,
  formatDateShort,
  formatDateWithDay,
  formatCalendarDate,
  formatDateNumeric,
  getWeekStart,
} from '@/lib/utils/dates';

describe('formatDateHuman', () => {
  test('сегодня', () => {
    const today = new Date();
    expect(formatDateHuman(today)).toBe('Сегодня');
  });

  test('вчера', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(formatDateHuman(yesterday)).toBe('Вчера');
  });

  test('завтра', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(formatDateHuman(tomorrow)).toBe('Завтра');
  });

  test('обычная дата — строка', () => {
    const result = formatDateHuman('2025-03-15');
    expect(result).toContain('2025');
    expect(result).toContain('15');
  });

  test('принимает строковый формат', () => {
    const result = formatDateHuman(new Date().toISOString());
    expect(result).toBe('Сегодня');
  });
});

describe('formatDateShort', () => {
  test('короткий формат', () => {
    const result = formatDateShort('2025-03-15');
    expect(result).toContain('15');
  });
});

describe('formatDateWithDay', () => {
  test('содержит день недели и число', () => {
    const result = formatDateWithDay('2025-03-17'); // Monday
    expect(result).toContain('17');
  });
});

describe('getWeekStart', () => {
  test('возвращает понедельник', () => {
    // Wednesday 2025-03-19 → Monday 2025-03-17
    const result = getWeekStart(new Date(2025, 2, 19));
    expect(result).toBe('2025-03-17');
  });

  test('понедельник → сам себя', () => {
    const result = getWeekStart(new Date(2025, 2, 17));
    expect(result).toBe('2025-03-17');
  });

  test('воскресенье → предыдущий понедельник', () => {
    const result = getWeekStart(new Date(2025, 2, 23));
    expect(result).toBe('2025-03-17');
  });
});

describe('formatCalendarDate', () => {
  // S-DEAL-CHZ-1: календарная дата ('YYYY-MM-DD') не имеет момента времени, и
  // `new Date(строка)` парсит её как UTC-полночь. `format` печатает в локальной
  // зоне — при отрицательном смещении выходят сутки назад.
  test('числовой формат проекта', () => {
    expect(formatCalendarDate('2026-08-03')).toBe('03.08.2026');
  });

  test('день не уезжает назад в зоне с отрицательным смещением', () => {
    const tz = process.env.TZ;
    try {
      process.env.TZ = 'America/Los_Angeles';
      expect(formatCalendarDate('2026-08-03')).toBe('03.08.2026');
    } finally {
      process.env.TZ = tz;
    }
  });

  test('граница месяца — первое число не становится последним предыдущего', () => {
    expect(formatCalendarDate('2026-01-01')).toBe('01.01.2026');
  });

  test('формат совпадает с formatDateNumeric — расходится только парсинг', () => {
    // Один и тот же день, заданный моментом времени, печатается одинаково:
    // хелпер не заводит второй формат, он чинит разбор входа.
    expect(formatCalendarDate('2026-08-03')).toBe(
      formatDateNumeric(new Date(2026, 7, 3, 12, 0, 0)),
    );
  });
});
