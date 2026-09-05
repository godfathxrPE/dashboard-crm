import { describe, test, expect } from 'vitest';
import { formatBudget, parseBudgetInput } from '@/lib/validators/project';

/**
 * S-FORMAT-1 (F-03): бюджет печатается русским письмом — «2,8 млн ₽».
 *
 * Пробелы в ожиданиях НЕРАЗРЫВНЫЕ ( ): «2,8 млн ₽» — одна лексема,
 * переносить её по строке нельзя. Обычный пробел в тесте прошёл бы незамеченным
 * глазами, но сломал бы смысл правки.
 */
const NBSP = '\u00A0';

describe('formatBudget — русский формат', () => {
  test('миллионы: один знак после запятой', () => {
    expect(formatBudget(280_000_000)).toBe(`2,8${NBSP}млн${NBSP}₽`);
  });

  test('целое число миллионов — без дробной части', () => {
    expect(formatBudget(300_000_000)).toBe(`3${NBSP}млн${NBSP}₽`);
  });

  test('тысячи: без дробной части', () => {
    expect(formatBudget(45_000_000)).toBe(`450${NBSP}тыс.${NBSP}₽`);
  });

  test('меньше тысячи — рубли', () => {
    expect(formatBudget(84_000)).toBe(`840${NBSP}₽`);
  });

  test('null — прочерк «не указано»', () => {
    expect(formatBudget(null)).toBe('—');
  });

  test('ноль — это ноль, а не «не указано»', () => {
    expect(formatBudget(0)).toBe(`0${NBSP}₽`);
  });

  test('латинских M/K и точки-разделителя в выводе нет', () => {
    expect(formatBudget(280_000_000)).not.toMatch(/[MK]/);
    expect(formatBudget(280_000_000)).not.toContain('.');
  });
});

describe('parseBudgetInput — читает то, что показано', () => {
  test('суффикс «млн» с запятой-разделителем', () => {
    expect(parseBudgetInput('2,8 млн')).toBe(280_000_000);
  });

  test('суффикс «тыс.» с точкой', () => {
    expect(parseBudgetInput('450 тыс.')).toBe(45_000_000);
  });

  test('без суффикса — рубли, пробелы разрядов не мешают', () => {
    expect(parseBudgetInput('2 800 000')).toBe(280_000_000);
  });

  test('латинский суффикс и точка-разделитель', () => {
    expect(parseBudgetInput('2.8m')).toBe(280_000_000);
  });

  test('пустая строка — null', () => {
    expect(parseBudgetInput('')).toBe(null);
  });

  test('не число — null', () => {
    expect(parseBudgetInput('абв')).toBe(null);
  });

  test('инвариант: показанное значение читается обратно', () => {
    for (const kopecks of [280_000_000, 45_000_000, 84_000]) {
      expect(parseBudgetInput(formatBudget(kopecks))).toBe(kopecks);
    }
  });
});
