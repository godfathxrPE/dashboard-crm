'use client';

import { EntityChip } from '@/components/chat/EntityChip';
import type { EntityTitles } from '@/lib/hooks/use-entity-titles';
import type { BodyPart } from '@/lib/utils/entity-links';

/**
 * S-CHAT-HUB-1e: тело сообщения — текст плюс чипы ссылок на карточки CRM.
 *
 * Разбор приходит готовым (`parts`), а не считается здесь: одна лента = один разбор на
 * сообщение и ОДИН запрос названий на всю ленту. Считать разбор внутри компонента
 * означало бы N запросов и пересчёт на каждый рендер.
 *
 * XSS-контур прежний: текстовые куски рендерятся детьми React (он их экранирует),
 * `whitespace-pre-wrap` сохранён — переносы строк в сообщениях остаются переносами.
 * `dangerouslySetInnerHTML` здесь нет и быть не должно.
 */
export function MessageBody({
  parts,
  titles,
  isLoading,
  className,
}: {
  parts: BodyPart[];
  titles: EntityTitles;
  isLoading: boolean;
  className?: string;
}) {
  return (
    <p className={`whitespace-pre-wrap break-words text-sm ${className ?? ''}`}>
      {parts.map((part, i) =>
        part.kind === 'text' ? (
          // Ключ по индексу — здесь это правильный ключ: список неупорядоченный набор,
          // а позиционная нарезка одной строки, и переставить куски нечем.
          <span key={i}>{part.text}</span>
        ) : (
          <EntityChip key={i} part={part} titles={titles} isLoading={isLoading} />
        ),
      )}
    </p>
  );
}
