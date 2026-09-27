import { describe, it, expect } from 'vitest';
import { getLeadSignals, regulatoryMonths } from '@/lib/domain/lead-signals';

// ═══════════════════════════════════════════════════════
// S-LEAD-V2-HEALTH-1: сигналы зоны «Риски» лида. Главное правило наследуется от
// getLeadHealth — назначенный шаг глушит молчание; здесь оно проверяется ещё раз
// уже на уровне вердикта, который видит человек.
// ═══════════════════════════════════════════════════════

const NOW = new Date('2026-09-27T11:40:00Z'); // 14:40 МСК
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const daysAgo = (d: number) => hoursAgo(d * 24);
/** Ключ дня со сдвигом от «сегодня» (NOW — полдень по UTC и МСК в одних сутках). */
const dateKey = (offset: number) =>
  new Date(NOW.getTime() + offset * 86_400_000).toISOString().slice(0, 10);

function lead(over: Partial<Parameters<typeof getLeadSignals>[0]> = {}) {
  return {
    status: 'contacted',
    created_at: daysAgo(40),
    updated_at: daysAgo(0),
    next_action_date: null,
    regulatory_deadline: null,
    first_contacted_at: null,
    ...over,
  };
}

const step = (r: ReturnType<typeof getLeadSignals>) => r.signals.find((s) => s.key === 'step');
const reg = (r: ReturnType<typeof getLeadSignals>) => r.signals.find((s) => s.key === 'regulatory');
const touch = (r: ReturnType<typeof getLeadSignals>) => r.signals.find((s) => s.key === 'first_touch');

describe('getLeadSignals — шаг', () => {
  it('шаг вчера — bad «Шаг просрочен на 1 дн.», rotting', () => {
    const r = getLeadSignals(lead({ next_action_date: dateKey(-1) }), NOW);
    expect(step(r)).toMatchObject({ state: 'bad', label: 'Шаг просрочен на 1 дн.', cta: 'К шагу' });
    expect(r.verdict).toBe('rotting');
  });

  it('шаг завтра глушит 30 дней молчания', () => {
    const r = getLeadSignals(lead({ next_action_date: dateKey(1), updated_at: daysAgo(30) }), NOW);
    expect(step(r)).toMatchObject({ state: 'ok', label: 'Шаг назначен на завтра', cta: null });
    expect(r.signals.some((s) => s.label.startsWith('Молчание'))).toBe(false);
    expect(r.verdict).toBe('ok');
  });

  it('contacted без шага, 3 дн. — warn «Следующий шаг не назначен»', () => {
    const r = getLeadSignals(lead({ updated_at: daysAgo(3) }), NOW);
    expect(step(r)).toMatchObject({ state: 'warn', label: 'Следующий шаг не назначен' });
    expect(r.verdict).toBe('attention');
  });

  it('contacted без шага, 10 дн. — warn «Молчание 10 дн.»', () => {
    const r = getLeadSignals(lead({ updated_at: daysAgo(10) }), NOW);
    expect(step(r)).toMatchObject({ state: 'warn', label: 'Молчание 10 дн.' });
  });

  it('contacted без шага, 15 дн. — bad «… — лид остывает»', () => {
    const r = getLeadSignals(lead({ updated_at: daysAgo(15) }), NOW);
    expect(step(r)).toMatchObject({ state: 'bad', label: 'Молчание 15 дн. — лид остывает' });
    expect(r.verdict).toBe('rotting');
  });

  it('new без шага, 30 ч — ещё «Следующий шаг не назначен» (staleness new с 48 ч)', () => {
    const r = getLeadSignals(lead({ status: 'new', created_at: hoursAgo(30) }), NOW);
    expect(step(r)).toMatchObject({ state: 'warn', label: 'Следующий шаг не назначен' });
  });

  it('new без шага, 50 ч — warn «Нет первого касания 2 дн.»', () => {
    const r = getLeadSignals(lead({ status: 'new', created_at: hoursAgo(50) }), NOW);
    expect(step(r)).toMatchObject({ state: 'warn', label: 'Нет первого касания 2 дн.' });
  });
});

