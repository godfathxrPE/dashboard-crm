'use client';

import { useState, useMemo } from 'react';
import { Zap, Plus, Trash2, Pencil } from 'lucide-react';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import { usePipelineStages } from '@/lib/hooks/use-pipelines';
import {
  useAutomationRules,
  useUpdateAutomationRule,
  useDeleteAutomationRule,
} from '@/lib/hooks/use-automation-rules';
import {
  AUTOMATION_ASSIGNEE_LABEL,
  AUTOMATION_TRIGGER_LABEL,
  AUTOMATION_TRIGGER_OPTIONS,
  AUTOMATION_STATUS_LABEL,
  AUTOMATION_FIELD_LABEL,
  AUTOMATION_CONDITION_FIELD_LABEL,
  AUTOMATION_OP_LABEL,
  AUTOMATION_NULLARY_OPS,
} from '@/lib/constants/automation';
import { RuleEditorModal } from './automation/RuleEditorModal';
import type {
  AutomationRule,
  AutomationTriggerType,
  StageEnteredConfig,
  StatusChangedConfig,
  FieldChangedConfig,
  AutomationCreateTaskConfig,
  AutomationNotifyConfig,
  AutomationActivityConfig,
  AutomationSetFieldConfig,
} from '@/types/database';

// ═══════════════════════════════════════════════════════
// describeRule — обобщён на 3 триггера × 4 действия (type guards по
// trigger_type / action_type, без any). «Триггер (если …) → действие».
// ═══════════════════════════════════════════════════════

function describeTrigger(rule: AutomationRule, stageName: (id: string) => string): string {
  switch (rule.trigger_type) {
    case 'stage_entered': {
      const cfg = rule.trigger_config as StageEnteredConfig;
      return `Стадия «${cfg.stage_id ? stageName(cfg.stage_id) : '—'}»`;
    }
    case 'status_changed': {
      const cfg = rule.trigger_config as StatusChangedConfig;
      return cfg.to ? `Статус → ${AUTOMATION_STATUS_LABEL[cfg.to] ?? cfg.to}` : 'Смена статуса';
    }
    case 'field_changed': {
      const cfg = rule.trigger_config as FieldChangedConfig;
      return `Изменение «${AUTOMATION_FIELD_LABEL[cfg.field] ?? cfg.field}»`;
    }
    case 'task_overdue':
      return 'Просрочка задачи';
  }
}

function describeAction(rule: AutomationRule): string {
  switch (rule.action_type) {
    case 'create_task': {
      const cfg = rule.action_config as AutomationCreateTaskConfig;
      const who = AUTOMATION_ASSIGNEE_LABEL[cfg.assignee] ?? cfg.assignee;
      return `задача «${cfg.task_text}» → ${who}`;
    }
    case 'notify': {
      // task_overdue уведомляет исполнителя задачи (recipient движок 051 игнорирует).
      if (rule.trigger_type === 'task_overdue') return 'уведомить исполнителя';
      const cfg = rule.action_config as AutomationNotifyConfig;
      const who = AUTOMATION_ASSIGNEE_LABEL[cfg.recipient] ?? cfg.recipient;
      return `уведомить ${who}`;
    }
    case 'create_activity': {
      const cfg = rule.action_config as AutomationActivityConfig;
      return `заметка «${cfg.title}»`;
    }
    case 'set_field': {
      const cfg = rule.action_config as AutomationSetFieldConfig;
      return `поле «${AUTOMATION_FIELD_LABEL[cfg.field] ?? cfg.field}» = «${cfg.value}»`;
    }
  }
}

function describeConditions(rule: AutomationRule): string {
  const conds = rule.conditions ?? [];
  if (conds.length === 0) return '';
  const parts = conds.map((c) => {
    const f = AUTOMATION_CONDITION_FIELD_LABEL[c.field] ?? c.field;
    const op = AUTOMATION_OP_LABEL[c.op] ?? c.op;
    return AUTOMATION_NULLARY_OPS.includes(c.op) ? `${f} ${op}` : `${f} ${op} ${c.value}`;
  });
  return ` (если ${parts.join(' и ')})`;
}

function describeRule(rule: AutomationRule, stageName: (id: string) => string): string {
  return `${describeTrigger(rule, stageName)}${describeConditions(rule)} → ${describeAction(rule)}`;
}

