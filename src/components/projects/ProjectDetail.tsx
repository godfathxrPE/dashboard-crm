'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Building2,
  User,
  Calendar,
  Banknote,
  Plus,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Clock,
  Send,
  Rocket,
  ExternalLink,
  Link2,
} from 'lucide-react';
import {
  useProject,
  useUpdateProject,
  useDeleteProject,
  useMoveProject,
  parseStageGateError,
  type Project,
} from '@/lib/hooks/use-projects';
import type { UnmetRequirement } from '@/types/database';
import { mapToLegacyStage } from '@/lib/utils/stage-mapping';
import type { Call } from '@/lib/hooks/use-calls';
import type { Meeting } from '@/lib/hooks/use-meetings';
import {
  STAGE_CONFIG,
  dealStages,
  getNextStage,
  getPrevStage,
  formatBudget,
  parseBudgetInput,
  lossReasons,
  LOSS_REASON_CONFIG,
  type DealStage,
} from '@/lib/validators/project';
import { StackedPipeline } from './StackedPipeline';
import { DealProgressBar } from './DealProgressBar';
import { DealFocusPanel } from './DealFocusPanel';
import { StageReadiness } from './StageReadiness';
import { ProjectFiles } from './ProjectFiles';
import { useThemeStore } from '@/lib/stores/theme-store';
import { InlineEdit } from '@/components/ui/InlineEdit';
import { ProjectModal } from './ProjectModal';
import { TaskModal } from '@/components/tasks/TaskModal';
import { ProjectBoard } from '@/components/tasks/ProjectBoard';
import { CallModal } from '@/components/calls/CallModal';
import { MeetingModal } from '@/components/meetings/MeetingModal';
import { useLogActivity } from '@/lib/hooks/use-activity-log';
import { useQueryClient } from '@tanstack/react-query';
import { EntityTimeline } from '@/components/shared/EntityTimeline';
import { openTimelineEvent } from '@/lib/timeline/open-event';
import type { TimelineEvent } from '@/types/timeline';
import { calculateDealHealth } from '@/lib/utils/deal-health';
import { HealthDot } from '@/components/shared/HealthDot';
import { Badge } from '@/components/ui/Badge';
import { usePipelineStages } from '@/lib/hooks/use-pipelines';
import { createClient } from '@/lib/supabase/client';
import { DELIVERY_PHASE_LABELS, deliveryKindLabel } from '@/lib/constants/delivery-phases';
import type { Task } from '@/types/entities';


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
    // PCT-1: «Стадия» — только для client (internal вне воронки)
    ...(project.type === 'client'
      ? [{ key: 'stage', label: 'Стадия', filled: !!project.stage }]
      : []),
    { key: 'next_step', label: 'Следующий шаг', filled: !!project.next_step },
    { key: 'next_action_date', label: 'Дата шага', filled: !!project.next_action_date },
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
// Activity Composer — только ВВОД заметки (read-часть теперь в <EntityTimeline>)
// Комментарий пишется в activity_log; инвалидация ['timeline'] подтягивает
// его в единую ленту сделки (includeSystem).
// ═══════════════════════════════════════════════════════

