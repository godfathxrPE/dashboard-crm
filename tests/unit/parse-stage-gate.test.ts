import { describe, test, expect } from 'vitest';
import { parseStageGateError } from '@/lib/hooks/use-projects';

describe('parseStageGateError — разбор ошибки стадийного гейта (Sprint 27)', () => {
  test('stage_gate_failed с details → массив требований', () => {
    const requirements = [{ key: 'budget', label: 'Бюджет' }];
    const err = { message: 'stage_gate_failed', details: JSON.stringify(requirements) };
    expect(parseStageGateError(err)).toEqual(requirements);
  });

  test('другая ошибка → null', () => {
    expect(parseStageGateError({ message: 'permission denied' })).toBeNull();
    expect(parseStageGateError(null)).toBeNull();
    expect(parseStageGateError('string error')).toBeNull();
  });

  test('битый JSON в details → пустой массив', () => {
    const err = { message: 'stage_gate_failed', details: 'not-json' };
    expect(parseStageGateError(err)).toEqual([]);
  });

  test('details не массив → пустой массив', () => {
    const err = { message: 'stage_gate_failed', details: '{"foo":"bar"}' };
    expect(parseStageGateError(err)).toEqual([]);
  });
});