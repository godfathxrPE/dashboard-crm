import { describe, it, expect } from 'vitest';
import { resolveStageNorm, stageTimeGauge } from '@/lib/domain/stage-norm';

// «Сейчас» фиксировано: функция принимает now параметром именно затем, чтобы
// тест не зависел от часов машины (урок S-LEAD-HUB-2b — leadStaleness читала
// Date.now() мимо переданного времени, и тест этого не ловил).
const NOW = new Date('2026-08-10T12:00:00Z');

/** ISO-время «N дней назад» от NOW — ровно, без дробных остатков. */
function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86400000).toISOString();
}

describe('stageTimeGauge', () => {
  it('меньше 70% нормы — ok', () => {
    const g = stageTimeGauge(daysAgo(69), 100, NOW);
    expect(g).toEqual({ days: 69, norm: 100, pct: 69, state: 'ok' });
  });

  it('ровно 70% нормы — warn (граница включительно)', () => {
    const g = stageTimeGauge(daysAgo(70), 100, NOW);
    expect(g.state).toBe('warn');
    expect(g.pct).toBe(70);
  });

  it('ровно норма — ещё warn, не over', () => {
    const g = stageTimeGauge(daysAgo(100), 100, NOW);
    expect(g.state).toBe('warn');
    expect(g.pct).toBe(100);
  });

  it('норма превышена — over, при этом pct зажат в 100', () => {
    const g = stageTimeGauge(daysAgo(101), 100, NOW);
    expect(g.state).toBe('over');
    expect(g.pct).toBe(100);
    expect(g.days).toBe(101);
  });

  it('сильное превышение не растит pct выше 100 (заливка стоит, кричит счётчик)', () => {
    const g = stageTimeGauge(daysAgo(500), 100, NOW);
    expect(g).toEqual({ days: 500, norm: 100, pct: 100, state: 'over' });
  });

  it('пустой stage_entered_at — дней нет, состояние ok', () => {
    expect(stageTimeGauge(null, 14, NOW)).toEqual({ days: null, norm: 14, pct: null, state: 'ok' });
  });

  it('невалидная дата — дней нет, состояние ok (не NaN и не бросок)', () => {
    const g = stageTimeGauge('не дата', 14, NOW);
    expect(g.days).toBeNull();
    expect(g.state).toBe('ok');
  });

  it('нормы нет — pct null, заливка не рисуется, но дни считаются', () => {
    const g = stageTimeGauge(daysAgo(9), null, NOW);
    expect(g).toEqual({ days: 9, norm: null, pct: null, state: 'ok' });
  });

  it('норма 0 приравнена к «нормы нет» — деления на ноль не происходит', () => {
    const g = stageTimeGauge(daysAgo(3), 0, NOW);
    expect(g).toEqual({ days: 3, norm: null, pct: null, state: 'ok' });
  });

  it('вход в стадию в будущем (перекос часов) — дни зажаты в 0, не отрицательны', () => {
    const future = new Date(NOW.getTime() + 3 * 86400000).toISOString();
    expect(stageTimeGauge(future, 14, NOW).days).toBe(0);
  });
});

describe('resolveStageNorm', () => {
  const stage = { id: 'stage-a', phase_group: 'attraction' };

  it('пустые настройки — фолбэк STALE_BY_PHASE (attraction → 14)', () => {
    expect(resolveStageNorm(stage, undefined, undefined)).toBe(14);
    expect(resolveStageNorm(stage, {}, {})).toBe(14);
  });

  it('порог группы из настроек org бьёт хардкод-фолбэк', () => {
    expect(resolveStageNorm(stage, undefined, { attraction: 7 })).toBe(7);
  });

  it('оверрайд по stage_id бьёт групповой порог', () => {
    expect(resolveStageNorm(stage, { 'stage-a': 3 }, { attraction: 7 })).toBe(3);
  });

  it('оверрайд ЧУЖОЙ стадии не влияет', () => {
    expect(resolveStageNorm(stage, { 'stage-b': 3 }, { attraction: 7 })).toBe(7);
  });

  it('неизвестная phase_group — settings.default, иначе STALE_DEFAULT (21)', () => {
    const unknown = { id: 'x', phase_group: 'нездешняя' };
    expect(resolveStageNorm(unknown, undefined, undefined)).toBe(21);
    expect(resolveStageNorm(unknown, undefined, { default: 9 })).toBe(9);
  });

  it('phase_group = null — тоже дефолт, без падения', () => {
    expect(resolveStageNorm({ id: 'x', phase_group: null }, undefined, undefined)).toBe(21);
  });
});
