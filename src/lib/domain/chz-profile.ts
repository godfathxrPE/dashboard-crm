// src/lib/domain/chz-profile.ts — S-LEAD-CARRY-1
//
// Маркировочный профиль компании имеет два источника, и они НЕ равны:
//   declared — `companies.chz_groups`, подтверждено человеком (приезжает с лида
//              при конверсии либо правится руками в CompanyModal)
//   derived  — `matchChzGroups(okved)`, выведено из кода реестра, это ГИПОТЕЗА
//
// Подтверждённое побеждает: ОКВЭД говорит, чем компания ЧИСЛИТСЯ, продавец — что
// она реально маркирует. Оптовик с 46.x возит обувь и молоко, и ОКВЭД об этом не
// знает. Гипотеза при этом не удаляется из кода — она просто уступает факту.
//
// `unknown` — имена из БД, которых нет в справочнике-снапшоте. Справочник датирован
// (`lib/data/chz-groups.ts`, снапшот 2026-08-03) и переименование группы оставит
// сироту; молча её проглотить — потерять данные, которые ввёл человек.
//
// Функция детерминирована и не читает время: `Date.now()` внутри домена не заводим.

import { CHZ_GROUPS, matchChzGroups, type ChzGroup } from '@/lib/data/chz-groups';

export interface ChzProfile {
  groups: ChzGroup[];
  source: 'declared' | 'derived' | 'none';
  /** Названия из declared, не найденные в справочнике. Рендерятся нейтральным тегом. */
  unknown: string[];
}

const EMPTY: ChzProfile = { groups: [], source: 'none', unknown: [] };

export function resolveChzProfile(
  declared: string[] | null | undefined,
  okved: string | null | undefined,
): ChzProfile {
  // ═══ 1. Подтверждённое ═══
  // Пустой массив сюда не проходит: `[]` в БД означает «выяснили, что групп нет»,
  // и это не повод показывать гипотезу по ОКВЭД... но и не повод показывать пустой
  // declared-блок. Такой случай уходит в фолбэк ниже и, если ОКВЭД тоже молчит,
  // честно схлопывается в 'none'.
  if (Array.isArray(declared) && declared.length > 0) {
    const groups: ChzGroup[] = [];
    const unknown: string[] = [];
    const seen = new Set<string>();

    // Порядок — как в `declared`: человек выбирал группы в пикере, порядок его.
    // Сортировку по статусу (`matchChzGroups`) здесь применять нельзя — она
    // переставила бы человеческий ввод.
    for (const name of declared) {
      if (seen.has(name)) continue;
      seen.add(name);
      const hit = CHZ_GROUPS.find((g) => g.group === name);
      if (hit) groups.push(hit);
      else unknown.push(name);
    }

    // Все имена — сироты: групп для рендера нет, но данные человека есть.
    // Источник всё равно 'declared' — иначе UI подставил бы гипотезу по ОКВЭД
    // поверх того, что человек уже сказал.
    return { groups, source: 'declared', unknown };
  }

  // ═══ 2. Гипотеза по ОКВЭД ═══
  const derived = matchChzGroups(okved);
  if (derived.length > 0) return { groups: derived, source: 'derived', unknown: [] };

  return EMPTY;
}
