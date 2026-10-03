import { describe, it, expect } from 'vitest';
import {
  FIELD_GROUP_WINDOW_MS,
  attachStageComments,
  buildDayRows,
  collapseFieldChanges,
  fieldChangeLines,
  formatClock,
  formatShortDate,
  formatShortDateTime,
  groupByDay,
  splitPlanned,
  type FeedRow,
} from '@/lib/timeline/feed-model';
import type { TimelineEvent, TimelineKind } from '@/types/timeline';

// S-NOTES-2.1. Раскладка ленты сделки: зоны, дни, склейка правок полей, привязка
// комментария к смене стадии. Чистые функции — время фиксировано аргументом `now`.
//
// Даты собраны ЛОКАЛЬНЫМИ конструкторами: границы суток в ленте считаются по локальному
// времени (как `relativeTime`), и тест, привязанный к UTC, краснел бы в другом поясе.

/** 3 октября 2026, 15:00 по локальному времени. */
const NOW = new Date(2026, 9, 3, 15, 0).getTime();

const at = (y: number, mo: number, d: number, h = 12, mi = 0, s = 0) =>
  new Date(y, mo - 1, d, h, mi, s).toISOString();

let seq = 0;
function ev(kind: TimelineKind, date: string, over: Partial<TimelineEvent> = {}): TimelineEvent {
  seq += 1;
  const id = over.id ?? `${kind}:${seq}`;
  return { id, sourceId: id, kind, title: `${kind} ${seq}`, date, icon: kind, ...over };
}

const task = (date: string, status: 'done' | 'pending' | 'overdue') =>
  ev('task', date, { status });
const fieldEdit = (date: string, actorId: string, changes?: TimelineEvent['changes']) =>
  ev('activity', date, { eventType: 'project_updated', actorId, ...(changes ? { changes } : {}) });
const stageEvent = (date: string, actorId: string, toStageId?: string) =>
  ev('activity', date, {
    eventType: 'stage_changed',
    actorId,
    ...(toStageId ? { stage: { toStageId, toName: 'Подготовка КП', fromName: 'Квалификация' } } : {}),
  });
const stageComment = (date: string, actorId: string, toStageId?: string) =>
  ev('note', date, {
    body: 'Бюджет подтверждён',
    noteKind: 'stage_comment',
    actorId,
    ...(toStageId ? { noteMeta: { toStageId } } : {}),
  });

describe('splitPlanned', () => {
  it('задача pending в будущем → planned', () => {
    const t = task(at(2026, 10, 6), 'pending');
    const { planned, history } = splitPlanned([t], NOW);
    expect(planned).toEqual([t]);
    expect(history).toEqual([]);
  });

  it('просроченная задача → planned и первая, любая дата', () => {
    const future = task(at(2026, 10, 5), 'pending');
    const overdue = task(at(2026, 9, 20), 'overdue');
    const { planned } = splitPlanned([future, overdue], NOW);
    expect(planned.map((e) => e.id)).toEqual([overdue.id, future.id]);
  });

  it('задача done → history', () => {
    const t = task(at(2026, 10, 2), 'done');
    const { planned, history } = splitPlanned([t], NOW);
    expect(planned).toEqual([]);
    expect(history).toEqual([t]);
  });

  it('встреча вчера → history, встреча завтра → planned', () => {
    const past = ev('meeting', at(2026, 10, 2, 14));
    const next = ev('meeting', at(2026, 10, 4, 11));
    const { planned, history } = splitPlanned([next, past], NOW);
    expect(planned).toEqual([next]);
    expect(history).toEqual([past]);
  });

  it('встреча ровно сейчас → planned (граница включена: `>= now`)', () => {
    const m = ev('meeting', new Date(NOW).toISOString());
    expect(splitPlanned([m], NOW).planned).toEqual([m]);
  });

  it('звонок завтра → history', () => {
    const c = ev('call', at(2026, 10, 4, 11), { status: 'pending' });
    const { planned, history } = splitPlanned([c], NOW);
    expect(planned).toEqual([]);
    expect(history).toEqual([c]);
  });

  it('history сохраняет порядок ленты (ts desc), planned — по дате вверх', () => {
    const n1 = ev('note', at(2026, 10, 3, 10));
    const n2 = ev('note', at(2026, 10, 2, 10));
    const t1 = task(at(2026, 10, 9), 'pending');
    const t2 = task(at(2026, 10, 5), 'pending');
    const { planned, history } = splitPlanned([t1, n1, t2, n2], NOW);
    expect(history.map((e) => e.id)).toEqual([n1.id, n2.id]);
    expect(planned.map((e) => e.id)).toEqual([t2.id, t1.id]);
  });
});

