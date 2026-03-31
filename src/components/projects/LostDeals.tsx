'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Undo2, Trash2, Building2, Calendar } from 'lucide-react';
import { STAGE_CONFIG, LOSS_REASON_CONFIG, formatBudget } from '@/lib/validators/project';
import type { Project } from '@/lib/hooks/use-projects';
import type { LossReason } from '@/lib/validators/project';

interface LostDealsProps {
  projects: Project[];
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (project: Project) => void;
}

export function LostDeals({ projects, onRestore, onDelete, onEdit }: LostDealsProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (projects.length === 0) return null;

  // Суммарный потерянный бюджет
  const totalLost = projects.reduce((sum, p) => sum + (p.budget ?? 0), 0);

  return (
    <div className="mt-6 rounded-xl border border-border/50 bg-surface/50">
      {/* Toggle header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left
                   transition-colors hover:bg-surface-hover"
      >
        {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className="text-sm font-medium text-text-dim">
          Проигранные сделки
        </span>
        <span className="rounded-full bg-red/10 px-2 py-0.5 text-xs font-medium text-red">
          {projects.length}
        </span>
        {totalLost > 0 && (
          <span className="ml-auto text-xs text-text-mute">
            {formatBudget(totalLost)}
          </span>
        )}
      </button>

      {/* Collapsible content */}
      {isOpen && (
        <div className="border-t border-border/50 p-4">
          <div className="space-y-2">
            {projects.map((project) => (
              <div
                key={project.id}
                className="group flex items-center gap-3 rounded-lg border border-border/50
                           bg-bg px-3 py-2.5 transition-colors hover:border-border"
              >
                {/* Info */}
                <div className="min-w-0 flex-1">
                  <button
                    onClick={() => onEdit(project)}
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
                    {project.loss_reason && (
                      <span className="rounded bg-red/10 px-1 py-px text-red">
                        {LOSS_REASON_CONFIG[project.loss_reason as LossReason]?.label ?? project.loss_reason}
                      </span>
                    )}
                    {project.updated_at && (
                      <span className="flex items-center gap-0.5">
                        <Calendar size={9} />
                        {new Date(project.updated_at).toLocaleDateString('ru-RU', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    )}
                  </div>
                  {project.loss_detail && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-text-dim italic">
                      {project.loss_detail}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => onRestore(project.id)}
                    className="rounded p-1.5 text-text-mute transition-colors
                               hover:bg-accent-l hover:text-accent"
                    title="Вернуть в воронку (→ new_lead)"
                  >
                    <Undo2 size={13} />
                  </button>
                  <button
                    onClick={() => onDelete(project.id)}
                    className="rounded p-1.5 text-text-mute transition-colors
                               hover:bg-red/10 hover:text-red"
                    title="Удалить навсегда"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
