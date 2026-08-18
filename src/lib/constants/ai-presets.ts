// Sprint AI-1: клиентский реестр AI-пресетов — ТОЛЬКО метаданные для UI
// (кнопки, оценка стоимости, выбор renderer). System-промпты и tool-схемы
// живут ТОЛЬКО в edge-функции ai-run (injection-контур: промпт не в БД/не на клиенте).

export type PresetKey =
  | 'meeting_protocol'
  | 'analytic_note'
  | 'spin_review'
  | 'deal_progression'
  | 'meeting_prep'
  | 'deal_summary'
  | 'company_brief';

/** R2-P0-C: пресет Smart Deal Progression — единственный, чей вывод пишется в сделку. */
export const PROGRESSION_PRESET_KEY = 'deal_progression' satisfies PresetKey;

/**
 * 085/104. Сущность, к которой привязан прогон. `project` добавлен под read-only
 * пресеты по сделке (085), `company` — под бриф по компании (104). Три места обязаны
 * совпадать: CHECK `ai_runs_entity_type_check` в БД (актуальная редакция — 104),
 * `entityTypes` в реестре PRESETS edge-функции, `entityTypes` здесь. Держит тестом
 * `tests/unit/ai-presets-sync.test.ts`.
 */
export type AiEntityType = 'call' | 'meeting' | 'project' | 'company';

export type PresetMeta = {
  key: PresetKey;
  title: string;
  description: string;
  input: 'transcript' | 'transcript+entity' | 'entity';
  entityTypes: AiEntityType[];
  /**
   * 085. Транскрипт обязателен — зеркало `needsTranscript` в edge и списка пресетов
   * в CHECK `ai_runs_transcript_required`. UI по этому флагу решает, блокировать ли
   * кнопку при пустом транскрипте.
   */
  needsTranscript: boolean;
  /** Read-only пресет: результат показывается, в сделку ничего не пишется. */
  readOnly: boolean;
  /**
   * S-COMPANY-AI-1a. Прогон ходит в веб (серверный web search Anthropic) — зеркало
   * `webSearch` в реестре PRESETS edge-функции, как `needsTranscript`. UI по этому
   * флагу считает стоимость иначе: вход такого прогона — не карточка сущности, а
   * втянутые в контекст веб-страницы, и оценка по charCount занижает его в разы.
   */
  webSearch?: boolean;
  model: 'sonnet' | 'haiku';
  maxInputChars: number;
};

export const AI_PRESETS: PresetMeta[] = [
  {
    key: 'meeting_protocol',
    title: 'Протокол встречи',
    description: 'Участники, повестка, решения, задачи с ответственными и сроками, открытые вопросы.',
    input: 'transcript',
    entityTypes: ['call', 'meeting'],
    needsTranscript: true,
    readOnly: true,
    model: 'sonnet',
    maxInputChars: 120_000,
  },
  {
    key: 'analytic_note',
    title: 'Аналитическая записка',
    description: 'Ситуация клиента, боли, стейкхолдеры, риски сделки, рекомендации, аргументы для КП.',
    input: 'transcript+entity',
    entityTypes: ['call', 'meeting'],
    // 085: без транскрипта записка строится по заметкам/договорённостям сущности.
    needsTranscript: false,
    readOnly: true,
    model: 'sonnet',
    maxInputChars: 120_000,
  },
  {
    // R2-P0-C. entityTypes зеркалит реестр PRESETS в edge ai-run — правится синхронно.
    key: 'deal_progression',
    title: 'Обновить сделку',
    description:
      'Черновик обновления сделки по разговору: следующий шаг, дата, заметка, вероятность, задачи. ' +
      'Ничего не применяется само — вы отмечаете галочками, что записать.',
    input: 'transcript+entity',
    entityTypes: ['call', 'meeting'],
    // 085: смена решения S-R2-SDP-1 — ограничение переехало в UI (кнопка disabled,
    // когда нет ни транскрипта, ни заметок), а не исчезло.
    needsTranscript: false,
    readOnly: false,
    model: 'sonnet',
    maxInputChars: 120_000,
  },
  {
    key: 'spin_review',
    title: 'SPIN-разбор звонка',
    description: 'Счёт S/P/I/N с цитатами, что упущено, 3 вопроса к следующему звонку, оценка 1–10.',
    input: 'transcript',
    entityTypes: ['call'],
    needsTranscript: true,
    readOnly: true,
    model: 'sonnet',
    maxInputChars: 120_000,
  },
  {
    // S-R2-AI-HARDEN (085). Read-only пресеты по сделке: транскрипта нет по определению.
    key: 'meeting_prep',
    title: 'Бриф к встрече',
    description:
      'С кем предстоит говорить, о чём встреча, что открыто и висит, что спросить. ' +
      'Только чтение — в сделку ничего не пишется.',
    input: 'entity',
    entityTypes: ['project'],
    needsTranscript: false,
    readOnly: true,
    model: 'sonnet',
    maxInputChars: 120_000,
  },
  {
    key: 'deal_summary',
    title: 'Сводка по сделке',
    description:
      'Где сделка сейчас, что произошло, следующий шаг, флаги внимания — коротко, для руководителя. ' +
      'Только чтение.',
    input: 'entity',
    entityTypes: ['project'],
    needsTranscript: false,
    readOnly: true,
    model: 'haiku',
    maxInputChars: 120_000,
  },
  {
    // S-COMPANY-AI-1 (104). Единственный пресет по компании и единственный, который
    // ходит в веб. Описание честное намеренно: пользователь должен понимать, что это
    // выжимка открытых источников со ссылками, а не «знание» модели о компании.
    key: 'company_brief',
    title: 'Бриф по компании',
    description:
      'Чем занимается, масштаб, свежие новости, признаки работы с Честным Знаком — ' +
      'поиск по открытым источникам, все утверждения со ссылками. Только чтение: ' +
      'найденный сайт предлагается подставить вручную.',
    input: 'entity',
    entityTypes: ['company'],
    needsTranscript: false,
    readOnly: true,
    webSearch: true,
    model: 'sonnet',
    // Вход — карточка компании, не транскрипт: зеркалит maxInputChars пресета в edge.
    maxInputChars: 20_000,
  },
];