describe('groupByDay', () => {
  it('сегодня / вчера / 30 сентября / прошлый год → четыре группы с метками', () => {
    const today = ev('note', at(2026, 10, 3, 10));
    const yesterday = ev('note', at(2026, 10, 2, 16));
    const sep = ev('note', at(2026, 9, 30, 11));
    const lastYear = ev('note', at(2025, 9, 30, 11));
    const groups = groupByDay([today, yesterday, sep, lastYear], NOW);
    expect(groups.map((g) => g.label)).toEqual([
      'Сегодня, 3 октября',
      'Вчера, 2 октября',
      '30 сентября',
      '30 сентября 2025',
    ]);
    expect(groups.map((g) => g.items.length)).toEqual([1, 1, 1, 1]);
  });

  it('граница суток по локальному времени: 00:10 сегодня — «Сегодня», 23:50 вчера — «Вчера»', () => {
    const justAfter = ev('note', at(2026, 10, 3, 0, 10));
    const justBefore = ev('note', at(2026, 10, 2, 23, 50));
    const groups = groupByDay([justAfter, justBefore], NOW);
    expect(groups.map((g) => g.label)).toEqual(['Сегодня, 3 октября', 'Вчера, 2 октября']);
  });

  it('события одного дня — одна группа, порядок элементов как во входе', () => {
    const a = ev('note', at(2026, 10, 3, 14));
    const b = ev('call', at(2026, 10, 3, 9));
    const [g] = groupByDay([a, b], NOW);
    expect(g.items.map((e) => e.id)).toEqual([a.id, b.id]);
  });

  it('ключ группы — локальная дата, пустой вход — пустой результат', () => {
    expect(groupByDay([], NOW)).toEqual([]);
    expect(groupByDay([ev('note', at(2026, 10, 3, 14))], NOW)[0].key).toBe('2026-10-03');
  });

  it('смена года на границе: 31 декабря прошлого года в январе — с годом', () => {
    const jan = new Date(2027, 0, 5, 12).getTime();
    const dec = ev('note', at(2026, 12, 31, 12));
    expect(groupByDay([dec], jan)[0].label).toBe('31 декабря 2026');
  });

  it('вчера через границу месяца: 1 октября → «Вчера, 30 сентября»', () => {
    const oct1 = new Date(2026, 9, 1, 12).getTime();
    const sep30 = ev('note', at(2026, 9, 30, 18));
    expect(groupByDay([sep30], oct1)[0].label).toBe('Вчера, 30 сентября');
  });
});

