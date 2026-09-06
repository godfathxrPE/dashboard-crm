import { describe, test, expect } from 'vitest';
import { countDeadlineMoves, countStepMoves, type AuditRow } from '@/lib/domain/field-moves';

function row(created_at: string, payload: unknown): AuditRow {
  return { created_at, payload };
}

/** Строки идут по УБЫВАНИЮ created_at — так их отдаёт запрос хука. */
const T = ['2026-09-06T10:00:00Z', '2026-09-05T10:00:00Z', '2026-09-04T10:00:00Z', '2026-09-03T10:00:00Z'];

describe('countDeadlineMoves', () => {
  test('пустой вход', () => {
    expect(countDeadlineMoves([])).toEqual({ count: 0, lastAt: null });
  });

  test('строка без changes и строка с changes без deadline — не считаются', () => {
    const rows = [
      row(T[0], { fields_changed: ['deadline'] }),
      row(T[1], { changes: { budget: { from: '1', to: '2' } } }),
    ];
    expect(countDeadlineMoves(rows)).toEqual({ count: 0, lastAt: null });
  });

  test('три переноса → count 3, lastAt = created_at первой строки', () => {
    const rows = [
      row(T[0], { changes: { deadline: { from: '2026-09-01', to: '2026-09-10' } } }),
      row(T[1], { changes: { deadline: { from: '2026-08-20', to: '2026-09-01' } } }),
      row(T[2], { changes: { deadline: { from: null, to: '2026-08-20' } } }),
    ];
    expect(countDeadlineMoves(rows)).toEqual({ count: 3, lastAt: T[0] });
  });

  test('payload null / строка / массив — не падает', () => {
    const rows = [row(T[0], null), row(T[1], 'text'), row(T[2], [{ deadline: 1 }])];
    expect(countDeadlineMoves(rows)).toEqual({ count: 0, lastAt: null });
  });
});

describe('countStepMoves', () => {
  test('from: null — назначение даты, а не перенос', () => {
    const rows = [row(T[0], { changes: { next_action_date: { from: null, to: '2026-09-10' } } })];
    expect(countStepMoves(rows)).toEqual({ count: 0, lastAt: null });
  });

  test('to: null первой строкой — «Шаг сделан», диагноз прошлого шага не висит', () => {
    const rows = [
      row(T[0], { changes: { next_action_date: { from: '2026-09-01', to: null } } }),
      row(T[1], { changes: { next_action_date: { from: '2026-08-20', to: '2026-09-01' } } }),
    ];
    expect(countStepMoves(rows)).toEqual({ count: 0, lastAt: null });
  });

  test('сдвиг назад — ускорение, не перенос', () => {
    const rows = [row(T[0], { changes: { next_action_date: { from: '2026-09-10', to: '2026-09-05' } } })];
    expect(countStepMoves(rows)).toEqual({ count: 0, lastAt: null });
  });

  test('два переноса вперёд, ниже граница from: null → count 2', () => {
    const rows = [
      row(T[0], { changes: { next_action_date: { from: '2026-09-05', to: '2026-09-12' } } }),
      row(T[1], { changes: { next_action_date: { from: '2026-09-01', to: '2026-09-05' } } }),
      row(T[2], { changes: { next_action_date: { from: null, to: '2026-09-01' } } }),
      // За границей — прошлый шаг, в счёт не идёт.
      row(T[3], { changes: { next_action_date: { from: '2026-08-01', to: '2026-08-15' } } }),
    ];
    expect(countStepMoves(rows)).toEqual({ count: 2, lastAt: T[0] });
  });

  test('строка без next_action_date пропускается, не обрывает счёт', () => {
    const rows = [
      row(T[0], { changes: { next_action_date: { from: '2026-09-05', to: '2026-09-12' } } }),
      row(T[1], { changes: { budget: { from: '1', to: '2' } } }),
      row(T[2], { changes: { next_action_date: { from: '2026-09-01', to: '2026-09-05' } } }),
    ];
    expect(countStepMoves(rows)).toEqual({ count: 2, lastAt: T[0] });
  });

  test('смешанный payload — счётчики независимы', () => {
    const rows = [
      row(T[0], {
        changes: {
          deadline: { from: '2026-10-01', to: '2026-11-01' },
          next_action_date: { from: '2026-09-01', to: '2026-09-05' },
        },
      }),
      row(T[1], { changes: { deadline: { from: '2026-09-01', to: '2026-10-01' } } }),
    ];
    expect(countDeadlineMoves(rows)).toEqual({ count: 2, lastAt: T[0] });
    expect(countStepMoves(rows)).toEqual({ count: 1, lastAt: T[0] });
  });

  test('payload null / строка / массив — не падает', () => {
    const rows = [row(T[0], null), row(T[1], 'text'), row(T[2], [1, 2])];
    expect(countStepMoves(rows)).toEqual({ count: 0, lastAt: null });
  });

  test('next_action_date не объект — строка пропускается', () => {
    const rows = [row(T[0], { changes: { next_action_date: '2026-09-05' } })];
    expect(countStepMoves(rows)).toEqual({ count: 0, lastAt: null });
  });
});
