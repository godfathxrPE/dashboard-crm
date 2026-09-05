'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Pencil, Trash2, Building2, Loader2, AlertCircle, Activity,
  AlertTriangle, Sparkles, Check,
} from 'lucide-react';
import { useCompany, useDeleteCompany } from '@/lib/hooks/use-companies';
import { innStatusLabel, isRiskyInnStatus } from '@/lib/utils/inn';
import { resolveChzProfile } from '@/lib/domain/chz-profile';
import { useContacts } from '@/lib/hooks/use-contacts';
import { useProjects } from '@/lib/hooks/use-projects';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import { usePipelineStages } from '@/lib/hooks/use-pipelines';
import { useUiStore } from '@/lib/stores/ui-store';
import { splitCompanyProjects, countCompany360 } from '@/lib/utils/company-360';
import { CompanyHighlights } from './CompanyHighlights';
import { CompanyDealsCard } from './CompanyDealsCard';
import { CompanyDeliveriesCard } from './CompanyDeliveriesCard';
import { CompanyContactsCard } from './CompanyContactsCard';
import { CompanySidebar } from './CompanySidebar';
import { CompanyModal } from './CompanyModal';
import { ProjectModal } from '@/components/projects/ProjectModal';
import { ContactModal } from '@/components/contacts/ContactModal';
import {
  EntityTimeline, TimelineFilterChips, type TimelineFilterValue,
} from '@/components/shared/EntityTimeline';
import { ActivityComposer } from '@/components/shared/ActivityComposer';
import { openTimelineEvent } from '@/lib/timeline/open-event';
import { AiRunResultModal } from '@/components/ai/AiRunResultModal';
import { CompanyAiDigest } from './CompanyAiDigest';
import type { AiRunRow } from '@/types/database';
import { InlineConfirm } from '@/components/ui/InlineConfirm';
import { AiCompanyModal } from '@/components/ai/AiCompanyModal';
import { CallModal } from '@/components/calls/CallModal';
import { MeetingModal } from '@/components/meetings/MeetingModal';
import { TaskModal } from '@/components/tasks/TaskModal';
import type { Call } from '@/lib/hooks/use-calls';
import type { Meeting } from '@/lib/hooks/use-meetings';
import { contactBelongsToCompany } from '@/lib/forms/derive-links';
import type { Task } from '@/types/entities';
import type { TimelineEvent, TimelineKind } from '@/types/timeline';

// ═══════════════════════════════════════════════════════
// S-R2-CO360-1 — карточка компании, пересобранная под «Company 360».
//
// Компонент держит ТОЛЬКО данные, состояние модалок и композицию: разметка
// секций живёт в CompanyHighlights / Company*Card / CompanySidebar. Прежняя
// версия рисовала всё сама и упиралась в потолок, о котором предупреждает
// ARCH-ревью («avoid 2k LOC file» → extract sections).
//
// Иерархия страницы отвечает порядку вопросов, ради которых её открывают:
//   полоса фактов → деньги (сделки) → работа (внедрения) → люди → лента,
// а справочное (реквизиты, контакты компании, ЧЗ, заметки) уехало в сайдбар.
// ═══════════════════════════════════════════════════════

interface CompanyDetailProps { companyId: string; }

/** Типы событий ленты компании. `ai_run` в наборе намеренно: без него
 *  `kindFilter` вырезал бы AI-прогоны из ленты вообще, а не просто убрал чип. */
const COMPANY_TIMELINE_KINDS: TimelineKind[] = ['call', 'meeting', 'task', 'activity', 'project', 'ai_run'];

