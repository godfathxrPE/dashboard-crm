'use client';

import { Activity, Pin } from 'lucide-react';
import { useUpdateProject, type Project } from '@/lib/hooks/use-projects';
import { InlineEdit } from '@/components/ui/InlineEdit';
import { RailCard } from '@/components/shared/RailCard';
import { DeliveryHealthDot } from '@/components/shared/DeliveryHealthDot';
import { DealSignals, scrollToSignalAnchor } from './DealSignals';
import { DealSummaryCard } from './DealSummaryCard';
import { DealStakeholders } from './DealStakeholders';
import { DealMaterialsCard } from './DealMaterialsCard';
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
// ═══════════════════════════════════════════════════════

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
  const updateProject = useUpdateProject();
  const projectId = project.id;
  const isDeal = project.type === 'client';

  return (
    // `lg:self-start` не косметика: растянутый по строке грида элемент sticky
    // не липнет — ему уже некуда двигаться внутри своей ячейки.
    <aside
      aria-label="Контекст сделки"
      className={cn('flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:self-start', className)}
    >
      {/* ─── 1. Здоровье ─── */}
      {isDeal && signals.signals.length > 0 && (
        <RailCard icon={Activity} title="Здоровье">
          {/* Вердикт здесь НЕ показывается: он стоит под следующим шагом в
              рабочей колонке. Два вердикта на экране — это F-01. */}
          <DealSignals result={signals} onAction={scrollToSignalAnchor} showVerdict={false} />
        </RailCard>
      )}
      {isDelivery && deliveryHealth && (
        <RailCard icon={Activity} title="Здоровье">
          <div className="flex flex-col gap-1.5">
            <DeliveryHealthDot health={deliveryHealth} size="md" showLabel />
            {deliveryHealth.reasons.length > 0 && (
              <p className="text-xs text-text-mute">{deliveryHealth.reasons.join('; ')}</p>
            )}
          </div>
        </RailCard>
      )}

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
      <div id="deal-stakeholders">
        <DealStakeholders
          projectId={projectId}
          primaryContactId={project.contact_id}
          primaryContact={project.contact ?? null}
          companyId={project.company_id}
        />
      </div>

      {/* ─── 4. Закреплено ─── */}
      {/* Только у сделки: у delivery/internal заметка команды живёт в
          «Материалах проекта», и второе поле под ту же колонку `pinned_note`
          означало бы два редактора одного значения на одной странице. */}
      {isDeal && (
        <RailCard icon={Pin} title="Закреплено">
          <div className="text-body leading-relaxed">
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
      )}

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
