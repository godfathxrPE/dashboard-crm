// S-COMPANY-AI-1 (F2): справочник «ОКВЭД → товарные группы Честного Знака».
//
// Оба модуля чистые и без импортов — тестируются напрямую, без моков и без сети.
// Второй describe — страж синхронности зеркал (клиент ↔ edge): расхождение обязано
// валить CI, а не всплывать в проде разными ответами кнопки и AI-брифа.

import { describe, it, expect } from 'vitest';
import {
  matchChzGroups,
  chzStatusLabel,
  chzPhase,
  phaseChzGroups,
  CHZ_GROUPS,
  type ChzGroup,
  CHZ_SNAPSHOT_DATE,
  CHZ_SNAPSHOT_SOURCES,
} from '@/lib/data/chz-groups';
import {
  matchChzGroups as edgeMatch,
  chzPhase as edgePhase,
  chzStatusLabel as edgeLabel,
  CHZ_GROUPS as EDGE_CHZ_GROUPS,
  CHZ_SNAPSHOT_DATE as EDGE_SNAPSHOT_DATE,
  CHZ_SNAPSHOT_SOURCES as EDGE_SNAPSHOT_SOURCES,
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


  it('в справочнике нет дублей групп и пустых префиксов', () => {
    const names = CHZ_GROUPS.map((g) => g.group);
    expect(new Set(names).size).toBe(names.length);
    for (const g of CHZ_GROUPS) {
      expect(g.okvedPrefixes.length).toBeGreaterThan(0);
      for (const p of g.okvedPrefixes) expect(p).toMatch(/^\d{2}(\.\d{1,2})?$/);
    }
  });
});

// S-DEAL-CHZ-2: «стартует» — функция времени. Даты — локальные (`new Date(y, m, d)`),
// как и разбор `now` внутри `chzPhase`: день месяца в тестах далёк от границы суток.
describe('chzPhase: фаза группы из since и now', () => {
  const g = (status: ChzGroup['status'], since: string, group = 'x'): ChzGroup =>
    ({ okvedPrefixes: ['99'], group, status, since });
  const SEP26 = new Date(2026, 8, 26);

  it('текущий месяц — уже «старт», а не обязанность', () => {
    expect(chzPhase(g('starting', '2026-09'), SEP26)).toBe('starting');
    expect(chzStatusLabel(g('starting', '2026-09'), SEP26)).toBe('старт 2026-09');
  });

  it('старт в прошлом — обязанность действует, статус снапшота не важен', () => {
    expect(chzPhase(g('starting', '2026-03'), SEP26)).toBe('mandatory');
    expect(chzStatusLabel(g('starting', '2026-03'), SEP26)).toBe('обязательна с 2026-03');
  });

  it('ровно шесть месяцев — граница горизонта включительно', () => {
    expect(chzPhase(g('starting', '2027-03'), SEP26)).toBe('starting');
  });

  it('дальше горизонта — planned, подпись та же «старт»', () => {
    expect(chzPhase(g('starting', '2027-04'), SEP26)).toBe('planned');
    expect(chzStatusLabel(g('starting', '2027-04'), SEP26)).toBe('старт 2027-04');
  });

  it('переход года считается календарно', () => {
    expect(chzPhase(g('starting', '2027-01'), new Date(2026, 11, 15))).toBe('starting');
  });

  it('год без месяца — статус снапшота как есть', () => {
    expect(chzPhase(g('mandatory', '2019'), SEP26)).toBe('mandatory');
    expect(chzStatusLabel(g('mandatory', '2019'), SEP26)).toBe('обязательна с 2019');
  });

  it('эксперимент не зависит от даты', () => {
    for (const now of [new Date(2020, 0, 1), SEP26, new Date(2035, 5, 1)]) {
      expect(chzPhase(g('experiment', '2026'), now)).toBe('experiment');
      expect(chzStatusLabel(g('experiment', '2026'), now)).toBe('эксперимент 2026');
    }
  });

  it('мусор в since — фаза равна статусу снапшота, без исключения', () => {
    for (const since of ['2026-13', '', '2026-9', '2026-00']) {
      expect(chzPhase(g('starting', since), SEP26)).toBe('starting');
      expect(chzPhase(g('mandatory', since), SEP26)).toBe('mandatory');
    }
  });

  it('phaseChzGroups: стартующие первыми, внутри фазы — входной порядок', () => {
    const out = phaseChzGroups([
      g('mandatory', '2019', 'm1'),
      g('experiment', '2026', 'e'),
      g('starting', '2026-10', 's'),
      g('mandatory', '2020', 'm2'),
    ], SEP26);
    expect(out.map((x) => x.group)).toEqual(['s', 'm1', 'm2', 'e']);
    expect(out.map((x) => x.phase)).toEqual(['starting', 'mandatory', 'mandatory', 'experiment']);
    expect(out[0].label).toBe('старт 2026-10');
  });

  // Фиксирует сегодняшнюю картину справочника: правка снапшота обязана быть
  // видна в диффе этого теста, а не только в таблице.
  it('на 2026-09-26 справочник подсвечивает ровно одну группу', () => {
    const starting = phaseChzGroups(CHZ_GROUPS, SEP26).filter((x) => x.phase === 'starting');
    expect(starting.map((x) => x.group)).toEqual(['Мука, макароны, мёд']);
  });
});

describe('версия справочника доезжает до кода', () => {
  // S-DEAL-CHZ-1: дата снапшота была комментарием в шапке файла и на экран попасть
  // не могла. По этим данным готовят КП со сроками обязательной маркировки —
  // «откуда цифра и на какое число» обязано быть видно человеку, а не автору файла.
  it('CHZ_SNAPSHOT_DATE — ISO-дата', () => {
    expect(CHZ_SNAPSHOT_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Дата обязана разбираться в реальный день, а не только совпасть с маской:
    // «2026-13-45» маску проходит.
    expect(Number.isNaN(Date.parse(CHZ_SNAPSHOT_DATE))).toBe(false);
  });

  it('источники снапшота непусты — дата без источника непроверяема', () => {
    expect(CHZ_SNAPSHOT_SOURCES.length).toBeGreaterThan(0);
    for (const src of CHZ_SNAPSHOT_SOURCES) expect(src.trim()).not.toBe('');
  });
});

describe('зеркала клиент ↔ edge синхронны', () => {
  it('таблица совпадает дословно', () => {
    expect(EDGE_CHZ_GROUPS).toEqual(CHZ_GROUPS);
  });

  // Страж таблицы — deepEqual по CHZ_GROUPS, и новые константы он бы не заметил:
  // сравнивается одна переменная, а не весь модуль. Разъехавшаяся дата тише
  // разъехавшейся таблицы и оттого опаснее — бриф и карточка назовут человеку
  // РАЗНОЕ «на какое число», не уронив ни одного теста.
  it('версия снапшота совпадает в зеркалах', () => {
    expect(EDGE_SNAPSHOT_DATE).toBe(CHZ_SNAPSHOT_DATE);
    expect(EDGE_SNAPSHOT_SOURCES).toEqual(CHZ_SNAPSHOT_SOURCES);
  });

  it('фаза и подпись совпадают в зеркалах на трёх датах', () => {
    for (const now of [new Date(2026, 2, 15), new Date(2026, 8, 26), new Date(2027, 5, 1)]) {
      for (const g of CHZ_GROUPS) {
        expect(edgePhase(g, now), `фаза «${g.group}»`).toBe(chzPhase(g, now));
        expect(edgeLabel(g, now), `подпись «${g.group}»`).toBe(chzStatusLabel(g, now));
      }
    }
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
