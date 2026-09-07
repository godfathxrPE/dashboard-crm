import type { QuoteStatus } from '@/lib/validators/quote';

// ═══════════════════════════════════════════════════════
// S-DEAL-ORG-1 (W4): версия КП и выбор АКТИВНОГО КП.
//
// ВЕРСИИ НЕТ В БАЗЕ. В `quotes` (053) колонки `version` нет, и заводить её этим
// спринтом было бы вторым источником истины поверх `created_at`: порядок КП уже
// однозначно задан временем создания. Версия — ПОЗИЦИЯ в этом порядке, 1-based.
//
// ⚠️ ЭТО ЧИНИТ ДЕФЕКТ, А НЕ ДОБАВЛЯЕТ КРАСОТУ. До S-DEAL-ORG-1 свёрнутая строка
// орг. блока печатала `КП v${quotes.length}` — ЧИСЛО КП, а не версию. У самого
// свежего КП число случайно совпадает с версией, у любого другого — врёт: на трёх
// КП карточка второго подписывалась «v3». Отсюда требование спринта: «v» обязана
// совпадать в трёх местах (свёрнутая строка, карточка активного, подпись «заменён»),
// а значит вычисляться в одном месте — здесь.
//
// ⚠️ ПОРЯДОК ВХОДА НЕ ЗНАЧИМ. `useQuotes` отдаёт `created_at desc` (свежие сверху),
// а нумерация идёт по возрастанию. Функции сортируют вход сами и не мутируют его:
// полагаться на порядок вызывающего — это ждать, пока кто-нибудь поменяет `order`
// в хуке и молча перевернёт все версии.
// ═══════════════════════════════════════════════════════

/** Минимум полей КП, нужный для нумерации и выбора активного. */
export interface QuoteLike {
  id: string;
  status: QuoteStatus;
  created_at: string;
}

/**
 * Вход в порядке возрастания `created_at` (копия, вход не мутируется).
 *
 * Тай-брейк по `id` — не педантизм: два КП, созданных в одну миллисекунду (импорт,
 * дубль по двойному клику), без него получили бы РАЗНЫЕ версии в разных рендерах,
 * потому что `Array.prototype.sort` стабилен только относительно ВХОДНОГО порядка,
 * а вход приходит из сети и переупорядочивается.
 */
export function orderQuotes<T extends QuoteLike>(quotes: readonly T[]): T[] {
  return [...quotes].sort((a, b) => {
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** id → версия (1-based по `created_at asc`). */
export function quoteVersionMap(quotes: readonly QuoteLike[]): Map<string, number> {
  const map = new Map<string, number>();
  orderQuotes(quotes).forEach((q, i) => map.set(q.id, i + 1));
  return map;
}

/**
 * Активное КП: `accepted` → иначе последнее `sent` → иначе последнее любое.
 *
 * ⚠️ ПРАВИЛО ШИРЕ ТОГО, ЧТО БЫЛО. `QuotesTab` знал только первую ветку
 * (`find(status === 'accepted')`), и до принятия решения «активного КП» у сделки не
 * существовало вовсе — карточке W4 показывать было бы нечего ровно в тот момент,
 * когда она нужнее всего (КП отправлено, ждём ответа).
 *
 * `accepted` перебивает более свежий `sent` намеренно: партиал-уникальность
 * `quotes_one_accepted_per_project` разрешает ровно одно принятое КП на сделку, и
 * оно и есть итог переговоров — новый черновик поверх него итога не отменяет.
 */
export function pickActiveQuote<T extends QuoteLike>(quotes: readonly T[]): T | null {
  const ordered = orderQuotes(quotes);
  if (ordered.length === 0) return null;
  const accepted = ordered.find((q) => q.status === 'accepted');
  if (accepted) return accepted;
  for (let i = ordered.length - 1; i >= 0; i--) {
    if (ordered[i].status === 'sent') return ordered[i];
  }
  return ordered[ordered.length - 1];
}

/**
 * КП версии на единицу МЕНЬШЕ активного — подпись «v{N−1} · {сумма} · заменён».
 *
 * Именно предыдущая ПО ВЕРСИИ, а не «предыдущая по времени среди отклонённых»:
 * подпись обязана читаться как продолжение номера в карточке, иначе рядом окажутся
 * «v3» и «v1 · заменён» без объяснения, куда делась v2.
 */
export function pickPreviousQuote<T extends QuoteLike>(
  quotes: readonly T[],
  active: QuoteLike | null,
): T | null {
  if (!active) return null;
  const ordered = orderQuotes(quotes);
  const idx = ordered.findIndex((q) => q.id === active.id);
  return idx > 0 ? ordered[idx - 1] : null;
}
