'use client';

import type { DealHealth } from '@/lib/utils/deal-health';

// ═══════════════════════════════════════════════════════
// Точка здоровья сделки — общая разметка для списков сделок на карточке компании
// и в peek-панели. Парная к `DeliveryHealthDot` (внедрения).
// Статус кодируется заливкой/обводкой, а не только цветом: при дейтеранопии
// red↔yellow неразличимы.
//   ● заливка red  — шаг просрочен
//   ○ обводка yellow — нет следующего шага
//   'ok' — не рендерится вовсе
// ═══════════════════════════════════════════════════════

export function DealHealthDot({ health }: { health: DealHealth }) {
  if (health === 'ok') return null;
  const overdue = health === 'overdue-action';
  const title = overdue ? 'Шаг просрочен' : 'Нет следующего шага';

  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className="inline-block h-[6px] w-[6px] shrink-0 rounded-full"
      style={overdue
        ? { backgroundColor: 'var(--red-text, var(--red))' }
        : { border: '1px solid var(--yellow-text, var(--yellow))' }}
    />
  );
}
