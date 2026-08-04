import { describe, it, expect } from 'vitest';
import {
  relationshipStrength,
  strengthBand,
  formatStrength,
  STRENGTH_STRONG_MIN,
  STRENGTH_WARM_MIN,
} from '@/lib/domain/relationship-strength';

// S-R2-CO360-1 (D1). Функция чистая и не зовёт `Date.now()` — время подаётся
// вызывающим как `daysSinceLastTouch`, поэтому тесты не морозят часы.

const base = { daysSinceLastTouch: 0, touches90d: 0, hasUpcoming: false };

describe('recency 0–50', () => {
  it('0 дней → 50 очков (верхний узел)', () => {
    expect(relationshipStrength(base).score).toBe(50);
  });

  it('21 день → 25 очков (средний узел)', () => {
    expect(relationshipStrength({ ...base, daysSinceLastTouch: 21 }).score).toBe(25);
  });

  it('60 дней → 0 очков (нижний узел)', () => {
    expect(relationshipStrength({ ...base, daysSinceLastTouch: 60 }).score).toBe(0);
  });

  it('старше 60 дней очков не отнимает — пол на нуле', () => {
    expect(relationshipStrength({ ...base, daysSinceLastTouch: 365 }).score).toBe(0);
  });

  it('интерполирует между узлами: 10 дн ≈ 38, 42 дн ≈ 12', () => {
    // 50 − (10/21)·25 = 38.09…  ·  25 − (21/39)·25 = 11.53…
    expect(relationshipStrength({ ...base, daysSinceLastTouch: 10 }).score).toBe(38);
    expect(relationshipStrength({ ...base, daysSinceLastTouch: 42 }).score).toBe(12);
  });

  it('первый отрезок падает круче второго — в этом смысл кусочности', () => {
    const s = (d: number) => relationshipStrength({ ...base, daysSinceLastTouch: d }).score;
    const perDayEarly = (s(0) - s(21)) / 21;
    const perDayLate = (s(21) - s(60)) / 39;
    expect(perDayEarly).toBeGreaterThan(perDayLate);
  });
});

describe('frequency 0–40', () => {
  it('каждое касание за 90 дней даёт 5 очков', () => {
    // recency при 60 дн = 0, поэтому score — чистая частота
    expect(relationshipStrength({ daysSinceLastTouch: 60, touches90d: 3, hasUpcoming: false }).score).toBe(15);
  });

  it('упирается в 40 и выше не растёт', () => {
    const at8 = relationshipStrength({ daysSinceLastTouch: 60, touches90d: 8, hasUpcoming: false }).score;
    const at50 = relationshipStrength({ daysSinceLastTouch: 60, touches90d: 50, hasUpcoming: false }).score;
    expect(at8).toBe(40);
    expect(at50).toBe(40);
  });
});

describe('upcoming 0–10', () => {
  it('запланированное будущее касание добавляет ровно 10', () => {
    const without = relationshipStrength({ daysSinceLastTouch: 21, touches90d: 1, hasUpcoming: false }).score;
    const withUp = relationshipStrength({ daysSinceLastTouch: 21, touches90d: 1, hasUpcoming: true }).score;
    expect(withUp - without).toBe(10);
  });
});

describe('банды', () => {
  it('границы: 65 → strong, 64 → warm, 30 → warm, 29 → cold', () => {
    expect(strengthBand(STRENGTH_STRONG_MIN)).toBe('strong');
    expect(strengthBand(STRENGTH_STRONG_MIN - 1)).toBe('warm');
    expect(strengthBand(STRENGTH_WARM_MIN)).toBe('warm');
    expect(strengthBand(STRENGTH_WARM_MIN - 1)).toBe('cold');
    expect(strengthBand(65)).toBe('strong');
    expect(strengthBand(30)).toBe('warm');
    expect(strengthBand(29)).toBe('cold');
  });

  it('сквозной кейс: свежее касание + 3 за квартал = ровно 65 = strong', () => {
    const s = relationshipStrength({ daysSinceLastTouch: 0, touches90d: 3, hasUpcoming: false });
    expect(s).toEqual({ score: 65, band: 'strong' });
  });

  it('сквозной кейс: 21 день + 1 касание = ровно 30 = warm', () => {
    const s = relationshipStrength({ daysSinceLastTouch: 21, touches90d: 1, hasUpcoming: false });
    expect(s).toEqual({ score: 30, band: 'warm' });
  });
});

describe('касаний не было', () => {
  it('null → жёсткий ноль и cold', () => {
    expect(relationshipStrength({ daysSinceLastTouch: null, touches90d: 0, hasUpcoming: false }))
      .toEqual({ score: 0, band: 'cold' });
  });

  it('запланированная встреча НЕ греет связь, которой ещё не было', () => {
    // Иначе новый контакт с одной задачей в календаре обгонял бы клиента,
    // с которым говорили полтора месяца назад.
    const never = relationshipStrength({ daysSinceLastTouch: null, touches90d: 0, hasUpcoming: true });
    expect(never.score).toBe(0);
    expect(never.band).toBe('cold');
  });
});

describe('formatStrength', () => {
  it('подпись бейджа — «band · score»', () => {
    expect(formatStrength({ score: 82, band: 'strong' })).toBe('strong · 82');
    expect(formatStrength({ score: 0, band: 'cold' })).toBe('cold · 0');
  });
});
