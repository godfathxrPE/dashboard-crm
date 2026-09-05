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
