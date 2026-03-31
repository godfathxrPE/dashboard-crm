'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical,
  Pencil,
  Trash2,
  ArrowRight,
  Building2,
  Calendar,
  Banknote,
  ChevronRight,
} from 'lucide-react';
import { STAGE_CONFIG, formatBudget, getNextStage, type DealStage } from '@/lib/validators/project';
import type { Project } from '@/lib/hooks/use-projects';

const PHASE_BORDER: Record<string, string> = {
  attract: 'phase-attract',
  develop: 'phase-develop',
  negotiate: 'phase-negotiate',
  close: 'phase-close',
};

const PHASE_BAR_COLOR: Record<string, string> = {
  attract: 'var(--blue)',
  develop: 'var(--accent)',
  negotiate: 'var(--yellow)',
  close: 'var(--green)',
};

const TOTAL_ACTIVE_STAGES = 12; // excluding won/lost

interface ProjectCardProps {
  project: Project;
  onEdit: (project: Project) => void;
  onDelete: (id: string) => void;
  onAdvance: (id: string) => void;
  onOpen: (id: string) => void;
}

export function ProjectCard({
  project,
  onEdit,
  onDelete,
  onAdvance,
  onOpen,
}: ProjectCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const stageConfig = STAGE_CONFIG[project.stage];
  const nextStage = getNextStage(project.stage);
  const isOverdue =
    project.deadline && new Date(project.deadline) < new Date();

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        group relative rounded-lg bg-surface p-3 glass-card
        shadow-card transition-all duration-fast hover:shadow-card-hover hover:-translate-y-px
        ${PHASE_BORDER[stageConfig.phase] ?? ''}
        ${isDragging ? 'opacity-50 shadow-lg ring-2 ring-accent/30 rotate-1' : ''}
      `}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="absolute left-1 top-1/2 -translate-y-1/2 cursor-grab
                   text-text-mute opacity-0 transition-opacity
                   group-hover:opacity-100 active:cursor-grabbing"
        aria-label="Перетащить"
      >
        <GripVertical size={14} />
      </button>

      <div className="pl-4">
        {/* Stage badge */}
        <div className="mb-1.5 flex items-center gap-1.5">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: `var(--color-accent)` }}
          />
          <span className="text-[10px] font-medium uppercase tracking-wider text-text-mute">
            {stageConfig.shortLabel}
          </span>
          <span className="ml-auto text-[10px] text-text-mute">
            {stageConfig.probability}%
          </span>
        </div>

        {/* Name — clickable to open detail */}
        <button
          onClick={() => onOpen(project.id)}
          className="mb-2 block text-left text-sm font-medium text-text-main
                     transition-colors hover:text-accent"
        >
          {project.name}
        </button>

        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-mute">
          {project.company?.name && (
            <span className="flex items-center gap-1">
              <Building2 size={11} />
              {project.company.name}
            </span>
          )}
          {project.budget != null && (
            <span className="flex items-center gap-1">
              <Banknote size={11} />
              {formatBudget(project.budget)}
            </span>
          )}
          {project.deadline && (
            <span
              className={`flex items-center gap-1 ${
                isOverdue ? 'font-medium text-red' : ''
              }`}
            >
              <Calendar size={11} />
              {new Date(project.deadline).toLocaleDateString('ru-RU', {
                day: 'numeric',
                month: 'short',
              })}
            </span>
          )}
        </div>

        {/* Next step preview */}
        {project.next_step && (
          <p className="mt-1.5 line-clamp-1 text-[11px] text-text-dim">
            <ChevronRight size={10} className="mr-0.5 inline" />
            {project.next_step}
          </p>
        )}

        {/* Action buttons — visible on hover */}
        <div
          className="mt-2 flex items-center gap-1 border-t border-border/50 pt-2
                      opacity-0 transition-opacity group-hover:opacity-100"
        >
          {/* Advance to next stage */}
          {nextStage && project.stage !== 'won' && project.stage !== 'lost' && (
            <button
              onClick={() => onAdvance(project.id)}
              className="flex items-center gap-0.5 rounded px-1.5 py-0.5
                         text-[10px] font-medium text-accent
                         transition-colors hover:bg-accent-l"
              title={`Перевести → ${STAGE_CONFIG[nextStage].shortLabel}`}
            >
              <ArrowRight size={10} />
              {STAGE_CONFIG[nextStage].shortLabel}
            </button>
          )}

          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => onEdit(project)}
              className="rounded p-1 text-text-mute transition-colors hover:bg-surface-hover hover:text-text-main"
              title="Редактировать"
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={() => onDelete(project.id)}
              className="rounded p-1 text-text-mute transition-colors hover:bg-red/10 hover:text-red"
              title="Удалить"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* Stage progress bar */}
      {project.stage !== 'won' && project.stage !== 'lost' && (
        <div
          className="stage-progress mt-2"
          style={{
            background: `linear-gradient(to right, ${PHASE_BAR_COLOR[stageConfig.phase] ?? 'var(--accent)'} ${Math.round(((stageConfig.order + 1) / TOTAL_ACTIVE_STAGES) * 100)}%, var(--border) 0%)`,
          }}
        />
      )}
    </div>
  );
}
