import { describe, it, expect } from 'vitest';
import { nextInSweep, resolveSelection, type SelectionScreen } from '@/lib/domain/today-selection';

function screen(over: Partial<SelectionScreen> = {}): SelectionScreen {
  return {
    moves: ['m1', 'm2', 'm3'],
    doneMoves: new Set(),
    rows: ['r1', 'r2', 'r3'],
    ...over,
  };
}

describe('resolveSelection', () => {
  it('выбранная сделка среди ходов — она', () => {
    expect(resolveSelection('m2', screen())).toBe('m2');
  });

  it('выбранная сделка среди строк свёрнутой группы — она', () => {
    // `rows` включают строки свёрнутых групп: свёрнутая группа сделку с экрана не убирает.
    expect(resolveSelection('r3', screen())).toBe('r3');
  });

  it('выбранной нет на экране (отложили) — первый несделанный ход', () => {
    expect(resolveSelection('gone', screen({ doneMoves: new Set(['m1']) }))).toBe('m2');
  });

  it('выбора нет, первые два хода сделаны — третий ход', () => {
    expect(resolveSelection(null, screen({ doneMoves: new Set(['m1', 'm2']) }))).toBe('m3');
  });

  it('все ходы сделаны — первый ход', () => {
    expect(resolveSelection(null, screen({ doneMoves: new Set(['m1', 'm2', 'm3']) }))).toBe('m1');
  });

  it('ходов нет — первая строка; строк нет — null', () => {
    expect(resolveSelection(null, screen({ moves: [] }))).toBe('r1');
    expect(resolveSelection(null, screen({ moves: [], rows: [] }))).toBeNull();
    expect(resolveSelection('gone', screen({ moves: [], rows: [] }))).toBeNull();
  });
});

describe('nextInSweep', () => {
  const rows = ['a', 'b', 'c'];

  it('середина списка — следующая', () => {
    expect(nextInSweep('a', rows)).toBe('b');
    expect(nextInSweep('b', rows)).toBe('c');
  });

  it('последняя — null', () => {
    expect(nextInSweep('c', rows)).toBeNull();
  });

  it('id нет в списке — null', () => {
    expect(nextInSweep('x', rows)).toBeNull();
  });
});
