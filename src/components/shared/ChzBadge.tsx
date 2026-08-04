'use client';

import type { ChzStatus } from '@/lib/data/chz-groups';

// ═══════════════════════════════════════════════════════
// Бейдж статуса товарной группы «Честного Знака».
//
// Вынесен из CompanyDetail в S-R2-CO360-1: тот же бейдж теперь стоит и в
// highlight-виджете, и в сайдбаре карточки. Цвета — только переменные темы.
//
// `starting` жёлтый намеренно: это ГОРЯЧИЙ ЛИД (обязанность ещё не наступила,
// решение покупается сейчас), и он обязан выделяться сильнее действующей
// обязанности. `experiment` приглушён: участие добровольное, повод слабый.
//
// `var(--*-text, var(--*))` — тот же приём, что у остальных цветных тегов:
// в светлых темах подтягивается затемнённый текстовый близнец токена, в тёмных
// фолбэк отдаёт базовый цвет.
// ═══════════════════════════════════════════════════════

export function ChzBadge({ status, label }: { status: ChzStatus; label: string }) {
  if (status === 'starting') {
    return (
      <span data-tag className="rounded bg-yellow-l/60 px-1.5 py-0.5 text-xs"
        style={{ color: 'var(--yellow-text, var(--yellow))' }}>
        {label}
      </span>
    );
  }
  if (status === 'mandatory') {
    return (
      <span data-tag className="rounded bg-green-l px-1.5 py-0.5 text-xs"
        style={{ color: 'var(--green-text, var(--green))' }}>
        {label}
      </span>
    );
  }
  return (
    <span data-tag className="rounded bg-surface2 px-1.5 py-0.5 text-xs text-text-mute">{label}</span>
  );
}
