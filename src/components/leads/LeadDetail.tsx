'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  Clock,
  Loader2,
  Lock,
  Phone,
  Plus,
  Target,
  Building2,
  User,
  Mail,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useLead, useLeadStatusChange, useUpdateLead } from '@/lib/hooks/use-leads';
import { useProject } from '@/lib/hooks/use-projects';
import { usePipelineStagesMap } from '@/lib/hooks/use-pipelines';
import { useTeamMembers } from '@/lib/hooks/use-team-members';
import { useUiStore } from '@/lib/stores/ui-store';
import { daysSince } from '@/lib/utils/date-helpers';
import { getLeadHealth, getLeadActionOverdueDays } from '@/lib/utils/lead-health';
import {
  qualifyLead,
  formatDateKeyRu,
  type LeadQualItem,
  type LeadQualification,
} from '@/lib/domain/lead-qualification';
import { LeadHealthMark } from './LeadHealthMark';
import { PipelineCockpit } from '@/components/shared/PipelineCockpit';
import { StageRail } from '@/components/shared/StageRail';
import { formatBudget } from '@/lib/validators/project';
import { formatPhone } from '@/lib/utils/phone';
import {
  LEAD_SOURCE_CONFIG,
  LEAD_STATUS_CONFIG,
  LEAD_TEMPERATURE_CONFIG,
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
import type { LeadStatus } from '@/types/database';

// ═══════════════════════════════════════════════════════
// Карточка лида (S-LEAD-HUB-2a, визуал — S-LEAD-CARD-VISUAL-1).
//
// НЕ клон ProjectDetail (54 КБ): лид живёт дни, экран обязан читаться за пять
// секунд — статус, следующий шаг, квалификация, лента касаний. Вкладок нет.
//
// Мутации свои НЕ заводятся: статус — `useLeadStatusChange` (одна с канбаном),
// поля — `useUpdateLead`, конверсия — `LeadConversionModal`.
//
// Порядок блоков (согласованный макет): кокпит → пара «Следующий шаг / Сигналы»
// → квалификация во всю ширину → заметки → активность. Правой колонки больше нет:
// квалификация в 20rem сжималась в столбик подписей, где закрытое с галками
// кричало громче незакрытого.
// ═══════════════════════════════════════════════════════

/** Колонки степпера. `disqualified` сюда НЕ входит — это терминальная ветка, а не шаг. */
const STEPPER: { status: LeadStatus; label: string }[] = [
  { status: 'new', label: 'Новый' },
  { status: 'contacted', label: 'Контакт' },
  { status: 'qualified', label: 'Квалифицирован' },
  { status: 'converted', label: 'Конвертирован' },
];

/**
 * Порог регуляторного сигнала. Три месяца — не круглое число, а длина пилота:
 * ближе этого срока внедрение до обязательной маркировки уже не помещается.
 */
const REG_WARNING_MONTHS = 3;

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

/** Заголовок зоны/карточки — один стиль на «ОСТАЛОСЬ ВЫЯСНИТЬ», «ИЗВЕСТНО», «СИГНАЛЫ». */
function ZoneTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('text-meta font-semibold uppercase tracking-wider text-text-mute', className)}>
      {children}
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
  const qual = useMemo(() => (lead ? qualifyLead(lead) : null), [lead]);

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
  if (!lead || !qual) {
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
  //
  // ⚠️ ОТЛИЧИЕ ОТ СДЕЛОК, не расхождение: у сделки locked-кнопка всё равно
  // кликается — истина в `check_stage_requirements`, сервер и откажет. У лида
  // серверного гейта НЕТ и не будет (лид вне `pipeline_stages`), поэтому при
  // `locked` обработчик не передаётся вовсе — замок действительно блокирует.
  // Не «чинить» до поведения сделок: тогда замок станет украшением.
  const nextStep =
    lead.status === 'new'
      ? { label: 'Связаться', locked: false, onClick: () => status.change(lead.id, 'contacted') }
      : lead.status === 'contacted'
        ? { label: 'Квалифицировать', locked: false, onClick: () => status.change(lead.id, 'qualified') }
        : lead.status === 'qualified'
          ? {
              label: 'Конвертировать',
              locked: !qual.canConvert,
              onClick: qual.canConvert ? () => setConvertOpen(true) : undefined,
            }
          : null;

  // Гейт — ТОЛЬКО обязательные пункты квалификации, и только на `qualified`:
  // до квалификации точки «готовность 0/2» были бы шумом на этапе, где эти поля
  // ещё никто не собирался заполнять.
  const gate =
    lead.status === 'qualified'
      ? {
          title: 'Готовность к конверсии',
          items: qual.items
            .filter((i) => i.required)
            .map((i) => ({ label: i.label, met: i.filled })),
        }
      : null;

  const overdueDays = lead.next_action_date ? getLeadActionOverdueDays(lead.next_action_date) : 0;
  const regMonths = regulatoryMonths(lead.regulatory_deadline);
  const contactedDays = lead.first_contacted_at ? daysSince(lead.first_contacted_at) : null;

  // ═══ Сигналы — только исключения, и только те, которых НЕТ в фокус-панели ═══
  //
  // `overdue-action` не показываем: фокус-панель уже пишет «шаг просрочен N дн.»
  // теми же словами, а метка в кокпите повторяет это третий раз.
  // `stale` не показываем: жёлтая метка стоит вплотную к шагу, а это ранний
  // порог — не исключение. `cold` показываем: удвоенный порог молчания, и голая
  // метка «N дн.» смысл не передаёт (он спрятан в title).
  const showRegWarning = !isConverted && regMonths !== null && regMonths <= REG_WARNING_MONTHS;
  const showColdSignal = !isConverted && health?.level === 'cold';
  const hasSignals = showRegWarning || showColdSignal;

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
              gate={gate}
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
              <div className="mt-2 flex w-full flex-wrap items-center gap-1 border-t border-border pt-2">
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

      {/* ═══ Пара «Следующий шаг / Сигналы» — либо карточка созданной сделки ═══ */}
      {isConverted && lead.converted_deal_id ? (
        <ConvertedDealCard dealId={lead.converted_deal_id} convertedAt={lead.converted_at} />
      ) : (
        <div className={cn('mb-4 grid gap-4', hasSignals && 'lg:grid-cols-[minmax(0,1fr)_22rem]')}>
          {/* Фокус-панель — язык DealFocusPanel */}
          <div className="rounded-xl border border-border bg-surface p-3">
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

          {/* Сигналы — карточки нет вовсе, когда исключений нет (не «пустое состояние») */}
          {hasSignals && (
            <div className="rounded-xl border border-border bg-surface p-3">
              <ZoneTitle className="mb-2">Сигналы</ZoneTitle>
              <div className="space-y-2">
                {showRegWarning && lead.regulatory_deadline && (
                  <div
                    className="flex items-start gap-2 rounded-[var(--radius)] bg-yellow-l p-2 text-xs"
                    style={{ color: 'var(--yellow-text, var(--yellow))' }}
                  >
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    <span>
                      {regMonths === 0
                        ? `Срок маркировки наступил ${formatDateKeyRu(lead.regulatory_deadline)} — пилот уже не успевает`
                        : `Дедлайн маркировки через ${regMonths} мес. — окно на пилот закрывается ${formatDateKeyRu(lead.regulatory_deadline)}`}
                    </span>
                  </div>
                )}
                {showColdSignal && health && (
                  <div className="flex items-start gap-2 text-xs text-text-dim">
                    <Clock size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--red-text, var(--red))' }} />
                    <span>Молчание {health.days} дн. — лид остывает</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ Квалификация ═══ */}
      <LeadQualificationBlock
        qual={qual}
        readOnly={readOnly}
        painValue={lead.pain ?? ''}
        onSavePain={async (val) => {
          updateLead.mutate({ id: lead.id, pain: val.trim() || null });
        }}
        onFill={() => setEditOpen(true)}
      />

      {lead.notes && (
        <div className="mt-4 rounded-xl border border-border bg-surface p-4">
          <ZoneTitle className="mb-2">Заметки</ZoneTitle>
          <p className="whitespace-pre-wrap text-sm text-text-main">{lead.notes}</p>
        </div>
      )}

      {/* ═══ Активность ═══ */}
      <div className="mt-4 rounded-xl border border-border bg-surface p-4">
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

// ═══════════════════════════════════════════════════════
// Блок квалификации — две зоны
//
// Разделение НЕ по обязательности, а по «требует действия / уже известно».
// Три предыдущие итерации макета (колонки, полоса-прогресс, ряды с бейджами
// «ОБЯЗ.») давали дыры в сетке и инверсию веса: закрытое с зелёными галками
// кричало громче незакрытого. Поэтому в зоне «Известно» галок нет вовсе —
// это плотная справка, а не список достижений.
// ═══════════════════════════════════════════════════════

function LeadQualificationBlock({
  qual,
  readOnly,
  painValue,
  onSavePain,
  onFill,
}: {
  qual: LeadQualification;
  readOnly: boolean;
  painValue: string;
  onSavePain: (value: string) => Promise<void>;
  onFill: () => void;
}) {
  // У конвертированного лида квалификация — архив: левая зона не рендерится
  // независимо от заполненности, править задним числом нечего.
  const showMissing = !readOnly && qual.missing.length > 0;
  const showKnown = qual.known.length > 0;

  return (
    <div className="mt-4 rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <ZoneTitle>Квалификация{readOnly && ' · только чтение'}</ZoneTitle>
        <span className="text-sm font-semibold tabular-nums text-text-main">
          {qual.filledCount} из {qual.total}
        </span>
      </div>

      {!showMissing && !showKnown ? (
        <p className="text-sm text-text-mute">Квалификация не заполнялась.</p>
      ) : (
        <div
          className={cn(
            'grid gap-4',
            showMissing && showKnown && 'lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]',
          )}
        >
          {showMissing && (
            <div className="rounded-[var(--radius)] bg-surface2 p-4">
              {/* Заголовок нейтральный, НЕ жёлтый: жёлтый на экране только у реальной
                  блокировки — иначе «держит конверсию» перестаёт читаться как замок. */}
              <ZoneTitle className="mb-2">Осталось выяснить</ZoneTitle>
              <div className={cn('grid gap-3', !showKnown && 'sm:grid-cols-2')}>
                {qual.missing.map((item) => (
                  <MissingRow
                    key={item.key}
                    item={item}
                    painValue={painValue}
                    onSavePain={onSavePain}
                    onFill={onFill}
                  />
                ))}
              </div>
              {!showKnown && (
                <>
                  {/* Гейт держит КОНВЕРСИЮ, не квалификацию: степпер до «Квалифицирован»
                      доступен и на пустом лиде. Формулировка §7 макета говорила
                      «квалифицировать» и противоречила подписи «держит конверсию» в двух
                      строках выше — исправлено на гейте S-LEAD-CARD-VISUAL-1. */}
                  <p className="mt-3 text-xs text-text-mute">
                    Заполни боль и бюджет — тогда можно конвертировать
                  </p>
                </>
              )}
            </div>
          )}

          {showKnown && (
            <div className={cn(!showMissing && 'w-full')}>
              <ZoneTitle className="mb-2">Известно</ZoneTitle>
              <div
                className={cn(
                  'grid gap-x-8 gap-y-2',
                  showMissing ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
                )}
              >
                {qual.known.map((item) => (
                  // min-h держит строки на общей сетке: без него длинное значение
                  // роли распирало бы свою ячейку и ломало базовые линии соседей.
                  <div key={item.key} className="flex min-h-[1.625rem] items-baseline gap-3">
                    <span className="w-28 shrink-0 text-sm text-text-dim">{item.label}</span>
                    <span
                      className={cn(
                        'min-w-0 text-sm text-text-main',
                        (item.key === 'value' || item.key === 'deadline') && 'tabular-nums',
                      )}
                      title={item.key === 'pain' ? undefined : item.value ?? undefined}
                    >
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Строка зоны «Осталось выяснить».
 *
 * Боль правится ЗДЕСЬ (`InlineEdit as="textarea"`): она пишется свободным текстом
 * и в модалку за ней ходить незачем. Остальные пять — селекты, мультиселект и
 * дата, им нужна форма, поэтому «Заполнить» открывает `LeadModal`.
 */
function MissingRow({
  item,
  painValue,
  onSavePain,
  onFill,
}: {
  item: LeadQualItem;
  painValue: string;
  onSavePain: (value: string) => Promise<void>;
  onFill: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-text-main">{item.label}</div>
        {item.required ? (
          <div
            className="mt-0.5 flex items-center gap-1 text-xs"
            style={{ color: 'var(--yellow-text, var(--yellow))' }}
          >
            <Lock size={11} /> держит конверсию
          </div>
        ) : (
          <div className="mt-0.5 text-xs text-text-mute">{item.hint}</div>
        )}
      </div>

      {item.key === 'pain' ? (
        // Пока свёрнут — компактный триггер справа; в режиме правки внутри появляется
        // textarea, и обёртка уезжает на всю ширину строки (`basis-full` по :has).
        <div className="shrink-0 [&:has(textarea)]:mt-1 [&:has(textarea)]:basis-full">
          <InlineEdit
            value={painValue}
            as="textarea"
            placeholder="Заполнить"
            className="rounded-lg border border-[var(--accent)] px-2.5 py-1 text-xs text-accent no-underline hover:no-underline"
            onSave={onSavePain}
          />
        </div>
      ) : (
        <button
          onClick={onFill}
          className={cn(
            'shrink-0 rounded-lg border px-2.5 py-1 text-xs transition-colors',
            item.required
              ? 'border-[var(--accent)] text-accent hover:bg-accent-l'
              : 'border-border text-text-dim hover:bg-surface3',
          )}
        >
          Заполнить
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Карточка созданной сделки (состояние `converted`)
//
// Свой запрос НЕ заводится: `useProject` уже тянет строку `projects` с теми же
// колонками, стадию даёт `usePipelineStagesMap` (словарь, кеш 10 мин),
// ответственного — `useTeamMembers`. Компонент отдельный именно ради этого:
// смонтирован только у конвертированного лида, у остальных этих трёх запросов нет.
// ═══════════════════════════════════════════════════════

function ConvertedDealCard({ dealId, convertedAt }: { dealId: string; convertedAt: string | null }) {
  const { data: deal, isLoading } = useProject(dealId);
  const stagesMap = usePipelineStagesMap();
  const { data: members } = useTeamMembers();

  const stageName = deal?.stage_id ? stagesMap.get(deal.stage_id)?.name ?? null : null;
  const ownerName = deal?.owner_id
    ? members?.find((m) => m.id === deal.owner_id)?.full_name ?? null
    : null;

  return (
    <div className="mb-4 rounded-xl border border-border bg-surface p-4">
      <ZoneTitle className="mb-2">
        <span style={{ color: 'var(--green-text, var(--green))' }}>Сделка создана</span>
      </ZoneTitle>

      {isLoading ? (
        <div className="h-4 w-40 animate-pulse rounded bg-surface2" />
      ) : !deal ? (
        // Сделку могли удалить — ссылка на неё врала бы; лид при этом остаётся
        // конвертированным (`converted_deal_id` не чистится каскадом).
        <p className="text-sm text-text-mute">Сделка недоступна — возможно, удалена.</p>
      ) : (
        <>
          <Link
            href={`/deals/${dealId}`}
            className="text-sm font-semibold text-text-main transition-colors hover:text-accent"
          >
            {deal.name}
          </Link>
          <div className="mt-2 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
            <DealFact label="Стадия" value={stageName} />
            <DealFact label="Сумма" value={deal.budget != null ? formatBudget(deal.budget) : null} numeric />
            <DealFact label="Ответственный" value={ownerName} />
            <DealFact
              label="Конверсия"
              numeric
              value={
                convertedAt
                  ? new Date(convertedAt).toLocaleDateString('ru-RU', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })
                  : null
              }
            />
          </div>
        </>
      )}
    </div>
  );
}

function DealFact({ label, value, numeric }: { label: string; value: string | null; numeric?: boolean }) {
  return (
    <div className="flex min-h-[1.625rem] items-baseline gap-3">
      <span className="w-28 shrink-0 text-sm text-text-dim">{label}</span>
      <span className={cn('min-w-0 text-sm', value ? 'text-text-main' : 'text-text-mute', numeric && 'tabular-nums')}>
        {value ?? '—'}
      </span>
    </div>
  );
}
