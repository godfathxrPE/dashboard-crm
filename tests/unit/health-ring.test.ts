import { describe, test, expect } from 'vitest';
import { buildHealthRing, polarPoint, RING_RADIUS, STATE_STROKE } from '@/lib/domain/health-ring';
import type { DealSignal, SignalKey, SignalState } from '@/lib/domain/deal-signals';

// Кольцо — одна дуга по дорожке: доля помех от всех применимых сигналов.
// Тесты держат поведение, а не разметку: доля, цвет худшего состояния и две
// вырожденные границы (помех нет / помеха в каждом сигнале), где дуга одним
// `A` не выражается и рисуется полным кругом.

const sig = (key: SignalKey, state: SignalState): DealSignal => ({
  key,
  state,
  label: `${key}:${state}`,
  detail: '',
  cta: null,
});

describe('buildHealthRing — доля и вырожденные случаи', () => {
  test('пустой массив — кольца нет', () => {
    const ring = buildHealthRing([]);
    expect(ring.total).toBe(0);
    expect(ring.d).toBeNull();
    expect(ring.full).toBe(false);
  });

  test('4 помехи из 5 → дуга 288°, не полный круг', () => {
    const ring = buildHealthRing([
      sig('next_step', 'bad'),
      sig('deadline', 'bad'),
      sig('stage_dwell', 'warn'),
      sig('single_threaded', 'warn'),
      sig('silence', 'ok'),
    ]);
    expect(ring.problems).toBe(4);
    expect(ring.total).toBe(5);
    expect(ring.arcDeg).toBeCloseTo(288, 10);
    expect(ring.full).toBe(false);
    expect(ring.d).toMatch(new RegExp(`A ${RING_RADIUS} ${RING_RADIUS} 0 1 1 `));
  });

  test('1 помеха из 4 → дуга 90°, large-arc = 0', () => {
    const ring = buildHealthRing([
      sig('next_step', 'bad'),
      sig('deadline', 'ok'),
      sig('silence', 'ok'),
      sig('single_threaded', 'ok'),
    ]);
    expect(ring.arcDeg).toBeCloseTo(90, 10);
    expect(ring.d).toMatch(new RegExp(`A ${RING_RADIUS} ${RING_RADIUS} 0 0 1 `));
  });

  test('помех нет → полный круг, дуги нет', () => {
    const ring = buildHealthRing([sig('next_step', 'ok'), sig('deadline', 'ok')]);
    expect(ring.problems).toBe(0);
    expect(ring.arcDeg).toBe(0);
    expect(ring.full).toBe(true);
    expect(ring.d).toBeNull();
    expect(ring.stroke).toBe('var(--success)');
  });

  test('помеха в каждом сигнале → полный круг цветом худшего', () => {
    const ring = buildHealthRing([sig('next_step', 'bad'), sig('deadline', 'warn')]);
    expect(ring.problems).toBe(2);
    expect(ring.arcDeg).toBeCloseTo(360, 10);
    expect(ring.full).toBe(true);
    expect(ring.d).toBeNull();
    expect(ring.stroke).toBe('var(--danger)');
  });

  test('дуга стартует с 12 часов', () => {
    const ring = buildHealthRing([sig('next_step', 'bad'), sig('deadline', 'ok')]);
    const c = 104 / 2;
    const [x, y] = polarPoint(c, c, RING_RADIUS, 0);
    expect(ring.d).toContain(`M ${x.toFixed(3)} ${y.toFixed(3)}`);
  });
});

describe('buildHealthRing — цвет худшего состояния', () => {
  test('одна помеха уровня bad красит кольцо целиком', () => {
    const ring = buildHealthRing([
      sig('next_step', 'warn'),
      sig('deadline', 'bad'),
      sig('silence', 'ok'),
    ]);
    expect(ring.stroke).toBe('var(--danger)');
  });

  test('только warn → предупреждение, не опасность', () => {
    const ring = buildHealthRing([sig('next_step', 'warn'), sig('silence', 'ok')]);
    expect(ring.stroke).toBe('var(--warning)');
  });

  test('цвет — семантический токен, не hex', () => {
    const ring = buildHealthRing([sig('next_step', 'bad'), sig('silence', 'ok')]);
    expect(ring.stroke).toMatch(/^var\(--/);
  });

  test('problems считает только state !== ok', () => {
    const ring = buildHealthRing([
      sig('next_step', 'ok'),
      sig('deadline', 'warn'),
      sig('silence', 'bad'),
    ]);
    expect(ring.problems).toBe(2);
    expect(ring.total).toBe(3);
  });
});

describe('polarPoint', () => {
  test('0° — верх окружности (12 часов)', () => {
    const [x, y] = polarPoint(40, 40, 35, 0);
    expect(x).toBeCloseTo(40, 10);
    expect(y).toBeCloseTo(5, 10);
  });

  test('90° — правая точка, отсчёт по часовой', () => {
    const [x, y] = polarPoint(40, 40, 35, 90);
    expect(x).toBeCloseTo(75, 10);
    expect(y).toBeCloseTo(40, 10);
  });
});

describe('buildHealthRing — полоса и счётчики', () => {
  test('states повторяет порядок сигналов — полоса легенда к списку', () => {
    const ring = buildHealthRing([
      sig('next_step', 'bad'),
      sig('deadline', 'warn'),
      sig('silence', 'ok'),
    ]);
    expect(ring.states).toEqual(['bad', 'warn', 'ok']);
  });

  test('counts разбивает сигналы по состояниям', () => {
    const ring = buildHealthRing([
      sig('next_step', 'bad'),
      sig('deadline', 'warn'),
      sig('stage_dwell', 'warn'),
      sig('silence', 'ok'),
      sig('single_threaded', 'ok'),
    ]);
    expect(ring.counts).toEqual({ bad: 1, warn: 2, ok: 2 });
    expect(ring.problems).toBe(3);
  });

  test('длина states равна total, сумма counts тоже', () => {
    const ring = buildHealthRing([sig('next_step', 'bad'), sig('silence', 'ok')]);
    expect(ring.states).toHaveLength(ring.total);
    expect(ring.counts.bad + ring.counts.warn + ring.counts.ok).toBe(ring.total);
  });

  test('цвет дольки берётся из того же STATE_STROKE, что и дуга', () => {
    const ring = buildHealthRing([sig('next_step', 'bad'), sig('silence', 'ok')]);
    expect(STATE_STROKE[ring.states[0]]).toBe(ring.stroke);
    expect(STATE_STROKE.ok).toBe('var(--success)');
  });
});