describe('collapseFieldChanges', () => {
  const rows = (events: TimelineEvent[]): FeedRow[] =>
    events.map((event) => ({ type: 'event', event }));

  it('3 правки одного автора за 4 минуты → одна группа count=3', () => {
    const e1 = fieldEdit(at(2026, 10, 3, 10, 4), 'u1', { budget: { from: 1, to: 2 } });
    const e2 = fieldEdit(at(2026, 10, 3, 10, 2), 'u1', { next_step: { from: 'a', to: 'b' } });
    const e3 = fieldEdit(at(2026, 10, 3, 10, 0), 'u1', { owner_id: { from_name: 'А', to_name: 'Б' } });
    const out = collapseFieldChanges(rows([e1, e2, e3]));
    expect(out).toHaveLength(1);
    const g = out[0];
    expect(g.type).toBe('fields');
    if (g.type !== 'fields') return;
    expect(g.count).toBe(3);
    expect(g.items.map((e) => e.id)).toEqual([e1.id, e2.id, e3.id]);
    // подписи — от старой правки к новой, с заглавной
    expect(g.labels).toEqual(['Ответственный', 'Следующий шаг', 'Бюджет']);
  });

  it('правка другого автора между ними рвёт группу', () => {
    const a1 = fieldEdit(at(2026, 10, 3, 10, 4), 'u1');
    const b = fieldEdit(at(2026, 10, 3, 10, 3), 'u2');
    const a2 = fieldEdit(at(2026, 10, 3, 10, 2), 'u1');
    const out = collapseFieldChanges(rows([a1, b, a2]));
    expect(out.map((r) => r.type)).toEqual(['event', 'event', 'event']);
  });

  it('одиночная правка не группируется', () => {
    const e = fieldEdit(at(2026, 10, 3, 10, 0), 'u1');
    expect(collapseFieldChanges(rows([e]))).toEqual([{ type: 'event', event: e }]);
  });

  it('смена стадии не входит в группу и рвёт её', () => {
    const e1 = fieldEdit(at(2026, 10, 3, 10, 4), 'u1');
    const st = stageEvent(at(2026, 10, 3, 10, 3), 'u1');
    const e2 = fieldEdit(at(2026, 10, 3, 10, 2), 'u1');
    const e3 = fieldEdit(at(2026, 10, 3, 10, 1), 'u1');
    const out = collapseFieldChanges(rows([e1, st, e2, e3]));
    expect(out.map((r) => r.type)).toEqual(['event', 'event', 'fields']);
    const last = out[2];
    expect(last.type === 'fields' && last.count).toBe(2);
  });

  it('любая другая строка между правками рвёт группу', () => {
    const e1 = fieldEdit(at(2026, 10, 3, 10, 4), 'u1');
    const note = ev('note', at(2026, 10, 3, 10, 3), { actorId: 'u1' });
    const e2 = fieldEdit(at(2026, 10, 3, 10, 2), 'u1');
    expect(collapseFieldChanges(rows([e1, note, e2])).map((r) => r.type)).toEqual([
      'event',
      'event',
      'event',
    ]);
  });

  it('окно 10 минут от первой правки группы: 11-я минута — уже новая строка', () => {
    const e1 = fieldEdit(at(2026, 10, 3, 10, 10), 'u1');
    const e2 = fieldEdit(at(2026, 10, 3, 10, 5), 'u1');
    const e3 = fieldEdit(at(2026, 10, 3, 9, 59), 'u1');
    const out = collapseFieldChanges(rows([e1, e2, e3]));
    expect(out.map((r) => r.type)).toEqual(['fields', 'event']);
    expect(FIELD_GROUP_WINDOW_MS).toBe(10 * 60 * 1000);
  });

  it('повторяющаяся подпись поля в группе не дублируется', () => {
    const e1 = fieldEdit(at(2026, 10, 3, 10, 2), 'u1', { budget: { from: 2, to: 3 } });
    const e2 = fieldEdit(at(2026, 10, 3, 10, 1), 'u1', { budget: { from: 1, to: 2 } });
    const [g] = collapseFieldChanges(rows([e1, e2]));
    expect(g.type === 'fields' && g.labels).toEqual(['Бюджет']);
  });

  it('прочие записи журнала (задача создана) в группу не попадают', () => {
    const t1 = ev('activity', at(2026, 10, 3, 10, 2), { eventType: 'task_created', actorId: 'u1' });
    const t2 = ev('activity', at(2026, 10, 3, 10, 1), { eventType: 'task_created', actorId: 'u1' });
    expect(collapseFieldChanges(rows([t1, t2])).map((r) => r.type)).toEqual(['event', 'event']);
  });
});

describe('fieldChangeLines', () => {
  it('по ключам changes: «Бюджет: … → …»; без changes — готовый заголовок', () => {
    const withChanges = fieldEdit(at(2026, 10, 3, 10), 'u1', {
      owner_id: { from: 'u-1', to: 'u-2', from_name: 'Сергей', to_name: 'Олег' },
    });
    expect(fieldChangeLines(withChanges)).toEqual(['Ответственный: Сергей → Олег']);
    const legacy = ev('activity', at(2026, 10, 3, 10), { eventType: 'project_updated', title: 'Обновлено: бюджет' });
    expect(fieldChangeLines(legacy)).toEqual(['Обновлено: бюджет']);
  });
});

