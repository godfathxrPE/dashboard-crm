// supabase/functions/ai-run/shape.ts — fix-S-R2-AI-SHAPE
//
// Проверка ФОРМЫ ответа модели (не содержания). По итогам инъекционного смоука
// 28.07: безопасность держится, ломается доступность — модель срывается со
// структурированного вывода и упаковывает правильные данные неправильно.
//
// Модуль ЧИСТЫЙ: ни Deno, ни supabase-js, ни сети. Это не эстетика — иначе логику
// нельзя прогнать тестом (Deno-модуль с `Deno.env` на верхнем уровне из vitest не
// импортируется), а требование «показать вердикт на живых фикстурах» без теста
// превращается в обещание. Импортируется в index.ts относительным путём, поэтому
// `supabase functions deploy` собирает его в тот же бандл.

/**
 * Претензия к форме ответа. Два класса — они по-разному бьют по пользователю:
 *
 *  • hard — объявленный тип не совпал (`tasks` строкой вместо массива, случай
 *    28.07). Клиент такой ответ не распарсит: `parseProposal` вернёт null, панель
 *    покажет «модель вернула некорректный ответ». Записывать нечего.
 *
 *  • soft — в строковом значении разметка контракта (`</client_situation>`,
 *    `<parameter name=`, случаи 11.07 и 13.07). Данные читаемы, просто грязные.
 *    Отказать из-за такой претензии значит сделать ХУЖЕ, чем сегодня, — и ровно
 *    этим выстрелило бы ложное срабатывание широкого маркера `</`.
 */
export type ShapeClaim = {
  kind: 'hard' | 'soft';
  message: string;
  /**
   * Машиночитаемая метка отдельных претензий. Нужна там, где вызывающему мало
   * «жёсткая/мягкая» и важно ЧТО именно: пустой веб-поиск объясняется пользователю
   * своими словами, а не общим «неверный формат» (см. `checkSearchYield`).
   * Обычные типовые и маркерные претензии метки не несут.
   */
  code?: 'empty_sources' | 'empty_search' | 'ungrounded_website';
};

/**
 * Маркеры разметки контракта внутри строкового значения.
 *
 * `</` намеренно широкий и потому может ложно сработать на легитимной цитате из
 * транскрипта — это осознанный размен. Он безопасен ровно потому, что маркерная
 * претензия мягкая: одна она к отказу не приводит, максимум даёт лишний ретрай
 * и пометку в meta.
 */
export const SHAPE_MARKERS = [
  '<parameter name=', // синтаксис tool-use, случай 28.07
  '</', // закрывающий тег — контракт наружу, случаи 11.07 и 13.07
];

/** Добавка ко ВТОРОМУ user-ходу. Про форму, и только про форму: назови модели
 *  конкретные претензии — начнёт «чинить» данные вместо упаковки. */
export const SHAPE_RETRY_HINT =
  'Предыдущий ответ не соответствовал схеме инструмента. Верни результат строго ' +
  'через вызов инструмента, каждое поле — того типа, который объявлен в схеме. ' +
  'Не вставляй в значения полей теги и служебную разметку.';

/**
 * S-COMPANY-AI-1c. Теги цитирования web search API Anthropic:
 * `<cite index="7-5">текст</cite>`. Это служебный формат МОДЕЛИ (она размечает,
 * откуда взяла факт), а не грязь со страниц, поэтому промптом он не убирается —
 * только снижается вероятность. Замер: promptVersion 2 сбил частоту с 4/5 до 1/3,
 * но у одного прогона разметка пережила ретрай и доехала до карточки.
 *
 * Регулярка снимает ТОЛЬКО `cite` — открывающий с любыми атрибутами, закрывающий и
 * осиротевший. Никакого «универсального стриппера»: `<` и `>` в тексте («выручка >
 * 1 млрд», «2024 < 2025») обязаны выживать, а общий стриппер их съест.
 *
 * Хвост `(?:>|$)` — про обрыв на границе `max_tokens`: половина тега вероятнее
 * целого, и `</ci` без `>` иначе осталась бы в тексте и снова дала бы претензию.
 */
