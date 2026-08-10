import { leadStaleness } from '@/lib/constants/leads';
import { diffDaysKey, localDateKey } from '@/lib/utils/date-helpers';

// ═══════════════════════════════════════════════════════
// S-LEAD-HUB-2b: здоровье лида — ОДНО правило вместо двух несогласованных сигналов.
//
// До спринта у лида было только `leadStaleness()` (возраст в статусе), а поля 117
// (`next_step` / `next_action_date`) не участвовали нигде, кроме карточки. Лид с
// назначенным на послезавтра звонком всё равно кричал «7 дн. без движения».
//
// ⚠️ ЯДРО ПРАВИЛА: ЗАПЛАНИРОВАННЫЙ ШАГ ГЛУШИТ STALENESS. Менеджер уже решил, когда
// вернуться к лиду; «без движения» поверх этого решения — ложный сигнал, а ложный
// сигнал обесценивает и остальные (ровно поэтому очередь дня перестают читать).
// Молчание считается заново, только если шаг просрочен или его нет вовсе.
//
// Зеркало `deal-health.ts` по стилю: чистые функции, «сейчас» параметром, ноль
// запросов. Общего хелпера с ним НЕ заводим — сущности разные, а совпадение в три
// строки дало бы ложную связанность (и первый же расход правил порвал бы её).
// ═══════════════════════════════════════════════════════

export type LeadHealth = 'ok' | 'overdue-action' | 'stale' | 'cold';

export interface LeadHealthResult {
  level: LeadHealth;
  /** Дни: просрочки шага (`overdue`) либо молчания (`idle`). У `ok` — 0. */
  days: number;
  /** Откуда взялось число — чтобы UI не пересчитывал повод сам. */
  reason: 'overdue' | 'idle';
}

interface LeadForHealth {
  status: string;
  created_at: string;
  updated_at: string;
  next_action_date?: string | null;
}

/**
 * Насколько дней просрочена дата шага (>= 0).
 *
 * ⚠️ НЕ дословная калька `getNextActionOverdueDays` из `deal-health.ts`, и это
 * находка тестов, а не вкусовщина. Тот считает
 * `new Date(now.toDateString()) - new Date('YYYY-MM-DD')`, то есть разницу между
 * ЛОКАЛЬНОЙ полуночью сегодня и UTC-полуночью цели: в MSK (UTC+3) это минус три
 * часа, и `floor` съедает целый день — вчерашний шаг показывается как «просрочен
 * 0 дн.». Здесь обе даты сравниваются как КЛЮЧИ ДНЯ через `diffDaysKey`
 * (нормализация на UTC-полдне — тот же приём, что у бакетов Ганта, устойчивый к
 * DST). Сделку тем же не чиню: это её UI и её смок — записано в BACKLOG.
 */
export function getLeadActionOverdueDays(nextActionDate: string, now: Date = new Date()): number {
  return Math.max(0, diffDaysKey(nextActionDate, localDateKey(now)));
}

export function getLeadHealth(lead: LeadForHealth, now: Date = new Date()): LeadHealthResult {
  // 1. Закрытый лид из очереди уходит: конвертированный живёт сделкой,
  //    дисквалифицированный не живёт вовсе.
  if (lead.status === 'converted' || lead.status === 'disqualified') {
    return { level: 'ok', days: 0, reason: 'idle' };
  }

  // 2–3. Шаг назначен — решает только его дата.
  if (lead.next_action_date) {
    const overdue = getLeadActionOverdueDays(lead.next_action_date, now);
    return overdue > 0
      ? { level: 'overdue-action', days: overdue, reason: 'overdue' }
      : { level: 'ok', days: 0, reason: 'overdue' };
  }

  // 4. Шага нет — прежние пороги молчания (1 дн. в `new`, 7 дн. в `contacted`, cold ×2).
  const s = leadStaleness(lead, now);
  return { level: s.level === 'ok' ? 'ok' : s.level, days: s.days, reason: 'idle' };
}

/**
 * Порядок в очереди дня: просроченный шаг — обещание, данное клиенту, и он идёт
 * первым; залежавшийся лид — всего лишь риск. Внутри уровня — по убыванию дней.
 */
const LEVEL_ORDER: Record<LeadHealth, number> = {
  'overdue-action': 0,
  cold: 1,
  stale: 2,
  ok: 3,
};

export function compareLeadHealth(a: LeadHealthResult, b: LeadHealthResult): number {
  const byLevel = LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level];
  return byLevel !== 0 ? byLevel : b.days - a.days;
}
