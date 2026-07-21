'use client';

import { useEffect, useMemo } from 'react';
import { useForm, useFieldArray, FormProvider, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { Combobox } from '@/components/shared/Combobox';
import { usePipelines, usePipelineStages } from '@/lib/hooks/use-pipelines';
import {
  useCreateAutomationRule,
  useUpdateAutomationRule,
  type AutomationRuleInput,
} from '@/lib/hooks/use-automation-rules';
import {
  AUTOMATION_TRIGGER_OPTIONS,
  AUTOMATION_ACTION_OPTIONS,
  AUTOMATION_STATUS_OPTIONS,
  AUTOMATION_FIELD_OPTIONS,
  AUTOMATION_TASK_FIELD_OPTIONS,
  AUTOMATION_ASSIGNEE_OPTIONS,
  AUTOMATION_PRIORITY_OPTIONS,
  AUTOMATION_SET_FIELD_OPTIONS,
  AUTOMATION_NULLARY_OPS,
} from '@/lib/constants/automation';
import { ruleSchema, type RuleFormValues } from '@/lib/validators/automation-rule';
import { ConditionRow } from './ConditionRow';
import type {
  AutomationRule,
  AutomationTriggerConfig,
  AutomationActionConfig,
  StageEnteredConfig,
  StatusChangedConfig,
  FieldChangedConfig,
  AutomationCreateTaskConfig,
  AutomationNotifyConfig,
  AutomationActivityConfig,
  AutomationSetFieldConfig,
} from '@/types/database';

const labelCls = 'block text-[11px] font-medium text-text-dim mb-1';
const selectCls =
  'w-full rounded border border-input bg-surface px-2 py-1.5 text-xs text-text-dim';
const inputCls =
  'w-full rounded border border-input bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none';
const errCls = 'mt-1 text-[11px] text-red';

// ── маппинг rule → плоские form-values (обратный) ──
function fromRule(rule: AutomationRule): RuleFormValues {
  const tc = rule.trigger_config;
  const ac = rule.action_config;
  return {
    name: rule.name,
    trigger_type: rule.trigger_type,
    t_pipeline_id: rule.trigger_type === 'stage_entered' ? (tc as StageEnteredConfig).pipeline_id : '',
    t_stage_id: rule.trigger_type === 'stage_entered' ? (tc as StageEnteredConfig).stage_id : '',
    t_status_to: rule.trigger_type === 'status_changed' ? ((tc as StatusChangedConfig).to ?? '') : '',
    t_field: rule.trigger_type === 'field_changed' ? (tc as FieldChangedConfig).field : '',
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
  };
}

// ── маппинг плоские form-values → AutomationRuleInput (submit) ──
function toInput(v: RuleFormValues): AutomationRuleInput {
  let trigger_config: AutomationTriggerConfig;
  if (v.trigger_type === 'stage_entered') {
    trigger_config = { pipeline_id: v.t_pipeline_id ?? '', stage_id: v.t_stage_id ?? '' };
  } else if (v.trigger_type === 'status_changed') {
    // пусто ⇒ {} (SQL ->>'to' IS NULL матчит любой; {to:''} бы сломал матч)
    trigger_config = v.t_status_to ? { to: v.t_status_to } : {};
  } else if (v.trigger_type === 'field_changed') {
    trigger_config = { field: v.t_field ?? '' };
  } else {
    trigger_config = {}; // task_overdue — без конфигурации
  }

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

function emptyDefaults(firstPipelineId: string): RuleFormValues {
  return {
    name: '',
    trigger_type: 'stage_entered',
    t_pipeline_id: firstPipelineId,
    t_stage_id: '',
    t_status_to: '',
    t_field: '',
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
  };
}

/**
 * Редактор правила автоматизации (S-WF-2B) — configuration-форма RHF+Zod с
 * условными секциями (Триггер / Условия / Действие) под движок 050:
 * 3 триггера × 4 действия + AND-условия. Монтируется условно (Modal без `open`).
 */
export function RuleEditorModal({
  rule,
  onClose,
}: {
  rule?: AutomationRule;
  onClose: () => void;
}) {
  const { data: pipelines = [] } = usePipelines();
  const { data: allStages = [] } = usePipelineStages();
  const create = useCreateAutomationRule();
  const update = useUpdateAutomationRule();

  const methods = useForm<RuleFormValues>({
    resolver: zodResolver(ruleSchema),
    defaultValues: rule ? fromRule(rule) : emptyDefaults(pipelines[0]?.id ?? ''),
  });
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = methods;

  const { fields, append, remove } = useFieldArray({ control, name: 'conditions' });

  const triggerType = watch('trigger_type');
  const actionType = watch('action_type');
  const pipelineId = watch('t_pipeline_id');
  const setFieldName = watch('a_set_field');

  const isOverdue = triggerType === 'task_overdue';
  // Поля условий: task_overdue матчит по полям ЗАДАЧИ, остальные — по projects.
  const fieldOptions = isOverdue ? AUTOMATION_TASK_FIELD_OPTIONS : AUTOMATION_FIELD_OPTIONS;
  // task_overdue (движок 051) умеет только notify / create_activity.
  const actionOptions = isOverdue
    ? AUTOMATION_ACTION_OPTIONS.filter((o) => o.value === 'notify' || o.value === 'create_activity')
    : AUTOMATION_ACTION_OPTIONS;

  // Бэкфилл воронки по умолчанию для нового правила (pipelines грузятся async).
  useEffect(() => {
    if (!rule && !pipelineId && pipelines[0]) {
      setValue('t_pipeline_id', pipelines[0].id, { shouldDirty: false });
    }
  }, [rule, pipelineId, pipelines, setValue]);

  // Переключение на task_overdue с несовместимым действием → notify (whitelist 051).
  useEffect(() => {
    if (isOverdue && (actionType === 'create_task' || actionType === 'set_field')) {
      setValue('action_type', 'notify', { shouldDirty: true });
    }
  }, [isOverdue, actionType, setValue]);

  const pipelineOptions = useMemo(
    () => pipelines.map((p) => ({ value: p.id, label: p.name })),
    [pipelines],
  );
  const stageOptions = useMemo(
    () =>
      allStages
        .filter((s) => s.pipeline_id === pipelineId)
        .sort((a, b) => a.order_index - b.order_index)
        .map((s) => ({ value: s.id, label: s.name })),
    [allStages, pipelineId],
  );

  const setFieldMeta = AUTOMATION_SET_FIELD_OPTIONS.find((o) => o.value === setFieldName);
  const setInputType = setFieldMeta?.input ?? 'text';

  const pending = create.isPending || update.isPending;

  function onSubmit(values: RuleFormValues) {
    const input = toInput(values);
    if (rule) {
      update.mutate({ id: rule.id, ...input }, { onSuccess: onClose });
    } else {
      create.mutate(input, { onSuccess: onClose });
    }
  }

  return (
    <Modal
      title={rule ? 'Редактировать правило' : 'Новое правило'}
      description="Когда триггер сработает и условия выполнятся — движок выполнит действие."
      onClose={onClose}
      isDirty={isDirty}
      maxWidth="max-w-xl"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-text-dim transition-colors hover:bg-surface2"
          >
            Отмена
          </button>
          <button
            type="submit"
            form="rule-form"
            disabled={pending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </>
      }
    >
      <FormProvider {...methods}>
        <form id="rule-form" onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Название */}
          <div>
            <label htmlFor="rule-name" className={labelCls}>Название правила</label>
            <input
              id="rule-name"
              type="text"
              {...register('name')}
              placeholder="Напр. «КП при входе в переговоры»"
              className={inputCls}
            />
            {errors.name && <p className={errCls}>{errors.name.message}</p>}
          </div>

          {/* ── Секция 1: Триггер ── */}
          <fieldset className="space-y-2 border-t border-border pt-3">
            <legend className="text-[11px] font-semibold text-text-dim">Триггер</legend>

            <div>
              <label htmlFor="trigger-type" className={labelCls}>Когда</label>
              <select id="trigger-type" {...register('trigger_type')} className={selectCls}>
                {AUTOMATION_TRIGGER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {triggerType === 'stage_entered' && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Воронка</label>
                  <Controller
                    control={control}
                    name="t_pipeline_id"
                    render={({ field }) => (
                      <Combobox
                        options={pipelineOptions}
                        value={field.value || null}
                        onChange={(v) => {
                          field.onChange(v ?? '');
                          setValue('t_stage_id', '', { shouldDirty: true });
                        }}
                        placeholder="Воронка…"
                      />
                    )}
                  />
                </div>
                <div>
                  <label className={labelCls}>Стадия входа</label>
                  <Controller
                    control={control}
                    name="t_stage_id"
                    render={({ field }) => (
                      <Combobox
                        options={stageOptions}
                        value={field.value || null}
                        onChange={(v) => field.onChange(v ?? '')}
                        placeholder="Стадия…"
                      />
                    )}
                  />
                  {errors.t_stage_id && <p className={errCls}>{errors.t_stage_id.message}</p>}
                </div>
              </div>
            )}

            {triggerType === 'status_changed' && (
              <div>
                <label htmlFor="t-status" className={labelCls}>Новый статус</label>
                <select id="t-status" {...register('t_status_to')} className={selectCls}>
                  {AUTOMATION_STATUS_OPTIONS.map((o) => (
                    <option key={o.value || 'any'} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            )}

            {triggerType === 'field_changed' && (
              <div>
                <label htmlFor="t-field" className={labelCls}>Поле</label>
                <select id="t-field" {...register('t_field')} className={selectCls}>
                  <option value="">Выберите поле…</option>
                  {AUTOMATION_FIELD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {errors.t_field && <p className={errCls}>{errors.t_field.message}</p>}
              </div>
            )}

            {triggerType === 'task_overdue' && (
              <p className="rounded bg-surface2 px-2.5 py-2 text-[11px] text-text-mute">
                Срабатывает, когда дедлайн задачи прошёл, а она не выполнена.
                Проверяется ежедневно, напоминаем <strong className="text-text-dim">один раз</strong> на задачу.
              </p>
            )}
          </fieldset>

          {/* ── Секция 2: Условия ── */}
          <fieldset className="space-y-2 border-t border-border pt-3">
            <legend className="text-[11px] font-semibold text-text-dim">Условия</legend>
            <p className="text-xs text-text-mute">
              Все условия должны выполняться (И). Пусто — срабатывает всегда.
              Операторы <code className="rounded bg-surface2 px-1">{'>'}</code>/
              <code className="rounded bg-surface2 px-1">{'<'}</code> — для числовых полей.
            </p>

            {fields.length > 0 && (
              <div className="space-y-2">
                {fields.map((f, index) => (
                  <ConditionRow
                    key={f.id}
                    index={index}
                    onRemove={() => remove(index)}
                    fieldOptions={fieldOptions}
                  />
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => append({ field: fieldOptions[0].value, op: 'eq', value: '' })}
              className="flex items-center gap-1 rounded border border-border px-2.5 py-1 text-[11px] text-text-dim transition-colors hover:bg-surface2"
            >
              <Plus size={12} /> условие
            </button>
          </fieldset>

          {/* ── Секция 3: Действие ── */}
          <fieldset className="space-y-2 border-t border-border pt-3">
            <legend className="text-[11px] font-semibold text-text-dim">Действие</legend>

            <div>
              <label htmlFor="action-type" className={labelCls}>Что сделать</label>
              <select id="action-type" {...register('action_type')} className={selectCls}>
                {actionOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {actionType === 'create_task' && (
              <>
                <div>
                  <label htmlFor="a-task-text" className={labelCls}>Текст задачи</label>
                  <input
                    id="a-task-text"
                    type="text"
                    {...register('a_task_text')}
                    placeholder="Напр. «Подготовить КП по {deal}»"
                    className={inputCls}
                  />
                  {errors.a_task_text && <p className={errCls}>{errors.a_task_text.message}</p>}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div>
                    <label htmlFor="a-assignee" className={labelCls}>Исполнитель</label>
                    <select id="a-assignee" {...register('a_assignee')} className={selectCls}>
                      {AUTOMATION_ASSIGNEE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="a-priority" className={labelCls}>Приоритет</label>
                    <select id="a-priority" {...register('a_priority')} className={selectCls}>
                      {AUTOMATION_PRIORITY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="a-due" className={labelCls}>Срок, дней</label>
                    <input
                      id="a-due"
                      type="number"
                      min={0}
                      {...register('a_due')}
                      className={selectCls}
                    />
                  </div>
                </div>
              </>
            )}

            {actionType === 'notify' && (
              <>
                {/* task_overdue: получатель = исполнитель задачи (движок 051), select скрыт */}
                {isOverdue ? (
                  <p className="text-[11px] text-text-mute">Уведомление уйдёт исполнителю задачи.</p>
                ) : (
                  <div>
                    <label htmlFor="a-recipient" className={labelCls}>Получатель</label>
                    <select id="a-recipient" {...register('a_assignee')} className={selectCls}>
                      {AUTOMATION_ASSIGNEE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label htmlFor="a-notify-text" className={labelCls}>Текст уведомления</label>
                  <input
                    id="a-notify-text"
                    type="text"
                    {...register('a_notify_text')}
                    placeholder={
                      isOverdue
                        ? 'Напр. «Задача {task} просрочена»'
                        : 'Напр. «Сделка {deal} требует внимания»'
                    }
                    className={inputCls}
                  />
                  {errors.a_notify_text && <p className={errCls}>{errors.a_notify_text.message}</p>}
                </div>
              </>
            )}

            {actionType === 'create_activity' && (
              <>
                <div>
                  <label htmlFor="a-title" className={labelCls}>Заголовок заметки</label>
                  <input
                    id="a-title"
                    type="text"
                    {...register('a_title')}
                    placeholder={
                      isOverdue
                        ? 'Напр. «Просрочена задача {task}»'
                        : 'Напр. «Проверить бюджет по {deal}»'
                    }
                    className={inputCls}
                  />
                  {errors.a_title && <p className={errCls}>{errors.a_title.message}</p>}
                </div>
                <div>
                  <label htmlFor="a-description" className={labelCls}>Описание (необязательно)</label>
                  <textarea
                    id="a-description"
                    {...register('a_description')}
                    rows={2}
                    className={inputCls}
                    style={{ resize: 'vertical' }}
                  />
                </div>
              </>
            )}

            {actionType === 'set_field' && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label htmlFor="a-set-field" className={labelCls}>Поле</label>
                  <select id="a-set-field" {...register('a_set_field')} className={selectCls}>
                    {AUTOMATION_SET_FIELD_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="a-set-value" className={labelCls}>Значение</label>
                  <input
                    id="a-set-value"
                    type={setInputType}
                    {...register('a_set_value')}
                    className={inputCls}
                  />
                  {errors.a_set_value && <p className={errCls}>{errors.a_set_value.message}</p>}
                </div>
              </div>
            )}

            <p className="text-xs text-text-mute">
              {isOverdue ? (
                <>Плейсхолдер <code className="rounded bg-surface2 px-1">{'{task}'}</code> подставит текст задачи.</>
              ) : (
                <>Плейсхолдер <code className="rounded bg-surface2 px-1">{'{deal}'}</code> подставит имя сделки.</>
              )}
            </p>
          </fieldset>
        </form>
      </FormProvider>
    </Modal>
  );
}
