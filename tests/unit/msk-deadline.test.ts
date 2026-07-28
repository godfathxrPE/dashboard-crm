import { describe, it, expect } from 'vitest';
import { mskDeadlineInDays, mskEndOfDayIso, mskDateKey } from '@/lib/utils/date-helpers';

// ═══════════════════════════════════════════════════════
// D2 (S-R2-AI-HARDEN) — дедлайн задачи из AI-предложения.
// Старая арифметика `Date.now() + due_in_days * 86_400_000` давала при due_in_days: 0
// дедлайн «прямо сейчас» — задача просрочена через секунду после создания.
// Правило: дедлайн = КОНЕЦ КАЛЕНДАРНОГО ДНЯ по МСК.
// ═══════════════════════════════════════════════════════

describe('mskEndOfDayIso', () => {
  it('конец дня МСК = 20:59:59.999Z того же дня (МСК = UTC+3, без DST)', () => {
    expect(mskEndOfDayIso('2026-07-28')).toBe('2026-07-28T20:59:59.999Z');
  });

  it('работает на границе года', () => {
    expect(mskEndOfDayIso('2026-12-31')).toBe('2026-12-31T20:59:59.999Z');
  });

  it('работает на дате, где европейский DST переключается (у МСК его нет)', () => {
    // Последнее воскресенье марта — в TZ с DST здесь ловится off-by-one.
    expect(mskEndOfDayIso('2026-03-29')).toBe('2026-03-29T20:59:59.999Z');
  });
});

describe('mskDeadlineInDays', () => {
  // 22:30 МСК = 19:30Z. В UTC это ещё 28-е, в МСК — тоже 28-е.
  const lateEvening = new Date('2026-07-28T19:30:00.000Z');
  // 00:30 МСК 29-го = 21:30Z 28-го. В UTC ещё 28-е, в МСК уже 29-е — та самая
  // граница суток, на которой ломается toISOString().slice(0,10).
  const afterMidnightMsk = new Date('2026-07-28T21:30:00.000Z');

  it('due_in_days: 0 — конец СЕГОДНЯШНЕГО дня, а не момент клика', () => {
    const iso = mskDeadlineInDays(0, lateEvening);
    expect(iso).toBe('2026-07-28T20:59:59.999Z');
    // Ключевое свойство: дедлайн строго в будущем относительно момента создания.
    expect(new Date(iso).getTime()).toBeGreaterThan(lateEvening.getTime());
  });

  it('due_in_days: 1 — конец ЗАВТРАШНЕГО дня, и это другая дата', () => {
    const d0 = mskDeadlineInDays(0, lateEvening);
    const d1 = mskDeadlineInDays(1, lateEvening);
    expect(d1).toBe('2026-07-29T20:59:59.999Z');
    expect(d1).not.toBe(d0);
    expect(mskDateKey(d1)).not.toBe(mskDateKey(d0));
  });

  it('после полуночи по МСК «сегодня» — уже следующий день', () => {
    // 21:30Z 28-го = 00:30 МСК 29-го ⇒ «сегодня» = 29-е, конец дня 29-го.
    expect(mskDeadlineInDays(0, afterMidnightMsk)).toBe('2026-07-29T20:59:59.999Z');
  });

  it('шаг между соседними N — ровно сутки', () => {
    const a = new Date(mskDeadlineInDays(3, lateEvening)).getTime();
    const b = new Date(mskDeadlineInDays(4, lateEvening)).getTime();
    expect(b - a).toBe(86_400_000);
  });

  it('переносит через границу месяца', () => {
    expect(mskDeadlineInDays(4, new Date('2026-07-28T09:00:00.000Z')))
      .toBe('2026-08-01T20:59:59.999Z');
  });
});
