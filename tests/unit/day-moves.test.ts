import { describe, it, expect } from 'vitest';
import {
  markMoveDone,
  parseDayMoves,
  reconcileDayMoves,
  takeOneMore,
  unmarkMoveDone,
  type DayMovesState,
} from '@/lib/domain/day-moves';
import type { Move } from '@/lib/domain/today-deals';

const TODAY = '2026-10-05';
const LIMIT = 3;
const COMPUTED: Move[] = [
  { id: 'a', slot: 'fresh' },
  { id: 'b', slot: 'fresh' },
  { id: 'c', slot: 'biggest' },
];
const ALL = new Set(['a', 'b', 'c', 'd', 'e', 'x']);

function saved(over: Partial<DayMovesState> = {}): DayMovesState {
  return {
    day: TODAY,
    picked: ['a', 'b', 'c'],
    done: [],
    slots: { a: 'fresh', b: 'fresh', c: 'biggest' },
    ...over,
  };
}

describe('reconcileDayMoves', () => {
  it('нет сохранённого → picked из computed, done пуст', () => {
    expect(reconcileDayMoves(null, TODAY, COMPUTED, ALL, LIMIT)).toEqual({
      day: TODAY,
      picked: ['a', 'b', 'c'],
      done: [],
      slots: { a: 'fresh', b: 'fresh', c: 'biggest' },
    });
  });

  it('сохранён вчерашний день → собран заново', () => {
    const s = reconcileDayMoves(saved({ day: '2026-10-04', picked: ['x'], done: ['x'] }), TODAY, COMPUTED, ALL, LIMIT);
    expect(s.picked).toEqual(['a', 'b', 'c']);
    expect(s.done).toEqual([]);
  });

  it('тот же день, computed изменился → picked прежний', () => {
    const next: Move[] = [{ id: 'd', slot: 'fresh' }, { id: 'e', slot: 'fresh' }, { id: 'a', slot: 'biggest' }];
    expect(reconcileDayMoves(saved(), TODAY, next, ALL, LIMIT).picked).toEqual(['a', 'b', 'c']);
  });

  it('сделка исчезла из existingIds → убрана, набор добран до лимита', () => {
    const next: Move[] = [{ id: 'a', slot: 'fresh' }, { id: 'c', slot: 'biggest' }, { id: 'd', slot: 'fill' }];
    const s = reconcileDayMoves(saved(), TODAY, next, new Set(['a', 'c', 'd']), LIMIT);
    expect(s.picked).toEqual(['a', 'c', 'd']);
    expect(s.slots).toEqual({ a: 'fresh', c: 'biggest', d: 'fill' });
  });

  it('сделанный ход, которого нет в computed, остаётся в picked и в done', () => {
    const next: Move[] = [{ id: 'b', slot: 'fresh' }, { id: 'c', slot: 'biggest' }, { id: 'd', slot: 'fill' }];
    const s = reconcileDayMoves(saved({ done: ['a'] }), TODAY, next, ALL, LIMIT);
    expect(s.picked).toContain('a');
    expect(s.done).toEqual(['a']);
  });

  it('новая assigned → в начало, даже сверх лимита', () => {
    const next: Move[] = [{ id: 'e', slot: 'assigned' }, ...COMPUTED];
    const s = reconcileDayMoves(saved(), TODAY, next, ALL, LIMIT);
    expect(s.picked).toEqual(['e', 'a', 'b', 'c']);
    expect(s.slots.e).toBe('assigned');
  });

  it('все ходы сделаны → добора нет', () => {
    const s = reconcileDayMoves(
      saved({ picked: ['a', 'b'], done: ['a', 'b'] }),
      TODAY,
      [{ id: 'd', slot: 'fresh' }],
      ALL,
      LIMIT,
    );
    expect(s.picked).toEqual(['a', 'b']);
  });

  it('пустой picked в тот же день → добор из computed', () => {
    const s = reconcileDayMoves(saved({ picked: [], done: [], slots: {} }), TODAY, COMPUTED, ALL, LIMIT);
    expect(s.picked).toEqual(['a', 'b', 'c']);
  });

  it('slots: у взятых из computed — их слот; у убранной сделки записи нет', () => {
    const s = reconcileDayMoves(
      saved({ picked: ['a', 'x'], slots: { a: 'fresh', x: 'fill' } }),
      TODAY,
      [{ id: 'd', slot: 'biggest' }],
      new Set(['a', 'd']),
      LIMIT,
    );
    expect(s.picked).toEqual(['a', 'd']);
    expect(s.slots).toEqual({ a: 'fresh', d: 'biggest' });
  });
});

describe('markMoveDone / unmarkMoveDone / takeOneMore', () => {
  it('markMoveDone дважды → один id; unmarkMoveDone снимает', () => {
    const s = markMoveDone(markMoveDone(saved(), 'a'), 'a');
    expect(s.done).toEqual(['a']);
    expect(unmarkMoveDone(s, 'a').done).toEqual([]);
  });

  it('takeOneMore → первый id из computed, которого нет в picked; такого нет → прежнее', () => {
    const s = takeOneMore(saved(), [{ id: 'a', slot: 'fresh' }, { id: 'd', slot: 'fill' }, { id: 'e', slot: 'fill' }]);
    expect(s.picked).toEqual(['a', 'b', 'c', 'd']);
    expect(s.slots.d).toBe('fill');
    const same = saved();
    expect(takeOneMore(same, COMPUTED)).toBe(same);
  });
});

describe('parseDayMoves', () => {
  it.each([
    ['null', null],
    ['битый JSON', '{oops'],
    ['пустой объект', '{}'],
    ['picked не массив', JSON.stringify({ day: TODAY, picked: 'a', done: [], slots: {} })],
    ['массив вместо объекта', '[]'],
    ['done не массив строк', JSON.stringify({ day: TODAY, picked: [], done: [1], slots: {} })],
  ])('%s → null', (_label, raw) => {
    expect(parseDayMoves(raw)).toBeNull();
  });

  it('валидная запись читается, битый слот выпадает', () => {
    const raw = JSON.stringify({ day: TODAY, picked: ['a', 'b'], done: ['a'], slots: { a: 'fresh', b: 'нечто' } });
    expect(parseDayMoves(raw)).toEqual({ day: TODAY, picked: ['a', 'b'], done: ['a'], slots: { a: 'fresh' } });
  });
});
