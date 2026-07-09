'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Trash2, ArrowRight, AlertTriangle } from 'lucide-react';
import { STAGE_CONFIG, formatBudget } from '@/lib/validators/project';
import { useThemeStore } from '@/lib/stores/theme-store';
import { calculateDealHealth, getDealHealth, getNextActionOverdueDays } from '@/lib/utils/deal-health';
import { HealthDot } from '@/components/shared/HealthDot';
import type { Project } from '@/lib/hooks/use-projects';
import { usePipelineStages } from '@/lib/hooks/use-pipelines';
import { Badge } from '@/components/ui/Badge';

// Phase group → color (keyed by phase_group from pipeline_stages)
const PHASE_COLOR: Record<string, string> = {
  attract: 'var(--track-prep-current)',
  develop: 'var(--track-exp-current)',
  negotiate: 'var(--track-nego-current, var(--track-exp-current))',
  close: 'var(--track-proj-current)',
  // pipeline_stages phase_group values
  attraction: 'var(--track-prep-current)',
  working: 'var(--track-exp-current)',
  approval: 'var(--track-nego-current, var(--track-exp-current))',
  closing: 'var(--track-proj-current)',
};

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

  const isScandi = useThemeStore((s) => s.theme) === 't-scandi';
  const { data: allPipelineStages } = usePipelineStages();
  const health = calculateDealHealth(project);

  // Resolve stage info from pipeline_stages (primary) or legacy STAGE_CONFIG (fallback)
  const pipelineStage = allPipelineStages?.find((s) => s.id === project.stage_id);
  const pipelineSiblings = allPipelineStages?.filter((s) => s.pipeline_id === project.pipeline_id && !s.is_won && !s.is_lost) ?? [];
  const totalActive = pipelineSiblings.length || 12;

  const stageLabel = pipelineStage?.name
    ?? (project.stage ? STAGE_CONFIG[project.stage]?.shortLabel : null)
    ?? '—';
  const stageProbability = pipelineStage?.probability
    ?? (project.stage ? STAGE_CONFIG[project.stage]?.probability : null)
    ?? 0;
  const phaseColor = PHASE_COLOR[pipelineStage?.phase_group ?? '']
    ?? (project.stage ? PHASE_COLOR[STAGE_CONFIG[project.stage]?.phase ?? ''] : null)
    ?? 'var(--accent)';
  const progress = pipelineStage
    ? Math.round((pipelineStage.order_index / totalActive) * 100)
    : project.stage ? Math.round(((STAGE_CONFIG[project.stage]?.order ?? 0) + 1) / 12 * 100) : 0;

  const isTerminal = pipelineStage?.is_won || pipelineStage?.is_lost
    || project.status === 'won' || project.status === 'lost';

  // Scandi: visual weight based on progress
  const scandiWeight = progress >= 70 ? 3 : progress >= 40 ? 2 : 1;

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        '--phase-color': phaseColor,
        borderLeft: isScandi ? `${scandiWeight}px solid var(--text)` : undefined,
      } as React.CSSProperties}
      className={`
        group relative overflow-hidden rounded-md bg-surface p-3 glass-card
        elevation-hover
        hover:shadow-[0_0_0_1px_color-mix(in_srgb,var(--phase-color)_20%,transparent),var(--elevation-2)]
        ${isDragging ? 'opacity-50 elevation-2 rotate-1' : ''}
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
            {stageLabel}
          </span>
          {/* Возраст в стадии (stage_entered_at, миграция 019) — сигнал застревания */}
          {!isTerminal && project.stage_entered_at && (() => {
            const d = Math.floor((Date.now() - new Date(project.stage_entered_at).getTime()) / 86400000);
            if (d < 1) return null;
            return (
              <span
                className="text-[10px] tabular-nums"
                style={d > 30 ? { color: 'var(--red-text, var(--red))' } : { color: 'var(--text-mute)' }}
                title="Дней в текущей стадии"
              >
                · {d} дн.
              </span>
            );
          })()}
          <span className="ml-auto flex items-center gap-1.5">
            <HealthDot level={health.level} score={health.total} />
            <span className="text-[10px] text-text-mute">{stageProbability}%</span>
          </span>
        </div>

        {/* Name + direction badge */}
        <div className="mb-1.5 flex items-center gap-1.5">
          <button
            onClick={() => onOpen(project.id)}
            className="block text-left text-sm text-text-main transition-colors hover:text-accent truncate"
            style={{ fontWeight: isScandi ? (scandiWeight >= 3 ? 600 : scandiWeight >= 2 ? 500 : 400) : 500 }}
          >
            {project.name}
          </button>
          {project.type === 'internal' ? (
            <Badge color="accent" size="sm">Внутр.</Badge>
          ) : (
            <Badge color={project.direction === 'erp' ? 'purple' : 'blue'} size="sm">
              {project.direction === 'iiot' ? 'IIoT' : 'ERP'}
            </Badge>
          )}
        </div>

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
        {project.budget != null && project.budget > 0 ? (
          <div className="mt-1 text-sm font-medium text-text-main tabular-nums">
            {formatBudget(project.budget)}
          </div>
        ) : (
          <div className="mt-1 flex items-center gap-1 text-yellow" title="Бюджет не указан">
            <AlertTriangle size={11} />
            <span className="text-[10px]">Бюджет</span>
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

        {/* Next step + rotting indicator (Sprint W1a) */}
        {(() => {
          const dh = getDealHealth(project);
          if (dh === 'no-action') {
            return (
              <div
                className="mt-1 flex items-center gap-1.5"
                style={{ color: 'var(--yellow-text, var(--yellow))' }}
              >
                {/* контурная точка — «нет действия» */}
                <span className="inline-block h-[6px] w-[6px] shrink-0 rounded-full border border-current" />
                <span className="text-xs">
                  {project.next_step?.trim() ? 'нет даты шага' : 'нет следующего шага'}
                </span>
              </div>
            );
          }
          if (dh === 'overdue-action') {
            const days = getNextActionOverdueDays(project.next_action_date!);
            return (
              <div
                className="mt-1 flex items-center gap-1.5"
                style={{ color: 'var(--red-text, var(--red))' }}
              >
                {/* заполненная точка — «просрочено» */}
                <span className="inline-block h-[6px] w-[6px] shrink-0 rounded-full bg-current" />
                <span className="text-xs">шаг просрочен {days} дн.</span>
              </div>
            );
          }
          // ok — как раньше, плюс дата шага мелким
          if (!project.next_step) return null;
          return (
            <div className="mt-1">
              <p className="line-clamp-1 text-xs text-text-mute">→ {project.next_step}</p>
              {project.next_action_date && (
                <p className="text-[10px] tabular-nums text-text-mute">
                  {new Date(project.next_action_date).toLocaleDateString('ru-RU', {
                    day: 'numeric', month: 'short',
                  })}
                </p>
              )}
            </div>
          );
        })()}

        {/* Actions — hover only */}
        <div className="mt-2 flex items-center gap-1 border-t border-border/50 pt-1.5
                        opacity-0 transition-opacity group-hover:opacity-100">
          {!isTerminal && (() => {
            const next = pipelineStage
              ? pipelineSiblings.find((s) => s.order_index === pipelineStage.order_index + 1)
              : null;
            if (!next) return null;
            return (
              <button
                onClick={() => onAdvance(project.id)}
                className="flex items-center gap-0.5 rounded px-1.5 py-0.5
                           text-[10px] font-medium text-accent transition-colors hover:bg-accent-l"
              >
                <ArrowRight size={10} />
                {next.name}
              </button>
            );
          })()}
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => onEdit(project)}
              aria-label="Редактировать"
              className="rounded p-1 text-text-mute transition-colors hover:bg-surface-hover hover:text-text-main"
            >
              <Pencil size={12} />
            </button>
            <button
              onClick={() => onDelete(project.id)}
              aria-label="Удалить"
              className="rounded p-1 text-text-mute transition-colors hover:bg-red/10 hover:text-red"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {!isTerminal && (
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
