import { z } from 'zod';

// ═══════════════════════════════════════════════════════
// S-WF-2B — схема формы правила автоматизации.
// Плоские form-values + superRefine (RHF-дружелюбнее вложенных discriminated
// union): каждое поле config'а живёт своим ключом, обязательность зависит от
// выбранного trigger_type / action_type. Маппинг плоских values ↔
// AutomationRuleInput делает RuleEditorModal (fromRule / toInput).
// ═══════════════════════════════════════════════════════

const opEnum = z.enum([
  'eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'contains', 'is_null', 'not_null',
]);

export const ruleSchema = z
  .object({
    name: z.string().min(1, 'Название'),

    // ── trigger ──
    trigger_type: z.enum(['stage_entered', 'status_changed', 'field_changed']),
    t_pipeline_id: z.string().optional(),
    t_stage_id: z.string().optional(),
    t_status_to: z.string().optional(),   // '' = любой статус
    t_field: z.string().optional(),

    // ── conditions (AND) ──
    conditions: z
      .array(
        z.object({
          field: z.string().min(1),
          op: opEnum,
          value: z.string(),
        }),
      )
      .default([]),

    // ── action ──
    action_type: z.enum(['create_task', 'notify', 'create_activity', 'set_field']),
    // create_task
    a_task_text: z.string().optional(),
    a_assignee: z.enum(['deal_owner', 'deal_creator']).optional(),
    a_priority: z.enum(['normal', 'important', 'critical']).optional(),
    a_due: z.coerce.number().min(0).optional(),
    // notify
    a_notify_text: z.string().optional(),
    // create_activity
    a_title: z.string().optional(),
    a_description: z.string().optional(),
    // set_field
    a_set_field: z
      .enum(['next_step', 'pinned_note', 'next_action_date', 'probability'])
      .optional(),
    a_set_value: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    // trigger
    if (v.trigger_type === 'stage_entered' && !v.t_stage_id)
      ctx.addIssue({ code: 'custom', path: ['t_stage_id'], message: 'Выберите стадию' });
    if (v.trigger_type === 'field_changed' && !v.t_field)
      ctx.addIssue({ code: 'custom', path: ['t_field'], message: 'Выберите поле' });

    // action
    if (v.action_type === 'create_task' && !v.a_task_text?.trim())
      ctx.addIssue({ code: 'custom', path: ['a_task_text'], message: 'Текст задачи' });
    if (v.action_type === 'notify' && !v.a_notify_text?.trim())
      ctx.addIssue({ code: 'custom', path: ['a_notify_text'], message: 'Текст уведомления' });
    if (v.action_type === 'create_activity' && !v.a_title?.trim())
      ctx.addIssue({ code: 'custom', path: ['a_title'], message: 'Заголовок' });
    if (v.action_type === 'set_field' && (!v.a_set_field || v.a_set_value === undefined))
      ctx.addIssue({ code: 'custom', path: ['a_set_value'], message: 'Поле и значение' });
  });

export type RuleFormValues = z.infer<typeof ruleSchema>;
