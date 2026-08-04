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

// Грубая оценка стоимости для UI («≈ N ₽ за прогон»). Цены — ESTIMATED, вынести в один источник.
const PRICE_PER_MTOK = { sonnet: { in: 3, out: 15 }, haiku: { in: 0.8, out: 4 } }; // $ / 1M токенов
const USD_RUB = 100;
/**
 * S-COMPANY-AI-1a. Веб-поиск Anthropic тарифицируется ОТДЕЛЬНО от токенов:
 * $10 за 1000 запросов (сверено 2026-08). Пять поисков брифа — это $0.05, то есть
 * 5 ₽ сверх токенов; на фоне «≈ 3.5 ₽», которые показывала кнопка, это уже больше
 * всей прежней оценки.
 */
const WEB_SEARCH_USD_PER_REQUEST = 10 / 1_000;

/**
 * Эмпирика прогонов брифа (гейт 2026-08-03, 2 прогона на проде): одна попытка с
 * поиском — ~40К входных токенов (веб-страницы, втянутые в контекст) и ~3К выходных
 * при потолке 5 поисков. Ретрай формы после S-COMPANY-AI-1a продолжает тот же диалог:
 * контекст оплачивается ещё раз (+ход ассистента), новых поисков нет.
 *
 * Эти числа — не формула, а замер. Меняется поведение прогона — перезамерить.
 */
const WEB_RUN = { inTok: 40_000, outTok: 3_000, searches: 5, retryInTok: 45_000 };

function rub(usd: number): number {
  return Math.round(usd * USD_RUB * 10) / 10;
}

function tokensUsd(inTok: number, outTok: number, model: 'sonnet' | 'haiku'): number {
  return (inTok * PRICE_PER_MTOK[model].in + outTok * PRICE_PER_MTOK[model].out) / 1_000_000;
}

export function estimateRunCostRub(charCount: number, model: 'sonnet' | 'haiku'): number {
  // chars/4 — эвристика для английского; кириллица токенизируется плотнее (~2.5 символа/токен).
  const inTok = charCount / 2.5;
  const outTok = 2_000; // ~2К выход на структурированный ответ
  return rub(tokensUsd(inTok, outTok, model));
}

/**
 * Оценка для пресета с веб-поиском — ДИАПАЗОН, а не число: разброс между «попытка
 * одна» и «была вторая» больше, чем точность любой из оценок. Считать такой прогон
 * по charCount нельзя вовсе — вход задаёт не карточка компании, а веб.
 *
 * Округляем до целых рублей: десятые здесь врали бы о точности замера.
 */
export function estimateWebRunCostRub(model: 'sonnet' | 'haiku'): { min: number; max: number } {
  const searchUsd = WEB_RUN.searches * WEB_SEARCH_USD_PER_REQUEST;
  const one = tokensUsd(WEB_RUN.inTok, WEB_RUN.outTok, model) + searchUsd;
  const withRetry = one + tokensUsd(WEB_RUN.retryInTok, WEB_RUN.outTok, model);
  return { min: Math.round(rub(one)), max: Math.round(rub(withRetry)) };
}

/**
 * Факт по завершённому прогону — из `ai_runs.input_tokens` / `output_tokens` и
 * (для пресетов с поиском) `result.meta.searches`. Прогноз всегда врёт, факт — нет.
 *
 * `searches` не передан или null — веб-запросы в цену не входят: null значит
 * «неизвестно», а не «ноль», и додумывать пять поисков за модель мы не станем.
 */
export function actualRunCostRub(
  inputTokens: number,
  outputTokens: number,
  model: 'sonnet' | 'haiku',
  searches: number | null = null,
): number {
  return rub(tokensUsd(inputTokens, outputTokens, model) + (searches ?? 0) * WEB_SEARCH_USD_PER_REQUEST);
}
