'use client';

import { useMemo } from 'react';
import { Check, Circle, ListChecks, Loader2 } from 'lucide-react';
import { usePipelineStages } from '@/lib/hooks/use-pipelines';
import { useStageRequirements } from '@/lib/hooks/use-stage-requirements';
import { useStageGate } from '@/lib/hooks/use-stage-gate';
import type { Project } from '@/lib/hooks/use-projects';
import type { StageRequirementConfig } from '@/types/database';

/** Стабильный ключ требования — тип + config (порядок ключей нормализован). */
function reqKey(type: string, config: StageRequirementConfig): string {
  return `${type}:${JSON.stringify(config, Object.keys(config).sort())}`;
}

/**
 * «Готовность к следующей стадии» — чек-лист требований следующей по order_index
 * стадии (Sprint 27). Полный набор — из useStageRequirements; невыполненные —
 * из useStageGate (та же SECURITY DEFINER проверка, что и enforcement-триггер).
 * Ничего не рендерит, если следующей стадии нет или у неё нет активных требований.
 */
export function StageReadiness({ project }: { project: Project }) {
  const { data: allStages } = usePipelineStages();
  const { data: requirements } = useStageRequirements(project.pipeline_id);

  const nextStage = useMemo(() => {
    if (!allStages) return null;
    const current = allStages.find((s) => s.id === project.stage_id);
    if (!current) return null;
    return (
      allStages
        .filter(
          (s) =>
            s.pipeline_id === project.pipeline_id &&
            s.order_index > current.order_index &&
            !s.is_won &&
            !s.is_lost,
        )
        .sort((a, b) => a.order_index - b.order_index)[0] ?? null
    );
  }, [allStages, project.pipeline_id, project.stage_id]);

  const stageReqs = useMemo(
    () =>
      (requirements ?? []).filter((r) => r.stage_id === nextStage?.id && r.is_active),
    [requirements, nextStage?.id],
  );

  const { data: unmet, isLoading: gateLoading } = useStageGate(
    stageReqs.length > 0 ? project.id : null,
    nextStage?.id ?? null,
  );

  const unmetKeys = useMemo(
    () => new Set((unmet ?? []).map((u) => reqKey(u.type, u.config))),
    [unmet],
  );

  if (!nextStage || stageReqs.length === 0) return null;

  return (
    <div data-card className="mb-6 rounded-lg border border-border/60 bg-surface p-4">
      <div className="mb-2.5 flex items-center gap-2">
        <ListChecks size={14} className="text-text-dim" />
        <h3 className="text-xs font-semibold text-text-dim">
          Готовность к стадии «{nextStage.name}»
        </h3>
        {gateLoading && <Loader2 size={12} className="animate-spin text-text-mute" />}
      </div>

      <ul className="space-y-1.5">
        {stageReqs.map((req) => {
          const met = !unmetKeys.has(reqKey(req.requirement_type, req.config));
          return (
            <li key={req.id} className="flex items-start gap-2 text-[13px]">
              {met ? (
                <Check size={14} className="mt-0.5 shrink-0 text-green" />
              ) : (
                <Circle size={14} className="mt-0.5 shrink-0 text-text-mute" />
              )}
              <span className={met ? 'text-text-dim line-through' : 'text-text-main'}>
                {req.error_hint}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
