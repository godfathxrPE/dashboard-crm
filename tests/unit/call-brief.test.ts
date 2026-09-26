import { describe, test, expect } from 'vitest';
import { formatCallDuration } from '@/lib/utils/call-brief';
import { formatPersonShort } from '@/lib/utils/contact-name';

describe('formatCallDuration', () => {
  test('нет длительности или не положительная → null', () => {
    expect(formatCallDuration(null)).toBeNull();
    expect(formatCallDuration(0)).toBeNull();
    expect(formatCallDuration(-5)).toBeNull();
  });

  test('меньше минуты → «<1 мин»', () => {
    expect(formatCallDuration(30)).toBe('<1 мин');
  });

  test('минуты — округление вниз', () => {
    expect(formatCallDuration(720)).toBe('12 мин');
    expect(formatCallDuration(779)).toBe('12 мин');
  });

  test('час и больше → «1 ч 05 мин»', () => {
    expect(formatCallDuration(3900)).toBe('1 ч 05 мин');
    expect(formatCallDuration(3600)).toBe('1 ч 00 мин');
  });
});

describe('formatPersonShort — «Имя Ф.»', () => {
  test('имя и фамилия → «Наталья Н.»', () => {
    expect(formatPersonShort('Наталья', 'Нечаева')).toBe('Наталья Н.');
  });

  test('без фамилии → только имя', () => {
    expect(formatPersonShort('Наталья', '')).toBe('Наталья');
    expect(formatPersonShort('Наталья', null)).toBe('Наталья');
    // заполнитель импорта — то же отсутствие фамилии
    expect(formatPersonShort('Наталья', '-')).toBe('Наталья');
  });

  test('пробелы по краям обрезаются', () => {
    expect(formatPersonShort('  Наталья ', ' Нечаева  ')).toBe('Наталья Н.');
  });

  test('показать нечего → null (сегмент меты не рисуется)', () => {
    expect(formatPersonShort(null, null)).toBeNull();
    expect(formatPersonShort(' ', '')).toBeNull();
  });
});
