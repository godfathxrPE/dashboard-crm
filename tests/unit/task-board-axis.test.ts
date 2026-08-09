import { describe, it, expect } from 'vitest';
import {
  BUCKET_ORDER,
  deadlineForBucket,
  taskDateBucket,
  boardColumns,
} from '@/lib/utils/task-view';
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

describe('boardColumns', () => {
  it('возвращает ВСЕ бакеты, включая пустые, в порядке оси', () => {
    const cols = boardColumns([t(null)], WED);
    expect(cols.map((c) => c.bucket)).toEqual([...BUCKET_ORDER]);
    expect(cols.find((c) => c.bucket === 'no_date')!.tasks).toHaveLength(1);
    expect(cols.find((c) => c.bucket === 'today')!.tasks).toHaveLength(0);
  });
});
