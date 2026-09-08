import { describe, it, expect } from 'vitest';
import { buildDeadlineTrack } from '@/lib/domain/deadline-track';
import { mskDateKey, shiftDateKeyByBuckets } from '@/lib/utils/date-helpers';

// ═══════════════════════════════════════════════════════
// S-DEAL-DEADLINES-1 (W3): окно дедлайнов сегодня−2 … сегодня+12.
//
// `now` всегда аргументом — ни один тест не зависит от часов машины.
// Дедлайны в фикстурах задаются как МОМЕНТЫ (`timestamptz`), а не как даты:
// именно на этом ломается наивный `toISOString().slice(0,10)`.
// ═══════════════════════════════════════════════════════

/** 12:00 МСК 8 сентября 2026 — середина суток, до границ далеко. */
const NOW = new Date('2026-09-08T09:00:00.000Z');
const TODAY = '2026-09-08';

/** Момент внутри дня, сдвинутого на `delta` суток от сегодняшнего (13:00 МСК). */
function deadlineAt(delta: number): string {
  return `${shiftDateKeyByBuckets(TODAY, 'day', delta)}T10:00:00.000Z`;
}

function task(id: string, delta: number | null, lane = 'next') {
  return { id, text: `задача ${id}`, deadline: delta === null ? null : deadlineAt(delta), lane };
}

describe('buildDeadlineTrack — окно и ось', () => {
  it('окно ровно 15 дней: сегодня−2 … сегодня+12', () => {
    const t = buildDeadlineTrack([], null, NOW);
    expect(t.from).toBe('2026-09-06');
    expect(t.to).toBe('2026-09-20');
    expect(t.days).toHaveLength(15);
    expect(t.days[0].key).toBe(t.from);
    expect(t.days[14].key).toBe(t.to);
  });

  it('pct(d) = d / 14 × 100: крайние дни дают 0 и 100, сегодня — todayPct', () => {
    const t = buildDeadlineTrack([], null, NOW);
    expect(t.days[0].pct).toBe(0);
    expect(t.days[14].pct).toBe(100);
    expect(t.days[2].pct).toBe(t.todayPct);
    expect(t.days.filter((d) => d.isToday)).toHaveLength(1);
    expect(t.days[2].isToday).toBe(true);
    expect(t.days[2].key).toBe(mskDateKey(NOW));
  });
});

describe('buildDeadlineTrack — состояния меток', () => {
  it('задача вчера, не готова ⇒ overdue левее колонки «сегодня»', () => {
    const t = buildDeadlineTrack([task('a', -1)], null, NOW);
    expect(t.marks).toHaveLength(1);
    expect(t.marks[0].state).toBe('overdue');
    expect(t.marks[0].pct).toBeLessThan(t.todayPct);
  });

  it('задача вчера с lane done ⇒ в marks её НЕТ (таймлайн не про архив)', () => {
    const t = buildDeadlineTrack([task('a', -1, 'done')], null, NOW);
    expect(t.marks).toHaveLength(0);
    // И в «за окном» она тоже не попадает — её просто нет на этой оси.
    expect(t.outsideCount).toBe(0);
  });

  it('задача сегодня ⇒ today ровно на todayPct', () => {
    const t = buildDeadlineTrack([task('a', 0)], null, NOW);
    expect(t.marks[0].state).toBe('today');
    expect(t.marks[0].pct).toBe(t.todayPct);
  });

  it('lane wait впереди ⇒ waiting, обычная ⇒ ahead', () => {
    const t = buildDeadlineTrack([task('a', 3, 'wait'), task('b', 3)], null, NOW);
    expect(t.marks.find((m) => m.taskId === 'a')?.state).toBe('waiting');
    expect(t.marks.find((m) => m.taskId === 'b')?.state).toBe('ahead');
  });

  it('просроченная в ожидании остаётся overdue — срок важнее «мяч не у нас»', () => {
    const t = buildDeadlineTrack([task('a', -1, 'wait')], null, NOW);
    expect(t.marks[0].state).toBe('overdue');
  });
});

describe('buildDeadlineTrack — границы окна', () => {
  it('дедлайн now+12 попадает и стоит ровно на 100%', () => {
    const t = buildDeadlineTrack([task('a', 12)], null, NOW);
    expect(t.marks).toHaveLength(1);
    expect(t.marks[0].pct).toBe(100);
    expect(t.outsideCount).toBe(0);
  });

  it('дедлайн now+13 не попадает и растит outsideCount', () => {
    const t = buildDeadlineTrack([task('a', 13)], null, NOW);
    expect(t.marks).toHaveLength(0);
    expect(t.outsideCount).toBe(1);
  });

  it('дедлайн now−2 попадает и стоит на 0%', () => {
    const t = buildDeadlineTrack([task('a', -2)], null, NOW);
    expect(t.marks).toHaveLength(1);
    expect(t.marks[0].pct).toBe(0);
    expect(t.outsideCount).toBe(0);
  });

  it('дедлайн now−3 не попадает и растит outsideCount', () => {
    const t = buildDeadlineTrack([task('a', -3)], null, NOW);
    expect(t.marks).toHaveLength(0);
    expect(t.outsideCount).toBe(1);
  });

  it('deadline: null игнорируется молча — счётчики не растут', () => {
    const t = buildDeadlineTrack([task('a', null), task('b', 1)], null, NOW);
    expect(t.marks).toHaveLength(1);
    expect(t.marks[0].taskId).toBe('b');
    expect(t.outsideCount).toBe(0);
  });
});

