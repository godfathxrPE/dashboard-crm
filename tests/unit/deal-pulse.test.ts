import { describe, it, expect } from 'vitest';
import { buildDealPulse, silenceWithin } from '@/lib/domain/deal-pulse';

// «Сейчас» фиксировано: время аргументом, тест не зависит от часов машины
// (урок S-LEAD-HUB-2b — leadStaleness читала Date.now() мимо переданного
// времени, и тест этого не поймал). Полдень МСК — подальше от границы суток,
// граница проверяется отдельным кейсом ниже.
const NOW = new Date('2026-09-07T09:00:00.000Z'); // 12:00 МСК

function daysAgo(n: number, hourUTC = 9): string {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(hourUTC, 0, 0, 0);
  return d.toISOString();
}

function ev(createdAt: string) {
  return { created_at: createdAt };
}

describe('buildDealPulse', () => {
  it('пустой вход: 30 дней нулей, total 0, lastEventAt null', () => {
    const pulse = buildDealPulse([], NOW);
    expect(pulse.days).toHaveLength(30);
    expect(pulse.days.every((d) => d.count === 0)).toBe(true);
    expect(pulse.total).toBe(0);
    expect(pulse.lastEventAt).toBeNull();
  });

  it('одно событие сегодня: total 1, тишина 29 дней (хвост слева)', () => {
    const pulse = buildDealPulse([ev(daysAgo(0))], NOW);
    expect(pulse.total).toBe(1);
    expect(pulse.longestSilence.days).toBe(29);
    // Хвост слева: разрыв заканчивается днём ПЕРЕД сегодня.
    expect(pulse.longestSilence.endedOn).toBe(pulse.days[28].day);
  });

  it('события каждый день: тишины нет', () => {
    const events = Array.from({ length: 30 }, (_, i) => ev(daysAgo(i)));
    const pulse = buildDealPulse(events, NOW);
    expect(pulse.longestSilence.days).toBe(0);
    expect(pulse.longestSilence.endedOn).toBeNull();
  });

  it('разрыв 9 дней в середине, 3 в конце: берётся 9', () => {
    // Индексы days[] 0..29 = от (now-29) до now. События на всех днях, КРОМЕ
    // середины (индексы 10..18, 9 дней подряд) и хвоста (индексы 27..29, 3 дня).
    const emptyMiddle = new Set([10, 11, 12, 13, 14, 15, 16, 17, 18]);
    const emptyTail = new Set([27, 28, 29]);
    const events = [];
    for (let idx = 0; idx < 30; idx++) {
      if (emptyMiddle.has(idx) || emptyTail.has(idx)) continue;
      events.push(ev(daysAgo(29 - idx)));
    }
    const pulse = buildDealPulse(events, NOW);
    expect(pulse.longestSilence.days).toBe(9);
    expect(pulse.longestSilence.endedOn).toBe(pulse.days[18].day);
  });

  it('разрыв в хвосте (последние 11 дней пусто): незавершённый разрыв считается', () => {
    const emptyTail = new Set(Array.from({ length: 11 }, (_, k) => 30 - 11 + k)); // 19..29
    const events = [];
    for (let idx = 0; idx < 30; idx++) {
      if (emptyTail.has(idx)) continue;
      events.push(ev(daysAgo(29 - idx)));
    }
    const pulse = buildDealPulse(events, NOW);
    expect(pulse.longestSilence.days).toBe(11);
    expect(pulse.longestSilence.endedOn).toBe(pulse.days[29].day);
  });

  it('события старше 30 дней в окно не попадают', () => {
    const old = ev(daysAgo(45));
    const pulse = buildDealPulse([old], NOW);
    expect(pulse.total).toBe(0);
    expect(pulse.lastEventAt).toBeNull();
  });

  it('два события в один день: count 2, точка спарклайна суммирует пару', () => {
    const pulse = buildDealPulse([ev(daysAgo(0)), ev(daysAgo(0, 14))], NOW);
    expect(pulse.days[29].count).toBe(2);
    expect(pulse.total).toBe(2);
    // Пара дней (28,29) — последняя точка спарклайна.
    expect(pulse.points[14]).toBe(2);
  });

  it('15 точек, не 16 — фиксируем отступление от спеки', () => {
    const pulse = buildDealPulse([], NOW);
    expect(pulse.points).toHaveLength(15);
  });

  it('граница дня 23:59 МСК попадает в свой день, не в следующий', () => {
    // 23:59 МСК = 20:59 UTC того же календарного дня — "вчера" относительно NOW.
    const yesterday2359Msk = new Date(NOW);
    yesterday2359Msk.setUTCDate(yesterday2359Msk.getUTCDate() - 1);
    yesterday2359Msk.setUTCHours(20, 59, 0, 0);
    const pulse = buildDealPulse([ev(yesterday2359Msk.toISOString())], NOW);
    expect(pulse.days[28].count).toBe(1); // вчера, не сегодня
    expect(pulse.days[29].count).toBe(0);
  });

  it('lastEventAt — самое позднее событие, не последнее по порядку массива', () => {
    const pulse = buildDealPulse([ev(daysAgo(0)), ev(daysAgo(5))], NOW);
    expect(pulse.lastEventAt).toBe(daysAgo(0));
  });
});

describe('silenceWithin', () => {
  it('считает разрыв только в пределах последних N точек среза', () => {
    const pulse = buildDealPulse(
      // Событие 20 дней назад (за пределами 14-дневного среза), тишина на
      // последних 14 днях полная.
      [{ created_at: daysAgo(20) }],
      NOW,
    );
    const within14 = silenceWithin(pulse.days, 14);
    expect(within14.days).toBe(14);
  });
});
