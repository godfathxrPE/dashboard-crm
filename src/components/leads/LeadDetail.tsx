'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight,
  Loader2,
  Phone,
  Plus,
  Target,
  Building2,
  User,
  Mail,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useLead, useLeadStatusChange, useUpdateLead } from '@/lib/hooks/use-leads';
import { useUiStore } from '@/lib/stores/ui-store';
import { daysSince } from '@/lib/utils/date-helpers';
import { getLeadHealth, getLeadActionOverdueDays } from '@/lib/utils/lead-health';
import { LeadHealthMark } from './LeadHealthMark';
import { PipelineCockpit } from '@/components/shared/PipelineCockpit';
import { StageRail } from '@/components/shared/StageRail';
import { formatBudget } from '@/lib/validators/project';
import { formatPhone } from '@/lib/utils/phone';
import { STAKEHOLDER_ROLE_CONFIG } from '@/lib/constants/stakeholders';
import {
  LEAD_SOURCE_CONFIG,
  LEAD_STATUS_CONFIG,
  LEAD_TEMPERATURE_CONFIG,
  LEAD_BUDGET_STATUS_CONFIG,
  DISQUALIFY_REASON_CONFIG,
  disqualifyReasons,
  type DisqualifyReason,
} from '@/lib/validators/lead';
import { Badge } from '@/components/ui/Badge';
import { InlineEdit } from '@/components/ui/InlineEdit';
import { EntityTimeline } from '@/components/shared/EntityTimeline';
import { ActivityComposer } from '@/components/shared/ActivityComposer';
import { openTimelineEvent } from '@/lib/timeline/open-event';
import { CallModal } from '@/components/calls/CallModal';
import { TaskModal } from '@/components/tasks/TaskModal';
import { LeadModal } from './LeadModal';
import { LeadConversionModal } from './LeadConversionModal';
import type { Call } from '@/lib/hooks/use-calls';
import type { Task } from '@/types/entities';
import type { LeadStatus, StakeholderRole } from '@/types/database';

// ═══════════════════════════════════════════════════════
// Карточка лида (S-LEAD-HUB-2a).
//
// НЕ клон ProjectDetail (54 КБ): лид живёт дни, экран обязан читаться за пять
// секунд — статус, следующий шаг, квалификация, лента касаний. Вкладок нет.
//
// Мутации свои НЕ заводятся: статус — `useLeadStatusChange` (одна с канбаном),
// поля — `useUpdateLead`, конверсия — `LeadConversionModal`.
// ═══════════════════════════════════════════════════════

/** Колонки степпера. `disqualified` сюда НЕ входит — это терминальная ветка, а не шаг. */
const STEPPER: { status: LeadStatus; label: string }[] = [
  { status: 'new', label: 'Новый' },
  { status: 'contacted', label: 'Контакт' },
  { status: 'qualified', label: 'Квалифицирован' },
  { status: 'converted', label: 'Конвертирован' },
];

function formatActionDate(value: string): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const today = new Date(new Date().toDateString());
  const target = new Date(new Date(d).toDateString());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return 'сегодня';
  if (diffDays === 1) return 'завтра';
  if (diffDays === -1) return 'вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

