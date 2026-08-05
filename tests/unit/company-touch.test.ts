import { describe, it, expect } from 'vitest';
import {
  aggregateTeamTouch,
  aggregateContactStrength,
  WHO_KNOWS_LIMIT,
} from '@/lib/domain/company-touch';

// ═══════════════════════════════════════════════════════
// S-UI-CLARITY-1 — агрегации, кормящие Company 360.
//
// «Сейчас» фиксировано параметром, поэтому кейсы детерминированы без моков
// таймера. NOW взят полуднем — граница «сегодня/завтра» у встреч календарная
// (`localDateKey`), и полдень держит её вдали от полуночи в любой TZ прогона.
// ═══════════════════════════════════════════════════════

const NOW = new Date('2026-08-05T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();
const daysAhead = (n: number) => new Date(NOW.getTime() + n * 86400000).toISOString();

const call = (over: Partial<{ date: string; created_by: string | null; status: string }> = {}) => ({
  date: daysAgo(1),
  created_by: 'u1',
  status: 'done',
  ...over,
});

const meeting = (over: Partial<{ date: string; created_by: string | null }> = {}) => ({
  date: daysAgo(1),
  created_by: 'u1',
  ...over,
});

describe('aggregateTeamTouch — последнее касание компании', () => {
  it('pending-звонок не считается касанием', () => {
    const r = aggregateTeamTouch([call({ status: 'pending', date: daysAhead(2) })], [], NOW);
    expect(r.lastTouch).toBeNull();
    expect(r.whoKnows).toEqual([]);
  });

  it('прошедший pending (забыли отметить) касанием тоже не становится', () => {
    const r = aggregateTeamTouch([call({ status: 'pending', date: daysAgo(3) })], [], NOW);
    expect(r.lastTouch).toBeNull();
  });

  it('встреча сегодня — касание, встреча завтра — нет', () => {
    const today = aggregateTeamTouch([], [meeting({ date: NOW.toISOString() })], NOW);
    expect(today.lastTouch).toMatchObject({ kind: 'meeting' });

    const tomorrow = aggregateTeamTouch([], [meeting({ date: daysAhead(1) })], NOW);
    expect(tomorrow.lastTouch).toBeNull();
  });

  it('касание старше 90 дней не попадает в whoKnows, но остаётся lastTouch', () => {
    const r = aggregateTeamTouch([call({ date: daysAgo(200), created_by: 'u9' })], [], NOW);
    expect(r.lastTouch?.date).toBe(daysAgo(200));
    expect(r.whoKnows).toEqual([]);
  });

  it('created_by = null не создаёт записи в whoKnows (но касанием остаётся)', () => {
    const r = aggregateTeamTouch([call({ created_by: null })], [], NOW);
    expect(r.lastTouch).toMatchObject({ kind: 'call', actorId: null });
    expect(r.whoKnows).toEqual([]);
  });

  it('lastTouch — самое свежее из звонков и встреч, независимо от порядка входа', () => {
    const r = aggregateTeamTouch(
      [call({ date: daysAgo(10) })],
      [meeting({ date: daysAgo(2) })],
      NOW,
    );
    expect(r.lastTouch).toMatchObject({ kind: 'meeting', date: daysAgo(2) });
  });

  it('whoKnows: тай-брейк по свежести при равном количестве касаний', () => {
    const r = aggregateTeamTouch(
      [
        call({ created_by: 'stale', date: daysAgo(80) }),
        call({ created_by: 'stale', date: daysAgo(70) }),
        call({ created_by: 'fresh', date: daysAgo(30) }),
        call({ created_by: 'fresh', date: daysAgo(3) }),
      ],
      [],
      NOW,
    );
    expect(r.whoKnows.map((w) => w.actorId)).toEqual(['fresh', 'stale']);
    expect(r.whoKnows[0]).toMatchObject({ count: 2, lastAt: daysAgo(3) });
  });

  it('whoKnows не длиннее трёх и отсортирован по числу касаний', () => {
    const calls = [
      ...Array.from({ length: 4 }, () => call({ created_by: 'a', date: daysAgo(5) })),
      ...Array.from({ length: 3 }, () => call({ created_by: 'b', date: daysAgo(5) })),
      ...Array.from({ length: 2 }, () => call({ created_by: 'c', date: daysAgo(5) })),
      call({ created_by: 'd', date: daysAgo(5) }),
    ];
    const r = aggregateTeamTouch(calls, [], NOW);
    expect(r.whoKnows).toHaveLength(WHO_KNOWS_LIMIT);
    expect(r.whoKnows.map((w) => w.actorId)).toEqual(['a', 'b', 'c']);
  });

  it('пустой вход — пустой результат, не бросается', () => {
    expect(aggregateTeamTouch([], [], NOW)).toEqual({ lastTouch: null, whoKnows: [] });
  });
});

describe('aggregateContactStrength — сила отношений', () => {
  const C = 'c1';

  it('контакт без касаний остаётся в карте: score 0, band cold', () => {
    const r = aggregateContactStrength([C], [], [], [], NOW);
    expect(r.get(C)).toEqual({ strength: { score: 0, band: 'cold' }, lastTouch: null });
  });

  it('будущий pending-звонок даёт hasUpcoming, но не касание', () => {
    const withUpcoming = aggregateContactStrength(
      [C],
      [
        { contact_id: C, date: daysAgo(10), status: 'done' },
        { contact_id: C, date: daysAhead(3), status: 'pending' },
      ],
      [],
      [],
      NOW,
    );
    const withoutUpcoming = aggregateContactStrength(
      [C],
      [{ contact_id: C, date: daysAgo(10), status: 'done' }],
      [],
      [],
      NOW,
    );
    // Разница ровно в 10 очках `upcoming` — касание в обоих случаях одно и то же.
    expect(withUpcoming.get(C)!.strength.score - withoutUpcoming.get(C)!.strength.score).toBe(10);
    expect(withUpcoming.get(C)!.lastTouch).toEqual({ kind: 'call', date: daysAgo(10) });
  });

  it('прошедший pending — ни касание, ни upcoming', () => {
    const r = aggregateContactStrength(
      [C],
      [{ contact_id: C, date: daysAgo(2), status: 'pending' }],
      [],
      [],
      NOW,
    );
    expect(r.get(C)).toEqual({ strength: { score: 0, band: 'cold' }, lastTouch: null });
  });

  it('встреча сегодня — касание, завтра — upcoming', () => {
    const today = aggregateContactStrength([C], [], [{ contact_id: C, date: NOW.toISOString() }], [], NOW);
    expect(today.get(C)!.lastTouch).toMatchObject({ kind: 'meeting' });

    const tomorrow = aggregateContactStrength([C], [], [{ contact_id: C, date: daysAhead(1) }], [], NOW);
    // Касания не было → жёсткий ноль, даже с запланированной встречей.
    expect(tomorrow.get(C)).toEqual({ strength: { score: 0, band: 'cold' }, lastTouch: null });
  });

  it('касание старше 90 дней не идёт в touches90d, но остаётся lastTouch', () => {
    const r = aggregateContactStrength(
      [C],
      [{ contact_id: C, date: daysAgo(200), status: 'done' }],
      [],
      [],
      NOW,
    );
    const s = r.get(C)!;
    expect(s.lastTouch).toEqual({ kind: 'call', date: daysAgo(200) });
    // recency 0 (>60 дн) + frequency 0 (вне окна) + upcoming 0
    expect(s.strength).toEqual({ score: 0, band: 'cold' });
  });

  it('касания чужого контакта не протекают в запрошенный', () => {
    const r = aggregateContactStrength(
      [C],
      [
        { contact_id: 'other', date: daysAgo(1), status: 'done' },
        { contact_id: null, date: daysAgo(1), status: 'done' },
      ],
      [],
      [],
      NOW,
    );
    expect(r.get(C)!.lastTouch).toBeNull();
    expect(r.has('other')).toBe(false);
  });

  it('незакрытая задача с будущим дедлайном даёт upcoming', () => {
    const r = aggregateContactStrength(
      [C],
      [{ contact_id: C, date: daysAgo(1), status: 'done' }],
      [],
      [{ contact_id: C }],
      NOW,
    );
    // recency 50 (сутки ≈ 48.8 → округление вверх на границе) + frequency 5 + upcoming 10
    expect(r.get(C)!.strength.score).toBeGreaterThanOrEqual(60);
    expect(r.get(C)!.strength.band).toBe('warm');
  });

  it('частые свежие касания дают band strong', () => {
    const calls = Array.from({ length: 6 }, (_, i) => ({
      contact_id: C,
      date: daysAgo(i + 1),
      status: 'done',
    }));
    const s = aggregateContactStrength([C], calls, [], [], NOW).get(C)!;
    expect(s.strength.band).toBe('strong');
    expect(s.lastTouch).toEqual({ kind: 'call', date: daysAgo(1) });
  });
});
