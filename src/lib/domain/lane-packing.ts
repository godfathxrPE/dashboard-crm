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

// ⚠️ S-CAL-LANES-1-FIX: НОМИНАЛ В МИНУТАХ НЕ МОЖЕТ БЫТЬ КОНСТАНТОЙ.
// Чип имеет фиксированную ширину в rem, а сколько это минут оси — зависит от
// ширины дорожки, то есть от вьюпорта. Замер в Chromium (гейт 09.08): полный чип
// 250px; на минимальной ширине контейнера (56rem → дорожка 752px, ось 900 мин)
// это 300 минут, а не 100 — звонок 10:10 и задача 12:00 попадали в один ряд и
// наезжали друг на друга на 158px. Инвариант «в ряду нет пересечений» держался
// в минутах и не держался в пикселях — ровно там, где его видно.
// Поэтому номинал считается из фактической ширины (chipSpanMinutes), а константы
// ниже остались только как fallback до первого замера ResizeObserver.

/** Ширина полного чипа: паддинги + иконка + HH:MM + название (maxWidth 11rem). */
export const CHIP_FULL_REM = 15.5;
/** Ширина сжатого чипа: паддинги + иконка + HH:MM, без названия. */
export const CHIP_COMPRESSED_REM = 4.5;

/** Fallback-номинал до первого замера. Заведомо мал — держит только первый кадр. */
export const CHIP_NOMINAL_MIN = 100;
export const CHIP_COMPRESSED_MIN = 40;

/**
 * Сколько минут оси занимает чип при данной ширине дорожки.
 * `laneWidthPx` — ширина полотна БЕЗ паспорта дня; `rootFontPx` — размер корневого
 * шрифта (rem не равен 16px, если пользователь увеличил шрифт в браузере — а он
 * имеет право, и вёрстка проекта на rem именно ради этого).
 */
export function chipSpanMinutes(
  laneWidthPx: number,
  axisMin: number,
  rootFontPx: number,
): { full: number; compressed: number } {
  if (laneWidthPx <= 0 || axisMin <= 0) return { full: CHIP_NOMINAL_MIN, compressed: CHIP_COMPRESSED_MIN };
  const minPerPx = axisMin / laneWidthPx;
  return {
    full: Math.round(CHIP_FULL_REM * rootFontPx * minPerPx),
    compressed: Math.round(CHIP_COMPRESSED_REM * rootFontPx * minPerPx),
  };
}

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

export function packLane<T>(
  items: LaneSpan<T>[],
  nominalMin: number = CHIP_NOMINAL_MIN,
  compressedMin: number = CHIP_COMPRESSED_MIN,
): PackedChip<T>[] {
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

    const width = compressed ? compressedMin : nominalMin;
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
