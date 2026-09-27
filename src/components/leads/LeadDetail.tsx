'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Loader2,
  Plus,
  RotateCcw,
  Target,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useLead, useLeadStatusChange } from '@/lib/hooks/use-leads';
import { useProject } from '@/lib/hooks/use-projects';
import { usePipelineStagesMap } from '@/lib/hooks/use-pipelines';
import { useTeamMembers } from '@/lib/hooks/use-team-members';
import { useUiStore } from '@/lib/stores/ui-store';
import { leadStatusGauge } from '@/lib/domain/lead-status-gauge';
import { getLeadSignals } from '@/lib/domain/lead-signals';
import { qualifyLead, type LeadQualification } from '@/lib/domain/lead-qualification';
import { CHZ_GROUPS, chzPhase, chzStatusLabel } from '@/lib/data/chz-groups';
import { LeadHeader } from './LeadHeader';
import { LeadNextStep } from './LeadNextStep';
import { LeadContextZone } from './LeadContextZone';
import { LeadRisksCard } from './LeadRisksCard';
import { LeadQualRow } from './LeadQualRow';
import { PipelineCockpit } from '@/components/shared/PipelineCockpit';
import { formatBudget } from '@/lib/validators/project';
import {
  LEAD_STATUS_CONFIG,
  DISQUALIFY_REASON_CONFIG,
  type DisqualifyReason,
} from '@/lib/validators/lead';
import { TimelineFilterChips, type TimelineFilterValue } from '@/components/shared/EntityTimeline';
import { ActivityComposer } from '@/components/shared/ActivityComposer';
import { ChzBadge } from '@/components/shared/ChzBadge';
import { DealLastEvent } from '@/components/projects/DealLastEvent';
import { DealActivityFeed, useDealActivity } from '@/components/projects/DealActivityFeed';
import { openTimelineEvent } from '@/lib/timeline/open-event';
import { CallModal } from '@/components/calls/CallModal';
import { TaskModal } from '@/components/tasks/TaskModal';
import { LeadModal } from './LeadModal';
import { LeadConversionModal } from './LeadConversionModal';
import type { Call } from '@/lib/hooks/use-calls';
import type { Task } from '@/types/entities';
import type { Lead, LeadStatus } from '@/types/database';
import type { TimelineKind } from '@/types/timeline';

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
//  · «Риски» — `LeadRisksCard` поверх `getLeadSignals` (S-LEAD-V2-HEALTH-1);
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
 * Чипы ленты лида: Все · Звонки · Задачи · Заметки · Поля. «Встреч» нет —
 * `meetings.lead_id` не существует (F-10); AI-прогонов у лида нет. «Заметки» —
 * производный чип, `TimelineFilterChips` сам разворачивает `activity` в пару
 * «Заметки» + лог (как у сделки); у лида он живой — композер пишет `comment_added`.
 */
const LEAD_CHIP_KINDS: TimelineKind[] = ['call', 'task', 'activity'];

/** Лог без заметок — смены статуса и правки полей: «Поля», как у сделки. */
const LEAD_CHIP_LABELS: Partial<Record<TimelineFilterValue, string>> = { activity: 'Поля' };