describe('getLeadSignals — маркировка', () => {
  it('сегодня — warn «… — сегодня»', () => {
    const r = getLeadSignals(lead({ regulatory_deadline: dateKey(0) }), NOW);
    expect(reg(r)?.state).toBe('warn');
    expect(reg(r)?.label).toMatch(/ — сегодня$/);
    expect(reg(r)?.cta).toBe('К ЧЗ');
  });

  it('через 4 дн. — «через 4 дн.», а не «срок наступил»', () => {
    const r = getLeadSignals(lead({ regulatory_deadline: dateKey(4) }), NOW);
    expect(reg(r)?.label).toMatch(/ — через 4 дн\.$/);
  });

  it('через 2 мес. — «через 2 мес.»', () => {
    const r = getLeadSignals(lead({ regulatory_deadline: '2026-11-27' }), NOW);
    expect(reg(r)?.label).toBe('Маркировка обязательна с 27 ноября 2026 г. — через 2 мес.');
  });

  it('через 5 мес. — сигнала нет', () => {
    expect(reg(getLeadSignals(lead({ regulatory_deadline: '2027-02-27' }), NOW))).toBeUndefined();
  });

  it('вчера — сигнала нет', () => {
    expect(reg(getLeadSignals(lead({ regulatory_deadline: dateKey(-1) }), NOW))).toBeUndefined();
  });

  it('regulatoryMonths — прошедшая и далёкая дата дают null', () => {
    expect(regulatoryMonths(dateKey(-1), NOW)).toBeNull();
    expect(regulatoryMonths('2028-01-01', NOW)).toBeNull();
    expect(regulatoryMonths('2026-11-27', NOW)).toBe(2);
  });
});

describe('getLeadSignals — первое касание', () => {
  it('new, 20 ч, без касания — ok «осталось 4 ч»', () => {
    const r = getLeadSignals(lead({ status: 'new', created_at: hoursAgo(20) }), NOW);
    expect(touch(r)).toMatchObject({
      state: 'ok',
      label: 'Первое касание: осталось 4 ч',
      detail: 'SLA — сутки с заявки',
    });
  });

  it('contacted, касание через 14 ч — ok «через 14 ч»', () => {
    const r = getLeadSignals(
      lead({ created_at: daysAgo(3), first_contacted_at: hoursAgo(72 - 14) }),
      NOW,
    );
    expect(touch(r)).toMatchObject({ state: 'ok', label: 'Первое касание — через 14 ч' });
  });

  it('касание через 40 ч — сигнала нет', () => {
    const r = getLeadSignals(
      lead({ created_at: daysAgo(3), first_contacted_at: hoursAgo(72 - 40) }),
      NOW,
    );
    expect(touch(r)).toBeUndefined();
  });
});

describe('getLeadSignals — сводка', () => {
  it('сортировка bad → warn → ok, top — первый не-ok', () => {
    const r = getLeadSignals(
      lead({
        created_at: daysAgo(3),
        first_contacted_at: hoursAgo(72 - 14),
        next_action_date: dateKey(-2),
        regulatory_deadline: dateKey(30),
      }),
      NOW,
    );
    expect(r.signals.map((s) => [s.key, s.state])).toEqual([
      ['step', 'bad'],
      ['regulatory', 'warn'],
      ['first_touch', 'ok'],
    ]);
    expect(r.top?.key).toBe('step');
    expect(r.verdict).toBe('rotting');
  });

  it.each(['converted', 'disqualified'])('%s — пустой список, вердикт ok', (status) => {
    const r = getLeadSignals(lead({ status, next_action_date: dateKey(-5) }), NOW);
    expect(r).toEqual({ verdict: 'ok', signals: [], top: null });
  });
});
