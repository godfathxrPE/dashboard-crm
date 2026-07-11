import { describe, test, expect } from 'vitest';
import {
  DELIVERY_TASK_STATUS_LABELS,
  DELIVERY_TASK_STATUS_ORDER,
  DELIVERY_TASK_OVERDUE_LABEL,
  cycleDeliveryTaskStatus,
  isDeliveryTaskOverdue,
  isPhaseBoard,
} from '@/lib/constants/delivery-phases';

describe('delivery-phase-board — статусы задач фазовой доски (P2a)', () => {
  test('лейблы статусов покрывают все 4 lane', () => {
    expect(DELIVERY_TASK_STATUS_LABELS.next).toBe('Не начата');
    expect(DELIVERY_TASK_STATUS_LABELS.now).toBe('В работе');
    expect(DELIVERY_TASK_STATUS_LABELS.wait).toBe('Ожидание');
    expect(DELIVERY_TASK_STATUS_LABELS.done).toBe('Готово');
  });

  test('порядок цикла: next → now → done', () => {
    expect(DELIVERY_TASK_STATUS_ORDER).toEqual(['next', 'now', 'done']);
  });

  test('лейбл просрочки определён в константах (не хардкодится в UI)', () => {
    expect(DELIVERY_TASK_OVERDUE_LABEL).toBe('Просрочена');
  });

  test('цикл смены статуса: next → now → done → next', () => {
    expect(cycleDeliveryTaskStatus('next')).toBe('now');
    expect(cycleDeliveryTaskStatus('now')).toBe('done');
    expect(cycleDeliveryTaskStatus('done')).toBe('next');
  });

  test('из wait (вне цикла) — в начало цикла', () => {
    expect(cycleDeliveryTaskStatus('wait')).toBe('next');
  });
});

describe('isDeliveryTaskOverdue — предикат «Просрочена»', () => {
  const now = new Date('2026-07-11T12:00:00Z');

  test('дедлайн в прошлом + lane≠done → true', () => {
    expect(isDeliveryTaskOverdue('2026-07-10T12:00:00Z', 'next', now)).toBe(true);
    expect(isDeliveryTaskOverdue('2026-07-10T12:00:00Z', 'now', now)).toBe(true);
    expect(isDeliveryTaskOverdue('2026-07-10T12:00:00Z', 'wait', now)).toBe(true);
  });

  test('lane=done → false даже с прошедшим дедлайном', () => {
    expect(isDeliveryTaskOverdue('2026-07-10T12:00:00Z', 'done', now)).toBe(false);
  });

  test('без дедлайна → false', () => {
    expect(isDeliveryTaskOverdue(null, 'now', now)).toBe(false);
    expect(isDeliveryTaskOverdue(undefined, 'now', now)).toBe(false);
  });

  test('дедлайн в будущем → false', () => {
    expect(isDeliveryTaskOverdue('2026-07-12T12:00:00Z', 'now', now)).toBe(false);
  });
});

describe('isPhaseBoard — деривация фазового режима от данных', () => {
  test('все колонки phase → true', () => {
    expect(isPhaseBoard([{ category: 'phase' }, { category: 'phase' }])).toBe(true);
  });

  test('смесь phase и обычных → false', () => {
    expect(isPhaseBoard([{ category: 'phase' }, { category: 'done' }])).toBe(false);
  });

  test('4 дефолтные категории (internal) → false', () => {
    expect(
      isPhaseBoard([
        { category: 'backlog' },
        { category: 'started' },
        { category: 'paused' },
        { category: 'done' },
      ]),
    ).toBe(false);
  });

  test('пустой список колонок → false (empty state, не фазовый режим)', () => {
    expect(isPhaseBoard([])).toBe(false);
  });
});