const CITE_TAG_RE = /<\/?cite\b[^>]*(?:>|$)/gi;

/** Схлопывание пробелов, оставшихся на месте снятого тега. Переводы строк не
 *  трогаем: абзацы в `summary` — это форматирование, а не мусор. */
function collapseSpaces(s: string): string {
  return s.replace(/[^\S\n]{2,}/g, ' ').replace(/^[^\S\n]+|[^\S\n]+$/g, '');
}

/**
 * Снимает теги цитирования web search, сохраняя текст внутри. Рекурсивно по всем
 * строковым значениям; возвращает НОВУЮ структуру — результат модели единственная
 * копия данных прогона, мутировать его нельзя.
 *
 * Строка без тегов возвращается как есть (той же ссылкой): чистка не должна
 * «попутно» трогать значения, к которым претензий нет.
 */
export function stripCiteTags<T>(value: T): T {
  if (typeof value === 'string') {
    const stripped = value.replace(CITE_TAG_RE, '');
    if (stripped === value) return value;
    return collapseSpaces(stripped) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => stripCiteTags(v)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = stripCiteTags(v);
    }
    return out as unknown as T;
  }
  return value;
}

/** JSON-тип значения в терминах JSON Schema (не `typeof`: массив и null — отдельно). */
function jsonTypeOf(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Совпадает ли фактический тип с объявленным. `declared` может быть:
 *   строкой   — 'array' | 'object' | 'string' | 'integer' | …
 *   массивом  — ['string','null'] (так объявлен deal_summary.next_step)
 *   отсутствовать — тогда сверять не с чем.
 * Возвращает null, когда проверка неприменима.
 */
function typeMatches(declared: unknown, actual: string): boolean | null {
  if (typeof declared === 'string') {
    // JSON Schema различает integer и number, JS — нет. Целочисленность
    // проверяет клиентский Zod (probability 0..100 int), здесь она не наша забота.
    if (declared === 'integer' || declared === 'number') return actual === 'number';
    return declared === actual;
  }
  if (Array.isArray(declared)) {
    if (declared.length === 0) return null;
    return declared.some((d) => typeMatches(d, actual) === true);
  }
  return null; // type не объявлен — пропускаем, а не считаем несовпадением
}

/** Рекурсивный обход всех СТРОКОВЫХ значений с путём до них. */
function forEachString(
  value: unknown,
  path: string,
  visit: (s: string, path: string) => void,
): void {
  if (typeof value === 'string') {
    visit(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => forEachString(v, `${path}[${i}]`, visit));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      forEachString(v, path ? `${path}.${k}` : k, visit);
    }
  }
}

/**
 * Форма ответа модели по `input_schema` инструмента + маркеры разметки в строках.
 * Пустой список = ответ годен.
 *
 * Проверок ТРИ, потому что ломается тремя способами:
 *  • тип верхнего уровня (tasks строкой вместо массива — 28.07);
 *  • пропущенные обязательные поля (3d5e6e70, 13.07: один ключ из шести);
 *  • разметка контракта внутри строки (`</client_situation>` — 13.07). Типовая
 *    проверка её не поймает: `client_situation` строка и должна быть строкой.
 *
 * ⚠️ Утверждение «`required` держит сама модель» опровергнуто фактом и убрано
 * отсюда: прогон 3d5e6e70 схлопнул весь payload в `client_situation`, и ретрай
 * случился бы СЛУЧАЙНО — только из-за маркера `</`. Без маркера огрызок вместо
 * записки прошёл бы с вердиктом «форма годна».
 */
