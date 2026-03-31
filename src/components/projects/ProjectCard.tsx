'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Trash2, ArrowRight } from 'lucide-react';
import { STAGE_CONFIG, formatBudget, getNextStage } from '@/lib/validators/project';
import type { Project } from '@/lib/hooks/use-projects';

// Phase colors for notch, glow, progress bar
const PHASE_COLOR: Record<string, string> = {
  attract: 'var(--blue)',
  develop: 'var(--accent)',
  negotiate: 'var(--yellow)',
  close: 'var(--green)',
};

const TOTAL_ACTIVE = 12;

// Inline SVG icons (no emoji, no img)
function IconCalendar() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <path d="M5.3 1.3v1.4M10.7 1.3v1.4M2 6.7h12M3.3 2.7h9.4c.7 0 1.3.6 1.3 1.3v9.3c0 .7-.6 1.3-1.3 1.3H3.3A1.3 1.3 0 012 13.3V4c0-.7.6-1.3 1.3-1.3z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconBuilding() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <path d="M2.7 14V3.3c0-.7.6-1.3 1.3-1.3h4c.7 0 1.3.6 1.3 1.3V14M9.3 6h2.7c.7 0 1.3.6 1.3 1.3V14M2 14h12.7M5.3 4.7h1.4M5.3 7.3h1.4M5.3 10h1.4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconContact() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0">
      <path d="M10.7 14v-1.3A2.7 2.7 0 008 10H4a2.7 2.7 0 00-2.7 2.7V14M6 7.3A2.7 2.7 0 106 2a2.7 2.7 0 000 5.3z" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function deadlineUrgency(deadline: string): { cls: string; pill: string } {
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
  if (days < 0) return { cls: 'text-red', pill: 'bg-red-l text-red' };
  if (days < 14) return { cls: 'text-red', pill: 'bg-red-l text-red' };
  if (days < 30) return { cls: 'text-yellow', pill: 'bg-yellow-l text-yellow' };
  return { cls: 'text-green', pill: 'bg-green-l text-green' };
}

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
  const phaseColor = PHASE_COLOR[stageConfig.phase] ?? 'var(--accent)';
  const progress = Math.round(((stageConfig.order + 1) / TOTAL_ACTIVE) * 100);

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        '--phase-color': phaseColor,
      } as React.CSSProperties}
      className={`
        group relative overflow-hidden rounded-md bg-surface p-3 glass-card
        shadow-card transition-all duration-fast
        hover:shadow-[0_0_0_1px_color-mix(in_srgb,var(--phase-color)_20%,transparent),0_4px_12px_color-mix(in_srgb,var(--phase-color)_8%,transparent)]
        ${isDragging ? 'opacity-50 shadow-lg rotate-1' : ''}
      `}
    >
      {/* Corner notch */}
      <div
        className="absolute top-0 right-0"
        style={{
          width: 0,
          height: 0,
          borderTop: `20px solid ${phaseColor}`,
          borderLeft: '20px solid transparent',
          borderTopRightRadius: 'inherit',
        }}
      />

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
        {/* Stage + probability */}
        <div className="mb-1 flex items-center gap-1.5">
          <span
            className="inline-block h-[5px] w-[5px] rounded-full"
            style={{ backgroundColor: phaseColor }}
          />
          <span className="text-[10px] font-medium uppercase tracking-wider text-text-mute">
            {stageConfig.shortLabel}
          </span>
          <span className="ml-auto text-[10px] text-text-mute">
            {stageConfig.probability}%
          </span>
        </div>

        {/* Name */}
        <button
          onClick={() => onOpen(project.id)}
          className="mb-1.5 block text-left text-sm font-medium text-text-main
                     transition-colors hover:text-accent"
        >
          {project.name}
        </button>

        {/* Company */}
        {project.company?.name && (
          <div className="mb-0.5 flex items-center gap-1 text-xs text-text-dim">
            <IconBuilding />
            {project.company.name}
          </div>
        )}

        {/* Contact */}
        {project.contact && (
          <div className="mb-0.5 flex items-center gap-1 text-xs text-text-dim">
            <IconContact />
            {project.contact.first_name} {project.contact.last_name}
          </div>
        )}

        {/* Budget */}
        {project.budget != null && project.budget > 0 && (
          <div className="mt-1 text-sm font-medium text-text-main tabular-nums">
            {formatBudget(project.budget)}
          </div>
        )}

        {/* Deadline */}
        {project.deadline && (() => {
          const urg = deadlineUrgency(project.deadline);
          const dateStr = new Date(project.deadline).toLocaleDateString('ru-RU', {
            day: 'numeric', month: 'short',
          });
          return (
            <div className="mt-1 flex items-center gap-1.5">
              <span className={`flex items-center gap-1 text-xs ${urg.cls}`}>
                <IconCalendar />
                {dateStr}
              </span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${urg.pill}`}>
                {(() => {
                  const d = Math.ceil((new Date(project.deadline!).getTime() - Date.now()) / 86400000);
                  if (d < 0) return `${Math.abs(d)}д просрочено`;
                  if (d === 0) return 'Сегодня';
                  return `${d}д`;
                })()}
              </span>
            </div>
          );
        })()}

        {/* Next step */}
        {project.next_step && (
          <p className="mt-1 line-clamp-1 text-xs text-text-mute">
            → {project.next_step}
          </p>
        )}

        {/* Actions — hover only */}
        <div className="mt-2 flex items-center gap-1 border-t border-border/50 pt-1.5
                        opacity-0 transition-opacity group-hover:opacity-100">
          {nextStage && project.stage !== 'won' && project.stage !== 'lost' && (
            <button
              onClick={() => onAdvance(project.id)}
              className="flex items-center gap-0.5 rounded px-1.5 py-0.5
                         text-[10px] font-medium text-accent transition-colors hover:bg-accent-l"
            >
              <ArrowRight size={10} />
              {STAGE_CONFIG[nextStage].shortLabel}
            </button>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => onEdit(project)}
              className="rounded p-1 text-text-mute transition-colors hover:bg-surface-hover hover:text-text-main"
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={() => onDelete(project.id)}
              className="rounded p-1 text-text-mute transition-colors hover:bg-red/10 hover:text-red"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {project.stage !== 'won' && project.stage !== 'lost' && (
        <div
          className="stage-progress mt-2"
          style={{
            background: `linear-gradient(to right, ${phaseColor} ${progress}%, var(--border) 0%)`,
          }}
        />
      )}
    </div>
  );
}
