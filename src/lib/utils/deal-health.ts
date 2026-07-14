import type { DealStatus } from '@/types/database';

export type HealthLevel = 'green' | 'yellow' | 'red';

export interface HealthScore {
  total: number;
  level: HealthLevel;
  factors: {
    lastContact: number;
    nextStep: number;
    deadline: number;
    completeness: number;
  };
}

interface ProjectForHealth {
  next_step?: string | null;
  deadline?: string | null;
  company_id?: string | null;
  contact_id?: string | null;
  budget?: number | null;
  last_contact_date?: string | null;
}

export function calculateDealHealth(project: ProjectForHealth): HealthScore {
  const now = Date.now();

  // 1. Last contact
  let lastContact = 0;
  if (project.last_contact_date) {
    const days = Math.floor((now - new Date(project.last_contact_date).getTime()) / 86400000);
    if (days <= 7) lastContact = 2;
    else if (days <= 14) lastContact = 1;
  }

  // 2. Next step
  const nextStep = project.next_step?.trim() ? 2 : 0;

  // 3. Deadline
  let deadline = 2;
  if (project.deadline) {
    const daysUntil = Math.floor((new Date(project.deadline).getTime() - now) / 86400000);
    if (daysUntil < 14) deadline = 0;
    else if (daysUntil < 30) deadline = 1;
  }

  // 4. Completeness
  const filled = [project.company_id, project.contact_id, project.budget].filter(Boolean).length;
  const completeness = filled >= 3 ? 2 : filled >= 2 ? 1 : 0;

  const total = lastContact + nextStep + deadline + completeness;
  const level: HealthLevel = total >= 6 ? 'green' : total >= 3 ? 'yellow' : 'red';

  return { total, level, factors: { lastContact, nextStep, deadline, completeness } };
}

// ═══════════════════════════════════════════════════════
// Sprint W1a: Always Next Action / rotting indicator
// Паттерн Pipedrive «activity-based selling»: у активной сделки всегда
// должен быть следующий шаг с датой. Нет шага/даты или дата в прошлом = «гниёт».
// ═══════════════════════════════════════════════════════

export type DealHealth = 'ok' | 'no-action' | 'overdue-action';

interface ProjectForNextAction {
  status?: DealStatus | null;
  next_step?: string | null;
  next_action_date?: string | null;
}

/**
 * «Гниёт» только активная сделка (status === 'open').
 * won/lost — закрыты; on_hold — намеренно на паузе → не нагружаем напоминанием.
 */
export function getDealHealth(project: ProjectForNextAction): DealHealth {
  if (project.status !== 'open') return 'ok';
  if (!project.next_step?.trim()) return 'no-action';
  if (!project.next_action_date) return 'no-action';
  const today = new Date(new Date().toDateString());
  if (new Date(project.next_action_date) < today) return 'overdue-action';
  return 'ok';
}

/** Насколько дней просрочена дата следующего шага (>= 0). */
export function getNextActionOverdueDays(nextActionDate: string): number {
  const today = new Date(new Date().toDateString());
  const diff = today.getTime() - new Date(nextActionDate).getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

// ═══════════════════════════════════════════════════════
// S-AGING-1: Stage-aging / dwell — «сколько дней сделка висит в стадии».
// Паттерн Pipedrive per-stage rotting — ортогонален getDealHealth (тот про
// отсутствие next_step): здесь сигнал «давно не двигали ПО ВОРОНКЕ».
// Чистая функция над уже загруженными полями projects — ноль запросов.
// ═══════════════════════════════════════════════════════

export interface StageAging {
  daysInStage: number | null; // null если stage_entered_at пуст/невалиден
  isStale: boolean; // превысил порог для своей phase_group
}

// Пороги «залипания» по phase_group (ранние стадии должны двигаться быстрее).
// Тюнятся здесь; кандидат в per-org настройку позже (roadmap К8/configurable threshold).
const STALE_BY_PHASE: Record<string, number> = {
  attraction: 14,
  working: 21,
  approval: 21,
  closing: 30,
};
const STALE_DEFAULT = 21;

/**
 * Возраст сделки в текущей стадии и флаг «залипла».
 * @param stageEnteredAt ISO-время входа в стадию (`projects.stage_entered_at`)
 * @param phaseGroup     `pipeline_stages.phase_group` — задаёт порог
 */
export function getStageAging(
  stageEnteredAt: string | null,
  phaseGroup: string | null,
  now = new Date(),
): StageAging {
  if (!stageEnteredAt) return { daysInStage: null, isStale: false };
  const t = new Date(stageEnteredAt).getTime();
  if (Number.isNaN(t)) return { daysInStage: null, isStale: false };
  const daysInStage = Math.floor((now.getTime() - t) / 86400000);
  const threshold = STALE_BY_PHASE[phaseGroup ?? ''] ?? STALE_DEFAULT;
  return { daysInStage, isStale: daysInStage > threshold };
}

// ── Дефолтная сортировка воронки по next-action (S-AGING-1) ──

interface ProjectForNextActionSort {
  status?: DealStatus | null;
  next_action_date?: string | null;
  stage_entered_at?: string | null;
}

/**
 * Приоритет сделки для дефолтной сортировки (меньше = выше в списке).
 * 0 — требует внимания (open: нет даты шага ИЛИ дата <= сегодня, просрочено/сегодня);
 * 1 — open с будущей датой; 2 — терминальная (won/lost — вниз, aging им неважен).
 */
function nextActionBucket(p: ProjectForNextActionSort, todayMs: number): 0 | 1 | 2 {
  if (p.status && p.status !== 'open') return 2;
  if (!p.next_action_date) return 0;
  return new Date(p.next_action_date).getTime() <= todayMs ? 0 : 1;
}

/**
 * Компаратор дефолтного порядка воронки (переопределяется пользовательским sort-контролом):
 * 1) требующие внимания наверх (нет next_action_date ИЛИ просрочено/сегодня);
 * 2) внутри — по next_action_date возрастанию (null = максимально срочно, вверх группы);
 * 3) тай-брейк — по stage_entered_at возрастанию (самые залипшие выше).
 * Стабилен; не мутирует вход (используйте на копии массива).
 */
export function compareByNextAction(
  a: ProjectForNextActionSort,
  b: ProjectForNextActionSort,
  now = new Date(),
): number {
  const todayMs = new Date(now.toDateString()).getTime();
  const bucketA = nextActionBucket(a, todayMs);
  const bucketB = nextActionBucket(b, todayMs);
  if (bucketA !== bucketB) return bucketA - bucketB;

  // Внутри группы — по дате шага возрастанию; null-даты (нет шага) максимально срочны.
  const dateA = a.next_action_date ? new Date(a.next_action_date).getTime() : -Infinity;
  const dateB = b.next_action_date ? new Date(b.next_action_date).getTime() : -Infinity;
  if (dateA !== dateB) return dateA - dateB;

  // Тай-брейк — дольше залипшие (раньше вошли в стадию) выше.
  const stageA = a.stage_entered_at ? new Date(a.stage_entered_at).getTime() : Infinity;
  const stageB = b.stage_entered_at ? new Date(b.stage_entered_at).getTime() : Infinity;
  return stageA - stageB;
}