export function checkResultShape(
  inputSchema: Record<string, unknown>,
  input: Record<string, unknown>,
): ShapeClaim[] {
  const claims: ShapeClaim[] = [];

  // ── Типовая (жёсткая) ──
  const properties = inputSchema?.properties as Record<string, unknown> | undefined;
  if (properties && typeof properties === 'object') {
    for (const [key, rawSpec] of Object.entries(properties)) {
      if (!(key in input)) continue; // ключа нет — не претензия
      const spec = rawSpec as { type?: unknown } | null;
      const actual = jsonTypeOf(input[key]);
      if (typeMatches(spec?.type, actual) === false) {
        claims.push({
          kind: 'hard',
          message: `${key}: ожидался ${JSON.stringify(spec?.type)}, пришёл ${actual}`,
        });
      }
    }
  }

  // ── Пропущенные обязательные поля (мягкая) ──
  // `required` модель НЕ держит: прогон 3d5e6e70 (13.07) вернул 1 ключ из 6.
  // Класс мягкий намеренно: претензия обязана вызвать ретрай, но не отказ —
  // частичный ответ пользователю полезнее пустого экрана, а второй попытки
  // обычно хватает. Проверка на живых данных: 5 из 7 прогонов дают 0 претензий,
  // пропуски только у двух уже известных испорченных.
  //
  // Только верхний уровень. Вложенные `required` (внутри `items` массивов —
  // ['claim','quote'], ['what','who','due'], ['text']) не проверяем: обход
  // элементов удваивает сложность модуля, а поштучно битые элементы уже
  // отсеивает клиентский Zod (`taskSchema.nullable().catch(null)` + filter).
  const required = inputSchema?.required;
  if (Array.isArray(required)) {
    for (const key of required) {
      if (typeof key === 'string' && !(key in input)) {
        claims.push({ kind: 'soft', message: `${key}: обязательное поле отсутствует` });
      }
    }
  }

  // ── Маркерная (мягкая) ──
  // Один маркер на путь: строка с десятью `</` — одна претензия, не десять.
  forEachString(input, '', (s, path) => {
    const hit = SHAPE_MARKERS.find((m) => s.includes(m));
    if (hit) {
      claims.push({ kind: 'soft', message: `${path || '(корень)'}: разметка «${hit}» в значении` });
    }
  });

  return claims;
}

export function hardClaims(claims: ShapeClaim[]): ShapeClaim[] {
  return claims.filter((c) => c.kind === 'hard');
}

export function softClaims(claims: ShapeClaim[]): ShapeClaim[] {
  return claims.filter((c) => c.kind === 'soft');
}

// ═══════════════════════════════════════════════════════
// S-LLM-SEARCH-2 — «Готово» с нулём источников не бывает.
//
// Первый боевой прогон брифа через OpenRouter вернул `sources: []`, вход в 8–16 раз
// меньше прежнего (4.8–10К токенов против 77–80К) и время 7–12 с против 42–49 с.
// Результатов поиска в контексте не было, модель написала «официального сайта не
// обнаружено» — и прогон ушёл в `done`. В карточке блок «Источники» просто не
// рисуется (CompanyBriefRenderer, условие `sources.length > 0`), поэтому пустой
// бриф выглядит как содержательный: продавец идёт на звонок с выдумкой.
//
// Почему это ЖЁСТКАЯ претензия, а не пометка в карточке:
//   • у пресета с `webSearch: true` веб — единственный источник данных, всё
//     остальное (реквизиты) он и так знал из <data kind="entity">. Ноль источников
//     значит «искать не получилось», а не «искали и не нашли»;
//   • легитимный «нашёл, но ничего нет» промптом предусмотрен для chz_signals и
//     recent_news («верни пустой список»), и он этой проверкой НЕ задет — пустыми
//     могут быть они, а не `sources`: страницы, по которым сделан вывод «ничего
//     нет», сами по себе источники и обязаны быть перечислены;
//   • жёсткая претензия попадает в общий контур: сначала РЕТРАЙ (случай как раз
//     повторяемый — второй поиск может отработать), и только потом отказ.
// Класс ошибки остаётся `shape` ⇒ кнопка «Повторить» на месте (`isRunErrorRetryable`).
// ═══════════════════════════════════════════════════════

