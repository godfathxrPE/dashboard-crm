import { describe, it, expect } from 'vitest';
import { packLane, laneRows, CHIP_NOMINAL_MIN, CHIP_COMPRESSED_MIN } from '@/lib/domain/lane-packing';

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
