import { describe, it, expect } from 'vitest';
import { locate, moveFocus, moveTarget, type BoardColumns } from '@/lib/domain/board-nav';
import { BUCKET_ORDER, type DateBucket } from '@/lib/utils/task-view';
import type { Task } from '@/types/entities';

// Опорные дни — те же, что в task-board-axis.test.ts: ось у доски одна.
const WED = new Date('2026-08-12T09:00:00Z'); // ср — this_week жив
const SUN = new Date('2026-08-16T09:00:00Z'); // вс — this_week схлопнут

const task = (id: string): Task => ({ id, text: id, deadline: null, lane: 'now' } as unknown as Task);

/** Набор колонок в порядке оси; значение записи — сколько карточек в бакете.
 *  id карточек — `${bucket}-${row}`, чтобы падение теста читалось без отладки. */
function cols(sizes: Partial<Record<DateBucket, number>>): BoardColumns {
  return BUCKET_ORDER.map((bucket) => ({
    bucket,
    tasks: Array.from({ length: sizes[bucket] ?? 0 }, (_, i) => task(`${bucket}-${i}`)),
  }));
}

describe('locate', () => {
  it('находит координату карточки', () => {
    const c = cols({ today: 2, later: 3 });
    expect(locate(c, 'later-2')).toEqual({ col: 4, row: 2 });
  });
  it('null для карточки вне набора и для пустого фокуса', () => {
    const c = cols({ today: 2 });
    expect(locate(c, 'нет-такой')).toBeNull();
    expect(locate(c, null)).toBeNull();
  });
});

describe('moveFocus — точка входа', () => {
  it('без фокуса — первая карточка первой НЕПУСТОЙ колонки', () => {
    // overdue пуст, значит вход в today: пустые колонки точкой входа не бывают.
    const c = cols({ today: 2, later: 1 });
    for (const dir of ['up', 'down', 'left', 'right'] as const) {
      expect(moveFocus(c, null, dir)).toBe('today-0');
    }
  });
  it('фокус выпал из набора (задачу удалили) — тоже вход в первую карточку', () => {
    expect(moveFocus(cols({ later: 1 }), 'уже-нет', 'down')).toBe('later-0');
  });
  it('доска пуста — null', () => {
    expect(moveFocus(cols({}), null, 'down')).toBeNull();
  });
});

describe('moveFocus — вертикаль принадлежит колонке', () => {
  const c = cols({ today: 3, tomorrow: 5 });

  it('down идёт вниз по своей колонке', () => {
    expect(moveFocus(c, 'today-0', 'down')).toBe('today-1');
  });
  it('down на ПОСЛЕДНЕЙ строке колонки — null, а НЕ перескок в соседнюю', () => {
    expect(moveFocus(c, 'today-2', 'down')).toBeNull();
  });
  it('up на первой строке — null', () => {
    expect(moveFocus(c, 'today-0', 'up')).toBeNull();
  });
});

describe('moveFocus — горизонталь', () => {
  it('right перескакивает ПУСТЫЕ колонки и приземляется в следующую непустую', () => {
    // today(2) · tomorrow пуст · this_week пуст · later(2)
    const c = cols({ today: 2, later: 2 });
    expect(moveFocus(c, 'today-0', 'right')).toBe('later-0');
  });
  it('right с длинной строки на короткую колонку — клампится, а не undefined', () => {
    const c = cols({ no_date: 0, today: 40, later: 3 });
    expect(moveFocus(c, 'today-39', 'right')).toBe('later-2');
  });
  it('left с длинной строки на короткую колонку — тоже клампится', () => {
    const c = cols({ today: 3, no_date: 40 });
    expect(moveFocus(c, 'no_date-39', 'left')).toBe('today-2');
  });
  it('справа непустых колонок нет — остаёмся (null)', () => {
    const c = cols({ today: 2 });
    expect(moveFocus(c, 'today-1', 'right')).toBeNull();
  });
});