export function LeadDetail({ leadId }: { leadId: string }) {
  const router = useRouter();
  const { data: lead, isLoading, error } = useLead(leadId);
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
  // Лента — вид сделки W5: чип и «Вся лента» живут здесь, лента управляемая.
  // Хук — до ранних return: тот же ключ React Query, что у ленты, запрос один.
  const [activityFilter, setActivityFilter] = useState<TimelineFilterValue>('all');
  const [activityExpanded, setActivityExpanded] = useState(false);
  const { emptyEntity: activityEmpty } = useDealActivity(leadId, activityFilter, 'lead');

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

  // «Сейчас» фиксируется на рендер данных лида: шкала и сигналы считаются от одного момента.
  const signals = useMemo(() => (lead ? getLeadSignals(lead, new Date()) : null), [lead]);
  const statusGauge = useMemo(() => (lead ? leadStatusGauge(lead, new Date()) : null), [lead]);
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

  // Зона «Риски» — только при сигналах: у закрытого лида список пуст, и зоны нет
  // целиком. ok — дефолтный фон зоны (как у сделки), тревога — по вердикту.
  const hasSignals = !!signals && signals.signals.length > 0;
  const riskClass =
    signals?.verdict === 'rotting' ? 'h-rotting' : signals?.verdict === 'attention' ? 'h-attention' : '';

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
              {/* S-LEAD-V2-HEALTH-1 (спека §3): ветка `CockpitRow` сделки — шкала
                  времени в статусе из `leadStatusGauge`. Карты нет (`map={null}`):
                  4 статуса помещаются в строку именами. Слова риска здесь не пишутся —
                  они в «Рисках» (F-01). «Отклонить…» — в шапке (R-08). */}
              <PipelineCockpit
                groupLabel="Статус лида"
                pastCount={stepIndex > 0 ? stepIndex : 0}
                pastNames={STEPPER.slice(0, Math.max(0, stepIndex)).map(
                  (s) => LEAD_STATUS_CONFIG[s.status]?.label ?? s.label,
                )}
                current={{ name: currentStepLabel }}
                gauge={statusGauge?.gauge ?? { days: null, norm: null, pct: null, state: 'ok' }}
                counterLabel={statusGauge?.counterLabel ?? undefined}
                dates={statusGauge?.dates ?? null}
                gate={gate}
                next={nextStep}
                restCount={stepIndex >= 0 ? STEPPER.length - stepIndex - 1 : 0}
                inlineNames
                restNames={STEPPER.slice(stepIndex + 1).map(
                  (s) => LEAD_STATUS_CONFIG[s.status]?.label ?? s.label,
                )}
                metaRight={stepIndex >= 0 ? `${stepIndex + 1} из ${STEPPER.length}` : null}
                locked={isConverted}
                map={null}
              />
            </div>
          )}

          {isOpen && <LeadNextStep lead={lead} />}
          {isConverted && lead.converted_deal_id && (
            <ConvertedDealCard dealId={lead.converted_deal_id} convertedAt={lead.converted_at} />
          )}

          <LeadQualificationBlock lead={lead} qual={qual} />

          {/* ═══ Активность — вид сделки W5 (S-LEAD-V2-WORK-1, спека §6) ═══
              Разметка — `isDeal`-ветка ProjectDetail: шапка одной строкой, последнее
              событие, композер, лента. Чипов «Встречи» нет (`meetings.lead_id` не
              существует, F-10), AI-прогонов у лида нет. */}
          <div className="sheet rounded-[1.25rem] p-4">
            <div className="mb-3.5 flex flex-wrap items-center gap-2">
              <span className="mr-1.5 text-xs font-bold text-text-main">Активность</span>
              {!activityEmpty && (
                <>
                  <TimelineFilterChips
                    variant="pill"
                    kinds={LEAD_CHIP_KINDS}
                    labels={LEAD_CHIP_LABELS}
                    value={activityFilter}
                    onChange={(v) => { setActivityFilter(v); setActivityExpanded(false); }}
                  />
                  {!activityExpanded && (
                    <button
                      type="button"
                      onClick={() => setActivityExpanded(true)}
                      className="text-xs font-semibold text-success-text hover:underline"
                    >
                      Вся лента
                    </button>
                  )}
                </>
              )}
              {isOpen && (
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openModal('call', undefined, { leadId: lead.id })}
                    className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-text-dim transition-colors hover:bg-surface2"
                  >
                    <Plus size={11} /> Звонок
                  </button>
                  <button
                    type="button"
                    onClick={() => openModal('task', undefined, { leadId: lead.id })}
                    className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-xs text-text-dim transition-colors hover:bg-surface2"
                  >
                    <Plus size={11} /> Задача
                  </button>
                </div>
              )}
            </div>
            <DealLastEvent entityType="lead" entityId={lead.id} onOpenEvent={handleOpenEvent} />
            {isOpen && <ActivityComposer entityType="lead" entityId={lead.id} variant="deal" />}
            <DealActivityFeed
              entityType="lead"
              entityId={lead.id}
              filter={activityFilter}
              expanded={activityExpanded}
              onOpenEvent={handleOpenEvent}
            />
            {isConverted && (
              <p className="mt-2 text-meta text-text-mute">Дальше лента продолжается в сделке</p>
            )}
          </div>
        </section>

        {/* ─── Правая колонка: «Риски» + «Контекст» ───
            Sticky на ОБЁРТКЕ, а не на каждой зоне; `self-start` обязателен —
            растянутый по строке грида элемент sticky не липнет. */}
        <div className="order-2 flex min-w-0 flex-col gap-5 lg:col-start-2 lg:sticky lg:top-4 lg:self-start">
          {hasSignals && signals && (
            <section
              className={cn('zone', riskClass)}
              style={{ ['--zone-surface']: 'var(--h-zone)' } as React.CSSProperties}
            >
              <div className="zone-eyebrow" style={{ color: 'var(--h-chip-ink)' }}>
                Риски <small className="text-text-dim">что может сорвать лид</small>
              </div>
              <LeadRisksCard result={signals} />
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
// S-LEAD-V2-WORK-1 (спека §5): строки «Осталось выяснить» отвечаются на месте
// (`LeadQualRow`), «Заполнить» → `LeadModal` убран. Раскладка — по ширине
// БЛОКА (`.lead-qual`, @container), а не экрана: при 1280 зона «Работа» узкая.
// ═══════════════════════════════════════════════════════

/** Подпись зоны блока — кегль eyebrow кокпита. */
const QUAL_LABEL = 'text-[0.65625rem] font-bold uppercase tracking-wider text-text-dim';

function LeadQualificationBlock({ lead, qual }: { lead: Lead; qual: LeadQualification }) {
  const isConverted = lead.status === 'converted';
  const readOnly = isConverted || lead.status === 'disqualified';
  // У закрытого лида квалификация — архив: левая зона не рендерится независимо
  // от заполненности, отвечать задним числом не на что.
  const showMissing = !readOnly && qual.missing.length > 0;
  const showKnown = qual.known.length > 0;
  const layout = showMissing && showKnown ? 'both' : showMissing ? 'missing' : 'known';
  const now = new Date();

  return (
    // Якорь CTA сигнала `regulatory` (зона «Риски», HEALTH-1).
    <div id="lead-qualification" className="sheet rounded-[1.25rem] px-[1.125rem] py-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-xs font-bold text-text-main">Квалификация</span>
        <span className="text-xs tabular-nums text-text-dim">
          {qual.filledCount} из {qual.total}
        </span>
        {readOnly && (
          <span className="ml-auto text-meta text-text-mute">
            {isConverted ? 'только чтение · перенесено в сделку' : 'заморожено до восстановления'}
          </span>
        )}
      </div>

      {!showMissing && !showKnown ? (
        <p className="text-sm text-text-mute">Квалификация не заполнялась.</p>
      ) : (
        <div className="lead-qual" data-layout={layout}>
          <div className="lead-qual-cols">
            {showMissing && (
              <div className="rounded-[0.875rem] bg-surface2 p-4">
                {/* Заголовок нейтральный, НЕ жёлтый: жёлтый на экране только у реальной
                    блокировки — иначе «держит конверсию» перестаёт читаться как замок. */}
                <div className={cn(QUAL_LABEL, 'mb-3')}>Осталось выяснить</div>
                <div className="lead-qual-missing">
                  {qual.missing.map((item) => (
                    <LeadQualRow key={item.key} item={item} lead={lead} />
                  ))}
                </div>
                {!showKnown && (
                  // Гейт держит КОНВЕРСИЮ, не квалификацию: степпер до «Квалифицирован»
                  // доступен и на пустом лиде (гейт S-LEAD-CARD-VISUAL-1).
                  <p className="mt-3 text-xs text-text-mute">
                    Заполни боль и бюджет — тогда можно конвертировать
                  </p>
                )}
              </div>
            )}

            {showKnown && (
              // Приёмка владельца 27.09 (вариант 1): «Известно» — список свойств в одну
              // колонку, анатомия «Сводки»: ключ фиксированной ширины, значение, hairline
              // между строками. Прежняя сетка 2×2 «ключ | значение | ключ | значение»
              // висела текстом на фоне без структуры строк.
              <div className="lead-qual-known-col min-w-0">
                <div className={cn(QUAL_LABEL, 'mb-1')}>Известно</div>
                <dl className="lead-qual-known">
                  {qual.known.map((item) => (
                    <div
                      key={item.key}
                      className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-baseline gap-x-3 border-b border-border py-2 last:border-b-0"
                    >
                      <dt className="text-meta text-text-mute">{item.label}</dt>
                      <dd className="m-0 min-w-0">
                        {item.key === 'chz' ? (
                          <KnownChzGroups groups={lead.chz_groups ?? []} now={now} />
                        ) : (
                          <span
                            className={cn(
                              'text-body text-text-main',
                              (item.key === 'value' || item.key === 'deadline') && 'tabular-nums',
                            )}
                            title={item.key === 'pain' ? undefined : item.value ?? undefined}
                          >
                            {item.value}
                          </span>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * «Группы ЧЗ» в «Известно»: у группы из справочника — фаза (`chzStatusLabel`);
 * группы вне справочника (переименовали после снимка) — одно имя, без выдуманной
 * фазы. Дата старта для лида не подставляется — отступление спринта WORK-1.
 *
 * Цветной тег (`ChzBadge`) — ТОЛЬКО у стартующей группы (`starting`, обязанность
 * наступает в ближайшие 6 мес.): это исключение, ради которого лиду звонят.
 * «Обязательна с 2020» — норма, не событие: зелёный чип на ней был цветным маркером
 * нормального состояния (приёмка 27.09) — печатается тихим суффиксом.
 */
function KnownChzGroups({ groups, now }: { groups: string[]; now: Date }) {
  return (
    <ul className="flex min-w-0 flex-col gap-1">
      {groups.map((name) => {
        const g = CHZ_GROUPS.find((x) => x.group === name);
        return (
          <li key={name} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-body text-text-main">{name}</span>
            {/* Неразрывно: в узкой ячейке «старт 2026-03» ломался по дефису. */}
            {g && chzPhase(g, now) === 'starting' && (
              <span className="whitespace-nowrap">
                <ChzBadge status="starting" label={chzStatusLabel(g, now)} />
              </span>
            )}
            {g && chzPhase(g, now) !== 'starting' && (
              <span className="whitespace-nowrap text-meta text-text-mute">· {chzStatusLabel(g, now)}</span>
            )}
          </li>
        );
      })}
    </ul>
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