export function presetsForEntity(entityType: AiEntityType): PresetMeta[] {
  return AI_PRESETS.filter((p) => p.entityTypes.includes(entityType));
}

export function presetByKey(key: string): PresetMeta | undefined {
  return AI_PRESETS.find((p) => p.key === key);
}

/**
 * Человеческое название пресета для лент и заголовков.
 *
 * S-AI-VIS-1: в ленте активности событие называлось `AI: analytic_note` — машинным
 * ключом из БД. Фолбэк — сам ключ, а не «Неизвестный пресет» и тем более не
 * `undefined`: реестр здесь клиентский, а прогон мог уйти по пресету, которого этот
 * клиент ещё не знает (edge обновляется отдельно от фронта). Ключ хотя бы говорит,
 * что это было.
 */
export function presetTitle(key: string): string {
  return presetByKey(key)?.title ?? key;
}

// ═══════════════════════════════════════════════════════
// Экономика прогона (S-LLM-OPENROUTER-1: правка после переезда на OpenRouter)
//
// ⚠️ ДО спринта прайс ключевался РОЛЬЮ пресета (`sonnet` / `haiku`), и это
// работало ровно потому, что роль однозначно задавала модель. После переезда
// слаг задаётся секретом (`AI_RUN_MODEL_SONNET` и соседи), а провайдер —
// `LLM_PROVIDER`; роль перестала говорить о цене хоть что-нибудь. Поэтому:
//
//   • ФАКТ (карточка прогона) считается по СЛАГУ из `ai_runs.model` —
//     слаг самодостаточен, провайдера знать не нужно;
//   • ПРОГНОЗ (кнопки пресетов) денег больше не показывает вовсе — клиенту
//     не известно, какая модель отработает, и угадывать он не должен.
//     Вместо рублей — объём входа в токенах.
// ═══════════════════════════════════════════════════════

/**
 * Прайс по СЛАГУ модели, $ за 1M токенов.
 *
 * ⚠️ Неизвестный слаг — НЕ повод угадать: `priceForSlug` вернёт null, и цена не
 * покажется вовсе. Число, взятое от похожей модели, врёт правдоподобно, а это
 * худший вид вранья в строке про деньги.
 *
 * Цены — СНАПШОТ С ДАТОЙ (как `USD_RUB`), сверено 2026-08-18 по справочнику
 * моделей Anthropic. Это ПРАЙС-ЛИСТ ANTHROPIC: через OpenRouter те же слаги
 * идут примерно по нему же, но провайдерская наценка сюда не заложена.
 * Модели не-Anthropic в таблицу не внесены намеренно — их цен на руках нет,
 * а выдумывать их значит вернуть ровно тот дефект, который спринт и чинит.
 *
 * ⚠️ `claude-sonnet-5` — $2/$10, и это СТАНДАРТНАЯ цена, а не акция. Объявленная
 * при запуске как вводная до 2026-08-31, она стала списочной; запланированный
 * переход на $3/$15 с 1 сентября отменён (сверено с прайс-листом 2026-08-18).
 * Прежняя редакция этой таблицы держала $3/$15 «чтобы не устарело после акции» —
 * завышение в полтора раза на большинстве пресетов. Осторожность в сторону
 * завышения не безопаснее занижения: неверное число одинаково не годится там,
 * где его подписывают словом «факт».
 */
