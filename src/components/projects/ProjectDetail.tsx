'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
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
  Clock,
  Rocket,
  ExternalLink,
  Link2,
  StickyNote,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import {
  useProject,
  useUpdateProject,
  useDeleteProject,
  type Project,
} from '@/lib/hooks/use-projects';
import { useMoveProject } from '@/lib/hooks/use-stage-transition';
import { useCompletenessRules } from '@/lib/hooks/use-org-settings';
import { evaluateCompleteness } from '@/lib/domain/deal-completeness';
import { useTransitionStore } from '@/lib/stores/transition-store';
import type { ProjectType } from '@/types/database';
import type { Call } from '@/lib/hooks/use-calls';
import type { Meeting } from '@/lib/hooks/use-meetings';
import { formatBudget, parseBudgetInput } from '@/lib/validators/project';
import { DeliveryCompletionModal } from './DeliveryCompletionModal';
import { DealDeliveryHub } from './DealDeliveryHub';
import { DealFocusPanel } from './DealFocusPanel';
import { ProjectStageCockpit } from './ProjectStageCockpit';
import { ProjectChecklists } from './ProjectChecklists';
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
import { AiDealModal } from '@/components/ai/AiDealModal';
import { ActivityComposer } from '@/components/shared/ActivityComposer';
import { EntityTimeline } from '@/components/shared/EntityTimeline';
import { openTimelineEvent } from '@/lib/timeline/open-event';
import { AiRunResultModal } from '@/components/ai/AiRunResultModal';
import type { AiRunRow } from '@/types/database';
import type { TimelineEvent } from '@/types/timeline';
import { calculateDealHealth } from '@/lib/utils/deal-health';
import { getDeliveryHealth, isDeliveryTerminal } from '@/lib/utils/delivery-health';
import { HealthDot } from '@/components/shared/HealthDot';
import { DeliveryHealthDot } from '@/components/shared/DeliveryHealthDot';
import { Badge } from '@/components/ui/Badge';
import { usePipelineStages } from '@/lib/hooks/use-pipelines';
import { deliveryKindLabel, hasTaskProgress } from '@/lib/constants/delivery-phases';
import { SpawnWizard } from './SpawnWizard';
import { canManageDeliveryProject } from '@/lib/utils/project-permissions';
import { safeHref } from '@/lib/utils/safe-href';
import { cn } from '@/lib/utils/cn';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import { useAuth } from '@/lib/hooks/use-auth';
import { ProjectTeam } from './ProjectTeam';
import { DealStakeholders } from './DealStakeholders';
import { InlineConfirm } from '@/components/ui/InlineConfirm';
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

/**
 * S-R3-TRUST-1: формула полноты уехала в домен (`lib/domain/deal-completeness.ts`),
 * состав правил и веса настраиваются организацией. Здесь остался только показ.
 *
 * Порог цвета теперь на `score`, а не на `filled`: прежний `filled >= 4` был завязан
 * на фиксированные 8 правил и при настраиваемом составе врал бы.
 */
