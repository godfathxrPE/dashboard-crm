'use client';

import { useState, useMemo } from 'react';
import { Zap, Plus, Trash2 } from 'lucide-react';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import { usePipelines, usePipelineStages } from '@/lib/hooks/use-pipelines';
import {
  useAutomationRules,
  useCreateAutomationRule,
  useUpdateAutomationRule,
  useDeleteAutomationRule,
} from '@/lib/hooks/use-automation-rules';
import {
  AUTOMATION_ASSIGNEE_OPTIONS,
  AUTOMATION_PRIORITY_OPTIONS,
  AUTOMATION_ASSIGNEE_LABEL,
  AUTOMATION_PRIORITY_LABEL,
} from '@/lib/constants/automation';
import type {
  AutomationRule,
  AutomationAssignee,
  TaskPriority,
} from '@/types/database';

const DIRECTION_LABEL: Record<string, string> = { erp: 'ERP', iiot: 'IIoT' };

/** Человекочитаемое описание правила: «Стадия „X“ → задача „…“ → владелец, +N дн». */
function describeRule(rule: AutomationRule, stageName: (id: string) => string): string {
  const cfg = rule.action_config;
  const stage = stageName(rule.trigger_config.stage_id);
  const who = AUTOMATION_ASSIGNEE_LABEL[cfg.assignee] ?? cfg.assignee;
  const prio = AUTOMATION_PRIORITY_LABEL[cfg.priority] ?? cfg.priority;
  return `Стадия «${stage}» → задача «${cfg.task_text}» → ${who}, ${prio}, +${cfg.due_in_days} дн.`;
}

function AddForm({
  pipelineId,
  stages,
}: {
  pipelineId: string;
  stages: { id: string; name: string }[];
}) {
  const create = useCreateAutomationRule();
  const [stageId, setStageId] = useState('');
  const [taskText, setTaskText] = useState('');
  const [assignee, setAssignee] = useState<AutomationAssignee>('deal_owner');
  const [priority, setPriority] = useState<TaskPriority>('important');
  const [dueDays, setDueDays] = useState(3);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!stageId) { setError('Выберите стадию входа'); return; }
    if (!taskText.trim()) { setError('Заполните текст задачи'); return; }

    const stageName = stages.find((s) => s.id === stageId)?.name ?? 'стадию';

    create.mutate(
      {
        name: `Задача при входе в «${stageName}»`,
        trigger_type: 'stage_entered',
        trigger_config: { pipeline_id: pipelineId, stage_id: stageId },
        action_type: 'create_task',
        action_config: {
          task_text: taskText.trim(),
          assignee,
          lane: 'now',
          priority,
          due_in_days: Math.max(0, dueDays),
        },
      },
      {
        onSuccess: () => { setTaskText(''); setStageId(''); },
        onError: (err) => setError(err instanceof Error ? err.message : 'Не удалось создать правило'),
      },
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2 border-t border-border pt-3">
      <p className="text-[11px] font-medium text-text-dim">Добавить правило</p>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={stageId}
          onChange={(e) => setStageId(e.target.value)}
          className="min-w-[9rem] rounded-md border border-border bg-surface px-2 py-1.5 text-[12px] text-text-dim"
        >
          <option value="">Стадия входа…</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <select
          value={assignee}
          onChange={(e) => setAssignee(e.target.value as AutomationAssignee)}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-[12px] text-text-dim"
          title="Кому назначить задачу"
        >
          {AUTOMATION_ASSIGNEE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as TaskPriority)}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-[12px] text-text-dim"
          title="Приоритет задачи"
        >
          {AUTOMATION_PRIORITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <label className="flex items-center gap-1 text-[11px] text-text-mute">
          Срок +
          <input
            type="number"
            min={0}
            value={dueDays}
            onChange={(e) => setDueDays(parseInt(e.target.value, 10) || 0)}
            className="w-14 rounded-md border border-border bg-surface px-2 py-1.5 text-[12px] text-text-dim"
            title="Дней от даты срабатывания"
          />
          дн.
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={taskText}
          onChange={(e) => setTaskText(e.target.value)}
          placeholder="Текст задачи (напр. «Подготовить КП по {deal}»)"
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-main placeholder:text-text-mute"
        />
        <button
          type="submit"
          disabled={create.isPending}
          className="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          <Plus size={13} /> Добавить
        </button>
      </div>
      <p className="text-[10px] text-text-mute">
        Плейсхолдер <code className="rounded bg-surface2 px-1">{'{deal}'}</code> подставит имя сделки.
      </p>
      {error && <p className="text-[11px] text-red">{error}</p>}
    </form>
  );
}

