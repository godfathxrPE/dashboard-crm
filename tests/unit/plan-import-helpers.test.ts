import { describe, test, expect } from 'vitest';
import { autoDetectPlanMapping, parsePlanDate, parseMilestone, applyPlanMapping } from '@/lib/utils/plan-import-helpers';

describe('autoDetectPlanMapping', () => {
  test('фаза / этап работ → phase', () => {
    expect(autoDetectPlanMapping('Фаза')).toBe('phase');
    expect(autoDetectPlanMapping('Этап работ')).toBe('phase');
    expect(autoDetectPlanMapping('Раздел')).toBe('phase');
  });

  test('задача / наименование работ → taskText', () => {
    expect(autoDetectPlanMapping('Задача')).toBe('taskText');
    expect(autoDetectPlanMapping('Наименование работ')).toBe('taskText');
    expect(autoDetectPlanMapping('Операция')).toBe('taskText');
  });

  test('«Окончание» → end, НЕ start', () => {
    expect(autoDetectPlanMapping('Окончание')).toBe('end');
    expect(autoDetectPlanMapping('Дата окончания')).toBe('end');
    expect(autoDetectPlanMapping('Завершение')).toBe('end');
  });

  test('«Дата начала» / «Старт» → start; «Описание» ≠ start', () => {
    expect(autoDetectPlanMapping('Дата начала')).toBe('start');
    expect(autoDetectPlanMapping('Старт')).toBe('start');
    expect(autoDetectPlanMapping('Описание')).toBe('skip');
  });

  test('короткие токены — только exact: «С»/«По», а «Список» ≠ start', () => {
    expect(autoDetectPlanMapping('С')).toBe('start');
    expect(autoDetectPlanMapping('по')).toBe('end');
    expect(autoDetectPlanMapping('Список')).toBe('skip');
    expect(autoDetectPlanMapping('Поставщик')).toBe('skip');
  });

  test('веха / контрольная точка → milestone', () => {
    expect(autoDetectPlanMapping('Веха')).toBe('milestone');
    expect(autoDetectPlanMapping('Контрольная точка')).toBe('milestone');
    expect(autoDetectPlanMapping('Milestone')).toBe('milestone');
  });

  test('wbs / № / код → wbs', () => {
    expect(autoDetectPlanMapping('WBS')).toBe('wbs');
    expect(autoDetectPlanMapping('№')).toBe('wbs');
    expect(autoDetectPlanMapping('Код')).toBe('wbs');
    expect(autoDetectPlanMapping('Иерархия')).toBe('wbs');
  });

  test('пусто / прочее → skip', () => {
    expect(autoDetectPlanMapping('')).toBe('skip');
    expect(autoDetectPlanMapping('Ответственный')).toBe('skip');
  });
});

describe('parsePlanDate', () => {
  test('Date (cellDates:true) → локальный ключ', () => {
    expect(parsePlanDate(new Date(2026, 6, 20))).toBe('2026-07-20');
  });

  test('Invalid Date → null', () => {
    expect(parsePlanDate(new Date('мусор'))).toBeNull();
  });

  test('дд.мм.гггг → нормализация', () => {
    expect(parsePlanDate('31.12.2026')).toBe('2026-12-31');
    expect(parsePlanDate('1.7.2026')).toBe('2026-07-01');
  });

  test('гггг-мм-дд → как есть (с паддингом)', () => {
    expect(parsePlanDate('2026-07-20')).toBe('2026-07-20');
    expect(parsePlanDate('2026-7-1')).toBe('2026-07-01');
  });

  test('Excel-serial number → конверсия (45658 = 2025-01-01)', () => {
    expect(parsePlanDate(45658)).toBe('2025-01-01');
  });

  test('число вне диапазона дат → null', () => {
    expect(parsePlanDate(5)).toBeNull();
    expect(parsePlanDate(999999)).toBeNull();
  });

  test('мусор / пусто → null', () => {
    expect(parsePlanDate('скоро')).toBeNull();
    expect(parsePlanDate('32.13.2026')).toBeNull();
    expect(parsePlanDate('')).toBeNull();
    expect(parsePlanDate(null)).toBeNull();
    expect(parsePlanDate(undefined)).toBeNull();
  });

  test('«{день недели} ДД.ММ.ГГ» (двузначный год) → нормализация', () => {
    expect(parsePlanDate('Пн 28.07.25')).toBe('2025-07-28');   // день недели + 2-значный год
    expect(parsePlanDate('Чт 29.01.26')).toBe('2026-01-29');
    expect(parsePlanDate('Вт 02.09.25')).toBe('2025-09-02');
    expect(parsePlanDate('28.07.25')).toBe('2025-07-28');       // без дня недели
    expect(parsePlanDate('Пн. 28.07.25')).toBe('2025-07-28');   // с точкой после дня
    // регресс — старые форматы целы:
    expect(parsePlanDate('2026-07-20')).toBe('2026-07-20');
    expect(parsePlanDate('31.12.2026')).toBe('2026-12-31');
    expect(parsePlanDate('мусор')).toBeNull();
    expect(parsePlanDate('99.99.25')).toBeNull();               // невалидные день/месяц
  });
});

describe('parseMilestone', () => {
  test('yes-маркеры → true', () => {
    expect(parseMilestone('да')).toBe(true);
    expect(parseMilestone('Да')).toBe(true);
    expect(parseMilestone('yes')).toBe(true);
    expect(parseMilestone('1')).toBe(true);
    expect(parseMilestone(1)).toBe(true);
    expect(parseMilestone('x')).toBe(true);
    expect(parseMilestone('✓')).toBe(true);
    expect(parseMilestone('веха')).toBe(true);
    expect(parseMilestone(true)).toBe(true);
  });

  test('нет / пусто / прочее → false', () => {
    expect(parseMilestone('нет')).toBe(false);
    expect(parseMilestone('')).toBe(false);
    expect(parseMilestone(null)).toBe(false);
    expect(parseMilestone(0)).toBe(false);
    expect(parseMilestone('обычная')).toBe(false);
  });
});

describe('applyPlanMapping', () => {
  test('собирает строку плана из сырых ячеек', () => {
    const row = ['Фаза 1. Обследование', 'Интервью с ключевыми пользователями', new Date(2026, 6, 20), '31.07.2026', 'да', '1.1'];
    const mapping = { 0: 'phase', 1: 'taskText', 2: 'start', 3: 'end', 4: 'milestone', 5: 'wbs' } as const;
    expect(applyPlanMapping(row, mapping)).toEqual({
      phase: 'Фаза 1. Обследование',
      taskText: 'Интервью с ключевыми пользователями',
      start: '2026-07-20',
      end: '2026-07-31',
      milestone: true,
      wbs: '1.1',
    });
  });

  test('skip-колонки и незамапленные поля → дефолты', () => {
    const row = ['что-то', 'Задача без дат'];
    const mapping = { 0: 'skip', 1: 'taskText' } as const;
    expect(applyPlanMapping(row, mapping)).toEqual({
      phase: '',
      taskText: 'Задача без дат',
      start: null,
      end: null,
      milestone: false,
      wbs: '',
    });
  });
});