describe('attachStageComments', () => {
  it('комментарий с toStageId = стадии события → прикреплён и из списка ушёл', () => {
    const stage = stageEvent(at(2026, 10, 2, 16, 20, 0), 'u1', 'stage-b');
    const comment = stageComment(at(2026, 10, 2, 16, 20, 2), 'u1', 'stage-b');
    const out = attachStageComments([comment, stage]);
    expect(out).toHaveLength(1);
    const row = out[0];
    expect(row.type === 'event' && row.event).toBe(stage);
    expect(row.type === 'event' && row.stageComment).toBe(comment);
  });

  it('другая стадия по id → не пара, даже внутри окна времени', () => {
    const stage = stageEvent(at(2026, 10, 2, 16, 20, 0), 'u1', 'stage-b');
    const comment = stageComment(at(2026, 10, 2, 16, 20, 2), 'u1', 'stage-c');
    const out = attachStageComments([comment, stage]);
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.type === 'event' && r.stageComment === undefined)).toBe(true);
  });

  it('без пары комментарий остаётся отдельной заметкой', () => {
    const stage = stageEvent(at(2026, 10, 2, 16, 20), 'u1', 'stage-b');
    const alone = stageComment(at(2026, 10, 1, 9, 0), 'u1', 'stage-b');
    const out = attachStageComments([stage, alone]);
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual({ type: 'event', event: alone });
  });

  it('чужой автор не цепляется', () => {
    const stage = stageEvent(at(2026, 10, 2, 16, 20), 'u1', 'stage-b');
    const other = stageComment(at(2026, 10, 2, 16, 20, 5), 'u2', 'stage-b');
    expect(attachStageComments([stage, other])).toHaveLength(2);
  });

  it('без ids — запасное окно ±2 минуты', () => {
    const stage = stageEvent(at(2026, 10, 2, 16, 20, 0), 'u1');
    const inWindow = stageComment(at(2026, 10, 2, 16, 21, 30), 'u1');
    expect(attachStageComments([stage, inWindow])).toHaveLength(1);

    const outside = stageComment(at(2026, 10, 2, 16, 23, 0), 'u1');
    expect(attachStageComments([stage, outside])).toHaveLength(2);
  });

  it('два перехода подряд — каждый получает свой комментарий', () => {
    const s2 = stageEvent(at(2026, 10, 2, 16, 25, 0), 'u1', 'stage-c');
    const c2 = stageComment(at(2026, 10, 2, 16, 25, 1), 'u1', 'stage-c');
    const s1 = stageEvent(at(2026, 10, 2, 16, 20, 0), 'u1', 'stage-b');
    const c1 = stageComment(at(2026, 10, 2, 16, 20, 1), 'u1', 'stage-b');
    const out = attachStageComments([c2, s2, c1, s1]);
    expect(out).toHaveLength(2);
    const [r2, r1] = out;
    expect(r2.type === 'event' && r2.stageComment).toBe(c2);
    expect(r1.type === 'event' && r1.stageComment).toBe(c1);
  });

  it('два перехода подряд без ids: пары по ближайшему времени, а не «первый подошёл»', () => {
    const s2 = stageEvent(at(2026, 10, 2, 16, 21, 0), 'u1');
    const c2 = stageComment(at(2026, 10, 2, 16, 21, 1), 'u1');
    const s1 = stageEvent(at(2026, 10, 2, 16, 20, 0), 'u1');
    const c1 = stageComment(at(2026, 10, 2, 16, 20, 1), 'u1');
    const out = attachStageComments([c2, s2, c1, s1]);
    const [r2, r1] = out;
    expect(r2.type === 'event' && r2.stageComment).toBe(c2);
    expect(r1.type === 'event' && r1.stageComment).toBe(c1);
  });

  it('обычная заметка рядом со стадией не прикрепляется: только kind=stage_comment', () => {
    const stage = stageEvent(at(2026, 10, 2, 16, 20, 0), 'u1', 'stage-b');
    const plain = ev('note', at(2026, 10, 2, 16, 20, 1), { actorId: 'u1', noteKind: 'note' });
    expect(attachStageComments([plain, stage])).toHaveLength(2);
  });

  it('легаси stage_change (без имён) тоже принимает комментарий по окну', () => {
    const legacy = ev('activity', at(2026, 10, 2, 16, 20, 0), { eventType: 'stage_change', actorId: 'u1' });
    const comment = stageComment(at(2026, 10, 2, 16, 20, 3), 'u1');
    const out = attachStageComments([comment, legacy]);
    expect(out).toHaveLength(1);
  });
});

describe('buildDayRows', () => {
  it('привязывает комментарий, затем склеивает правки полей', () => {
    const stage = stageEvent(at(2026, 10, 3, 12, 0, 0), 'u1', 'stage-b');
    const comment = stageComment(at(2026, 10, 3, 12, 0, 2), 'u1', 'stage-b');
    const f1 = fieldEdit(at(2026, 10, 3, 11, 0), 'u1');
    const f2 = fieldEdit(at(2026, 10, 3, 10, 58), 'u1');
    const out = buildDayRows([comment, stage, f1, f2]);
    expect(out.map((r) => r.type)).toEqual(['event', 'fields']);
  });
});

describe('подписи времени', () => {
  it('formatClock — локальное HH:MM с нулями', () => {
    expect(formatClock(at(2026, 10, 3, 9, 5))).toBe('09:05');
    expect(formatClock(at(2026, 10, 3, 16, 56))).toBe('16:56');
  });

  it('formatShortDate — «2 окт»; год только чужой', () => {
    expect(formatShortDate(at(2026, 10, 2), NOW)).toBe('2 окт');
    expect(formatShortDate(at(2025, 12, 31), NOW)).toBe('31 дек 2025');
    expect(formatShortDateTime(at(2026, 10, 2, 16, 56), NOW)).toBe('2 окт, 16:56');
  });
});
