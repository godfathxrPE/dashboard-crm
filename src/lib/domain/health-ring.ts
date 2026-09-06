import type { DealSignal, SignalState } from '@/lib/domain/deal-signals';

// ═══════════════════════════════════════════════════════
// S-DEAL-ZONES-1B: геометрия кольца здоровья сделки.
//
// Кольцо — ОДНА дуга по серой дорожке, как в макете «Сделка v2»: доля помех от
// всех применимых сигналов, цветом худшего состояния. Первая реализация делила
// дугу на цветные сегменты по сигналам — это была ошибка чтения макета: там
// сегментация живёт в горизонтальной пятиполосной шкале, а Р3 её убрал как
// дубль списка. Перенеся сегменты в кольцо, я вернул убранное и испортил вид.
//
// Кольцо — НЕ score. Взвешенная версия макета (100 минус веса сигналов)
// отклонена: весов у сигналов нет, а выдуманные вернули бы непрозрачный балл,
// ради ухода от которого `calculateDealHealth` (0–8) и был снят в S-HEALTH-V2-1.
// Здесь дуга считает сигналы, а не баллы: «4 из 5» проверяемо, «48 из 100» — нет.
//
// Цвет — семантические токены (--danger/--warning/--success). `--accent` для
// смысла не годится: в `t-washi` акцент === --red, и «в порядке» стало бы
// красным. Правило из шапки `DealSignals.tsx`.
// ═══════════════════════════════════════════════════════

export const RING_RADIUS = 45;
export const RING_STROKE = 11;
/** viewBox 104×104: r 45 + половина обводки 5.5 = 50.5 ≤ 52. */
export const RING_BOX = 104;

export interface HealthCounts {
  bad: number;
  warn: number;
  ok: number;
}

export interface HealthRing {
  /** Сколько сигналов не в норме — большое число в центре. */
  problems: number;
  /** Сколько сигналов всего — маленькое «из N». */
  total: number;
  /** Градусы дуги помех: доля problems от total. */
  arcDeg: number;
  /** Цвет дуги: худшее состояние среди сигналов, либо success когда помех нет. */
  stroke: string;
  /** `d` дуги. null — рисуется полный круг (помех нет либо помеха в каждом сигнале). */
  d: string | null;
  /** Полный круг цветом `stroke` вместо дуги: дуга в 0° и в 360° одним `A` не выражается. */
  full: boolean;
  /**
   * Состояния сигналов В ПОРЯДКЕ СПИСКА — под полосу справа от кольца.
   *
   * Полоса вернулась после того, как кольцо перестало быть сегментированным:
   * Р7 резал её как дубль кольца, а теперь она единственный носитель
   * посигнального разреза — кольцо показывает только долю и худшее состояние.
   */
  states: SegmentState[];
  /** Тот же разрез числами — под подпись «1 критичный · 2 внимание · 2 в норме». */
  counts: HealthCounts;
}

export type SegmentState = Exclude<SignalState, 'na'>;

/** Цвет ступени состояния — один на полосу и на дугу. */
export const STATE_STROKE: Record<SegmentState, string> = {
  bad: 'var(--danger)',
  warn: 'var(--warning)',
  ok: 'var(--success)',
};

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

/** Худшее состояние задаёт цвет всей дуги: одна помеха уровня bad красит кольцо. */
function worstStroke(signals: DealSignal[]): string {
  const has = (s: SignalState) => signals.some((x) => x.state === s);
  if (has('bad')) return STATE_STROKE.bad;
  if (has('warn')) return STATE_STROKE.warn;
  return STATE_STROKE.ok;
}

/** 'na' до сюда не доходит — его отфильтровал `getDealSignals`; сводим к 'ok'. */
function segmentStates(signals: DealSignal[]): SegmentState[] {
  return signals.map((s) => (s.state === 'na' ? 'ok' : s.state));
}

/**
 * `signals` приходит без 'na' — так его отдаёт `getDealSignals`.
 *
 * Полный зелёный круг при нуле помех — сознательно, вместо пустой серой
 * дорожки: «всё в норме» должно читаться состоянием, а не отсутствием дуги.
 */
export function buildHealthRing(signals: DealSignal[]): HealthRing {
  const total = signals.length;
  const states = segmentStates(signals);
  const counts: HealthCounts = {
    bad: states.filter((s) => s === 'bad').length,
    warn: states.filter((s) => s === 'warn').length,
    ok: states.filter((s) => s === 'ok').length,
  };

  if (total === 0) {
    return {
      problems: 0, total: 0, arcDeg: 0, stroke: STATE_STROKE.ok,
      d: null, full: false, states, counts,
    };
  }

  const problems = counts.bad + counts.warn;
  const arcDeg = (problems / total) * 360;
  const stroke = problems === 0 ? STATE_STROKE.ok : worstStroke(signals);

  if (problems === 0 || problems === total) {
    return { problems, total, arcDeg, stroke, d: null, full: true, states, counts };
  }

  const c = RING_BOX / 2;
  return {
    problems,
    total,
    arcDeg,
    stroke,
    d: arcPath(c, c, RING_RADIUS, 0, arcDeg),
    full: false,
    states,
    counts,
  };
}
