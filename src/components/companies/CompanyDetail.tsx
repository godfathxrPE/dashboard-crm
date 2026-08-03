'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft, Pencil, Trash2, Building2, Phone, Mail, Globe, MapPin, FileText,
  Users, FolderKanban, Loader2, AlertCircle, Activity, Rocket, AlertTriangle, RefreshCw,
} from 'lucide-react';
import { useCompany, useDeleteCompany, useUpdateCompany } from '@/lib/hooks/use-companies';
import { useCompanyLookup } from '@/lib/hooks/use-company-lookup';
import { innStatusLabel, isLookupableInn, isRiskyInnStatus } from '@/lib/utils/inn';
import { okvedToIndustry } from '@/lib/data/okved';
import { formatDateHuman } from '@/lib/utils/dates';
import { useContacts } from '@/lib/hooks/use-contacts';
import { useProjects } from '@/lib/hooks/use-projects';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import { projectHref } from '@/lib/utils/project-href';
import { usePipelineStages } from '@/lib/hooks/use-pipelines';
import { getDealHealth, compareByNextAction } from '@/lib/utils/deal-health';
import { getDeliveryHealth, isDeliveryTerminal } from '@/lib/utils/delivery-health';
import { DeliveryHealthDot } from '@/components/shared/DeliveryHealthDot';
import { DealHealthDot } from '@/components/shared/DealHealthDot';
import {
  splitCompanyProjects, countCompany360, formatCompany360Summary, isTerminalDeal,
} from '@/lib/utils/company-360';
import { formatDateShort } from '@/lib/utils/dates';
import { formatBudget } from '@/lib/validators/project';
import { Bracket } from '@/components/ui/Bracket';
import { PhoneList } from '@/components/shared/PhoneList';
import { CompanyModal } from './CompanyModal';
import { ProjectModal } from '@/components/projects/ProjectModal';
import { ContactModal } from '@/components/contacts/ContactModal';
import { EntityTimeline } from '@/components/shared/EntityTimeline';
import { ActivityComposer } from '@/components/shared/ActivityComposer';
import { openTimelineEvent } from '@/lib/timeline/open-event';
import { InlineConfirm } from '@/components/ui/InlineConfirm';
import { CallModal } from '@/components/calls/CallModal';
import { MeetingModal } from '@/components/meetings/MeetingModal';
import { TaskModal } from '@/components/tasks/TaskModal';
import type { Call } from '@/lib/hooks/use-calls';
import type { Meeting } from '@/lib/hooks/use-meetings';
import type { Task } from '@/types/entities';
import type { TimelineEvent } from '@/types/timeline';

interface CompanyDetailProps { companyId: string; }

