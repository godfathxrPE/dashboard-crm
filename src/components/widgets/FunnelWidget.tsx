'use client';

import { useMemo } from 'react';
import { useProjects } from '@/lib/hooks/use-projects';
import { phases, PHASE_CONFIG, STAGE_CONFIG, getPhaseForStage, formatBudget, type Phase } from '@/lib/validators/project';

export function FunnelWidget() {
  const { data: projects } = useProjects();

  const funnel = useMemo(() => {
    if (!projects) return [];
    const active = projects.filter((p) => p.stage !== 'won' && p.stage !== 'lost');

    return phases.map((phase) => {
      const items = active.filter((p) => getPhaseForStage(p.stage) === phase);
      const budget = items.reduce((sum, p) => sum + (p.budget ?? 0), 0);
      return { phase, count: items.length, budget };
    });
  }, [projects]);

  const maxCount = Math.max(1, ...funnel.map((f) => f.count));
  const wonCount = (projects ?? []).filter((p) => p.stage === 'won').length;
  const wonBudget = (projects ?? []).filter((p) => p.stage === 'won').reduce((s, p) => s + (p.budget ?? 0), 0);

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <h3 className="mb-3 text-xs font-semibold text-text-dim">Воронка проектов</h3>

      <div className="space-y-2">
        {funnel.map((f) => {
          const config = PHASE_CONFIG[f.phase];
          const widthPct = Math.max(8, (f.count / maxCount) * 100);

          return (
            <div key={f.phase} className="flex items-center gap-2">
              <span className="w-24 text-right text-[10px] text-text-mute">{config.label}</span>
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
              <span className="w-16 text-right text-[10px] text-text-mute">
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
