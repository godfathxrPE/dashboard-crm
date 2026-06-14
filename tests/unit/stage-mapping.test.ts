import { describe, test, expect } from 'vitest';
import { mapToLegacyStage } from '@/lib/utils/stage-mapping';
import type { PipelineStage } from '@/types/database';
import type { DealStage } from '@/lib/validators/project';

// Минимальный конструктор PipelineStage — для маппинга важен только order_index.
function stage(order_index: number): PipelineStage {
  return {
    id: `stage-${order_index}`,
    pipeline_id: 'pipe-iiot',
    name: `stage-${order_index}`,
    order_index,
    probability: null,
    phase_group: null,
    is_won: order_index === 12,
    is_lost: order_index === 13,
  };
}

describe('mapToLegacyStage — фиксация текущего поведения зеркала `stage`', () => {
  // ⚠️ order_index здесь — порядок СТАРОГО enum, не текущих pipeline_stages (см. stage-mapping.ts).
  // Тест фиксирует существующий контракт, чтобы непреднамеренный сдвиг не прошёл молча.
  const expected: Record<number, DealStage> = {
    1: 'new_lead',
    2: 'qualification',
    3: 'waiting_materials',
    4: 'preparing_kp',
    5: 'preparing_docs',
    6: 'cz_approval',
    7: 'trilateral_meeting',
    8: 'experiment_setup',
    9: 'contract_review',
    10: 'contract_signing',
    11: 'contract_signing', // «Запуск проекта» — ближайшее старое значение
    12: 'won',
    13: 'lost',
  };

  for (const [oi, legacy] of Object.entries(expected)) {
    test(`iiot order_index ${oi} → ${legacy}`, () => {
      expect(mapToLegacyStage(stage(Number(oi)), 'iiot')).toBe(legacy);
    });
  }

  test('ERP всегда → null (нет legacy-эквивалента)', () => {
    expect(mapToLegacyStage(stage(3), 'erp')).toBeNull();
    expect(mapToLegacyStage(stage(10), 'erp')).toBeNull();
  });

  test('undefined стадия → null', () => {
    expect(mapToLegacyStage(undefined, 'iiot')).toBeNull();
  });

  test('order_index вне диапазона 1-13 → null', () => {
    expect(mapToLegacyStage(stage(0), 'iiot')).toBeNull();
    expect(mapToLegacyStage(stage(99), 'iiot')).toBeNull();
  });
});
