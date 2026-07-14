import { describe, test, expect } from 'vitest';
import { getDeliveryHealth, isDeliveryTerminal } from '@/lib/utils/delivery-health';

// S-DLV-HEALTH-1 — регрессионные кейсы чистой health-функции внедрений.
// Фиксированный `now` + относительные даты, чтобы тесты не зависели от прогона.
const NOW = new Date('2026-07-14T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

const base = {
  progress_done: 5,
  progress_total: 10,
  stage_entered_at: daysAgo(2),
  deadline: '2026-12-01',
  updated_at: daysAgo(1),
  isTerminal: false,
};

describe('getDeliveryHealth', () => {
  test('свежий проект → healthy, score 100, без причин', () => {
    const h = getDeliveryHealth(base, NOW);
    expect(h.status).toBe('healthy');
    expect(h.score).toBe(100);
    expect(h.reasons).toEqual([]);
  });

  test('терминальный → всегда healthy, причины пусты (не краснит портфель)', () => {
    const h = getDeliveryHealth(
      { ...base, deadline: '2020-01-01', stage_entered_at: daysAgo(999), updated_at: daysAgo(999), isTerminal: true },
      NOW,
    );
    expect(h.status).toBe('healthy');
    expect(h.reasons).toEqual([]);
  });

  test('просрочка + прогресс < 100% → −40 → attention(60)', () => {
    const h = getDeliveryHealth({ ...base, deadline: '2026-07-01' }, NOW);
    expect(h.score).toBe(60);
    expect(h.status).toBe('attention');
    expect(h.reasons[0]).toMatch(/дедлайн/);
  });

  test('просрочка, но задачи выполнены на 100% → без штрафа', () => {
    const h = getDeliveryHealth({ ...base, deadline: '2026-07-01', progress_done: 10, progress_total: 10 }, NOW);
    expect(h.score).toBe(100);
  });

  test('просрочка + застой стадии → −65 → at_risk(35)', () => {
    const h = getDeliveryHealth({ ...base, deadline: '2026-07-01', stage_entered_at: daysAgo(40) }, NOW);
    expect(h.score).toBe(35);
    expect(h.status).toBe('at_risk');
  });

  test('тишина > 14 дней → −20, причина об активности', () => {
    const h = getDeliveryHealth({ ...base, updated_at: daysAgo(20) }, NOW);
    expect(h.score).toBe(80);
    expect(h.reasons.some((r) => /активности/.test(r))).toBe(true);
  });

  test('progress_total=0 → нет деления на ноль и нет «низкого прогресса»', () => {
    const h = getDeliveryHealth({ ...base, progress_done: 0, progress_total: 0, stage_entered_at: daysAgo(20) }, NOW);
    expect(h.reasons).not.toContain('Низкий прогресс');
    expect(h.score).toBe(100);
  });

  test('низкий прогресс (<30%) при dwell > 14 → −15', () => {
    const h = getDeliveryHealth({ ...base, progress_done: 2, progress_total: 10, stage_entered_at: daysAgo(20) }, NOW);
    expect(h.reasons).toContain('Низкий прогресс');
  });

  test('null-даты не роняют функцию', () => {
    const h = getDeliveryHealth(
      { progress_done: 0, progress_total: 0, stage_entered_at: null, deadline: null, updated_at: null, isTerminal: false },
      NOW,
    );
    expect(h.status).toBe('healthy');
  });

  test('score зажат в [0,100] при множестве штрафов', () => {
    const h = getDeliveryHealth(
      { progress_done: 0, progress_total: 10, deadline: '2026-01-01', stage_entered_at: daysAgo(60), updated_at: daysAgo(60), isTerminal: false },
      NOW,
    );
    expect(h.score).toBeGreaterThanOrEqual(0);
    expect(h.status).toBe('at_risk');
  });
});

describe('isDeliveryTerminal', () => {
  test('status=completed → terminal', () => {
    expect(isDeliveryTerminal(null, 'completed')).toBe(true);
  });

  test('стадия is_won → terminal', () => {
    expect(isDeliveryTerminal({ phase_group: 'execution', is_won: true, is_lost: false }, 'open')).toBe(true);
  });

  test('phase_group=completed → terminal', () => {
    expect(isDeliveryTerminal({ phase_group: 'completed', is_won: false, is_lost: false }, 'open')).toBe(true);
  });

  test('активная стадия → не terminal', () => {
    expect(isDeliveryTerminal({ phase_group: 'execution', is_won: false, is_lost: false }, 'open')).toBe(false);
  });
});
