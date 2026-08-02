'use client';

import { MessagesSquare, Users } from 'lucide-react';
import { channelInitials, gradientFor } from '@/lib/constants/chat-avatars';
import { cn } from '@/lib/utils/cn';
import type { ConversationKind } from '@/types/database';

interface ChannelAvatarProps {
  /** id канала — единственный источник градиента (стабилен, в отличие от названия). */
  id: string;
  title: string;
  kind: ConversationKind;
  /** Диаметр в rem. Дефолт — строка списка каналов. */
  size?: number;
  className?: string;
}

/**
 * S-CHAT-HUB-1e: аватар канала — приём Telegram для чатов без фото.
 *
 * Градиент детерминирован хешем id, инициалы — из названия. Это `<div>` с CSS-градиентом,
 * а не `<svg>`: рядом в MessageThread живёт аватар автора (img + fallback-инициалы в
 * круге), и второй паттерн отрисовки аватаров в одном экране был бы разнобоем.
 *
 * Два особых случая:
 *  • `general` — НЕ градиент, а нейтральный фон с иконкой. Общий канал в организации
 *    один: различать его не с чем, ему нужна узнаваемость, а цветное пятно среди
 *    цветных пятен как раз мешает его находить.
 *  • `group` — бейдж в углу поверх градиента, чтобы тип канала читался и после того,
 *    как иконки Hash/Users из строки убрали.
 *
 * `aria-hidden`: аватар декоративен, название канала стоит рядом текстом — озвучивать
 * инициалы вторым голосом значит читать одно и то же дважды.
 */
export function ChannelAvatar({ id, title, kind, size = 2, className }: ChannelAvatarProps) {
  const box = { width: `${size}rem`, height: `${size}rem` };
  // 16px в rem — база Tailwind; иконка занимает половину круга, как в AuthorAvatar.
  const iconPx = Math.round(size * 16 * 0.5);

  if (kind === 'general') {
    return (
      <div
        aria-hidden="true"
        style={box}
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full border border-border bg-surface2 text-text-dim',
          className,
        )}
      >
        <MessagesSquare size={iconPx} />
      </div>
    );
  }

  const gradient = gradientFor(id);
  const initials = channelInitials(title);

  return (
    <div style={box} className={cn('relative shrink-0', className)}>
      <div
        aria-hidden="true"
        style={{
          backgroundImage: `linear-gradient(135deg, ${gradient.from}, ${gradient.to})`,
          // Кегль от диаметра: одна пропорция обслуживает и строку списка (2rem), и
          // шапку треда (1.5rem) — второй набор классов под каждый размер не нужен.
          fontSize: `${(size * 0.4).toFixed(3)}rem`,
        }}
        className="flex h-full w-full items-center justify-center rounded-full font-semibold leading-none text-white"
      >
        {initials}
      </div>
      {kind === 'group' && (
        <span
          aria-hidden="true"
          className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full
                     border border-surface bg-surface2 p-[0.09rem] text-text-dim"
        >
          <Users size={Math.max(8, Math.round(iconPx * 0.55))} />
        </span>
      )}
    </div>
  );
}
