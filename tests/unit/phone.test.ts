import { describe, it, expect } from 'vitest';
import { formatPhone, telHref } from '@/lib/utils/phone';

// S-DEAL-CONTACT-1: `formatPhone` — носитель формата номера в карточке сделки
// (чип «Следующего шага», строки «Стейкхолдеров») и на экранах лидов.
describe('formatPhone', () => {
  it('11 цифр с 7 → +7 (XXX) XXX-XX-XX', () => {
    expect(formatPhone('79214451208')).toBe('+7 (921) 445-12-08');
  });

  it('11 цифр с 8 → тот же вид, 8 заменена на 7', () => {
    expect(formatPhone('89214451208')).toBe('+7 (921) 445-12-08');
    expect(formatPhone('8 921 445 12 08')).toBe('+7 (921) 445-12-08');
  });

  it('10 цифр → дополняется 7', () => {
    expect(formatPhone('9214451208')).toBe('+7 (921) 445-12-08');
  });

  it('непарсируемое возвращается как есть, без падения', () => {
    expect(formatPhone('7110')).toBe('7110');
    expect(formatPhone('')).toBe('');
    expect(formatPhone(null)).toBe('');
    expect(formatPhone(undefined)).toBe('');
  });

  it('идемпотентен на уже отформатированном номере', () => {
    const once = formatPhone('+7 (921) 445-12-08');
    expect(once).toBe('+7 (921) 445-12-08');
    expect(formatPhone(once)).toBe(once);
  });
});

describe('telHref', () => {
  it('оставляет только цифры и +', () => {
    expect(telHref('+7 (921) 445-12-08')).toBe('tel:+79214451208');
    expect(telHref('8 921 445-12-08')).toBe('tel:89214451208');
  });
});
