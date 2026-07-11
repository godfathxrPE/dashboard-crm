import { describe, test, expect } from 'vitest';
import {
  DELIVERY_PHASE_ORDER,
  DELIVERY_PHASE_LABELS,
  DELIVERY_PHASE_COLOR,
  DELIVERY_KIND_LABELS,
} from '@/lib/constants/delivery-phases';

describe('delivery-phases — единый источник состояний внедрения', () => {
  test('4 состояния в правильном порядке (§9 ФИНАЛ)', () => {
    expect(DELIVERY_PHASE_ORDER).toEqual(['initiated', 'planning', 'execution', 'completed']);
  });

  test('каждое состояние имеет русский лейбл', () => {
    expect(DELIVERY_PHASE_LABELS.initiated).toBe('Инициирован');
    expect(DELIVERY_PHASE_LABELS.planning).toBe('Планируется');
    expect(DELIVERY_PHASE_LABELS.execution).toBe('Исполняется');
    expect(DELIVERY_PHASE_LABELS.completed).toBe('Завершён');
  });

  test('каждое состояние имеет CSS-цвет (var(--…))', () => {
    for (const phase of DELIVERY_PHASE_ORDER) {
      const color = DELIVERY_PHASE_COLOR[phase];
      expect(color).toBeTruthy();
      expect(color).toMatch(/^var\(--/);
    }
  });

  test('слаги delivery НЕ пересекаются с deal phase_group', () => {
    const dealPhases = ['attraction', 'working', 'approval', 'closing'];
    for (const phase of DELIVERY_PHASE_ORDER) {
      expect(dealPhases).not.toContain(phase);
    }
  });

  test('шаблоны внедрения: launch и experiment', () => {
    expect(DELIVERY_KIND_LABELS.launch).toBe('Полный запуск');
    expect(DELIVERY_KIND_LABELS.experiment).toBe('Эксперимент');
  });
});