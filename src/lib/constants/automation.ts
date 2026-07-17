import type {
  AutomationAssignee,
  AutomationTriggerType,
  AutomationActionType,
  AutomationConditionOp,
  AutomationSetFieldName,
  TaskLane,
  TaskPriority,
} from '@/types/database';

/**
 * Опции для формы правил автоматизации (S-WF-2 / миграция 050).
 *
 * ⚠️ lane / priority / assignee ДОЛЖНЫ совпадать с whitelist в CASE
 * `run_stage_automations()` (supabase/migrations/050_workflow_engine.sql). Значение
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

// ── S-WF-2 (050): триггеры / действия / условия ──

export const AUTOMATION_TRIGGER_OPTIONS: { value: AutomationTriggerType; label: string }[] = [
  { value: 'stage_entered', label: 'Вход в стадию' },
  { value: 'status_changed', label: 'Смена статуса' },
  { value: 'field_changed', label: 'Изменение поля' },
];

export const AUTOMATION_TRIGGER_LABEL: Record<AutomationTriggerType, string> = Object.fromEntries(
  AUTOMATION_TRIGGER_OPTIONS.map((o) => [o.value, o.label]),
) as Record<AutomationTriggerType, string>;

export const AUTOMATION_ACTION_OPTIONS: { value: AutomationActionType; label: string }[] = [
  { value: 'create_task', label: 'Создать задачу' },
  { value: 'notify', label: 'Уведомить' },
  { value: 'create_activity', label: 'Создать заметку' },
  { value: 'set_field', label: 'Изменить поле' },
];

export const AUTOMATION_ACTION_LABEL: Record<AutomationActionType, string> = Object.fromEntries(
  AUTOMATION_ACTION_OPTIONS.map((o) => [o.value, o.label]),
) as Record<AutomationActionType, string>;

/**
 * Статусы сделки для триггера status_changed (= DealStatus).
 * Первая опция «Любой статус» — значение ПУСТОЕ: на submit ⇒ trigger_config {}
 * (SQL `->>'to' IS NULL` матчит любой статус; `{to:''}` бы сломал матч).
 */
export const AUTOMATION_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Любой статус' },
  { value: 'open', label: 'Открыта' },
  { value: 'won', label: 'Выиграна' },
  { value: 'lost', label: 'Проиграна' },
  { value: 'on_hold', label: 'На паузе' },
  { value: 'completed', label: 'Завершена' },
];

export const AUTOMATION_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  AUTOMATION_STATUS_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label]),
);

/**
 * Курируемый список колонок projects для field_changed и condition.field.
 * SQL принимает любое поле через dynamic `->>`, но UI не даёт выбрать
 * мусор/инвариантные поля. НЕ включать: org_id / type / stage_id / status
 * (status — отдельный триггер status_changed).
 */
export const AUTOMATION_FIELD_OPTIONS: { value: string; label: string; numeric?: boolean }[] = [
  { value: 'budget', label: 'Бюджет', numeric: true },
  { value: 'probability', label: 'Вероятность, %', numeric: true },
  { value: 'next_step', label: 'Следующий шаг' },
  { value: 'pinned_note', label: 'Закреплённая заметка' },
  { value: 'next_action_date', label: 'Дата следующего действия' },
  { value: 'deadline', label: 'Дедлайн' },
  { value: 'direction', label: 'Направление' },
];

export const AUTOMATION_FIELD_LABEL: Record<string, string> = Object.fromEntries(
  AUTOMATION_FIELD_OPTIONS.map((o) => [o.value, o.label]),
);

/** Операторы условий (= wf_eval_conditions 050). */
export const AUTOMATION_OP_OPTIONS: { value: AutomationConditionOp; label: string }[] = [
  { value: 'eq', label: '=' },
  { value: 'neq', label: '≠' },
  { value: 'gt', label: '>' },
  { value: 'lt', label: '<' },
  { value: 'gte', label: '≥' },
  { value: 'lte', label: '≤' },
  { value: 'contains', label: 'содержит' },
  { value: 'is_null', label: 'пусто' },
  { value: 'not_null', label: 'не пусто' },
];

export const AUTOMATION_OP_LABEL: Record<AutomationConditionOp, string> = Object.fromEntries(
  AUTOMATION_OP_OPTIONS.map((o) => [o.value, o.label]),
) as Record<AutomationConditionOp, string>;

/** Ops, для которых value не нужен (скрываем input). */
export const AUTOMATION_NULLARY_OPS: AutomationConditionOp[] = ['is_null', 'not_null'];

/**
 * Whitelist полей set_field = ровно CASE в SQL 050 (не шире!).
 * numeric/date — подсказка типа input в редакторе.
 */
export const AUTOMATION_SET_FIELD_OPTIONS: {
  value: AutomationSetFieldName;
  label: string;
  input: 'text' | 'number' | 'date';
}[] = [
  { value: 'next_step', label: 'Следующий шаг', input: 'text' },
  { value: 'pinned_note', label: 'Закреплённая заметка', input: 'text' },
  { value: 'next_action_date', label: 'Дата следующего действия', input: 'date' },
  { value: 'probability', label: 'Вероятность, %', input: 'number' },
];