/**
 * Настройка автоматизаций (S-WF-2B) — видно только owner/admin. Один org-wide
 * список правил под движок 050 (3 триггера × 4 действия + AND-условия). Правило
 * стреляет один раз на пару (сделка, trigger_key). RLS подстраховывает: запись
 * только owner/admin. Редактор — RuleEditorModal.
 */
export function AutomationsSection() {
  const { data: role } = useOrgRole();
  const { data: allStages = [] } = usePipelineStages();
  const { data: rules = [] } = useAutomationRules();
  const updateRule = useUpdateAutomationRule();
  const deleteRule = useDeleteAutomationRule();

  // null — закрыт; 'new' — пустой редактор; AutomationRule — редактирование.
  const [editing, setEditing] = useState<AutomationRule | 'new' | null>(null);
  const [filter, setFilter] = useState<AutomationTriggerType | 'all'>('all');

  const stageNameById = useMemo(
    () => new Map(allStages.map((s) => [s.id, s.name])),
    [allStages],
  );
  const stageName = (id: string) => stageNameById.get(id) ?? '—';

  const visibleRules = useMemo(
    () => (filter === 'all' ? rules : rules.filter((r) => r.trigger_type === filter)),
    [rules, filter],
  );

  const canManage = role === 'owner' || role === 'admin';
  if (!canManage) return null;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-text-dim" />
          <h2 className="text-xs font-semibold text-text-dim">Автоматизации</h2>
        </div>
        <button
          onClick={() => setEditing('new')}
          className="flex items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          <Plus size={13} /> Правило
        </button>
      </div>

      <p className="mb-3 text-[11px] text-text-mute">
        Когда триггер срабатывает и условия выполняются — движок выполняет действие
        (создать задачу, уведомить, добавить заметку или изменить поле). Каждое правило
        срабатывает один раз на сделку в рамках триггера.
      </p>

      {/* Чип-фильтр по типу триггера (поверх полного списка) */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(['all', ...AUTOMATION_TRIGGER_OPTIONS.map((o) => o.value)] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
              filter === t ? 'bg-accent-l text-accent' : 'bg-surface2 text-text-mute hover:text-text-dim'
            }`}
          >
            {t === 'all' ? 'Все' : AUTOMATION_TRIGGER_LABEL[t]}
          </button>
        ))}
      </div>

      {visibleRules.length === 0 ? (
        <p className="py-2 text-center text-[12px] text-text-mute">
          {rules.length === 0 ? 'Правила ещё не заданы.' : 'Нет правил этого типа.'}
        </p>
      ) : (
        <div className="divide-y divide-border">
          {visibleRules.map((rule) => (
            <div key={rule.id} className="flex items-center gap-2 py-2">
              <span className="shrink-0 rounded-full bg-surface2 px-1.5 py-0.5 text-[9px] font-medium text-text-mute">
                {AUTOMATION_TRIGGER_LABEL[rule.trigger_type]}
              </span>

              <span
                className="min-w-0 flex-1 truncate text-[12px] text-text-main"
                title={`${rule.name} — ${describeRule(rule, stageName)}`}
              >
                {describeRule(rule, stageName)}
              </span>

              <button
                onClick={() => updateRule.mutate({ id: rule.id, is_active: !rule.is_active })}
                disabled={updateRule.isPending}
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  rule.is_active ? 'bg-accent-l text-accent' : 'bg-surface2 text-text-mute'
                }`}
                title={rule.is_active ? 'Активно — нажмите, чтобы выключить' : 'Выключено — нажмите, чтобы включить'}
              >
                {rule.is_active ? 'вкл' : 'выкл'}
              </button>

              <button
                onClick={() => setEditing(rule)}
                className="shrink-0 p-1.5 text-text-mute transition-colors hover:text-text-main"
                aria-label="Изменить правило"
                title="Изменить правило"
              >
                <Pencil size={13} />
              </button>

              <button
                onClick={() => deleteRule.mutate(rule.id)}
                disabled={deleteRule.isPending}
                className="shrink-0 p-1.5 text-text-mute transition-colors hover:text-text-main"
                aria-label="Удалить правило"
                title="Удалить правило"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <RuleEditorModal
          rule={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
