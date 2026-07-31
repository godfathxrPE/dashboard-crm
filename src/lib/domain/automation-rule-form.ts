import { AUTOMATION_DWELL_MIN_DAYS, AUTOMATION_NULLARY_OPS } from '@/lib/constants/automation';
import type { RuleFormValues } from '@/lib/validators/automation-rule';
import type { AutomationRuleInput } from '@/lib/hooks/use-automation-rules';
import type {
  AutomationRule,
  AutomationTriggerConfig,
  AutomationActionConfig,
  StageEnteredConfig,
  StatusChangedConfig,
  FieldChangedConfig,
  DaysInStageConfig,
  AutomationCreateTaskConfig,
  AutomationNotifyConfig,
  AutomationActivityConfig,
  AutomationSetFieldConfig,
  AutomationSuggestSpawnConfig,
  AutomationWebhookConfig,
} from '@/types/database';

// ═══════════════════════════════════════════════════════
// Маппинг правило ↔ плоские form-values редактора автоматизаций (S-WF-2B).
//
// Вынесено из RuleEditorModal в домен (090) ровно ради тестируемости: ветка
// `else` в toInput — известная ловушка (см. ниже), и регресс на неё должен ловиться
// юнитом, а не глазами на ревью. Зависимостей от React здесь нет.
// ═══════════════════════════════════════════════════════

/** rule → плоские form-values (открытие редактора). */
export function fromRule(rule: AutomationRule): RuleFormValues {
  const tc = rule.trigger_config;
  const ac = rule.action_config;
  return {
    name: rule.name,
    trigger_type: rule.trigger_type,
    t_pipeline_id: rule.trigger_type === 'stage_entered' ? (tc as StageEnteredConfig).pipeline_id : '',
    // t_stage_id переиспользуется двумя триггерами: обязателен у stage_entered,
    // опционален у days_in_stage (пусто ⇒ любая стадия).
    t_stage_id:
      rule.trigger_type === 'stage_entered'
        ? (tc as StageEnteredConfig).stage_id
        : rule.trigger_type === 'days_in_stage'
          ? ((tc as DaysInStageConfig).stage_id ?? '')
          : '',
    t_status_to: rule.trigger_type === 'status_changed' ? ((tc as StatusChangedConfig).to ?? '') : '',
    t_field: rule.trigger_type === 'field_changed' ? (tc as FieldChangedConfig).field : '',
    t_min_days: rule.trigger_type === 'days_in_stage' ? (tc as DaysInStageConfig).min_days : 14,
    conditions: rule.conditions ?? [],
    action_type: rule.action_type,
    a_task_text: rule.action_type === 'create_task' ? (ac as AutomationCreateTaskConfig).task_text : '',
    a_assignee:
      rule.action_type === 'create_task'
        ? (ac as AutomationCreateTaskConfig).assignee
        : rule.action_type === 'notify'
          ? (ac as AutomationNotifyConfig).recipient
          : 'deal_owner',
    a_priority: rule.action_type === 'create_task' ? (ac as AutomationCreateTaskConfig).priority : 'important',
    a_due: rule.action_type === 'create_task' ? (ac as AutomationCreateTaskConfig).due_in_days : 3,
    a_notify_text: rule.action_type === 'notify' ? (ac as AutomationNotifyConfig).text : '',
    a_title: rule.action_type === 'create_activity' ? (ac as AutomationActivityConfig).title : '',
    a_description:
      rule.action_type === 'create_activity' ? ((ac as AutomationActivityConfig).description ?? '') : '',
    a_set_field: rule.action_type === 'set_field' ? (ac as AutomationSetFieldConfig).field : 'next_step',
    a_set_value: rule.action_type === 'set_field' ? (ac as AutomationSetFieldConfig).value : '',
    a_spawn_text:
      rule.action_type === 'suggest_spawn' ? (ac as AutomationSuggestSpawnConfig).text : '',
    // 090: массив, а не undefined — чекбоксы должны получить управляемое значение
    a_endpoint_ids:
      rule.action_type === 'webhook' ? ((ac as AutomationWebhookConfig).endpoint_ids ?? []) : [],
  };
}

