'use client';

import { useRouter } from 'next/navigation';
import { useState, useMemo } from 'react';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  ArrowRight,
  Building2,
  User,
  Calendar,
  Banknote,
  ChevronRight,
  CheckSquare,
  Phone,
  Users,
  Plus,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Clock,
  MapPin,
  MessageSquare,
  ArrowRightLeft,
  Send,
} from 'lucide-react';
import {
  useProject,
  useUpdateProject,
  useDeleteProject,
  useMoveProject,
  type Project,
} from '@/lib/hooks/use-projects';
import { mapToLegacyStage } from '@/lib/utils/stage-mapping';
import { useTasks } from '@/lib/hooks/use-tasks';
import { useCalls, type Call } from '@/lib/hooks/use-calls';
import { useMeetings, type Meeting } from '@/lib/hooks/use-meetings';
import {
  STAGE_CONFIG,
  dealStages,
  getNextStage,
  getPrevStage,
  formatBudget,
  parseBudgetInput,
  type DealStage,
} from '@/lib/validators/project';
import { StackedPipeline } from './StackedPipeline';
import { DealProgressBar } from './DealProgressBar';
import { ProjectFiles } from './ProjectFiles';
import { useThemeStore } from '@/lib/stores/theme-store';
import { InlineEdit } from '@/components/ui/InlineEdit';
import { LANE_CONFIG, PRIORITY_CONFIG } from '@/lib/validators/task';
import { CALL_STATUS_CONFIG, formatDuration } from '@/lib/validators/call';
import { ProjectModal } from './ProjectModal';
import { TaskModal } from '@/components/tasks/TaskModal';
import { CallModal } from '@/components/calls/CallModal';
import { MeetingModal } from '@/components/meetings/MeetingModal';
import { useActivityLog, useLogActivity } from '@/lib/hooks/use-activity-log';
import { calculateDealHealth } from '@/lib/utils/deal-health';
import { HealthDot } from '@/components/shared/HealthDot';
import { Badge } from '@/components/ui/Badge';
import { usePipelineStages } from '@/lib/hooks/use-pipelines';
import type { Task, ActivityLog } from '@/types/entities';


// ═══════════════════════════════════════════════════════
// Data Completeness
// ═══════════════════════════════════════════════════════

function getProjectCompleteness(project: Project) {
  const fields = [
    { key: 'name', label: 'Название', filled: !!project.name },
    { key: 'company_id', label: 'Компания', filled: !!project.company_id },
    { key: 'contact_id', label: 'Контакт', filled: !!project.contact_id },
    { key: 'budget', label: 'Бюджет', filled: !!project.budget && project.budget > 0 },
    { key: 'deadline', label: 'Дедлайн', filled: !!project.deadline },
    { key: 'stage', label: 'Стадия', filled: !!project.stage },
    { key: 'next_step', label: 'Следующий шаг', filled: !!project.next_step },
  ];
  const filled = fields.filter((f) => f.filled).length;
  return { filled, total: fields.length, fields };
}

