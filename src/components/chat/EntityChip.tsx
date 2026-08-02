'use client';

import Link from 'next/link';
import { Building2, Contact, FolderKanban, Handshake } from 'lucide-react';
import type { EntityPart, EntityType } from '@/lib/utils/entity-links';
import type { EntityTitles } from '@/lib/hooks/use-entity-titles';
import { entityKey } from '@/lib/utils/entity-links';

const ICONS: Record<EntityType, typeof Building2> = {
  deal: Handshake,
  project: FolderKanban,
  company: Building2,
  contact: Contact,
};

const LABELS: Record<EntityType, string> = {
  deal: 'Сделка',
  project: 'Внедрение',
  company: 'Компания',
  contact: 'Контакт',
};

const CHIP_BASE =
  'mx-0.5 inline-flex max-w-[14rem] items-center gap-1 rounded-full border px-1.5 align-baseline text-meta leading-normal';

/**
 * S-CHAT-HUB-1e: ссылка на карточку CRM внутри сообщения.
 *
 * Три состояния, и все три обязаны быть безопасными:
 *  • название приехало — ссылка с названием;
 *  • ещё грузится — ссылка с укороченным uuid (ждать название, показывая пустоту,
 *    значит дёргать раскладку сообщения);
 *  • названия нет — «Недоступно» БЕЗ ссылки. Пусто в ответе означает, что RLS не
 *    показала сущность этому человеку; вести его в 404 вместо честной пометки — хуже.
 *
 * href берётся из `part.href` (собран парсером из белого списка сегментов и uuid), а
 * не из исходного текста сообщения — XSS-контур ленты не расширяется.
 */
export function EntityChip({
  part,
  titles,
  isLoading,
}: {
  part: EntityPart;
  titles: EntityTitles;
  isLoading: boolean;
}) {
  const Icon = ICONS[part.entityType];
  const label = LABELS[part.entityType];
  const title = titles.get(entityKey(part.entityType, part.id)) ?? null;

  if (!title && !isLoading) {
    return (
      <span
        className={`${CHIP_BASE} border-border bg-surface2 text-text-mute`}
        title={`${label} недоступна`}
      >
        <Icon size={11} className="shrink-0" aria-hidden="true" />
        <span className="truncate">Недоступно</span>
      </span>
    );
  }

  // Первые 8 символов uuid — то же, чем сущность опознают в логах и в адресной строке.
  const text = title ?? part.id.slice(0, 8);

  return (
    <Link
      href={part.href}
      title={`${label}: ${title ?? part.id}`}
      className={`${CHIP_BASE} border-border bg-surface2 text-text-dim transition-colors
                  hover:border-accent hover:text-text-main`}
    >
      <Icon size={11} className="shrink-0" aria-hidden="true" />
      <span className="truncate">{text}</span>
    </Link>
  );
}
