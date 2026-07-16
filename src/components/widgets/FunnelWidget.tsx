'use client';

import { useMemo } from 'react';
import { useProjects } from '@/lib/hooks/use-projects';
import { usePipelineStagesMap } from '@/lib/hooks/use-pipelines';
import { phases, PHASE_CONFIG, formatBudget, type Phase } from '@/lib/validators/project';

// Путь B: фаза воронки из phase_group стадии (stage_id → pipeline_stages), не legacy `stage`.
// 4 phase_group 1:1 ложатся на 4 легаси-фазы — визуал воронки не меняется.
const PHASE_GROUP_TO_PHASE: Record<string, Phase> = {
  attraction: 'attract',
  working: 'develop',
  approval: 'negotiate',
  closing: 'close',
};

export function FunnelWidget() {
  const { data: projects } = useProjects();
  const stagesMap = usePipelineStagesMap();

  const funnel = useMemo(() => {
    if (!projects) return [];
    const active = projects.filter((p) => p.type === 'client' && p.status !== 'won' && p.status !== 'lost');

    const phaseOf = (stageId: string | null): Phase | null => {
      const pg = stageId ? stagesMap.get(stageId)?.phase_group : null;
      return pg ? PHASE_GROUP_TO_PHASE[pg] ?? null : null;
    };

    return phases.map((phase) => {
      const items = active.filter((p) => phaseOf(p.stage_id) === phase);
      const budget = items.reduce((sum, p) => sum + (p.budget ?? 0), 0);
      return { phase, count: items.length, budget };
    });
  }, [projects, stagesMap]);

  const maxCount = Math.max(1, ...funnel.map((f) => f.count));
  const wonCount = (projects ?? []).filter((p) => p.type === 'client' && p.status === 'won').length;
  const wonBudget = (projects ?? []).filter((p) => p.type === 'client' && p.status === 'won').reduce((s, p) => s + (p.budget ?? 0), 0);

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h3 className="mb-3 text-xs font-semibold text-text-dim">Воронка сделок</h3>

      <div className="space-y-2">
        {funnel.map((f) => {
          const config = PHASE_CONFIG[f.phase];
          const widthPct = Math.max(8, (f.count / maxCount) * 100);

          return (
            <div key={f.phase} className="flex items-center gap-2">
              <span className="w-24 text-right text-xs text-text-dim">{config.label}</span>
              <div className="flex-1">
                <div
                  className={`h-6 rounded ${config.bgColor} flex items-center px-2 transition-all`}
                  style={{ width: `${widthPct}%` }}
                >
                  <span className={`text-[10px] font-semibold ${config.color}`}>
                    {f.count}
                  </span>
                </div>
              </div>
              <span className="w-16 text-right text-xs text-text-dim">
                {formatBudget(f.budget)}
              </span>
            </div>
          );
        })}

        {/* Won row */}
        <div className="mt-1 flex items-center gap-2 border-t border-border/50 pt-2">
          <span className="w-24 text-right text-[10px] font-medium text-green">Выиграно</span>
          <div className="flex-1">
            <span className="text-sm font-bold text-green">{wonCount}</span>
          </div>
          <span className="w-16 text-right text-[10px] font-medium text-green">
            {formatBudget(wonBudget)}
          </span>
        </div>
      </div>
    </div>
  );
}
