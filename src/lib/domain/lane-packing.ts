// ═══════════════════════════════════════════════════════
// S-CAL-LANES-1: упаковка чипов одной дорожки дня.
//
// ⚠️ КОЛЛИЗИЯ ЧИПОВ — ПО ПИКСЕЛЯМ, А НЕ ПО ВРЕМЕНИ. Чип несёт иконку, время и
// название, то есть имеет минимальную ширину под текст: звонок в 09:00 и задача
// в 09:40 по времени не пересекаются вовсе, а на дорожке лягут друг на друга.
// Поэтому для упаковки каждый интервал расширяется до номинала CHIP_NOMINAL_MIN —
// «сколько минут оси занимает чип», а не «сколько длится событие».
//
// Рядов ровно два. Третий пересекающийся чип не получает третий ряд (дорожка
// поехала бы в высоту и неделя перестала бы влезать без скролла — ради этого
// вариант C и выбирали), а сжимается до иконки+времени: занимает меньше оси,
// название уходит в title/aria-label. Наложения не остаётся ни в одном случае.
//
// Модуль чистый: ни React, ни геометрии в rem — только минуты оси.
// ═══════════════════════════════════════════════════════

/** ~ширина полного чипа в минутах оси при 7 колонках дорожки. */
export const CHIP_NOMINAL_MIN = 100;

/** ~ширина сжатого чипа (иконка + HH:MM, без названия). */
export const CHIP_COMPRESSED_MIN = 40;

export interface LaneSpan<T> {
  item: T;
  startMin: number;
  endMin: number;
}

export interface PackedChip<T> extends LaneSpan<T> {
  row: 0 | 1;
  /** true — рядов не хватило, чип рисуется без названия. */
  compressed: boolean;
  /**
   * Минута оси, В КОТОРОЙ ЧИП РИСУЕТСЯ. Совпадает с `startMin` везде, кроме
   * сжатой ветки: там чип кладут в уже занятый ряд, и оставить его на своей
   * минуте — значит нарисовать поверх соседа. Сдвигаем вправо до свободного
   * места; настоящее время при этом не теряется — оно напечатано на самом чипе.
   */
  renderStartMin: number;
}

export function packLane<T>(items: LaneSpan<T>[]): PackedChip<T>[] {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  // Правая граница занятого места в каждом ряду, в минутах оси.
  const rowEnds: [number, number] = [-Infinity, -Infinity];
  const out: PackedChip<T>[] = [];

  for (const it of sorted) {
    let row: 0 | 1;
    let compressed = false;

    if (rowEnds[0] <= it.startMin) row = 0;
    else if (rowEnds[1] <= it.startMin) row = 1;
    else {
      // Оба ряда заняты — сжимаем и кладём туда, где место освободится раньше.
      compressed = true;
      row = rowEnds[0] <= rowEnds[1] ? 0 : 1;
    }

    const width = compressed ? CHIP_COMPRESSED_MIN : CHIP_NOMINAL_MIN;
    // Сжатие само по себе наложение НЕ снимает: узкий чип всё равно начинается
    // внутри соседа. Поэтому сжатый ещё и сдвигается вправо до конца занятого
    // места — только вместе эти два действия дают обещанное «не наложением».
    const renderStartMin = compressed ? Math.max(it.startMin, rowEnds[row]) : it.startMin;
    rowEnds[row] = Math.max(rowEnds[row], it.endMin, renderStartMin + width);
    out.push({ ...it, row, compressed, renderStartMin });
  }

  return out;
}

/** Сколько рядов реально занято — высота дорожки (1 ряд 3.4rem, 2 ряда 4.2rem). */
export function laneRows<T>(packed: PackedChip<T>[]): 0 | 1 | 2 {
  if (packed.length === 0) return 0;
  return packed.some((p) => p.row === 1) ? 2 : 1;
}
