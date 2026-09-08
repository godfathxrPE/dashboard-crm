import { describe, it, expect } from 'vitest';
import { quoteValidity } from '@/lib/domain/quote-validity';

// Опора: 07.09.2026, 12:00 МСК = 09:00 UTC. Полдень взят намеренно — на нём
// календарный день совпадает в МСК и UTC, поэтому тесты порогов проверяют ПОРОГ,
// а не таймзону. Таймзона проверяется отдельным блоком ниже.
const NOON_MSK = new Date('2026-09-07T09:00:00Z');

describe('quoteValidity — daysLeft', () => {
  it('завтра — 1 день', () => {
    expect(quoteValidity('2026-09-08', NOON_MSK).daysLeft).toBe(1);
  });
  it('сегодня — 0 дней', () => {
    expect(quoteValidity('2026-09-07', NOON_MSK).daysLeft).toBe(0);
  });
  it('вчера — минус день', () => {
    expect(quoteValidity('2026-09-06', NOON_MSK).daysLeft).toBe(-1);
  });
});

describe('quoteValidity — границы level', () => {
  it('4 дня — ok (жёлтым)', () => {
    expect(quoteValidity('2026-09-11', NOON_MSK)).toEqual({ daysLeft: 4, level: 'ok' });
  });
  it('3 дня — soon (порог спеки W4)', () => {
    expect(quoteValidity('2026-09-10', NOON_MSK)).toEqual({ daysLeft: 3, level: 'soon' });
  });
  it('0 дней — ещё soon, а не expired: последний день КП действует', () => {
    expect(quoteValidity('2026-09-07', NOON_MSK)).toEqual({ daysLeft: 0, level: 'soon' });
  });
  it('−1 день — expired', () => {
    expect(quoteValidity('2026-09-06', NOON_MSK)).toEqual({ daysLeft: -1, level: 'expired' });
  });
});

describe('quoteValidity — срока нет', () => {
  it('null ⇒ daysLeft null и level ok (не тревога, а отсутствие сведений)', () => {
    expect(quoteValidity(null, NOON_MSK)).toEqual({ daysLeft: null, level: 'ok' });
  });
});

describe('quoteValidity — граница суток МСК', () => {
  // 07.09 23:30 МСК = 20:30 UTC; 08.09 00:30 МСК = 21:30 UTC того же дня.
  // Обе точки лежат в ОДНИХ сутках UTC — если бы счёт шёл по UTC, ответ совпал бы.
  const BEFORE_MIDNIGHT_MSK = new Date('2026-09-07T20:30:00Z');
  const AFTER_MIDNIGHT_MSK = new Date('2026-09-07T21:30:00Z');

  it('до полуночи МСК срок ещё двухдневный, после — однодневный', () => {
    expect(quoteValidity('2026-09-09', BEFORE_MIDNIGHT_MSK).daysLeft).toBe(2);
    expect(quoteValidity('2026-09-09', AFTER_MIDNIGHT_MSK).daysLeft).toBe(1);
  });

  it('переход через полночь МСК переводит уровень из ok в soon', () => {
    expect(quoteValidity('2026-09-11', BEFORE_MIDNIGHT_MSK).level).toBe('ok');
    expect(quoteValidity('2026-09-11', AFTER_MIDNIGHT_MSK).level).toBe('soon');
  });
});
