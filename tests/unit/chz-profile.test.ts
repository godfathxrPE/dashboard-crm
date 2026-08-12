// tests/unit/chz-profile.test.ts — S-LEAD-CARRY-1
//
// Резолвер маркировочного профиля: подтверждённое человеком побеждает гипотезу,
// выведенную из ОКВЭД. Путь строго `tests/unit/**` — `vitest.config.ts` включает
// только его, файл рядом с исходником молча не запустится и прогон соврёт зелёным.

import { describe, it, expect } from 'vitest';
import { resolveChzProfile } from '@/lib/domain/chz-profile';
import { matchChzGroups } from '@/lib/data/chz-groups';

// Опоры на справочник-снапшот: обе группы существуют и матчатся разными ОКВЭД.
// «15.20» → Обувь, «10.51» → Молочная продукция.
const OKVED_SHOES = '15.20';
const OKVED_DAIRY = '10.51.1';

describe('resolveChzProfile', () => {
  it('подтверждённое побеждает гипотезу по ОКВЭД', () => {
    // ОКВЭД говорит «Обувь», человек сказал «Молочная продукция» — побеждает человек.
    const p = resolveChzProfile(['Молочная продукция'], OKVED_SHOES);

    expect(p.source).toBe('declared');
    expect(p.groups.map((g) => g.group)).toEqual(['Молочная продукция']);
    expect(p.unknown).toEqual([]);
    // Гипотеза не подмешивается: обуви в результате нет вовсе.
    expect(p.groups.some((g) => g.group === 'Обувь')).toBe(false);
  });

  it('пустой declared ⇒ фолбэк на matchChzGroups(okved)', () => {
    const derived = matchChzGroups(OKVED_DAIRY);
    expect(derived.length).toBeGreaterThan(0); // страховка от протухшего справочника

    for (const declared of [null, undefined, []]) {
      const p = resolveChzProfile(declared, OKVED_DAIRY);
      expect(p.source).toBe('derived');
      expect(p.groups).toEqual(derived);
      expect(p.unknown).toEqual([]);
    }
  });

  it('имя, которого нет в справочнике, уходит в unknown, а не в groups', () => {
    const p = resolveChzProfile(['Обувь', 'Ковры ручной работы'], null);

    expect(p.source).toBe('declared');
    expect(p.groups.map((g) => g.group)).toEqual(['Обувь']);
    expect(p.unknown).toEqual(['Ковры ручной работы']);
  });

  it('только сироты: source остаётся declared, гипотеза НЕ подставляется', () => {
    // Иначе UI показал бы обувь по ОКВЭД поверх того, что человек уже сказал.
    const p = resolveChzProfile(['Группа, которой нет'], OKVED_SHOES);

    expect(p.source).toBe('declared');
    expect(p.groups).toEqual([]);
    expect(p.unknown).toEqual(['Группа, которой нет']);
  });

  it('оба источника пусты ⇒ none', () => {
    expect(resolveChzProfile(null, null)).toEqual({ groups: [], source: 'none', unknown: [] });
    expect(resolveChzProfile([], '')).toEqual({ groups: [], source: 'none', unknown: [] });
    // Мусор в ОКВЭД (в поле реестра иногда приезжает неожиданное) — тоже none.
    expect(resolveChzProfile(undefined, 'ИНН')).toEqual({ groups: [], source: 'none', unknown: [] });
  });

  it('порядок declared сохраняется — его выбирал человек', () => {
    // В `matchChzGroups` порядок задаёт STATUS_RANK (mandatory → starting →
    // experiment). Здесь сортировки быть не должно: «Кондитерские изделия»
    // (starting) стоит первой и обязана остаться первой.
    const p = resolveChzProfile(['Кондитерские изделия', 'Обувь', 'Табачная продукция'], null);

    expect(p.groups.map((g) => g.group)).toEqual([
      'Кондитерские изделия',
      'Обувь',
      'Табачная продукция',
    ]);
  });
});
