'use client';

import { Activity, Pin } from 'lucide-react';
import { useUpdateProject, type Project } from '@/lib/hooks/use-projects';
import { InlineEdit } from '@/components/ui/InlineEdit';
import { RailCard } from '@/components/shared/RailCard';
import { DeliveryHealthDot } from '@/components/shared/DeliveryHealthDot';
import { DealSignals, scrollToSignalAnchor } from './DealSignals';
import { DealHealthRing } from './DealHealthRing';
import { DealSummaryCard } from './DealSummaryCard';
import { DealStakeholders } from './DealStakeholders';
import { DealMaterialsCard } from './DealMaterialsCard';
import { DealChzCard } from './DealChzCard';
import type { DealSignalsResult } from '@/lib/domain/deal-signals';
import type { DeliveryHealth } from '@/lib/utils/delivery-health';
import { cn } from '@/lib/utils/cn';

// ═══════════════════════════════════════════════════════
// S-DEAL-RAIL-1 (R-02, R-03): правая рельса контекста карточки сделки.
//
// Всё справочное — здоровье, сводка, участники, закреплённая заметка — уходит
// в колонку 320px, а вертикаль полотна возвращается работе: шагу, вкладкам и
// ленте. Порядок карточек фиксирован и держится здесь, а не в вызывающем.
//
// Ветвление по типу проекта живёт ТОЛЬКО в этом файле: размазав `isDelivery`
// по карточкам, мы бы получили четыре места, где сделка и внедрение расходятся.
//
// S-DEAL-ZONES-1A: карточка СДЕЛКИ больше не рельса — её содержимое разошлось
// по зонам «Риски» (DealRisksZone) и «Контекст» (DealContextZone). Сам
// `DealContextRail` остался прежним путём для внедрения и internal, где зон
// нет. Чтобы не держать две копии одних карточек, тела вынесены в общие
// кусочки ниже — оба пути их только компонуют.
// ═══════════════════════════════════════════════════════

// ─── Общие карточки (используются и рельсой, и зонами) ───

/**
 * Здоровье СДЕЛКИ.
 *
 * S-DEAL-ZONES-1B: `withRing` — полная версия по макету (кольцо, вердикт,
 * посигнальная полоса), включается только из `DealRisksZone`. Проп, а не
 * безусловный рендер: карточка вызывается ещё и из `DealContextRail` под
 * `isDeal`, и хотя после 1A эта ветка недостижима (рельса рисуется только
 * когда `type !== 'client'`), она в коде осталась — включать кольцо
 * безусловно значило бы завязаться на её мёртвость.
 */
function HealthDealCard({
  signals,
  withRing = false,
}: {
  signals: DealSignalsResult;
  withRing?: boolean;
}) {
  if (signals.signals.length === 0) return null;

  // Зона «Риски»: шапки `RailCard` нет намеренно — заголовок «Здоровье сделки»
  // стоит справа от кольца, как в макете, и второй такой же в шапке карточки
  // был бы дублем. На рельсе внедрения шапка остаётся: там кольца нет.
  if (withRing) {
    return (
      <div data-card className="rounded-lg border border-border bg-surface p-4">
        <DealHealthRing signals={signals.signals} verdict={signals.verdict} />
        <div className="mt-3">
          <DealSignals result={signals} onAction={scrollToSignalAnchor} showVerdict={false} />
        </div>
      </div>
    );
  }

  return (
    <RailCard icon={Activity} title="Здоровье">
      {/* Вердикт здесь НЕ показывается: у рельсы внедрения его носит своя
          формула, а у сделки он стоит в зоне «Риски» рядом с кольцом. */}
      <DealSignals result={signals} onAction={scrollToSignalAnchor} showVerdict={false} />
    </RailCard>
  );
}

/** Здоровье ВНЕДРЕНИЯ: своя формула (getDeliveryHealth), не DealVerdict. */
function HealthDeliveryCard({ health }: { health: DeliveryHealth }) {
  return (
    <RailCard icon={Activity} title="Здоровье">
      <div className="flex flex-col gap-1.5">
        <DeliveryHealthDot health={health} size="md" showLabel />
        {health.reasons.length > 0 && (
          <p className="text-xs text-text-mute">{health.reasons.join('; ')}</p>
        )}
      </div>
    </RailCard>
  );
}

/**
 * Закреплённая заметка. Только у сделки: у delivery/internal заметка команды
 * живёт в «Материалах проекта», и второе поле под ту же колонку `pinned_note`
 * означало бы два редактора одного значения на одной странице.
 */
function PinnedNoteCard({ project }: { project: Project }) {
  const updateProject = useUpdateProject();
  return (
    <RailCard icon={Pin} title="Закреплено">
      {/* S-DEAL-ZONES-1A (F-08): мера строки на теле заметки, а не на карточке. */}
      <div className="max-w-[72ch] text-body leading-relaxed">
        <InlineEdit
          as="textarea"
          value={project.pinned_note ?? ''}
          placeholder="Закрепить заметку…"
          onSave={async (val) => {
            updateProject.mutate({ id: project.id, pinned_note: val || null });
          }}
        />
      </div>
    </RailCard>
  );
}

