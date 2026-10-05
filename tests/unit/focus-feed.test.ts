import { describe, it, expect } from 'vitest';
import { countBuckets, feedBucket, filterFeed, type FeedBucket } from '@/lib/domain/focus-feed';
import type { TimelineEvent } from '@/types/timeline';

// «Сейчас» фиксировано аргументом: 04.10.2026 12:00 МСК.
const NOW = new Date('2026-10-04T09:00:00.000Z');

type Ev = Pick<TimelineEvent, 'id' | 'kind' | 'eventType' | 'noteKind' | 'date'>;

function ev(id: string, kind: TimelineEvent['kind'], date: string, extra: Partial<Ev> = {}): Ev {
  return { id, kind, date, ...extra };
}

describe('feedBucket', () => {
  it('смена стадии — stage', () => {
    expect(feedBucket({ kind: 'activity', eventType: 'stage_changed' })).toBe('stage');
  });

  it('легаси stage_change — stage, как в ленте карточки сделки', () => {
    expect(feedBucket({ kind: 'activity', eventType: 'stage_change' })).toBe('stage');
  });

  it('комментарий перехода — stage, а не note', () => {
    expect(feedBucket({ kind: 'note', noteKind: 'stage_comment' })).toBe('stage');
  });

  it('обычная заметка — note', () => {
    expect(feedBucket({ kind: 'note', noteKind: 'note' })).toBe('note');
    expect(feedBucket({ kind: 'note' })).toBe('note');
  });

  it('звонок — call', () => {
    expect(feedBucket({ kind: 'call' })).toBe('call');
  });

  it('встреча, задача, правка полей — other', () => {
    const kinds: [TimelineEvent['kind'], string | null][] = [
      ['meeting', null],
      ['task', null],
      ['activity', 'project_updated'],
    ];
    for (const [kind, eventType] of kinds) {
      expect(feedBucket({ kind, eventType })).toBe<FeedBucket>('other');
    }
  });
});

// По убыванию даты — как отдаёт RPC.
const EVENTS: Ev[] = [
  ev('future-note', 'note', '2026-10-05T09:00:00.000Z'),
  ev('note-today', 'note', '2026-10-04T08:00:00.000Z'),
  // 01:30 МСК 4 октября — по UTC это ещё 3-е.
  ev('call-night', 'call', '2026-10-03T22:30:00.000Z'),
  ev('stage-0929', 'activity', '2026-09-29T10:00:00.000Z', { eventType: 'stage_changed' }),
  ev('note-0929', 'note', '2026-09-29T07:00:00.000Z'),
  ev('meeting-0929', 'meeting', '2026-09-29T06:00:00.000Z'),
  ev('note-0920', 'note', '2026-09-20T09:00:00.000Z'),
];
const ids = (xs: readonly Ev[]) => xs.map((e) => e.id);

describe('filterFeed', () => {
  it('событие позже now исключено при любом фильтре', () => {
    expect(ids(filterFeed(EVENTS, { bucket: 'all', day: null }, NOW))).not.toContain('future-note');
    expect(ids(filterFeed(EVENTS, { bucket: 'note', day: null }, NOW))).not.toContain('future-note');
    expect(ids(filterFeed(EVENTS, { bucket: 'all', day: '2026-10-05' }, NOW))).toEqual([]);
  });

  it('bucket: note — только заметки, порядок исходный', () => {
    expect(ids(filterFeed(EVENTS, { bucket: 'note', day: null }, NOW))).toEqual([
      'note-today',
      'note-0929',
      'note-0920',
    ]);
  });

  it('day — события этого дня по МСК', () => {
    expect(ids(filterFeed(EVENTS, { bucket: 'all', day: '2026-09-29' }, NOW))).toEqual([
      'stage-0929',
      'note-0929',
      'meeting-0929',
    ]);
  });

  it('2026-10-03T22:30Z попадает в 2026-10-04 по МСК, не в 2026-10-03', () => {
    expect(ids(filterFeed(EVENTS, { bucket: 'all', day: '2026-10-04' }, NOW))).toEqual(['note-today', 'call-night']);
    expect(ids(filterFeed(EVENTS, { bucket: 'all', day: '2026-10-03' }, NOW))).toEqual([]);
  });

  it('bucket и day вместе — пересечение', () => {
    expect(ids(filterFeed(EVENTS, { bucket: 'note', day: '2026-09-29' }, NOW))).toEqual(['note-0929']);
    expect(ids(filterFeed(EVENTS, { bucket: 'call', day: '2026-09-29' }, NOW))).toEqual([]);
  });
});

describe('countBuckets', () => {
  it('сумма по видам равна all', () => {
    const c = countBuckets(EVENTS, NOW);
    expect(c.note + c.call + c.stage + c.other).toBe(c.all);
    expect(c).toEqual({ all: 6, note: 3, call: 1, stage: 1, other: 1 });
  });

  it('будущие события не считаются', () => {
    const c = countBuckets([ev('f', 'call', '2026-10-04T09:00:00.001Z')], NOW);
    expect(c).toEqual({ all: 0, note: 0, call: 0, stage: 0, other: 0 });
  });
});
