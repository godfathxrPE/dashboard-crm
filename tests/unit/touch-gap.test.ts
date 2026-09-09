import { describe, it, expect } from 'vitest';
import { touchGapDays, TOUCH_GAP_MIN_DAYS, type TouchGapEvent } from '@/lib/domain/touch-gap';

// Опора: 09.09.2026, 12:00 МСК = 09:00 UTC. Полдень намеренно — на нём календарный
// день совпадает в МСК и UTC, поэтому тесты порогов проверяют ПОРОГ, а не таймзону.
// Таймзона проверяется отдельным блоком ниже.
const NOON_MSK = new Date('2026-09-09T09:00:00Z');

/** Событие ленты минимальным объёмом: вид + дата (+ eventType для журнала). */
function ev(date: string, kind = 'call', eventType?: string): TouchGapEvent {
  return eventType === undefined ? { date, kind } : { date, kind, eventType };
}

describe('touchGapDays — «нет касаний» это null, а не ноль', () => {
  it('пустая лента — null', () => {
    expect(touchGapDays([], NOON_MSK)).toBeNull();
  });

  it('все события в будущем — null: пусто ≠ ноль дней', () => {
    const events = [ev('2026-09-12T09:00:00Z', 'task'), ev('2026-09-30T09:00:00Z', 'task')];
    expect(touchGapDays(events, NOON_MSK)).toBeNull();
  });

  it('только project_updated — null: правка полей не касание', () => {
    const events = [
      ev('2026-09-08T09:00:00Z', 'activity', 'project_updated'),
      ev('2026-09-01T09:00:00Z', 'activity', 'project_updated'),
    ];
    expect(touchGapDays(events, NOON_MSK)).toBeNull();
  });

  it('битая дата не считается касанием', () => {
    expect(touchGapDays([ev('не дата')], NOON_MSK)).toBeNull();
  });
});

describe('touchGapDays — счёт дней', () => {
  it('событие сегодня — 0', () => {
    expect(touchGapDays([ev('2026-09-09T06:00:00Z')], NOON_MSK)).toBe(0);
  });

  it('событие вчера — 1', () => {
    expect(touchGapDays([ev('2026-09-08T09:00:00Z')], NOON_MSK)).toBe(1);
  });

  it('событие неделю назад — 7', () => {
    expect(touchGapDays([ev('2026-09-02T09:00:00Z')], NOON_MSK)).toBe(7);
  });

  it('берётся САМОЕ СВЕЖЕЕ касание, а не первое в массиве', () => {
    // Вход намеренно не отсортирован: функция про порядок ленты не знает.
    const events = [ev('2026-08-20T09:00:00Z'), ev('2026-09-06T09:00:00Z'), ev('2026-09-01T09:00:00Z')];
    expect(touchGapDays(events, NOON_MSK)).toBe(3);
  });
});

describe('touchGapDays — отсечка будущего (B1)', () => {
  it('задача со сроком на четверг не обнуляет счётчик', () => {
    // Ровно тот случай, на котором обжёгся DealLastEvent 08.09: `taskToEvent`
    // ставит дату события в `deadline`, и задача из будущего стоит в ленте первой.
    const events = [
      ev('2026-09-11T09:00:00Z', 'task'),   // дедлайн послезавтра — в ленте сверху
      ev('2026-09-02T09:00:00Z', 'call'),   // последнее РЕАЛЬНОЕ касание
    ];
    expect(touchGapDays(events, NOON_MSK)).toBe(7);
  });

  it('project_updated не перебивает более старое настоящее касание', () => {
    const events = [
      ev('2026-09-08T09:00:00Z', 'activity', 'project_updated'),
      ev('2026-09-02T09:00:00Z', 'meeting'),
    ];
    expect(touchGapDays(events, NOON_MSK)).toBe(7);
  });

  it('stage_changed касанием СЧИТАЕТСЯ: у смены стадии свой смысл', () => {
    const events = [ev('2026-09-08T09:00:00Z', 'activity', 'stage_changed')];
    expect(touchGapDays(events, NOON_MSK)).toBe(1);
  });
});

describe('touchGapDays — порог показа', () => {
  it('порог равен трём дням', () => {
    expect(TOUCH_GAP_MIN_DAYS).toBe(3);
  });

  it('два дня — ниже порога, строки нет', () => {
    const gap = touchGapDays([ev('2026-09-07T09:00:00Z')], NOON_MSK);
    expect(gap).toBe(2);
    expect(gap! >= TOUCH_GAP_MIN_DAYS).toBe(false);
  });

  it('три дня — порог взят, строка появляется', () => {
    const gap = touchGapDays([ev('2026-09-06T09:00:00Z')], NOON_MSK);
    expect(gap).toBe(3);
    expect(gap! >= TOUCH_GAP_MIN_DAYS).toBe(true);
  });
});

describe('touchGapDays — граница суток МСК', () => {
  it('22:30 МСК и 00:30 МСК следующего дня дают РАЗНОЕ число дней', () => {
    const touch = ev('2026-09-06T09:00:00Z');
    // 09.09 22:30 МСК = 19:30 UTC
    expect(touchGapDays([touch], new Date('2026-09-09T19:30:00Z'))).toBe(3);
    // 10.09 00:30 МСК = 09.09 21:30 UTC — календарный день МСК уже следующий
    expect(touchGapDays([touch], new Date('2026-09-09T21:30:00Z'))).toBe(4);
  });

  it('касание поздним вечером МСК считается своим календарным днём', () => {
    // 08.09 23:30 МСК = 20:30 UTC 08.09 — это ВЧЕРА по МСК, а не позавчера.
    expect(touchGapDays([ev('2026-09-08T20:30:00Z')], NOON_MSK)).toBe(1);
  });
});
