'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Trophy, Rocket, Building2, Calendar } from 'lucide-react';
import { formatBudget, WON_REASON_CONFIG } from '@/lib/validators/project';
import type { WonReason } from '@/lib/validators/project';
import type { Project } from '@/lib/hooks/use-projects';

export function WonDeals({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  if (projects.length === 0) return null;

  const total = projects.reduce((sum, p) => sum + (p.budget ?? 0), 0);

  return (
    <div className="mt-4 rounded-xl border border-green/30 bg-green/5">
      {/* Toggle header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left
                   transition-colors hover:bg-green/10"
      >
        {isOpen
          ? <ChevronDown size={16} className="text-green" />
          : <ChevronRight size={16} className="text-green" />}
        <Trophy size={16} className="text-green" />
        <span className="text-sm font-semibold text-green">
          Выиграно: {projects.length}
        </span>
        {total > 0 && (
          <span className="ml-auto text-sm font-medium text-green tabular-nums">
            {formatBudget(total)}
          </span>
        )}
      </button>

      {/* Collapsible content */}
      {isOpen && (
        <div className="border-t border-green/20 p-4">
          <div className="space-y-2">
            {projects.map((project) => {
              const wonAt = project.actual_close_date ?? project.updated_at;
              return (
                <div
                  key={project.id}
                  className="group flex items-center gap-3 rounded-lg border border-border/50
                             bg-bg px-3 py-2.5 transition-colors hover:border-border"
                >
                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() => router.push(`/deals/${project.id}`)}
                      className="block truncate text-sm text-text-main
                                 transition-colors hover:text-accent"
                    >
                      {project.name}
                    </button>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-dim">
                      {project.company?.name && (
                        <span className="flex items-center gap-0.5">
                          <Building2 size={9} />
                          {project.company.name}
                        </span>
                      )}
                      {project.budget != null && (
                        <span>{formatBudget(project.budget)}</span>
                      )}
                      {project.won_reason && (
                        <span className="rounded bg-green/10 px-1 py-px text-green">
                          {WON_REASON_CONFIG[project.won_reason as WonReason]?.label ?? project.won_reason}
                        </span>
                      )}
                      {wonAt && (
                        <span className="flex items-center gap-0.5">
                          <Calendar size={9} />
                          {new Date(wonAt).toLocaleDateString('ru-RU', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      )}
                    </div>
                    {project.won_detail && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-text-dim italic">
                        {project.won_detail}
                      </p>
                    )}
                  </div>

                  {/* Spawn-диалог живёт на карточке won-сделки — просто переход */}
                  <button
                    onClick={() => router.push(`/deals/${project.id}`)}
                    className="flex shrink-0 items-center gap-1 rounded border border-accent/40
                               px-2 py-1 text-[11px] font-medium text-accent
                               transition-colors hover:bg-accent-l"
                  >
                    <Rocket size={11} /> Проект внедрения
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
