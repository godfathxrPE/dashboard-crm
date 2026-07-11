import { describe, test, expect } from 'vitest';
import { projectFormSchema } from '@/lib/validators/project';

const UUID = 'a0000000-0000-4000-8000-000000000099';
const PIPELINE = 'a0000000-0000-4000-8000-000000000004';
const STAGE = 'a0000000-0000-4000-8000-000000000005';
const DEAL = 'a0000000-0000-4000-8000-000000000006';

describe('projectFormSchema — delivery-инварианты (миграция 035)', () => {
  const validDelivery = {
    type: 'delivery' as const,
    name: 'ERP — внедрение',
    direction: 'erp' as const,
    pipeline_id: PIPELINE,
    stage_id: STAGE,
    parent_deal_id: DEAL,
    delivery_kind: 'launch' as const,
  };

  test('валидный delivery проходит superRefine', () => {
    const result = projectFormSchema.safeParse(validDelivery);
    expect(result.success).toBe(true);
  });

  test('delivery без parent_deal_id — ошибка', () => {
    const result = projectFormSchema.safeParse({
      ...validDelivery,
      parent_deal_id: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('parent_deal_id');
    }
  });

  test('delivery без delivery_kind — ошибка', () => {
    const result = projectFormSchema.safeParse({
      ...validDelivery,
      delivery_kind: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('delivery_kind');
    }
  });

  test('delivery без direction/pipeline/stage — ошибки стадийных полей', () => {
    const result = projectFormSchema.safeParse({
      ...validDelivery,
      direction: null,
      pipeline_id: null,
      stage_id: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('direction');
      expect(paths).toContain('pipeline_id');
      expect(paths).toContain('stage_id');
    }
  });

  test('client не требует parent_deal_id и delivery_kind', () => {
    const result = projectFormSchema.safeParse({
      type: 'client',
      name: 'Новая сделка',
      direction: 'iiot',
      pipeline_id: PIPELINE,
      stage_id: STAGE,
    });
    expect(result.success).toBe(true);
  });

  test('internal не требует стадийные поля', () => {
    const result = projectFormSchema.safeParse({
      type: 'internal',
      name: 'Внутренний проект',
      direction: null,
      pipeline_id: null,
      stage_id: null,
    });
    expect(result.success).toBe(true);
  });

  test('do_url: пустая строка → null', () => {
    const result = projectFormSchema.safeParse({
      ...validDelivery,
      do_url: '',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.do_url).toBeNull();
    }
  });

  test('do_url: некорректный URL — ошибка', () => {
    const result = projectFormSchema.safeParse({
      ...validDelivery,
      do_url: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  test('do_url: валидный URL проходит', () => {
    const result = projectFormSchema.safeParse({
      ...validDelivery,
      do_url: 'https://do.example.com/project/123',
    });
    expect(result.success).toBe(true);
  });
});