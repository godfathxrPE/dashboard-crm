'use client';

import { cn } from '@/lib/utils/cn';
import { getLeadHealth } from '@/lib/utils/lead-health';

// ═══════════════════════════════════════════════════════
// S-LEAD-HUB-2b: метка здоровья лида — один рендер на канбан, peek и карточку.
//
// До спринта «○/● N дн.» жил тремя копиями (LeadsView, LeadPeekContent, LeadDetail),
// и каждая считала ТОЛЬКО staleness. С `getLeadHealth` копии разошлись бы уже на
// следующей правке правила — поэтому метка стала компонентом, а не четвёртой копией.
// Семантика ○/● сохранена: пустой кружок — предупреждение, залитый — «совсем плохо».
// ═══════════════════════════════════════════════════════

interface LeadForMark {
  status: string;
  created_at: string;
  updated_at: string;
  next_action_date?: string | null;
}

export function LeadHealthMark({ lead, className }: { lead: LeadForMark; className?: string }) {
  const h = getLeadHealth(lead);
  if (h.level === 'ok') return null;

  const urgent = h.level === 'overdue-action' || h.level === 'cold';
  const color = urgent ? 'var(--red-text, var(--red))' : 'var(--yellow-text, var(--yellow))';
  const title = h.reason === 'overdue'
    ? 'Дней с даты запланированного шага'
    : lead.status === 'new' ? 'Дней без первого касания' : 'Дней без движения';

  return (
    <span className={cn('flex items-center gap-1 font-medium', className)} style={{ color }} title={title}>
      <span className={cn(
        'inline-block h-[6px] w-[6px] rounded-full',
        urgent ? 'bg-current' : 'border border-current',
      )} />
      {h.reason === 'overdue' ? `шаг просрочен ${h.days} дн.` : `${h.days} дн.`}
    </span>
  );
}
