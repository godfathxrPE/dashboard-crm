'use client';

import Link from 'next/link';
import { Building2, Mail, Phone } from 'lucide-react';
import type { Contact } from '@/lib/hooks/use-contacts';
import { daysSince, touchLevel } from '@/lib/hooks/use-last-touch';
import { formatPhone } from '@/lib/utils/phone';

/** Содержимое peek-панели контакта (Sprint W2d) — статичная композиция без новых запросов */
export function ContactPeekContent({ contact }: { contact: Contact & { last_touch?: string | null } }) {
  const days = contact.last_touch ? daysSince(contact.last_touch) : null;
  const level = touchLevel(days);

  return (
    <div className="space-y-4 text-sm">
      {contact.position && <p className="text-text-dim">{contact.position}</p>}

      {(contact.companies ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {(contact.companies ?? []).map((cc) => (
            <Link
              key={cc.company_id}
              href={`/companies/${cc.company_id}`}
              className="inline-flex items-center gap-1 rounded border border-border bg-surface2
                         px-1.5 py-0.5 text-[11px] text-text-dim transition-colors hover:border-accent hover:text-accent"
            >
              <Building2 size={10} />
              {cc.company?.name ?? 'N/A'}
              {cc.role && <span className="text-text-mute"> · {cc.role}</span>}
            </Link>
          ))}
        </div>
      )}

      <div className="space-y-1.5">
        {contact.phone && (
          <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 text-text-main hover:text-accent">
            <Phone size={13} className="text-text-mute" />
            {formatPhone(contact.phone)}
          </a>
        )}
        {contact.email && (
          <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 text-accent hover:underline">
            <Mail size={13} className="text-text-mute" />
            {contact.email}
          </a>
        )}
        {!contact.phone && !contact.email && (
          <p className="text-xs text-text-mute">Нет контактных данных</p>
        )}
      </div>

      <p className="text-xs">
        {contact.last_touch === null || contact.last_touch === undefined ? (
          <span className="text-text-mute">Касаний не было</span>
        ) : level === 'ok' ? (
          <span className="text-text-dim">
            Касание: {new Date(contact.last_touch).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
          </span>
        ) : (
          <span className={level === 'cold' ? 'text-red' : 'text-yellow'}>
            {days} дн. без касания
          </span>
        )}
      </p>
    </div>
  );
}
