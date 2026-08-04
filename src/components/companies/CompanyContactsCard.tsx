'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Users } from 'lucide-react';
import { useContactStrengthMap } from '@/lib/hooks/use-contact-strength';
import { daysSince } from '@/lib/hooks/use-last-touch';
import { getAvatarColor, getInitials } from '@/lib/utils/avatar';
import { formatStrength, type StrengthBand } from '@/lib/domain/relationship-strength';
import type { Contact } from '@/lib/hooks/use-contacts';

// ═══════════════════════════════════════════════════════
// S-R2-CO360-1 — секция «Контакты» карточки компании.
//
// Новое: аватар с инициалами, бейдж силы отношений (D1) и последнее касание.
// Сортировка — по score убыв.: список отвечает на вопрос «через кого заходить»,
// а алфавит на него не отвечает. Контакты без касаний уезжают вниз общим хвостом.
// ═══════════════════════════════════════════════════════

/** Цвета полос — только пары токенов. `*-text` подтягивает затемнённый близнец
 *  в светлых темах, фолбэк отдаёт базовый цвет в тёмных (приём ChzBadge). */
const BAND_STYLE: Record<StrengthBand, { className: string; color?: string }> = {
  strong: { className: 'bg-green-l', color: 'var(--green-text, var(--green))' },
  warm: { className: 'bg-yellow-l/60', color: 'var(--yellow-text, var(--yellow))' },
  cold: { className: 'bg-surface3 text-text-mute' },
};

const TOUCH_LABEL: Record<'call' | 'meeting', string> = { call: 'звонок', meeting: 'встреча' };

interface CompanyContactsCardProps {
  companyId: string;
  contacts: Contact[];
  canCreate: boolean;
  onCreate: () => void;
}

export function CompanyContactsCard({ companyId, contacts, canCreate, onCreate }: CompanyContactsCardProps) {
  const router = useRouter();
  const contactIds = useMemo(() => contacts.map((c) => c.id), [contacts]);
  const { data: strengthMap } = useContactStrengthMap(contactIds);

  // Пока сила не подгрузилась, порядок — исходный (алфавит из useContacts):
  // прыжок строк после загрузки заметен, но он одноразовый и честнее, чем
  // держать список пустым.
  const sorted = useMemo(() => {
    if (!strengthMap) return contacts;
    return [...contacts].sort((a, b) => {
      const sa = strengthMap.get(a.id);
      const sb = strengthMap.get(b.id);
      // Без касаний — вниз, независимо от очков (у них score = 0, но правило
      // явное: «нет истории» и «история остыла» это разные вещи).
      const hasA = sa?.lastTouch ? 1 : 0;
      const hasB = sb?.lastTouch ? 1 : 0;
      if (hasA !== hasB) return hasB - hasA;
      return (sb?.strength.score ?? 0) - (sa?.strength.score ?? 0);
    });
  }, [contacts, strengthMap]);

  return (
    <div data-card className="rounded-lg border border-border/60 bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <Users size={14} className="text-text-dim" />
        <span className="text-xs font-semibold text-text-main">Контакты</span>
        <span className="rounded-full bg-bg px-1.5 py-0.5 text-xs text-text-mute">{contacts.length}</span>
        {canCreate && (
          <button onClick={onCreate}
            className="ml-auto text-xs text-text-mute transition-colors hover:text-text-main">
            + Контакт
          </button>
        )}
      </div>

      {contacts.length === 0 ? (
        <p className="text-xs italic text-text-mute">Нет привязанных контактов.</p>
      ) : (
        <div className="space-y-1.5">
          {sorted.map((c) => {
            const role = c.companies?.find((cc) => cc.company_id === companyId)?.role;
            const fullName = `${c.first_name} ${c.last_name}`.trim();
            const cs = strengthMap?.get(c.id);
            const band = cs ? BAND_STYLE[cs.strength.band] : null;
            return (
              <button key={c.id} onClick={() => router.push(`/contacts/${c.id}`)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-hover">
                <span
                  aria-hidden
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                  style={{ backgroundColor: getAvatarColor(fullName) }}
                >
                  {getInitials(c.first_name, c.last_name)}
                </span>
                <span className="truncate text-sm text-text-main">{fullName}</span>
                {role && (
                  <span data-tag className="shrink-0 rounded bg-accent-l px-1.5 py-0.5 text-xs text-accent">{role}</span>
                )}
                {cs && band && (
                  <span
                    data-tag
                    title="Сила отношений: свежесть касания + частота за 90 дней + запланированный шаг"
                    className={`shrink-0 rounded px-1.5 py-0.5 text-xs tabular-nums ${band.className}`}
                    style={band.color ? { color: band.color } : undefined}
                  >
                    {formatStrength(cs.strength)}
                  </span>
                )}
                <span className="ml-auto shrink-0 text-xs tabular-nums text-text-dim">
                  {cs?.lastTouch
                    ? `${TOUCH_LABEL[cs.lastTouch.kind]} · ${daysSince(cs.lastTouch.date)} дн`
                    : c.position ?? ''}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
