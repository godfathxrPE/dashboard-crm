import type { TimelineEvent } from '@/types/timeline';

// ═══════════════════════════════════════════════════════
// S-DEAL-ACTIVITY-VIEW-1 (W5): цвет точки строки ленты сделки — по СМЫСЛУ события,
// а не по виду источника: деньги/КП — зелёная, касание клиента — янтарная,
// поля и прочее — нейтральная. Семантические токены, не `--accent`.
// ═══════════════════════════════════════════════════════

export type TimelineDotTone = 'money' | 'touch' | 'neutral';

/**
 * `event_type` журнала, означающие КП / деньги.
 *
 * ⚠️ ПУСТОЙ намеренно. Сверка с продом 26.09 (`select event_type, count(*) from
 * activity_log`): 14 типов, ни одного про КП или оплату — «КП отправлено» из макета
 * в журнал сегодня не пишется никем. Деньги в ленте сейчас — только правка
 * `budget` (аудит 087). Появится тип — добавить сюда, ветка ниже уже его читает.
 */
export const MONEY_EVENT_TYPES: readonly string[] = [];

export function timelineDotTone(e: TimelineEvent): TimelineDotTone {
  if (e.kind === 'call' || e.kind === 'meeting') return 'touch';
  if (e.kind === 'activity') {
    if (e.changes && 'budget' in e.changes) return 'money';
    if (e.eventType && MONEY_EVENT_TYPES.includes(e.eventType)) return 'money';
  }
  return 'neutral';
}
