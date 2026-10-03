import { describe, it, expect } from 'vitest';
import { isNumericCell, isTableStart, parseSeparator, splitRow } from '@/lib/text/note-table';

// fix-S-NOTES-2.2-tables. GFM-таблица: разбор строк, разделитель, начало таблицы, числовые ячейки.

describe('splitRow', () => {
  it('внешние `|` сняты, `\\|` — литерал', () => {
    expect(splitRow('| a | b \\| c |')).toEqual(['a', 'b | c']);
  });

  it('без внешних `|`', () => {
    expect(splitRow('a | b')).toEqual(['a', 'b']);
  });
});

describe('parseSeparator', () => {
  it('выравнивание из двоеточий', () => {
    expect(parseSeparator('|:---|:---:|---:|---|')).toEqual(['left', 'center', 'right', null]);
  });

  it('ячейка не по шаблону — не разделитель', () => {
    expect(parseSeparator('| -- x |')).toBeNull();
  });
});

describe('isTableStart', () => {
  it('число колонок заголовка и разделителя не совпало — не таблица', () => {
    expect(isTableStart(['| a | b | c |', '| --- | --- |'], 0)).toBe(false);
  });

  it('строка с `|` без разделителя — не таблица', () => {
    expect(isTableStart(['1С | ЧЗ', 'дальше текст'], 0)).toBe(false);
  });

  it('заголовок и разделитель — таблица', () => {
    expect(isTableStart(['| a | b |', '|---|---|'], 0)).toBe(true);
  });
});

describe('isNumericCell', () => {
  it.each(['17 930', '**2025**', '-3,5%', '1 200 ₽', '12 млн'])('«%s» — число', (v) => {
    expect(isNumericCell(v)).toBe(true);
  });

  it.each(['', 'н/д', '2025 год'])('«%s» — не число', (v) => {
    expect(isNumericCell(v)).toBe(false);
  });

  it.each(['721 105 (×8,5)', '16 355 (−9%)', '**19 074** (−25%)'])('«%s» — число с пометкой', (v) => {
    expect(isNumericCell(v)).toBe(true);
  });

  it.each(['(н/д)', '2025 год (оценка)', '100 (очень длинная пометка в скобках)'])(
    '«%s» — не число',
    (v) => {
      expect(isNumericCell(v)).toBe(false);
    },
  );
});
