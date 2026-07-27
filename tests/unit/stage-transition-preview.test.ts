/**
 * previewTransition — что модалка перехода показывает до подтверждения
 * (S-R2-TRANSITION-1b).
 *
 * Ключевое, что здесь закрепляется: незакрытое требование делится НА ДВА ведра.
 * Колонка из whitelist гейта → During-поле формы (пользователь закроет прямо в
 * модалке). Всё остальное — `file`-требования и колонка, которой гейт не знает, —
 * в чек-лист без поля: показать пустой инпут, который физически не закрывает
 * требование, хуже, чем честно сказать «это закрывается на карточке».
 */

import { describe, it, expect } from 'vitest';
import { previewTransition, describeAutomationAction } from '@/lib/domain/stage-transition';
import type { AutomationRule, UnmetRequirement } from '@/types/database';

const fieldReq = (column: string, hint = `Заполни ${column}`): UnmetRequirement =>
  ({ type: 'field', config: { column }, hint }) as unknown as UnmetRequirement;

const fileReq = (hint = 'Приложи КП'): UnmetRequirement =>
  ({ type: 'file', config: { min_count: 1 }, hint }) as unknown as UnmetRequirement;

const rule = (over: Partial<AutomationRule> = {}): AutomationRule =>
  ({
    id: 'r1',
    org_id: 'o1',
    name: 'Задача менеджеру',
    trigger_type: 'stage_entered',
    trigger_config: { pipeline_id: 'p1', stage_id: 'stage-B' },
    action_type: 'create_task',
    action_config: {
      task_text: 'Позвонить',
      assignee: 'deal_owner',
      lane: 'today',
      priority: 'normal',
      due_in_days: 1,
    },
    conditions: [],
    is_active: true,
    created_at: '2026-07-27T00:00:00Z',
    ...over,
  }) as AutomationRule;

const base = {
  targetStage: { is_won: false, is_lost: false },
  rules: [] as AutomationRule[],
  snapshot: {} as Record<string, unknown>,
  toStageId: 'stage-B',
};

describe('previewTransition — раскладка незакрытых требований', () => {
  it('колонка из whitelist гейта → During-поле формы', () => {
    const p = previewTransition({ ...base, unmet: [fieldReq('budget')] });
    expect(p.requiredDuringFields).toEqual(['budget']);
    expect(p.blockingChecklist).toEqual([]);
  });

  it('file-требование формой не закрывается → в чек-лист', () => {
    const p = previewTransition({ ...base, unmet: [fileReq()] });
    expect(p.requiredDuringFields).toEqual([]);
    expect(p.blockingChecklist).toHaveLength(1);
  });

  it('колонка вне whitelist гейта → чек-лист, а не пустое поле', () => {
    const p = previewTransition({ ...base, unmet: [fieldReq('unknown_column')] });
    expect(p.requiredDuringFields).toEqual([]);
    expect(p.blockingChecklist).toHaveLength(1);
  });

  it('смешанный набор разводится по двум вёдрам', () => {
    const p = previewTransition({
      ...base,
      unmet: [fieldReq('budget'), fileReq(), fieldReq('contact_id'), fieldReq('nope')],
    });
    expect(p.requiredDuringFields).toEqual(['budget', 'contact_id']);
    expect(p.blockingChecklist).toHaveLength(2);
  });

  it('дубли колонок схлопываются (два требования на одну колонку — одно поле)', () => {
    const p = previewTransition({
      ...base,
      unmet: [fieldReq('budget', 'Нужен бюджет'), fieldReq('budget', 'Бюджет обязателен')],
    });
    expect(p.requiredDuringFields).toEqual(['budget']);
  });

  it('probability — закрывается формой (поправка 1b: иначе стадия недостижима)', () => {
    const p = previewTransition({ ...base, unmet: [fieldReq('probability')] });
    expect(p.requiredDuringFields).toEqual(['probability']);
  });

  it('пустой unmet — переход готов', () => {
    const p = previewTransition({ ...base, unmet: [] });
    expect(p.requiredDuringFields).toEqual([]);
    expect(p.blockingChecklist).toEqual([]);
  });
});

describe('previewTransition — флаги исхода', () => {
  it('is_won прокидывается', () => {
    const p = previewTransition({ ...base, unmet: [], targetStage: { is_won: true, is_lost: false } });
    expect(p.targetIsWon).toBe(true);
    expect(p.targetIsLost).toBe(false);
  });

  it('null-стадия (справочник ещё не загружен) — оба флага false', () => {
    const p = previewTransition({ ...base, unmet: [], targetStage: null });
    expect(p.targetIsWon).toBe(false);
    expect(p.targetIsLost).toBe(false);
  });
});

describe('previewTransition — превью автоматизаций', () => {
  it('матчит активное правило на целевую стадию', () => {
    const p = previewTransition({ ...base, unmet: [], rules: [rule()] });
    expect(p.automationPreview).toHaveLength(1);
    expect(p.automationPreview[0].name).toBe('Задача менеджеру');
  });

  it('чужая стадия не матчится', () => {
    const p = previewTransition({
      ...base,
      unmet: [],
      rules: [rule({ trigger_config: { pipeline_id: 'p1', stage_id: 'stage-Z' } })],
    });
    expect(p.automationPreview).toEqual([]);
  });

  it('выключенное правило не матчится', () => {
    const p = previewTransition({ ...base, unmet: [], rules: [rule({ is_active: false })] });
    expect(p.automationPreview).toEqual([]);
  });

  it('другой триггер не матчится', () => {
    const p = previewTransition({
      ...base,
      unmet: [],
      rules: [rule({ trigger_type: 'task_overdue' })],
    });
    expect(p.automationPreview).toEqual([]);
  });

  it('условия считаются по снапшоту С УЧЁТОМ вводимых полей', () => {
    const conds = [{ field: 'budget', op: 'gt' as const, value: '100' }];
    const notYet = previewTransition({
      ...base,
      unmet: [],
      rules: [rule({ conditions: conds })],
      snapshot: { budget: 50 },
    });
    expect(notYet.automationPreview).toEqual([]);

    const afterInput = previewTransition({
      ...base,
      unmet: [],
      rules: [rule({ conditions: conds })],
      snapshot: { budget: 500 },
    });
    expect(afterInput.automationPreview).toHaveLength(1);
  });
});

describe('describeAutomationAction', () => {
  it('create_task', () => {
    expect(describeAutomationAction(rule())).toBe('Создать задачу: «Позвонить»');
  });

  it('notify', () => {
    const r = rule({ action_type: 'notify', action_config: { recipient: 'deal_owner', text: 'Сделка ушла дальше' } });
    expect(describeAutomationAction(r)).toBe('Уведомление: «Сделка ушла дальше»');
  });

  it('set_field использует человеческий лейбл колонки', () => {
    const r = rule({ action_type: 'set_field', action_config: { field: 'next_step', value: 'Позвонить' } });
    expect(describeAutomationAction(r)).toBe('Заполнить «Следующий шаг» → Позвонить');
  });
});
