'use client';

import { Phone } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatPhone, telHref } from '@/lib/utils/phone';
import { getInitials } from '@/lib/utils/avatar';
import { CopyButton } from '@/components/ui/CopyButton';

// ═══════════════════════════════════════════════════════
// S-LEAD-V2-LAYOUT-1: чип контакта в футере стекла шага — вынесен из
// `DealNextStep` (S-DEAL-CONTACT-1), чтобы лид взял его, а не скопировал.
// Разметка перенесена дословно. Пропсы плоские: у сделки контакт — строка
// `contacts` (`ContactBrief`), у лида — сырые поля самого лида.
// ═══════════════════════════════════════════════════════

export interface ContactCallChipProps {
  name: string;
  position?: string | null;
  /** Источник инициалов: у сделки — имя без фамилии, у лида — имя целиком. */
  initialsFrom: string;
  phone: string | null;
  email: string | null;
}

/**
 * Чип контакта (спека сделки 1.3–1.4). Решение «рисовать ли» — за вызывающим:
 * без телефона и почты чип не нужен, имя без способа связи — не «в один клик».
 *
 * Акцент — рамкой и иконкой кнопки звонка, не заливкой: заливка `--accent` в
 * виджете одна, у метки «Следующий шаг». Цвет рамки ставит правило `.glass-call`
 * в globals.css, а не утилита `border-accent`: в frost/aurora/tidal safety-net
 * `.t-frost *` безслойный и перебил бы любую `border-*`-утилиту.
 */
export function ContactCallChip({ name, position, initialsFrom, phone, email }: ContactCallChipProps) {
  const focusRing =
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        aria-hidden
        className="grid size-[1.375rem] shrink-0 place-items-center rounded-full bg-surface2 text-[0.6rem] font-bold text-text-main"
      >
        {getInitials(initialsFrom)}
      </span>
      {/* Имя и должность переносятся по словам (15rem ≈ 240px спеки); номер — никогда. */}
      <span className="min-w-0 max-w-[15rem] leading-[1.2]">
        <span className="block text-xs font-semibold text-text-main">{name}</span>
        {position && (
          <span className="block text-pretty text-[0.65625rem] text-text-dim">{position}</span>
        )}
      </span>
      {phone ? (
        <a
          href={telHref(phone)}
          title={`Позвонить: ${name}`}
          className={cn(
            'glass-call inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5',
            'text-xs font-semibold tabular-nums text-text-main transition-colors',
            focusRing,
          )}
        >
          <Phone size={12} className="text-accent" aria-hidden />
          {formatPhone(phone)}
        </a>
      ) : (
        email && (
          <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className="min-w-0 text-meta text-text-dim [overflow-wrap:anywhere]">{email}</span>
            <CopyButton
              value={email}
              title="Скопировать почту"
              iconSize={11}
              // Кегль вне `cn`: tailwind-merge выкинул бы `text-meta` рядом с `text-text-dim`.
              className={`text-meta ${cn(
                'h-[1.375rem] rounded-sm bg-surface2 px-1.5 text-text-dim hover:text-text-main',
                focusRing,
              )}`}
            />
          </span>
        )
      )}
    </div>
  );
}
