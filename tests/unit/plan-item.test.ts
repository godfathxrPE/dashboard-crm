import { describe, test, expect } from 'vitest';
import { isPlanItem, excludePlanItems } from '@/lib/domain/plan-item';

describe('isPlanItem', () => {
  test('строка плана = WBS-код + проект', () => {
    expect(isPlanItem({ wbs_code: '1.3', project_id: 'p1' })).toBe(true);
    expect(isPlanItem({ wbs_code: '2.2.11', project_id: 'p1' })).toBe(true);
  });

  test('обычная задача проекта (без кода) строкой плана НЕ считается', () => {
    expect(isPlanItem({ wbs_code: null, project_id: 'p1' })).toBe(false);
  });

  test('личная задача — никогда', () => {
    expect(isPlanItem({ wbs_code: null, project_id: null })).toBe(false);
  });

  test('код без проекта НЕ прячем: другого экрана у такой строки нет', () => {
    // Второй конъюнкт — страховка от невидимки. Доска «План» и Гант живут внутри
    // проекта; спрятав такую задачу из списка, мы стёрли бы её из UI совсем.
    expect(isPlanItem({ wbs_code: '1.1', project_id: null })).toBe(false);
  });

  test('пустой код и пробелы — не код', () => {
    expect(isPlanItem({ wbs_code: '', project_id: 'p1' })).toBe(false);
    expect(isPlanItem({ wbs_code: '   ', project_id: 'p1' })).toBe(false);
  });

  test('отсутствующие поля не роняют предикат', () => {
    expect(isPlanItem({})).toBe(false);
    expect(isPlanItem({ project_id: 'p1' })).toBe(false);
  });
});

describe('excludePlanItems', () => {
  test('оставляет личные и обычные проектные, убирает строки плана', () => {
    const tasks = [
      { id: 'a', wbs_code: null, project_id: null },        // личная
      { id: 'b', wbs_code: '1.1', project_id: 'p1' },       // строка плана
      { id: 'c', wbs_code: null, project_id: 'p1' },        // задача проекта
      { id: 'd', wbs_code: '2.4', project_id: 'p2' },       // строка плана
    ];
    expect(excludePlanItems(tasks).map((t) => t.id)).toEqual(['a', 'c']);
  });

  test('пустой вход — пустой выход, исходный массив не мутируется', () => {
    const tasks = [{ id: 'b', wbs_code: '1.1', project_id: 'p1' }];
    expect(excludePlanItems([])).toEqual([]);
    expect(excludePlanItems(tasks)).toEqual([]);
    expect(tasks).toHaveLength(1);
  });
});
