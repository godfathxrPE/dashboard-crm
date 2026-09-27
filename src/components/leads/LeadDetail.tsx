'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  Clock,
  Loader2,
  Lock,
  Plus,
  RotateCcw,
  Target,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useLead, useLeadStatusChange, useUpdateLead } from '@/lib/hooks/use-leads';
import { useProject } from '@/lib/hooks/use-projects';
import { usePipelineStagesMap } from '@/lib/hooks/use-pipelines';
import { useTeamMembers } from '@/lib/hooks/use-team-members';
import { useUiStore } from '@/lib/stores/ui-store';
import { getLeadHealth } from '@/lib/utils/lead-health';
import {
  qualifyLead,
  formatDateKeyRu,
  type LeadQualItem,
  type LeadQualification,
} from '@/lib/domain/lead-qualification';
import { LeadHealthMark } from './LeadHealthMark';
import { LeadHeader } from './LeadHeader';
import { LeadNextStep } from './LeadNextStep';
import { LeadContextZone } from './LeadContextZone';
import { PipelineCockpit } from '@/components/shared/PipelineCockpit';
import { StageRail } from '@/components/shared/StageRail';
import { formatBudget } from '@/lib/validators/project';
import {
  LEAD_STATUS_CONFIG,
  DISQUALIFY_REASON_CONFIG,
  type DisqualifyReason,
} from '@/lib/validators/lead';
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
// S-LEAD-V2-LAYOUT-1 (спека `_analysis/lead-v2-spec.md` §1, §9): карточка
// говорит языком сделки v2 — шапка-идентичность (`LeadHeader`) и три зоны,
// разметка которых взята дословно из ProjectDetail:
//  · «Работа» — кокпит (или плашка «Отклонён») → стекло шага (или «Сделка
//    создана») → квалификация → активность;
//  · «Риски» — временная карточка прежних сигналов, заменит HEALTH-1;
//  · «Контекст» — «Сводка» и «Заметки» (`LeadContextZone`).
// Состав беднее сделки намеренно: лид живёт дни — ни кольца, ни пульса, ни доски.
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