export const PRICE_BY_SLUG: Record<string, { in: number; out: number }> = {
  'claude-opus-5': { in: 5, out: 25 },
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-opus-4-7': { in: 5, out: 25 },
  'claude-opus-4-6': { in: 5, out: 25 },
  'claude-sonnet-5': { in: 2, out: 10 },
  'claude-sonnet-4-6': { in: 3, out: 15 },
  // ⚠️ Прежняя таблица держала haiku как 0.8/4 — это прайс Haiku 3.5, снятой
  // с поддержки: расход считался по цене модели, которой в проде нет.
  'claude-haiku-4-5': { in: 1, out: 5 },
  'claude-haiku-4-5-20251001': { in: 1, out: 5 },
  'claude-fable-5': { in: 10, out: 50 },
};

/** Вендорный префикс OpenRouter у моделей Anthropic. */
const ANTHROPIC_VENDOR = 'anthropic/';

/**
 * `anthropic/claude-haiku-4-5` и `claude-haiku-4-5` — одна строка таблицы:
 * адаптер дописывает вендор при `LLM_PROVIDER=openrouter` и срезает его при
 * прямом Anthropic, а в `ai_runs.model` попадает значение секрета КАК ЕСТЬ.
 *
 * Срезается ТОЛЬКО `anthropic/`. Срезать любой префикс до `/` нельзя: тогда
 * выдуманный `bedrock/claude-opus-5` получил бы цену Anthropic, хотя тариф там
 * другой — это снова угадывание, от которого спринт и уходит.
 */
function normalizeSlug(slug: string): string {
  const s = slug.trim().toLowerCase();
  return s.startsWith(ANTHROPIC_VENDOR) ? s.slice(ANTHROPIC_VENDOR.length) : s;
}

/** null — слаг неизвестен, цену показывать нельзя. */
export function priceForSlug(slug: string | null | undefined): { in: number; out: number } | null {
  if (!slug) return null;
  return PRICE_BY_SLUG[normalizeSlug(slug)] ?? null;
}

/** Слаг относится к Anthropic — только у них тарифицируется веб-поиск. */
export function isAnthropicSlug(slug: string | null | undefined): boolean {
  if (!slug) return false;
  const s = slug.trim().toLowerCase();
  return s.startsWith(ANTHROPIC_VENDOR) || s.startsWith('claude-');
}

/**
 * S-COST-TRUTH-1. Курс — СНАПШОТ С ДАТОЙ, а не вечная константа: значение без даты
 * через полгода врёт молча, и заметить это невозможно — цена выглядит правдоподобно
 * всегда. Тот же приём, что у справочников ЧЗ (инвариант 4 линейки company-ai).
 *
 * Сверено: 2026-08-09 (подтвердил Олег). Прежнее значение 100 держалось с 2026-08-03
 * и завышало на четверть И прогноз, И ФАКТ — `actualRunCostRub` считает по этой же
 * константе, то есть «фактическая цена прогона» в карточке тоже была неверной.
 */
export const USD_RUB = 85;

/**
 * S-COMPANY-AI-1a. Веб-поиск Anthropic тарифицируется ОТДЕЛЬНО от токенов:
 * $10 за 1000 запросов (сверено 2026-08-18). Пять поисков брифа — это $0.05,
 * то есть ~4 ₽ сверх токенов.
 *
 * ⚠️ Тариф ANTHROPIC'ОВСКИЙ. Веб-поиск на OpenRouter не переехал (`callClaudeWithSearch`
 * ходит в api.anthropic.com напрямую), поэтому надбавка считается только у
 * anthropic-слага — см. `actualRunCostRub`.
 */
const WEB_SEARCH_USD_PER_REQUEST = 10 / 1_000;

