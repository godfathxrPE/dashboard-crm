// ═══════════════════════════════════════════════════════
// S-TODAY-FOCUS-1: модель выбора экрана «Сегодня» (спека `today-focus-spec.md`, §3).
//
// Состояние экрана — id выбранной сделки, а не индекс очереди клавиш: индекс
// `useKeyboardNav` сбрасывается при каждом изменении числа строк (раскрыли группу),
// а выбор от этого меняться не должен. Здесь — только чистые правила: какая сделка
// в фокусе и какая следующая при «Разобрать по одной».
// ═══════════════════════════════════════════════════════

export interface SelectionScreen {
  /** Id ходов в порядке показа. */
  moves: readonly string[];
  /** Сделанные сегодня ходы. */
  doneMoves: ReadonlySet<string>;
  /** Id строк групп в порядке показа, включая строки свёрнутых групп. */
  rows: readonly string[];
}

/**
 * Какая сделка в фокусе. Выбранная, если она есть на экране; иначе первый несделанный
 * ход → первый ход → первая строка → null.
 *
 * «Есть на экране» — среди ходов или строк групп, свёрнутых тоже: свёрнутая группа
 * прячет строку, но сделку с экрана не убирает. Отложенной сделки среди них нет —
 * выбор переходит на сделку по умолчанию.
 */
export function resolveSelection(selectedId: string | null, screen: SelectionScreen): string | null {
  if (selectedId !== null && (screen.moves.includes(selectedId) || screen.rows.includes(selectedId))) {
    return selectedId;
  }
  return screen.moves.find((id) => !screen.doneMoves.has(id)) ?? screen.moves[0] ?? screen.rows[0] ?? null;
}

/** «Разобрать по одной»: следующая строка после `id` в списке `rows`; последней нет — null. */
export function nextInSweep(id: string, rows: readonly string[]): string | null {
  const i = rows.indexOf(id);
  if (i < 0) return null;
  return rows[i + 1] ?? null;
}
