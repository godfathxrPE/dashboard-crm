'use client';

import {
  buildHealthRing,
  RING_BOX,
  RING_STROKE,
} from '@/lib/domain/health-ring';
import type { DealSignal, SignalKey } from '@/lib/domain/deal-signals';

// ═══════════════════════════════════════════════════════
// S-DEAL-ZONES-1B (Р3). Кольцо здоровья сделки.
//
// A11Y: кольцо — role="img" с полной подписью, сегменты НЕ являются focusable.
// Клик по сегменту — мышиная надстройка над действием, которое с клавиатуры уже
// доступно кнопкой CTA в строке сигнала под кольцом. Отдельные табстопы на
// дугах дали бы второй набор точек остановки к тем же пяти действиям.
//
// Дуги — <path>, не окружности со stroke-dasharray: кликается ровно видимая
// фигура, а не полный круг с невидимыми штрихами поверх соседей.
// ═══════════════════════════════════════════════════════

export function DealHealthRing({
  signals,
  onSegmentClick,
}: {
  signals: DealSignal[];
  onSegmentClick?: (key: SignalKey) => void;
}) {
  const ring = buildHealthRing(signals);
  if (ring.total === 0) return null;

  const label =
    ring.problems === 0
      ? `Здоровье сделки: все ${ring.total} сигналов в норме`
      : `Здоровье сделки: ${ring.problems} из ${ring.total} сигналов требуют внимания`;

  return (
    <div className="relative shrink-0" style={{ width: RING_BOX, height: RING_BOX }}>
      <svg
        width={RING_BOX}
        height={RING_BOX}
        viewBox={`0 0 ${RING_BOX} ${RING_BOX}`}
        role="img"
        aria-label={label}
      >
        {ring.segments.map((seg) => (
          <path
            key={seg.key}
            d={seg.d}
            fill="none"
            stroke={seg.stroke}
            strokeWidth={RING_STROKE}
            strokeLinecap="butt"
            onClick={onSegmentClick ? () => onSegmentClick(seg.key) : undefined}
            className={onSegmentClick ? 'cursor-pointer' : undefined}
          >
            <title>{seg.label}</title>
          </path>
        ))}
      </svg>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
      >
        <span className="text-2xl font-bold leading-none tabular-nums text-text-main">
          {ring.problems}
        </span>
        <span className="mt-0.5 text-meta leading-none tabular-nums text-text-dim">
          из {ring.total}
        </span>
      </div>
    </div>
  );
}
