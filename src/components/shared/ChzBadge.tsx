'use client';

import type { ChzPhase } from '@/lib/data/chz-groups';

// ═══════════════════════════════════════════════════════
// Бейдж фазы товарной группы «Честного Знака».
//
// Вынесен из CompanyDetail в S-R2-CO360-1: тот же бейдж стоит в highlight-виджете,
// в сайдбаре карточки компании и в карточке сделки. Цвета — только переменные темы.
//
// S-DEAL-CHZ-2: «горячий» определяется ФАЗОЙ (`chzPhase` от даты), а не статусом
// справочника. `starting` — обязанность наступает в ближайшие полгода, решение
// покупается сейчас: тёплый семантический `warning` (внутри `.sheet` `--warning-text`
// уже переадресован). `mandatory` — зелёный: действует. `planned` и `experiment`
// приглушены: старт далеко или участие добровольное, повод слабый.
//
// `var(--*-text, var(--*))` у зелёного — тот же приём, что у остальных цветных
// тегов: в светлых темах подтягивается затемнённый текстовый близнец токена,
// в тёмных фолбэк отдаёт базовый цвет.
// ═══════════════════════════════════════════════════════

export function ChzBadge({ status, label }: { status: ChzPhase; label: string }) {
  if (status === 'starting') {
    return (
      <span data-tag className="rounded bg-warning-l px-1.5 py-0.5 text-xs text-warning-text">
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
