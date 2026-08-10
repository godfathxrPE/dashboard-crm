'use client';

import type { StageTimeGauge } from '@/lib/domain/stage-norm';

// ═══════════════════════════════════════════════════════
// S-PIPELINE-RING-2: кольцо времени стадии — компакт-форма тайм-ячейки кокпита.
//
// conic-gradient = доля израсходованной нормы; over — кольцо сомкнуто, красное
// (`pct` зажат в 100, состояние приходит из `stageTimeGauge` по ДНЯМ).
// Один семантический контракт с ячейкой кокпита — два размера, не два правила.
//
// ⚠️ Дырка — CSS mask, а НЕ внутренний круг цветом фона: кольцо живёт на разных
// подложках (surface карточки, surface2 при hover строки таблицы, тинт peek),
// и «дырка» цветом фона выдала бы себя на первой же из них.
// ═══════════════════════════════════════════════════════

const RING_COLOR = {
  ok: 'var(--accent)',
  warn: 'var(--yellow)',
  over: 'var(--red)',
} as const;

const DAYS_COLOR = {
  ok: 'var(--text-dim)',
  warn: 'var(--yellow-text, var(--yellow))',
  over: 'var(--red-text, var(--red))',
} as const;

export function StageTimeRing({
  gauge,
  size = '1rem',
  showDays = false,
}: {
  gauge: StageTimeGauge | null;
  size?: string;
  showDays?: boolean;
}) {
  if (!gauge || gauge.pct == null || gauge.days == null) return null;

  const color = RING_COLOR[gauge.state];
  const label = `${gauge.days} дн. в стадии · норма ${gauge.norm} дн.`;
  const mask =
    'radial-gradient(farthest-side, transparent calc(100% - 0.1875rem), #000 calc(100% - 0.1875rem + 0.5px))';

  return (
    <span className="inline-flex shrink-0 items-center gap-1" title={label}>
      <span
        role="img"
        aria-label={label}
        className="rounded-full"
        style={{
          width: size,
          height: size,
          background: `conic-gradient(${color} ${gauge.pct}%, var(--surface3) 0)`,
          WebkitMask: mask,
          mask,
        }}
      />
      {showDays && (
        <span className="text-meta tabular-nums" style={{ color: DAYS_COLOR[gauge.state] }}>
          {gauge.days} дн.
        </span>
      )}
    </span>
  );
}