/** Текст пользователю, когда поиск не дал ни одной ссылки. Живёт здесь, рядом с
 *  проверкой, чтобы формулировка и условие не разъехались. */
export const EMPTY_SOURCES_TEXT =
  'Поиск не дал ни одного источника — результат неполный. Попробуйте повторить.';

/**
 * Пустой `sources` у пресета с веб-поиском. Зовётся ТОЛЬКО для таких пресетов:
 * у остальных шести поля `sources` нет в схеме, и проверять там нечего.
 *
 * Неверный ТИП (`sources` строкой — второй симптом того же прогона) здесь молчит
 * намеренно: его уже поймал `checkResultShape`, и две претензии об одном факте
 * только засоряют `retry_reason`.
 */
export function checkSearchYield(input: Record<string, unknown>): ShapeClaim[] {
  const raw = input.sources;
  if (raw !== undefined && raw !== null && !Array.isArray(raw)) return [];
  // Пустая строка в списке — тот же ноль: ссылки, по которой можно кликнуть, нет.
  const usable = Array.isArray(raw)
    ? raw.filter((u) => typeof u === 'string' && u.trim() !== '')
    : [];
  if (usable.length > 0) return [];
  return [{
    kind: 'hard',
    code: 'empty_sources',
    message: 'sources: веб-поиск не дал ни одного источника',
  }];
}

/**
 * Подсказка ко второй попытке, когда претензия ровно одна — пустой поиск.
 * `SHAPE_RETRY_HINT` тут не годится: он говорит «ответ не соответствовал схеме»,
 * а схема как раз соблюдена. Неверная претензия толкает модель «чинить» формат
 * вместо того, чтобы поискать ещё раз.
 */
export const EMPTY_SOURCES_RETRY_HINT =
  'В предыдущем ответе не было ни одной ссылки на источник. Выполни веб-поиск и ' +
  'перечисли в поле sources URL страниц, на которые опираешься. Ответ без источников ' +
  'не будет принят.';

/** Есть ли среди претензий та, что объясняется пользователю своим текстом. */
export function hasEmptySources(claims: ShapeClaim[]): boolean {
  return claims.some((c) => c.code === 'empty_sources');
}

// ═══════════════════════════════════════════════════════
// S-BRIEF-2PASS — свидетельство поиска берётся у ПРОВАЙДЕРА, а не у модели.
//
// `checkSearchYield` выше проверяет `sources` — САМООТЧЁТ модели. Прод-прогон 19.08
// его прошёл: две ссылки, одна из которых сайт посторонней компании. Проверка
// осталась (она ловит свой случай), но одной её мало.
//
// `annotations` — поле ОТВЕТА OpenRouter: сколько ссылок веб-плагин втянул в
// контекст. Модель на него не влияет и соврать им не может. Ноль означает, что
// поиск не отработал вовсе — ровно ячейка B замера (форс инструмента подавил
// нативный поиск, 0 ссылок за 4,8 с) и прод 06:05 19.08.
//
// Две проверки — два РАЗНЫХ отказа, и объединять их нельзя:
//   • ноль annotations   → поиска не было           → виноват проход 1;
//   • ноль sources при непустых annotations → поиск был, модель не процитировала
//     → виноват проход 2, и переигрывать поиск незачем.
// ═══════════════════════════════════════════════════════

/** Текст пользователю, когда веб-поиск не отработал совсем. */
export const EMPTY_SEARCH_TEXT =
  'Веб-поиск не отработал — собирать бриф не из чего. Попробуйте повторить.';

/**
 * Ноль ссылок у первого прохода — жёсткая претензия.
 *
 * `null` — «неприменимо», а не ноль: ветка Anthropic числа ссылок не отдаёт вовсе,
 * а на ретрае формы проход 1 не выполняется. Обе ситуации обязаны молчать, иначе
 * рабочий прогон уйдёт в отказ на ровном месте.
 */