/** Месяцев до обязательности маркировки; null — дальше года или дата в прошлом. */
function regulatoryMonths(deadline: string | null): number | null {
  const d = deadline ? new Date(deadline) : null;
  if (!d || isNaN(d.getTime())) return null;
  const days = Math.round((d.getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
  if (days < 0 || days > 366) return null;
  return Math.max(0, Math.round(days / 30));
}

export function LeadDetail({ leadId }: { leadId: string }) {
  const router = useRouter();
  const { data: lead, isLoading, error } = useLead(leadId);
  const updateLead = useUpdateLead();
  const status = useLeadStatusChange();
  const openModal = useUiStore((s) => s.openModal);
  // Имя ответственного для «Сводки»: общий кэш команды, шапка берёт его же.
  const { data: members } = useTeamMembers();

  const [editOpen, setEditOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
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
      <div className="sheet rounded-[1.25rem] p-8 text-center">
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
  const isOpen = !isConverted && !isDisqualified;
  const stepIndex = STEPPER.findIndex((s) => s.status === lead.status);
  const currentStepLabel =
    LEAD_STATUS_CONFIG[lead.status]?.label ?? STEPPER[stepIndex]?.label ?? lead.status;
  const ownerName = lead.owner_id
    ? (members?.find((m) => m.id === lead.owner_id)?.full_name ?? null)
    : null;

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

  const regMonths = regulatoryMonths(lead.regulatory_deadline);

  // ═══ Временная зона «Риски» (S-LEAD-V2-LAYOUT-1 → заменит HEALTH-1) ═══
  //
  // Логика сигналов ПРЕЖНЯЯ, переехала только разметка: зона вместо карточки
  // рядом с шагом. `overdue-action` и `stale` по-прежнему не показываются —
  // просрочку пишет стекло шага, ранний порог молчания не исключение. Зона
  // рисуется только у открытого лида и только при хоть одном сигнале.
  const showRegWarning = isOpen && regMonths !== null && regMonths <= REG_WARNING_MONTHS;
  const showColdSignal = isOpen && health?.level === 'cold';
  const hasSignals = showRegWarning || showColdSignal;

  return (
    <>
      <Link
        href="/leads"
        className="mb-2.5 inline-block text-xs text-text-mute transition-colors hover:text-text-main"
      >
        ← Лиды
      </Link>

      <LeadHeader
        lead={lead}
        onEdit={() => setEditOpen(true)}
        onReject={(reason) => status.change(lead.id, 'disqualified', reason)}
      />

      {/* ═══ Зоны — разметка дословно с ProjectDetail (S-DEAL-ZONES-1A) ═══
          Ниже `lg` колонки стекаются: Работа → Риски → Контекст. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_356px]">
        {/* ─── Зона «Работа» ─── */}
        <section
          className="zone order-1 min-w-0 lg:col-start-1"
          style={{
            ['--zone-surface']: 'var(--zone-work)',
            ['--zone-gap']: '0.875rem',
          } as React.CSSProperties}
        >
          <div className="zone-eyebrow" style={{ color: 'var(--zone-work-ink)' }}>
            Работа <small className="text-text-dim">что делаем сейчас · статус · квалификация</small>
          </div>

          {isDisqualified ? (
            // W1-D: терминальная плашка ВМЕСТО кокпита — дисквалификация не
            // «шаг назад по воронке», а выход из неё.
            <div className="sheet flex flex-wrap items-center gap-3 rounded-[1.25rem] px-[1.125rem] py-4">
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-danger-l px-2.5 py-1 text-xs font-semibold text-danger-text">
                <X size={12} strokeWidth={2.5} aria-hidden /> Отклонён
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-text-main">
                  {lead.disqualify_reason
                    ? (DISQUALIFY_REASON_CONFIG[lead.disqualify_reason as DisqualifyReason]?.label
                      ?? lead.disqualify_reason)
                    : 'Причина не указана'}
                </div>
                <div className="text-meta text-text-mute">лид убран из очередей</div>
              </div>
              <button
                onClick={() => status.change(lead.id, 'new')}
                className="ml-auto flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs
                           font-medium text-text-dim transition-colors hover:bg-surface2 hover:text-text-main"
              >
                <RotateCcw size={12} /> Восстановить
              </button>
            </div>
          ) : (
            // Лист `.sheet` с паддингом кокпита сделки (ProjectStageCockpit).
            <div className="sheet rounded-[1.25rem] p-4">
              {/* S-PIPELINE-COCKPIT-1: тот же кокпит, что у сделки и проекта внедрения.
                  Тайм-часть ячейки НЕ выдумывается (`gauge={null}`) — шкала лида
                  приходит в HEALTH-1. доп. действий у кокпита нет: «Отклонить…» в шапке (R-08). */}
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
            </div>
          )}

          {isOpen && <LeadNextStep lead={lead} />}
          {isConverted && lead.converted_deal_id && (
            <ConvertedDealCard dealId={lead.converted_deal_id} convertedAt={lead.converted_at} />
          )}

          <LeadQualificationBlock
            qual={qual}
            readOnly={readOnly}
            painValue={lead.pain ?? ''}
            onSavePain={async (val) => {
              updateLead.mutate({ id: lead.id, pain: val.trim() || null });
            }}
            onFill={() => setEditOpen(true)}
          />

          {/* ═══ Активность ═══ */}
          <div className="sheet rounded-[1.25rem] p-4">
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
        </section>

        {/* ─── Правая колонка: «Риски» + «Контекст» ───
            Sticky на ОБЁРТКЕ, а не на каждой зоне; `self-start` обязателен —
            растянутый по строке грида элемент sticky не липнет. */}
        <div className="order-2 flex min-w-0 flex-col gap-5 lg:col-start-2 lg:sticky lg:top-4 lg:self-start">
          {hasSignals && (
            <section
              className={cn('zone', showColdSignal ? 'h-rotting' : 'h-attention')}
              style={{ ['--zone-surface']: 'var(--h-zone)' } as React.CSSProperties}
            >
              <div className="zone-eyebrow" style={{ color: 'var(--h-chip-ink)' }}>
                Риски <small className="text-text-dim">что может сорвать лид</small>
              </div>
              <div data-card className="rounded-lg border border-border bg-surface p-4">
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
            </section>
          )}

          <section
            className="zone"
            style={{ ['--zone-surface']: 'var(--zone-ctx)' } as React.CSSProperties}
          >
            <div className="zone-eyebrow text-text-dim">
              Контекст <small>кто, откуда, что известно</small>
            </div>
            <LeadContextZone lead={lead} ownerName={ownerName} />
          </section>
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

// ═══════════════════════════════════════════════════════
// Блок квалификации — две зоны
//
// Разделение НЕ по обязательности, а по «требует действия / уже известно».
// Три предыдущие итерации макета (колонки, полоса-прогресс, ряды с бейджами
// «ОБЯЗ.») давали дыры в сетке и инверсию веса: закрытое с зелёными галками
// кричало громче незакрытого. Поэтому в зоне «Известно» галок нет вовсе —
// это плотная справка, а не список достижений.
//
// S-LEAD-V2-LAYOUT-1: блок переехал в зону «Работа» как есть — сменилась только
// обёртка (рамка → лист `.sheet`). Подписи зон держат прежний стиль бывшего
// заголовка зон; разметку строк переделывает WORK-1 (спека §5).
// ═══════════════════════════════════════════════════════

/** Подпись зоны блока — «ОСТАЛОСЬ ВЫЯСНИТЬ», «ИЗВЕСТНО». */
const QUAL_LABEL = 'text-meta font-semibold uppercase tracking-wider text-text-mute';

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
    <div className="sheet rounded-[1.25rem] p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <div className={QUAL_LABEL}>Квалификация{readOnly && ' · только чтение'}</div>
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
              <div className={cn(QUAL_LABEL, 'mb-2')}>Осталось выяснить</div>
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
              <div className={cn(QUAL_LABEL, 'mb-2')}>Известно</div>
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

  // S-LEAD-V2-LAYOUT-1 (W2-C): дата конверсии — в eyebrow, поэтому факта
  // «Конверсия» в сетке больше нет; четвёртый факт не выдумывается.
  const convertedLabel = convertedAt
    ? new Date(convertedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="sheet rounded-[1.25rem] px-[1.125rem] py-4">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <div className="text-meta font-semibold uppercase tracking-wider text-success-text">
          Сделка создана
          {convertedLabel && (
            <small className="ml-2 font-normal normal-case tracking-normal text-text-mute">{convertedLabel}</small>
          )}
        </div>
        {/* Гейт LAYOUT-1: ссылки «Открыть сделку →» здесь нет — путь в сделку уже
            дважды на экране (кнопка шапки и имя сделки ниже); третий носитель
            одного действия — F-01. */}
      </div>

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
          <div className="mt-2 grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            <DealFact label="Стадия" value={stageName} />
            <DealFact label="Сумма" value={deal.budget != null ? formatBudget(deal.budget) : null} numeric />
            <DealFact label="Ответственный" value={ownerName} />
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
