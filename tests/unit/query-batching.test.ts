import { describe, it, expect } from 'vitest';
import { IN_BATCH, chunkForIn, fetchInBatches } from '@/lib/utils/query-batching';

// S-DEBT-TRUTH-1: границы `.in()` — пустой список роняет PostgREST (W3 из 068),
// длинный упирается в лимит длины URL.

describe('chunkForIn', () => {
  it('пустой вход → ноль батчей (ни одного запроса)', () => {
    expect(chunkForIn([])).toEqual([]);
  });

  it('список короче лимита едет одним батчем', () => {
    expect(chunkForIn(['a', 'b', 'c'])).toEqual([['a', 'b', 'c']]);
  });

  it('ровно лимит — всё ещё один батч, без пустого хвоста', () => {
    const ids = Array.from({ length: IN_BATCH }, (_, i) => i);
    const batches = chunkForIn(ids);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(IN_BATCH);
  });

  it('длинный список режется без потерь и без дублей', () => {
    const ids = Array.from({ length: IN_BATCH * 2 + 7 }, (_, i) => i);
    const batches = chunkForIn(ids);
    expect(batches).toHaveLength(3);
    expect(batches[2]).toHaveLength(7);
    expect(batches.flat()).toEqual(ids);
  });

  it('размер батча ≥ 1 — иначе бесконечный цикл, а не пустой результат', () => {
    expect(() => chunkForIn([1, 2], 0)).toThrow();
  });
});

describe('fetchInBatches', () => {
  it('пустой список не зовёт fetch ни разу', async () => {
    let calls = 0;
    const out = await fetchInBatches<string, string>([], async (b) => {
      calls += 1;
      return b;
    });
    expect(calls).toBe(0);
    expect(out).toEqual([]);
  });

  it('склеивает результат батчей в порядке батчей', async () => {
    const ids = [1, 2, 3, 4, 5];
    const seen: number[][] = [];
    const out = await fetchInBatches(
      ids,
      async (batch) => {
        seen.push(batch);
        return batch.map((n) => `row-${n}`);
      },
      2,
    );
    expect(seen).toEqual([[1, 2], [3, 4], [5]]);
    expect(out).toEqual(['row-1', 'row-2', 'row-3', 'row-4', 'row-5']);
  });

  it('ошибка батча пробрасывается — глотание решает вызывающий', async () => {
    await expect(
      fetchInBatches([1, 2, 3], async (batch) => {
        if (batch.includes(3)) throw new Error('boom');
        return batch;
      }, 2),
    ).rejects.toThrow('boom');
  });
});