export function CompanyDetail({ companyId }: CompanyDetailProps) {
  const router = useRouter();
  const { data: company, isLoading, error } = useCompany(companyId);
  const { data: allContacts } = useContacts();
  const { data: allProjects } = useProjects();
  const { data: allStages } = usePipelineStages();
  const deleteCompany = useDeleteCompany();
  const updateCompany = useUpdateCompany();
  const lookup = useCompanyLookup();
  const { data: orgRole } = useOrgRole();
  const canCreate = orgRole != null && orgRole !== 'viewer'; // T2: viewer не создаёт (RLS 42501)
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

  // Клик по событию ленты → общий маппинг kind→действие (тот же, что в контакте/сделке)
  function handleOpenEvent(e: TimelineEvent) {
    void openTimelineEvent(e, {
      router,
      onCall: (call) => { setEditingCall(call); setCallModalOpen(true); },
      onMeeting: (m) => { setEditingMeeting(m); setMeetingModalOpen(true); },
      onTask: (t) => { setEditingTask(t); setTaskModalOpen(true); },
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
    c.companies?.some((cc) => cc.company_id === companyId)
  );

  // Проекты этой компании — один массив из кеша `useProjects()`, делится на
  // продажи и внедрения на клиенте (S-R2-CO360: новых запросов не заводим).
  const linkedProjects = (allProjects ?? []).filter((p) => p.company_id === companyId);
  const { deals: linkedDeals, deliveries: linkedDeliveries } = splitCompanyProjects(linkedProjects);
  const counts = countCompany360({ deals: linkedDeals, deliveries: linkedDeliveries }, linkedContacts.length);

  // Открытые сделки вверх, терминальные вниз — тот же порядок, что в воронке.
  const sortedDeals = [...linkedDeals].sort(compareByNextAction);

  function handleDelete() {
    setConfirmingDelete(false);
    deleteCompany.mutate(companyId, { onSuccess: () => router.push('/companies') });
  }

  const infoFields = [
    { icon: Mail, label: 'Email', value: company.email },
    { icon: Globe, label: 'Сайт', value: company.website },
    { icon: MapPin, label: 'Адрес', value: company.address },
  ];
  const hasPhones = (company.phones?.length ?? 0) > 0 || !!company.phone;

  // ═══ S-INN-1: реквизиты ЕГРЮЛ ═══
  // ИНН уехал из общей сетки сюда: в одиночку он ничего не решает, а рядом с КПП,
  // ОГРН и статусом юрлица — это блок, по которому готовят договор.
  //
  // S-OKVED-1: ОКВЭД показываем кодом и, через тире, отраслью из справочника —
  // код без расшифровки в карточке бесполезен, а расшифровка без кода не сверяется
  // с выпиской. Отрасль здесь ВЫЧИСЛЯЕТСЯ, а не читается из `industry`: в поле
  // отрасли может лежать то, что менеджер написал руками, и подменять им реестр
  // нельзя. Не резолвится (пропуск в нумерации ОКВЭД) — показываем голый код.
  const okvedIndustry = okvedToIndustry(company.okved);
  const legalFields = [
    { label: 'ИНН', value: company.inn },
    { label: 'КПП', value: company.kpp ?? null },
    { label: 'ОГРН', value: company.ogrn ?? null },
    { label: 'ОКВЭД', value: company.okved ? (okvedIndustry ? `${company.okved} — ${okvedIndustry}` : company.okved) : null },
    { label: 'Юр. название', value: company.legal_name ?? null },
    { label: 'Юр. адрес', value: company.legal_address ?? null },
  ].filter((f) => f.value);
  const statusLabel = innStatusLabel(company.inn_status);
  const statusRisky = isRiskyInnStatus(company.inn_status);
  const hasLegal = legalFields.length > 0 || !!statusLabel;

  async function handleRefreshLegal() {
    const inn = company?.inn?.trim() ?? '';
    if (!isLookupableInn(inn)) return;
    try {
      const r = await lookup.mutateAsync(inn);
      if (!r.found) {
        toast.error('Компания с таким ИНН не найдена в ЕГРЮЛ');
        return;
      }
      // Пишем ТОЛЬКО юрполя. `name` и `address` не трогаем даже здесь: карточка
      // обновляет реквизиты, а не переименовывает компанию (инвариант фичи).
      await updateCompany.mutateAsync({
        id: companyId,
        legal_name: r.legal_name,
        kpp: r.kpp,
        ogrn: r.ogrn,
        legal_address: r.legal_address,
        inn_status: r.status,
        // S-OKVED-1: ОКВЭД в том же наборе — он такой же факт реестра. Отрасль
        // отсюда НЕ пишем: `industry` — рабочая классификация, и «Обновить
        // реквизиты» не повод переклассифицировать компанию за менеджера.
        okved: r.okved,
        inn_verified_at: new Date().toISOString(),
      });
      toast.success('Реквизиты обновлены из ЕГРЮЛ');
    } catch {
      // Текст показывает глобальный mutationCache.onError (toast).
    }
  }

  return (
    <>
      <button onClick={() => router.push('/companies')}
        className="mb-4 flex items-center gap-1 text-xs text-text-mute transition-colors hover:text-accent">
        <ArrowLeft size={14} /> Компании
      </button>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Building2 size={20} className="text-accent" />
            <h1 className="aura-page-title text-text-main">{company.name}</h1>
          </div>
          {company.industry && <p className="mt-1 text-sm text-text-dim">{company.industry}</p>}
        </div>
        <div className="flex items-center gap-1">
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

      {/* Info grid */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {hasPhones && (
          <Bracket className="px-3 py-2.5">
            <div className="mb-1 flex items-center gap-1 text-xs text-text-dim">
              <Phone size={10} /> Телефон
            </div>
            <PhoneList phones={company.phones} fallback={company.phone} />
          </Bracket>
        )}
        {infoFields.filter((f) => f.value).map((f) => (
          <Bracket key={f.label} className="px-3 py-2.5">
            <div className="mb-1 flex items-center gap-1 text-xs text-text-dim">
              <f.icon size={10} /> {f.label}
            </div>
            <div className="text-sm text-text-main">{f.value}</div>
          </Bracket>
        ))}
      </div>

      {/* ═══ Реквизиты (S-INN-1) ═══
          Блок появляется, только если есть что показать: у 36 компаний из 260 ИНН
          не заполнен вовсе, и пустая рамка «Реквизиты» на их карточках — шум.
          Кнопка «Обновить из ЕГРЮЛ» живёт здесь же и активна только при валидном
          ИНН: без него запрос слать нечем. */}
      {hasLegal && (
        <Bracket className="mb-6 p-4">
          <div className="mb-3 flex items-center gap-2">
            <FileText size={14} className="text-text-dim" />
            <span className="text-xs font-semibold text-text-main">Реквизиты</span>
            {statusLabel && (
              statusRisky ? (
                <span data-tag className="flex items-center gap-1 rounded bg-yellow-l/60 px-1.5 py-0.5 text-xs"
                  style={{ color: 'var(--yellow-text, var(--yellow))' }}>
                  <AlertTriangle size={10} /> {statusLabel}
                </span>
              ) : (
                <span data-tag className="rounded bg-surface2 px-1.5 py-0.5 text-xs text-text-mute">{statusLabel}</span>
              )
            )}
            {isLookupableInn(company.inn) && (
              <button
                onClick={handleRefreshLegal}
                disabled={lookup.isPending || updateCompany.isPending}
                className="ml-auto flex items-center gap-1 text-xs text-text-mute transition-colors
                           hover:text-text-main disabled:cursor-not-allowed disabled:opacity-50"
              >
                {lookup.isPending || updateCompany.isPending
                  ? <Loader2 size={11} className="animate-spin" />
                  : <RefreshCw size={11} />}
                Обновить из ЕГРЮЛ
              </button>
            )}
          </div>

          <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {legalFields.map((f) => (
              <div key={f.label} className="flex gap-2 text-sm">
                <span className="shrink-0 text-text-mute">{f.label}</span>
                <span className="text-text-main">{f.value}</span>
              </div>
            ))}
          </div>

          {company.inn_verified_at && (
            <p className="mt-3 text-xs text-text-mute">
              Сверено с ЕГРЮЛ · {formatDateHuman(company.inn_verified_at)}
            </p>
          )}
        </Bracket>
      )}

      {/* Notes */}
      {company.notes && (
        <div className="mb-6 rounded-xl border border-border/50 bg-surface/50 px-4 py-3">
          <p className="mb-1 text-xs font-medium text-text-dim">Заметки</p>
          <p className="text-sm text-text-main whitespace-pre-wrap">{company.notes}</p>
        </div>
      )}

      {/* S-R2-CO360: итоговая строка фактов — читается без прокрутки */}
      <p className="mb-3 text-sm text-text-dim tabular-nums">{formatCompany360Summary(counts)}</p>

      {/* Linked contacts & projects */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Contacts */}
        <Bracket className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <Users size={14} className="text-text-dim" />
            <span className="text-xs font-semibold text-text-main">Контакты</span>
            <span className="rounded-full bg-bg px-1.5 py-0.5 text-xs text-text-mute">{linkedContacts.length}</span>
            {canCreate && (
              <button onClick={() => setContactModalOpen(true)}
                className="ml-auto text-xs text-text-mute hover:text-text-main transition-colors">
                + Контакт
              </button>
            )}
          </div>
          {linkedContacts.length === 0 ? (
            <p className="text-xs text-text-mute italic">Нет привязанных контактов.</p>
          ) : (
            <div className="space-y-1.5">
              {linkedContacts.map((c) => {
                const role = c.companies?.find((cc) => cc.company_id === companyId)?.role;
                return (
                  <button key={c.id} onClick={() => router.push(`/contacts/${c.id}`)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-hover">
                    <span className="text-sm text-text-main">{c.first_name} {c.last_name}</span>
                    {role && <span data-tag className="rounded bg-accent-l px-1.5 py-0.5 text-xs text-accent">{role}</span>}
                    {c.position && <span className="ml-auto text-xs text-text-dim">{c.position}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </Bracket>

        {/* Projects */}
        <Bracket className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <FolderKanban size={14} className="text-text-dim" />
            <span className="text-xs font-semibold text-text-main">Сделки</span>
            <span className="rounded-full bg-bg px-1.5 py-0.5 text-xs text-text-mute">{counts.deals}</span>
            {canCreate && (
              <button onClick={() => setProjectModalOpen(true)}
                className="ml-auto text-xs text-text-mute hover:text-text-main transition-colors">
                + Сделка
              </button>
            )}
          </div>
          {sortedDeals.length === 0 ? (
            <p className="text-xs text-text-mute italic">Нет сделок. Привяжи компанию при создании сделки.</p>
          ) : (
            <div className="space-y-1.5">
              {sortedDeals.map((p) => {
                // Стадия из pipeline_stages (stage_id — истина, legacy `stage` не читаем)
                const stageName = (p.stage_id ? allStages?.find((s) => s.id === p.stage_id)?.name : null)
                  ?? '—';
                const dh = getDealHealth(p);
                // Закрытые сделки приглушены — вес строки отделяет их от открытых
                // без отдельного заголовка (S-R2-CO360).
                const closed = isTerminalDeal(p.status);
                return (
                  <button key={p.id} onClick={() => router.push(projectHref(p))}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-hover">
                    <DealHealthDot health={dh} />
                    <span className={closed ? 'text-sm text-text-mute' : 'text-sm text-text-main'}>{p.name}</span>
                    <span data-tag className={closed
                      ? 'rounded bg-surface2 px-1.5 py-0.5 text-xs text-text-mute'
                      : 'rounded bg-accent-l px-1.5 py-0.5 text-xs text-accent'}>
                      {stageName}
                    </span>
                    {p.budget != null && (
                      <span className={closed ? 'ml-auto text-xs text-text-mute' : 'ml-auto text-xs text-text-dim'}>
                        {formatBudget(p.budget)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </Bracket>
      </div>

      {/* ═══ Внедрения компании (S-R2-CO360) ═══
          «продали → делаем»: секция стоит между сделками и лентой активности.
          Внедрений нет → секции нет вовсе: пустой блок на каждой второй карточке — шум. */}
      {linkedDeliveries.length > 0 && (
        <Bracket className="mt-4 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Rocket size={14} className="text-text-dim" />
            {/* Заголовок называет ровно то, что перечисляет список: `internal` живёт
                здесь по контракту `splitCompanyProjects`, и сводка 360 над карточкой
                считает его отдельно («0 внедрений · 1 внутренний проект»). Без этой
                развилки на карточке стояли бы два разных числа под словом «внедрения». */}
            <span className="text-xs font-semibold text-text-main">
              {counts.internal > 0 ? 'Внедрения и внутренние' : 'Внедрения'}
            </span>
            {/* Счётчик секции считает то, что секция перечисляет, — а список ниже
                показывает и `internal` (см. контракт `splitCompanyProjects`).
                `counts.deliveries` тут дал бы «0» над непустым списком. */}
            <span className="rounded-full bg-bg px-1.5 py-0.5 text-xs text-text-mute">{linkedDeliveries.length}</span>
          </div>
          <div className="space-y-1.5">
            {linkedDeliveries.map((p) => {
              const stage = p.stage_id ? allStages?.find((s) => s.id === p.stage_id) : undefined;
              const stageName = stage?.name ?? '—';
              // Health — из project-level полей строки; isTerminal из стадии+статуса
              // (дословно как в DealDeliveryHub/PortfolioView — пороги не форкаем).
              const health = getDeliveryHealth({
                progress_done: p.progress_done,
                progress_total: p.progress_total,
                stage_entered_at: p.stage_entered_at,
                deadline: p.deadline,
                updated_at: p.updated_at,
                isTerminal: isDeliveryTerminal(stage, p.status),
              });
              return (
                <button key={p.id} onClick={() => router.push(projectHref(p))}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-hover">
                  <DeliveryHealthDot health={health} />
                  <span className="text-sm text-text-main">{p.name}</span>
                  {/* Внутренний проект (stage_id=null, вне воронки) — называем вещи
                      своими именами, чтобы секция «Внедрения» не выдавала его за внедрение. */}
                  {p.type === 'internal' ? (
                    <span data-tag className="rounded bg-surface2 px-1.5 py-0.5 text-xs text-text-mute">
                      Внутренний
                    </span>
                  ) : (
                    <span data-tag className="rounded bg-accent-l px-1.5 py-0.5 text-xs text-accent">
                      {stageName}
                    </span>
                  )}
                  {p.deadline && (
                    <span className="ml-auto text-xs text-text-dim" title={`Дедлайн: ${p.deadline}`}>
                      {formatDateShort(p.deadline)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Bracket>
      )}

      {/* ═══ Активность компании (единая лента всех связанных событий) ═══ */}
      <div className="mt-6">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-text-dim">
          <Activity size={14} />
          Активность
        </div>
        <ActivityComposer entityType="company" entityId={companyId} />
        <EntityTimeline entityType="company" entityId={companyId} options={{ includeSystem: true }} onOpenEvent={handleOpenEvent} />
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
    </>
  );
}
