import { describe, it, expect } from 'vitest';
import { median, share } from '@/lib/domain/stats';
import { aggregateLeadFunnel, LEAD_SOURCE_UNKNOWN } from '@/lib/domain/lead-metrics';
import type { Lead } from '@/types/database';

// ═══════════════════════════════════════════════════════
// S-LEAD-HUB-2b. Главный риск блока аналитики — пустые данные: на проде ноль
// конвертированных лидов, и `NaN%` в KPI выглядел бы как сломанная страница.
// Поэтому первым делом проверяется именно пустой и вырожденный вход.
// ═══════════════════════════════════════════════════════

function lead(over: Partial<Lead> = {}): Lead {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    user_id: 'u-1',
    org_id: 'o-1',
    title: 'Лид',
    source: null,
    status: 'new',
    direction: null,
    company_name_raw: null,
    contact_name_raw: null,
    phone: null,
    email: null,
    notes: null,
    disqualify_reason: null,
    converted_deal_id: null,
    converted_company_id: null,
    converted_contact_id: null,
    converted_at: null,
    created_at: '2026-08-01T09:00:00+00:00',
    updated_at: '2026-08-01T09:00:00+00:00',
    owner_id: null,
    next_step: null,
    next_action_date: null,
    temperature: null,
    estimated_value: null,
    pain: null,
    budget_status: 'unknown',
    decision_role: null,
    chz_groups: null,
    regulatory_deadline: null,
    first_contacted_at: null,
    qualified_at: null,
    ...over,
  } as Lead;
}

describe('stats', () => {
  it('median: нечётная и чётная длина', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('median пустого массива — null, а не 0', () => {
    expect(median([])).toBeNull();
  });

  it('median не мутирует вход', () => {
    const xs = [3, 1, 2];
    median(xs);
    expect(xs).toEqual([3, 1, 2]);
  });

  it('share: деление на ноль даёт 0, а не NaN', () => {
    expect(share(0, 0)).toBe(0);
    expect(Number.isNaN(share(5, 0))).toBe(false);
    expect(share(1, 4)).toBe(0.25);
  });
});

describe('aggregateLeadFunnel — пустые данные', () => {
  const s = aggregateLeadFunnel([], []);

  it('не роняет NaN в конверсию', () => {
    expect(s.totals.conversionRate).toBe(0);
    expect(Number.isNaN(s.totals.conversionRate)).toBe(false);
  });

  it('медианы — null с нулевой выборкой', () => {
    expect(s.firstTouchHours).toEqual({ median: null, count: 0 });
    expect(s.qualifyDays).toEqual({ median: null, count: 0 });
  });

  it('таблицы пусты', () => {
    expect(s.bySource).toEqual([]);
    expect(s.byDisqualifyReason).toEqual([]);
  });
});

describe('aggregateLeadFunnel — воронка', () => {
  const leads = [
    lead({ id: '1', source: 'website' }),
    lead({ id: '2', source: null, status: 'contacted' }),
    lead({ id: '3', source: 'website', status: 'disqualified', disqualify_reason: 'no_budget' }),
  ];
  const converted = [
    lead({ id: '4', source: 'website', status: 'converted' }),
    lead({ id: '5', source: 'referral', status: 'converted' }),
  ];
  const s = aggregateLeadFunnel(leads, converted);

  it('считает активных, конвертированных и отказы', () => {
    expect(s.totals.active).toBe(2);
    expect(s.totals.converted).toBe(2);
    expect(s.totals.disqualified).toBe(1);
    // 2 / (2 + 1)
    expect(s.totals.conversionRate).toBeCloseTo(0.6667, 3);
  });

  it('лид без источника попадает в отдельную строку, а не выбрасывается', () => {
    const unknown = s.bySource.find((r) => r.source === LEAD_SOURCE_UNKNOWN);
    expect(unknown).toEqual({ source: LEAD_SOURCE_UNKNOWN, total: 1, converted: 0, rate: 0 });
    expect(s.bySource.reduce((acc, r) => acc + r.total, 0)).toBe(5);
  });

  it('источник со 100% при меньшем объёме идёт выше — но объём решает при равенстве', () => {
    expect(s.bySource[0].source).toBe('referral'); // 1/1 = 100%
    const website = s.bySource.find((r) => r.source === 'website')!;
    expect(website.total).toBe(3);
    expect(website.converted).toBe(1);
    expect(website.rate).toBeCloseTo(1 / 3, 5);
  });

  it('дубль по id между списками считается один раз', () => {
    const twice = aggregateLeadFunnel([lead({ id: 'x', status: 'converted' })], [lead({ id: 'x', status: 'converted' })]);
    expect(twice.totals.converted).toBe(1);
  });

  it('причины отказов сортируются по количеству', () => {
    expect(s.byDisqualifyReason).toEqual([{ reason: 'no_budget', count: 1 }]);
  });
});

describe('aggregateLeadFunnel — время', () => {
  it('первое касание считается в ЧАСАХ', () => {
    const s = aggregateLeadFunnel(
      [lead({ created_at: '2026-08-01T09:00:00+00:00', first_contacted_at: '2026-08-01T13:00:00+00:00' })],
      [],
    );
    expect(s.firstTouchHours).toEqual({ median: 4, count: 1 });
  });

  it('квалификация — в днях, от первого касания', () => {
    const s = aggregateLeadFunnel(
      [lead({
        first_contacted_at: '2026-08-01T12:00:00+00:00',
        qualified_at: '2026-08-04T12:00:00+00:00',
        status: 'qualified',
      })],
      [],
    );
    expect(s.qualifyDays).toEqual({ median: 3, count: 1 });
  });

  it('лид без штампа в медиану не попадает, но в воронке остаётся', () => {
    const s = aggregateLeadFunnel([lead(), lead({ first_contacted_at: '2026-08-01T10:00:00+00:00' })], []);
    expect(s.firstTouchHours.count).toBe(1);
    expect(s.totals.active).toBe(2);
  });

  it('отрицательная дельта (битые данные) в медиану не идёт', () => {
    const s = aggregateLeadFunnel(
      [lead({ created_at: '2026-08-05T10:00:00+00:00', first_contacted_at: '2026-08-01T10:00:00+00:00' })],
      [],
    );
    expect(s.firstTouchHours).toEqual({ median: null, count: 0 });
  });
});