describe('buildDeadlineTrack — стеки по дню', () => {
  it('три задачи в один день ⇒ stacks содержит запись count: 3', () => {
    const t = buildDeadlineTrack([task('a', 4), task('b', 4), task('c', 4)], null, NOW);
    expect(t.stacks).toHaveLength(1);
    expect(t.stacks[0]).toMatchObject({ dateKey: '2026-09-12', count: 3 });
    expect(t.stacks[0].pct).toBe(t.marks[0].pct);
    // Из marks метки НЕ убираются — что рисовать, решает компонент.
    expect(t.marks).toHaveLength(3);
  });

  it('день с единственной меткой в stacks не попадает', () => {
    const t = buildDeadlineTrack([task('a', 4), task('b', 5)], null, NOW);
    expect(t.stacks).toHaveLength(0);
  });

  it('marks отсортированы хронологически независимо от порядка входа', () => {
    const t = buildDeadlineTrack([task('a', 5), task('b', -1), task('c', 2)], null, NOW);
    expect(t.marks.map((m) => m.taskId)).toEqual(['b', 'c', 'a']);
  });
});

describe('buildDeadlineTrack — норма стадии', () => {
  it('норма внутри окна ⇒ normPct на своём дне', () => {
    const t = buildDeadlineTrack([], '2026-09-13', NOW);
    expect(t.normDateKey).toBe('2026-09-13');
    // 13 сентября — индекс 7 в окне с 6-го: 7/14 × 100.
    expect(t.normPct).toBe(50);
  });

  it('норма ПОЗЖЕ окна ⇒ normPct null, пунктир не рисуется', () => {
    const t = buildDeadlineTrack([], '2026-10-01', NOW);
    expect(t.normPct).toBeNull();
    expect(t.normDateKey).toBeNull();
  });

  it('норма РАНЬШЕ окна ⇒ normPct null, к краю не прижимается', () => {
    const t = buildDeadlineTrack([], '2026-08-01', NOW);
    expect(t.normPct).toBeNull();
    expect(t.normDateKey).toBeNull();
  });

  it('нормы нет вовсе ⇒ null без падения', () => {
    const t = buildDeadlineTrack([], null, NOW);
    expect(t.normPct).toBeNull();
    expect(t.normDateKey).toBeNull();
  });
});

describe('buildDeadlineTrack — граница суток МСК', () => {
  // 23:59 МСК 8 сентября = 20:59Z того же дня. В UTC это ещё 8-е, и наивный
  // slice(0,10) угадал бы. Обратный случай ниже — тот, на котором он врёт.
  it('дедлайн 23:59 МСК остаётся сегодняшним', () => {
    const t = buildDeadlineTrack(
      [{ id: 'a', text: 'вечер', deadline: '2026-09-08T20:59:00.000Z', lane: 'next' }],
      null,
      NOW,
    );
    expect(t.marks[0].dateKey).toBe(TODAY);
    expect(t.marks[0].state).toBe('today');
  });

  it('дедлайн 00:30 МСК 9-го — ЗАВТРА, хотя в UTC ещё 8-е', () => {
    const t = buildDeadlineTrack(
      [{ id: 'a', text: 'ночь', deadline: '2026-09-08T21:30:00.000Z', lane: 'next' }],
      null,
      NOW,
    );
    expect(t.marks[0].dateKey).toBe('2026-09-09');
    expect(t.marks[0].state).toBe('ahead');
  });

  it('«сейчас» в 00:30 МСК даёт окно уже НОВОГО дня', () => {
    // 2026-09-08T21:30Z = 00:30 МСК 9 сентября.
    const t = buildDeadlineTrack([], null, new Date('2026-09-08T21:30:00.000Z'));
    expect(t.days[2].key).toBe('2026-09-09');
    expect(t.from).toBe('2026-09-07');
  });

  it('вечерний дедлайн 23:00 МСК вчера — просрочен, а не «сегодня»', () => {
    // 2026-09-07T20:00Z = 23:00 МСК 7 сентября, то есть вчера.
    const t = buildDeadlineTrack(
      [{ id: 'a', text: 'вчера вечером', deadline: '2026-09-07T20:00:00.000Z', lane: 'next' }],
      null,
      NOW,
    );
    expect(t.marks[0].dateKey).toBe('2026-09-07');
    expect(t.marks[0].state).toBe('overdue');
  });
});
