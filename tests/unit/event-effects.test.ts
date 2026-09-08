import { describe, it, expect } from 'vitest';
import {
  resolveEventEffects,
  EVENT_EFFECT_WINDOW_MS,
  type EffectSource,
} from '@/lib/domain/event-effects';

// S-DEAL-EVENT-1. Связь «событие → изменённые поля» эвристическая: окно и актор.
// Проверяется именно эвристика — не форматирование строк (его держит
// `describeChange` в `activity-events` и его собственные тесты), а правила, по
// которым изменение считается или НЕ считается следствием.

const ACTOR = 'actor-1';
const OTHER_ACTOR = 'actor-2';

/** Момент якоря фиксирован: окно считается ОТ НЕГО, текущее время в правило не входит. */
const ANCHOR_AT = '2026-09-08T10:00:00.000Z';

function at(offsetMs: number): string {
  return new Date(Date.parse(ANCHOR_AT) + offsetMs).toISOString();
}

function anchor(over: Partial<EffectSource> = {}): EffectSource {
  return {
    id: 'activity:anchor',
    at: ANCHOR_AT,
    actorId: ACTOR,
    eventType: 'call_logged',
    ...over,
  };
}

function change(over: Partial<EffectSource> = {}): EffectSource {
  return {
    id: 'activity:change-1',
    at: at(30_000),
    actorId: ACTOR,
    eventType: 'project_updated',
    changes: { next_step: { from: 'Позвонить', to: 'Прислать КП' } },
    ...over,
  };
}

describe('resolveEventEffects', () => {
  it('изменение через 30 сек тем же актором — одно следствие', () => {
    const r = resolveEventEffects(anchor(), [change()], EVENT_EFFECT_WINDOW_MS);

    expect(r.effects).toHaveLength(1);
    expect(r.effects[0].field).toBe('next_step');
    // Текст — ровно то, что печатает лента по этим же данным.
    expect(r.effects[0].text).toBe('Следующий шаг: Позвонить → Прислать КП');
    expect(r.more).toBe(0);
  });

  it('изменение через 30 сек ДРУГИМ актором — следствий нет', () => {
    const r = resolveEventEffects(
      anchor(),
      [change({ actorId: OTHER_ACTOR })],
      EVENT_EFFECT_WINDOW_MS,
    );

    expect(r.effects).toEqual([]);
    expect(r.more).toBe(0);
  });

  it('кандидат без актора (триггер, cron) — следствием не считается', () => {
    const r = resolveEventEffects(
      anchor(),
      [change({ actorId: null })],
      EVENT_EFFECT_WINDOW_MS,
    );

    expect(r.effects).toEqual([]);
  });

  it('якорь без актора — следствий нет, даже если кандидат тоже без актора', () => {
    // ⚠️ Смысл теста: `null === null` не должен читаться как «совпал актор».
    const r = resolveEventEffects(
      anchor({ actorId: null }),
      [change({ actorId: null })],
      EVENT_EFFECT_WINDOW_MS,
    );

    expect(r.effects).toEqual([]);
  });

  it('изменение через 10 минут при окне 5 — за окном, следствий нет', () => {
    const r = resolveEventEffects(
      anchor(),
      [change({ at: at(10 * 60_000) })],
      EVENT_EFFECT_WINDOW_MS,
    );

    expect(r.effects).toEqual([]);
  });

  it('изменение ДО события — не следствие, а причина', () => {
    const r = resolveEventEffects(
      anchor(),
      [change({ at: at(-30_000) })],
      EVENT_EFFECT_WINDOW_MS,
    );

    expect(r.effects).toEqual([]);
  });

  it('пять изменений в окне — три следствия и more: 2', () => {
    const many: EffectSource[] = [
      { ...change(), id: 'c1', at: at(10_000), changes: { next_step: { from: 'a', to: 'b' } } },
      { ...change(), id: 'c2', at: at(20_000), changes: { budget: { from: '100', to: '200' } } },
      { ...change(), id: 'c3', at: at(30_000), changes: { name: { from: 'x', to: 'y' } } },
      { ...change(), id: 'c4', at: at(40_000), changes: { description: { from: 'p', to: 'q' } } },
      { ...change(), id: 'c5', at: at(50_000), changes: { priority: { from: '1', to: '2' } } },
    ];

    const r = resolveEventEffects(anchor(), many, EVENT_EFFECT_WINDOW_MS);

    expect(r.effects).toHaveLength(3);
    // Между записями порядок — по времени, а не по порядку в массиве.
    expect(r.effects.map((e) => e.field)).toEqual(['next_step', 'budget', 'name']);
    expect(r.more).toBe(2);
  });

  it('запись без changes (журнал до 087) — следствий нет и ничего не падает', () => {
    const r = resolveEventEffects(
      anchor(),
      [change({ changes: undefined })],
      EVENT_EFFECT_WINDOW_MS,
    );

    expect(r.effects).toEqual([]);
    expect(r.more).toBe(0);
  });

  it('два поля в одном changes — два следствия из одной записи', () => {
    const r = resolveEventEffects(
      anchor(),
      [
        change({
          changes: {
            next_step: { from: 'Позвонить', to: 'Прислать КП' },
            next_action_date: { from: '2026-09-01', to: '2026-09-02' },
          },
        }),
      ],
      EVENT_EFFECT_WINDOW_MS,
    );

    expect(r.effects.map((e) => e.field)).toEqual(['next_step', 'next_action_date']);
    expect(r.effects[1].text).toBe('Дата шага: 1 сент. → 2 сент.');
  });

  it('сам якорь среди кандидатов — себя следствием не считает', () => {
    // Отсев по `id`, не по времени: у якоря `at` совпадает с ним самим, но
    // совпадение времени бывает и у настоящего кандидата.
    const self: EffectSource = {
      ...anchor(),
      changes: { next_step: { from: 'a', to: 'b' } },
    };

    const r = resolveEventEffects(anchor(), [self], EVENT_EFFECT_WINDOW_MS);

    expect(r.effects).toEqual([]);
  });

});
