// ═══════════════════════════════════════════════════════
// S-R2-CO360-1 (D1) — «сила отношений» с контактом.
//
// Формула из CRM-ROADMAP-2-ARCHITECTURE §4.5 (P1-E). Чистый домен: ноль запросов,
// ноль дат «сейчас» внутри — вход уже посчитан вызывающим (`daysSinceLastTouch`),
// поэтому функция детерминирована и тестируется без замороженного времени.
//
// Три слагаемых отвечают на три разных вопроса, и ни одно не заменяет другое:
//   recency   — «давно ли говорили» (гниёт со временем сам по себе);
//   frequency — «сколько вообще общаемся» (одна встреча год назад ≠ отношения);
//   upcoming  — «есть ли следующий шаг» (10 баллов: не сила связи, а страховка от
//               того, что свежезапланированный контакт выглядит холодным).
// ═══════════════════════════════════════════════════════

export interface StrengthInput {
  /** Дней с последнего СОСТОЯВШЕГОСЯ касания; null = касаний не было вовсе. */
  daysSinceLastTouch: number | null;
  /** Касаний (звонок done + прошедшая встреча) за последние 90 дней. */
  touches90d: number;
  /** Есть запланированное будущее касание (звонок pending / встреча / задача). */
  hasUpcoming: boolean;
}

export type StrengthBand = 'strong' | 'warm' | 'cold';

export interface Strength {
  /** 0–100, целое. */
  score: number;
  band: StrengthBand;
}

/** Границы полос. Экспортируются, чтобы UI не хардкодил их второй раз. */
export const STRENGTH_STRONG_MIN = 65;
export const STRENGTH_WARM_MIN = 30;

/**
 * Recency 0–50 — кусочно-линейно по дням с последнего касания:
 *   0 дн → 50 · 21 дн → 25 · 60+ дн → 0, между узлами линейная интерполяция.
 *
 * Две линии, а не одна: первые три недели связь «остывает» вдвое быстрее
 * (50→25 за 21 день против 25→0 за следующие 39). Это и есть смысл кусочности —
 * разница между «на прошлой неделе» и «в позапрошлой» больше, чем между
 * «полтора месяца» и «два».
 */
function recencyPoints(days: number): number {
  if (days <= 0) return 50;
  if (days >= 60) return 0;
  if (days <= 21) return 50 - (days / 21) * 25;
  return 25 - ((days - 21) / 39) * 25;
}

/**
 * Сила отношений с контактом.
 *
 * ⚠️ `daysSinceLastTouch === null` (касаний не было) — это НЕ «0 дней» и не
 * «очень много дней»: функция возвращает жёсткий ноль, не начисляя даже
 * `upcoming`. Запланированная встреча с человеком, с которым ещё ни разу не
 * говорили, не делает связь тёплой — иначе новый контакт с одной задачей в
 * календаре обгонял бы клиента, с которым переписывались два месяца назад.
 */
export function relationshipStrength(input: StrengthInput): Strength {
  if (input.daysSinceLastTouch === null) return { score: 0, band: 'cold' };

  const recency = recencyPoints(input.daysSinceLastTouch);
  const frequency = Math.min(40, Math.max(0, input.touches90d) * 5);
  const upcoming = input.hasUpcoming ? 10 : 0;

  const score = Math.round(recency + frequency + upcoming);
  return { score, band: strengthBand(score) };
}

/** Полоса по очкам. Отдельной функцией — её зовёт и UI (легенда/бейдж). */
export function strengthBand(score: number): StrengthBand {
  if (score >= STRENGTH_STRONG_MIN) return 'strong';
  if (score >= STRENGTH_WARM_MIN) return 'warm';
  return 'cold';
}

/** Подпись бейджа: `strong · 82`. Полосы намеренно не переводятся — так же
 *  называются в роадмапе и в разговоре команды. */
export function formatStrength(s: Strength): string {
  return `${s.band} · ${s.score}`;
}
