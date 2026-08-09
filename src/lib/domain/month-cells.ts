// ═══════════════════════════════════════════════════════
// S-CAL-MONTH-1: что показывает ячейка месяца и полоса «Фокус месяца».
//
// До этого спринта ячейка несла счётчик («5» под числом) и уголок-треугольник —
// оба отвечали «событие есть», ни один не отвечал «какое». Теперь в ячейке чипы,
// и появляется вопрос отбора: событий в дне бывает больше, чем влезает строк.
//
// Правила отбора живут здесь, а не в компоненте, ровно по той же причине, по
// которой в S-CAL-LANES-1 сюда переехало свободное окно дня: «дедлайн не тонет
// в +N» и «третий чип вместо +1» — это договорённости продукта, и в JSX они
// разъезжаются с тем, что человек видит, при первой же правке вёрстки.
//
// Модуль чистый: ни React, ни дат-объектов — только сортируемые примитивы.
// ═══════════════════════════════════════════════════════

/** Сколько чипов помещается в ячейку по высоте. */
export const CELL_CHIP_MAX = 2;

/** Минимум, который должен нести элемент, чтобы попасть в отбор чипов ячейки. */
export interface CellChipLike {
  /** Минута начала МСК; null — событие без времени (дедлайн, встреча без `time`). */
  startMin: number | null;
  /** Вид события. `deal-deadline` имеет приоритет — см. `sliceCellChips`. */
  kind: string;
}

export interface CellChips<T> {
  visible: T[];
  /** Сколько событий дня осталось за срезом. 0 — «+N ещё» не рисуется. */
  hiddenCount: number;
}

/** Виды, которые не имеют права утонуть в «+N ещё». */
const PINNED_KINDS = new Set(['deal-deadline']);

/**
 * Порядок чипов в ячейке: дедлайны → события со временем по возрастанию →
 * события без времени. Внутри группы порядок входа сохраняется (сортировка
 * стабильная — `Array.prototype.sort` в ES2019+ это гарантирует), поэтому
 * два звонка в 10:00 не будут менять места между рендерами.
 */
export function orderCellEvents<T extends CellChipLike>(events: T[]): T[] {
  return [...events].sort((a, b) => {
    const ap = PINNED_KINDS.has(a.kind) ? 0 : 1;
    const bp = PINNED_KINDS.has(b.kind) ? 0 : 1;
    if (ap !== bp) return ap - bp;
    // Без времени — в хвост своей группы, а не в начало: `null` в числовом
    // сравнении привёл бы к NaN и порядок стал бы зависеть от входа.
    if (a.startMin === null && b.startMin === null) return 0;
    if (a.startMin === null) return 1;
    if (b.startMin === null) return -1;
    return a.startMin - b.startMin;
  });
}

/**
 * Чипы ячейки: упорядочить и срезать до `max`.
 *
 * ⚠️ Срез не ровно по `max`. Если за срезом остаётся РОВНО одно событие, оно
 * показывается третьим чипом вместо строки «+1 ещё»: строка та же по высоте,
 * но «+1 ещё» не говорит ничего, а третий чип говорит всё. Экономия строки
 * начинается с двух спрятанных.
 *
 * Дедлайн сделки при этом стоит первым (см. `orderCellEvents`) — то есть в «+N»
 * он не попадёт никогда, пока дедлайн в дне один. Два дедлайна в одном дне —
 * законный случай, второй уйдёт под «+N», и это осознанно: ячейка месяца не
 * список дня, полный состав человек видит в peek.
 */
export function sliceCellChips<T extends CellChipLike>(
  events: T[],
  max: number = CELL_CHIP_MAX,
): CellChips<T> {
  const ordered = orderCellEvents(events);
  if (ordered.length <= max + 1) return { visible: ordered, hiddenCount: 0 };
  return { visible: ordered.slice(0, max), hiddenCount: ordered.length - max };
}

/**
 * «1 событие / 2 события / 5 событий» — счётчик в паспорте дня.
 * Правило русского счётного числительного, а не набор `n === 1 ? … : …`:
 * второй вариант молча врёт на 2–4 и на 21.
 */
export function pluralEvents(n: number): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return `${n} событий`;
  if (last === 1) return `${n} событие`;
  if (last >= 2 && last <= 4) return `${n} события`;
  return `${n} событий`;
}

/** Дедлайн сделки в полосе «Фокус месяца». */
export interface MonthDeadlineInput {
  id: string;
  title: string;
  /** Календарный день МСК, YYYY-MM-DD. */
  dateKey: string;
}

export interface MonthDeadline extends MonthDeadlineInput {
  /** Число месяца — в полосе печатается без ведущего нуля. */
  day: number;
  /** Дата прошла относительно `todayKey`. В полосе — красным и весом 600. */
  overdue: boolean;
}

/**
 * Дедлайны сделок отображаемого месяца для фокус-полосы, по возрастанию даты.
 *
 * Месяц задаётся префиксом `YYYY-MM`, а не парой Date: ключи дней в проекте и так
 * строки МСК (`mskDateKey`), и сравнение строк здесь честнее, чем арифметика с
 * часовыми поясами — ровно та ловушка, из-за которой Гант считает бакеты на
 * UTC-полудне.
 *
 * `todayKey` — параметром, а не `new Date()` внутри: иначе функция нетестируема,
 * тот же приём, что у `daysSince` в date-helpers.
 */
export function monthDeadlines(
  items: MonthDeadlineInput[],
  monthPrefix: string,
  todayKey: string,
): MonthDeadline[] {
  return items
    .filter((d) => d.dateKey.startsWith(monthPrefix))
    .map((d) => ({
      ...d,
      day: Number(d.dateKey.slice(8, 10)),
      overdue: d.dateKey < todayKey,
    }))
    .sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0));
}
