// S-QUICK-CAPTURE-1: детерминированный разбор вставленного текста. Чистый домен —
// без React, без запросов, без `Date.now()`.
//
// Инвариант фичи: реквизиты компании модель НЕ извлекает. ИНН распознаётся здесь,
// регуляркой + контрольной суммой, и уходит в существующий `company-lookup` (ЕГРЮЛ).
// LLM разбирает только свободный текст (ФИО, должность, телефоны, почта).

import { normalizePhone } from '@/lib/utils/phone';

// ═══ ИНН ═══
//
// ⚠️ Здесь чексумма считается, а в `lib/utils/inn.ts` (`isValidInn`) — НЕТ, и это
// не рассогласование, а разные задачи:
//   • `isValidInn` валидирует ПОЛЕ формы, куда человек осознанно ввёл номер. Там
//     чексумма дала бы ложные отказы на редких валидных номерах (см. комментарий
//     в inn.ts) и заблокировала бы 4 legacy-записи прода.
//   • здесь мы ИЩЕМ ИНН в куче текста, где рядом лежат телефоны и номера счетов.
//     Без чексуммы любой десятизначный обрубок телефона поехал бы в DaData.
// Поэтому имя другое: одноимённой функции с расходящейся семантикой в проекте быть
// не должно.

const INN10_WEIGHTS = [2, 4, 10, 3, 5, 9, 4, 6, 8];
const INN12_WEIGHTS_11 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
const INN12_WEIGHTS_12 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];

/** Контрольное число по весам ФНС: (Σ digit·weight) % 11 % 10. */
function checkDigit(digits: number[], weights: number[]): number {
  let sum = 0;
  for (let i = 0; i < weights.length; i++) sum += digits[i] * weights[i];
  return (sum % 11) % 10;
}

/**
 * ИНН по алгоритму ФНС: 10 цифр (юрлицо) или 12 (ИП), контрольные числа сходятся.
 * Пустое/мусор — false (в отличие от `isValidInn`, где пустое валидно).
 */
export function hasValidInnChecksum(raw: string | null | undefined): boolean {
  const t = (raw ?? '').trim();
  if (!/^\d{10}$|^\d{12}$/.test(t)) return false;
  const d = [...t].map(Number);
  if (d.length === 10) return checkDigit(d, INN10_WEIGHTS) === d[9];
  return checkDigit(d, INN12_WEIGHTS_11) === d[10] && checkDigit(d, INN12_WEIGHTS_12) === d[11];
}

/**
 * Контекст перед числом, который выдаёт телефон, а не ИНН. Нужен потому, что
 * десятизначный хвост мобильного («8 9991234567») с вероятностью ~1/10 проходит
 * чексумму, и тогда виджет ушёл бы в ЕГРЮЛ за номером телефона.
 */
const PHONE_CONTEXT_RE = /(?:тел|телефон|моб|phone|cell|\+7|\+?\b8)[\s\-().:№]*$/i;

/**
 * Первый валидный ИНН в тексте или null.
 *
 * Приоритет у явной метки «ИНН 7707083893»: это прямое утверждение человека, и
 * оно сильнее любой эвристики. Без метки берём отдельно стоящие числа нужной
 * длины с сошедшейся чексуммой, отбрасывая телефонный контекст.
 */
export function extractInn(text: string): string | null {
  if (!text) return null;

  const labelled = /\bИНН\b[\s:№-]*(\d{10}|\d{12})(?!\d)/i.exec(text);
  if (labelled && hasValidInnChecksum(labelled[1])) return labelled[1];

  const runs = /\d+/g;
  let m: RegExpExecArray | null;
  while ((m = runs.exec(text)) !== null) {
    const value = m[0];
    if (value.length !== 10 && value.length !== 12) continue;
    if (!hasValidInnChecksum(value)) continue;
    if (PHONE_CONTEXT_RE.test(text.slice(0, m.index))) continue;
    return value;
  }
  return null;
}

// ═══ Телефон ═══

/**
 * Ключ дедупа: последние 10 цифр номера. Отсекает разницу «+7 / 8 / без кода»
 * и любое форматирование. Меньше 10 цифр — не номер, а обрубок → null.
 *
 * Нормализация цифр берётся из `utils/phone` (там же её использует дедуп модалок),
 * чтобы правило «8 → 7» жило в одном месте.
 */
export function phoneKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = normalizePhone(raw);
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

// ═══ Email ═══

// Намеренно без RFC-фанатизма: задача — вытащить адрес из фразы, а не доказать
// его существование. Пограничные случаи ловит Zod в форме контакта.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/** Первый email в тексте или null. */
export function extractEmail(text: string): string | null {
  if (!text) return null;
  const m = EMAIL_RE.exec(text);
  return m ? m[0] : null;
}
