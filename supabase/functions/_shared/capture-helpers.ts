// supabase/functions/_shared/capture-helpers.ts — S-QUICK-CAPTURE-1, вынесен в общий
// модуль в S-TG-3.
//
// ⚠️ ЭТО ЕДИНСТВЕННЫЙ ИСТОЧНИК, А НЕ ЗЕРКАЛО. Файл читают ДВА потребителя:
//      • Next-бандл — через реэкспорт `src/lib/utils/capture-helpers.ts`
//        (специфер БЕЗ расширения: `../../../supabase/functions/_shared/capture-helpers`),
//      • Deno-функция `telegram-webhook` — прямым импортом С расширением
//        (`../_shared/capture-helpers.ts`).
//    Один файл, два специфера — потому что TS без `allowImportingTsExtensions` не
//    берёт `.ts` в импорте, а Deno без расширения не резолвит вовсе. Дублировать
//    файл ради этого не нужно: расхождение зеркал — отдельный класс дефектов, и
//    в спринте голоса он уже стоил времени.
//
// ⚠️ НЕ ДОБАВЛЯТЬ СЮДА ИМПОРТОВ. Модуль обязан оставаться самодостаточным: любой
//    импорт немедленно ломает одного из двух потребителей — либо алиас `@/`,
//    которого нет у Deno, либо расширение `.ts`, которого не терпит tsc.
//    По той же причине здесь нет ни React, ни сети, ни `Date.now()`.
//
// Инвариант фичи: реквизиты компании модель НЕ извлекает. ИНН распознаётся здесь,
// регуляркой + контрольной суммой, и уходит в `company-lookup` (ЕГРЮЛ).
// LLM разбирает только свободный текст (ФИО, должность, телефоны, почта).

// ═══ Телефон: нормализация ═══

/**
 * Только цифры, 8 → 7. Каноническое определение правила в проекте: под именем
 * `normalizePhone` его реэкспортирует `src/lib/utils/phone.ts`, откуда его берут
 * дедупы ContactModal и LeadConversionModal.
 *
 * Живёт здесь, а не там, по механической причине: `phoneKey` ниже нужен боту, а
 * Deno не дотянется до `src/lib/utils/phone.ts` (там есть и другие функции, и
 * потребители с алиасом). Копия правила «8 → 7» в двух местах разъехалась бы —
 * дедуп из бота и дедуп из формы обязаны считать один и тот же ключ.
 */
export function normalizePhoneDigits(p: string): string {
  return p.replace(/\D/g, '').replace(/^8/, '7');
}

// ═══ ИНН ═══
//
// ⚠️ Здесь чексумма считается, а в `src/lib/utils/inn.ts` (`isValidInn`) — НЕТ, и это
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

// ═══ Телефон: ключ дедупа ═══

/**
 * Ключ дедупа: последние 10 цифр номера. Отсекает разницу «+7 / 8 / без кода»
 * и любое форматирование. Меньше 10 цифр — не номер, а обрубок → null.
 */
export function phoneKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = normalizePhoneDigits(raw);
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

// ═══ Дедуп ═══
//
// S-TG-3: правило переехало сюда из `use-quick-capture.ts` целиком. Причина —
// у него стало ДВА клиента: веб-виджет считает дубль по спискам из кэша
// React Query, бот — по строкам, вычитанным из БД под service_role. Само правило
// («что считать тем же контактом») от источника строк не зависит и обязано жить
// в одном месте: разъехавшись, оно дало бы дубль, заведённый из мессенджера, при
// том что веб на том же тексте дубль показывает.

/**
 * Организационно-правовые формы, которые не различают компании.
 *
 * Сравниваются как ЦЕЛЫЕ ТОКЕНЫ, а не регуляркой с `\b`. ⚠️ Так было, и так не
 * работало: `\b` в JS определён через `\w` = `[A-Za-z0-9_]`, кириллица в него не
 * входит — значит рядом с ней границы слова НЕ СУЩЕСТВУЕТ, и
 * `\b(ооо|ао|…)\b` не срезал ОПФ ни разу. «ООО Ромашка» и «Ромашка» дублями не
 * считались, хотя весь смысл нормализации был именно в этом. Правило жило в трёх
 * копиях (здесь, CompanyModal, use-quick-capture) и было сломано во всех трёх.
 * Та же грабля, что в S-CHAT-TASK-1.
 */
const OPF_TOKENS = new Set(['ооо', 'оао', 'зао', 'пао', 'нао', 'ао', 'ип']);

