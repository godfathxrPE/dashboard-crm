// src/lib/data/chz-groups.ts — S-COMPANY-AI-1 (F2)
//
// Снапшот 2026-08-03. Источники: kontur.ru/markirovka/spravka/54370,
// garant.ru/article/2131746. Перед использованием дат в КП сверять с честныйзнак.рф.
//
// Код ОКВЭД-2 → товарные группы обязательной маркировки «Честный Знак». Ноль AI,
// ноль стоимости: детерминированный справочник, который отвечает на пресейл-вопрос
// «попадает ли компания под маркировку и с какой даты».
//
// ⚠️ ЗЕРКАЛО: `supabase/functions/ai-run/chz-groups.ts` — точная копия этого файла.
//    Deno-функция и next-бандл не делят модули (тот же прецедент, что `INN_RE`),
//    поэтому копия осознанная. Править СИНХРОННО: рассинхрон валит
//    `tests/unit/chz-groups.test.ts` (сравнение экспортов deepEqual), а не ждёт жалобы.
//
// Файл ЧИСТЫЙ (ни одного импорта, ни обращений к рантайму) — как `okved.ts`: так он
// покрывается юнит-тестами и одинаково пригоден на клиенте и в Deno. Не добавлять импортов.

export type ChzStatus = 'mandatory' | 'starting' | 'experiment';

export interface ChzGroup {
  /** Префиксы ОКВЭД-2; матч — по началу кода, специфичный длиннее общего. */
  okvedPrefixes: string[];
  group: string;
  status: ChzStatus;
  /** «2021» для давно действующих, «2026-05» для стартующих. */
  since: string;
  /** Этапность, если она критична для разговора. */
  note?: string;
}

/**
 * Данные — снапшот на дату в шапке, и ТОЛЬКО он. Не дополнять «по памяти» и не
 * «уточнять» даты без сверки с источником: устаревший справочник с честной датой
 * снапшота лучше выдуманного актуального — по нему готовят КП.
 */
