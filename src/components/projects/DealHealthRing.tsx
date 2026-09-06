'use client';

import { buildHealthRing, RING_BOX, RING_RADIUS, RING_STROKE } from '@/lib/domain/health-ring';
import type { DealSignal } from '@/lib/domain/deal-signals';

// ═══════════════════════════════════════════════════════
// S-DEAL-ZONES-1B (Р3). Кольцо здоровья сделки — по макету «Сделка v2»:
// серая дорожка, одна дуга помех цветом худшего состояния, счёт в центре.
//
// A11Y: кольцо — role="img" с полной подписью. Кликабельных зон в нём нет:
// переход к сигналу делает кнопка CTA в его строке под кольцом, и дублировать
// её мышиной мишенью на дуге незачем — дуга ведёт не к одному сигналу.
// ═══════════════════════════════════════════════════════

export function DealHealthRing({ signals }: { signals: DealSignal[] }) {
  const ring = buildHealthRing(signals);
  if (ring.total === 0) return null;

  const c = RING_BOX / 2;
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
        {/* Дорожка — полный круг под дугой: она даёт кольцу форму, когда дуга
            короткая, и служит шкалой «сколько всего». */}
        <circle
          cx={c}
          cy={c}
          r={RING_RADIUS}
          fill="none"
          stroke="var(--border)"
          strokeWidth={RING_STROKE}
        />
        {ring.full ? (
          <circle
            cx={c}
            cy={c}
            r={RING_RADIUS}
            fill="none"
            stroke={ring.stroke}
            strokeWidth={RING_STROKE}
          />
        ) : (
          ring.d && (
            <path
              d={ring.d}
              fill="none"
              stroke={ring.stroke}
              strokeWidth={RING_STROKE}
              strokeLinecap="butt"
            />
          )
        )}
      </svg>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
      >
        <span className="text-2xl font-bold leading-none tabular-nums text-text-main">
          {ring.problems}
        </span>
        <span className="mt-1 text-meta leading-none tabular-nums text-text-dim">
          из {ring.total}
        </span>
      </div>
    </div>
  );
}
