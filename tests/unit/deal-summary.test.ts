import { describe, it, expect } from 'vitest';
import { daysInWork, deadlineOverdueDays, pickDecisionMaker } from '@/lib/domain/deal-summary';

// S-DEAL-SUMMARY-1: чистые вычисления строк «Сводки». «Сейчас» — аргументом,
// моменты заданы со смещением +03:00, чтобы граница суток МСК была видна глазом
// и не зависела от TZ машины, на которой бегут тесты.

describe('daysInWork — дней в работе по суткам МСК', () => {
  it('создана сегодня (МСК) ⇒ 0', () => {
    expect(daysInWork('2026-09-26T09:00:00+03:00', new Date('2026-09-26T21:00:00+03:00'))).toBe(0);
  });

  it('создана вчера в 23:30 МСК, сейчас 00:10 МСК ⇒ 1 (в UTC это один день)', () => {
    expect(daysInWork('2026-09-25T23:30:00+03:00', new Date('2026-09-26T00:10:00+03:00'))).toBe(1);
  });

  it('через 00:00 UTC, но в одних сутках МСК ⇒ 0', () => {
    // 01:30 МСК = 22:30Z предыдущего дня UTC; 23:00 МСК того же дня.
    expect(daysInWork('2026-09-26T01:30:00+03:00', new Date('2026-09-26T23:00:00+03:00'))).toBe(0);
  });

  it('30 дней', () => {
    expect(daysInWork('2026-08-06T12:00:00+03:00', new Date('2026-09-05T08:00:00+03:00'))).toBe(30);
  });

  it('created_at в будущем или битый ⇒ 0, а не отрицательное', () => {
    expect(daysInWork('2026-09-28T12:00:00+03:00', new Date('2026-09-26T12:00:00+03:00'))).toBe(0);
    expect(daysInWork('не дата', new Date('2026-09-26T12:00:00+03:00'))).toBe(0);
  });
});

describe('deadlineOverdueDays — просрочка дедлайна сделки', () => {
  const now = new Date('2026-09-26T15:00:00+03:00');

  it('дедлайн сегодня ⇒ не просрочен', () => {
    expect(deadlineOverdueDays('2026-09-26', now)).toBe(0);
  });

  it('дедлайн вчера ⇒ 1', () => {
    expect(deadlineOverdueDays('2026-09-25', now)).toBe(1);
  });

  it('дедлайн через 3 дня ⇒ не просрочен', () => {
    expect(deadlineOverdueDays('2026-09-29', now)).toBe(0);
  });

  it('сразу после полуночи МСК вчерашний дедлайн уже просрочен (в UTC ещё «вчера»)', () => {
    expect(deadlineOverdueDays('2026-09-25', new Date('2026-09-26T00:05:00+03:00'))).toBe(1);
  });

  it('нет дедлайна ⇒ 0', () => {
    expect(deadlineOverdueDays(null, now)).toBe(0);
    expect(deadlineOverdueDays(undefined, now)).toBe(0);
  });
});

describe('pickDecisionMaker — ЛПР для строки сводки', () => {
  const row = (id: string, role: string | null, created_at: string) => ({ id, role, created_at });

  it('ни одного decision_maker ⇒ null', () => {
    expect(pickDecisionMaker([])).toBeNull();
    expect(pickDecisionMaker([row('a', 'champion', '2026-09-01'), row('b', null, '2026-09-02')])).toBeNull();
  });

  it('один ⇒ он, без «+N»', () => {
    const r = pickDecisionMaker([row('a', 'champion', '2026-09-01'), row('b', 'decision_maker', '2026-09-02')]);
    expect(r?.first.id).toBe('b');
    expect(r?.extra).toBe(0);
  });

  it('два ⇒ первый по created_at + «+1», порядок входа не важен', () => {
    const r = pickDecisionMaker([
      row('late', 'decision_maker', '2026-09-10'),
      row('early', 'decision_maker', '2026-09-03'),
    ]);
    expect(r?.first.id).toBe('early');
    expect(r?.extra).toBe(1);
  });
});
