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
  Rocket,
  ExternalLink,
  Link2,
  StickyNote,
  ChevronRight,
} from 'lucide-react';
import {
  useProject,
  useUpdateProject,
  useDeleteProject,
  useMoveProject,
  parseStageGateError,
  type Project,
} from '@/lib/hooks/use-projects';
import type { ProjectType, UnmetRequirement } from '@/types/database';
import type { Call } from '@/lib/hooks/use-calls';
import type { Meeting } from '@/lib/hooks/use-meetings';
import {
  formatBudget,
  parseBudgetInput,
  lossReasons,
  LOSS_REASON_CONFIG,
  wonReasons,
  WON_REASON_CONFIG,
} from '@/lib/validators/project';
import { StackedPipeline } from './StackedPipeline';
import { DeliveryCompletionModal } from './DeliveryCompletionModal';
import { DealDeliveryHub } from './DealDeliveryHub';
import { DealProgressBar } from './DealProgressBar';
import { DealFocusPanel } from './DealFocusPanel';
import { StageReadiness } from './StageReadiness';
import { ProjectFiles } from './ProjectFiles';
import { ProjectVideos } from './ProjectVideos';
import { ProjectChat } from './ProjectChat';
import { QuotesTab } from './QuotesTab';
import { InlineEdit } from '@/components/ui/InlineEdit';
import { ProjectModal } from './ProjectModal';
import { TaskModal } from '@/components/tasks/TaskModal';
import { ProjectBoard } from '@/components/tasks/ProjectBoard';
import { PlanImportButton } from '@/components/tasks/PlanImport';
import dynamic from 'next/dynamic';
import { CallModal } from '@/components/calls/CallModal';
import { MeetingModal } from '@/components/meetings/MeetingModal';
import { ActivityComposer } from '@/components/shared/ActivityComposer';
import { EntityTimeline } from '@/components/shared/EntityTimeline';
import { openTimelineEvent } from '@/lib/timeline/open-event';
import type { TimelineEvent } from '@/types/timeline';
import { calculateDealHealth } from '@/lib/utils/deal-health';
import { getDeliveryHealth, isDeliveryTerminal } from '@/lib/utils/delivery-health';
import { HealthDot } from '@/components/shared/HealthDot';
import { DeliveryHealthDot } from '@/components/shared/DeliveryHealthDot';
import { Badge } from '@/components/ui/Badge';
import { usePipelineStages } from '@/lib/hooks/use-pipelines';
import { DELIVERY_PHASE_LABELS, deliveryKindLabel, hasTaskProgress } from '@/lib/constants/delivery-phases';
import { SpawnWizard } from './SpawnWizard';
import { canManageDeliveryProject } from '@/lib/utils/project-permissions';
import { safeHref } from '@/lib/utils/safe-href';
import { cn } from '@/lib/utils/cn';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import { useAuth } from '@/lib/hooks/use-auth';
import { ProjectTeam } from './ProjectTeam';
import type { Task } from '@/types/entities';

