import { mskDateKey } from './date-helpers';
import type { RecurringCadence } from '@/types/database';

const DAY_MS = 86_400_000;

function noonMs(dateKey: string): number {
  return Date.parse(`${dateKey}T12:00:00Z`);
}
function keyOfMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
function dowOf(dateKey: string): number {
  return new Date(noonMs(dateKey)).getUTCDay(); // 0=Вс..6=Сб, как pg EXTRACT(dow)
}
function domOf(dateKey: string): number {
  return new Date(noonMs(dateKey)).getUTCDate();
}

/**
 * Первая дата спавна ПРИ СОЗДАНИИ шаблона — включительно от сегодня (MSK): если
 * сегодня уже подходит под каденс, первый инстанс уйдёт сегодня же, а не через цикл.
 * Отличается от rtt_next_occurrence() в БД (069), который считает СЛЕДУЮЩЕЕ
 * вхождение СТРОГО ПОСЛЕ дня, в который только что заспавнил — там `today` уже занят.
 */
export function computeInitialNextRunDate(
  cadence: RecurringCadence,
  weeklyDow: number | null,
  monthlyDom: number | null,
  today: Date = new Date(),
): string {
  const todayKey = mskDateKey(today);

  if (cadence === 'daily') return todayKey;

  if (cadence === 'weekdays') {
    let d = todayKey;
    let guard = 0;
    while ((dowOf(d) === 0 || dowOf(d) === 6) && guard < 8) {
      d = keyOfMs(noonMs(d) + DAY_MS);
      guard += 1;
    }
    return d;
  }

  if (cadence === 'weekly') {
    if (weeklyDow === null) return todayKey;
    let d = todayKey;
    let guard = 0;
    while (dowOf(d) !== weeklyDow && guard < 8) {
      d = keyOfMs(noonMs(d) + DAY_MS);
      guard += 1;
    }
    return d;
  }

  if (cadence === 'monthly') {
    if (monthlyDom === null) return todayKey;
    let d = todayKey;
    let guard = 0;
    while (domOf(d) !== monthlyDom && guard < 32) {
      d = keyOfMs(noonMs(d) + DAY_MS);
      guard += 1;
    }
    return d;
  }

  return todayKey;
}
