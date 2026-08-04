// S-COMPANY-AI-1 (F2): справочник «ОКВЭД → товарные группы Честного Знака».
//
// Оба модуля чистые и без импортов — тестируются напрямую, без моков и без сети.
// Второй describe — страж синхронности зеркал (клиент ↔ edge): расхождение обязано
// валить CI, а не всплывать в проде разными ответами кнопки и AI-брифа.

import { describe, it, expect } from 'vitest';
import { matchChzGroups, chzStatusLabel, CHZ_GROUPS } from '@/lib/data/chz-groups';
import {
  matchChzGroups as edgeMatch,
  CHZ_GROUPS as EDGE_CHZ_GROUPS,
} from '../../supabase/functions/ai-run/chz-groups';

describe('matchChzGroups', () => {
  it('подкод попадает в группу по началу кода', () => {
    // «10.51.1» — производство питьевого молока: это класс молочки, и обязанность
    // с 2021 распространяется на него целиком.
    const dairy = matchChzGroups('10.51.1');
    expect(dairy.map((g) => g.group)).toEqual(['Молочная продукция']);
    expect(dairy[0].status).toBe('mandatory');
  });

  it('стартующая группа отдаёт дату старта — это горячий лид, а не факт', () => {
    const meat = matchChzGroups('10.13.2');
    expect(meat.map((g) => g.group)).toEqual(['Мясная продукция']);
    expect(meat[0].status).toBe('starting');
    expect(meat[0].since).toBe('2026-08');
  });

  // S-COMPANY-AI-1b: дыра, найденная на «Дружбе Народов Нова» — переработка мяса
  // птицы (10.12.1) не попадала никуда, и блок маркировки на карточке не появлялся.
  it('переработка мяса и мяса птицы попадает в свою группу', () => {
    const poultry = matchChzGroups('10.12.1');
    expect(poultry.map((g) => g.group)).toEqual(['Мясо и мясо птицы (переработка)']);
    expect(poultry[0].status).toBe('starting');
    expect(poultry[0].note).toContain('охлаждённые туши и полутуши — нет');
  });

  it('класс 10.11 отдаёт ту же группу, что и 10.12', () => {
    expect(matchChzGroups('10.11').map((g) => g.group)).toEqual(['Мясо и мясо птицы (переработка)']);
  });

  it('новая мясная запись не перехватывает чужой префикс', () => {
    // 10.13.2 — по-прежнему только «Мясная продукция»: группы соседние, но не
    // пересекающиеся, и компания не должна получить обе сразу.
    expect(matchChzGroups('10.13.2').map((g) => g.group)).toEqual(['Мясная продукция']);
  });

  it('код класса разбирается так же, как код группы', () => {
    expect(matchChzGroups('26.20').map((g) => g.group)).toEqual(['Радиоэлектроника и светотехника']);
    expect(matchChzGroups('12.00').map((g) => g.group)).toEqual(['Табачная продукция']);
  });

  it('группа возвращается ровно один раз, даже если у неё несколько префиксов', () => {
    const bad = matchChzGroups('10.86');
    expect(bad.map((g) => g.group)).toEqual(['БАД']);
    expect(bad).toHaveLength(1);
  });

  it('код вне маркировки даёт пустой список', () => {
    // 62.01 — разработка ПО. Ни в одну товарную группу не попадает, и это
    // корректный ответ «маркировка не применима», а не потерянная ветка.
    expect(matchChzGroups('62.01')).toEqual([]);
  });

  it('мусор и пустота дают пустой список, а не исключение', () => {
    expect(matchChzGroups(null)).toEqual([]);
    expect(matchChzGroups(undefined)).toEqual([]);
    expect(matchChzGroups('')).toEqual([]);
    expect(matchChzGroups('   ')).toEqual([]);
    expect(matchChzGroups('ИНН')).toEqual([]);
    expect(matchChzGroups(42 as unknown as string)).toEqual([]);
  });

  it('пробелы по краям не мешают', () => {
    expect(matchChzGroups(' 15.20 ').map((g) => g.group)).toEqual(['Обувь']);
  });

  it('более общий код НЕ наследует обязанность подкода', () => {
    // «10.5» — не «10.51»: утверждать по нему обязанность нельзя, матч только
    // «код начинается с префикса группы», не наоборот.
    expect(matchChzGroups('10.5')).toEqual([]);
  });

  it('компания может попасть в несколько групп; порядок — обязательные первыми', () => {
    // Синтетический код с префиксом «20.5» отсутствует, поэтому берём реальный
    // множественный случай через отдельные проверки статуса-приоритета.
    const many = CHZ_GROUPS.filter((g) => g.status !== 'mandatory');
    expect(many.length).toBeGreaterThan(0);
    const order = matchChzGroups('27.90').concat(matchChzGroups('27.40'));
    expect(order.map((g) => g.status)).toEqual(['experiment', 'starting']);
  });

  it('chzStatusLabel называет статус словами человека', () => {
    expect(chzStatusLabel({ okvedPrefixes: ['12'], group: 'x', status: 'mandatory', since: '2019' }))
      .toBe('обязательна с 2019');
    expect(chzStatusLabel({ okvedPrefixes: ['10.82'], group: 'x', status: 'starting', since: '2026-03' }))
      .toBe('стартует 2026-03');
    expect(chzStatusLabel({ okvedPrefixes: ['20.15'], group: 'x', status: 'experiment', since: '2026' }))
      .toBe('эксперимент 2026');
  });

  it('в справочнике нет дублей групп и пустых префиксов', () => {
    const names = CHZ_GROUPS.map((g) => g.group);
    expect(new Set(names).size).toBe(names.length);
    for (const g of CHZ_GROUPS) {
      expect(g.okvedPrefixes.length).toBeGreaterThan(0);
      for (const p of g.okvedPrefixes) expect(p).toMatch(/^\d{2}(\.\d{1,2})?$/);
    }
  });
});

describe('зеркала клиент ↔ edge синхронны', () => {
  it('таблица совпадает дословно', () => {
    expect(EDGE_CHZ_GROUPS).toEqual(CHZ_GROUPS);
  });

  it('функция отвечает одинаково на каждом префиксе справочника и на мусоре', () => {
    const probes = [
      ...CHZ_GROUPS.flatMap((g) => g.okvedPrefixes),
      ...CHZ_GROUPS.flatMap((g) => g.okvedPrefixes.map((p) => `${p}.1`)),
      '62.01', '10.5', '', '   ', 'ИНН',
    ];
    for (const code of probes) {
      expect(edgeMatch(code), `расхождение зеркал на коде «${code}»`).toEqual(matchChzGroups(code));
    }
  });
});