export function CompanyDetail({ companyId }: CompanyDetailProps) {
  const router = useRouter();
  const { data: company, isLoading, error } = useCompany(companyId);
  const { data: allContacts } = useContacts();
  const { data: allProjects } = useProjects();
  const { data: allStages } = usePipelineStages();
  const deleteCompany = useDeleteCompany();
  const { data: orgRole } = useOrgRole();
  const canCreate = orgRole != null && orgRole !== 'viewer'; // T2: viewer не создаёт (RLS 42501)

  // Фильтр ленты — общий для всех компаний (ключ по ТИПУ сущности), переживает
  // уход со страницы и перезагрузку. Не в URL: личная настройка просмотра.
  const savedFilter = useUiStore((s) => s.timelineFilter['company']);
  const setTimelineFilter = useUiStore((s) => s.setTimelineFilter);
  // Значение из localStorage валидируется, а не берётся на веру: набор kinds
  // может поехать в следующем спринте, а сохранённый чип пережил бы это и молча
  // отфильтровал ленту в ноль — без подсвеченного чипа, который это объясняет.
  // S-UI-CLARITY-1: `note` — производный чип «Заметки» (срез внутри `activity`),
  // не kind, поэтому проверяется отдельным условием, а не через набор kinds.
  const timelineFilter: TimelineFilterValue =
    savedFilter === 'all' ||
    savedFilter === 'note' ||
    (savedFilter && COMPANY_TIMELINE_KINDS.includes(savedFilter as TimelineKind))
      ? (savedFilter as TimelineFilterValue)
      : 'all';

  const [modalOpen, setModalOpen] = useState(false);
  // S-DEBT-CONFIRM-1: оверлей, а не inline — удаление уводит со страницы, и текст
  // «связанные контакты и сделки сохранятся» здесь несёт смысл.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [editingCall, setEditingCall] = useState<Call | null>(null);
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [aiModalOpen, setAiModalOpen] = useState(false);

  // Клик по событию ленты → общий маппинг kind→действие (тот же, что в контакте/сделке)
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

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Loader2 size={24} className="animate-spin text-accent" /></div>;

  if (error || !company) {
    return (
      <div className="rounded-xl border border-red/30 bg-red/5 p-8 text-center">
        <AlertCircle size={24} className="mx-auto text-red" />
        <p className="mt-2 text-sm text-red">Компания не найдена</p>
        <button onClick={() => router.push('/companies')} className="mt-3 text-xs text-accent hover:underline">
          ← Вернуться к списку
        </button>
      </div>
    );
  }

  // Контакты, привязанные к этой компании
  const linkedContacts = (allContacts ?? []).filter((c) =>
    contactBelongsToCompany(c, companyId)
  );

  // Проекты этой компании — один массив из кеша `useProjects()`, делится на
  // продажи и внедрения на клиенте (новых запросов не заводим).
  const linkedProjects = (allProjects ?? []).filter((p) => p.company_id === companyId);
  const { deals: linkedDeals, deliveries: linkedDeliveries } = splitCompanyProjects(linkedProjects);
  const counts = countCompany360({ deals: linkedDeals, deliveries: linkedDeliveries }, linkedContacts.length);

  // Маркировочный профиль «Честного Знака» — без AI и без запросов.
  // S-LEAD-CARRY-1: источников теперь два, и они не равны. Подтверждённое человеком
  // (`companies.chz_groups`, приезжает с лида при конверсии) побеждает гипотезу,
  // выведенную КОДОМ из ОКВЭД. Кто победил — говорит `chz.source`, и подпись под
  // профилем обязана это отражать: приписывать человеческий ввод реестру нечестно.
  const chz = resolveChzProfile(company.chz_groups, company.okved);

  const statusLabel = innStatusLabel(company.inn_status);
  const statusRisky = isRiskyInnStatus(company.inn_status);

  function handleDelete() {
    setConfirmingDelete(false);
    deleteCompany.mutate(companyId, { onSuccess: () => router.push('/companies') });
  }

  return (
    <>
      <button onClick={() => router.push('/companies')}
        className="mb-4 flex items-center gap-1 text-xs text-text-mute transition-colors hover:text-accent">
        <ArrowLeft size={14} /> Компании
      </button>

      {/* ═══ Header ═══
          Плитка-логотип + название + подстрока идентичности записи (отрасль,
          статус юрлица, ИНН). Статус и ИНН стоят ЗДЕСЬ, а не только в реквизитах:
          в сайдбаре они про выписку, в шапке — про то, с кем вообще имеем дело. */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="entity-tile h-[46px] w-[46px] shrink-0">
            <Building2 size={22} />
          </div>
          <div className="min-w-0">
            <h1 className="aura-page-title truncate text-text-main">{company.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-dim">
              {company.industry && <span className="truncate">{company.industry}</span>}
              {statusLabel && (
                statusRisky ? (
                  <span data-tag className="flex items-center gap-1 rounded bg-yellow-l px-1.5 py-0.5 text-xs"
                    style={{ color: 'var(--yellow-text, var(--yellow))' }}>
                    <AlertTriangle size={10} /> {statusLabel}
                  </span>
                ) : (
                  <span data-tag className="flex items-center gap-1 rounded bg-green-l px-1.5 py-0.5 text-xs"
                    style={{ color: 'var(--green-text, var(--green))' }}>
                    <Check size={10} /> {statusLabel}
                  </span>
                )
              )}
              {company.inn && (
                <span data-tag className="rounded bg-surface2 px-1.5 py-0.5 text-xs tabular-nums text-text-mute">
                  ИНН {company.inn}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {/* S-COMPANY-AI-1 (F3). Кнопка живёт в шапке, а не в блоке реквизитов:
              бриф строится по названию компании и не требует ни ИНН, ни ОКВЭД, а
              блок реквизитов у 36 компаний из 260 не рендерится вовсе — вход в
              фичу был бы им недоступен. */}
          <button onClick={() => setAiModalOpen(true)}
            className="flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs text-text-mute transition-colors hover:bg-surface-hover hover:text-text-main">
            <Sparkles size={13} className="text-accent" /> AI-бриф
          </button>
          {/* Primary в шапке: главное действие карточки компании — завести сделку.
              `bg-accent` — ремапы тем сделают её графитовой/чёрной/torii сами. */}
          {canCreate && (
            <button onClick={() => setProjectModalOpen(true)}
              className="rounded-lg bg-accent px-2.5 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90">
              + Сделка
            </button>
          )}
          <button onClick={() => setModalOpen(true)}
            className="rounded-lg border border-border p-1.5 text-text-mute transition-colors hover:bg-surface-hover hover:text-text-main">
            <Pencil size={14} />
          </button>
          <button onClick={() => setConfirmingDelete(true)}
            className="rounded-lg border border-border p-1.5 text-text-mute transition-colors hover:bg-red/10 hover:text-red">
            <Trash2 size={14} />
          </button>
          {confirmingDelete && (
            <InlineConfirm
              mode="overlay"
              question="Удалить компанию?"
              consequence="Связанные контакты и сделки сохранятся."
              pending={deleteCompany.isPending}
              onConfirm={handleDelete}
              onCancel={() => setConfirmingDelete(false)}
            />
          )}
        </div>
      </div>

      {/* ═══ Highlight-полоса (F6) ═══ */}
      <CompanyHighlights
        companyId={companyId}
        deals={linkedDeals}
        deliveries={linkedDeliveries}
        stages={allStages}
        chzGroups={chz.groups}
        chzSource={chz.source}
      />

      {/* ═══ Основной поток + справочный сайдбар ═══ */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <CompanyDealsCard
            deals={linkedDeals}
            stages={allStages}
            canCreate={canCreate}
            onCreate={() => setProjectModalOpen(true)}
          />

          <CompanyDeliveriesCard
            deals={linkedDeals}
            deliveries={linkedDeliveries}
            stages={allStages}
            canCreate={canCreate}
            internalCount={counts.internal}
          />

          <CompanyContactsCard
            companyId={companyId}
            contacts={linkedContacts}
            canCreate={canCreate}
            onCreate={() => setContactModalOpen(true)}
          />

          {/* ═══ Активность (единая лента всех связанных событий) ═══
              Чипы фильтра стоят НАД композером (порядок мокапа), поэтому лента
              получает `showFilters={false}` — второго ряда чипов не появляется. */}
          <div data-card className="rounded-lg border border-border bg-surface p-4">
            <div className="mb-3 flex items-center gap-2">
              <Activity size={14} className="text-text-dim" />
              <span className="text-xs font-semibold text-text-main">Активность</span>
            </div>
            <TimelineFilterChips
              className="mb-3"
              kinds={COMPANY_TIMELINE_KINDS}
              value={timelineFilter}
              onChange={(v) => setTimelineFilter('company', v)}
            />
            <ActivityComposer entityType="company" entityId={companyId} />
            <EntityTimeline
              entityType="company"
              entityId={companyId}
              onOpenEvent={handleOpenEvent}
              kindFilter={COMPANY_TIMELINE_KINDS}
              splitUpcoming
              showFilters={false}
              filter={timelineFilter}
              onFilterChange={(v) => setTimelineFilter('company', v)}
            />
          </div>

          {/* S-AI-VIS-2: всё, что AI знает про компанию, — одним блоком под лентой:
              её расшифровки и её прогоны (включая собственные брифы). */}
          <CompanyAiDigest companyId={companyId} />
        </div>

        <CompanySidebar
          company={company}
          chzGroups={chz.groups}
          chzSource={chz.source}
          chzUnknown={chz.unknown}
        />
      </div>

      <CompanyModal isOpen={modalOpen} onClose={() => setModalOpen(false)} editCompany={company} />
      <ProjectModal isOpen={projectModalOpen} onClose={() => setProjectModalOpen(false)} editProject={null} defaultCompanyId={companyId} />
      <ContactModal
        isOpen={contactModalOpen}
        onClose={() => setContactModalOpen(false)}
        editContact={null}
        defaultCompanyId={companyId}
      />
      <CallModal isOpen={callModalOpen} onClose={() => { setCallModalOpen(false); setEditingCall(null); }} editCall={editingCall} defaultCompanyId={companyId} />
      <MeetingModal isOpen={meetingModalOpen} onClose={() => { setMeetingModalOpen(false); setEditingMeeting(null); }} editMeeting={editingMeeting} defaultCompanyId={companyId} />
      <TaskModal isOpen={taskModalOpen} onClose={() => { setTaskModalOpen(false); setEditingTask(null); }} editTask={editingTask} defaultCompanyId={companyId} />
      <AiCompanyModal
        isOpen={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        companyId={companyId}
        companyName={company.name}
      />

      <AiRunResultModal run={viewingRun} onClose={() => setViewingRun(null)} />
    </>
  );
}