/** Плоские form-values → AutomationRuleInput (submit). */
export function toInput(v: RuleFormValues): AutomationRuleInput {
  let trigger_config: AutomationTriggerConfig;
  if (v.trigger_type === 'stage_entered') {
    trigger_config = { pipeline_id: v.t_pipeline_id ?? '', stage_id: v.t_stage_id ?? '' };
  } else if (v.trigger_type === 'status_changed') {
    // пусто ⇒ {} (SQL ->>'to' IS NULL матчит любой; {to:''} бы сломал матч)
    trigger_config = v.t_status_to ? { to: v.t_status_to } : {};
  } else if (v.trigger_type === 'field_changed') {
    trigger_config = { field: v.t_field ?? '' };
  } else if (v.trigger_type === 'days_in_stage') {
    // stage_id пишем ТОЛЬКО когда стадия выбрана: SQL трактует отсутствие ключа
    // как «любая стадия», а `{stage_id:''}` уронил бы каст ''::uuid.
    trigger_config = {
      min_days: v.t_min_days ?? AUTOMATION_DWELL_MIN_DAYS,
      ...(v.t_stage_id ? { stage_id: v.t_stage_id } : {}),
    };
  } else {
    trigger_config = {}; // task_overdue — без конфигурации
  }

  // ⚠️ set_field собирается в ФИНАЛЬНОМ `else`, а не в своей ветке. Любое новое
  //    действие обязано получить ветку ВЫШЕ него, иначе уедет в {field, value} и
  //    правило молча создастся неработающим. Регресс на это — юнит-тест
  //    tests/unit/automation-webhook.test.ts.
  let action_config: AutomationActionConfig;
  if (v.action_type === 'create_task') {
    action_config = {
      task_text: v.a_task_text?.trim() ?? '',
      assignee: v.a_assignee ?? 'deal_owner',
      lane: 'now',
      priority: v.a_priority ?? 'normal',
      due_in_days: v.a_due ?? 3,
    };
  } else if (v.action_type === 'notify') {
    action_config = { recipient: v.a_assignee ?? 'deal_owner', text: v.a_notify_text?.trim() ?? '' };
  } else if (v.action_type === 'create_activity') {
    action_config = { title: v.a_title?.trim() ?? '', description: v.a_description?.trim() || undefined };
  } else if (v.action_type === 'suggest_spawn') {
    action_config = { text: v.a_spawn_text?.trim() ?? '' };
  } else if (v.action_type === 'webhook') {
    action_config = { endpoint_ids: v.a_endpoint_ids ?? [] };
  } else {
    action_config = { field: v.a_set_field ?? 'next_step', value: v.a_set_value ?? '' };
  }

  const conditions = (v.conditions ?? []).map((c) =>
    AUTOMATION_NULLARY_OPS.includes(c.op) ? { ...c, value: '' } : c,
  );

  return {
    name: v.name.trim(),
    trigger_type: v.trigger_type,
    trigger_config,
    action_type: v.action_type,
    action_config,
    conditions,
  };
}

/** Значения формы для нового правила. */
export function emptyDefaults(firstPipelineId: string): RuleFormValues {
  return {
    name: '',
    trigger_type: 'stage_entered',
    t_pipeline_id: firstPipelineId,
    t_stage_id: '',
    t_status_to: '',
    t_field: '',
    t_min_days: 14,
    conditions: [],
    action_type: 'create_task',
    a_task_text: '',
    a_assignee: 'deal_owner',
    a_priority: 'important',
    a_due: 3,
    a_notify_text: '',
    a_title: '',
    a_description: '',
    a_set_field: 'next_step',
    a_set_value: '',
    a_spawn_text: '',
    a_endpoint_ids: [],
  };
}