export const CHZ_GROUPS: ChzGroup[] = [
  { okvedPrefixes: ['12'], group: 'Табачная продукция', status: 'mandatory', since: '2019' },
  { okvedPrefixes: ['15.20'], group: 'Обувь', status: 'mandatory', since: '2020' },
  { okvedPrefixes: ['21'], group: 'Лекарственные средства', status: 'mandatory', since: '2020' },
  {
    okvedPrefixes: ['20.42'],
    group: 'Парфюмерия и косметика',
    status: 'mandatory',
    since: '2020',
    note: 'духи с 2020; косметика и бытовая химия — волны 2025',
  },
  { okvedPrefixes: ['22.11'], group: 'Шины и покрышки', status: 'mandatory', since: '2020' },
  { okvedPrefixes: ['26.70'], group: 'Фототехника', status: 'mandatory', since: '2020' },
  {
    okvedPrefixes: ['13', '14'],
    group: 'Лёгкая промышленность / одежда',
    status: 'mandatory',
    since: '2021',
    note: 'волны 2024–2025; 4-я волна (спецодежда) с 2026-03',
  },
  {
    okvedPrefixes: ['10.51', '10.52'],
    group: 'Молочная продукция',
    status: 'mandatory',
    since: '2021',
    note: 'поэтапно 2021–2022',
  },
  {
    okvedPrefixes: ['11.07'],
    group: 'Вода и безалкогольные напитки',
    status: 'mandatory',
    since: '2021',
    note: 'вода 2021–2022; напитки и соки 2023–2024',
  },
  {
    okvedPrefixes: ['11.05', '11.03'],
    group: 'Пиво и слабоалкогольные напитки',
    status: 'mandatory',
    since: '2023',
    note: 'поэтапно с 2023-04',
  },
  { okvedPrefixes: ['20.20'], group: 'Антисептики', status: 'mandatory', since: '2023' },
  { okvedPrefixes: ['10.86', '10.89'], group: 'БАД', status: 'mandatory', since: '2023' },
  {
    okvedPrefixes: ['32.50'],
    group: 'Медицинские изделия',
    status: 'mandatory',
    since: '2023',
    note: 'волна 2.0 (шприцы, маски, салфетки) стартует 2026-09',
  },
  {
    okvedPrefixes: ['30.92'],
    group: 'Кресла-коляски, велосипеды',
    status: 'mandatory',
    since: '2023',
    note: 'велосипеды с 2024-09',
  },
  { okvedPrefixes: ['10.41'], group: 'Растительные масла', status: 'mandatory', since: '2024' },
  { okvedPrefixes: ['10.92'], group: 'Корма для животных', status: 'mandatory', since: '2024' },
  {
    okvedPrefixes: ['10.20'],
    group: 'Рыбная продукция, икра',
    status: 'mandatory',
    since: '2024',
    note: 'икра 2024-05; консервы — волны 2024–2025',
  },
  {
    okvedPrefixes: ['10.32', '10.39'],
    group: 'Плодоовощные консервы, соки',
    status: 'mandatory',
    since: '2024',
    note: 'поэтапно 2024–2025',
  },
  {
    okvedPrefixes: ['19.20', '20.59'],
    group: 'Моторные масла и техжидкости',
    status: 'mandatory',
    since: '2025',
  },
  {
    okvedPrefixes: ['23.51', '23.52', '23.64'],
    group: 'Стройматериалы (цемент, смеси)',
    status: 'mandatory',
    since: '2025',
  },
  {
    okvedPrefixes: ['10.31', '10.72'],
    group: 'Снеки и бакалея',
    status: 'mandatory',
    since: '2025',
    note: 'снеки с 2025-12',
  },
  {
    okvedPrefixes: ['10.82'],
    group: 'Кондитерские изделия',
    status: 'starting',
    since: '2026-03',
    note: 'три этапа до 2026-07',
  },
  {
    okvedPrefixes: ['10.83'],
    group: 'Чай, кофе, какао (растворимые)',
    status: 'starting',
    since: '2026-04',
    note: 'какао 2025-12; чай 2026-04; кофе 2026-06',
  },
  {
    okvedPrefixes: ['26.20', '26.30', '26.40', '27.40'],
    group: 'Радиоэлектроника и светотехника',
    status: 'starting',
    since: '2026-05',
    note: 'ноутбуки, телефоны, светильники',
  },
  {
    okvedPrefixes: ['10.13'],
    group: 'Мясная продукция',
    status: 'starting',
    since: '2026-08',
    note: 'готовые изделия 2026-08; колбасы 2026-10',
  },
  {
    okvedPrefixes: ['10.61', '10.73', '01.49'],
    group: 'Мука, макароны, мёд',
    status: 'starting',
    since: '2026-09',
  },
  { okvedPrefixes: ['27.32', '27.90'], group: 'Кабельная продукция', status: 'experiment', since: '2026' },
  { okvedPrefixes: ['22.21'], group: 'Полимерные трубы', status: 'experiment', since: '2026' },
  { okvedPrefixes: ['29.3', '45.31'], group: 'Автокомпоненты', status: 'experiment', since: '2026' },
  { okvedPrefixes: ['20.51'], group: 'Пиротехника', status: 'experiment', since: '2026' },
  { okvedPrefixes: ['20.15'], group: 'Удобрения', status: 'experiment', since: '2026' },
  { okvedPrefixes: ['23.13'], group: 'Посуда из стекла', status: 'experiment', since: '2026' },
  { okvedPrefixes: ['58.11'], group: 'Учебная литература', status: 'experiment', since: '2026' },
];

/** Порядок вывода: сначала действующая обязанность, потом старты, потом эксперименты. */
const STATUS_RANK: Record<ChzStatus, number> = { mandatory: 0, starting: 1, experiment: 2 };

/**
 * Код ОКВЭД («10.51.1», «12.00», «26.20») → товарные группы маркировки.
 *
 * Матч по началу строки: код компании начинается с префикса группы, а не наоборот —
 * «10.51.1» попадает в «10.51», а «10.5» не попадает никуда (это более общий код,
 * и утверждать по нему обязанность нельзя).
 *
 * Компания может попасть в несколько групп — это нормально. Одна группа возвращается
 * один раз, даже если совпало несколько её префиксов.
 *
 * Мусор на входе (null, пустая строка, «ИНН») — пустой массив, а не исключение:
 * поле `okved` заполняется из реестра и иногда приходит неожиданным.
 */
export function matchChzGroups(okved: string | null | undefined): ChzGroup[] {
  if (typeof okved !== 'string') return [];
  const code = okved.trim();
  if (code === '') return [];

  const matched = CHZ_GROUPS.filter((g) => g.okvedPrefixes.some((p) => code.startsWith(p)));
  // Стабильная сортировка по статусу: порядок внутри статуса — табличный (хронология).
  return matched
    .map((g, i) => ({ g, i }))
    .sort((a, b) => STATUS_RANK[a.g.status] - STATUS_RANK[b.g.status] || a.i - b.i)
    .map((x) => x.g);
}

/** Подпись статуса для UI: «обязательна с 2021» / «стартует 2026-08» / «эксперимент». */
export function chzStatusLabel(g: ChzGroup): string {
  if (g.status === 'mandatory') return `обязательна с ${g.since}`;
  if (g.status === 'starting') return `стартует ${g.since}`;
  return `эксперимент ${g.since}`;
}
