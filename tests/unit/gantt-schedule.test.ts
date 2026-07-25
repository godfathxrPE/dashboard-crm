import { describe, it, expect } from 'vitest';
import {
  computeCascade,
  type ScheduleNode,
  type ScheduleEdge,
} from '@/lib/utils/gantt-schedule';

// Хелперы конструирования узлов/рёбер на чистых литералах (без моков).
const leaf = (id: string, start: string, end: string, parentTaskId: string | null = null): ScheduleNode =>
  ({ id, start, end, hasOwnDates: true, parentTaskId });
const summaryOwn = (id: string, start: string, end: string): ScheduleNode =>
  ({ id, start, end, hasOwnDates: true, parentTaskId: null });
const fs = (predecessor_id: string, successor_id: string, lag_days = 0): ScheduleEdge =>
  ({ predecessor_id, successor_id, dep_type: 'FS', lag_days });

const byId = (shifts: ReturnType<typeof computeCascade>) =>
  new Map(shifts.map((s) => [s.id, s]));

describe('computeCascade', () => {
  it('цепочка A→B→C: A уже сдвинут на +3 → B и C едут на +3, длительности целы', () => {
    // Исходно A/B/C впритык по дню; A уже двинут вперёд на 3 дня (anchor).
    const nodes = [
      leaf('A', '2026-08-04', '2026-08-05'), // было 08-01..08-02, +3
      leaf('B', '2026-08-03', '2026-08-05'), // длительность 2 дня
      leaf('C', '2026-08-06', '2026-08-06'),
    ];
    const edges = [fs('A', 'B'), fs('B', 'C')];
    const shifts = byId(computeCascade(nodes, edges, new Set(['A'])));

    expect(shifts.size).toBe(2);
    // B стартует не раньше A.end (lag 0) = 08-05; длительность 2 дня сохранена.
    expect(shifts.get('B')).toMatchObject({ start: '2026-08-05', end: '2026-08-07' });
    // C стартует не раньше нового B.end = 08-07.
    expect(shifts.get('C')).toMatchObject({ start: '2026-08-07', end: '2026-08-07' });
  });

  it('lag_days = 2 → B.start === A.end + 2 (совпадение с семантикой 1a, НЕ +3)', () => {
    const nodes = [
      leaf('A', '2026-08-01', '2026-08-05'),
      leaf('B', '2026-08-02', '2026-08-02'),
    ];
    const shifts = byId(computeCascade(nodes, [fs('A', 'B', 2)], new Set(['A'])));
    // earliest = A.end(08-05) + 2 = 08-07 — вне зависимости от «на сколько двинули A».
    expect(shifts.get('B')).toMatchObject({ start: '2026-08-07', end: '2026-08-07' });
  });

  it('у B запас 5 дней, A двинут на 2 → B (и C) НЕ двигаются (только вперёд)', () => {
    const nodes = [
      leaf('A', '2026-08-03', '2026-08-04'), // было 08-01..08-02, +2
      leaf('B', '2026-08-10', '2026-08-11'), // старт с большим запасом
      leaf('C', '2026-08-20', '2026-08-20'),
    ];
    const edges = [fs('A', 'B'), fs('B', 'C')];
    expect(computeCascade(nodes, edges, new Set(['A']))).toEqual([]);
  });

  it('ромб A→B, A→C, B→D, C→D с разными lag → D по максимуму из ветвей', () => {
    const nodes = [
      leaf('A', '2026-08-04', '2026-08-05'), // anchor (двинут)
      leaf('B', '2026-08-01', '2026-08-06'),
      leaf('C', '2026-08-01', '2026-08-03'),
      leaf('D', '2026-08-02', '2026-08-02'),
    ];
    // B тянется от A (lag 0), C от A (lag 0); D = max(B.end+1, C.end+3).
    const edges = [fs('A', 'B'), fs('A', 'C'), fs('B', 'D', 1), fs('C', 'D', 3)];
    const shifts = byId(computeCascade(nodes, edges, new Set(['A'])));

    // B: start ≥ A.end(08-05), длит 5 → 08-05..08-10
    expect(shifts.get('B')).toMatchObject({ start: '2026-08-05', end: '2026-08-10' });
    // C: start ≥ A.end(08-05), длит 2 → 08-05..08-07
    expect(shifts.get('C')).toMatchObject({ start: '2026-08-05', end: '2026-08-07' });
    // D: max(B.end 08-10 +1 = 08-11, C.end 08-07 +3 = 08-10) = 08-11
    expect(shifts.get('D')).toMatchObject({ start: '2026-08-11', end: '2026-08-11' });
  });

  it('dep_type SS полностью игнорируется', () => {
    const nodes = [
      leaf('A', '2026-08-04', '2026-08-05'),
      leaf('B', '2026-08-01', '2026-08-02'),
    ];
    const edges: ScheduleEdge[] = [{ predecessor_id: 'A', successor_id: 'B', dep_type: 'SS', lag_days: 0 }];
    expect(computeCascade(nodes, edges, new Set(['A']))).toEqual([]);
  });

  it('successor — сводный узел с двумя детьми → едут оба ребёнка + сам узел (hasOwnDates)', () => {
    // S — сводная (обёртка детей S1..S2), у неё собственные даты (hasOwnDates).
    const nodes = [
      leaf('A', '2026-08-10', '2026-08-11'),          // anchor (двинут вперёд)
      summaryOwn('S', '2026-08-01', '2026-08-05'),    // wrapper = дети
      leaf('S1', '2026-08-01', '2026-08-02', 'S'),
      leaf('S2', '2026-08-04', '2026-08-05', 'S'),
    ];
    const shifts = byId(computeCascade(nodes, [fs('A', 'S')], new Set(['A'])));

    // earliest = A.end(08-11); S.start 08-01 → Δ = 10 дней ко всему поддереву.
    expect(shifts.size).toBe(3);
    expect(shifts.get('S')).toMatchObject({ deltaDays: 10, start: '2026-08-11', reason: 'dependency' });
    expect(shifts.get('S1')).toMatchObject({ deltaDays: 10, start: '2026-08-11', end: '2026-08-12', reason: 'subtree' });
    expect(shifts.get('S2')).toMatchObject({ deltaDays: 10, start: '2026-08-14', end: '2026-08-15', reason: 'subtree' });
  });

  it('successor уже в anchors → не двигается, но его хвост считается от текущих дат', () => {
    // B — тоже якорь (пользователь двигал и его). B не двигаем, но C тянется от B.
    const nodes = [
      leaf('A', '2026-08-04', '2026-08-05'),
      leaf('B', '2026-08-08', '2026-08-09'), // якорь: своя дата, неподвижна
      leaf('C', '2026-08-01', '2026-08-01'),
    ];
    const edges = [fs('A', 'B'), fs('B', 'C')];
    const shifts = byId(computeCascade(nodes, edges, new Set(['A', 'B'])));

    expect(shifts.has('B')).toBe(false);                 // якорь неподвижен
    expect(shifts.get('C')).toMatchObject({ start: '2026-08-09', end: '2026-08-09' }); // от B.end
  });

  it('искусственный цикл A→B→A → возвращает результат без зависания', () => {
    const nodes = [
      leaf('A', '2026-08-01', '2026-08-02'),
      leaf('B', '2026-08-03', '2026-08-04'),
    ];
    const edges = [fs('A', 'B'), fs('B', 'A')];
    // Оба узла в цикле → topo пуст → сдвигов нет, функция не виснет.
    expect(computeCascade(nodes, edges, new Set(['A']))).toEqual([]);
  });
});
