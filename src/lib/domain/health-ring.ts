import type { DealSignal, SignalKey, SignalState } from '@/lib/domain/deal-signals';

// ═══════════════════════════════════════════════════════
// S-DEAL-ZONES-1B: геометрия кольца здоровья сделки.
//
// Кольцо — НЕ score. Сегменты равные, по одному на применимый сигнал; смысл
// несёт цвет сегмента и его позиция (та же, что у строки в списке). Взвешенная
// версия из макета отклонена: весов у сигналов нет, а выдуманные 30/12/10
// вернули бы непрозрачный балл, ради ухода от которого `calculateDealHealth`
// (0–8) и был снят в S-HEALTH-V2-1.
//
// Цвет — ТОЛЬКО семантические токены (--danger/--warning/--success).
// `--accent` для смысла не годится: в `t-washi` акцент === --red, и «в порядке»
// стало бы красным. Правило унаследовано из шапки `DealSignals.tsx`.
//
// `--h-ring` из :root здесь НЕ используется: он один на всю зону, а сегменту
// нужен свой цвет.
// ═══════════════════════════════════════════════════════

export const RING_RADIUS = 35;
export const RING_STROKE = 6;
/** viewBox 80×80: r 35 + половина обводки 3 = 38 ≤ 40. */
export const RING_BOX = 80;
/** Зазор между сегментами, градусы (Р3). */
export const RING_GAP_DEG = 2;

const STATE_STROKE: Record<Exclude<SignalState, 'na'>, string> = {
  bad:  'var(--danger)',
  warn: 'var(--warning)',
  ok:   'var(--success)',
};

export interface RingSegment {
  key: SignalKey;
  /** Подпись для нативного тултипа сегмента. */
  label: string;
  /** Готовое значение stroke — CSS-переменная, не hex. */
  stroke: string;
  /** Границы дуги в градусах: 0 — 12 часов, рост по часовой. */
  startDeg: number;
  endDeg: number;
  /** Атрибут d для <path>. */
  d: string;
}

export interface HealthRing {
  segments: RingSegment[];
  /** Сколько сигналов не в норме — большое число в центре. */
  problems: number;
  /** Сколько сигналов всего — маленькое «из N». */
  total: number;
}

/** Точка на окружности; 0° — 12 часов, отсчёт по часовой стрелке. */
export function polarPoint(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const [x0, y0] = polarPoint(cx, cy, r, startDeg);
  const [x1, y1] = polarPoint(cx, cy, r, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x0.toFixed(3)} ${y0.toFixed(3)} A ${r} ${r} 0 ${largeArc} 1 ${x1.toFixed(3)} ${y1.toFixed(3)}`;
}

/**
 * `signals` приходит уже отсортированным (bad → warn → ok) и без 'na' — так его
 * отдаёт `getDealSignals`. Порядок здесь НЕ трогается: он обязан совпадать с
 * порядком строк списка, иначе кольцо перестаёт быть легендой.
 */
export function buildHealthRing(signals: DealSignal[]): HealthRing {
  const total = signals.length;
  if (total === 0) return { segments: [], problems: 0, total: 0 };

  const c = RING_BOX / 2;
  const slotDeg = 360 / total;
  const half = RING_GAP_DEG / 2;

  const segments = signals.map((s, i) => {
    const startDeg = i * slotDeg + half;
    const endDeg = (i + 1) * slotDeg - half;
    return {
      key: s.key,
      label: s.label,
      stroke: STATE_STROKE[s.state === 'na' ? 'ok' : s.state],
      startDeg,
      endDeg,
      d: arcPath(c, c, RING_RADIUS, startDeg, endDeg),
    };
  });

  return {
    segments,
    problems: signals.filter((s) => s.state !== 'ok').length,
    total,
  };
}
