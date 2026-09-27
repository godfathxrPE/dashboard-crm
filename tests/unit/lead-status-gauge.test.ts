import { describe, it, expect } from 'vitest';
import { leadStatusGauge } from '@/lib/domain/lead-status-gauge';

// ═══════════════════════════════════════════════════════
// S-LEAD-V2-HEALTH-1: мера времени в статусе лида (кокпит). `new` считается по
// часам, `contacted` — по дням от первого касания, у `qualified` нормы нет.
// ═══════════════════════════════════════════════════════

const NOW = new Date('2026-09-27T11:40:00Z'); // 14:40 МСК
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const daysAgo = (d: number) => hoursAgo(d * 24);

function lead(over: Partial<Parameters<typeof leadStatusGauge>[0]> = {}) {
  return {
    status: 'new',
    created_at: hoursAgo(0),
    updated_at: hoursAgo(0),
    first_contacted_at: null,
    qualified_at: null,
    ...over,
  };
}

describe('leadStatusGauge — new, по часам', () => {
  it('20 ч — «20 ч из 24», 83%, warn', () => {
    const r = leadStatusGauge(lead({ created_at: hoursAgo(20) }), NOW);
    expect(r.counterLabel).toBe('20 ч из 24');
    expect(r.gauge.pct).toBe(83);
    expect(r.gauge.state).toBe('warn');
    expect(r.gauge.days).toBe(0);
  });

  it('5 ч — ok', () => {
    expect(leadStatusGauge(lead({ created_at: hoursAgo(5) }), NOW).gauge.state).toBe('ok');
  });

  it('30 ч — over, pct зажат в 100', () => {
    const r = leadStatusGauge(lead({ created_at: hoursAgo(30) }), NOW);
    expect(r.gauge.state).toBe('over');
    expect(r.gauge.pct).toBe(100);
  });

  it('50 ч — «2 дн. из 1»', () => {
    const r = leadStatusGauge(lead({ created_at: hoursAgo(50) }), NOW);
    expect(r.counterLabel).toBe('2 дн. из 1');
    expect(r.gauge.days).toBe(2);
  });

  it('подписи — вход и норма с временем по МСК', () => {
    const r = leadStatusGauge(lead({ created_at: '2026-09-26T15:40:00Z' }), NOW);
    expect(r.dates.entered).toBe('26 сент., 18:40');
    expect(r.dates.norm).toBe('27 сент., 18:40');
  });
});

describe('leadStatusGauge — contacted, от первого касания', () => {
  it('18 дн. — over, норма 7, pct 100', () => {
    const r = leadStatusGauge(lead({ status: 'contacted', first_contacted_at: daysAgo(18) }), NOW);
    expect(r.gauge).toEqual({ days: 18, norm: 7, pct: 100, state: 'over' });
    expect(r.counterLabel).toBeNull();
  });

  it('5 дн. — warn (71%)', () => {
    const r = leadStatusGauge(lead({ status: 'contacted', first_contacted_at: daysAgo(5) }), NOW);
    expect(r.gauge.state).toBe('warn');
    expect(r.gauge.pct).toBe(71);
  });

  it('3 дн. — ok', () => {
    const r = leadStatusGauge(lead({ status: 'contacted', first_contacted_at: daysAgo(3) }), NOW);
    expect(r.gauge.state).toBe('ok');
  });

  it('без first_contacted_at — считается от updated_at', () => {
    const r = leadStatusGauge(lead({ status: 'contacted', updated_at: daysAgo(4) }), NOW);
    expect(r.gauge.days).toBe(4);
  });

  it('подписи: вход и дата нормы', () => {
    const r = leadStatusGauge(
      lead({ status: 'contacted', first_contacted_at: '2026-09-09T08:00:00Z' }),
      NOW,
    );
    expect(r.dates).toEqual({ entered: '9 сент.', norm: '16 сент.' });
  });
});

describe('leadStatusGauge — qualified и терминалы', () => {
  it('qualified — дни от qualified_at, нормы и шкалы нет', () => {
    const r = leadStatusGauge(
      lead({ status: 'qualified', qualified_at: daysAgo(3), updated_at: daysAgo(1) }),
      NOW,
    );
    expect(r.gauge).toEqual({ days: 3, norm: null, pct: null, state: 'ok' });
    expect(r.dates.norm).toBeNull();
  });

  it.each(['converted', 'disqualified'])('%s — days: null', (status) => {
    const r = leadStatusGauge(lead({ status, created_at: daysAgo(10) }), NOW);
    expect(r.gauge.days).toBeNull();
    expect(r.counterLabel).toBeNull();
  });
});
