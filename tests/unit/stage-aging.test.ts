import { describe, test, expect } from 'vitest';
import { getStageAging, compareByNextAction } from '@/lib/utils/deal-health';

// S-AGING-1 — регрессия чистых функций stage-aging + дефолтной сортировки.
// Фиксированный `now` + относительные даты, чтобы тесты не зависели от прогона.
const NOW = new Date('2026-07-14T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();
// Дата (без времени) относительно NOW — для next_action_date (тип date).
const dateInDays = (n: number) =>
  new Date(NOW.getTime() + n * 86400000).toISOString().slice(0, 10);

describe('getStageAging — возраст в стадии + флаг «залипла»', () => {
  test('null-дата → daysInStage null, не stale', () => {
    expect(getStageAging(null, 'working', NOW)).toEqual({ daysInStage: null, isStale: false });
  });

  test('невалидная дата → null, не stale', () => {
    expect(getStageAging('не-дата', 'working', NOW)).toEqual({ daysInStage: null, isStale: false });
  });

  test('сегодня → 0 дней, не stale', () => {
    const a = getStageAging(daysAgo(0), 'attraction', NOW);
    expect(a.daysInStage).toBe(0);
    expect(a.isStale).toBe(false);
  });

  test('attraction: порог 14 — на 14 не stale, на 15 stale', () => {
    expect(getStageAging(daysAgo(14), 'attraction', NOW).isStale).toBe(false);
    expect(getStageAging(daysAgo(15), 'attraction', NOW).isStale).toBe(true);
  });

  test('working: порог 21 — на 21 не stale, на 22 stale', () => {
    expect(getStageAging(daysAgo(21), 'working', NOW).isStale).toBe(false);
    expect(getStageAging(daysAgo(22), 'working', NOW).isStale).toBe(true);
  });

  test('approval: порог 21', () => {
    expect(getStageAging(daysAgo(21), 'approval', NOW).isStale).toBe(false);
    expect(getStageAging(daysAgo(22), 'approval', NOW).isStale).toBe(true);
  });

  test('closing: порог 30 — на 30 не stale, на 31 stale', () => {
    expect(getStageAging(daysAgo(30), 'closing', NOW).isStale).toBe(false);
    expect(getStageAging(daysAgo(31), 'closing', NOW).isStale).toBe(true);
  });

  test('неизвестная/пустая phase_group → дефолтный порог 21', () => {
    expect(getStageAging(daysAgo(21), null, NOW).isStale).toBe(false);
    expect(getStageAging(daysAgo(22), null, NOW).isStale).toBe(true);
    expect(getStageAging(daysAgo(22), 'wat', NOW).isStale).toBe(true);
  });
});

describe('compareByNextAction — дефолтный порядок воронки', () => {
  const sortIds = (arr: Array<{ id: string } & Parameters<typeof compareByNextAction>[0]>) =>
    [...arr].sort((a, b) => compareByNextAction(a, b, NOW)).map((p) => p.id);

  test('нет next_action_date (группа внимания) выше будущей даты', () => {
    const rows = [
      { id: 'future', status: 'open' as const, next_action_date: dateInDays(5), stage_entered_at: daysAgo(1) },
      { id: 'none', status: 'open' as const, next_action_date: null, stage_entered_at: daysAgo(1) },
    ];
    expect(sortIds(rows)).toEqual(['none', 'future']);
  });

  test('просроченный шаг выше будущего; «сегодня» тоже в группе внимания', () => {
    const rows = [
      { id: 'future', status: 'open' as const, next_action_date: dateInDays(5), stage_entered_at: daysAgo(1) },
      { id: 'today', status: 'open' as const, next_action_date: dateInDays(0), stage_entered_at: daysAgo(1) },
      { id: 'overdue', status: 'open' as const, next_action_date: dateInDays(-3), stage_entered_at: daysAgo(1) },
    ];
    // группа внимания: overdue(-3) и today(0) по дате возрастанию; future — ниже
    expect(sortIds(rows)).toEqual(['overdue', 'today', 'future']);
  });

  test('null-дата максимально срочна — выше просроченной внутри группы внимания', () => {
    const rows = [
      { id: 'overdue', status: 'open' as const, next_action_date: dateInDays(-3), stage_entered_at: daysAgo(1) },
      { id: 'none', status: 'open' as const, next_action_date: null, stage_entered_at: daysAgo(1) },
    ];
    expect(sortIds(rows)).toEqual(['none', 'overdue']);
  });

  test('тай-брейк: при равном приоритете дольше залипший (раньше вошёл) выше', () => {
    const rows = [
      { id: 'fresh', status: 'open' as const, next_action_date: null, stage_entered_at: daysAgo(2) },
      { id: 'stale', status: 'open' as const, next_action_date: null, stage_entered_at: daysAgo(40) },
    ];
    expect(sortIds(rows)).toEqual(['stale', 'fresh']);
  });

  test('терминальные (won/lost) уходят вниз, aging им неважен', () => {
    const rows = [
      { id: 'won', status: 'won' as const, next_action_date: null, stage_entered_at: daysAgo(99) },
      { id: 'open-future', status: 'open' as const, next_action_date: dateInDays(10), stage_entered_at: daysAgo(1) },
    ];
    expect(sortIds(rows)).toEqual(['open-future', 'won']);
  });

  test('стабилен и не мутирует вход', () => {
    const rows = [
      { id: 'a', status: 'open' as const, next_action_date: null, stage_entered_at: daysAgo(1) },
      { id: 'b', status: 'open' as const, next_action_date: null, stage_entered_at: daysAgo(1) },
    ];
    const snapshot = rows.map((r) => r.id);
    sortIds(rows);
    expect(rows.map((r) => r.id)).toEqual(snapshot); // исходный массив не тронут
  });
});
