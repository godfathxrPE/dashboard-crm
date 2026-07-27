/**
 * Golden-фикстуры для TS-порта `wf_eval_conditions` (S-R2-TRANSITION-1a).
 *
 * КОНТРАКТ ФАЙЛА. `GOLDEN_FIXTURES` — не просто набор ассертов, а ЭТАЛОН,
 * который обязан давать одинаковый ответ в двух реализациях:
 *   • TS — `wfEvalConditions` (src/lib/domain/wf-conditions.ts);
 *   • SQL — `public.wf_eval_conditions(jsonb, jsonb)` (миграция 050, §4).
 *
 * Кросс-прогон против БД — по одной фикстуре (read-only: функция IMMUTABLE, ничего
 * не пишет и не DEFINER):
 *   select public.wf_eval_conditions('<conds>'::jsonb, '<row>'::jsonb);
 * Массовый прогон удобно собирать через `unnest` двух массивов литералов — так он
 * и выполнялся при сдаче спринта (все фикстуры совпали).
 *
 * Правка любой ветки вычислителя без прогона фикстур против SQL — это ровно тот
 * разъезд двух реализаций, ради которого файл и существует.
 */

import { describe, it, expect } from 'vitest';
import { wfEvalConditions, type WfRow } from '@/lib/domain/wf-conditions';

interface Fixture {
  name: string;
  conds: unknown;
  row: WfRow;
  expected: boolean;
}

