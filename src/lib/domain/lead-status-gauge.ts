import { stageTimeGauge, type StageTimeGauge, type StageTimeState } from '@/lib/domain/stage-norm';
import { LEAD_CONTACTED_STALE_DAYS, LEAD_NEW_STALE_DAYS } from '@/lib/constants/leads';
import { mskDateKey, shiftDateKeyByBuckets } from '@/lib/utils/date-helpers';

// ═══════════════════════════════════════════════════════
// S-LEAD-V2-HEALTH-1 (спека §8): мера «сколько лид в статусе против нормы» —
// тайм-часть кокпита лида (`CockpitRow`), та же `StageTimeGauge`, что у сделки.
//
// ⚠️ Это ДРУГОЙ счётчик, чем молчание в `getLeadHealth` (`updated_at`): время в
// статусе ≠ время без касания. Слова тоже разные: кокпит — «N дн. из M по норме»,
// «Риски» — «Молчание N дн.». Один факт — одно словесное место (F-01).
//
// Нормы — ТЕ ЖЕ константы, что пороги staleness (`constants/leads`): второе число
// развело бы заливку кокпита и сигнал «Рисков» на границе.
//
// Чистая функция: «сейчас» аргументом, ноль запросов.
// ═══════════════════════════════════════════════════════

export interface LeadStatusGauge {
  gauge: StageTimeGauge;
  /** Текст счётчика ячейки вместо «N дн. из M по норме»; только у `new`. */
  counterLabel: string | null;
  /** Подписи шкалы — уже отформатированные («9 сент.», у new — «26 сент., 18:40»). */
  dates: { entered: string | null; norm: string | null };
}

interface LeadForGauge {
  status: string;
  created_at: string;
  updated_at: string;
  first_contacted_at?: string | null;
  qualified_at?: string | null;
}

const HOUR_MS = 3_600_000;
/** SLA первого касания в часах — та же норма `new`, выраженная часами. */
const NEW_NORM_HOURS = LEAD_NEW_STALE_DAYS * 24;

const EMPTY: LeadStatusGauge = {
  gauge: { days: null, norm: null, pct: null, state: 'ok' },
  counterLabel: null,
  dates: { entered: null, norm: null },
};

/** «9 сент.» по МСК из момента. */
function formatMskDay(d: Date): string {
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: 'Europe/Moscow' });
}

/** «9 сент.» из ключа дня: UTC-полдень, чтобы ключ не съехал на соседние сутки. */
function formatDayKey(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** «26 сент., 18:40» по МСК. */
function formatMskDayTime(d: Date): string {
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
  return `${formatMskDay(d)}, ${time}`;
}

function validDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * `new` — счёт по ЧАСАМ: норма — сутки, и дневная шкала показала бы «0 дн. из 1»
 * весь первый день. Пороги состояний — те же, что у `stageTimeGauge` (≥70% warn,
 * сверх нормы over), но over сравнивается по часам, а не по зажатому проценту.
 */
function newLeadGauge(createdAt: Date, now: Date): LeadStatusGauge {
  const h = Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / HOUR_MS));
  const pct = Math.min(100, Math.round((h / NEW_NORM_HOURS) * 100));
  const state: StageTimeState = h > NEW_NORM_HOURS ? 'over' : pct >= 70 ? 'warn' : 'ok';
  const days = Math.floor(h / 24);
  return {
    gauge: { days, norm: LEAD_NEW_STALE_DAYS, pct, state },
    counterLabel: h < 48 ? `${h} ч из ${NEW_NORM_HOURS}` : `${days} дн. из ${LEAD_NEW_STALE_DAYS}`,
    dates: {
      entered: formatMskDayTime(createdAt),
      norm: formatMskDayTime(new Date(createdAt.getTime() + NEW_NORM_HOURS * HOUR_MS)),
    },
  };
}

export function leadStatusGauge(lead: LeadForGauge, now: Date): LeadStatusGauge {
  if (lead.status === 'new') {
    const created = validDate(lead.created_at);
    return created ? newLeadGauge(created, now) : EMPTY;
  }

  if (lead.status === 'contacted' || lead.status === 'qualified') {
    // Фолбэк на `updated_at` — у лидов, переведённых до колонок 117 или руками.
    const entered =
      lead.status === 'contacted'
        ? (lead.first_contacted_at ?? lead.updated_at)
        : (lead.qualified_at ?? lead.updated_at);
    // У `qualified` нормы нет: квалифицированный лид ждёт решения клиента, а не нас.
    const norm = lead.status === 'contacted' ? LEAD_CONTACTED_STALE_DAYS : null;
    const d = validDate(entered);
    const enteredKey = d ? mskDateKey(d) : null;
    return {
      gauge: stageTimeGauge(entered, norm, now),
      counterLabel: null,
      dates: {
        entered: d ? formatMskDay(d) : null,
        norm: enteredKey && norm ? formatDayKey(shiftDateKeyByBuckets(enteredKey, 'day', norm)) : null,
      },
    };
  }

  // converted / disqualified — времени в статусе нет: статус терминальный.
  return EMPTY;
}
