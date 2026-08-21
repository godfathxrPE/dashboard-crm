'use client';

import { Building2, Mail, Phone, User } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import {
  LEAD_STATUS_CONFIG,
  LEAD_SOURCE_CONFIG,
  LEAD_TEMPERATURE_CONFIG,
  DISQUALIFY_REASON_CONFIG,
  type DisqualifyReason,
} from '@/lib/validators/lead';
import { formatBudget } from '@/lib/validators/project';
import { formatPhone } from '@/lib/utils/phone';
import { LeadHealthMark } from './LeadHealthMark';
import type { Lead } from '@/types/database';

/**
 * Содержимое peek-панели лида (S-R2-PEEK-2). Статус/источник/причина отказа и
 * здоровье берутся теми же конфигами и тем же `LeadHealthMark`, что карточка
 * канбана: второй набор цветов и второй расчёт разошлись бы с доской.
 *
 * S-LEAD-HUB-2b: добавлены поля работы (117) — температура, сумма, шаг,
 * ответственный. Запросов компонент НЕ делает: все поля уже в строке, а имя
 * ответственного приходит пропом от списка (он и так резолвит его для колонки).
 * ⚠️ Хук данных внутри превратил бы presentational-компонент в требующий
 * QueryClient — семь существующих тестов рендерят его голым, и это правильно.
 */
export function LeadPeekContent({ lead, ownerName }: { lead: Lead; ownerName?: string | null }) {
  const statusCfg = LEAD_STATUS_CONFIG[lead.status];

  const hasRaw = !!(lead.company_name_raw || lead.contact_name_raw || lead.phone || lead.email);

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge color={statusCfg?.color} size="sm">
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
        {lead.temperature && (
          <Badge color={LEAD_TEMPERATURE_CONFIG[lead.temperature].color} size="sm">
            {LEAD_TEMPERATURE_CONFIG[lead.temperature].label}
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

      {/* Работа по лиду (117): шаг, сумма, ответственный — то, ради чего peek и открывают */}
      {(lead.next_step || lead.estimated_value != null || ownerName) && (
        <div className="space-y-1 border-t border-border pt-3 text-xs">
          {lead.next_step && (
            <p className="text-text-dim">
              <span className="text-text-mute">Шаг: </span>
              {lead.next_step}
            </p>
          )}
          {lead.estimated_value != null && (
            <p className="text-text-dim">
              <span className="text-text-mute">Сумма: </span>
              <span className="font-medium text-text-main tabular-nums">{formatBudget(lead.estimated_value)}</span>
            </p>
          )}
          {ownerName && (
            <p className="text-text-dim">
              <span className="text-text-mute">Ответственный: </span>
              {ownerName}
            </p>
          )}
        </div>
      )}

      {/* Дата создания + здоровье (метка знает про запланированный шаг) */}
      <p className="flex items-center gap-2 text-xs text-text-mute">
        {new Date(lead.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
        <LeadHealthMark lead={lead} />
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
        <div className="border-t border-border pt-3">
          <p className="mb-1 text-xs font-medium text-text-dim">Заметки</p>
          <p className="whitespace-pre-wrap text-xs text-text-dim line-clamp-3">{lead.notes}</p>
        </div>
      )}
    </div>
  );
}