function ActivityComposer({ projectId }: { projectId: string }) {
  const logMutation = useLogActivity();
  const qc = useQueryClient();
  const [comment, setComment] = useState('');

  function handleAddComment() {
    const text = comment.trim();
    if (!text) return;
    logMutation.mutate(
      { project_id: projectId, event_type: 'comment_added', payload: { text } },
      {
        onSuccess: () => {
          setComment('');
          qc.invalidateQueries({ queryKey: ['timeline'] });
        },
      },
    );
  }

  return (
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
  const qc = useQueryClient();
  const { data: project, isLoading, error } = useProject(projectId);
  // Delivery P1: родительская сделка (для ссылки на карточке внедрения)
  const { data: parentDeal } = useProject(project?.parent_deal_id ?? '');
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const { moveToStageId } = useMoveProject();
  const isScandi = useThemeStore((s) => s.theme) === 't-scandi';

  // Delivery P1 (B4): диалог выбора шаблона внедрения на won-сделке
  const [spawning, setSpawning] = useState(false);
  const [spawnPending, setSpawnPending] = useState(false);
  const [spawnError, setSpawnError] = useState<string | null>(null);

  async function handleSpawn(kind: 'launch' | 'experiment') {
    if (!project) return;
    setSpawnPending(true);
    setSpawnError(null);
    const supabase = createClient();
    const { data, error: rpcError } = await supabase.rpc('spawn_delivery_project', {
      p_deal_id: project.id,
      p_kind: kind,
    });
    setSpawnPending(false);
    if (rpcError) {
      // 42501 — доступ (org/ownership), P0001 — не won / нет пайплайна
      setSpawnError(
        rpcError.code === '42501'
          ? 'Недостаточно прав: внедрение создаёт владелец сделки или админ организации'
          : rpcError.message,
      );
      return;
    }
    qc.invalidateQueries({ queryKey: ['projects'] });
    setSpawning(false);
    router.push(`/projects/${data as string}`);
  }

  // Sprint 27: отказ стадийного гейта при переходе с детальной карточки
  const [gateBlock, setGateBlock] = useState<UnmetRequirement[] | null>(null);
  const onGateError = (err: unknown) => {
    const unmet = parseStageGateError(err);
    if (unmet) setGateBlock(unmet);
  };

  const { data: allPipelineStages } = usePipelineStages();

  const [modalOpen, setModalOpen] = useState(false);
  // PCT-1: вкладки нижней секции — Активность / Доска задач
  const [tab, setTab] = useState<'activity' | 'board'>('activity');
  // «Проиграна» — двухшаговый выбор причины (как отказ у лидов)
  const [losing, setLosing] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [editingCall, setEditingCall] = useState<Call | null>(null);
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);

  // Клик по событию единой ленты → общий маппинг kind→действие (тот же, что contact/company)
  function handleOpenEvent(e: TimelineEvent) {
    void openTimelineEvent(e, {
      router,
      onCall: (call) => { setEditingCall(call); setCallModalOpen(true); },
      onMeeting: (m) => { setEditingMeeting(m); setMeetingModalOpen(true); },
      onTask: (t) => { setEditingTask(t); setTaskModalOpen(true); },
    });
  }

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
        <p className="mt-2 text-sm text-red">Сделка не найдена</p>
        <button
          onClick={() => router.push('/deals')}
          className="mt-3 text-xs text-accent hover:underline"
        >
          ← Вернуться к воронке
        </button>
      </div>
    );
  }

  // Routing-контракт P1: client живёт на /deals, delivery/internal — на /projects
  const backHref = project.type === 'client' ? '/deals' : '/projects';
  const backLabel = project.type === 'client' ? 'Воронка сделок' : 'Проекты';
  const isDelivery = project.type === 'delivery';

  const stageConfig = project.stage ? STAGE_CONFIG[project.stage] : null;
  const nextStage = project.stage ? getNextStage(project.stage) : null;
  const prevStage = project.stage ? getPrevStage(project.stage) : null;
  // S29.1: «живой» контур стадии — из stage_id (pipeline_stages), не legacy enum.
  const headerStage = allPipelineStages?.find((s) => s.id === project.stage_id) ?? null;
  const headerProb = headerStage?.probability ?? stageConfig?.probability ?? null;

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
    if (confirm(`Удалить ${project.type === 'client' ? 'сделку' : 'проект'}? Связанные задачи сохранятся. Это действие нельзя отменить.`)) {
      deleteProject.mutate(project.id, {
        onSuccess: () => router.push(backHref),
      });
    }
  }

  return (
    <>
      {/* Back navigation */}
      <button
        onClick={() => router.push(backHref)}
        className="mb-4 flex items-center gap-1 text-xs text-text-mute
                   transition-colors hover:text-accent"
      >
        <ArrowLeft size={14} />
        {backLabel}
      </button>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="aura-page-title text-text-main">{project.name}</h1>
            {project.type === 'internal' ? (
              <Badge color="accent" size="sm">Внутренний</Badge>
            ) : (
              <Badge color={project.direction === 'erp' ? 'purple' : 'blue'} size="sm">
                {project.direction === 'iiot' ? 'IIoT' : 'ERP'}
              </Badge>
            )}
            {isDelivery && (() => {
              const kindLabel = project.delivery_kind
                ? deliveryKindLabel(project.delivery_kind, project.direction)
                : null;
              return (
                <>
                  <Badge color="green" size="sm">Внедрение</Badge>
                  {/* D1: у ERP-launch лейбл kind = «Внедрение» — дублировал бы бейдж */}
                  {kindLabel && kindLabel !== 'Внедрение' && (
                    <span className="text-xs text-text-mute">{kindLabel}</span>
                  )}
                </>
              );
            })()}
            {project.type === 'client' && (
              <HealthDot level={calculateDealHealth(project).level} score={calculateDealHealth(project).total} size="md" showLabel />
            )}
            {/* Delivery — лёгкая карточка: чек-лист заполненности не показываем */}
            {!isDelivery && <CompletenessBadge project={project} />}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-text-mute">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${headerProb != null && headerProb > 50 ? 'bg-green/10 text-green' : 'bg-accent-l text-accent'}`}>
              {(() => {
                // Delivery: «Состояние · текущая фаза» (phase_group → лейбл, стадия = фаза СДР)
                if (isDelivery && headerStage) {
                  const phaseLabel = DELIVERY_PHASE_LABELS[headerStage.phase_group ?? ''] ?? headerStage.phase_group ?? '—';
                  return `${phaseLabel} · ${headerStage.name}`;
                }
                // S29.1: бейдж — из stage_id (живой контур); legacy STAGE_CONFIG только как fallback.
                if (headerStage) return `${headerStage.name} · ${headerStage.probability ?? 0}%`;
                if (stageConfig) return `${stageConfig.label} · ${stageConfig.probability}%`;
                return '—';
              })()}
            </span>
            <span>
              Создан {new Date(project.created_at).toLocaleDateString('ru-RU')}
            </span>
            {project.status === 'open' && project.stage_entered_at && (() => {
              const d = Math.floor((Date.now() - new Date(project.stage_entered_at).getTime()) / 86400000);
              if (d < 1) return null;
              return (
                <span style={d > 30 ? { color: 'var(--red-text, var(--red))' } : undefined}>
                  · {d} дн. в стадии
                </span>
              );
            })()}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {/* Терминальные действия — одним кликом из карточки (только client — воронка) */}
          {project.type === 'client' && (project.status === 'open' || project.status === 'on_hold') && (() => {
            const pipeStages = allPipelineStages?.filter((s) => s.pipeline_id === project.pipeline_id) ?? [];
            const wonStage = pipeStages.find((s) => s.is_won);
            const lostStage = pipeStages.find((s) => s.is_lost);
            return (
              <>
                {wonStage && (
                  <button
                    onClick={() => {
                      if (!confirm(`Отметить «${project.name}» выигранной?`)) return;
                      moveToStageId(project.id, wonStage.id, mapToLegacyStage(wonStage, project.direction), { onError: onGateError });
                    }}
                    className="rounded-lg border border-green/40 px-2.5 py-1.5 text-xs font-medium text-green
                               transition-colors hover:bg-green-l"
                  >
                    Выиграна
                  </button>
                )}
                {lostStage && (
                  <button
                    onClick={() => setLosing((v) => !v)}
                    className="rounded-lg border border-red/40 px-2.5 py-1.5 text-xs font-medium text-red
                               transition-colors hover:bg-red-l"
                  >
                    Проиграна
                  </button>
                )}
              </>
            );
          })()}
          {/* Delivery P1: терминал delivery — «Завершить проект» (status open→completed) */}
          {isDelivery && project.status === 'open' && (
            <button
              onClick={() => {
                if (!confirm(`Завершить проект «${project.name}»?`)) return;
                updateProject.mutate({ id: project.id, status: 'completed' });
              }}
              className="rounded-lg border border-green/40 px-2.5 py-1.5 text-xs font-medium text-green
                         transition-colors hover:bg-green-l"
            >
              Завершить проект
            </button>
          )}
          {isDelivery && project.status === 'completed' && (
            <span className="rounded-full bg-green-l px-2.5 py-1 text-xs font-medium text-green">
              Завершён
            </span>
          )}
          {(project.status === 'won' || project.status === 'lost') && (
            <>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                project.status === 'won' ? 'bg-green-l text-green' : 'bg-red-l text-red'
              }`}>
                {project.status === 'won' ? 'Выиграна' : 'Проиграна'}
                {project.actual_close_date &&
                  ` · ${new Date(project.actual_close_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`}
              </span>
              {/* Delivery P1 (B4): spawn проекта внедрения из выигранной сделки.
                  1 сделка → 1..N проектов — кнопка не блокируется после первого. */}
              {project.type === 'client' && project.status === 'won' && (
                <button
                  onClick={() => { setSpawnError(null); setSpawning((v) => !v); }}
                  className="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-xs
                             font-medium text-white shadow-sm transition-opacity hover:opacity-90"
                >
                  <Rocket size={12} /> Создать проект внедрения
                </button>
              )}
              <button
                onClick={() => {
                  const firstStage = allPipelineStages
                    ?.filter((s) => s.pipeline_id === project.pipeline_id && !s.is_won && !s.is_lost)
                    .sort((a, b) => a.order_index - b.order_index)[0];
                  if (!firstStage) return;
                  if (!confirm('Вернуть сделку в работу (первая стадия)?')) return;
                  updateProject.mutate({
                    id: project.id,
                    stage_id: firstStage.id,
                    stage: mapToLegacyStage(firstStage, project.direction),
                    loss_reason: null,
                    loss_detail: null,
                  });
                }}
                className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-dim
                           transition-colors hover:bg-surface-hover hover:text-text-main"
              >
                Вернуть в работу
              </button>
            </>
          )}
          {/* Delivery — лёгкая карточка P1: правки инлайн (do_url), модалка форм
              заточена под client/internal и delivery не редактирует */}
          {!isDelivery && (
            <button
              onClick={() => setModalOpen(true)}
              aria-label="Редактировать"
              className="rounded-lg border border-border p-1.5 text-text-mute
                         transition-colors hover:bg-surface-hover hover:text-text-main"
            >
              <Pencil size={14} />
            </button>
          )}
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

      {/* Delivery P1 (B4): выбор шаблона внедрения (паттерн панели «Проиграна») */}
      {spawning && project.type === 'client' && project.status === 'won' && (
        <div className="mb-4 rounded-lg border border-accent/30 bg-accent-l/40 px-3 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-text-dim">Шаблон внедрения:</span>
            {/* D1: у ERP один шаблон — «Эксперимент» без шаблона создал бы пустую доску (ловушка) */}
            {(project.direction === 'erp' ? (['launch'] as const) : (['launch', 'experiment'] as const)).map((kind) => (
              <button
                key={kind}
                disabled={spawnPending}
                onClick={() => handleSpawn(kind)}
                className="rounded border border-accent/50 bg-accent-l/60 px-2.5 py-1 text-xs font-medium
                           text-accent transition-colors hover:bg-accent hover:text-white disabled:opacity-50"
              >
                {deliveryKindLabel(kind, project.direction)}
                {project.direction === 'erp' && ' (6 этапов)'}
              </button>
            ))}
            {spawnPending && <Loader2 size={12} className="animate-spin text-accent" />}
            <button
              onClick={() => setSpawning(false)}
              className="ml-auto rounded px-2 py-0.5 text-xs text-text-mute hover:text-text-main"
            >
              Отмена
            </button>
          </div>
          <p className="mt-1 text-[11px] text-text-dim">
            {project.direction === 'erp'
              ? 'Полный цикл: Обследование → Моделирование → Проектирование → Разработка → Внедрение → Эксплуатация'
              : 'Полный запуск — весь цикл внедрения · Эксперимент — пилот'}
          </p>
          {spawnError && <p className="mt-1.5 text-xs text-red">{spawnError}</p>}
        </div>
      )}

      {/* «Проиграна» — выбор причины (обязателен, паттерн отказа лидов) */}
      {losing && (project.status === 'open' || project.status === 'on_hold') && (() => {
        const lostStage = allPipelineStages?.find((s) => s.pipeline_id === project.pipeline_id && s.is_lost);
        if (!lostStage) return null;
        return (
          <div className="mb-4 flex flex-wrap items-center gap-1.5 rounded-lg border border-red/30 bg-red-l/40 px-3 py-2">
            <span className="mr-1 text-xs text-text-dim">Причина проигрыша:</span>
            {lossReasons.map((r) => (
              <button
                key={r}
                onClick={() => {
                  updateProject.mutate({
                    id: project.id,
                    stage_id: lostStage.id,
                    stage: mapToLegacyStage(lostStage, project.direction),
                    loss_reason: r,
                  });
                  setLosing(false);
                }}
                className="rounded border border-border bg-surface px-2 py-0.5 text-xs text-text-dim
                           transition-colors hover:border-red hover:text-red"
              >
                {LOSS_REASON_CONFIG[r].label}
              </button>
            ))}
            <button
              onClick={() => setLosing(false)}
              className="ml-auto rounded px-2 py-0.5 text-xs text-text-mute hover:text-text-main"
            >
              Отмена
            </button>
          </div>
        );
      })()}

      {/* Deal Progress Bar — client ERP only (IIoT uses StackedPipeline below) */}
      {project.type === 'client' && project.direction === 'erp' && project.pipeline_id && project.stage_id && (
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
              moveToStageId(project.id, newStageId, legacyStage, { onError: onGateError });
            }}
          />
        </div>
      )}

      {/* Multi-track Pipeline — client IIoT only. S29.1: на stage_id, гейт-баннер переиспользован. */}
      {project.type === 'client' && project.direction === 'iiot' && project.pipeline_id && project.stage_id && (
        <div className="mb-6">
          <StackedPipeline
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

              setGateBlock(null);
              // S29.1: пишем ТОЛЬКО stage_id — legacy `stage` из чеврона больше не трогаем.
              moveToStageId(project.id, newStageId, undefined, { onError: onGateError });
            }}
          />
        </div>
      )}

      {/* Delivery P1 (B5): фазовый грид проекта внедрения — состояния (phase_group)
          с фазами СДР внутри; StackedPipeline универсален по слагам (лейблы
          delivery подмешаны из delivery-phases.ts). Legacy stage не пишем (B6). */}
      {isDelivery && project.pipeline_id && project.stage_id && (
        <div className="mb-6">
          <StackedPipeline
            pipelineId={project.pipeline_id}
            currentStageId={project.stage_id}
            readOnly={project.status === 'completed'}
            onStageClick={(newStageId) => {
              if (!allPipelineStages) return;
              const currentStageObj = allPipelineStages.find((s) => s.id === project.stage_id);
              const targetStageObj = allPipelineStages.find((s) => s.id === newStageId);
              if (!currentStageObj || !targetStageObj) return;
              if (targetStageObj.order_index === currentStageObj.order_index) return;

              if (targetStageObj.order_index < currentStageObj.order_index) {
                if (!confirm(`Вернуть проект на фазу «${targetStageObj.name}»?`)) return;
              }

              setGateBlock(null);
              // B6: delivery живёт только на stage_id — legacy stage всегда null
              moveToStageId(project.id, newStageId, null, { onError: onGateError });
            }}
          />
        </div>
      )}

      {/* Focus panel — рабочая зона «что дальше»; только для активных сделок (client) */}
      {project.type === 'client' && project.status === 'open' && <DealFocusPanel project={project} />}

      {/* Sprint 27: отказ гейта при переходе стадии с детальной карточки */}
      {gateBlock && (
        <div role="alert" className="mb-4 rounded-lg border border-red/40 bg-red/5 p-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text-main">Переход заблокирован</p>
              <ul className="mt-1.5 space-y-1">
                {gateBlock.map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[13px] text-text-dim">
                    <span className="mt-1.5 inline-block h-[5px] w-[5px] shrink-0 rounded-full bg-red" />
                    <span>{r.hint}</span>
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => setGateBlock(null)}
              aria-label="Скрыть"
              className="rounded px-1 text-sm leading-none text-text-mute transition-colors hover:bg-surface2"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Sprint 27: чек-лист готовности к следующей стадии (гейты) — только client */}
      {project.type === 'client' && project.status === 'open' && <StageReadiness project={project} />}

      {/* Info grid */}
      <div data-stats-grid className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
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

        {/* Delivery: родительская сделка вместо бюджета (лёгкая карточка) */}
        {isDelivery ? (
          <div
            className="group rounded-lg border border-border/50 bg-surface px-3 py-2.5 cursor-pointer transition-colors hover:border-border2"
            onClick={() => project.parent_deal_id && router.push(`/deals/${project.parent_deal_id}`)}
          >
            <div className="mb-1 flex items-center gap-1 text-[13px] text-text-dim"><Rocket size={11} /> Сделка</div>
            <div className={`truncate text-[15px] font-medium ${project.parent_deal_id ? 'text-accent group-hover:underline' : 'text-text-mute'}`}>
              {parentDeal?.name ?? (project.parent_deal_id ? '…' : '—')}
            </div>
          </div>
        ) : (
          /* Budget — inline edit */
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
        )}

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

      {/* Delivery P1 (B5): ссылка на проект в 1С:Документооборот (редактируемая) */}
      {isDelivery && (
        <div className="mb-6 flex items-center gap-2 rounded-lg border border-border/50 bg-surface px-3 py-2.5">
          <Link2 size={13} className="shrink-0 text-text-dim" />
          <span className="shrink-0 text-[13px] text-text-dim">1С:ДО</span>
          <div className="min-w-0 flex-1">
            <InlineEdit
              value={project.do_url ?? ''}
              type="text"
              placeholder="Вставить ссылку на проект в 1С:ДО"
              onSave={async (val) => {
                updateProject.mutate({ id: project.id, do_url: val.trim() || null });
              }}
              className="text-sm"
            />
          </div>
          {project.do_url && (
            <a
              href={project.do_url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Открыть в 1С:ДО"
              className="shrink-0 rounded p-1 text-text-mute transition-colors hover:bg-surface-hover hover:text-accent"
            >
              <ExternalLink size={13} />
            </a>
          )}
        </div>
      )}

      {/* ═══ Files ═══ */}
      <ProjectFiles projectId={projectId} />

      {/* PCT-1: вкладки Активность / Доска задач */}
      <div className="mb-3 flex gap-1 border-b border-border">
        {([
          { value: 'activity' as const, label: 'Активность' },
          // P2a: у delivery доска = фазовый план внедрения
          { value: 'board' as const, label: isDelivery ? 'План' : 'Доска задач' },
        ]).map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`-mb-px border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              tab === t.value
                ? 'border-accent text-accent'
                : 'border-transparent text-text-mute hover:text-text-main'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'board' && (
        <div className="mb-4">
          <ProjectBoard projectId={projectId} />
        </div>
      )}

      {/* ═══ Активность сделки — единая лента (звонки/встречи/задачи/лог/AI) + заметка ═══ */}
      <div className={`mb-4 rounded-xl border border-border bg-surface p-4 ${tab === 'activity' ? '' : 'hidden'}`}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-text-dim" />
            <span className="text-xs font-semibold text-text-main">Активность</span>
          </div>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => { setEditingTask(null); setTaskModalOpen(true); }}
              className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-text-dim transition-colors hover:bg-surface-hover hover:text-text-main"
            >
              <Plus size={12} /> Задача
            </button>
            <button
              onClick={() => { setEditingCall(null); setCallModalOpen(true); }}
              className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-text-dim transition-colors hover:bg-surface-hover hover:text-text-main"
            >
              <Plus size={12} /> Звонок
            </button>
            <button
              onClick={() => { setEditingMeeting(null); setMeetingModalOpen(true); }}
              className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] text-text-dim transition-colors hover:bg-surface-hover hover:text-text-main"
            >
              <Plus size={12} /> Встреча
            </button>
          </div>
        </div>
        <ActivityComposer projectId={projectId} />
        <EntityTimeline
          entityType="project"
          entityId={projectId}
          options={{ includeSystem: true }}
          onOpenEvent={handleOpenEvent}
        />
      </div>

      {/* Modals */}
      <ProjectModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        editProject={project}
      />
      <TaskModal
        isOpen={taskModalOpen}
        onClose={() => { setTaskModalOpen(false); setEditingTask(null); }}
        editTask={editingTask}
        defaultProjectId={projectId}
        // P2a: на фазовой доске новая задача — «Не начата» (lane='next')
        defaultLane={isDelivery ? 'next' : undefined}
      />
      <CallModal
        isOpen={callModalOpen}
        onClose={() => { setCallModalOpen(false); setEditingCall(null); }}
        editCall={editingCall}
        defaultProjectId={projectId}
      />
      <MeetingModal
        isOpen={meetingModalOpen}
        onClose={() => { setMeetingModalOpen(false); setEditingMeeting(null); }}
        editMeeting={editingMeeting}
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
