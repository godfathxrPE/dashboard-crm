import { describe, it, expect } from 'vitest';
import { cardDeadline, categoryToLane, planBoardDrop } from '@/lib/domain/deal-board';

// ═══════════════════════════════════════════════════════
// S-DEAL-BOARD-1 (W3 · КОЛОНКИ). `now` всегда аргументом.
// ═══════════════════════════════════════════════════════

/** 12:00 МСК 8 сентября 2026. */
const NOW = new Date('2026-09-08T09:00:00.000Z');

describe('categoryToLane — зеркало public.category_to_lane', () => {
  it('четыре категории доски сделки', () => {
    expect(categoryToLane('backlog')).toBe('next');
    expect(categoryToLane('started')).toBe('now');
    expect(categoryToLane('paused')).toBe('wait');
    expect(categoryToLane('done')).toBe('done');
  });
});

describe('cardDeadline', () => {
  it('без дедлайна и с мусором — null', () => {
    expect(cardDeadline(null, 'started', NOW)).toBeNull();
    expect(cardDeadline('не дата', 'started', NOW)).toBeNull();
  });

  it('просрочено — слово и дата', () => {
    expect(cardDeadline('2026-09-03T10:00:00.000Z', 'started', NOW)).toEqual({
      tone: 'overdue',
      label: 'просрочено · 3 сент',
    });
  });

  it('сегодня', () => {
    expect(cardDeadline('2026-09-08T18:00:00.000Z', 'started', NOW)).toEqual({
      tone: 'today',
      label: 'сегодня',
    });
  });

  it('ожидание впереди — «ждём до»', () => {
    expect(cardDeadline('2026-09-15T10:00:00.000Z', 'paused', NOW)).toEqual({
      tone: 'waiting',
      label: 'ждём до 15 сент',
    });
  });

  it('ожидание, но просрочено — всё-таки просрочено', () => {
    expect(cardDeadline('2026-09-01T10:00:00.000Z', 'paused', NOW)?.tone).toBe('overdue');
  });

  it('готово не бывает просроченным', () => {
    expect(cardDeadline('2026-08-11T10:00:00.000Z', 'done', NOW)).toEqual({
      tone: 'done',
      label: '11 авг',
    });
  });

  it('день — по МСК: 23:30 МСК 7-го уже не «сегодня» 8-го', () => {
    // 2026-09-07T20:30Z = 23:30 МСК 7 сентября
    expect(cardDeadline('2026-09-07T20:30:00.000Z', 'backlog', NOW)?.tone).toBe('overdue');
    // 2026-09-07T21:30Z = 00:30 МСК 8 сентября
    expect(cardDeadline('2026-09-07T21:30:00.000Z', 'backlog', NOW)?.tone).toBe('today');
  });
});

describe('planBoardDrop', () => {
  const cols = ['c1', 'c2'];
  const board = {
    c1: [
      { id: 'a', column_id: 'c1', sort_order: 0 },
      { id: 'b', column_id: 'c1', sort_order: 1 },
    ],
    c2: [{ id: 'x', column_id: 'c2', sort_order: 0 }],
  };

  it('на колонку — в конец, смена колонки', () => {
    expect(planBoardDrop(board, cols, 'a', 'c2')).toEqual({
      move: { id: 'a', column_id: 'c2', sort_order: 1 },
      reorder: [],
    });
  });

  it('на задачу в чужой колонке — встаёт перед ней, сосед сдвигается', () => {
    expect(planBoardDrop(board, cols, 'a', 'x')).toEqual({
      move: { id: 'a', column_id: 'c2', sort_order: 0 },
      reorder: [{ id: 'x', sort_order: 1 }],
    });
  });

  it('в пустую колонку', () => {
    expect(planBoardDrop({ ...board, c3: [] }, [...cols, 'c3'], 'b', 'c3')).toEqual({
      move: { id: 'b', column_id: 'c3', sort_order: 0 },
      reorder: [],
    });
  });

  it('перестановка внутри колонки', () => {
    expect(planBoardDrop(board, cols, 'b', 'a')).toEqual({
      move: { id: 'b', column_id: 'c1', sort_order: 0 },
      reorder: [{ id: 'a', sort_order: 1 }],
    });
  });

  it('на своё место и мимо — null', () => {
    expect(planBoardDrop(board, cols, 'b', 'c1')).toBeNull();
    expect(planBoardDrop(board, cols, 'a', 'нет-такого')).toBeNull();
    expect(planBoardDrop(board, cols, 'нет-такого', 'c2')).toBeNull();
  });
});