function CompletenessBadge({ project }: { project: Project }) {
  const rules = useCompletenessRules();
  const { score, filled, total, missing } = useMemo(
    () => evaluateCompleteness(project, rules),
    [project, rules],
  );
  const [open, setOpen] = useState(false);

  const colorClass = score === 100
    ? 'bg-green-l text-green'
    : score >= 60
    ? 'bg-yellow-l text-yellow'
    : 'bg-red-l text-red';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        // S-UI-CLARITY-1: «6/8» само по себе не отличимо от процента стадии рядом
        title={`Заполнено ${filled} из ${total} ключевых полей сделки — полнота ${score}%`}
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}
      >
        {filled}/{total}
      </button>
      {open && missing.length > 0 && (
        <div className="absolute left-0 top-full z-10 mt-1 w-64 rounded-lg border border-border bg-popover p-2 elevation-2">
          <p className="mb-1 text-xs font-medium text-text-mute">Не заполнено:</p>
          {missing.map((rule) => (
            <div key={rule.key} className="py-0.5">
              <div className="text-xs text-text-dim">{rule.label}</div>
              {/* Суть оси достоверности: не «поле пустое», а что из-за этого не работает */}
              <div className="text-[0.6875rem] leading-snug text-text-mute">{rule.cost}</div>
            </div>
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
  const searchParams = useSearchParams();
  const { data: project, isLoading, error } = useProject(projectId);
  // Delivery P1: родительская сделка (для ссылки на карточке внедрения)
  const { data: parentDeal } = useProject(project?.parent_deal_id ?? '');
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  // S-R2-TRANSITION-1b: карточка не двигает стадию сама — открывает модалку
  // перехода. Она же собирает причину won/lost, поэтому двухшаговые инлайн-панели
  // «Выиграна»/«Проиграна» отсюда ушли (разрозненный UX, A5 роадмапа).
  const openTransition = useTransitionStore((s) => s.open);
  // Фазы delivery модалку не открывают (см. фазовый грид ниже) — им прямой вход 1a.
  const { moveToStageId } = useMoveProject();
  // P2b (B0): права управления delivery (команда/шаблон/CRUD фаз) = контракт RLS,
  // НЕ role !== 'viewer' — иначе кнопки давали бы 42501
  const { data: orgRole } = useOrgRole();
  const { user } = useAuth();

  // S-WIN-WIZARD-1: Win Wizard — контур/шаблон/owner при spawn внедрения
  // из won-сделки (заменил «голую» inline-панель шаблона + скролл-костыль).
  // R2-P0-E (079): ?spawn=1 — deep link из уведомления spawn_suggest. Это лишь
  // начальное состояние: рендер визарда всё равно под гейтом client+won ниже,
  // на открытой сделке ссылка просто приведёт на карточку.
  const [spawning, setSpawning] = useState(searchParams.get('spawn') === '1');

  // Клик по уведомлению, когда карточка этой же сделки уже открыта: soft-navigation
  // не размонтирует компонент, поэтому начальное состояние выше не сработает.
  const spawnParam = searchParams.get('spawn');
  useEffect(() => {
    if (spawnParam === '1') setSpawning(true);
  }, [spawnParam]);

  // 085: ?ai=1 — deep link на AI по сделке (бриф/сводка). Тот же приём, что ?spawn=1:
  // палитра команд не знает про локальный стейт карточки и открывает панель ссылкой.
  const [aiOpen, setAiOpen] = useState(searchParams.get('ai') === '1');
  const aiParam = searchParams.get('ai');
  useEffect(() => {
    if (aiParam === '1') setAiOpen(true);
  }, [aiParam]);

  // S-R2-TRANSITION-1b: локальное состояние отказа гейта снято — его владелец
  // теперь модалка перехода (StageTransitionModal), см. комментарий у баннера ниже.

  const { data: allPipelineStages } = usePipelineStages();

  const [modalOpen, setModalOpen] = useState(false);
  // S-DEBT-CONFIRM-1: удаление — оверлей с последствиями; откат стадии — тоже оверлей,
  // но с одним состоянием на все три воронки. Функцию в состоянии не держим: хранится
  // цель отката, а ветку выбирает обработчик (`kind`).
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [rollback, setRollback] = useState<
    { stageId: string; stageName: string; kind: 'deal' | 'delivery' } | null
  >(null);
  // P3: модалка завершения delivery (чеклист вех, гейт 038)
  const [completing, setCompleting] = useState(false);
  // S-IA-DELIVERY-1 (M2): null = «пользователь ещё не выбирал» → эффективный таб
  // деривируется от типа проекта ниже (delivery стартует на Плане, не на ленте).
  const [tab, setTab] = useState<Tab | null>(null);
  // M5 (F-10): материалы (1С:ДО/заметки/файлы/видео) свёрнуты по умолчанию — план к сгибу
  const [showMaterials, setShowMaterials] = useState(false);
  // S-R2-TRANSITION-1b: состояние двухшагового выбора причины (winning/losing/winDetail)
  // снято — причину собирает модалка перехода.
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [editingCall, setEditingCall] = useState<Call | null>(null);
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);

  // Клик по событию единой ленты → общий маппинг kind→действие (тот же, что contact/company)
  // S-AI-VIS-1: прогон, открытый кликом по AI-событию ленты (модалка просмотра).
  const [viewingRun, setViewingRun] = useState<AiRunRow | null>(null);

  function handleOpenEvent(e: TimelineEvent) {
    void openTimelineEvent(e, {
      router,
      onCall: (call) => { setEditingCall(call); setCallModalOpen(true); },
      onMeeting: (m) => { setEditingMeeting(m); setMeetingModalOpen(true); },
      onTask: (t) => { setEditingTask(t); setTaskModalOpen(true); },
      // S-AI-VIS-1: AI-событие ленты больше не молчит — открывает свой результат.
      onAiRun: (run) => setViewingRun(run),
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
    setConfirmingDelete(false);
    deleteProject.mutate(project.id, {
      onSuccess: () => router.push(backHref),
    });
  }

  /** Подтверждённый откат стадии — ветка та же, что была в обработчиках воронок. */
  function applyRollback() {
    if (!project || !rollback) return;
    const { stageId, kind } = rollback;
    setRollback(null);
    if (kind === 'deal') openTransition({ project, toStageId: stageId });
    else moveToStageId(project.id, stageId);
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
            {/* S-PIPELINE-COCKPIT-1 (F5): пилюля текущей стадии и пилюля «Состояние · фаза»
                отсюда УБРАНЫ — имя стадии живёт в ячейке кокпита ниже, и два места для
                одной величины были ровно тем дублем, который кокпит закрывает. */}
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
            {/* S-PIPELINE-COCKPIT-1 (F5): «· N дн. в стадии» уехало в ячейку кокпита —
                там возраст стоит рядом с нормой стадии и красится по её расходу,
                а не по хардкод-порогу 30 дней. */}
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
                    onClick={() =>
                      openTransition({
                        project,
                        toStageId: wonStage.id,
                        // S-WON-AUTO-1 сохранён: успешный выигрыш сразу предлагает
                        // Win Wizard. Отказ гейта → onCommitted не вызовется, мастер
                        // не откроется (как и раньше через onSuccess).
                        onCommitted: () => setSpawning(true),
                      })
                    }
                    className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text-dim
                               transition-colors hover:border-green/40 hover:text-green hover:bg-green-l"
                  >
                    Выиграна
                  </button>
                )}
                {lostStage && (
                  <button
                    onClick={() => openTransition({ project, toStageId: lostStage.id })}
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
                  // Модалка нужна и здесь (это переход), но причина не требуется —
                  // целевая стадия не won/lost; исход гасится тем же UPDATE.
                  openTransition({
                    project,
                    toStageId: firstStage.id,
                    resetOutcome: true,
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
          {/* 085: AI по сделке — только на клиентской сделке. Бриф к встрече и сводка
              собираются из полей сделки; у delivery/internal своя фактура и своих
              пресетов пока нет. */}
          {project.type === 'client' && (
            <button
              onClick={() => setAiOpen(true)}
              className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs
                         font-medium text-text-dim transition-colors hover:bg-surface-hover hover:text-text-main"
            >
              <Sparkles size={12} /> AI
            </button>
          )}
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
            onClick={() => setConfirmingDelete(true)}
            aria-label="Удалить"
            className="rounded-lg border border-border p-1.5 text-text-mute
                       transition-colors hover:bg-red/10 hover:text-red"
          >
            <Trash2 size={14} />
          </button>
          {confirmingDelete && (
            <InlineConfirm
              mode="overlay"
              question={`Удалить ${project.type === 'client' ? 'сделку' : 'проект'}?`}
              consequence="Связанные задачи сохранятся. Это действие нельзя отменить."
              pending={deleteProject.isPending}
              onConfirm={handleDelete}
              onCancel={() => setConfirmingDelete(false)}
            />
          )}
        </div>
      </div>

      {/* S-R2-TRANSITION-1b: инлайн-панели «Причина выигрыша/проигрыша» СНЯТЫ.
          Причина исхода собирается в модалке перехода вместе с самим переходом —
          два разных места для одного решения и были тем разрозненным UX, который
          закрывает A5 роадмапа. Кнопки «Выиграна»/«Проиграна» выше открывают её. */}

      {/* S-PIPELINE-COCKPIT-1: единый «Кокпит» вместо трёх разных языков воронки
          (DealProgressBar у ERP, StackedPipeline у IIoT, StackedPipeline у delivery).
          Кокпит сам решает, что показать: тайм-ячейку, готовность гейта, кнопку
          следующей стадии и карту воронки — контракты переходов прежние. */}
      {project.pipeline_id && project.stage_id && (project.type === 'client' || isDelivery) && (
        <div className="mb-6">
          <ProjectStageCockpit project={project} onRollback={setRollback} />
        </div>
      )}

      {/* R2-P1-G: sign-off чеклисты внедрения (083/084) — рядом с фазовым гридом и вехами,
          в одной зоне с тем, что гейт завершения проверяет. Компонент сам скрыт, если
          чеклистов нет и добавить нечего. */}
      {isDelivery && <ProjectChecklists project={project} />}

      {/* Focus panel — рабочая зона «что дальше»; только для активных сделок (client) */}
      {project.type === 'client' && project.status === 'open' && <DealFocusPanel project={project} />}

      {/* S-R2-TRANSITION-1b: баннер отказа гейта СНЯТ — отказ показывает модалка
          перехода, там же, где требования можно закрыть.
          S-PIPELINE-COCKPIT-1: отдельный чек-лист готовности (StageReadiness) тоже
          снят — те же требования и в тех же формулировках несёт элемент
          «готовность m/t» кокпита, рядом с кнопкой перехода, а не в третьем месте. */}

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

      {/* S-R2-D3: карта стейкхолдеров — сразу под info-grid, до Команды и Материалов.
          Участники со стороны клиента есть и у сделки, и у внедрения, поэтому без
          фильтра по типу проекта. Primary вычисляется из project.contact_id. */}
      <DealStakeholders
        projectId={projectId}
        primaryContactId={project.contact_id}
        primaryContact={project.contact ?? null}
        companyId={project.company_id}
      />

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
      {/* 085: AI по сделке — бриф к встрече и сводка (read-only) */}
      <AiDealModal
        isOpen={aiOpen && project.type === 'client'}
        onClose={() => setAiOpen(false)}
        projectId={projectId}
        projectName={project.name}
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

      {/* Откат стадии — одно подтверждение на все три воронки (S-DEBT-CONFIRM-1). */}
      {rollback && (
        <InlineConfirm
          mode="overlay"
          question={
            rollback.kind === 'deal'
              ? `Вернуть сделку на стадию «${rollback.stageName}»?`
              : `Вернуть проект на фазу «${rollback.stageName}»?`
          }
          confirmLabel="Вернуть"
          onConfirm={applyRollback}
          onCancel={() => setRollback(null)}
        />
      )}

      <AiRunResultModal run={viewingRun} onClose={() => setViewingRun(null)} />
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
