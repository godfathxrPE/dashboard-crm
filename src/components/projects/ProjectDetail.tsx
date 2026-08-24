'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Plus,
  Loader2,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { useProject, type Project } from '@/lib/hooks/use-projects';
import { useMoveProject } from '@/lib/hooks/use-stage-transition';
import { useTransitionStore } from '@/lib/stores/transition-store';
import type { ProjectType } from '@/types/database';
import type { Call } from '@/lib/hooks/use-calls';
import type { Meeting } from '@/lib/hooks/use-meetings';
import { DeliveryCompletionModal } from './DeliveryCompletionModal';
import { DealDeliveryHub } from './DealDeliveryHub';
import { CompletenessBadge } from './CompletenessBadge';
import { DealHeader } from './DealHeader';
import { DealNextStep } from './DealNextStep';
import { DealContextRail } from './DealContextRail';
import { useDealSignals } from './DealSignals';
import { ProjectStageCockpit } from './ProjectStageCockpit';
import { ProjectChecklists } from './ProjectChecklists';
import { ProjectMaterials } from './ProjectMaterials';
import { ProjectChat } from './ProjectChat';
import { QuotesTab } from './QuotesTab';
import { DealStageStory } from './DealStageStory';
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
import { getDeliveryHealth, isDeliveryTerminal } from '@/lib/utils/delivery-health';
import { usePipelineStages } from '@/lib/hooks/use-pipelines';
import { SpawnWizard } from './SpawnWizard';
import { canManageDeliveryProject } from '@/lib/utils/project-permissions';
import { cn } from '@/lib/utils/cn';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import { useAuth } from '@/lib/hooks/use-auth';
import { ProjectTeam } from './ProjectTeam';
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
// Main Detail View
// ═══════════════════════════════════════════════════════

// PCT-1/S-IA-DELIVERY-1: вкладки нижней секции карточки
type Tab = 'activity' | 'board' | 'timeline' | 'quotes' | 'story' | 'chat';

interface ProjectDetailProps {
  projectId: string;
  /**
   * S-IA-DELIVERY-1 (§3.1): роут-контекст для error-state, когда project не
   * загрузился и его type неизвестен: /deals/[id] → 'deal', /projects/[id] → 'project'.
   */
  context: 'deal' | 'project';
}

/**
 * Гейт загрузки. Тело вынесено отдельным компонентом не ради красоты: сбор
 * сигналов (`useDealSignals`) — хук, а он требует загруженный `project`.
 * Вызвать его после раннего `return` нельзя — порядок хуков обязан совпадать
 * на всех рендерах; поэтому загрузка и тело разведены по разным компонентам.
 */
export function ProjectDetail({ projectId, context }: ProjectDetailProps) {
  const router = useRouter();
  const { data: project, isLoading, error } = useProject(projectId);

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

  return <ProjectDetailBody project={project} projectId={projectId} />;
}

