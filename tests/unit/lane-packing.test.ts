import { describe, it, expect } from 'vitest';
import {
  packLane, laneRows, chipSpanMinutes,
  CHIP_NOMINAL_MIN, CHIP_COMPRESSED_MIN, CHIP_FULL_REM,
} from '@/lib/domain/lane-packing';

// S-CAL-LANES-1: коллизия чипов дорожки — ПИКСЕЛЬНАЯ, а не временная. Тесты
// фиксируют именно это: события, которые по времени не пересекаются, всё равно
// разъезжаются по рядам, потому что чип шире своей длительности.

const spans = (starts: number[], dur = 0) =>
  starts.map((s, i) => ({ item: `e${i}`, startMin: s, endMin: s + dur }));

const rowsOf = <T,>(packed: { item: T; row: 0 | 1 }[]) => packed.map((p) => p.row);

describe('packLane', () => {
  it('одиночное событие — ряд 0, без сжатия', () => {
    const out = packLane(spans([600]));
    expect(out).toHaveLength(1);
    expect(out[0].row).toBe(0);
    expect(out[0].compressed).toBe(false);
  });

  it('события дальше номинала друг от друга живут в одном ряду', () => {
    const out = packLane(spans([600, 600 + CHIP_NOMINAL_MIN]));
    expect(rowsOf(out)).toEqual([0, 0]);
    expect(out.every((p) => !p.compressed)).toBe(true);
  });

  it('три события с шагом 30 минут → ряды 0, 1, 0 (третий сжат)', () => {
    const out = packLane(spans([600, 630, 660]));
    expect(rowsOf(out)).toEqual([0, 1, 0]);
    expect(out.map((p) => p.compressed)).toEqual([false, false, true]);
  });

  it('четыре плотных события — ни одного наложения, лишние сжаты', () => {
    const out = packLane(spans([600, 620, 640, 660]));
    expect(out).toHaveLength(4);
    expect(out.every((p) => p.row === 0 || p.row === 1)).toBe(true);
    expect(out.filter((p) => p.compressed)).toHaveLength(2);
  });

  it('в ряду не остаётся наложений ни при какой плотности', () => {
    // Главное обещание упаковки. Сжатый чип кладётся в занятый ряд, поэтому
    // проверяем не ряды, а геометрию: занятые отрезки внутри ряда не пересекаются.
    for (const starts of [[600, 630, 660], [600, 620, 640, 660], [600, 630, 660, 665], [600, 600, 600, 600, 600]]) {
      const out = packLane(spans(starts));
      for (const row of [0, 1] as const) {
        const inRow = out
          .filter((p) => p.row === row)
          .map((p) => ({
            from: p.renderStartMin,
            to: Math.max(p.endMin, p.renderStartMin + (p.compressed ? CHIP_COMPRESSED_MIN : CHIP_NOMINAL_MIN)),
          }))
          .sort((a, b) => a.from - b.from);
        for (let i = 1; i < inRow.length; i++) {
          expect(inRow[i].from, `ряд ${row}, старты ${starts.join(',')}`).toBeGreaterThanOrEqual(inRow[i - 1].to);
        }
      }
    }
  });

  it('несжатый чип рисуется ровно на своей минуте', () => {
    const out = packLane(spans([600, 630]));
    expect(out.every((p) => p.compressed || p.renderStartMin === p.startMin)).toBe(true);
  });

  it('сжатый чип сдвинут вправо, но своё время не теряет', () => {
    const out = packLane(spans([600, 630, 660]));
    const third = out.find((p) => p.item === 'e2')!;
    expect(third.compressed).toBe(true);
    expect(third.renderStartMin).toBeGreaterThan(third.startMin);
    expect(third.startMin).toBe(660);
  });

  it('длинное событие занимает ряд по своей длительности, а не по номиналу', () => {
    // e0 длится 4 часа — следующий через 2 часа всё ещё пересекается по времени.
    const out = packLane([
      { item: 'long', startMin: 600, endMin: 600 + 240 },
      { item: 'next', startMin: 600 + 120, endMin: 600 + 150 },
    ]);
    expect(rowsOf(out)).toEqual([0, 1]);
  });

  it('порядок входа не влияет на раскладку', () => {
    const asc = packLane(spans([600, 630, 660]));
    const desc = packLane(spans([600, 630, 660]).reverse());
    expect(desc.map((p) => p.item)).toEqual(asc.map((p) => p.item));
    expect(rowsOf(desc)).toEqual(rowsOf(asc));
  });
});

