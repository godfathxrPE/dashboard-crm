import { describe, it, expect } from 'vitest';
import {
  TIMELINE_PAGE_SIZE,
  flattenTimelinePages,
  nextTimelineCursor,
} from '@/lib/timeline/cursor';
import type { TimelineEvent } from '@/types/timeline';

// ═══════════════════════════════════════════════════════
// S-TL-2: курсор и склейка страниц.
//
// Обе функции чистые и живут вне хука ровно поэтому: правило «полная страница →
// есть ещё, неполная → дно» и порядок склейки ломаются молча — лента просто
// перестаёт предлагать «Показать раньше» или начинает показывать дубли.
// ═══════════════════════════════════════════════════════

/** Событие ленты в форме, которую отдаёт `rpcRowToEvent`: id = `${kind}:${uuid}`. */
function ev(n: number, iso: string): TimelineEvent {
  const id = `task:${String(n).padStart(8, '0')}-0000-0000-0000-000000000000`;
  return {
    id,
    sourceId: id.slice('task:'.length),
    kind: 'task',
    title: `Задача ${n}`,
    date: iso,
    icon: 'task',
  };
}

/** Страница из `size` событий, убывающих по дате — как их отдаёт RPC. */
function page(from: number, size: number): TimelineEvent[] {
  return Array.from({ length: size }, (_, i) =>
    ev(from + i, new Date(Date.UTC(2026, 7, 8, 12, 0, 0) - (from + i) * 60_000).toISOString()),
  );
}

describe('nextTimelineCursor — дно ленты', () => {
  it('полная страница → курсор из ПОСЛЕДНЕГО события', () => {
    const p = page(0, TIMELINE_PAGE_SIZE);
    const last = p[p.length - 1];

    expect(nextTimelineCursor(p)).toEqual({ ts: last.date, id: last.id });
  });

  it('неполная страница → дно, следующего запроса нет', () => {
    expect(nextTimelineCursor(page(0, TIMELINE_PAGE_SIZE - 1))).toBeUndefined();
  });

  it('пустая страница → дно (а не курсор из undefined)', () => {
    expect(nextTimelineCursor([])).toBeUndefined();
  });

  it('курсор — ПАРА (ts, id), а не один ts: события одной секунды реальны', () => {
    const same = '2026-08-08T12:00:00.000Z';
    const p = Array.from({ length: TIMELINE_PAGE_SIZE }, (_, i) => ev(i, same));

    // Ровно тот случай, ради которого курсор не может быть одним `ts`: по нему
    // страница «раньше» либо потеряла бы соседей, либо повторила их.
    expect(nextTimelineCursor(p)).toEqual({ ts: same, id: p[TIMELINE_PAGE_SIZE - 1].id });
  });
});

describe('flattenTimelinePages — склейка страниц', () => {
  it('две полные страницы → 100 событий, порядок сохранён, дублей нет', () => {
    const p1 = page(0, TIMELINE_PAGE_SIZE);
    const p2 = page(TIMELINE_PAGE_SIZE, TIMELINE_PAGE_SIZE);

    const all = flattenTimelinePages([p1, p2]);

    expect(all).toHaveLength(2 * TIMELINE_PAGE_SIZE);
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
    // Порядок страниц = порядок запросов; внутри страницы порядок задал SQL.
    expect(all.map((e) => e.id)).toEqual([...p1, ...p2].map((e) => e.id));
    // Ось ленты не разворачивается на стыке страниц.
    const ts = all.map((e) => new Date(e.date).getTime());
    expect(ts.every((v, i) => i === 0 || ts[i - 1] >= v)).toBe(true);
  });

  it('дубль между страницами НЕ склеивается молча — он обязан быть виден', () => {
    // Если серверный keyset разъедется (например, из внутреннего `order by` ветки
    // пропадёт тай-брейк по `id`), страницы пересекутся. Дедуп здесь спрятал бы
    // дефект: лента выглядела бы исправной, теряя события за кадром.
    const p1 = page(0, TIMELINE_PAGE_SIZE);
    const p2 = page(TIMELINE_PAGE_SIZE - 1, TIMELINE_PAGE_SIZE);

    const all = flattenTimelinePages([p1, p2]);
    const ids = all.map((e) => e.id);

    expect(ids).toHaveLength(2 * TIMELINE_PAGE_SIZE);
    expect(new Set(ids).size).toBe(ids.length - 1);
  });

  it('страниц ещё нет → пустая лента, а не бросок', () => {
    expect(flattenTimelinePages(undefined)).toEqual([]);
    expect(flattenTimelinePages([])).toEqual([]);
  });
});
