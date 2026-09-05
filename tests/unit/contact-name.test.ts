import { describe, test, expect } from 'vitest';
import { formatContactName, formatContactNameShort } from '@/lib/utils/contact-name';

/**
 * S-FORMAT-1 (F-01): одно правило показа имени контакта на продукт.
 * До правки локальная `shortName` в «Сводке» сделки на контакте без фамилии
 * печатала « Н.» — человека на экране не было.
 */

describe('formatContactName — полное имя', () => {
  test('только имя', () => {
    expect(formatContactName('Наталья', '')).toBe('Наталья');
  });

  test('только фамилия', () => {
    expect(formatContactName('', 'Трубачев')).toBe('Трубачев');
  });

  test('имя и фамилия', () => {
    expect(formatContactName('Денис', 'Трубачев')).toBe('Денис Трубачев');
  });

  test('пусто — прочерк', () => {
    expect(formatContactName('', '')).toBe('—');
  });
});

describe('formatContactNameShort — короткое имя', () => {
  test('обе части — «Фамилия И.»', () => {
    expect(formatContactNameShort('Денис', 'Трубачев')).toBe('Трубачев Д.');
  });

  test('регресс F-01: без фамилии показывается имя целиком, не « Н.»', () => {
    expect(formatContactNameShort('Наталья', '')).toBe('Наталья');
  });

  test('без имени — фамилия целиком', () => {
    expect(formatContactNameShort('', 'Трубачев')).toBe('Трубачев');
  });

  test('пробельные строки — прочерк', () => {
    expect(formatContactNameShort('  ', '  ')).toBe('—');
  });
});

/**
 * Регресс гейта S-FORMAT-1: фикс F-01 сначала не сработал на живых данных.
 * Проверено запросом к проду — у пяти контактов `last_name = '-'`, а не NULL,
 * и «- Н.» осталось на экране после спринта.
 */
describe('заполнители вместо пустого значения (F-01, регресс гейта)', () => {
  for (const placeholder of ['-', '–', '—', '.', '_']) {
    test(`фамилия «${placeholder}» — это отсутствие фамилии`, () => {
      expect(formatContactNameShort('Наталья', placeholder)).toBe('Наталья');
      expect(formatContactName('Наталья', placeholder)).toBe('Наталья');
    });
  }

  test('дефис ВНУТРИ фамилии не трогаем — сравнение точное, не по подстроке', () => {
    expect(formatContactName('Николай', 'Римский-Корсаков')).toBe('Николай Римский-Корсаков');
    expect(formatContactNameShort('Николай', 'Римский-Корсаков')).toBe('Римский-Корсаков Н.');
  });

  test('настоящие короткие фамилии из базы не считаются заполнителями', () => {
    expect(formatContactNameShort('Виктор', 'Цой')).toBe('Цой В.');
  });

  test('обе части — заполнители: прочерк', () => {
    expect(formatContactName('-', '-')).toBe('—');
    expect(formatContactNameShort('-', '-')).toBe('—');
  });
});