/**
 * Стейкхолдеры: id на обёртке — якорь CTA сигнала `single_threaded`.
 *
 * `pipelineId` идёт пропом отсюда, где `project` уже есть целиком: ожидания ролей
 * висят на ВОРОНКЕ, а второй запрос проекта внутри виджета ради одного поля означал
 * бы вторую истину о воронке сделки. У internal-проектов поле пусто — виджет обязан
 * это переживать (рисует прежний плоский список).
 */
function StakeholdersBlock({ project }: { project: Project }) {
  return (
    <div id="deal-stakeholders">
      <DealStakeholders
        projectId={project.id}
        primaryContactId={project.contact_id}
        primaryContact={project.contact ?? null}
        companyId={project.company_id}
        pipelineId={project.pipeline_id}
      />
    </div>
  );
}

// ─── Зоны карточки сделки (S-DEAL-ZONES-1A) ───

/**
 * Тело зоны «Риски»: что может сорвать сделку. Заголовок и фон зоны рисует
 * `ProjectDetail` — фон меняется с health, и класс `.h-*` обязан лежать на том
 * же узле, что подложка.
 *
 * Пустой список сигналов — нормальное состояние: `HealthDealCard` вернёт null,
 * остаётся «Закреплено» и спокойная заливка. Второго абзаца «всё в норме» тут
 * НЕТ намеренно — уровень уже несёт цвет зоны.
 */
export function DealRisksZone({
  project,
  signals,
}: {
  project: Project;
  signals: DealSignalsResult;
}) {
  return (
    <>
      {/* S-DEAL-ZONES-1B: кольцо только здесь — оно несёт пропорцию, которой в
          списке нет (норма свёрнута под «N в норме»). */}
      <HealthDealCard signals={signals} withRing />
      <PinnedNoteCard project={project} />
    </>
  );
}

/** Тело зоны «Контекст»: кто, сколько, что собрано. */
export function DealContextZone({
  project,
  parentDeal,
  completenessBadge,
  onEdit,
  onOpenMaterials,
}: {
  project: Project;
  parentDeal?: Project | null;
  completenessBadge?: React.ReactNode;
  onEdit?: () => void;
  onOpenMaterials: () => void;
}) {
  return (
    <>
      {/* isDelivery={false} — зоны существуют только у сделки (type === 'client'). */}
      <DealSummaryCard
        project={project}
        parentDeal={parentDeal}
        isDelivery={false}
        badge={completenessBadge}
        onEdit={onEdit}
      />
      {/* S-DEAL-CHZ-1: сразу за сводкой — там же стоит ссылка на компанию, а
          профиль маркировки принадлежит именно ей. Гейта по типу здесь НЕТ и он
          не нужен: `DealContextZone` монтируется только под `isDeal`
          (`ProjectDetail`, `type === 'client'`), у внедрения зон нет вовсе —
          проверка `type !== 'delivery'` внутри была бы мёртвой веткой. */}
      <DealChzCard project={project} />
      <StakeholdersBlock project={project} />
      <DealMaterialsCard project={project} isDelivery={false} onOpen={onOpenMaterials} />
    </>
  );
}

// ─── Рельса: путь внедрения и internal ───

export interface DealContextRailProps {
  project: Project;
  isDelivery: boolean;
  /** Собран один раз в `ProjectDetail`: второй сборщик = второй запрос. */
  signals: DealSignalsResult;
  /** У delivery вердикта сделки нет — есть health внедрения из project-полей. */
  deliveryHealth: DeliveryHealth | null;
  parentDeal?: Project | null;
  /** Бейдж полноты — переехал из шапки в «Сводку» (R-06). */
  completenessBadge?: React.ReactNode;
  onEdit?: () => void;
  /** Открыть модалку «Материалы проекта» (S-DEAL-CTX-1). */
  onOpenMaterials: () => void;
  className?: string;
}

export function DealContextRail({
  project,
  isDelivery,
  signals,
  deliveryHealth,
  parentDeal,
  completenessBadge,
  onEdit,
  onOpenMaterials,
  className,
}: DealContextRailProps) {
  const isDeal = project.type === 'client';

  return (
    // `lg:self-start` не косметика: растянутый по строке грида элемент sticky
    // не липнет — ему уже некуда двигаться внутри своей ячейки.
    <aside
      aria-label="Контекст сделки"
      className={cn('flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:self-start', className)}
    >
      {/* ─── 1. Здоровье ─── */}
      {isDeal && <HealthDealCard signals={signals} />}
      {isDelivery && deliveryHealth && <HealthDeliveryCard health={deliveryHealth} />}

      {/* ─── 2. Сводка ─── */}
      <DealSummaryCard
        project={project}
        parentDeal={parentDeal}
        isDelivery={isDelivery}
        badge={completenessBadge}
        onEdit={onEdit}
      />

      {/* ─── 3. Стейкхолдеры ─── */}
      {/* Компонент не переписан, только переставлен: id — якорь CTA сигнала
          `single_threaded`, он и раньше жил на обёртке. */}
      <StakeholdersBlock project={project} />

      {/* ─── 4. Закреплено ─── */}
      {isDeal && <PinnedNoteCard project={project} />}

      {/* ─── 5. Материалы ─── */}
      {/* Последней: порядок карточек — по убыванию частоты обращения. Сигналы
          смотрят каждый раз, сводку часто, участников реже, заметку и материалы
          — по необходимости. */}
      <DealMaterialsCard
        project={project}
        isDelivery={isDelivery}
        onOpen={onOpenMaterials}
      />
    </aside>
  );
}
