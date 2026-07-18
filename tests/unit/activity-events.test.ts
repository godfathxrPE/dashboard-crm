import { describe, test, expect } from 'vitest';
import { describeEvent } from '@/lib/utils/activity-events';
import type { ActivityLog } from '@/types/entities';

function entry(event_type: string, payload: unknown): ActivityLog {
  return { event_type, payload } as ActivityLog;
}

describe('describeEvent — project_updated', () => {
  test('fields_changed → русские лейблы, без сырых имён колонок', () => {
    const text = describeEvent(
      entry('project_updated', { fields_changed: ['stage_id', 'won_reason', 'budget'] }),
    );
    expect(text).toContain('стадия');
    expect(text).toContain('причина выигрыша');
    expect(text).toContain('бюджет');
    // ни одного сырого имени колонки
    expect(text).not.toContain('stage_id');
    expect(text).not.toContain('won_reason');
    expect(text).not.toContain('budget');
  });

  test('легаси `stage` при наличии `stage_id` — не дублируется', () => {
    const text = describeEvent(
      entry('project_updated', { fields_changed: ['stage', 'stage_id'] }),
    );
    // одна «стадия», не две
    expect(text).toBe('Обновлено: стадия');
  });

  test('пустой fields_changed → «Сделка обновлена»', () => {
    expect(describeEvent(entry('project_updated', { fields_changed: [] }))).toBe('Сделка обновлена');
    expect(describeEvent(entry('project_updated', {}))).toBe('Сделка обновлена');
  });
});

describe('describeEvent — automation_fired', () => {
  test('текст с человеческим триггером, без сырых полей', () => {
    const text = describeEvent(
      entry('automation_fired', { rule_id: 'r1', trigger: 'task_overdue', task_id: 't1' }),
    );
    expect(text).toContain('автоматизация');
    expect(text).toContain('просроченная задача');
    expect(text).not.toContain('rule_id');
    expect(text).not.toContain('task_overdue');
  });

  test('без trigger — общий текст', () => {
    expect(describeEvent(entry('automation_fired', { rule_id: 'r1' }))).toBe('Сработала автоматизация');
  });
});

describe('describeEvent — прочие', () => {
  test('ai_summary_generated → «AI-резюме готово» + тип', () => {
    const text = describeEvent(entry('ai_summary_generated', { entity_type: 'calls', entity_id: 'c1' }));
    expect(text).toContain('AI-резюме готово');
    expect(text).toContain('звонок');
  });

  test('entity_deleted → человеческий тип и имя', () => {
    const text = describeEvent(entry('entity_deleted', { entity_type: 'projects', entity_name: 'Сделка X' }));
    expect(text).toBe('Удалён сделка: Сделка X');
  });

  test('неизвестный тип → фолбэк «Событие: <type>», не голая строка', () => {
    expect(describeEvent(entry('some_new_event', {}))).toBe('Событие: some_new_event');
  });
});
