import { describe, it, expect } from 'vitest';
import {
  getLeadHealth,
  getLeadActionOverdueDays,
  compareLeadHealth,
  type LeadHealthResult,
} from '@/lib/utils/lead-health';

// ═══════════════════════════════════════════════════════
// S-LEAD-HUB-2b. Доменное правило, а не рендер: запланированный шаг ГЛУШИТ
// staleness. Оно решает, что человек увидит в очереди дня, и ошибка здесь тихая —
// лид либо кричит без повода, либо молчит, когда обещание клиенту просрочено.
// ═══════════════════════════════════════════════════════

const NOW = new Date('2026-08-10T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();
/** Дата-ключ (YYYY-MM-DD) со сдвигом в днях от «сегодня». */
const dateKey = (offset: number) =>
  new Date(NOW.getTime() + offset * 86400000).toISOString().slice(0, 10);

function lead(over: Partial<Parameters<typeof getLeadHealth>[0]> = {}) {
  return {
    status: 'new',
    created_at: daysAgo(0),
    updated_at: daysAgo(0),
    next_action_date: null,
    ...over,
  };
}

describe('getLeadHealth — шаг важнее возраста', () => {
  it('дата шага завтра глушит 30-дневный возраст', () => {
    const r = getLeadHealth(
      lead({ created_at: daysAgo(30), updated_at: daysAgo(30), next_action_date: dateKey(1) }),
      NOW,
    );
    expect(r.level).toBe('ok');
    expect(r.days).toBe(0);
  });

  it('дата шага сегодня — тоже ok (день ещё не кончился)', () => {
    expect(getLeadHealth(lead({ next_action_date: dateKey(0) }), NOW).level).toBe('ok');
  });

  it('дата шага вчера — overdue-action с days = 1', () => {
    const r = getLeadHealth(lead({ next_action_date: dateKey(-1) }), NOW);
    expect(r.level).toBe('overdue-action');
    expect(r.days).toBe(1);
    expect(r.reason).toBe('overdue');
  });
});

describe('getLeadHealth — без шага работают прежние пороги', () => {
  it('3 дня в new без шага → cold (порог 1 × 2)', () => {
    const r = getLeadHealth(lead({ created_at: daysAgo(3), updated_at: daysAgo(3) }), NOW);
    expect(r.level).toBe('cold');
    expect(r.days).toBe(3);
    expect(r.reason).toBe('idle');
  });

  it('2 дня в new без шага → stale', () => {
    expect(getLeadHealth(lead({ created_at: daysAgo(2), updated_at: daysAgo(2) }), NOW).level)
      .toBe('stale');
  });

  it('свежий лид без шага → ok', () => {
    expect(getLeadHealth(lead(), NOW).level).toBe('ok');
  });
});

describe('getLeadHealth — закрытые лиды', () => {
  it('disqualified — ok при любом возрасте', () => {
    expect(
      getLeadHealth(lead({ status: 'disqualified', created_at: daysAgo(90), updated_at: daysAgo(90) }), NOW).level,
    ).toBe('ok');
  });

  it('converted — ok даже с просроченным шагом', () => {
    expect(
      getLeadHealth(lead({ status: 'converted', next_action_date: dateKey(-10) }), NOW).level,
    ).toBe('ok');
  });
});

describe('getLeadActionOverdueDays', () => {
  it('будущая дата не даёт отрицательных дней', () => {
    expect(getLeadActionOverdueDays(dateKey(5), NOW)).toBe(0);
  });
  it('считает от начала суток, а не от текущего часа', () => {
    expect(getLeadActionOverdueDays(dateKey(-3), NOW)).toBe(3);
  });
});

describe('compareLeadHealth — порядок очереди', () => {
  const r = (level: LeadHealthResult['level'], days: number): LeadHealthResult =>
    ({ level, days, reason: level === 'overdue-action' ? 'overdue' : 'idle' });

  it('просрочка идёт раньше молчания, даже если молчание длиннее', () => {
    expect(compareLeadHealth(r('overdue-action', 1), r('cold', 40))).toBeLessThan(0);
  });

  it('внутри уровня — по убыванию дней', () => {
    expect(compareLeadHealth(r('overdue-action', 2), r('overdue-action', 9))).toBeGreaterThan(0);
  });

  it('cold раньше stale', () => {
    expect(compareLeadHealth(r('cold', 3), r('stale', 3))).toBeLessThan(0);
  });
});
