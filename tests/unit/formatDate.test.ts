import { describe, test, expect, vi } from 'vitest';
import { formatDateHuman, formatDateShort, formatDateWithDay, getWeekStart } from '@/lib/utils/dates';

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