/** Кириллица в токенизаторе Claude — примерно 2.5 символа на токен (константа проекта). */
export const CHARS_PER_TOKEN = 2.5;

/**
 * Эмпирика прогонов брифа. **Перезамер 2026-08-09 по 12 прогонам в проде**
 * (`ai_runs`, status='done', preset_key='company_brief'):
 *   input  45 219 … 124 755 (среднее 84 289)
 *   output  1 928 …   5 610 (среднее  3 895)
 *   searches 4 или 5 (у двух старых прогонов meta.searches нет вовсе)
 *
 * ⚠️ Диапазон описывает РАЗБРОС ВХОДА: сколько страниц веб-поиск втянет в
 * контекст, заранее не знает никто. Это ЗАМЕР, а не формула — меняется поведение
 * прогона, перезамерить запросом к `ai_runs`, а не подгонять под ожидание.
 */
const WEB_RUN = {
  minInTok: 45_000, maxInTok: 125_000,
  minOutTok: 2_000, maxOutTok: 5_600,
  searches: 5,
};

function rub(usd: number): number {
  return Math.round(usd * USD_RUB * 10) / 10;
}

/**
 * ФАКТ по завершённому прогону — из `ai_runs.input_tokens` / `output_tokens`,
 * `ai_runs.model` и (для пресетов с поиском) `result.meta.searches`.
 *
 * ⚠️ Возвращает `number | null`. `null` = слаг модели неизвестен таблице цен;
 * вызывающий обязан НЕ рисовать строку про рубли (см. `RunCostMeta`). Пустое
 * место честнее неверного числа: токены и слаг в строке уже есть, по ним расход
 * считается вручную за минуту.
 *
 * `searches` не передан или null — веб-запросы в цену не входят: null значит
 * «неизвестно», а не «ноль», и додумывать пять поисков за модель мы не станем.
 */
export function actualRunCostRub(
  inputTokens: number,
  outputTokens: number,
  modelSlug: string | null | undefined,
  searches: number | null = null,
): number | null {
  const price = priceForSlug(modelSlug);
  if (!price) return null;
  const tokensUsd = (inputTokens * price.in + outputTokens * price.out) / 1_000_000;
  const searchUsd = isAnthropicSlug(modelSlug) ? (searches ?? 0) * WEB_SEARCH_USD_PER_REQUEST : 0;
  return rub(tokensUsd + searchUsd);
}

// ═══════════════════════════════════════════════════════
// ПРОГНОЗ до запуска — объём, а не деньги
//
// Клиент не знает, какая модель отработает: слаг и провайдер живут в секретах
// edge-функции, а класть их копию в NEXT_PUBLIC_* нельзя — это два источника
// одной правды, которые молча разойдутся на первом же переключении секрета.
// Поэтому рублёвый прогноз после переезда необоснован В ПРИНЦИПЕ, а не временно
// неточен. Объём входа пользователь соотносит с «дорого/дёшево» сам.
// ═══════════════════════════════════════════════════════

/** Оценка входа в токенах по длине текста. */
export function estimateInputTokens(charCount: number): number {
  return Math.max(0, Math.round(charCount / CHARS_PER_TOKEN));
}

/** «34К» / «850». Тысячи — с русской «К», как в остальном UI. */
export function formatTokens(tokens: number): string {
  const t = Math.max(0, Math.round(tokens));
  return t >= 1_000 ? `${Math.round(t / 1_000)}К` : String(t);
}

/**
 * Подпись объёма на кнопке пресета. Одна формула на все три панели — иначе
 * они разойдутся ровно так же, как разошлись бы копии прайса.
 *
 * У пресета с веб-поиском вход задаёт не карточка сущности, а втянутые в
 * контекст страницы, поэтому там диапазон замеров, а не оценка по символам.
 */
export function runVolumeLabel(preset: PresetMeta, charCount: number): string {
  if (preset.webSearch) {
    return `≈ ${formatTokens(WEB_RUN.minInTok)}–${formatTokens(WEB_RUN.maxInTok)} токенов входа`;
  }
  return `≈ ${formatTokens(estimateInputTokens(charCount))} токенов входа`;
}

/** Пояснение под подписью объёма — почему тут нет рублей. */
export const RUN_VOLUME_HINT =
  'Стоимость зависит от модели и провайдера — они задаются секретами функции. ' +
  'Фактический расход виден в карточке прогона после выполнения.';