function ProjectDetailBody({ project, projectId }: { project: Project; projectId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Delivery P1: родительская сделка (для ссылки на карточке внедрения)
  const { data: parentDeal } = useProject(project.parent_deal_id ?? '');
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
  // S-DEBT-CONFIRM-1: откат стадии — оверлей с одним состоянием на все три
  // воронки. Функцию в состоянии не держим: хранится цель отката, а ветку
  // выбирает обработчик (`kind`). Подтверждение удаления живёт в DealHeader.
  const [rollback, setRollback] = useState<
    { stageId: string; stageName: string; kind: 'deal' | 'delivery' } | null
  >(null);
  // P3: модалка завершения delivery (чеклист вех, гейт 038)
  const [completing, setCompleting] = useState(false);
  // S-IA-DELIVERY-1 (M2): null = «пользователь ещё не выбирал» → эффективный таб
  // деривируется от типа проекта ниже (delivery стартует на Плане, не на ленте).
  const [tab, setTab] = useState<Tab | null>(null);
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

  // Routing-контракт P1: client живёт на /deals, delivery/internal — на /projects
  const backHref = project.type === 'client' ? '/deals' : '/projects';
  const backLabel = project.type === 'client' ? 'Воронка сделок' : 'Проекты';
  const isDelivery = project.type === 'delivery';
  // P2b (B0): единые права управления delivery-проектом (= гарды RLS/RPC)
  const canManage = canManageDeliveryProject(project, orgRole, user?.id);
  // M2: до явного выбора пользователя — дефолт по типу (derived, без effect):
  // внедрение живёт планом/датами → «План»; client/internal — лента, как раньше.
  const activeTab: Tab = tab ?? (isDelivery ? 'board' : 'activity');

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

  // Контекст сигналов собирается ЗДЕСЬ и раздаётся пропами в шаг и в рельсу:
  // второй сборщик означал бы вторую формулу нормы стадии рядом с первой.
  const signals = useDealSignals(project);
  // Рабочий шаг есть только у открытой сделки. От него зависит раскладка грида:
  // без него рельса и вкладки делят первую строку, с ним рельса тянется на две.
  const hasNextStep = project.type === 'client' && project.status === 'open';

  /** Подтверждённый откат стадии — ветка та же, что была в обработчиках воронок. */
  function applyRollback() {
    if (!rollback) return;
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

      <DealHeader
        project={project}
        isDelivery={isDelivery}
        canManage={canManage}
        allPipelineStages={allPipelineStages}
        backHref={backHref}
        onSpawn={() => setSpawning(true)}
        onComplete={() => setCompleting(true)}
        onOpenAi={() => setAiOpen(true)}
        onEdit={() => setModalOpen(true)}
      />

      {/* S-R2-TRANSITION-1b: инлайн-панели «Причина выигрыша/проигрыша» СНЯТЫ.
          Причина исхода собирается в модалке перехода вместе с самим переходом —
          два разных места для одного решения и были тем разрозненным UX, который
          закрывает A5 роадмапа. Кнопки «Выиграна»/«Проиграна» выше открывают её. */}

      {/* S-PIPELINE-COCKPIT-1: единый «Кокпит» вместо трёх разных языков воронки
          (DealProgressBar у ERP, StackedPipeline у IIoT, StackedPipeline у delivery).
          Кокпит сам решает, что показать: тайм-ячейку, готовность гейта, кнопку
          следующей стадии и карту воронки — контракты переходов прежние. */}
      {/* Кокпит — во всю ширину карточки: раскрытой карте воронки нужна ширина,
          в колонке 1100px одиннадцать стадий дают наезд подписей (R-04). */}
      {project.pipeline_id && project.stage_id && (project.type === 'client' || isDelivery) && (
        <div className="mb-5">
          <ProjectStageCockpit project={project} onRollback={setRollback} />
        </div>
      )}

      {/* R2-P1-G: sign-off чеклисты внедрения (083/084) — рядом с фазовым гридом и вехами,
          в одной зоне с тем, что гейт завершения проверяет. Компонент сам скрыт, если
          чеклистов нет и добавить нечего. */}
      {isDelivery && <ProjectChecklists project={project} />}

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

      {/* ═══ Двухколонник: работа слева, контекст справа (R-02, R-03) ═══
          Рельса занимает вторую колонку целиком (`row-span-2`), поэтому на
          широком экране она стоит вровень с шагом, а не под ним. Ниже `lg`
          колонок нет и порядок задаёт `order-*`: шаг → контекст → вкладки.
          Перестановкой JSX это не выражается — рельса обязана быть ОДНИМ узлом. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {hasNextStep && (
          <div className="order-1 min-w-0 lg:col-start-1 lg:row-start-1">
            <DealNextStep project={project} signals={signals} />
          </div>
        )}

        <DealContextRail
          project={project}
          projectId={projectId}
          isDelivery={isDelivery}
          signals={signals}
          deliveryHealth={deliveryHealth}
          parentDeal={parentDeal}
          completenessBadge={!isDelivery ? <CompletenessBadge project={project} /> : undefined}
          onEdit={() => setModalOpen(true)}
          className={cn(
            'order-2 lg:col-start-2 lg:row-start-1',
            hasNextStep && 'lg:row-span-2',
          )}
        />

        <div
          className={cn(
            'order-3 min-w-0 lg:col-start-1',
            hasNextStep ? 'lg:row-start-2' : 'lg:row-start-1',
          )}
        >
          {/* P2b (B2): команда — full-width секция; S-TEAM-ROLES-1: роли фильтруются по категории (direction+type) */}
          {isDelivery && (
            <ProjectTeam
              projectId={projectId}
              canManage={canManage}
              direction={project.direction}
              type={project.type as ProjectType}
            />
          )}

          <ProjectMaterials
            project={project}
            projectId={projectId}
            isDelivery={isDelivery}
            canManage={canManage}
          />

          {/* PCT-1: вкладки Активность / Доска задач */}
          <div className="mb-3 flex gap-1 border-b border-border">
            {([
              { value: 'activity' as const, label: 'Активность' },
              // P2a: у delivery доска = фазовый план внедрения
              { value: 'board' as const, label: isDelivery ? 'План' : 'Доска задач' },
              { value: 'timeline' as const, label: 'Гант' },
              // S-QUOTE-1: вкладка «КП» — только для сделок (type='client')
              ...(project.type === 'client' ? [{ value: 'quotes' as const, label: 'КП' }] : []),
              // S-STAGE-STORY-1: траектория по стадиям — тоже только для сделок:
              // у внедрения фазы СДР, и «возвраты» там означают другое.
              ...(project.type === 'client' ? [{ value: 'story' as const, label: 'История' }] : []),
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

          {/* S-STAGE-STORY-1: траектория сделки по стадиям — сводка, не пересказ ленты */}
          {activeTab === 'story' && project.type === 'client' && (
            <DealStageStory project={project} />
          )}

          {/* S-CHAT-1: чат команды проекта (realtime) */}
          {activeTab === 'chat' && <ProjectChat projectId={projectId} />}

          {/* ═══ Активность сделки — единая лента (звонки/встречи/задачи/лог/AI) + заметка ═══ */}
          <div id="deal-activity" className={`mb-4 rounded-xl border border-border bg-surface p-4 ${activeTab === 'activity' ? '' : 'hidden'}`}>
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

        </div>
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
