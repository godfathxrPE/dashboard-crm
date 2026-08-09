import { describe, it, expect } from 'vitest';
import {
  mergeIntervals,
  largestFreeWindow,
  formatFreeWindow,
  formatMin,
  WORK_START_MIN,
  WORK_END_MIN,
} from '@/lib/domain/day-windows';

// S-CAL-LANES-1: «паспорт дня» в ленте недели отвечает на вопрос «когда я свободен».
// Правила окна (рамка 9–18, порог 45 минут, события вне рамки её не сужают) живут
// в домене — тесты фиксируют именно их, а не вёрстку.

const at = (h: number, m = 0) => h * 60 + m;

describe('mergeIntervals', () => {
  it('сливает пересечения', () => {
    expect(mergeIntervals([
      { startMin: at(10), endMin: at(12) },
      { startMin: at(11), endMin: at(13) },
    ])).toEqual([{ startMin: at(10), endMin: at(13) }]);
  });

  it('сливает соприкасающиеся — зазор нулевой длины окном не станет', () => {
    expect(mergeIntervals([
      { startMin: at(10), endMin: at(11) },
      { startMin: at(11), endMin: at(12) },
    ])).toEqual([{ startMin: at(10), endMin: at(12) }]);
  });

  it('не зависит от порядка на входе и отбрасывает пустые', () => {
    expect(mergeIntervals([
      { startMin: at(15), endMin: at(16) },
      { startMin: at(9), endMin: at(9) },
      { startMin: at(10), endMin: at(11) },
    ])).toEqual([
      { startMin: at(10), endMin: at(11) },
      { startMin: at(15), endMin: at(16) },
    ]);
  });
});

describe('largestFreeWindow', () => {
  it('пустой день — окно во всю рабочую рамку', () => {
    expect(largestFreeWindow([])).toEqual({ startMin: WORK_START_MIN, endMin: WORK_END_MIN });
  });

  it('один интервал в середине — берётся бо́льшая из двух половин', () => {
    // 9–12 (3 ч) против 13–18 (5 ч) → вторая
    expect(largestFreeWindow([{ startMin: at(12), endMin: at(13) }]))
      .toEqual({ startMin: at(13), endMin: WORK_END_MIN });
  });

  it('пересекающиеся события считаются как одно занятое место', () => {
    expect(largestFreeWindow([
      { startMin: at(10), endMin: at(12) },
      { startMin: at(11), endMin: at(16) },
    ])).toEqual({ startMin: at(16), endMin: WORK_END_MIN });
  });

  it('промежуток короче 45 минут окном не считается', () => {
    // свободны 9:00–9:30 и 10:00–10:30, остальное занято до конца рамки
    const win = largestFreeWindow([
      { startMin: at(9, 30), endMin: at(10) },
      { startMin: at(10, 30), endMin: at(18) },
    ]);
    expect(win).toBeNull();
  });

  it('событие целиком вне рамки её не сужает', () => {
    expect(largestFreeWindow([{ startMin: at(20), endMin: at(21) }]))
      .toEqual({ startMin: WORK_START_MIN, endMin: WORK_END_MIN });
  });

  it('событие, торчащее из рамки, обрезается по ней', () => {
    expect(largestFreeWindow([{ startMin: at(7), endMin: at(10) }]))
      .toEqual({ startMin: at(10), endMin: WORK_END_MIN });
  });

  it('окно в конце дня', () => {
    expect(largestFreeWindow([{ startMin: at(9), endMin: at(15) }]))
      .toEqual({ startMin: at(15), endMin: WORK_END_MIN });
  });
});

describe('formatMin', () => {
  it('ровный час — без нулевых минут', () => {
    expect(formatMin(at(15))).toBe('15');
    expect(formatMin(at(9))).toBe('09');
  });

  it('неровный — с минутами', () => {
    expect(formatMin(at(15, 30))).toBe('15:30');
  });
});

describe('formatFreeWindow', () => {
  it('пустой день', () => {
    expect(formatFreeWindow([])).toEqual({ prefix: 'весь день свободен', value: null });
  });

  it('окно упирается в конец рамки — «после HH»', () => {
    expect(formatFreeWindow([{ startMin: at(9), endMin: at(12) }]))
      .toEqual({ prefix: 'окно', value: 'после 12' });
  });

  it('окно упирается в начало рамки — «до HH»', () => {
    // свободно 9–14, потом занято до конца рамки
    expect(formatFreeWindow([{ startMin: at(14), endMin: at(18) }]))
      .toEqual({ prefix: 'окно', value: 'до 14' });
  });

  it('окно посередине — диапазон', () => {
    expect(formatFreeWindow([
      { startMin: at(9), endMin: at(12, 20) },
      { startMin: at(14, 20), endMin: at(18) },
    ])).toEqual({ prefix: 'окно', value: '12:20 – 14:20' });
  });

  it('окна нет', () => {
    expect(formatFreeWindow([{ startMin: at(9), endMin: at(18) }]))
      .toEqual({ prefix: 'нет окна', value: null });
  });
});
