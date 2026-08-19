import { describe, it, expect } from 'vitest';
import {
  pickSingleMatch,
  hintMatchesName,
  significantHintTokens,
  coarseNeedle,
  RESOLVE_FETCH_LIMIT,
  type ResolveCandidate,
} from '../../supabase/functions/_shared/capture-resolve';

// ═══════════════════════════════════════════════════════
// S-TG-TASK-1 — сопоставление упоминаний из текста с записями CRM.
//
// Тестируется ЧИСТАЯ часть: та, что решает «один кандидат, ни одного или
// несколько». Запросы к БД (грубый отбор `ilike`) сюда не входят — их проверяют
// ролевые смоки гейта.
//
// ⚠️ ГЛАВНОЕ, РАДИ ЧЕГО ЭТОТ ФАЙЛ НАПИСАН — ПОЛОЖИТЕЛЬНЫЕ КЕЙСЫ. Матчер,
//    сломанный целиком, проходит ВСЕ отрицательные проверки: «не нашлось» — это
//    и правильный ответ на чужое имя, и симптом мёртвого правила. Именно так
//    дважды выживал `\b` рядом с кириллицей (S-CHAT-TASK-1, S-TG-3): границы
//    слова там не существует, правило не срабатывало никогда, и заметить это по
//    отрицательным тестам было нельзя по построению.
// ═══════════════════════════════════════════════════════

const PEOPLE: ResolveCandidate[] = [
  { id: 'p-molyavin', name: 'Андрей Молявин' },
  { id: 'p-petrov', name: 'Пётр Петров' },
  { id: 'p-sidorova', name: 'Мария Сидорова' },
];

const COMPANIES: ResolveCandidate[] = [
  { id: 'c-romashka', name: 'ООО «Ромашка»' },
  { id: 'c-tander', name: 'АО «Тандер»' },
  { id: 'c-tandem', name: 'ООО «Тандем»' },
];

describe('resolveAssignee — положительный матч человека', () => {
  // Ровно тот случай, который ломается молча: падеж. Все пять написаний обязаны
  // привести к ОДНОМУ И ТОМУ ЖЕ профилю.
  it.each([
    ['Андрею', 'p-molyavin'],
    ['Андрей', 'p-molyavin'],
    ['Молявину', 'p-molyavin'],
    ['андрей молявин', 'p-molyavin'],
    ['Молявин Андрей', 'p-molyavin'],
  ])('«%s» → %s', (hint, expected) => {
    const r = pickSingleMatch(hint, PEOPLE, 'person');
    expect(r.reason).toBe('ok');
    expect(r.id).toBe(expected);
  });

  it('возвращает имя записи, а не подсказку: человек подтверждает привязку к человеку', () => {
    expect(pickSingleMatch('Молявину', PEOPLE, 'person').label).toBe('Андрей Молявин');
  });

  it('«Пётр» находит «Пётр Петров» — ё/е нормализуется', () => {
    expect(pickSingleMatch('Петру', PEOPLE, 'person').id).toBe('p-petrov');
  });
});

describe('неоднозначность — поле остаётся пустым', () => {
  it('два тёзки → ambiguous, id === null', () => {
    const twins: ResolveCandidate[] = [
      { id: 'a', name: 'Андрей Молявин' },
      { id: 'b', name: 'Андрей Смирнов' },
    ];
    const r = pickSingleMatch('Андрею', twins, 'person');
    expect(r.reason).toBe('ambiguous');
    expect(r.id).toBeNull();
    // Имя не показывается тоже: показать одно из двух — то же самое, что выбрать.
    expect(r.label).toBeNull();
  });

  it('упёршийся лимит грубого отбора — ambiguous, а не «нашёл ровно одного»', () => {
    // За лимитом мог остаться второй такой же; выбирать из усечённой выборки
    // значит выдавать точность, которой нет.
    const full: ResolveCandidate[] = Array.from({ length: RESOLVE_FETCH_LIMIT }, (_, i) => ({
      id: `c-${i}`,
      name: i === 0 ? 'ООО «Ромашка»' : `ООО «Прочее ${i}»`,
    }));
    const r = pickSingleMatch('Ромашка', full, 'entity', true);
    expect(r.reason).toBe('ambiguous');
    expect(r.id).toBeNull();
  });

  it('без флага усечения тот же список даёт единственное совпадение', () => {
    const full: ResolveCandidate[] = Array.from({ length: RESOLVE_FETCH_LIMIT }, (_, i) => ({
      id: `c-${i}`,
      name: i === 0 ? 'ООО «Ромашка»' : `ООО «Прочее ${i}»`,
    }));
    expect(pickSingleMatch('Ромашка', full, 'entity', false).id).toBe('c-0');
  });
});

