import { describe, it, expect } from 'vitest';
import {
  groupTranscripts,
  transcriptGroupKey,
  type GroupableTranscript,
} from '@/lib/domain/transcript-grouping';

// S-TR-CREATE-1. Десять фрагментов одного звонка — одна строка списка с чипом «+9»,
// а не десять равноправных строк.

const row = (id: string, entityId: string, createdAt: string, entityType = 'call'): GroupableTranscript => ({
  id, entityId, entityType, createdAt,
});

const EMPTY = new Set<string>();

describe('groupTranscripts', () => {
  it('группа из одной строки — обычная строка без чипа', () => {
    const out = groupTranscripts([row('t1', 'c1', '2026-08-01T10:00:00Z')], EMPTY);
    expect(out).toHaveLength(1);
    expect(out[0].childCount).toBe(0);
    expect(out[0].isChild).toBe(false);
  });

  it('главная строка группы — самая свежая, остальные считаются в childCount', () => {
    const out = groupTranscripts(
      [
        row('t1', 'c1', '2026-08-01T10:00:00Z'),
        row('t2', 'c1', '2026-08-03T10:00:00Z'),
        row('t3', 'c1', '2026-08-02T10:00:00Z'),
      ],
      EMPTY,
    );
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('t2');
    expect(out[0].childCount).toBe(2);
  });

  it('раскрытая группа отдаёт вложенные строки сразу за главной, свежие выше', () => {
    const rows = [
      row('t1', 'c1', '2026-08-01T10:00:00Z'),
      row('t2', 'c1', '2026-08-03T10:00:00Z'),
      row('t3', 'c1', '2026-08-02T10:00:00Z'),
    ];
    const out = groupTranscripts(rows, new Set([transcriptGroupKey(rows[0])]));
    expect(out.map((r) => r.id)).toEqual(['t2', 't3', 't1']);
    expect(out.slice(1).every((r) => r.isChild)).toBe(true);
    // Чип «+N» есть только у главной: у вложенных своих детей нет.
    expect(out.slice(1).every((r) => r.childCount === 0)).toBe(true);
  });

  it('звонок и встреча с одинаковым id — разные группы', () => {
    const out = groupTranscripts(
      [
        row('t1', 'same', '2026-08-01T10:00:00Z', 'call'),
        row('t2', 'same', '2026-08-02T10:00:00Z', 'meeting'),
      ],
      EMPTY,
    );
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.childCount === 0)).toBe(true);
  });

  it('expandAll раскрывает все группы — поиск не прячет совпавшие строки', () => {
    const out = groupTranscripts(
      [
        row('t1', 'c1', '2026-08-01T10:00:00Z'),
        row('t2', 'c1', '2026-08-02T10:00:00Z'),
        row('t3', 'c2', '2026-08-03T10:00:00Z'),
        row('t4', 'c2', '2026-08-04T10:00:00Z'),
      ],
      EMPTY,
      { expandAll: true },
    );
    expect(out).toHaveLength(4);
    expect(out.filter((r) => r.isChild).map((r) => r.id)).toEqual(['t1', 't3']);
  });

  it('порядок групп — по позиции их первой строки в исходном списке', () => {
    const out = groupTranscripts(
      [
        row('t1', 'c2', '2026-08-05T10:00:00Z'),
        row('t2', 'c1', '2026-08-04T10:00:00Z'),
        row('t3', 'c2', '2026-08-01T10:00:00Z'),
      ],
      EMPTY,
    );
    expect(out.map((r) => r.id)).toEqual(['t1', 't2']);
  });

  it('пустой вход — пустой выход', () => {
    expect(groupTranscripts([], EMPTY)).toEqual([]);
  });
});