describe('laneRows', () => {
  it('пусто → 0', () => expect(laneRows([])).toBe(0));
  it('только ряд 0 → 1', () => expect(laneRows(packLane(spans([600])))).toBe(1));
  it('задет ряд 1 → 2', () => expect(laneRows(packLane(spans([600, 630])))).toBe(2));
});

// ═══════════════════════════════════════════════════════
// S-CAL-LANES-1-FIX: инвариант проверяется В ПИКСЕЛЯХ.
//
// Тесты выше держат «в ряду нет пересечений» в минутах — и держали его честно,
// пока номинал был константой. Замер в Chromium показал, что константа занижена
// втрое: полный чип 250px = 300 минут оси на минимальной ширине, а не 100. Ниже —
// та же проверка, но через chipSpanMinutes от реальной геометрии.
// ═══════════════════════════════════════════════════════

const AXIS_MIN = (22 - 7) * 60;          // ось проекта 07:00–22:00
const LANE_PX_NARROW = (56 - 9) * 16;    // minWidth 56rem минус паспорт 9rem
const ROOT_FONT = 16;

describe('chipSpanMinutes', () => {
  it('на узкой дорожке полный чип занимает втрое больше старой константы', () => {
    const span = chipSpanMinutes(LANE_PX_NARROW, AXIS_MIN, ROOT_FONT);
    expect(span.full).toBeGreaterThan(CHIP_NOMINAL_MIN * 2.5);
  });

  it('чем шире дорожка, тем меньше минут занимает чип', () => {
    const narrow = chipSpanMinutes(LANE_PX_NARROW, AXIS_MIN, ROOT_FONT);
    const wide = chipSpanMinutes(LANE_PX_NARROW * 2, AXIS_MIN, ROOT_FONT);
    expect(wide.full).toBeLessThan(narrow.full);
  });

  it('увеличенный шрифт браузера расширяет чип — вёрстка на rem, ось на минутах', () => {
    const base = chipSpanMinutes(LANE_PX_NARROW, AXIS_MIN, ROOT_FONT);
    const zoomed = chipSpanMinutes(LANE_PX_NARROW, AXIS_MIN, ROOT_FONT * 1.25);
    expect(zoomed.full).toBeGreaterThan(base.full);
  });

  it('нулевая ширина (до первого замера) → fallback, не деление на ноль', () => {
    expect(chipSpanMinutes(0, AXIS_MIN, ROOT_FONT)).toEqual({
      full: CHIP_NOMINAL_MIN, compressed: CHIP_COMPRESSED_MIN,
    });
  });
});

describe('packLane с номиналом от реальной ширины', () => {
  const span = chipSpanMinutes(LANE_PX_NARROW, AXIS_MIN, ROOT_FONT);

  it('регресс гейта: звонок 10:10 и задача 12:00 не остаются в одном ряду', () => {
    // Именно эта пара накладывалась на 158px при константном номинале.
    const out = packLane(
      [
        { item: 'call', startMin: 10 * 60 + 10, endMin: 10 * 60 + 40 },
        { item: 'task', startMin: 12 * 60, endMin: 13 * 60 },
      ],
      span.full, span.compressed,
    );
    expect(rowsOf(out)).toEqual([0, 1]);
  });

  it('в каждом ряду чипы не перекрываются ПО ШИРИНЕ ЧИПА, а не по длительности', () => {
    const out = packLane(spans([9 * 60, 10 * 60, 11 * 60, 14 * 60, 16 * 60], 30), span.full, span.compressed);
    for (const row of [0, 1] as const) {
      const inRow = out.filter((p) => p.row === row).sort((a, b) => a.renderStartMin - b.renderStartMin);
      for (let i = 0; i < inRow.length - 1; i++) {
        const width = inRow[i].compressed ? span.compressed : span.full;
        const occupiedUntil = Math.max(inRow[i].renderStartMin + width, inRow[i].endMin);
        expect(inRow[i + 1].renderStartMin).toBeGreaterThanOrEqual(occupiedUntil);
      }
    }
  });

  it('CHIP_FULL_REM согласован с maxWidth названия — иначе номинал снова соврёт', () => {
    // 11rem название + иконка/время/паддинги ≈ 4.5rem. Если в Chip поменяют
    // maxWidth, этот тест обязан упасть вместе с ним.
    expect(CHIP_FULL_REM).toBeGreaterThanOrEqual(11 + 4);
  });
});
