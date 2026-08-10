import { describe, it, expect } from 'vitest';
import {
  BUCKET_ORDER,
  deadlineForBucket,
  taskDateBucket,
  boardColumns,
} from '@/lib/utils/task-view';
import { mskDayCaption } from '@/lib/utils/date-helpers';
import type { Task } from '@/types/entities';

const t = (deadline: string | null, lane = 'now'): Task =>
  ({ id: 'x', text: 't', deadline, lane } as unknown as Task);

// Опорные дни: будни, суббота, воскресенье (границы схлопывания this_week).
// Полдень МСК — чтобы тест не зависел от часа прогона.
const WED = new Date('2026-08-12T09:00:00Z'); // ср
const SAT = new Date('2026-08-15T09:00:00Z'); // сб
const SUN = new Date('2026-08-16T09:00:00Z'); // вс

describe('deadlineForBucket — round-trip', () => {
  for (const now of [WED, SAT, SUN]) {
    for (const bucket of BUCKET_ORDER) {
      it(`${bucket} @ ${now.toISOString().slice(0, 10)}`, () => {
        const drop = deadlineForBucket(bucket, now);
        if (drop === null) {
          // Недроппабельные: overdue всегда; this_week в сб/вс.
          expect(
            bucket === 'overdue' || (bucket === 'this_week' && now !== WED),
          ).toBe(true);
          return;
        }
        // ГЛАВНЫЙ ИНВАРИАНТ: карточка остаётся в той колонке, куда её бросили.
        expect(taskDateBucket(t(drop.deadline), now)).toBe(bucket);
      });
    }
  }
});

describe('deadlineForBucket — семантика', () => {
  it('no_date очищает срок, а не «не принимает дроп»', () => {
    expect(deadlineForBucket('no_date', WED)).toEqual({ deadline: null });
  });
  it('overdue не принимает дроп', () => {
    expect(deadlineForBucket('overdue', WED)).toBeNull();
  });
  it('this_week схлопывается в сб и вс', () => {
    expect(deadlineForBucket('this_week', SAT)).toBeNull();
    expect(deadlineForBucket('this_week', SUN)).toBeNull();
    expect(deadlineForBucket('this_week', WED)).not.toBeNull();
  });
  it('later строго дальше this_week', () => {
    const week = deadlineForBucket('this_week', WED)!.deadline!;
    const later = deadlineForBucket('later', WED)!.deadline!;
    expect(later > week).toBe(true);
  });
});

describe('устойчивость к протухшему now (S-TASKS-BOARD-2)', () => {
  it('вчерашний now пишет вчерашний конец дня — поэтому часы читаются при дропе', () => {
    const yesterday = new Date('2026-08-11T09:00:00Z');
    const today = new Date('2026-08-12T09:00:00Z');
    const stale = deadlineForBucket('today', yesterday)!.deadline!;
    // Документирующий тест: именно это и уехало бы в БД, если бы `now` брался
    // пропом из рендера. Проверяем ПРИЧИНУ, а не обходной путь.
    expect(taskDateBucket({ deadline: stale, lane: 'now' } as Task, today)).toBe('overdue');
    const fresh = deadlineForBucket('today', today)!.deadline!;
    expect(taskDateBucket({ deadline: fresh, lane: 'now' } as Task, today)).toBe('today');
  });
});

describe('mskDayCaption', () => {
  it('день берётся по МСК, а не по локали браузера', () => {
    // 21:30 UTC = 00:30 МСК следующих суток — граница, на которой врёт local.
    expect(mskDayCaption('2026-08-11T21:30:00.000Z')).toBe('12 авг');
  });
  it('weekday добавляет день недели и не оставляет точку', () => {
    expect(mskDayCaption('2026-08-09T09:00:00.000Z', { weekday: true })).toBe('вс, 9 авг');
  });
});

describe('boardColumns', () => {
  it('возвращает ВСЕ бакеты, включая пустые, в порядке оси', () => {
    const cols = boardColumns([t(null)], WED);
    expect(cols.map((c) => c.bucket)).toEqual([...BUCKET_ORDER]);
    expect(cols.find((c) => c.bucket === 'no_date')!.tasks).toHaveLength(1);
    expect(cols.find((c) => c.bucket === 'today')!.tasks).toHaveLength(0);
  });
});
