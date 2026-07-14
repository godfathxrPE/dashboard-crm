// ═══════════════════════════════════════════════════════
// S-DLV-HEALTH-1 — health-score проектов внедрения (type='delivery').
// Аналог sales `deal-health.ts`, но для delivery: подсвечивает «красные»
// внедрения ДО эскалации. Чистая функция без запросов — считает ТОЛЬКО из
// project-level полей строки projects (никаких per-card запросов задач → нет
// N+1 на доске). Task-level детализация — отдельный слой (не сюда).
// ═══════════════════════════════════════════════════════

export type DeliveryHealthStatus = 'healthy' | 'attention' | 'at_risk';

export interface DeliveryHealthInput {
  progress_done: number;
  progress_total: number;
  stage_entered_at: string | null;
  deadline: string | null; // date
  updated_at: string | null;
  isTerminal: boolean; // завершён/закрыт — health не применяем (не краснит портфель)
}

export interface DeliveryHealth {
  status: DeliveryHealthStatus;
  reasons: string[]; // человекочитаемые причины (RU), для tooltip
  score: number; // 0..100, для сортировки портфеля (S-PORTFOLIO-1)
}

// ── Пороги сигналов (v1) — вынесены для лёгкого тюнинга ──
const STALE_STAGE_DAYS = 30; // застой: дней в одном состоянии
const STALE_ACTIVITY_DAYS = 14; // тишина: дней без updated_at
const LOW_PROGRESS_PCT = 30; // «низкий прогресс», %
const LOW_PROGRESS_MIN_DWELL_DAYS = 14; // … при уже потраченном сроке в состоянии

// ── Штрафы по сигналам (вклад в score, отрицательный) ──
const PENALTY_OVERDUE = 40;
const PENALTY_STALE_STAGE = 25;
const PENALTY_SILENT = 20;
const PENALTY_LOW_PROGRESS = 15;

// ── Пороги статуса по score ──
const HEALTHY_MIN = 75; // >=75 → healthy
const ATTENTION_MIN = 40; // 40..74 → attention; <40 → at_risk

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Целое число дней с момента `iso` до `nowMs`; null если дата пустая/невалидная. */
function daysSince(iso: string | null, nowMs: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((nowMs - t) / 86400000);
}

export function getDeliveryHealth(p: DeliveryHealthInput, now = new Date()): DeliveryHealth {
  // Терминальные (завершён/закрыт) — всегда healthy, без причин.
  if (p.isTerminal) return { status: 'healthy', reasons: [], score: 100 };

  const nowMs = now.getTime();
  const reasons: string[] = [];
  let score = 100;

  // Guard: без задач (total=0) прогресс-сигналы пропускаем, не делим на ноль.
  const hasProgress = p.progress_total > 0;
  const progressPct = hasProgress ? (p.progress_done / p.progress_total) * 100 : null;
  const isComplete = hasProgress && p.progress_done >= p.progress_total;

  // 1. Просрочка дедлайна проекта (и прогресс < 100%).
  if (p.deadline) {
    const dl = new Date(p.deadline).getTime();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (!Number.isNaN(dl) && dl < todayStart && !isComplete) {
      score -= PENALTY_OVERDUE;
      reasons.push('Просрочен дедлайн проекта');
    }
  }

  // 2. Застой — долго без смены состояния (dwell).
  const dwell = daysSince(p.stage_entered_at, nowMs);
  if (dwell !== null && dwell > STALE_STAGE_DAYS) {
    score -= PENALTY_STALE_STAGE;
    reasons.push(`${dwell} дней без смены состояния`);
  }

  // 3. Тишина — давно не обновлялся (прокси активности).
  const silent = daysSince(p.updated_at, nowMs);
  if (silent !== null && silent > STALE_ACTIVITY_DAYS) {
    score -= PENALTY_SILENT;
    reasons.push(`Нет активности ${silent} дней`);
  }

  // 4. Низкий прогресс при уже потраченном сроке в состоянии.
  if (
    progressPct !== null &&
    progressPct < LOW_PROGRESS_PCT &&
    dwell !== null &&
    dwell > LOW_PROGRESS_MIN_DWELL_DAYS
  ) {
    score -= PENALTY_LOW_PROGRESS;
    reasons.push('Низкий прогресс');
  }

  score = clamp(score, 0, 100);
  const status: DeliveryHealthStatus =
    score >= HEALTHY_MIN ? 'healthy' : score >= ATTENTION_MIN ? 'attention' : 'at_risk';

  return { status, reasons, score };
}

/**
 * Терминальное (завершённое/закрытое) состояние delivery — health не применяем.
 * Истина — статус проекта (`completed`) ИЛИ терминальная стадия
 * (is_won/is_lost / phase_group='completed'). Вход nullable — стадия может ещё
 * грузиться; тогда только по статусу.
 */
export function isDeliveryTerminal(
  stage: { phase_group: string | null; is_won: boolean; is_lost: boolean } | null | undefined,
  status?: string | null,
): boolean {
  if (status === 'completed' || status === 'lost') return true;
  if (!stage) return false;
  return stage.is_won || stage.is_lost || stage.phase_group === 'completed';
}
