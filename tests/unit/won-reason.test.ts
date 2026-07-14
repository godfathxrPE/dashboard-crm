import { describe, test, expect } from 'vitest';
import {
  wonReasons,
  WON_REASON_CONFIG,
  lossReasons,
  LOSS_REASON_CONFIG,
  projectFormSchema,
  type WonReason,
} from '@/lib/validators/project';

const PIPELINE = 'a0000000-0000-4000-8000-000000000004';
const STAGE = 'a0000000-0000-4000-8000-000000000005';

describe('WON_REASON_CONFIG — причина выигрыша (миграция 043)', () => {
  test('каждый wonReason имеет непустой label', () => {
    for (const r of wonReasons) {
      expect(WON_REASON_CONFIG[r]?.label).toBeTruthy();
    }
  });

  test('config покрывает ровно набор wonReasons (нет лишних/пропущенных)', () => {
    expect(Object.keys(WON_REASON_CONFIG).sort()).toEqual([...wonReasons].sort());
  });

  test('симметрия структуры с loss (тот же shape { label })', () => {
    // Оба конфига — Record<Reason, { label: string }>
    expect(Object.keys(LOSS_REASON_CONFIG).length).toBe(lossReasons.length);
    expect(Object.keys(WON_REASON_CONFIG).length).toBe(wonReasons.length);
  });
});

describe('projectFormSchema — won_reason/won_detail', () => {
  const baseDeal = {
    type: 'client' as const,
    name: 'Тестовая сделка',
    direction: 'erp' as const,
    pipeline_id: PIPELINE,
    stage_id: STAGE,
  };

  test('won_reason/won_detail по умолчанию null', () => {
    const result = projectFormSchema.safeParse(baseDeal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.won_reason).toBeNull();
      expect(result.data.won_detail).toBeNull();
    }
  });

  test('won_reason принимает валидный ключ причины', () => {
    const reason: WonReason = 'compliance';
    const result = projectFormSchema.safeParse({ ...baseDeal, won_reason: reason });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.won_reason).toBe('compliance');
  });
});