describe('пустая подсказка', () => {
  it.each([['', 'empty'], ['   ', 'empty'], ['по', 'empty']])(
    '«%s» → %s (значимых токенов нет)',
    (hint, reason) => {
      const r = pickSingleMatch(hint, PEOPLE, 'person');
      expect(r.reason).toBe(reason);
      expect(r.id).toBeNull();
    },
  );
});

describe('названия — ОПФ снимается, основы НЕ применяются', () => {
  it('«Ромашка» находит «ООО «Ромашка»»', () => {
    const r = pickSingleMatch('Ромашка', COMPANIES, 'entity');
    expect(r.reason).toBe('ok');
    expect(r.id).toBe('c-romashka');
  });

  it('«ООО Ромашка» находит её же — ОПФ выброшена с обеих сторон', () => {
    expect(pickSingleMatch('ООО Ромашка', COMPANIES, 'entity').id).toBe('c-romashka');
  });

  // ⚠️ ГЛАВНАЯ ПРИЧИНА, ПО КОТОРОЙ ДЛЯ НАЗВАНИЙ ОСНОВЫ ЗАПРЕЩЕНЫ: на четырёх
  //    символах «танд» эти два юрлица слились бы в одно, и задача уехала бы к
  //    чужому клиенту.
  it('«Тандер» НЕ находит «Тандем»', () => {
    const r = pickSingleMatch('Тандер', COMPANIES, 'entity');
    expect(r.reason).toBe('ok');
    expect(r.id).toBe('c-tander');
    expect(hintMatchesName('Тандер', 'ООО «Тандем»', 'entity')).toBe(false);
  });

  it('в режиме person те же два названия слились бы — режим выбран не случайно', () => {
    expect(hintMatchesName('Тандер', 'ООО «Тандем»', 'person')).toBe(true);
  });

  it('чужое название → not_found, а не «первое похожее»', () => {
    const r = pickSingleMatch('Вектор', COMPANIES, 'entity');
    expect(r.reason).toBe('not_found');
    expect(r.id).toBeNull();
  });
});

describe('токенизация подсказки', () => {
  it('предлоги отбрасываются, значимое остаётся', () => {
    expect(significantHintTokens('по тандеру')).toEqual(['тандеру']);
  });

  it('кавычки, точки и дефисы — разделители, а не часть токена', () => {
    expect(significantHintTokens('ООО «Ромашка-Плюс».')).toEqual(['ромашка', 'плюс']);
  });

  it('грубый отбор идёт по самому длинному токену', () => {
    expect(coarseNeedle('ООО «Ромашка-Плюс»')).toBe('ромашка');
  });

  // Вайлдкарды `ilike` внутри подсказки превратили бы точечный отбор в выборку
  // половины таблицы — токенизация снимает их вместе с прочей пунктуацией.
  it('% и _ в подсказку не проходят', () => {
    expect(coarseNeedle('%ромашка_%')).toBe('ромашка');
  });

  it('подсказка без значимых токенов не даёт запроса вовсе', () => {
    expect(coarseNeedle('   ')).toBeNull();
  });
});
