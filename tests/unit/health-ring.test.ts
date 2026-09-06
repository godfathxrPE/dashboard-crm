import { describe, test, expect } from 'vitest';
import { buildHealthRing, polarPoint, RING_GAP_DEG, RING_RADIUS } from '@/lib/domain/health-ring';
import type { DealSignal, SignalKey, SignalState } from '@/lib/domain/deal-signals';

function sig(key: SignalKey, state: SignalState, label = `сигнал ${key}`): DealSignal {
  return { key, label, state, detail: '', cta: null };
}

const KEYS: SignalKey[] = ['next_step', 'stage_dwell', 'deadline', 'silence', 'single_threaded'];

function five(states: SignalState[]): DealSignal[] {
  return states.map((s, i) => sig(KEYS[i], s));
}

describe('buildHealthRing — геометрия', () => {
  test('пустой массив — кольца нет', () => {
    expect(buildHealthRing([])).toEqual({ segments: [], problems: 0, total: 0 });
  });

  test('5 сигналов → 5 сегментов по 72° со срезанным зазором', () => {
    const ring = buildHealthRing(five(['bad', 'warn', 'ok', 'ok', 'ok']));
    expect(ring.segments).toHaveLength(5);
    ring.segments.forEach((seg, i) => {
      expect(seg.startDeg).toBeCloseTo(i * 72 + RING_GAP_DEG / 2, 10);
      expect(seg.endDeg).toBeCloseTo((i + 1) * 72 - RING_GAP_DEG / 2, 10);
    });
  });

  test('зазор между соседними сегментами равен RING_GAP_DEG', () => {
    const ring = buildHealthRing(five(['bad', 'warn', 'ok', 'ok', 'ok']));
    for (let i = 1; i < ring.segments.length; i++) {
      expect(ring.segments[i].startDeg - ring.segments[i - 1].endDeg).toBeCloseTo(RING_GAP_DEG, 10);
    }
  });

  test('сумма длин дуг = 360 − N·зазор', () => {
    const ring = buildHealthRing(five(['bad', 'warn', 'ok', 'ok', 'ok']));
    const sum = ring.segments.reduce((acc, s) => acc + (s.endDeg - s.startDeg), 0);
    expect(sum).toBeCloseTo(360 - 5 * RING_GAP_DEG, 10);
  });

  test('один сигнал → почти полный круг за вычетом зазора, large-arc = 1', () => {
    const ring = buildHealthRing([sig('next_step', 'bad')]);
    expect(ring.segments).toHaveLength(1);
    expect(ring.segments[0].startDeg).toBeCloseTo(RING_GAP_DEG / 2, 10);
    expect(ring.segments[0].endDeg).toBeCloseTo(360 - RING_GAP_DEG / 2, 10);
    // `A r r 0 <largeArc> 1` — пятый токен после A.
    expect(ring.segments[0].d).toMatch(new RegExp(`A ${RING_RADIUS} ${RING_RADIUS} 0 1 1 `));
  });

  test('три сигнала → дуга 120° минус зазор, large-arc = 0', () => {
    const ring = buildHealthRing([sig('next_step', 'bad'), sig('deadline', 'warn'), sig('silence', 'ok')]);
    ring.segments.forEach((seg) => {
      expect(seg.endDeg - seg.startDeg).toBeCloseTo(120 - RING_GAP_DEG, 10);
      expect(seg.d).toMatch(new RegExp(`A ${RING_RADIUS} ${RING_RADIUS} 0 0 1 `));
    });
  });

  test('порядок сегментов повторяет порядок входного массива — кольцо легенда к списку', () => {
    const signals = five(['bad', 'warn', 'ok', 'ok', 'ok']);
    const ring = buildHealthRing(signals);
    expect(ring.segments.map((s) => s.key)).toEqual(signals.map((s) => s.key));
  });
});

describe('buildHealthRing — цвет и счёт', () => {
  test('состояние → семантический токен, не hex', () => {
    const ring = buildHealthRing([
      sig('next_step', 'bad'),
      sig('deadline', 'warn'),
      sig('silence', 'ok'),
    ]);
    expect(ring.segments[0].stroke).toBe('var(--danger)');
    expect(ring.segments[1].stroke).toBe('var(--warning)');
    expect(ring.segments[2].stroke).toBe('var(--success)');
  });

  test('problems считает только state !== ok', () => {
    const ring = buildHealthRing(five(['bad', 'warn', 'ok', 'ok', 'ok']));
    expect(ring.problems).toBe(2);
    expect(ring.total).toBe(5);
    expect(buildHealthRing(five(['ok', 'ok', 'ok', 'ok', 'ok'])).problems).toBe(0);
  });

  test('label сигнала едет в сегмент — это подпись тултипа', () => {
    const ring = buildHealthRing([sig('next_step', 'bad', 'Шаг просрочен на 3 дн.')]);
    expect(ring.segments[0].label).toBe('Шаг просрочен на 3 дн.');
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
