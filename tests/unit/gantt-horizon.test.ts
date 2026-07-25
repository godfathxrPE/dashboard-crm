import { describe, it, expect } from 'vitest';
import { computeHorizon, type HorizonItem } from '@/lib/utils/gantt-schedule';

// S-GANTT-BASELINE-1: горизонт оси расширяется спанами выбранного слепка — но только
// по переданным (видимым) задачам, чтобы фильтры не сбрасывались.
const t = (id: string, start: string, end: string): HorizonItem => ({ id, start, end });
const plan = (entries: [string, { start: string; end: string }][]) => new Map(entries);

describe('computeHorizon', () => {
  it('нет задач → null (ветку today±N решает вызывающий)', () => {
    expect(computeHorizon([], null)).toBeNull();
    expect(computeHorizon([], plan([['A', { start: '2026-01-01', end: '2026-01-02' }]]))).toBeNull();
  });

  it('без слепка → границы строго по спанам задач', () => {
    const tasks = [t('A', '2026-08-05', '2026-08-10'), t('B', '2026-08-03', '2026-08-08')];
    expect(computeHorizon(tasks, null)).toEqual({ min: '2026-08-03', max: '2026-08-10' });
  });

  it('план внутри оси → границы не меняются', () => {
    const tasks = [t('A', '2026-08-05', '2026-08-10')];
    const p = plan([['A', { start: '2026-08-06', end: '2026-08-09' }]]);
    expect(computeHorizon(tasks, p)).toEqual({ min: '2026-08-05', max: '2026-08-10' });
  });

  it('план левее min → min расширяется до плана', () => {
    const tasks = [t('A', '2026-08-05', '2026-08-10')];
    const p = plan([['A', { start: '2026-08-01', end: '2026-08-03' }]]);
    expect(computeHorizon(tasks, p)).toEqual({ min: '2026-08-01', max: '2026-08-10' });
  });

  it('план правее max → max расширяется до плана', () => {
    const tasks = [t('A', '2026-08-05', '2026-08-10')];
    const p = plan([['A', { start: '2026-08-12', end: '2026-08-15' }]]);
    expect(computeHorizon(tasks, p)).toEqual({ min: '2026-08-05', max: '2026-08-15' });
  });

  it('задача без записи в слепке → учитывается только её собственный спан', () => {
    // A в слепке (уехала вперёд), B — нет; ось расширяет только план A, спан B как есть.
    const tasks = [t('A', '2026-08-05', '2026-08-06'), t('B', '2026-08-07', '2026-08-09')];
    const p = plan([['A', { start: '2026-08-01', end: '2026-08-02' }]]);
    expect(computeHorizon(tasks, p)).toEqual({ min: '2026-08-01', max: '2026-08-09' });
  });
});