describe('moveTarget — перенос карточки Shift+H/L', () => {
  const full = cols({ overdue: 1, today: 1, tomorrow: 1, this_week: 1, later: 1, no_date: 1 });

  it('из no_date влево — later (ср)', () => {
    expect(moveTarget(full, 'no_date-0', 'left', WED)).toEqual({
      taskId: 'no_date-0',
      bucket: 'later',
    });
  });

  it('из tomorrow влево — today (вс)', () => {
    expect(moveTarget(full, 'tomorrow-0', 'left', SUN)).toEqual({
      taskId: 'tomorrow-0',
      bucket: 'today',
    });
  });

  it('из tomorrow вправо в ВОСКРЕСЕНЬЕ — later: схлопнутая this_week пропущена', () => {
    // Главный кейс пропуска недроппабельного: в вс `deadlineForBucket('this_week')`
    // === null, и цель обязана уехать на колонку дальше, а не «никуда».
    expect(moveTarget(full, 'tomorrow-0', 'right', SUN)).toEqual({
      taskId: 'tomorrow-0',
      bucket: 'later',
    });
    // В среду тот же шаг останавливается на this_week — она принимает дроп.
    expect(moveTarget(full, 'tomorrow-0', 'right', WED)).toEqual({
      taskId: 'tomorrow-0',
      bucket: 'this_week',
    });
  });

  it('из today влево — null: слева только overdue, он не цель никогда', () => {
    expect(moveTarget(full, 'today-0', 'left', WED)).toBeNull();
    expect(moveTarget(full, 'today-0', 'left', SUN)).toBeNull();
  });

  it('из overdue вправо — today: просрочку разбирают вправо', () => {
    expect(moveTarget(full, 'overdue-0', 'right', WED)).toEqual({
      taskId: 'overdue-0',
      bucket: 'today',
    });
  });

  it('пустая колонка цели не мешает: перенос — это запись срока, не переход фокуса', () => {
    const c = cols({ no_date: 1 });
    expect(moveTarget(c, 'no_date-0', 'left', WED)).toEqual({
      taskId: 'no_date-0',
      bucket: 'later',
    });
  });

  it('id, которого нет в наборе, — null', () => {
    expect(moveTarget(full, 'нет-такой', 'left', WED)).toBeNull();
    expect(moveTarget(full, null, 'left', WED)).toBeNull();
  });

  it('fromBucket ведёт шаг от ещё не отрисованной колонки (быстрый повтор клавиши)', () => {
    // Набор колонок приходит в хук через рендер. Два нажатия внутри одного
    // кадра видят карточку всё ещё в no_date — без `fromBucket` оба дали бы
    // later, то есть два PATCH с одним днём. Смок S-TASKS-BOARD-2 это поймал.
    expect(moveTarget(full, 'no_date-0', 'left', WED)!.bucket).toBe('later');
    expect(moveTarget(full, 'no_date-0', 'left', WED, 'later')!.bucket).toBe('this_week');
    expect(moveTarget(full, 'no_date-0', 'left', WED, 'this_week')!.bucket).toBe('tomorrow');
    expect(moveTarget(full, 'no_date-0', 'left', WED, 'tomorrow')!.bucket).toBe('today');
    // Упор в край считается от намерения, а не от отрисованной колонки.
    expect(moveTarget(full, 'no_date-0', 'left', WED, 'today')).toBeNull();
  });

  it('fromBucket пропускает недроппабельные так же, как обычный шаг (вс)', () => {
    expect(moveTarget(full, 'today-0', 'right', SUN, 'tomorrow')!.bucket).toBe('later');
  });

  it('из no_date влево четырьмя шагами доходит до today (разбор без мыши, ср)', () => {
    // Цепочка из смока п.3: later → this_week → tomorrow → today.
    const chain: DateBucket[] = [];
    let id = 'no_date-0';
    let set = full;
    for (let i = 0; i < 4; i++) {
      const t = moveTarget(set, id, 'left', WED)!;
      chain.push(t.bucket);
      // Имитируем результат записи: карточка переехала в колонку цели.
      set = set.map((c) => ({
        ...c,
        tasks:
          c.bucket === t.bucket
            ? [...c.tasks, task(id)]
            : c.tasks.filter((x) => x.id !== id),
      }));
    }
    expect(chain).toEqual(['later', 'this_week', 'tomorrow', 'today']);
    expect(locate(set, id)!.col).toBe(BUCKET_ORDER.indexOf('today'));
  });
});
