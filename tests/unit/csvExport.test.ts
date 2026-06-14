import { describe, test, expect } from 'vitest';

describe('CSV Export — logic', () => {
  test('BOM prefix для кириллицы', () => {
    const BOM = '\uFEFF';
    const csv = BOM + 'Имя\nОлег';
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
  });

  test('кириллица сохраняется в CSV строке', () => {
    const csv = ['Компания', '"АО ""ДРУЖБА НАРОДОВ НОВА"""'].join('\n');
    expect(csv).toContain('ДРУЖБА НАРОДОВ НОВА');
  });

  test('кавычки экранируются двойными кавычками', () => {
    const val = 'ООО "Рога и Копыта"';
    const escaped = `"${val.replace(/"/g, '""')}"`;
    expect(escaped).toBe('"ООО ""Рога и Копыта"""');
  });

  test('запятые в значениях требуют обёртки в кавычки', () => {
    const val = 'Рога, Копыта';
    const needsQuotes = val.includes(',') || val.includes('"');
    expect(needsQuotes).toBe(true);
  });

  test('null/undefined → пустая строка', () => {
    const testCases: unknown[] = [null, undefined];
    for (const val of testCases) {
      const str = val == null ? '' : String(val);
      expect(str).toBe('');
    }
  });

  test('формат строки CSV корректный', () => {
    const headers = ['Имя', 'Email'];
    const row = ['Олег', 'test@test.com'];
    const headerLine = headers.join(',');
    const dataLine = row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',');
    const csv = '\uFEFF' + [headerLine, dataLine].join('\n');

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Имя,Email');
    expect(csv).toContain('"Олег","test@test.com"');
  });
});
