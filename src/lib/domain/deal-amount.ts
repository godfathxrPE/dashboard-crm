import { pickActiveQuote, quoteVersionMap, type QuoteLike } from './quote-version';

// ═══════════════════════════════════════════════════════
// S-DEAL-HEADER-1: какая сумма стоит в шапке сделки и откуда она взялась.
//
// Правило одно: есть активное КП с суммой — деньги считаются по нему, иначе по
// `projects.budget`. Активное КП выбирает `pickActiveQuote` (accepted → последнее
// sent → последнее любое), версию даёт `quoteVersionMap` — те же две функции, что
// подписывают карточку КП в орг. блоке. Третьего определения «активного» и
// собственной нумерации здесь нет намеренно: «v» обязана совпадать во всех местах
// экрана (S-DEAL-ORG-1), а совпадать она может только вычисляясь в одном.
//
// ⚠️ ПЕРЕБИВАЕТ ТОЛЬКО ПОКАЗ. Функция ничего не возвращает для записи и ничего не
// пишет: обновление `projects.budget` остаётся явной кнопкой в `QuotesTab`
// (решение S-QUOTE-1, подтверждено гейтом S-DEAL-ORG-1). Шапка не должна стать
// вторым путём изменения денег — иначе сумма начнёт «сама» уезжать за КП.
//
// Чистый домен: ноль React и ноль запросов, тесты — `tests/unit/deal-amount.test.ts`.
// ═══════════════════════════════════════════════════════

/**
 * `QuoteLike` плюс сумма. Отдельный тип, а не расширение `QuoteLike`:
 * `quote-version.ts` описывает минимум для НУМЕРАЦИИ, деньги ему не нужны.
 */
export interface QuoteAmountLike extends QuoteLike {
  /** Копейки. NULL — КП заведено, но цена ещё не проставлена. */
  amount: number | null;
}

export interface DealHeaderAmount {
  /** Копейки — формат отдаёт `formatBudgetFull`, домен цифру не украшает. */
  amount: number | null;
  source: 'quote' | 'budget' | 'none';
  /** Версия активного КП (1-based). Не-`quote` источник версии не имеет. */
  version: number | null;
}

export function dealHeaderAmount(
  quotes: readonly QuoteAmountLike[] | undefined,
  budget: number | null,
): DealHeaderAmount {
  const list = quotes ?? [];
  const active = pickActiveQuote(list);

  // КП без суммы не перебивает бюджет: «активное» здесь про переговорную
  // позицию, а спрашивают у шапки про деньги. Пустая цена деньгами не является.
  if (active && active.amount != null) {
    return {
      amount: active.amount,
      source: 'quote',
      version: quoteVersionMap(list).get(active.id) ?? 1,
    };
  }

  if (budget != null) return { amount: budget, source: 'budget', version: null };

  // Ни КП, ни бюджета — сумма не рисуется вовсе. Прочерк на месте цены читался бы
  // как «ноль рублей», а это разные вещи: цены ЕЩЁ НЕТ.
  return { amount: null, source: 'none', version: null };
}
