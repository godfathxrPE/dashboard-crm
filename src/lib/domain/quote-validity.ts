import { diffDaysKey, mskDateKey } from '@/lib/utils/date-helpers';

// ═══════════════════════════════════════════════════════
// S-DEAL-ORG-1 (W4): срок действия КП — «действует ещё N дн.» / «истекло».
//
// ⚠️ СЧЁТ ТОЛЬКО ПО КАЛЕНДАРНЫМ КЛЮЧАМ МСК. `quotes.valid_until` — колонка `date`
// (без времени), «сегодня» — календарный день пользователя. Разность через
// `new Date(valid_until) - Date.now()` дала бы дробные сутки и уехала бы на день на
// любой границе: `new Date('2026-09-10')` это UTC-полночь, а «сегодня» у владельца —
// МСК. Отсюда `mskDateKey(now)` + `diffDaysKey` — та же ось, что у Ганта и календаря.
//
// ⚠️ `now` — АРГУМЕНТ, не `Date.now()` внутри (правило проекта). Функция с внутренним
// «сейчас» непроверяема на границе суток, а именно эта граница здесь и есть предмет:
// один и тот же КП в 23:30 и в 00:30 МСК обязан показывать РАЗНОЕ число дней.
//
// ⚠️ ЭТО ТОЛЬКО ОТОБРАЖЕНИЕ. Статус `expired` в БД отсюда НЕ пишется: автопростановка
// статуса — фоновая операция (cron/триггер), которой у проекта нет; запись из рендера
// означала бы UPDATE на каждый показ карточки и гонку между вкладками.
// ═══════════════════════════════════════════════════════

/** Порог «скоро истечёт» — спека W4: N ≤ 3 дня печатается тревожным тоном. */
export const QUOTE_EXPIRY_SOON_DAYS = 3;

export type QuoteValidityLevel = 'ok' | 'soon' | 'expired';

export interface QuoteValidity {
  /** Календарных дней до `valid_until` включительно; отрицательное — просрочено; null — срока нет. */
  daysLeft: number | null;
  level: QuoteValidityLevel;
}

/**
 * Срок действия КП относительно `now`.
 *
 * `valid_until = null` → `{ daysLeft: null, level: 'ok' }`: срок не задан — это не
 * тревога, а отсутствие сведений, и красить его в тревожный тон значит врать.
 */
export function quoteValidity(validUntil: string | null, now: Date): QuoteValidity {
  if (!validUntil) return { daysLeft: null, level: 'ok' };

  // slice — на случай, если сверху прилетит ISO-таймстамп вместо `date`: ключ дня
  // должен остаться ключом дня, а не превратиться в NaN внутри diffDaysKey.
  const daysLeft = diffDaysKey(mskDateKey(now), validUntil.slice(0, 10));
  if (daysLeft < 0) return { daysLeft, level: 'expired' };
  if (daysLeft <= QUOTE_EXPIRY_SOON_DAYS) return { daysLeft, level: 'soon' };
  return { daysLeft, level: 'ok' };
}
