// ═══════════════════════════════════════════════════════
// Пороги реакции на лиды (скорость первого касания — главный
// фактор конверсии). Дни в статусе считаются от created_at (new)
// и updated_at (contacted) — без миграций.
// ═══════════════════════════════════════════════════════

/** new: больше суток без первого касания — пора реагировать */
export const LEAD_NEW_STALE_DAYS = 1;

/** contacted: неделя без движения (квалификация/отказ) */
export const LEAD_CONTACTED_STALE_DAYS = 7;

/** Множитель «совсем плохо» (красная заполненная метка ●) */
export const LEAD_COLD_FACTOR = 2;

export function daysInStatus(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export type LeadStaleness = 'ok' | 'stale' | 'cold';

/** new → от created_at; contacted → от updated_at; остальные не «протухают» */
export function leadStaleness(lead: { status: string; created_at: string; updated_at: string }): {
  level: LeadStaleness;
  days: number;
} {
  if (lead.status === 'new') {
    const days = daysInStatus(lead.created_at);
    return {
      level: days > LEAD_NEW_STALE_DAYS * LEAD_COLD_FACTOR ? 'cold' : days > LEAD_NEW_STALE_DAYS ? 'stale' : 'ok',
      days,
    };
  }
  if (lead.status === 'contacted') {
    const days = daysInStatus(lead.updated_at);
    return {
      level: days > LEAD_CONTACTED_STALE_DAYS * LEAD_COLD_FACTOR ? 'cold' : days > LEAD_CONTACTED_STALE_DAYS ? 'stale' : 'ok',
      days,
    };
  }
  return { level: 'ok', days: 0 };
}
