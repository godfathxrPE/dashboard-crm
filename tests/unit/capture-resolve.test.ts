import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  resolveProject,
  resolveAssignee,
  pickSingleMatch,
  hintMatchesName,
  significantHintTokens,
  coarseNeedle,
  stripCaseEnding,
  RESOLVE_FETCH_LIMIT,
  type ResolveCandidate,
  type ResolveDb,
  type ResolveBuilder,
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

describe('названия — ОПФ снимается, падеж снимается окончанием (не обрезкой)', () => {
  it('«Ромашка» находит «ООО «Ромашка»»', () => {
    const r = pickSingleMatch('Ромашка', COMPANIES, 'entity');
    expect(r.reason).toBe('ok');
    expect(r.id).toBe('c-romashka');
  });

  it('«ООО Ромашка» находит её же — ОПФ выброшена с обеих сторон', () => {
    expect(pickSingleMatch('ООО Ромашка', COMPANIES, 'entity').id).toBe('c-romashka');
  });

  // ⚠️ ГЛАВНАЯ ПРИЧИНА, ПО КОТОРОЙ ДЛЯ НАЗВАНИЙ ЗАПРЕЩЕНА ОБРЕЗКА ДО N СИМВОЛОВ:
  //    на четырёх символах «танд» эти два юрлица слились бы в одно, и задача уехала
  //    бы к чужому клиенту. Снятие падежного окончания (правка гейта S-TG-TASK-1)
  //    этого не делает: «тандем» короче порога основы и не режется вовсе.
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

  // ⚠️ ОТБОР ИДЁТ ПО ОСНОВЕ, А НЕ ПО ТОКЕНУ ЦЕЛИКОМ — правка гейта S-TG-TASK-1.
  //    До неё `ilike '%молявину%'` не находил «Андрей Молявин», а `ilike '%тандера%'`
  //    не находил «Тандер»: грубый отбор возвращал ноль строк на ЛЮБОМ косвенном
  //    падеже, и разбор падежей ниже по течению не мог сработать в принципе.
  //    Тесты этого не видели, потому что звали `hintMatchesName` напрямую, минуя
  //    SQL-шаг — то есть проверяли вторую половину механизма на данных, которых
  //    первая половина никогда бы не отдала.
  it('грубый отбор идёт по ОСНОВЕ самого длинного токена', () => {
    expect(coarseNeedle('ООО «Ромашка-Плюс»')).toBe('ромашк');
    expect(coarseNeedle('Тандера', 'entity')).toBe('тандер');
    expect(coarseNeedle('Молявину', 'person')).toBe('моля');
  });

  // Вайлдкарды `ilike` внутри подсказки превратили бы точечный отбор в выборку
  // половины таблицы — токенизация снимает их вместе с прочей пунктуацией.
  it('% и _ в подсказку не проходят', () => {
    expect(coarseNeedle('%ромашка_%')).toBe('ромашк');
  });

  it('подсказка без значимых токенов не даёт запроса вовсе', () => {
    expect(coarseNeedle('   ')).toBeNull();
  });
});

// ═══ Правки гейта S-TG-TASK-1 ═══

describe('служебные слова — стоп-лист, а не порог по длине', () => {
  // ⚠️ ДО ПРАВКИ ЭТОТ КЛАСС ОТСЕКАЛСЯ ПОРОГОМ `length >= 3`, и тест был написан
  //    ровно на тех предлогах, которые порог ловит («по», «в»). Трёхбуквенные
  //    предлоги его проходили и обнуляли матч целиком: замер на живых данных
  //    показал, что «под Магнит» НЕ находит «Магнит» — падежа там нет вовсе.
  it.each(['для', 'про', 'под', 'над', 'при', 'без', 'через', 'перед', 'между'])(
    'трёхбуквенный и длиннее предлог «%s» не считается значимым',
    (prep) => {
      expect(significantHintTokens(`${prep} Тандер`)).toEqual(['тандер']);
    },
  );

  it('«под Магнит» находит «Магнит» — предлог не мешает', () => {
    expect(hintMatchesName('под Магнит', 'Магнит', 'entity')).toBe(true);
  });
});

