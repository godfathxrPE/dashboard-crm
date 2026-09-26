// ═══════════════════════════════════════════════════════
// S-DEAL-ACTIVITY-VIEW-1 (W5): бриф звонка для меты «Последнего события».
//
// Лента (`entity_timeline`) отдаёт у звонка только статус/шаг/договорённости —
// длительности и контакта в ней нет. Их берёт `useCallBrief` одним запросом на
// ОДИН звонок-якорь; здесь — чистое форматирование.
// ═══════════════════════════════════════════════════════

/**
 * Длительность звонка для меты: «<1 мин», «12 мин», «1 ч 05 мин».
 * `null`/`≤0` — `null`: сегмент не рисуется (звонок без длительности — не «0 мин»).
 */
export function formatCallDuration(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  if (seconds < 60) return '<1 мин';
  const totalMin = Math.floor(seconds / 60);
  if (totalMin < 60) return `${totalMin} мин`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h} ч ${String(m).padStart(2, '0')} мин`;
}
