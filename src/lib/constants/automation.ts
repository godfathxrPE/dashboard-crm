import type {
  AutomationAssignee,
  TaskLane,
  TaskPriority,
} from '@/types/database';

/**
 * Опции для формы правил автоматизации (Sprint 29).
 *
 * ⚠️ lane / priority / assignee ДОЛЖНЫ совпадать с whitelist в CASE
 * `run_stage_automations()` (supabase/migrations/029_automation.sql). Значение
 * вне списка на стороне SQL заменяется на дефолт ('now' / 'normal' / deal_owner).
 */
export const AUTOMATION_ASSIGNEE_OPTIONS: { value: AutomationAssignee; label: string }[] = [
  { value: 'deal_owner', label: 'Владелец сделки' },
  { value: 'deal_creator', label: 'Создатель сделки' },
];

export const AUTOMATION_LANE_OPTIONS: { value: TaskLane; label: string }[] = [
  { value: 'now', label: 'Сейчас' },
  { value: 'next', label: 'Далее' },
  { value: 'wait', label: 'Ожидание' },
  { value: 'done', label: 'Готово' },
];

export const AUTOMATION_PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'normal', label: 'Обычный' },
  { value: 'important', label: 'Важный' },
  { value: 'critical', label: 'Критичный' },
];

export const AUTOMATION_ASSIGNEE_LABEL: Record<AutomationAssignee, string> = Object.fromEntries(
  AUTOMATION_ASSIGNEE_OPTIONS.map((o) => [o.value, o.label]),
) as Record<AutomationAssignee, string>;

export const AUTOMATION_PRIORITY_LABEL: Record<TaskPriority, string> = Object.fromEntries(
  AUTOMATION_PRIORITY_OPTIONS.map((o) => [o.value, o.label]),
) as Record<TaskPriority, string>;