function CompletenessBadge({ project }: { project: Project }) {
  const { filled, total, fields } = getProjectCompleteness(project);
  const [open, setOpen] = useState(false);
  const missing = fields.filter((f) => !f.filled);

  const colorClass = filled === total
    ? 'bg-green-l text-green'
    : filled >= 4
    ? 'bg-yellow-l text-yellow'
    : 'bg-red-l text-red';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${colorClass}`}
      >
        {filled}/{total}
      </button>
      {open && missing.length > 0 && (
        <div className="absolute left-0 top-full z-10 mt-1 w-44 rounded-lg border border-border bg-surface p-2 elevation-2">
          <p className="mb-1 text-[10px] font-medium text-text-mute">Не заполнено:</p>
          {missing.map((f) => (
            <div key={f.key} className="text-xs text-text-dim py-0.5">{f.label}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Stage Progress Bar
// ═══════════════════════════════════════════════════════

function StageProgress({ currentStage }: { currentStage: DealStage }) {
  const currentOrder = STAGE_CONFIG[currentStage].order;
  const activeStages = dealStages.filter((s) => s !== 'won' && s !== 'lost');

  return (
    <div className="flex gap-0.5 overflow-x-auto pb-1">
      {activeStages.map((stage) => {
        const config = STAGE_CONFIG[stage];
        const isCurrent = stage === currentStage;
        const isPast = config.order < currentOrder;
        const isWon = currentStage === 'won';

        return (
          <div key={stage} className="flex-1 text-center" title={config.label}>
            <div
              className={`h-1.5 rounded-full transition-colors ${
                isWon || isPast ? 'bg-green' : isCurrent ? 'bg-accent' : 'bg-border'
              }`}
            />
            <span
              className={`mt-1 block text-xs leading-tight ${
                isCurrent ? 'font-semibold text-accent' : isPast ? 'text-green' : 'text-text-mute'
              }`}
            >
              {config.shortLabel}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Compact cards for related entities
// ═══════════════════════════════════════════════════════

function TaskMiniCard({ task }: { task: Task }) {
  const lane = LANE_CONFIG[task.lane];
  const prio = PRIORITY_CONFIG[task.priority];

  return (
    <div className={`rounded-lg border border-border/50 bg-bg px-3 py-2 ${prio.badge}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[14px] ${task.lane === 'done' ? 'line-through text-text-mute' : 'text-text-main'}`}>
          {task.text}
        </span>
        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${lane.bg} ${lane.color}`}>
          {lane.label}
        </span>
      </div>
      {task.deadline && (
        <div className="mt-1 flex items-center gap-1 text-xs text-text-dim">
          <Clock size={9} />
          {new Date(task.deadline).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
    </div>
  );
}

function CallMiniCard({ call }: { call: Call }) {
  const status = CALL_STATUS_CONFIG[call.status];

  return (
    <div className="rounded-lg border border-border/50 bg-bg px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Phone size={11} className="text-text-mute" />
          <span className="text-sm text-text-main">
            {call.contact
              ? `${call.contact.first_name} ${call.contact.last_name}`
              : call.company?.name ?? 'Звонок'}
          </span>
        </div>
        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${status.bg} ${status.color}`}>
          {status.label}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-text-dim">
        <span>{new Date(call.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
        {call.duration_s != null && call.duration_s > 0 && (
          <span>{formatDuration(call.duration_s)}</span>
        )}
      </div>
      {call.agreements && (
        <p className="mt-1 line-clamp-1 text-xs text-text-dim">{call.agreements}</p>
      )}
    </div>
  );
}

function MeetingMiniCard({ meeting }: { meeting: Meeting }) {
  return (
    <div className="rounded-lg border border-border/50 bg-bg px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Users size={11} className="text-text-mute" />
          <span className="text-sm text-text-main">{meeting.title}</span>
        </div>
      </div>
      <div className="mt-1 flex items-center gap-2 text-xs text-text-dim">
        <span>
          {new Date(meeting.date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
        </span>
        {meeting.time && <span>{meeting.time.slice(0, 5)}</span>}
        {meeting.location && (
          <span className="flex items-center gap-0.5">
            <MapPin size={8} />
            {meeting.location}
          </span>
        )}
      </div>
      {meeting.notes && (
        <p className="mt-1 line-clamp-1 text-xs text-text-dim">{meeting.notes}</p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Activity Timeline
// ═══════════════════════════════════════════════════════

const EVENT_ICON: Record<string, typeof ArrowRightLeft> = {
  stage_change: ArrowRightLeft,
  call_logged: Phone,
  task_created: CheckSquare,
  task_completed: CheckSquare,
  meeting_scheduled: Calendar,
  project_updated: Pencil,
  comment_added: MessageSquare,
};

const EVENT_COLOR: Record<string, string> = {
  stage_change: 'text-blue',
  call_logged: 'text-green',
  task_created: 'text-purple',
  task_completed: 'text-purple',
  meeting_scheduled: 'text-yellow',
  project_updated: 'text-text-dim',
  comment_added: 'text-text-mute',
};

function stageName(key: unknown): string {
  const s = String(key);
  return (STAGE_CONFIG as Record<string, { shortLabel: string }>)[s]?.shortLabel ?? s;
}

function describeEvent(entry: ActivityLog): string {
  const p = entry.payload as Record<string, unknown>;
  switch (entry.event_type) {
    case 'stage_change':
      return `Стадия: ${stageName(p.from)} → ${stageName(p.to)}`;
    case 'call_logged':
      return p.contact_name ? `Звонок: ${p.contact_name}` : 'Звонок записан';
    case 'task_created':
      return `Задача: ${p.title ?? ''}`;
    case 'task_completed':
      return `Выполнено: ${p.title ?? ''}`;
    case 'meeting_scheduled':
      return `Встреча: ${p.title ?? ''} (${p.date ?? ''})`;
    case 'project_updated': {
      const fields = p.fields_changed as string[] | undefined;
      return fields ? `Обновлено: ${fields.join(', ')}` : 'Проект обновлён';
    }
    case 'comment_added':
      return (p.text as string) ?? 'Комментарий';
    default:
      return entry.event_type;
  }
}

function relativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins}м назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}ч назад`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}д назад`;
  return new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function ActivityTimeline({ projectId }: { projectId: string }) {
  const { data: entries = [] } = useActivityLog(projectId);
  const logMutation = useLogActivity();
  const [comment, setComment] = useState('');

  function handleAddComment() {
    const text = comment.trim();
    if (!text) return;
    logMutation.mutate(
      { project_id: projectId, event_type: 'comment_added', payload: { text } },
      { onSuccess: () => setComment('') },
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <Clock size={14} className="text-text-dim" />
        <span className="text-xs font-semibold text-text-main">Хронология</span>
        <span className="rounded-full bg-bg px-1.5 py-0.5 text-[10px] text-text-mute">
          {entries.length}
        </span>
      </div>

      {/* Comment form */}
      <div className="mb-4 flex gap-2">
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Добавить комментарий..."
          rows={1}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddComment(); }
          }}
          className="flex-1 resize-none rounded-lg border border-border bg-bg px-3 py-1.5
                     text-sm text-text-main placeholder:text-text-mute
                     focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="button"
          onClick={handleAddComment}
          disabled={!comment.trim() || logMutation.isPending}
          className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white
                     transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Send size={14} />
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-text-mute italic">Пока нет событий</p>
      ) : (
        <div className="space-y-0">
          {entries.map((entry, idx) => {
            const Icon = EVENT_ICON[entry.event_type] ?? MessageSquare;
            const color = EVENT_COLOR[entry.event_type] ?? 'text-text-mute';
            const isLast = idx === entries.length - 1;

            return (
              <div key={entry.id} className="flex gap-3">
                {/* Vertical line + icon */}
                <div className="flex flex-col items-center">
                  <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-bg ${color}`}>
                    <Icon size={12} />
                  </div>
                  {!isLast && <div className="w-px flex-1 bg-border" />}
                </div>
                {/* Content */}
                <div className={`pb-4 ${isLast ? '' : ''}`}>
                  <p className="text-xs text-text-dim leading-relaxed">
                    {describeEvent(entry)}
                  </p>
                  <span className="text-xs text-text-mute">
                    {relativeTime(entry.created_at)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Main Detail View
// ═══════════════════════════════════════════════════════

interface ProjectDetailProps {
  projectId: string;
}

export function ProjectDetail({ projectId }: ProjectDetailProps) {
  const router = useRouter();
  const { data: project, isLoading, error } = useProject(projectId);
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const { moveToStageId } = useMoveProject();
  const isScandi = useThemeStore((s) => s.theme) === 't-scandi';

  const { data: allTasks = [] } = useTasks();
  const { data: allCalls = [] } = useCalls();
  const { data: allMeetings = [] } = useMeetings();
  const { data: allPipelineStages } = usePipelineStages();

  const [modalOpen, setModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);

  // Filter related entities
  const projectTasks = useMemo(
    () => allTasks.filter((t) => t.project_id === projectId)
        .sort((a, b) => {
          // Active first, then by created_at desc
          if ((a.lane === 'done') !== (b.lane === 'done')) return a.lane === 'done' ? 1 : -1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }),
    [allTasks, projectId],
  );

  const projectCalls = useMemo(
    () => allCalls.filter((c) => c.project_id === projectId)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [allCalls, projectId],
  );

  const projectMeetings = useMemo(
    () => allMeetings.filter((m) => m.project_id === projectId)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [allMeetings, projectId],
  );

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 size={24} className="animate-spin text-accent" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="rounded-xl border border-red/30 bg-red/5 p-8 text-center">
        <AlertCircle size={24} className="mx-auto text-red" />
        <p className="mt-2 text-sm text-red">Проект не найден</p>
        <button
          onClick={() => router.push('/projects')}
          className="mt-3 text-xs text-accent hover:underline"
        >
          ← Вернуться к воронке
        </button>
      </div>
    );
  }

  const stageConfig = project.stage ? STAGE_CONFIG[project.stage] : null;
  const nextStage = project.stage ? getNextStage(project.stage) : null;
  const prevStage = project.stage ? getPrevStage(project.stage) : null;

  function handleAdvance() {
    if (!project) return;
    if (nextStage) {
      updateProject.mutate({ id: project.id, stage: nextStage });
    }
  }

  function handleRevert() {
    if (!project) return;
    if (prevStage) {
      updateProject.mutate({ id: project.id, stage: prevStage });
    }
  }

  function handleDelete() {
    if (!project) return;
    if (confirm('Удалить проект? Связанные задачи сохранятся. Это действие нельзя отменить.')) {
      deleteProject.mutate(project.id, {
        onSuccess: () => router.push('/projects'),
      });
    }
  }

  return (
    <>
      {/* Back navigation */}
      <button
        onClick={() => router.push('/projects')}
        className="mb-4 flex items-center gap-1 text-xs text-text-mute
                   transition-colors hover:text-accent"
      >
        <ArrowLeft size={14} />
        Воронка проектов
      </button>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-text-main">{project.name}</h1>
            <Badge color={project.direction === 'erp' ? 'purple' : 'blue'} size="sm">
              {project.direction === 'iiot' ? 'IIoT' : 'ERP'}
            </Badge>
            <HealthDot level={calculateDealHealth(project).level} score={calculateDealHealth(project).total} size="md" showLabel />
            <CompletenessBadge project={project} />
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-text-mute">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${stageConfig && stageConfig.probability > 50 ? 'bg-green/10 text-green' : 'bg-accent-l text-accent'}`}>
              {(() => {
                const pStage = allPipelineStages?.find((s) => s.id === project.stage_id);
                if (pStage) return `${pStage.name} · ${pStage.probability ?? 0}%`;
                if (stageConfig) return `${stageConfig.label} · ${stageConfig.probability}%`;
                return '—';
              })()}
            </span>
            <span>
              Создан {new Date(project.created_at).toLocaleDateString('ru-RU')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setModalOpen(true)}
            aria-label="Редактировать"
            className="rounded-lg border border-border p-1.5 text-text-mute
                       transition-colors hover:bg-surface-hover hover:text-text-main"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={handleDelete}
            aria-label="Удалить"
            className="rounded-lg border border-border p-1.5 text-text-mute
                       transition-colors hover:bg-red/10 hover:text-red"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Deal Progress Bar — universal, from pipeline_stages */}
      {project.pipeline_id && project.stage_id && (
        <div className="mb-4">
          <DealProgressBar
            pipelineId={project.pipeline_id}
            currentStageId={project.stage_id}
            readOnly={project.status === 'won' || project.status === 'lost'}
            onStageClick={(newStageId) => {
              if (!allPipelineStages) return;
              const currentStageObj = allPipelineStages.find((s) => s.id === project.stage_id);
              const targetStageObj = allPipelineStages.find((s) => s.id === newStageId);
              if (!currentStageObj || !targetStageObj) return;
              if (targetStageObj.order_index === currentStageObj.order_index) return;

              // Confirm on backward move
              if (targetStageObj.order_index < currentStageObj.order_index) {
                if (!confirm(`Вернуть сделку на стадию «${targetStageObj.name}»?`)) return;
              }

              const legacyStage = mapToLegacyStage(targetStageObj, project.direction);
              moveToStageId(project.id, newStageId, legacyStage);
            }}
          />
        </div>
      )}

      {/* 3-Track Pipeline — IIoT only (legacy sub-detail view) */}
      {project.direction === 'iiot' && project.stage && (
        <div className="mb-6">
          <StackedPipeline
            currentStage={project.stage}
            onStageClick={(stage) => {
              const targetOrder = STAGE_CONFIG[stage].order;
              const currentOrder = STAGE_CONFIG[project.stage!].order;
              if (targetOrder < currentOrder) {
                if (!confirm(`Вернуть на стадию «${STAGE_CONFIG[stage].label}»?`)) return;
              }
              updateProject.mutate({ id: project.id, stage });
            }}
          />
        </div>
      )}

      {/* Info grid */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* Company — clickable */}
        <div
          className="group rounded-lg border border-border/50 bg-surface px-3 py-2.5 cursor-pointer transition-colors hover:border-border2"
          onClick={() => project.company_id && router.push(`/companies/${project.company_id}`)}
        >
          <div className="mb-1 flex items-center gap-1 text-[13px] text-text-dim"><Building2 size={11} /> Компания</div>
          <div className={`text-[15px] font-medium ${project.company ? 'text-accent group-hover:underline' : 'text-text-mute'}`}>
            {project.company?.name ?? '—'}
          </div>
        </div>

        {/* Contact — clickable */}
        <div
          className="group rounded-lg border border-border/50 bg-surface px-3 py-2.5 cursor-pointer transition-colors hover:border-border2"
          onClick={() => project.contact_id && router.push(`/contacts/${project.contact_id}`)}
        >
          <div className="mb-1 flex items-center gap-1 text-[13px] text-text-dim"><User size={11} /> Контакт</div>
          <div className={`text-[15px] font-medium ${project.contact ? 'text-accent group-hover:underline' : 'text-text-mute'}`}>
            {project.contact ? `${project.contact.first_name} ${project.contact.last_name}` : '—'}
          </div>
        </div>

        {/* Budget — inline edit */}
        <div className="rounded-lg border border-border/50 bg-surface px-3 py-2.5">
          <div className="mb-1 flex items-center gap-1 text-[13px] text-text-dim"><Banknote size={11} /> Бюджет</div>
          <InlineEdit
            value={project.budget ? String(project.budget) : ''}
            type="number"
            placeholder="Указать"
            formatDisplay={(v) => formatBudget(Number(v))}
            onSave={async (val) => {
              updateProject.mutate({ id: project.id, budget: val ? Number(val) : null });
            }}
            className="text-[15px] font-medium"
          />
        </div>

        {/* Deadline — inline edit */}
        <div className="rounded-lg border border-border/50 bg-surface px-3 py-2.5">
          <div className="mb-1 flex items-center gap-1 text-[13px] text-text-dim"><Calendar size={11} /> Дедлайн</div>
          <InlineEdit
            value={project.deadline ?? ''}
            type="date"
            placeholder="Установить"
            formatDisplay={(v) => {
              try {
                return new Date(v).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
              } catch { return v; }
            }}
            onSave={async (val) => {
              updateProject.mutate({ id: project.id, deadline: val || null });
            }}
            className="text-[15px] font-medium"
          />
        </div>
      </div>

      {/* Next step */}
      {project.next_step && (
        <div className="mb-6 rounded-xl border border-accent/20 bg-accent-l/30 px-4 py-3">
          <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-accent">
            <ChevronRight size={12} />
            Следующий шаг
          </div>
          <p className="text-[15px] text-text-main">{project.next_step}</p>
        </div>
      )}

      {/* ═══ Related: Tasks ═══ */}
      <div className="mb-4 rounded-xl border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckSquare size={14} className="text-text-dim" />
            <span className="text-xs font-semibold text-text-main">Задачи</span>
            <span className="rounded-full bg-bg px-1.5 py-0.5 text-[10px] text-text-mute">
              {projectTasks.length}
            </span>
          </div>
          <button
            onClick={() => setTaskModalOpen(true)}
            className="flex items-center gap-1 rounded-lg border border-border px-2 py-1
                       text-[11px] text-text-dim transition-colors hover:bg-surface-hover hover:text-text-main"
          >
            <Plus size={12} />
            Задача
          </button>
        </div>
        {projectTasks.length === 0 ? (
          <p className="text-xs text-text-mute italic">
            Нет привязанных задач
          </p>
        ) : (
          <div className="space-y-1.5">
            {projectTasks.map((t) => (
              <TaskMiniCard key={t.id} task={t} />
            ))}
          </div>
        )}
      </div>

      {/* ═══ Related: Calls ═══ */}
      <div className="mb-4 rounded-xl border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Phone size={14} className="text-text-dim" />
            <span className="text-xs font-semibold text-text-main">Звонки</span>
            <span className="rounded-full bg-bg px-1.5 py-0.5 text-[10px] text-text-mute">
              {projectCalls.length}
            </span>
          </div>
          <button
            onClick={() => setCallModalOpen(true)}
            className="flex items-center gap-1 rounded-lg border border-border px-2 py-1
                       text-[11px] text-text-dim transition-colors hover:bg-surface-hover hover:text-text-main"
          >
            <Plus size={12} />
            Звонок
          </button>
        </div>
        {projectCalls.length === 0 ? (
          <div>
            <p className="text-xs text-text-mute italic">Нет связанных звонков</p>
            <button onClick={() => setCallModalOpen(true)} className="empty-state-action">+ Записать первый звонок</button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {projectCalls.map((c) => (
              <CallMiniCard key={c.id} call={c} />
            ))}
          </div>
        )}
      </div>

      {/* ═══ Related: Meetings ═══ */}
      <div className="mb-4 rounded-xl border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-text-dim" />
            <span className="text-xs font-semibold text-text-main">Встречи</span>
            <span className="rounded-full bg-bg px-1.5 py-0.5 text-[10px] text-text-mute">
              {projectMeetings.length}
            </span>
          </div>
          <button
            onClick={() => setMeetingModalOpen(true)}
            className="flex items-center gap-1 rounded-lg border border-border px-2 py-1
                       text-[11px] text-text-dim transition-colors hover:bg-surface-hover hover:text-text-main"
          >
            <Plus size={12} />
            Встреча
          </button>
        </div>
        {projectMeetings.length === 0 ? (
          <div>
            <p className="text-xs text-text-mute italic">Нет запланированных встреч</p>
            <button onClick={() => setMeetingModalOpen(true)} className="empty-state-action">+ Запланировать встречу</button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {projectMeetings.map((m) => (
              <MeetingMiniCard key={m.id} meeting={m} />
            ))}
          </div>
        )}
      </div>

      {/* ═══ Files ═══ */}
      <ProjectFiles projectId={projectId} />

      {/* ═══ Activity Timeline ═══ */}
      <ActivityTimeline projectId={projectId} />

      {/* Modals */}
      <ProjectModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        editProject={project}
      />
      <TaskModal
        isOpen={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        editTask={null}
        defaultProjectId={projectId}
      />
      <CallModal
        isOpen={callModalOpen}
        onClose={() => setCallModalOpen(false)}
        editCall={null}
        defaultProjectId={projectId}
      />
      <MeetingModal
        isOpen={meetingModalOpen}
        onClose={() => setMeetingModalOpen(false)}
        editMeeting={null}
        defaultProjectId={projectId}
      />
    </>
  );
}

// ═══════════════════════════════════════════════════════
// Small UI helper
// ═══════════════════════════════════════════════════════

function InfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border/50 bg-surface px-3 py-2.5">
      <div className="mb-1 flex items-center gap-1 text-[13px] text-text-dim">
        <Icon size={11} />
        {label}
      </div>
      <div className="text-[15px] font-medium text-text-main">{value}</div>
    </div>
  );
}