export const GOLDEN_FIXTURES: Fixture[] = [
  // ── вырожденные предикаты ────────────────────────────────────────────────
  { name: 'пустой массив → матчим всё', conds: [], row: { budget: 1 }, expected: true },
  { name: 'null-предикат → матчим всё', conds: null, row: { budget: 1 }, expected: true },
  { name: 'не-массив (объект) → матчим всё', conds: { a: 1 }, row: {}, expected: true },

  // ── is_null / not_null ───────────────────────────────────────────────────
  { name: 'is_null: поле отсутствует', conds: [{ field: 'budget', op: 'is_null' }], row: {}, expected: true },
  { name: 'is_null: поле = null', conds: [{ field: 'budget', op: 'is_null' }], row: { budget: null }, expected: true },
  { name: 'is_null: поле заполнено', conds: [{ field: 'budget', op: 'is_null' }], row: { budget: 100 }, expected: false },
  { name: 'not_null: поле заполнено', conds: [{ field: 'budget', op: 'not_null' }], row: { budget: 100 }, expected: true },
  { name: 'not_null: поле = null', conds: [{ field: 'budget', op: 'not_null' }], row: { budget: null }, expected: false },
  // Пустая строка — НЕ null: гейт стадии её отбраковывает через btrim, предикат — нет.
  { name: 'not_null: пустая строка проходит', conds: [{ field: 'next_step', op: 'not_null' }], row: { next_step: '' }, expected: true },

  // ── eq / neq — это IS DISTINCT FROM, сравнение по тексту ─────────────────
  { name: 'eq: строки равны', conds: [{ field: 'status', op: 'eq', value: 'won' }], row: { status: 'won' }, expected: true },
  { name: 'eq: строки различны', conds: [{ field: 'status', op: 'eq', value: 'won' }], row: { status: 'open' }, expected: false },
  { name: 'eq: число vs текст числа', conds: [{ field: 'budget', op: 'eq', value: '100' }], row: { budget: 100 }, expected: true },
  { name: 'eq: число value, число row', conds: [{ field: 'budget', op: 'eq', value: 100 }], row: { budget: 100 }, expected: true },
  { name: 'eq: 100 не равно 100.0 (сравнение текстовое!)', conds: [{ field: 'budget', op: 'eq', value: '100.0' }], row: { budget: 100 }, expected: false },
  { name: 'eq: null row vs null value → равны', conds: [{ field: 'status', op: 'eq' }], row: { status: null }, expected: true },
  { name: 'eq: null row vs заданный value', conds: [{ field: 'status', op: 'eq', value: 'won' }], row: { status: null }, expected: false },
  { name: 'neq: различны → проходит', conds: [{ field: 'status', op: 'neq', value: 'won' }], row: { status: 'open' }, expected: true },
  { name: 'neq: равны → не проходит', conds: [{ field: 'status', op: 'neq', value: 'won' }], row: { status: 'won' }, expected: false },
  { name: 'neq: оба null → не проходит', conds: [{ field: 'status', op: 'neq' }], row: { status: null }, expected: false },
  { name: 'eq: boolean row как текст', conds: [{ field: 'is_won', op: 'eq', value: 'true' }], row: { is_won: true }, expected: true },

  // ── contains ─────────────────────────────────────────────────────────────
  { name: 'contains: подстрока есть', conds: [{ field: 'name', op: 'contains', value: 'ERP' }], row: { name: 'Внедрение ERP' }, expected: true },
  { name: 'contains: подстроки нет', conds: [{ field: 'name', op: 'contains', value: 'IIoT' }], row: { name: 'Внедрение ERP' }, expected: false },
  { name: 'contains: регистрозависим', conds: [{ field: 'name', op: 'contains', value: 'erp' }], row: { name: 'Внедрение ERP' }, expected: false },
  { name: 'contains: row = null → не проходит', conds: [{ field: 'name', op: 'contains', value: 'ERP' }], row: { name: null }, expected: false },
  // Квирк SQL: position(NULL in rv) = NULL → ветка return false не берётся.
  { name: 'contains: value отсутствует → КЛАУЗА ПРОХОДИТ (квирк SQL)', conds: [{ field: 'name', op: 'contains' }], row: { name: 'Внедрение ERP' }, expected: true },

  // ── числовые сравнения ───────────────────────────────────────────────────
  { name: 'gt: 200 > 100', conds: [{ field: 'budget', op: 'gt', value: '100' }], row: { budget: 200 }, expected: true },
  { name: 'gt: 100 > 100 ложно', conds: [{ field: 'budget', op: 'gt', value: '100' }], row: { budget: 100 }, expected: false },
  { name: 'gte: 100 >= 100', conds: [{ field: 'budget', op: 'gte', value: '100' }], row: { budget: 100 }, expected: true },
  { name: 'lt: 50 < 100', conds: [{ field: 'budget', op: 'lt', value: '100' }], row: { budget: 50 }, expected: true },
  { name: 'lte: 100 <= 100', conds: [{ field: 'budget', op: 'lte', value: '100' }], row: { budget: 100 }, expected: true },
  { name: 'gt: числовое, а не текстовое сравнение (9 vs 100)', conds: [{ field: 'budget', op: 'gt', value: '100' }], row: { budget: 9 }, expected: false },
  { name: 'gt: дробные', conds: [{ field: 'probability', op: 'gt', value: '0.5' }], row: { probability: 0.75 }, expected: true },
  { name: 'gt: row = null → не проходит', conds: [{ field: 'budget', op: 'gt', value: '100' }], row: { budget: null }, expected: false },
  // Каст рушит ВЕСЬ предикат (exception на уровне функции), не только свою клаузу.
  { name: 'gt: нечисловой row → весь предикат false', conds: [{ field: 'budget', op: 'gt', value: '100' }], row: { budget: 'много' }, expected: false },
  {
    name: 'битый каст роняет и соседние клаузы',
    conds: [{ field: 'status', op: 'eq', value: 'open' }, { field: 'budget', op: 'gt', value: 'abc' }],
    row: { status: 'open', budget: 200 },
    expected: false,
  },
  // v = NULL → сравнение NULL → клауза проходит (тот же квирк, что у contains).
  { name: 'gt: value отсутствует → КЛАУЗА ПРОХОДИТ (квирк SQL)', conds: [{ field: 'budget', op: 'gt' }], row: { budget: 200 }, expected: true },

  // ── неизвестные op / field ───────────────────────────────────────────────
  { name: 'неизвестный оператор → false', conds: [{ field: 'budget', op: 'between', value: '1' }], row: { budget: 5 }, expected: false },
  { name: 'op отсутствует → false', conds: [{ field: 'budget' }], row: { budget: 5 }, expected: false },
  { name: 'неизвестное поле + not_null → false', conds: [{ field: 'nope', op: 'not_null' }], row: { budget: 5 }, expected: false },
  { name: 'неизвестное поле + is_null → true', conds: [{ field: 'nope', op: 'is_null' }], row: { budget: 5 }, expected: true },

  // ── AND-семантика ────────────────────────────────────────────────────────
  {
    name: 'AND: обе клаузы истинны',
    conds: [{ field: 'status', op: 'eq', value: 'open' }, { field: 'budget', op: 'gt', value: '100' }],
    row: { status: 'open', budget: 200 },
    expected: true,
  },
  {
    name: 'AND: вторая клауза ложна',
    conds: [{ field: 'status', op: 'eq', value: 'open' }, { field: 'budget', op: 'gt', value: '100' }],
    row: { status: 'open', budget: 50 },
    expected: false,
  },
];

describe('wfEvalConditions — golden-фикстуры (зеркало SQL wf_eval_conditions)', () => {
  for (const f of GOLDEN_FIXTURES) {
    it(f.name, () => {
      expect(wfEvalConditions(f.conds, f.row)).toBe(f.expected);
    });
  }
});

describe('wfEvalConditions — устойчивость', () => {
  it('клауза-не-объект не роняет вычислитель', () => {
    expect(wfEvalConditions(['мусор'], { budget: 1 })).toBe(false);
  });

  it('null-клауза не роняет вычислитель', () => {
    expect(wfEvalConditions([null], { budget: 1 })).toBe(false);
  });

  it('пустая строка не проходит каст в numeric', () => {
    expect(wfEvalConditions([{ field: 'budget', op: 'gt', value: '100' }], { budget: '' })).toBe(false);
  });
});