/** Месяцев до обязательности маркировки; null — дальше года или дата в прошлом. */
function regulatoryMonths(deadline: string | null): number | null {
  const d = deadline ? new Date(deadline) : null;
  if (!d || isNaN(d.getTime())) return null;
  const days = Math.round((d.getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
  if (days < 0 || days > 366) return null;
  return Math.max(0, Math.round(days / 30));
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 text-xs text-text-mute">{label}</div>
      <div className="text-sm text-text-main">{children}</div>
    </div>
  );
}

export function LeadDetail({ leadId }: { leadId: string }) {
  const router = useRouter();
  const { data: lead, isLoading, error } = useLead(leadId);
  const updateLead = useUpdateLead();
  const status = useLeadStatusChange();
  const openModal = useUiStore((s) => s.openModal);

  const [editOpen, setEditOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  // Локальные модалки — только для РЕДАКТИРОВАНИЯ события, открытого из ленты.
  // Создание идёт через ui-store (`openModal`), как просит спринт: у карточки лида
  // те же «+Звонок»/«+Задача», что у палитры, и один префилл-контекст на оба пути.
  const [editingCall, setEditingCall] = useState<Call | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const handleOpenEvent = useCallback(
    (e: Parameters<typeof openTimelineEvent>[0]) => {
      void openTimelineEvent(e, {
        router,
        onCall: (call) => setEditingCall(call),
        onTask: (t) => setEditingTask(t),
      });
    },
    [router],
  );

  const health = useMemo(() => (lead ? getLeadHealth(lead) : null), [lead]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 size={24} className="animate-spin text-accent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red/30 bg-red/5 p-6 text-center">
        <p className="text-sm text-red">Ошибка загрузки лида</p>
      </div>
    );
  }

  // Пустое состояние ОТЛИЧАЕТСЯ от ошибки намеренно (FIX S-TL-1-RPC-THIS):
  // «не найден» — это удалённый или чужой лид, а не сбой запроса.
  if (!lead) {
    return (
      <div className="rounded-xl border border-border bg-surface p-8 text-center">
        <Target size={28} className="mx-auto mb-2 text-text-mute" />
        <p className="text-sm text-text-dim">Лид не найден</p>
        <Link href="/leads" className="mt-3 inline-block text-sm text-accent hover:underline">
          Ко всем лидам
        </Link>
      </div>
    );
  }

  const isConverted = lead.status === 'converted';
  const isDisqualified = lead.status === 'disqualified';
  const readOnly = isConverted;
  const stepIndex = STEPPER.findIndex((s) => s.status === lead.status);
  const currentStepLabel =
    LEAD_STATUS_CONFIG[lead.status]?.label ?? STEPPER[stepIndex]?.label ?? lead.status;

  // Следующий шаг статуса — ТЕ ЖЕ мутации, что были у кнопок степпера (одна
  // мутация с канбаном), просто собраны в один объект для кокпита.
  const nextStep =
    lead.status === 'new'
      ? { label: 'Связаться', locked: false, onClick: () => status.change(lead.id, 'contacted') }
      : lead.status === 'contacted'
        ? { label: 'Квалифицировать', locked: false, onClick: () => status.change(lead.id, 'qualified') }
        : lead.status === 'qualified'
          ? { label: 'Конвертировать', locked: false, onClick: () => setConvertOpen(true) }
          : null;
  const overdueDays = lead.next_action_date ? getLeadActionOverdueDays(lead.next_action_date) : 0;
  const regMonths = regulatoryMonths(lead.regulatory_deadline);
  const contactedDays = lead.first_contacted_at ? daysSince(lead.first_contacted_at) : null;
  const roleLabel = lead.decision_role
    ? STAKEHOLDER_ROLE_CONFIG[lead.decision_role as StakeholderRole]?.full ?? lead.decision_role
    : null;

  return (
    <>
      {/* ═══ Шапка ═══ */}
      <div className="mb-4">
        <Link href="/leads" className="text-xs text-text-mute transition-colors hover:text-text-main">
          ← Лиды
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="aura-page-title text-text-main">{lead.title}</h1>
              {lead.source && (
                <Badge color="accent" size="sm">
                  {LEAD_SOURCE_CONFIG[lead.source]?.label ?? lead.source}
                </Badge>
              )}
              {lead.temperature && (
                <Badge color={LEAD_TEMPERATURE_CONFIG[lead.temperature].color} size="sm">
                  {LEAD_TEMPERATURE_CONFIG[lead.temperature].label}
                </Badge>
              )}
              {lead.direction && (
                <Badge color={lead.direction === 'erp' ? 'purple' : 'blue'} size="sm">
                  {lead.direction === 'iiot' ? 'IIoT' : 'ERP'}
                </Badge>
              )}
              {regMonths !== null && (
                <Badge color="yellow" size="sm">
                  {regMonths === 0 ? 'ЧЗ: срок наступил' : `ЧЗ через ${regMonths} мес.`}
                </Badge>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-dim">
              {lead.company_name_raw && (
                <span className="flex items-center gap-1"><Building2 size={11} />{lead.company_name_raw}</span>
              )}
              {lead.contact_name_raw && (
                <span className="flex items-center gap-1"><User size={11} />{lead.contact_name_raw}</span>
              )}
              {lead.phone && (
                <span className="flex items-center gap-1"><Phone size={11} />{formatPhone(lead.phone)}</span>
              )}
              {lead.email && (
                <span className="flex items-center gap-1"><Mail size={11} />{lead.email}</span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isConverted && lead.converted_deal_id ? (
              <button
                onClick={() => router.push(`/deals/${lead.converted_deal_id}`)}
                className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
              >
                К сделке <ArrowRight size={12} />
              </button>
            ) : (
              <>
                <button
                  onClick={() => setEditOpen(true)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-dim transition-colors hover:bg-surface2"
                >
                  Ред.
                </button>
                {/* Гейт S-PIPELINE-COCKPIT-1: «Конвертировать» здесь снята — действие воронки
                    живёт ТОЛЬКО в кокпите (кнопка next у qualified). Дубль CTA в шапке и в
                    строке кокпита предлагал одно действие дважды. «К сделке» выше — навигация,
                    она остаётся. */}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ═══ Кокпит статусов ═══ */}
      <div className="mb-4 rounded-xl border border-border bg-surface p-3">
        {isDisqualified ? (
          // Терминальная ветка — отдельной меткой, а не колонкой степпера:
          // дисквалификация это не «шаг назад по воронке», а выход из неё.
          <div className="flex flex-wrap items-center gap-2">
            <Badge color="red" size="sm">Дисквалифицирован</Badge>
            {lead.disqualify_reason && (
              <span className="text-sm text-text-dim">
                {DISQUALIFY_REASON_CONFIG[lead.disqualify_reason as DisqualifyReason]?.label
                  ?? lead.disqualify_reason}
              </span>
            )}
            <button
              onClick={() => status.change(lead.id, 'new')}
              className="ml-auto rounded-lg border border-border px-2.5 py-1 text-xs text-text-dim transition-colors hover:bg-surface2"
            >
              Восстановить
            </button>
          </div>
        ) : (
          <>
            {/* S-PIPELINE-COCKPIT-1: тот же кокпит, что у сделки и проекта внедрения.
                Тайм-часть ячейки НЕ выдумывается (`gauge={null}`): у лида нет ни
                stage_entered_at, ни норм стадий — сигнал времени несут LeadHealthMark
                в ячейке и строка фокус-панели, и второй источник тут врал бы. */}
            <PipelineCockpit
              pastCount={stepIndex > 0 ? stepIndex : 0}
              pastNames={STEPPER.slice(0, Math.max(0, stepIndex)).map(
                (s) => LEAD_STATUS_CONFIG[s.status]?.label ?? s.label,
              )}
              current={{ name: currentStepLabel }}
              gauge={null}
              currentExtra={<LeadHealthMark lead={lead} />}
              gate={null}
              next={nextStep}
              extraActions={
                lead.status === 'contacted' && !rejecting ? (
                  <button
                    onClick={() => setRejecting(true)}
                    className="rounded-lg px-2.5 py-1 text-xs font-medium text-red transition-colors hover:bg-red-l"
                  >
                    Отклонить
                  </button>
                ) : null
              }
              restCount={stepIndex >= 0 ? STEPPER.length - stepIndex - 1 : 0}
              metaRight={stepIndex >= 0 ? `${stepIndex + 1} из ${STEPPER.length}` : null}
              locked={isConverted}
              map={
                // Карта лида read-only: откат статуса из карты — отдельное продуктовое
                // решение (у лида нет ни модалки перехода, ни подтверждения отката).
                <StageRail
                  stages={STEPPER.map((step) => ({
                    id: step.status,
                    name: LEAD_STATUS_CONFIG[step.status]?.label ?? step.label,
                  }))}
                  currentIndex={stepIndex}
                  locked
                />
              }
            />

            {rejecting && (
              <div className="mt-2 flex w-full flex-wrap items-center gap-1 border-t border-border/50 pt-2">
                <span className="w-full text-xs text-text-mute">Причина отказа:</span>
                {disqualifyReasons.map((r) => (
                  <button
                    key={r}
                    onClick={() => { status.change(lead.id, 'disqualified', r); setRejecting(false); }}
                    className="rounded border border-border px-1.5 py-0.5 text-xs text-text-dim
                               transition-colors hover:border-red hover:bg-red-l hover:text-red"
                  >
                    {DISQUALIFY_REASON_CONFIG[r].label}
                  </button>
                ))}
                <button
                  onClick={() => setRejecting(false)}
                  className="rounded px-1.5 py-0.5 text-xs text-text-mute hover:text-text-main"
                >
                  Отмена
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ═══ Левая колонка: фокус + активность ═══ */}
        <div className="min-w-0">
          {/* Фокус-панель — язык DealFocusPanel */}
          <div className="mb-4 rounded-xl border border-border bg-surface p-3">
            <div className="flex items-start gap-2">
              <ArrowRight size={14} className="mt-0.5 shrink-0 text-text-mute" />
              <div className="min-w-0 flex-1">
                <InlineEdit
                  value={lead.next_step ?? ''}
                  placeholder={readOnly ? '—' : 'назначить следующий шаг'}
                  className={cn('text-sm', !lead.next_step && 'italic')}
                  onSave={async (val) => {
                    updateLead.mutate({ id: lead.id, next_step: val || null });
                  }}
                />
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="flex items-center gap-1">
                    <span className="text-text-dim">Дата:</span>
                    <InlineEdit
                      value={lead.next_action_date ?? ''}
                      type="date"
                      placeholder="назначить"
                      formatDisplay={formatActionDate}
                      className={cn(
                        lead.next_action_date ? 'font-medium' : 'italic',
                        overdueDays > 0 && 'text-red',
                      )}
                      onSave={async (val) => {
                        updateLead.mutate({ id: lead.id, next_action_date: val || null });
                      }}
                    />
                  </span>
                  {overdueDays > 0 && (
                    <span className="font-medium text-red">шаг просрочен {overdueDays} дн.</span>
                  )}
                  {/* Метка общая с канбаном и peek; при просроченном шаге она
                      дублировала бы строку слева, поэтому показываем только молчание. */}
                  {health?.reason === 'idle' && <LeadHealthMark lead={lead} />}
                  {contactedDays !== null && (
                    <span className="text-text-dim">
                      первое касание {contactedDays === 0 ? 'сегодня' : `${contactedDays} дн. назад`}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Активность */}
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-main">Активность</h2>
              {!readOnly && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openModal('call', undefined, { leadId: lead.id })}
                    className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-text-dim transition-colors hover:bg-surface2"
                  >
                    <Plus size={11} /> Звонок
                  </button>
                  <button
                    onClick={() => openModal('task', undefined, { leadId: lead.id })}
                    className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-text-dim transition-colors hover:bg-surface2"
                  >
                    <Plus size={11} /> Задача
                  </button>
                </div>
              )}
            </div>
            <ActivityComposer entityType="lead" entityId={lead.id} />
            <EntityTimeline
              entityType="lead"
              entityId={lead.id}
              onOpenEvent={handleOpenEvent}
            />
          </div>
        </div>

        {/* ═══ Правая колонка: квалификация ═══ */}
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-3 text-sm font-semibold text-text-main">Квалификация</h2>
            <div className="space-y-3">
              <Field label="Боль / задача">
                {lead.pain ?? <span className="text-text-mute">не выяснена</span>}
              </Field>
              <Field label="Бюджет">
                {LEAD_BUDGET_STATUS_CONFIG[lead.budget_status]?.label ?? lead.budget_status}
              </Field>
              <Field label="Оценка суммы">
                {lead.estimated_value != null
                  ? <span className="tabular-nums font-medium">{formatBudget(lead.estimated_value)}</span>
                  : <span className="text-text-mute">—</span>}
              </Field>
              <Field label="Роль контакта">
                {roleLabel ?? <span className="text-text-mute">не выяснена</span>}
              </Field>
              <Field label="Группы «Честного Знака»">
                {lead.chz_groups && lead.chz_groups.length > 0 ? (
                  <span className="flex flex-wrap gap-1">
                    {lead.chz_groups.map((g) => (
                      <span key={g} className="rounded bg-surface2 px-1.5 py-0.5 text-xs text-text-dim">{g}</span>
                    ))}
                  </span>
                ) : <span className="text-text-mute">—</span>}
              </Field>
              <Field label="Дедлайн маркировки">
                {lead.regulatory_deadline
                  ? new Date(lead.regulatory_deadline).toLocaleDateString('ru-RU',
                      { day: 'numeric', month: 'long', year: 'numeric' })
                  : <span className="text-text-mute">—</span>}
              </Field>
              {lead.notes && <Field label="Заметки">{lead.notes}</Field>}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Модалки ═══ */}
      <LeadModal isOpen={editOpen} onClose={() => setEditOpen(false)} editLead={lead} />
      {convertOpen && (
        <LeadConversionModal isOpen onClose={() => setConvertOpen(false)} lead={lead} />
      )}
      <CallModal
        isOpen={editingCall !== null}
        onClose={() => setEditingCall(null)}
        editCall={editingCall}
      />
      <TaskModal
        isOpen={editingTask !== null}
        onClose={() => setEditingTask(null)}
        editTask={editingTask}
      />
    </>
  );
}