/** Название компании без ОПФ, кавычек и регистра. Единственное определение в проекте. */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    // Кавычки — в ПРОБЕЛ, а не в пустоту: «ООО"Ромашка"» без пробела иначе
    // склеивалось бы в один токен «оооромашка», и ОПФ снова не отделилась бы.
    .replace(/[«»"'“”]/g, ' ')
    .split(/\s+/)
    .filter((token) => token !== '' && !OPF_TOKENS.has(token))
    .join(' ')
    .trim();
}

/**
 * Строки, по которым ищется дубль. Формы намеренно шире боевых типов
 * (`Contact`/`Company` из `@/types/database`): модуль не имеет права их
 * импортировать, а структурно они сюда ложатся.
 */
export interface DedupContactRow {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  phones?: ReadonlyArray<{ value: string }> | null;
}

export interface DedupCompanyRow {
  id: string;
  name: string;
  inn?: string | null;
}

/** Разбор, по которому ищется дубль. Совместим с `CaptureResult` (Zod). */
export interface DedupCaptureInput {
  contact?: { email?: string | null; phone?: string | null; notes?: string | null } | null;
  company?: { name?: string | null } | null;
}

/**
 * По чему найдено совпадение. Поле ОПЦИОНАЛЬНО: веб-виджет его не читает и от
 * появления не меняется, а боту оно нужно (S-TG-3-INN-DUP) — «Всё равно создать»
 * на совпадении по ИНН не может сработать никогда, там уникальный индекс
 * `uq_companies_org_inn`. Совпадение по НАЗВАНИЮ такого ограничения не имеет:
 * два юрлица с похожими названиями и разными ИНН — обычное дело.
 */
export type CaptureDuplicate =
  | { kind: 'contact'; id: string; label: string; matchedBy?: 'email' | 'phone' }
  | { kind: 'company'; id: string; label: string; matchedBy?: 'inn' | 'name' };

/**
 * Первый похожий существующий объект или null.
 *
 * Контакт — по email или любому из телефонов (нормализованных до 10 цифр).
 * Компания — по ИНН (точно) или названию без ОПФ. `inn` приходит отдельным
 * параметром: модель его не извлекает (инвариант), его даёт `extractInn`.
 *
 * В ответе есть `matchedBy` — по чему именно совпало. Нужен потребителю, который
 * решает, можно ли «создать всё равно»: по названию можно, по ИНН нельзя
 * (уникальный индекс, см. `CaptureDuplicate`).
 *
 * ⚠️ Контакт проверяется ПЕРВЫМ и при совпадении завершает поиск. Порядок значим
 *    для `intent='unclear'`, где заполнены обе ветки: подпись в письме почти
 *    всегда несёт и человека, и его компанию, и «уже есть» про человека —
 *    точнее, чем про его работодателя.
 */
export function findCaptureDuplicate(
  result: DedupCaptureInput,
  inn: string | null,
  contacts: ReadonlyArray<DedupContactRow>,
  companies: ReadonlyArray<DedupCompanyRow>,
): CaptureDuplicate | null {
  const c = result.contact;
  if (c) {
    const email = (c.email || extractEmail(c.notes ?? '') || '').trim().toLowerCase() || null;
    const key = phoneKey(c.phone);
    if (email || key) {
      // Цикл, а не `find`: нужно не только «нашлось», но и ПО ЧЕМУ нашлось.
      // Порядок проверок внутри строки прежний (email → телефон), поэтому
      // выбранная строка та же, что и раньше.
      for (const row of contacts) {
        // 13 из 89 контактов прода без фамилии: рукописный тип врёт (string),
        // а `${null}` в шаблонной строке печатает «null» (learnings 2026-08-04).
        const label = [row.first_name, row.last_name].filter(Boolean).join(' ');
        if (email && row.email && row.email.trim().toLowerCase() === email) {
          return { kind: 'contact', id: row.id, label, matchedBy: 'email' };
        }
        if (!key) continue;
        if (phoneKey(row.phone) === key || (row.phones ?? []).some((p) => phoneKey(p.value) === key)) {
          return { kind: 'contact', id: row.id, label, matchedBy: 'phone' };
        }
      }
    }
  }

  const norm = result.company?.name ? normalizeCompanyName(result.company.name) : '';
  if (inn || norm.length >= 3) {
    for (const row of companies) {
      if (inn && row.inn && row.inn.trim() === inn) {
        return { kind: 'company', id: row.id, label: row.name, matchedBy: 'inn' };
      }
      if (norm.length >= 3 && normalizeCompanyName(row.name) === norm) {
        return { kind: 'company', id: row.id, label: row.name, matchedBy: 'name' };
      }
    }
  }

  return null;
}