describe('падеж названия снимается окончанием', () => {
  it.each([
    ['Тандера', 'Тандер'],
    ['Тандеру', 'Тандер'],
    ['Ромашку', 'ООО «Ромашка»'],
    ['Мукомола', 'Мукомол'],
    ['про Перспективу', 'Перспектива'],
    ['Чусовской мельнице', 'ЗАО «Чусовская мельница»'],
    ['по Атланту', 'Завод Атлант'],
  ])('«%s» находит «%s»', (hint, name) => {
    expect(hintMatchesName(hint, name, 'entity')).toBe(true);
  });

  // ⚠️ КОНТРОЛЬ. Ради этих трёх строк и запрещена обрезка до N символов.
  it.each([
    ['Тандера', 'Тандем'],
    ['Тандем', 'Тандер'],
    ['Тандеру', 'ООО «Тандем»'],
  ])('«%s» НЕ находит «%s» — разные юрлица', (hint, name) => {
    expect(hintMatchesName(hint, name, 'entity')).toBe(false);
  });

  it('короткая основа не режется: «тандем» остаётся собой', () => {
    expect(stripCaseEnding('тандем')).toBe('тандем');
    expect(stripCaseEnding('тандера')).toBe('тандер');
  });

  // Известная граница, а не сюрприз: слово, у которого после снятия окончания
  // осталось бы меньше пяти букв, не склоняется вовсе. «вкусу» → «вкус» требует
  // основы 4, и мы её не берём — цена снижения порога выше выигрыша.
  it('слово короче порога основы в косвенном падеже НЕ резолвится', () => {
    expect(hintMatchesName('Хорошему вкусу', 'Хороший вкус', 'entity')).toBe(false);
  });
});


// ═══════════════════════════════════════════════════════
// S-TG-VOICE-TERMS — сбой выборки это НЕ «не нашёл» (долг гейта S-TG-TASK-1).
//
// ⚠️ ДВА ИСХОДА ПОД ОДНИМ ТЕКСТОМ — ЭТО ДЕФЕКТ, А НЕ УПРОЩЕНИЕ. «Не нашёл,
//    назначьте в CRM» — утверждение о справочнике: услышав его, человек идёт
//    править своё сообщение. Если справочник вообще не прочитался, он ни при чём,
//    и предложение исправить свою речь — ложный совет. Ровно тот же класс, что
//    отказ Groq по формату файла под текстом «не смог распознать»: диагностика
//    уходит не туда, потому что исходы склеены.
//
// ⚠️ БРОСОК ЗДЕСЬ ПО-ПРЕЖНЕМУ ЗАПРЕЩЁН: потерять из-за упавшего `select` весь
//    разбор хуже, чем показать причину строкой в карточке.
// ═══════════════════════════════════════════════════════

/** Билдер, который на любой цепочке отдаёт заданный ответ PostgREST. */
function stubDb(result: { data: unknown; error: { message: string } | null }): ResolveDb {
  const builder: ResolveBuilder = {
    select: () => builder,
    eq: () => builder,
    neq: () => builder,
    ilike: () => builder,
    limit: () => builder,
    then: (onfulfilled) => Promise.resolve(result).then(onfulfilled),
  } as ResolveBuilder;
  return { from: () => builder };
}

describe('сбой выборки → reason «error», а не «not_found»', () => {
  afterEach(() => vi.restoreAllMocks());

  it('упавший select по сделкам не выдаётся за отсутствие сделки', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await resolveProject(stubDb({ data: null, error: { message: 'boom' } }), 'org-1', 'Мукомол');
    expect(r.reason).toBe('error');
    expect(r.id).toBeNull();
    // Подсказка обязана дожить до карточки: без неё строка «не удалось проверить»
    // не скажет, ЧТО именно не проверилось.
    expect(r.hint).toBe('Мукомол');
  });

  it('упавший select по исполнителям — тоже «error»', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await resolveAssignee(stubDb({ data: null, error: { message: 'boom' } }), 'org-1', 'Молявину');
    expect(r.reason).toBe('error');
  });

  it('пустая выборка БЕЗ ошибки остаётся «not_found» — эту ветку правка не трогает', async () => {
    const r = await resolveProject(stubDb({ data: [], error: null }), 'org-1', 'Мукомол');
    expect(r.reason).toBe('not_found');
  });

  it('пустая подсказка проверяется ДО запроса и остаётся «empty»', async () => {
    const r = await resolveProject(stubDb({ data: null, error: { message: 'boom' } }), 'org-1', '   ');
    expect(r.reason).toBe('empty');
  });
});
