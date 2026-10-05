'use client';

import { ChevronRight, Check } from 'lucide-react';
import { useUpdateLead } from '@/lib/hooks/use-leads';
import { InlineEdit } from '@/components/ui/InlineEdit';
import { getLeadActionOverdueDays } from '@/lib/utils/lead-health';
import { formatActionDate } from '@/lib/utils/action-date';
import { cn } from '@/lib/utils/cn';
import { ContactCallChip } from '@/components/shared/ContactCallChip';
import type { Lead } from '@/types/database';

// ═══════════════════════════════════════════════════════
// S-LEAD-V2-LAYOUT-1 (спека §4, W2): «Следующий шаг» лида — копия разметки
// `DealNextStep` (стекло, плашка, 72ch; без жёлтого канта), мутации — `useUpdateLead`.
//
// От сделки НЕ берётся:
//  · переносы шага (`useFieldMoves`) — у лида нет аудита полей 087;
//  · строка «N дней без касания» — у лида молчание это сигнал зоны «Риски»
//    (HEALTH-1), второй носитель того же факта — F-01;
//  · «Перенести» и «обновлён … · кто» — те же причины, что в шапке `DealNextStep`.
//
// Просрочка — `getLeadActionOverdueDays`, а не функция сделки: у той off-by-one
// в MSK (разбор — шапка `lead-health.ts`).
//
// `readOnly` нет намеренно: компонент монтируется только у new/contacted/qualified.
// ═══════════════════════════════════════════════════════

export function LeadNextStep({ lead }: { lead: Lead }) {
  const updateLead = useUpdateLead();

  const overdueDays = lead.next_action_date ? getLeadActionOverdueDays(lead.next_action_date) : 0;
  const overdue = overdueDays > 0;
  const empty = !lead.next_step;

  const contactName = lead.contact_name_raw?.trim() || null;
  // Правило чипа сделки: имя без способа связи — не «в один клик».
  const showChip = !!contactName && !!(lead.phone || lead.email);
  // Поведение уже есть (`advanceLeadToContacted` в use-calls.ts) — строка только
  // называет его, чтобы менеджер не двигал статус руками после звонка.
  const showAutoHint = lead.status === 'new' && !lead.first_contacted_at;

  function markStepDone() {
    updateLead.mutate({ id: lead.id, next_step: null, next_action_date: null });
  }

  return (
    // Якорь CTA сигнала `step` (зона «Риски», HEALTH-1).
    <div id="lead-next-step" className="min-w-0">
      <div
        data-card
        // Без жёлтого канта намеренно (приёмка владельца 27.09): жёлтый кант пустого
        // шага у лида — лишний носитель. Пустое состояние видно курсивом «Какой
        // следующий шаг?», а риск «шага нет» пишет зона «Риски» (F-01).
        className="glass-sheet px-5 pb-4 pt-[1.125rem]"
      >
        <div className="mb-2.5 flex items-center gap-2">
          <span className="grid h-[1.375rem] w-[1.375rem] shrink-0 place-items-center rounded-sm bg-accent text-white">
            <ChevronRight size={13} strokeWidth={3} />
          </span>
          <span className="text-xs font-bold tracking-[0.02em] text-accent">
            Следующий шаг
          </span>
        </div>

        <div className="glass-plate max-w-[72ch] px-[1.125rem] py-3.5">
          <div className="text-xl font-medium leading-[1.3] tracking-[-0.015em] text-pretty">
            <InlineEdit
              value={lead.next_step ?? ''}
              placeholder="Какой следующий шаг?"
              className={cn(empty && 'italic')}
              onSave={async (val) => {
                updateLead.mutate({ id: lead.id, next_step: val || null });
              }}
            />
          </div>
        </div>

        <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-body">
          <span className="flex items-center gap-1">
            <span className="text-text-dim">Дата:</span>
            <InlineEdit
              value={lead.next_action_date ?? ''}
              type="date"
              placeholder="назначить"
              formatDisplay={formatActionDate}
              onSave={async (val) => {
                updateLead.mutate({ id: lead.id, next_action_date: val || null });
              }}
              className={cn(lead.next_action_date ? 'font-medium' : 'italic', overdue && 'text-red')}
            />
          </span>
          {overdue && (
            <span className="font-medium text-red">
              просрочен {overdueDays} дн.
            </span>
          )}
          {lead.next_step && (
            <button
              onClick={markStepDone}
              className="flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-0.5
                         text-xs text-text-dim transition-colors hover:bg-surface2 hover:text-green"
            >
              <Check size={12} />
              Шаг сделан
            </button>
          )}
          {showChip && contactName && (
            <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
              <ContactCallChip
                name={contactName}
                initialsFrom={contactName}
                phone={lead.phone}
                email={lead.email}
              />
            </div>
          )}
        </div>

        {showAutoHint && (
          <p className="mt-2.5 text-meta text-text-dim">
            Звонок со статусом «состоялся» сам переведёт лид в «Контакт»
          </p>
        )}
      </div>
    </div>
  );
}
