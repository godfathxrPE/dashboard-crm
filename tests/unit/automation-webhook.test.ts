import { describe, it, expect } from 'vitest';
import { fromRule, toInput, emptyDefaults } from '../../src/lib/domain/automation-rule-form';
import { ruleSchema } from '../../src/lib/validators/automation-rule';
import { WEBHOOK_EVENT_BY_TRIGGER, WEBHOOK_SUPPORTED_TRIGGERS } from '../../src/types/database';
import type { AutomationRule, AutomationWebhookConfig } from '../../src/types/database';

// ═══════════════════════════════════════════════════════
// S-R2-WEBHOOK-ACTION — юниты 1–6 из текста спринта.
//
// Главный из них — №2: `toInput` собирает set_field в ФИНАЛЬНОМ `else`, и новое
// действие без своей ветки уехало бы в {field, value}, создав молча неработающее
// правило. Тест держит именно эту ловушку.
// ═══════════════════════════════════════════════════════

const EP_A = '11111111-1111-4111-8111-111111111111';
const EP_B = '22222222-2222-4222-8222-222222222222';

function baseRule(over: Partial<AutomationRule>): AutomationRule {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    org_id: '44444444-4444-4444-8444-444444444444',
    name: 'Победа → n8n',
    trigger_type: 'stage_entered',
    trigger_config: { pipeline_id: 'p1', stage_id: 's1' },
    action_type: 'webhook',
    action_config: { endpoint_ids: [EP_A] },
    conditions: [],
    is_active: true,
    created_at: '2026-07-30T00:00:00Z',
    ...over,
  } as AutomationRule;
}

// ── 1. карта событий SQL ↔ TS ──
describe('WEBHOOK_EVENT_BY_TRIGGER', () => {
  it('даёт доменные имена для четырёх поддержанных триггеров', () => {
    // ⚠️ Значения обязаны совпадать со строками webhook_event_name() в миграции 090.
    expect(WEBHOOK_EVENT_BY_TRIGGER.stage_entered).toBe('deal.stage_changed');
    expect(WEBHOOK_EVENT_BY_TRIGGER.status_changed).toBe('deal.status_changed');
    expect(WEBHOOK_EVENT_BY_TRIGGER.field_changed).toBe('deal.field_changed');
    expect(WEBHOOK_EVENT_BY_TRIGGER.days_in_stage).toBe('deal.stuck_in_stage');
  });

  it('task_overdue есть в карте, но не в списке поддержанных', () => {
    expect(WEBHOOK_EVENT_BY_TRIGGER.task_overdue).toBe('task.overdue');
    expect(WEBHOOK_SUPPORTED_TRIGGERS).not.toContain('task_overdue');
    expect(WEBHOOK_SUPPORTED_TRIGGERS).toHaveLength(4);
  });
});

// ── 2/3. toInput: webhook НЕ уезжает в set_field ──
describe('toInput', () => {
  it('webhook даёт {endpoint_ids}, а не set_field-конфиг', () => {
    const out = toInput({
      ...emptyDefaults('p1'),
      name: '  Победа → n8n  ',
      action_type: 'webhook',
      a_endpoint_ids: [EP_A, EP_B],
    });
    expect(out.action_type).toBe('webhook');
    expect(out.action_config).toEqual({ endpoint_ids: [EP_A, EP_B] });
    // регресс на ловушку `else`: ключей set_field быть не должно
    expect(out.action_config).not.toHaveProperty('field');
    expect(out.action_config).not.toHaveProperty('value');
    expect(out.name).toBe('Победа → n8n');
  });

  it('webhook без выбранных получателей даёт пустой массив, а не undefined', () => {
    const out = toInput({ ...emptyDefaults('p1'), action_type: 'webhook' });
    expect(out.action_config).toEqual({ endpoint_ids: [] });
  });

  it('set_field по-прежнему даёт {field, value} — ветка не сломана', () => {
    const out = toInput({
      ...emptyDefaults('p1'),
      action_type: 'set_field',
      a_set_field: 'next_step',
      a_set_value: 'Позвонить',
    });
    expect(out.action_config).toEqual({ field: 'next_step', value: 'Позвонить' });
  });
});

// ── 4/5. Zod ──
describe('ruleSchema', () => {
  const valid = {
    ...emptyDefaults('p1'),
    name: 'Правило',
    t_stage_id: 's1',
  };

  it('webhook без получателей → ошибка на a_endpoint_ids', () => {
    const res = ruleSchema.safeParse({ ...valid, action_type: 'webhook', a_endpoint_ids: [] });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path[0] === 'a_endpoint_ids')).toBe(true);
    }
  });

  it('webhook с одним uuid валиден', () => {
    const res = ruleSchema.safeParse({ ...valid, action_type: 'webhook', a_endpoint_ids: [EP_A] });
    expect(res.success).toBe(true);
  });

  it('task_overdue + webhook → ошибка на action_type (правило 051 не сломано)', () => {
    const res = ruleSchema.safeParse({
      ...valid,
      trigger_type: 'task_overdue',
      action_type: 'webhook',
      a_endpoint_ids: [EP_A],
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path[0] === 'action_type')).toBe(true);
    }
  });
});

// ── 6. fromRule ──
describe('fromRule', () => {
  it('webhook-правило возвращает a_endpoint_ids из конфига', () => {
    const values = fromRule(baseRule({ action_config: { endpoint_ids: [EP_A, EP_B] } }));
    expect(values.a_endpoint_ids).toEqual([EP_A, EP_B]);
    expect(values.action_type).toBe('webhook');
  });

  it('не-webhook правило даёт пустой массив получателей', () => {
    const values = fromRule(
      baseRule({ action_type: 'set_field', action_config: { field: 'next_step', value: 'x' } }),
    );
    expect(values.a_endpoint_ids).toEqual([]);
  });

  it('round-trip webhook: fromRule → toInput сохраняет получателей', () => {
    const rule = baseRule({ action_config: { endpoint_ids: [EP_B] } });
    const out = toInput(fromRule(rule));
    expect((out.action_config as AutomationWebhookConfig).endpoint_ids).toEqual([EP_B]);
  });
});