export function checkSearchAnnotations(annotations: number | null | undefined): ShapeClaim[] {
  if (typeof annotations !== 'number') return [];
  if (annotations > 0) return [];
  return [{
    kind: 'hard',
    code: 'empty_search',
    message: 'annotations: веб-поиск не втянул ни одной ссылки',
  }];
}

/**
 * Подсказка ко второй попытке при нулевом поиске. Адресована ПЕРВОМУ проходу:
 * повторяются оба, и просить «перечисли sources» бессмысленно — перечислять нечего.
 */
export const EMPTY_SEARCH_RETRY_HINT =
  'Предыдущая попытка не нашла в вебе ничего. Выполни веб-поиск заново и опиши ' +
  'найденное с указанием URL каждой страницы.';

/** Есть ли среди претензий «поиск не отработал» — она одна требует ПОВТОРА ПОИСКА. */
export function hasEmptySearch(claims: ShapeClaim[]): boolean {
  return claims.some((c) => c.code === 'empty_search');
}

// ═══════════════════════════════════════════════════════
// S-BRIEF-2PASS — `website` только с опорой на черновик.
//
// Прод дважды подставил `https://alev.ru/` — это «Алев», Ульяновск, посторонняя
// компания. Не галлюцинация: URL реально был в выдаче exa, и модель приняла его за
// сайт «Эйч энд Эн». Ошибка в отсутствии привязки URL к юрлицу, а поле это одним
// кликом «Подставить» пишется в карточку компании (AiCompanyPanel).
//
// Теперь опора есть — черновик первого прохода. Проверка ДЕТЕРМИНИРОВАННАЯ: хост
// обязан встречаться в тексте черновика.
//
// Претензия МЯГКАЯ, поле гасится в null: бриф без сайта полезен, бриф с чужим
// сайтом опасен, а ронять весь прогон из-за одного поля — хуже, чем сегодня.
// ═══════════════════════════════════════════════════════

/**
 * Хост из URL в сравнимом виде: нижний регистр, без `www.`, без порта.
 *
 * Схему дописываем, если её нет: `logikamoloka.ru` — валидный ответ по смыслу,
 * хотя схема и требуется схемой инструмента. `new URL` без схемы бросает.
 * Не разобралось — `null`, и вызывающий трактует это как «опоры нет».
 */
export function hostOf(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const host = new URL(withScheme).hostname.toLowerCase();
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return null;
  }
}

/**
 * Гасит `website`, если его хост не встречается в черновике.
 *
 * `draft` пуст или отсутствует (ветка Anthropic, где отдельного черновика нет) —
 * НИЧЕГО не делаем: опоры нет, и гасить поле было бы наказанием за чужую схему.
 *
 * Сравниваются ХОСТЫ, а не строки: `https://logikamoloka.ru/` в ответе и
 * `logikamoloka.ru` в черновике — одно и то же. `www.` отброшен с обеих сторон,
 * поэтому голый хост находится и внутри `https://www.logikamoloka.ru/about`.
 *
 * На `sources` ту же проверку НЕ вешаем: там 8–10 элементов, и это отдельный
 * разговор про доказательность, а не про одно опасное поле.
 */
export function groundWebsite(
  input: Record<string, unknown>,
  draft: string | null | undefined,
): { input: Record<string, unknown>; claims: ShapeClaim[] } {
  const text = typeof draft === 'string' ? draft.toLowerCase() : '';
  if (text === '') return { input, claims: [] };

  const raw = input.website;
  if (raw === undefined || raw === null || raw === '') return { input, claims: [] };

  const host = hostOf(raw);
  if (host !== null && text.includes(host)) return { input, claims: [] };

  return {
    input: { ...input, website: null },
    claims: [{
      kind: 'soft',
      code: 'ungrounded_website',
      message: `website: ${host ?? String(raw)} не встречается в найденных источниках — поле очищено`,
    }],
  };
}