// W4a: Гант (849 строк + измерение стрелок) грузится только при открытии вкладки
// «Гант», а не в первом чанке деталки. ssr:false — компонент целиком клиентский.
const GanttTimeline = dynamic(
  () => import('@/components/tasks/GanttTimeline').then((m) => m.GanttTimeline),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin text-accent" />
      </div>
    ),
  },
);


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
      ? [{ key: 'stage', label: 'Стадия', filled: !!project.stage_id }]
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
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}
      >
        {filled}/{total}
      </button>
      {open && missing.length > 0 && (
        <div className="absolute left-0 top-full z-10 mt-1 w-44 rounded-lg border border-border bg-popover p-2 elevation-2">
          <p className="mb-1 text-xs font-medium text-text-mute">Не заполнено:</p>
          {missing.map((f) => (
            <div key={f.key} className="text-xs text-text-dim py-0.5">{f.label}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Main Detail View
// ═══════════════════════════════════════════════════════

// PCT-1/S-IA-DELIVERY-1: вкладки нижней секции карточки
type Tab = 'activity' | 'board' | 'timeline' | 'quotes' | 'chat';

interface ProjectDetailProps {
  projectId: string;
  /**
   * S-IA-DELIVERY-1 (§3.1): роут-контекст для error-state, когда project не
   * загрузился и его type неизвестен: /deals/[id] → 'deal', /projects/[id] → 'project'.
   */
  context: 'deal' | 'project';
}

export function ProjectDetail({ projectId, context }: ProjectDetailProps) {
  const router = useRouter();
  const { data: project, isLoading, error } = useProject(projectId);
  // Delivery P1: родительская сделка (для ссылки на карточке внедрения)
  const { data: parentDeal } = useProject(project?.parent_deal_id ?? '');
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const { moveToStageId } = useMoveProject();
  // P2b (B0): права управления delivery (команда/шаблон/CRUD фаз) = контракт RLS,
  // НЕ role !== 'viewer' — иначе кнопки давали бы 42501
  const { data: orgRole } = useOrgRole();
  const { user } = useAuth();

  // S-WIN-WIZARD-1: Win Wizard — контур/шаблон/owner при spawn внедрения
  // из won-сделки (заменил «голую» inline-панель шаблона + скролл-костыль).
  const [spawning, setSpawning] = useState(false);

  // Sprint 27: отказ стадийного гейта при переходе с детальной карточки
  const [gateBlock, setGateBlock] = useState<UnmetRequirement[] | null>(null);
  const onGateError = (err: unknown) => {
    const unmet = parseStageGateError(err);
    if (unmet) setGateBlock(unmet);
  };

  const { data: allPipelineStages } = usePipelineStages();

  const [modalOpen, setModalOpen] = useState(false);
  // P3: модалка завершения delivery (чеклист вех, гейт 038)
  const [completing, setCompleting] = useState(false);
  // S-IA-DELIVERY-1 (M2): null = «пользователь ещё не выбирал» → эффективный таб
  // деривируется от типа проекта ниже (delivery стартует на Плане, не на ленте).
  const [tab, setTab] = useState<Tab | null>(null);
  // M5 (F-10): материалы (1С:ДО/заметки/файлы/видео) свёрнуты по умолчанию — план к сгибу
  const [showMaterials, setShowMaterials] = useState(false);
  // «Проиграна» — двухшаговый выбор причины (как отказ у лидов)
  const [losing, setLosing] = useState(false);
  // «Выиграна» — двухшаговый выбор причины (симметрия проигрышу, S-WON-REASON-1)
  const [winning, setWinning] = useState(false);
  // Опциональный комментарий к причине выигрыша (won_detail)
  const [winDetail, setWinDetail] = useState('');
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
    // §3.1: тип сущности неизвестен (fetch упал/не нашёл) — copy и «назад» по
    // роут-контексту, не хардкод «сделки» (/projects — delivery/internal).
    const isDealCtx = context === 'deal';
    return (
      <div className="rounded-xl border border-red/30 bg-red/5 p-8 text-center">
        <AlertCircle size={24} className="mx-auto text-red" />
        <p className="mt-2 text-sm text-red">
          {isDealCtx ? 'Сделка не найдена' : 'Проект не найден'}
        </p>
        <button
          onClick={() => router.push(isDealCtx ? '/deals' : '/projects')}
          className="mt-3 text-xs text-accent hover:underline"
        >
          {isDealCtx ? '← Вернуться к воронке' : '← Вернуться к проектам'}
        </button>
      </div>
    );
  }

  // Routing-контракт P1: client живёт на /deals, delivery/internal — на /projects
  const backHref = project.type === 'client' ? '/deals' : '/projects';
  const backLabel = project.type === 'client' ? 'Воронка сделок' : 'Проекты';
  const isDelivery = project.type === 'delivery';
  // P2b (B0): единые права управления delivery-проектом (= гарды RLS/RPC)
  const canManage = canManageDeliveryProject(project, orgRole, user?.id);
  // M2: до явного выбора пользователя — дефолт по типу (derived, без effect):
  // внедрение живёт планом/датами → «План»; client/internal — лента, как раньше.
  const activeTab: Tab = tab ?? (isDelivery ? 'board' : 'activity');
  const doHref = safeHref(project.do_url); // фильтр схемы для внешней ссылки 1С:ДО

  // S29.1 / Путь B: «живой» контур стадии — из stage_id (pipeline_stages), legacy enum `stage` больше не читаем.
  const headerStage = allPipelineStages?.find((s) => s.id === project.stage_id) ?? null;
  const headerProb = headerStage?.probability ?? null;
  // S-DLV-HEALTH-1: health внедрения — из project-level полей; терминальные не краснят
  const deliveryHealth = isDelivery
    ? getDeliveryHealth({
        progress_done: project.progress_done,
        progress_total: project.progress_total,
        stage_entered_at: project.stage_entered_at,
        deadline: project.deadline,
        updated_at: project.updated_at,
        isTerminal: isDeliveryTerminal(headerStage, project.status),
      })
    : null;

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
            {/* S-UI-POLISH-1 (п.3): пилюля текущей стадии — solid-акцент (bg-accent/green
                + текст на --bg), а не тинт: находится взглядом за секунду в любой теме */}
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium text-[var(--bg)] ${headerProb != null && headerProb > 50 ? 'bg-green' : 'bg-accent'}`}>
              {(() => {
                // Delivery: «Состояние · текущая фаза» (phase_group → лейбл, стадия = фаза СДР)
                if (isDelivery && headerStage) {
                  const phaseLabel = DELIVERY_PHASE_LABELS[headerStage.phase_group ?? ''] ?? headerStage.phase_group ?? '—';
                  return `${phaseLabel} · ${headerStage.name}`;
                }
                // S29.1 / Путь B: бейдж — из stage_id (живой контур); legacy enum больше не читаем.
                if (headerStage) return `${headerStage.name} · ${headerStage.probability ?? 0}%`;
                return '—';
              })()}
            </span>
            {/* P2b (B3): прогресс задач — отдельная метрика, НЕ смешиваем со стадийным % */}
            {isDelivery && hasTaskProgress(project.progress_total) && (
              <span className="rounded-full bg-surface2 px-2 py-0.5 text-xs font-medium text-text-dim">
                Задачи: {project.progress_done}/{project.progress_total}
              </span>
            )}
            {/* S-DLV-HEALTH-1: health внедрения + причины текстом (место есть) */}
            {isDelivery && deliveryHealth && (
              <span className="inline-flex items-center gap-1.5">
                <DeliveryHealthDot health={deliveryHealth} size="md" showLabel />
                {deliveryHealth.reasons.length > 0 && (
                  <span className="text-text-mute">· {deliveryHealth.reasons.join('; ')}</span>
                )}
              </span>
            )}
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
                    onClick={() => { setLosing(false); setWinning((v) => !v); }}
                    className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text-dim
                               transition-colors hover:border-green/40 hover:text-green hover:bg-green-l"
                  >
                    Выиграна
                  </button>
                )}
                {lostStage && (
                  <button
                    onClick={() => { setWinning(false); setLosing((v) => !v); }}
                    className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text-dim
                               transition-colors hover:border-red/40 hover:text-red hover:bg-red-l"
                  >
                    Проиграна
                  </button>
                )}
              </>
            );
          })()}
          {/* Delivery P1: терминал delivery — «Завершить проект» (status open→completed).
              P3: confirm() → модалка с чеклистом вех (гейт 038) */}
          {isDelivery && project.status === 'open' && (
            <button
              onClick={() => setCompleting(true)}
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text-dim
                         transition-colors hover:border-green/40 hover:text-green hover:bg-green-l"
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
                  onClick={() => setSpawning(true)}
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
                    loss_reason: null,
                    loss_detail: null,
                    won_reason: null,
                    won_detail: null,
                  });
                }}
                className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-text-dim
                           transition-colors hover:bg-surface-hover hover:text-text-main"
              >
                Вернуть в работу
              </button>
            </>
          )}
          {/* S-IA-DELIVERY-1 (§3.2): модалка редактирует и delivery (name/связи/owner,
              partial-payload). do_url/deadline остаются инлайн на карточке.
              Для delivery карандаш — по canManage (контракт RLS/RPC, не 42501 в лоб). */}
          {(!isDelivery || canManage) && (
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

      {/* «Выиграна» — выбор причины (обязателен, симметрия проигрышу) S-WON-REASON-1 */}
      {winning && (project.status === 'open' || project.status === 'on_hold') && (() => {
        const wonStage = allPipelineStages?.find((s) => s.pipeline_id === project.pipeline_id && s.is_won);
        if (!wonStage) return null;
        return (
          <div className="mb-4 rounded-lg border border-green/30 bg-green-l/40 px-3 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 text-xs text-text-dim">Причина выигрыша:</span>
              {wonReasons.map((r) => (
                <button
                  key={r}
                  onClick={() => {
                    moveToStageId(
                      project.id,
                      wonStage.id,
                      // S-WON-AUTO-1: успешный выигрыш → сразу предлагаем Win Wizard (HITL,
                      // у него есть «Пока не создавать»). Гейт S27 не прошёл → onError, wizard
                      // НЕ откроется. Панель причины закрываем синхронно ниже (до onSuccess).
                      { onError: onGateError, onSuccess: () => setSpawning(true) },
                      {
                        won_reason: r,
                        won_detail: winDetail.trim() || null,
                        loss_reason: null,
                        loss_detail: null,
                      },
                    );
                    setWinning(false);
                    setWinDetail('');
                  }}
                  className="rounded border border-border bg-surface px-2 py-0.5 text-xs text-text-dim
                             transition-colors hover:border-green hover:text-green"
                >
                  {WON_REASON_CONFIG[r].label}
                </button>
              ))}
              <button
                onClick={() => { setWinning(false); setWinDetail(''); }}
                className="ml-auto rounded px-2 py-0.5 text-xs text-text-mute hover:text-text-main"
              >
                Отмена
              </button>
            </div>
            <textarea
              value={winDetail}
              onChange={(e) => setWinDetail(e.target.value)}
              placeholder="Комментарий (необязательно)"
              rows={2}
              aria-label="Комментарий к причине выигрыша"
              className="mt-2 w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm
                         text-text-main placeholder:text-text-mute
                         focus:border-green focus:outline-none focus:ring-1 focus:ring-green"
            />
          </div>
        );
      })()}

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

              moveToStageId(project.id, newStageId, { onError: onGateError });
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
              // S29.1 / B1: пишем ТОЛЬКО stage_id — legacy `stage` из чеврона больше не трогаем.
              moveToStageId(project.id, newStageId, { onError: onGateError });
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
              // B6/B1: delivery живёт только на stage_id — legacy stage не пишем
              moveToStageId(project.id, newStageId, { onError: onGateError });
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
                  <li key={i} className="flex items-start gap-1.5 text-body text-text-dim">
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

      {/* S-DEAL-HUB-1: дочерние внедрения won-сделки (компонент сам скрыт, если не won).
          onCreateDelivery открывает Win Wizard (S-WIN-WIZARD-1). */}
      {project.type === 'client' && (
        <DealDeliveryHub
          dealId={project.id}
          dealStatus={project.status}
          onCreateDelivery={() => setSpawning(true)}
        />
      )}

      {/* Info grid */}
      <div data-stats-grid className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {/* Company — clickable */}
        <div
          className="group rounded-lg border border-border/50 bg-surface px-3 py-2.5 cursor-pointer transition-colors hover:border-border2"
          onClick={() => project.company_id && router.push(`/companies/${project.company_id}`)}
        >
          <div className="mb-1 flex items-center gap-1 text-body text-text-dim"><Building2 size={11} /> Компания</div>
          <div className={`text-base font-medium ${project.company ? 'text-accent group-hover:underline' : 'text-text-mute'}`}>
            {project.company?.name ?? '—'}
          </div>
        </div>

        {/* Contact — clickable */}
        <div
          className="group rounded-lg border border-border/50 bg-surface px-3 py-2.5 cursor-pointer transition-colors hover:border-border2"
          onClick={() => project.contact_id && router.push(`/contacts/${project.contact_id}`)}
        >
          <div className="mb-1 flex items-center gap-1 text-body text-text-dim"><User size={11} /> Контакт</div>
          <div className={`text-base font-medium ${project.contact ? 'text-accent group-hover:underline' : 'text-text-mute'}`}>
            {project.contact ? `${project.contact.first_name} ${project.contact.last_name}` : '—'}
          </div>
        </div>

        {/* Delivery: родительская сделка вместо бюджета (лёгкая карточка) */}
        {isDelivery ? (
          <div
            className="group rounded-lg border border-border/50 bg-surface px-3 py-2.5 cursor-pointer transition-colors hover:border-border2"
            onClick={() => project.parent_deal_id && router.push(`/deals/${project.parent_deal_id}`)}
          >
            <div className="mb-1 flex items-center gap-1 text-body text-text-dim"><Rocket size={11} /> Сделка</div>
            <div className={`truncate text-base font-medium ${project.parent_deal_id ? 'text-accent group-hover:underline' : 'text-text-mute'}`}>
              {parentDeal?.name ?? (project.parent_deal_id ? '…' : '—')}
            </div>
          </div>
        ) : (
          /* Budget — inline edit */
          <div className="rounded-lg border border-border/50 bg-surface px-3 py-2.5">
            <div className="mb-1 flex items-center gap-1 text-body text-text-dim"><Banknote size={11} /> Бюджет</div>
            <InlineEdit
              value={project.budget ? String(project.budget) : ''}
              type="number"
              placeholder="Указать"
              formatDisplay={(v) => formatBudget(Number(v))}
              onSave={async (val) => {
                updateProject.mutate({ id: project.id, budget: val ? Number(val) : null });
              }}
              className="text-base font-medium"
            />
          </div>
        )}

        {/* Deadline — inline edit */}
        <div className="rounded-lg border border-border/50 bg-surface px-3 py-2.5">
          <div className="mb-1 flex items-center gap-1 text-body text-text-dim"><Calendar size={11} /> Дедлайн</div>
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
            className="text-base font-medium"
          />
        </div>
      </div>

      {/* P2b (B2): команда — full-width секция; S-TEAM-ROLES-1: роли фильтруются по категории (direction+type) */}
      {isDelivery && (
        <ProjectTeam
          projectId={projectId}
          canManage={canManage}
          direction={project.direction}
          type={project.type as ProjectType}
        />
      )}

      {/* M5 (F-10): 1С:ДО / заметки / файлы / видео уходят под сгиб — сворачиваемая
          секция «Материалы проекта» (по умолчанию закрыта), чтобы табы и План были
          видны без скролла. Info-grid и Команда остаются выше. */}
      <div className="mb-4">
        <button
          type="button"
          onClick={() => setShowMaterials((v) => !v)}
          aria-expanded={showMaterials}
          className="flex w-full items-center gap-2 rounded-xl border border-border/60 bg-surface px-4 py-2.5 text-left transition-colors hover:bg-surface2"
        >
          <ChevronRight size={15} className={cn('shrink-0 text-text-mute transition-transform', showMaterials && 'rotate-90')} />
          <span className="text-xs font-semibold uppercase tracking-wide text-text-mute">Материалы проекта</span>
          <span className="ml-auto text-meta text-text-mute">1С:ДО · заметки · файлы · видео</span>
        </button>
        {showMaterials && (
          <div className="mt-3 space-y-4">
            {/* Delivery P1 (B5): ссылка на проект в 1С:Документооборот (редактируемая) */}
            {isDelivery && (
              <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-surface px-3 py-2.5">
                <Link2 size={13} className="shrink-0 text-text-dim" />
                <span className="shrink-0 text-body text-text-dim">1С:ДО</span>
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
                {doHref && (
                  <a
                    href={doHref}
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

            {/* S-PROJECT-WORKSPACE-1 (п.6): заметки проекта для команды — переиспользуем
                projects.pinned_note (017); на client заметка уже в DealFocusPanel — не дублируем.
                Пишет canManage, команда читает (v1; all-team edit — NEXT, требует RLS-решения). */}
            {(isDelivery || project.type === 'internal') && (
              <div className="rounded-xl border border-border bg-surface p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-text-main">
                  <StickyNote size={14} className="text-text-dim" /> Заметки проекта
                </div>
                {canManage ? (
                  <div className="text-body leading-relaxed">
                    <InlineEdit
                      as="textarea"
                      value={project.pinned_note ?? ''}
                      placeholder="Заметки для команды…"
                      onSave={async (val) => {
                        updateProject.mutate({ id: project.id, pinned_note: val || null });
                      }}
                    />
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap text-body leading-relaxed text-text-main">
                    {project.pinned_note || <span className="text-text-mute">Заметок пока нет</span>}
                  </p>
                )}
              </div>
            )}

            {/* ═══ Files ═══ */}
            <ProjectFiles projectId={projectId} />

            {/* ═══ Videos (S-VIDEO-EMBED-1) ═══ */}
            <ProjectVideos projectId={projectId} canManage={canManage} />
          </div>
        )}
      </div>

      {/* PCT-1: вкладки Активность / Доска задач */}
      <div className="mb-3 flex gap-1 border-b border-border">
        {([
          { value: 'activity' as const, label: 'Активность' },
          // P2a: у delivery доска = фазовый план внедрения
          { value: 'board' as const, label: isDelivery ? 'План' : 'Доска задач' },
          { value: 'timeline' as const, label: 'Гант' },
          // S-QUOTE-1: вкладка «КП» — только для сделок (type='client')
          ...(project.type === 'client' ? [{ value: 'quotes' as const, label: 'КП' }] : []),
          // S-CHAT-1: чат команды — на всех типах проектов (отдельный модуль, НЕ Активность)
          { value: 'chat' as const, label: 'Чат' },
        ]).map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`-mb-px border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === t.value
                ? 'border-accent text-accent'
                : 'border-transparent text-text-mute hover:text-text-main'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'board' && (
        <div className="mb-4">
          {/* S-PLAN-IMPORT-1 (W8): кнопка НАД доской, не внутри ProjectBoard */}
          {isDelivery && (
            <div className="mb-2 flex justify-end">
              <PlanImportButton projectId={projectId} canImport={canManage} />
            </div>
          )}
          {/* P2b (B0): CRUD фаз/«Создать из шаблона» — по правам RLS, не по canEdit задач */}
          <ProjectBoard projectId={projectId} canManageColumns={canManage} />
        </div>
      )}

      {activeTab === 'timeline' && (
        <div>
          {/* M8: тот же PlanImportButton, что на доске — датированный план из Excel строит бары Ганта */}
          {isDelivery && (
            <div className="mb-2 flex justify-end">
              <PlanImportButton projectId={projectId} canImport={canManage} />
            </div>
          )}
          <GanttTimeline
            projectId={projectId}
            canManage={canManage}
            onEditTask={(t) => { setEditingTask(t); setTaskModalOpen(true); }}
          />
        </div>
      )}

      {/* S-QUOTE-1: КП сделки — только client */}
      {activeTab === 'quotes' && project.type === 'client' && (
        <QuotesTab deal={project} />
      )}

      {/* S-CHAT-1: чат команды проекта (realtime) */}
      {activeTab === 'chat' && <ProjectChat projectId={projectId} />}

      {/* ═══ Активность сделки — единая лента (звонки/встречи/задачи/лог/AI) + заметка ═══ */}
      <div className={`mb-4 rounded-xl border border-border bg-surface p-4 ${activeTab === 'activity' ? '' : 'hidden'}`}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-text-dim" />
            <span className="text-xs font-semibold text-text-main">Активность</span>
          </div>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => { setEditingTask(null); setTaskModalOpen(true); }}
              className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-meta text-text-dim transition-colors hover:bg-surface-hover hover:text-text-main"
            >
              <Plus size={12} /> Задача
            </button>
            <button
              onClick={() => { setEditingCall(null); setCallModalOpen(true); }}
              className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-meta text-text-dim transition-colors hover:bg-surface-hover hover:text-text-main"
            >
              <Plus size={12} /> Звонок
            </button>
            <button
              onClick={() => { setEditingMeeting(null); setMeetingModalOpen(true); }}
              className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-meta text-text-dim transition-colors hover:bg-surface-hover hover:text-text-main"
            >
              <Plus size={12} /> Встреча
            </button>
          </div>
        </div>
        <ActivityComposer entityType="project" entityId={projectId} />
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
      {/* P3: завершение delivery — чеклист вех + backstop-баннер (гейт 038) */}
      {completing && (
        <DeliveryCompletionModal project={project} onClose={() => setCompleting(false)} />
      )}
      {/* S-WIN-WIZARD-1: Win Wizard — контур/шаблон/owner при spawn внедрения */}
      {spawning && project.type === 'client' && project.status === 'won' && (
        <SpawnWizard
          dealId={project.id}
          dealDirection={project.direction}
          defaultOwnerId={project.owner_id}
          onCreated={(newId) => {
            setSpawning(false);
            router.push(`/projects/${newId}`);
          }}
          onClose={() => setSpawning(false)}
        />
      )}
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
      <div className="mb-1 flex items-center gap-1 text-body text-text-dim">
        <Icon size={11} />
        {label}
      </div>
      <div className="text-base font-medium text-text-main">{value}</div>
    </div>
  );
}
