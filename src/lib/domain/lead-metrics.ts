import { median, share } from '@/lib/domain/stats';
import type { Lead } from '@/types/database';

// ═══════════════════════════════════════════════════════
// S-LEAD-HUB-2b: агрегация воронки лидов. Чистая функция над уже загруженными
// строками — ноль запросов.
//
// ⚠️ Параметра `now` здесь НЕТ (в отличие от `lead-health.ts`), и это осознанно:
// все метрики — дельты между СОХРАНЁННЫМИ штампами (`created_at` →
// `first_contacted_at` → `qualified_at`), ни одна не зависит от текущего времени.
// Неиспользуемый параметр ради симметрии сигнатур был бы мёртвым API и обещанием,
// которого функция не выполняет. Лид, которого ещё не коснулись, в медиану не
// входит вовсе — рядом с ней стоит `count`, и это честнее, чем «пока N часов».
//
// Что здесь считается и почему именно так:
//
// • Время до первого касания — В ЧАСАХ. Порог реакции в проекте — ОДИН день
//   (`LEAD_NEW_STALE_DAYS`), и дневная гранулярность обнулила бы метрику: «медиана
//   0 дней» — это и три минуты, и двадцать три часа, то есть ответ ни на что.
// • Рядом с каждой медианой — `count`. **Медиана без размера выборки — театр**:
//   «4 часа» на двух лидах и на двухстах — разные утверждения, и UI обязан
//   показывать оба числа вместе.
// • Лид без источника попадает в строку «Не указан», а не выкидывается: доля
//   лидов без источника сама по себе диагноз качества ввода.
// ═══════════════════════════════════════════════════════

/** Ключ строки «источник не указан». Не пустая строка — её негде показать. */
export const LEAD_SOURCE_UNKNOWN = '__unknown__';

export interface LeadSourceStat {
  source: string;
  total: number;
  converted: number;
  /** 0..1; при total === 0 — 0 (см. `share`). */
  rate: number;
}

export interface LeadFunnelStats {
  bySource: LeadSourceStat[];
  byDisqualifyReason: Array<{ reason: string; count: number }>;
  /** created_at → first_contacted_at, часы. */
  firstTouchHours: { median: number | null; count: number };
  /** first_contacted_at → qualified_at, дни. */
  qualifyDays: { median: number | null; count: number };
  /** Итоги для KPI-строки. */
  totals: {
    /** Лиды в работе: new + contacted + qualified. */
    active: number;
    converted: number;
    disqualified: number;
    /** converted / (converted + disqualified); 0..1. */
    conversionRate: number;
  };
}

const HOUR = 3_600_000;
const DAY = 86_400_000;

function diffMs(fromIso: string | null, toIso: string | null): number | null {
  if (!fromIso || !toIso) return null;
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  // Отрицательная дельта — битые данные (ручная правка, импорт): в медиану её не
  // пускаем, но и лид целиком не выбрасываем — он ещё считается в воронке.
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

/**
 * @param leads     активные лиды (`useLeads()` — без конвертированных)
 * @param converted конвертированные (`useLeadsForAnalytics` за период)
 *
 * Два списка, а не один, потому что ровно так их отдают хуки; дубли по `id`
 * схлопываются — иначе лид, попавший в обе выборки, посчитался бы дважды.
 */
export function aggregateLeadFunnel(leads: Lead[], converted: Lead[]): LeadFunnelStats {
  const byId = new Map<string, Lead>();
  for (const l of [...leads, ...converted]) byId.set(l.id, l);
  const all = [...byId.values()];

  const sourceMap = new Map<string, { total: number; converted: number }>();
  const reasonMap = new Map<string, number>();
  const firstTouch: number[] = [];
  const qualify: number[] = [];

  let active = 0;
  let convertedCount = 0;
  let disqualifiedCount = 0;

  for (const l of all) {
    const key = l.source ?? LEAD_SOURCE_UNKNOWN;
    const row = sourceMap.get(key) ?? { total: 0, converted: 0 };
    row.total += 1;
    if (l.status === 'converted') row.converted += 1;
    sourceMap.set(key, row);

    if (l.status === 'converted') convertedCount += 1;
    else if (l.status === 'disqualified') {
      disqualifiedCount += 1;
      const reason = l.disqualify_reason ?? 'other';
      reasonMap.set(reason, (reasonMap.get(reason) ?? 0) + 1);
    } else active += 1;

    const touch = diffMs(l.created_at, l.first_contacted_at);
    if (touch !== null) firstTouch.push(touch / HOUR);

    const qual = diffMs(l.first_contacted_at, l.qualified_at);
    if (qual !== null) qualify.push(qual / DAY);
  }

  const bySource = [...sourceMap.entries()]
    .map(([source, v]) => ({
      source,
      total: v.total,
      converted: v.converted,
      rate: share(v.converted, v.total),
    }))
    // По конверсии вниз, при равенстве — по объёму: источник с 1/1 не должен
    // стоять выше источника с 40/100 просто потому, что у него 100%.
    .sort((a, b) => (b.rate - a.rate) || (b.total - a.total));

  const byDisqualifyReason = [...reasonMap.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  return {
    bySource,
    byDisqualifyReason,
    firstTouchHours: { median: median(firstTouch), count: firstTouch.length },
    qualifyDays: { median: median(qualify), count: qualify.length },
    totals: {
      active,
      converted: convertedCount,
      disqualified: disqualifiedCount,
      conversionRate: share(convertedCount, convertedCount + disqualifiedCount),
    },
  };
}
