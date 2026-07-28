'use client';

import { Building2, Mail, Phone, User } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Badge } from '@/components/ui/Badge';
import { leadStaleness } from '@/lib/constants/leads';
import {
  LEAD_STATUS_CONFIG,
  LEAD_SOURCE_CONFIG,
  DISQUALIFY_REASON_CONFIG,
  type DisqualifyReason,
} from '@/lib/validators/lead';
import { formatPhone } from '@/lib/utils/phone';
import type { Lead } from '@/types/database';

/**
 * Содержимое peek-панели лида (S-R2-PEEK-2). Новых запросов нет — все поля
 * уже в строке. Статус/источник/причина отказа и возраст берутся теми же
 * конфигами и той же `leadStaleness`, что карточка канбана: второй набор
 * цветов и второй расчёт возраста разошлись бы с доской.
 */
export function LeadPeekContent({ lead }: { lead: Lead }) {
  const statusCfg = LEAD_STATUS_CONFIG[lead.status];
  const staleness = leadStaleness(lead);

  const hasRaw = !!(lead.company_name_raw || lead.contact_name_raw || lead.phone || lead.email);

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge color={statusCfg?.color as 'blue' | 'green' | 'red' | 'yellow' | 'accent'} size="sm">
          {statusCfg?.label ?? lead.status}
        </Badge>
        {lead.source && (
          <Badge color="accent" size="sm">
            {LEAD_SOURCE_CONFIG[lead.source]?.label ?? lead.source}
          </Badge>
        )}
        {lead.direction && (
          <Badge color={lead.direction === 'erp' ? 'purple' : 'blue'} size="sm">
            {lead.direction === 'iiot' ? 'IIoT' : 'ERP'}
          </Badge>
        )}
      </div>

      <div className="space-y-1.5">
        {lead.company_name_raw && (
          <p className="flex items-center gap-1.5 text-text-main">
            <Building2 size={13} className="text-text-mute" />
            {lead.company_name_raw}
          </p>
        )}
        {lead.contact_name_raw && (
          <p className="flex items-center gap-1.5 text-text-main">
            <User size={13} className="text-text-mute" />
            {lead.contact_name_raw}
          </p>
        )}
        {lead.phone && (
          <a
            href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`}
            className="flex items-center gap-1.5 text-text-main hover:text-accent"
          >
            <Phone size={13} className="text-text-mute" />
            {formatPhone(lead.phone)}
          </a>
        )}
        {lead.email && (
          <a href={`mailto:${lead.email}`} className="flex items-center gap-1.5 text-accent hover:underline">
            <Mail size={13} className="text-text-mute" />
            {lead.email}
          </a>
        )}
        {!hasRaw && <p className="text-xs text-text-mute">Данные не заполнены</p>}
      </div>

      {/* Возраст — та же ○/● семантика и те же подписи, что на карточке канбана */}
      <p className="flex items-center gap-2 text-xs text-text-mute">
        {new Date(lead.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
        {staleness.level !== 'ok' && (
          <span
            className="flex items-center gap-1 font-medium"
            style={{
              color: staleness.level === 'cold'
                ? 'var(--red-text, var(--red))'
                : 'var(--yellow-text, var(--yellow))',
            }}
            title={lead.status === 'new' ? 'Дней без первого касания' : 'Дней без движения'}
          >
            <span className={cn(
              'inline-block h-[6px] w-[6px] rounded-full',
              staleness.level === 'cold' ? 'bg-current' : 'border border-current',
            )} />
            {staleness.days} дн.
          </span>
        )}
      </p>

      {lead.disqualify_reason && (
        <p className="text-xs">
          <span className="text-text-mute">Причина отказа: </span>
          <span className="rounded bg-red-l px-1.5 py-0.5 text-red">
            {DISQUALIFY_REASON_CONFIG[lead.disqualify_reason as DisqualifyReason]?.label ?? lead.disqualify_reason}
          </span>
        </p>
      )}

      {lead.notes && (
        <div className="border-t border-border/50 pt-3">
          <p className="mb-1 text-xs font-medium text-text-dim">Заметки</p>
          <p className="whitespace-pre-wrap text-xs text-text-dim line-clamp-3">{lead.notes}</p>
        </div>
      )}
    </div>
  );
}
