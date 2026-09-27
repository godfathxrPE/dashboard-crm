import { getLeadHealth } from '@/lib/utils/lead-health';
import { formatActionDate } from '@/lib/utils/action-date';
import { formatDateKeyRu } from '@/lib/domain/lead-qualification';
import { LEAD_NEW_STALE_DAYS } from '@/lib/constants/leads';
import { diffDaysKey, mskDateKey } from '@/lib/utils/date-helpers';

// ═══════════════════════════════════════════════════════
// S-LEAD-V2-HEALTH-1 (спека §8, W5): сигналы лида и вердикт для зоны «Риски».
//
// Единственное словесное место риска лида (F-01): «просрочен / молчание /
// остывает» пишутся здесь и больше нигде. Кокпит несёт другой факт — время в
// статусе (`lead-status-gauge.ts`).
//
// Сигнал `step` строится ПОВЕРХ `getLeadHealth`, а не второй копией правила:
// ядро «запланированный шаг глушит молчание» живёт в одном месте.
//
// Классов здесь нет — только смысл (`state`). Карта «state → класс» живёт в
// компоненте: Tailwind не сканирует `src/lib`.
// ═══════════════════════════════════════════════════════

export type LeadSignalKey = 'step' | 'regulatory' | 'first_touch';
export type LeadSignalState = 'bad' | 'warn' | 'ok';
export type LeadVerdict = 'ok' | 'attention' | 'rotting';

export interface LeadSignal {
  key: LeadSignalKey;
  state: LeadSignalState;
  label: string;
  detail: string;
  cta: string | null;
}

export interface LeadSignalsResult {
  verdict: LeadVerdict;
  signals: LeadSignal[];
  top: LeadSignal | null;
}

interface LeadForSignals {
  status: string;
  created_at: string;
  updated_at: string;
  next_action_date?: string | null;
  regulatory_deadline?: string | null;
  first_contacted_at?: string | null;
}

/**
 * Порог регуляторного сигнала. Три месяца — не круглое число, а длина пилота:
 * ближе этого срока внедрение до обязательной маркировки уже не помещается.
 */
export const REG_WARNING_MONTHS = 3;

const HOUR_MS = 3_600_000;
const FIRST_TOUCH_SLA_HOURS = LEAD_NEW_STALE_DAYS * 24;

/**
 * Дней до обязательности маркировки по календарю МСК; null — дата невалидна,
 * в прошлом или дальше года.
 */
export function regulatoryDays(deadline: string | null | undefined, now: Date): number | null {
  const key = deadline ? /^\d{4}-\d{2}-\d{2}/.exec(deadline)?.[0] : null;
  if (!key) return null;
  const days = diffDaysKey(mskDateKey(now), key);
  if (Number.isNaN(days) || days < 0 || days > 366) return null;
  return days;
}

/** Месяцев до обязательности маркировки; null — дальше года или дата в прошлом. */
export function regulatoryMonths(deadline: string | null | undefined, now: Date): number | null {
  const days = regulatoryDays(deadline, now);
  return days === null ? null : Math.round(days / 30);
}

const STEP_CTA = 'К шагу';
const STALE_DETAIL = 'Шага нет — назначь его, и счётчик замолчит';

function stepSignal(lead: LeadForSignals, now: Date): LeadSignal {
  const health = getLeadHealth(lead, now);

  if (lead.next_action_date) {
    return health.level === 'overdue-action'
      ? {
          key: 'step',
          state: 'bad',
          label: `Шаг просрочен на ${health.days} дн.`,
          detail: 'Обещанная дата прошла — клиент ждёт',
          cta: STEP_CTA,
        }
      : {
          key: 'step',
          state: 'ok',
          label: `Шаг назначен на ${formatActionDate(lead.next_action_date, now)}`,
          detail: '',
          cta: null,
        };
  }

  if (health.level === 'ok') {
    return {
      key: 'step',
      state: 'warn',
      label: 'Следующий шаг не назначен',
      detail: 'Назначь шаг — иначе лид начнёт остывать',
      cta: STEP_CTA,
    };
  }

  const base =
    lead.status === 'new' ? `Нет первого касания ${health.days} дн.` : `Молчание ${health.days} дн.`;
  return health.level === 'cold'
    ? { key: 'step', state: 'bad', label: `${base} — лид остывает`, detail: STALE_DETAIL, cta: STEP_CTA }
    : { key: 'step', state: 'warn', label: base, detail: STALE_DETAIL, cta: STEP_CTA };
}

function regulatorySignal(lead: LeadForSignals, now: Date): LeadSignal | null {
  const days = regulatoryDays(lead.regulatory_deadline, now);
  if (days === null || !lead.regulatory_deadline) return null;
  const months = Math.round(days / 30);
  if (months > REG_WARNING_MONTHS) return null;
  const when = days === 0 ? 'сегодня' : days < 31 ? `через ${days} дн.` : `через ${months} мес.`;
  return {
    key: 'regulatory',
    state: 'warn',
    label: `Маркировка обязательна с ${formatDateKeyRu(lead.regulatory_deadline)} — ${when}`,
    detail: 'Пилот до срока может не успеть',
    cta: 'К ЧЗ',
  };
}

function firstTouchSignal(lead: LeadForSignals, now: Date): LeadSignal | null {
  const created = new Date(lead.created_at).getTime();
  if (Number.isNaN(created)) return null;

  if (lead.first_contacted_at) {
    const touched = new Date(lead.first_contacted_at).getTime();
    if (Number.isNaN(touched)) return null;
    const h = Math.max(0, Math.floor((touched - created) / HOUR_MS));
    if (h > FIRST_TOUCH_SLA_HOURS) return null;
    return { key: 'first_touch', state: 'ok', label: `Первое касание — через ${h} ч`, detail: '', cta: null };
  }

  if (lead.status !== 'new') return null;
  const h = Math.max(0, Math.floor((now.getTime() - created) / HOUR_MS));
  if (h >= FIRST_TOUCH_SLA_HOURS) return null;
  return {
    key: 'first_touch',
    state: 'ok',
    label: `Первое касание: осталось ${FIRST_TOUCH_SLA_HOURS - h} ч`,
    detail: 'SLA — сутки с заявки',
    cta: null,
  };
}

const STATE_ORDER: Record<LeadSignalState, number> = { bad: 0, warn: 1, ok: 2 };

export function getLeadSignals(lead: LeadForSignals, now: Date): LeadSignalsResult {
  if (lead.status === 'converted' || lead.status === 'disqualified') {
    return { verdict: 'ok', signals: [], top: null };
  }

  // Порядок таблицы спеки — он же порядок внутри одного состояния (sort стабилен).
  const signals = [stepSignal(lead, now), regulatorySignal(lead, now), firstTouchSignal(lead, now)]
    .filter((s): s is LeadSignal => s !== null)
    .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]);

  const verdict: LeadVerdict = signals.some((s) => s.state === 'bad')
    ? 'rotting'
    : signals.some((s) => s.state === 'warn')
      ? 'attention'
      : 'ok';

  return { verdict, signals, top: signals.find((s) => s.state !== 'ok') ?? null };
}