/**
 * Настройка автоматизаций (Sprint 29) — видно только owner/admin. «Сделка вошла
 * в стадию → создать задачу ответственному». Правило стреляет один раз на пару
 * (сделка, стадия). Whitelist assignee/priority/lane синхронен с SQL-функцией
 * run_stage_automations(). RLS подстраховывает: запись только owner/admin.
 */
export function AutomationsSection() {
  const { data: role } = useOrgRole();
  const { data: pipelines = [] } = usePipelines();
  const { data: allStages = [] } = usePipelineStages();
  const { data: rules = [] } = useAutomationRules();
  const updateRule = useUpdateAutomationRule();
  const deleteRule = useDeleteAutomationRule();

  const [pipelineId, setPipelineId] = useState<string>('');
  const activePipelineId = pipelineId || pipelines[0]?.id || '';

  const stages = useMemo(
    () =>
      allStages
        .filter((s) => s.pipeline_id === activePipelineId)
        .sort((a, b) => a.order_index - b.order_index),
    [allStages, activePipelineId],
  );

  // Имена стадий по всем воронкам — правило может ссылаться на любую.
  const stageNameById = useMemo(
    () => new Map(allStages.map((s) => [s.id, s.name])),
    [allStages],
  );
  const stageName = (id: string) => stageNameById.get(id) ?? '—';

  const stageOrder = useMemo(
    () => new Map(allStages.map((s) => [s.id, s.order_index])),
    [allStages],
  );

  // Показываем правила активной воронки.
  const visibleRules = useMemo(
    () =>
      rules
        .filter((r) => r.trigger_config.pipeline_id === activePipelineId)
        .sort(
          (a, b) =>
            (stageOrder.get(a.trigger_config.stage_id) ?? 0) -
            (stageOrder.get(b.trigger_config.stage_id) ?? 0),
        ),
    [rules, activePipelineId, stageOrder],
  );

  const canManage = role === 'owner' || role === 'admin';
  if (!canManage) return null;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <Zap size={14} className="text-text-dim" />
        <h2 className="text-xs font-semibold text-text-dim">Автоматизации</h2>
      </div>

      <p className="mb-3 text-[11px] text-text-mute">
        Когда сделка входит в стадию — автоматически создаётся задача ответственному.
        Каждое правило срабатывает один раз на сделку в этой стадии.
      </p>

      <select
        value={activePipelineId}
        onChange={(e) => setPipelineId(e.target.value)}
        className="mb-3 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-text-dim"
      >
        {pipelines.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} · {DIRECTION_LABEL[p.direction] ?? p.direction}
          </option>
        ))}
      </select>

      {visibleRules.length === 0 ? (
        <p className="py-2 text-center text-[12px] text-text-mute">
          Для этой воронки правила не заданы.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {visibleRules.map((rule) => (
            <div key={rule.id} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1 truncate text-[12px] text-text-main" title={describeRule(rule, stageName)}>
                {describeRule(rule, stageName)}
              </span>

              <button
                onClick={() => updateRule.mutate({ id: rule.id, is_active: !rule.is_active })}
                disabled={updateRule.isPending}
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  rule.is_active
                    ? 'bg-accent-l text-accent'
                    : 'bg-surface2 text-text-mute'
                }`}
                title={rule.is_active ? 'Активно — нажмите, чтобы выключить' : 'Выключено — нажмите, чтобы включить'}
              >
                {rule.is_active ? 'вкл' : 'выкл'}
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

      {activePipelineId && (
        <AddForm
          pipelineId={activePipelineId}
          stages={stages.map((s) => ({ id: s.id, name: s.name }))}
        />
      )}
    </div>
  );
}
