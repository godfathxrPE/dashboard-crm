'use client';

import { useState, useMemo } from 'react';
import { ShieldCheck, Plus, Trash2 } from 'lucide-react';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import { usePipelines, usePipelineStages } from '@/lib/hooks/use-pipelines';
import {
  useStageRequirements,
  useCreateStageRequirement,
  useUpdateStageRequirement,
  useDeleteStageRequirement,
} from '@/lib/hooks/use-stage-requirements';
import { GATE_FIELD_COLUMNS, GATE_FIELD_LABEL } from '@/lib/constants/stage-gates';
import type {
  RequirementType,
  GateFieldColumn,
  StageRequirement,
} from '@/types/database';

const DIRECTION_LABEL: Record<string, string> = { erp: 'ERP', iiot: 'IIoT' };

function describeConfig(req: StageRequirement): string {
  if (req.requirement_type === 'field') {
    const col = (req.config as { column?: GateFieldColumn }).column;
    return col ? GATE_FIELD_LABEL[col] ?? col : '—';
  }
  const c = req.config as { min_count?: number; label?: string };
  return `Файлы ≥ ${c.min_count ?? 1}${c.label ? ` · «${c.label}»` : ''}`;
}

function AddForm({ pipelineId, stageIds }: { pipelineId: string; stageIds: { id: string; label: string }[] }) {
  const create = useCreateStageRequirement();
  const [stageId, setStageId] = useState('');
  const [type, setType] = useState<RequirementType>('field');
  const [column, setColumn] = useState<GateFieldColumn>('budget');
  const [minCount, setMinCount] = useState(1);
  const [label, setLabel] = useState('');
  const [hint, setHint] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!stageId) { setError('Выберите стадию'); return; }
    if (!hint.trim()) { setError('Заполните подсказку'); return; }

    const config =
      type === 'field'
        ? { column }
        : { min_count: Math.max(1, minCount), ...(label.trim() ? { label: label.trim() } : {}) };

    create.mutate(
      { pipeline_id: pipelineId, stage_id: stageId, requirement_type: type, config, error_hint: hint.trim() },
      {
        onSuccess: () => { setHint(''); setLabel(''); setStageId(''); },
        onError: (err) => setError(err instanceof Error ? err.message : 'Не удалось создать требование'),
      },
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2 border-t border-border pt-3">
      <p className="text-[11px] font-medium text-text-dim">Добавить требование</p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={stageId}
          onChange={(e) => setStageId(e.target.value)}
          className="min-w-[9rem] rounded-md border border-border bg-surface px-2 py-1.5 text-[12px] text-text-dim"
        >
          <option value="">Стадия входа…</option>
          {stageIds.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>

        <select
          value={type}
          onChange={(e) => setType(e.target.value as RequirementType)}
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-[12px] text-text-dim"
        >
          <option value="field">Поле сделки</option>
          <option value="file">Файл</option>
        </select>

        {type === 'field' ? (
          <select
            value={column}
            onChange={(e) => setColumn(e.target.value as GateFieldColumn)}
            className="rounded-md border border-border bg-surface px-2 py-1.5 text-[12px] text-text-dim"
          >
            {GATE_FIELD_COLUMNS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        ) : (
          <>
            <input
              type="number"
              min={1}
              value={minCount}
              onChange={(e) => setMinCount(parseInt(e.target.value, 10) || 1)}
              className="w-16 rounded-md border border-border bg-surface px-2 py-1.5 text-[12px] text-text-dim"
              title="Минимум файлов"
            />
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Метка (КП, Договор…)"
              className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-[12px] text-text-main placeholder:text-text-mute"
            />
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          placeholder="Подсказка: что сделать (например «Укажите бюджет сделки»)"
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
      {error && <p className="text-[11px] text-red">{error}</p>}
    </form>
  );
}

/**
 * Настройка стадийных гейтов (Sprint 27) — видно только owner/admin. Выбор
 * воронки → требования по стадиям (тип, конфиг, подсказка, is_active toggle,
 * удаление) + форма добавления. Whitelist полей — общий с SQL-функцией
 * (GATE_FIELD_COLUMNS). RLS подстраховывает: запись доступна только owner/admin.
 */
export function GatesSection() {
  const { data: role } = useOrgRole();
  const { data: pipelines = [] } = usePipelines();
  const { data: allStages = [] } = usePipelineStages();

  const [pipelineId, setPipelineId] = useState<string>('');
  const activePipelineId = pipelineId || pipelines[0]?.id || '';

  const { data: requirements = [] } = useStageRequirements(activePipelineId || null);
  const updateReq = useUpdateStageRequirement();
  const deleteReq = useDeleteStageRequirement();

  const stages = useMemo(
    () =>
      allStages
        .filter((s) => s.pipeline_id === activePipelineId)
        .sort((a, b) => a.order_index - b.order_index),
    [allStages, activePipelineId],
  );

  const stageName = useMemo(() => new Map(stages.map((s) => [s.id, s.name])), [stages]);
  const stageOrder = useMemo(() => new Map(stages.map((s) => [s.id, s.order_index])), [stages]);

  const sortedReqs = useMemo(
    () =>
      [...requirements].sort(
        (a, b) => (stageOrder.get(a.stage_id) ?? 0) - (stageOrder.get(b.stage_id) ?? 0),
      ),
    [requirements, stageOrder],
  );

  const canManage = role === 'owner' || role === 'admin';
  if (!canManage) return null;

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck size={14} className="text-text-dim" />
        <h2 className="text-xs font-semibold text-text-dim">Стадийные гейты</h2>
      </div>

      <p className="mb-3 text-[11px] text-text-mute">
        Требования на вход в стадию: сделку нельзя передвинуть, пока они не закрыты.
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

      {sortedReqs.length === 0 ? (
        <p className="py-2 text-center text-[12px] text-text-mute">
          Для этой воронки требования не заданы.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {sortedReqs.map((req) => (
            <div key={req.id} className="flex items-center gap-2 py-2">
              <span className="shrink-0 rounded-full border border-border bg-surface2 px-2 py-0.5 text-[10px] font-medium text-text-dim">
                {stageName.get(req.stage_id) ?? '—'}
              </span>
              <span className="shrink-0 text-[11px] text-text-mute">
                {req.requirement_type === 'field' ? 'Поле' : 'Файл'}
              </span>
              <span className="shrink-0 text-[11px] text-text-dim">{describeConfig(req)}</span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-text-main" title={req.error_hint}>
                {req.error_hint}
              </span>

              <button
                onClick={() => updateReq.mutate({ id: req.id, is_active: !req.is_active })}
                disabled={updateReq.isPending}
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  req.is_active
                    ? 'bg-accent-l text-accent'
                    : 'bg-surface2 text-text-mute'
                }`}
                title={req.is_active ? 'Активно — нажмите, чтобы выключить' : 'Выключено — нажмите, чтобы включить'}
              >
                {req.is_active ? 'вкл' : 'выкл'}
              </button>

              <button
                onClick={() => deleteReq.mutate(req.id)}
                disabled={deleteReq.isPending}
                className="shrink-0 p-1.5 text-text-mute transition-colors hover:text-text-main"
                aria-label="Удалить требование"
                title="Удалить требование"
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
          stageIds={stages.map((s) => ({ id: s.id, label: s.name }))}
        />
      )}
    </div>
  );
}
