import { describe, test, expect } from 'vitest';
import { getStageAging, compareByNextAction, resolveDwellThreshold } from '@/lib/utils/deal-health';

// S-AGING-1 — регрессия чистых функций stage-aging + дефолтной сортировки.
// Фиксированный `now` + относительные даты, чтобы тесты не зависели от прогона.
const NOW = new Date('2026-07-14T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();
// Дата (без времени) относительно NOW — для next_action_date (тип date).
const dateInDays = (n: number) =>
  new Date(NOW.getTime() + n * 86400000).toISOString().slice(0, 10);

describe('getStageAging — возраст в стадии + флаг «залипла»', () => {
  test('null-дата → daysInStage null, не stale', () => {
    expect(getStageAging(null, 'working', { now: NOW })).toEqual({ daysInStage: null, isStale: false });
  });

  test('невалидная дата → null, не stale', () => {
    expect(getStageAging('не-дата', 'working', { now: NOW })).toEqual({ daysInStage: null, isStale: false });
  });

  test('сегодня → 0 дней, не stale', () => {
    const a = getStageAging(daysAgo(0), 'attraction', { now: NOW });
    expect(a.daysInStage).toBe(0);
    expect(a.isStale).toBe(false);
  });

  test('attraction: порог 14 — на 14 не stale, на 15 stale', () => {
    expect(getStageAging(daysAgo(14), 'attraction', { now: NOW }).isStale).toBe(false);
    expect(getStageAging(daysAgo(15), 'attraction', { now: NOW }).isStale).toBe(true);
  });

  test('working: порог 21 — на 21 не stale, на 22 stale', () => {
    expect(getStageAging(daysAgo(21), 'working', { now: NOW }).isStale).toBe(false);
    expect(getStageAging(daysAgo(22), 'working', { now: NOW }).isStale).toBe(true);
  });

  test('approval: порог 21', () => {
    expect(getStageAging(daysAgo(21), 'approval', { now: NOW }).isStale).toBe(false);
    expect(getStageAging(daysAgo(22), 'approval', { now: NOW }).isStale).toBe(true);
  });

  test('closing: порог 30 — на 30 не stale, на 31 stale', () => {
    expect(getStageAging(daysAgo(30), 'closing', { now: NOW }).isStale).toBe(false);
    expect(getStageAging(daysAgo(31), 'closing', { now: NOW }).isStale).toBe(true);
  });

  test('неизвестная/пустая phase_group → дефолтный порог 21', () => {
    expect(getStageAging(daysAgo(21), null, { now: NOW }).isStale).toBe(false);
    expect(getStageAging(daysAgo(22), null, { now: NOW }).isStale).toBe(true);
    expect(getStageAging(daysAgo(22), 'wat', { now: NOW }).isStale).toBe(true);
  });
});

// S-R2-DWELL-CFG — порог приезжает из organizations.settings.stage_dwell_defaults.
describe('resolveDwellThreshold — приоритет источников порога', () => {
  test('пустые настройки ⇒ хардкод-фолбэк (контракт обратной совместимости)', () => {
    expect(resolveDwellThreshold('attraction', {})).toBe(14);
    expect(resolveDwellThreshold('working', {})).toBe(21);
    expect(resolveDwellThreshold('approval', {})).toBe(21);
    expect(resolveDwellThreshold('closing', {})).toBe(30);
    expect(resolveDwellThreshold(null, {})).toBe(21);
    expect(resolveDwellThreshold('новая_группа', {})).toBe(21);
  });

  test('настроек нет вовсе (undefined) ⇒ тот же фолбэк', () => {
    expect(resolveDwellThreshold('attraction')).toBe(14);
    expect(resolveDwellThreshold(null)).toBe(21);
  });

  test('значение группы важнее default, default важнее хардкода', () => {
    expect(resolveDwellThreshold('working', { working: 7 })).toBe(7);
    expect(resolveDwellThreshold('working', { default: 5 })).toBe(5);
    expect(resolveDwellThreshold('working', { working: 7, default: 5 })).toBe(7);
  });

  test('default покрывает группу без своего значения, чужая группа не влияет', () => {
    expect(resolveDwellThreshold('approval', { working: 7 })).toBe(21);
    expect(resolveDwellThreshold('новая_группа', { default: 9 })).toBe(9);
    // null-группа не должна ловить ключ '' из настроек
    expect(resolveDwellThreshold(null, { '': 3 })).toBe(21);
  });

  test('undefined-значение ключа проваливается дальше по цепочке, а не в NaN', () => {
    expect(resolveDwellThreshold('working', { working: undefined })).toBe(21);
    expect(resolveDwellThreshold('working', { working: undefined, default: 5 })).toBe(5);
  });
});

describe('getStageAging — пороги организации', () => {
  test('порог из настроек побеждает хардкод', () => {
    // attraction по хардкоду 14 — на 10 днях не stale; с порогом 7 становится stale
    expect(getStageAging(daysAgo(10), 'attraction', { now: NOW }).isStale).toBe(false);
    expect(
      getStageAging(daysAgo(10), 'attraction', { now: NOW, thresholds: { attraction: 7 } }).isStale,
    ).toBe(true);
  });

  test('пустые пороги ⇒ прежнее поведение', () => {
    expect(getStageAging(daysAgo(15), 'attraction', { now: NOW, thresholds: {} }).isStale).toBe(true);
    expect(getStageAging(daysAgo(14), 'attraction', { now: NOW, thresholds: {} }).isStale).toBe(false);
  });

  test('daysInStage не зависит от порога', () => {
    expect(
      getStageAging(daysAgo(40), 'working', { now: NOW, thresholds: { working: 3 } }).daysInStage,
    ).toBe(40);
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
