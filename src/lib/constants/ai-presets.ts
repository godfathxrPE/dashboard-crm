// Sprint AI-1: клиентский реестр AI-пресетов — ТОЛЬКО метаданные для UI
// (кнопки, оценка стоимости, выбор renderer). System-промпты и tool-схемы
// живут ТОЛЬКО в edge-функции ai-run (injection-контур: промпт не в БД/не на клиенте).

export type PresetKey =
  | 'meeting_protocol'
  | 'analytic_note'
  | 'spin_review'
  | 'deal_progression'
  | 'meeting_prep'
  | 'deal_summary';

/** R2-P0-C: пресет Smart Deal Progression — единственный, чей вывод пишется в сделку. */
export const PROGRESSION_PRESET_KEY = 'deal_progression' satisfies PresetKey;

/**
 * 085. Сущность, к которой привязан прогон. `project` добавлен под read-only пресеты
 * по сделке. Три места обязаны совпадать: CHECK `ai_runs_entity_type_check` в БД,
 * `entityTypes` в реестре PRESETS edge-функции, `entityTypes` здесь.
 */
export type AiEntityType = 'call' | 'meeting' | 'project';

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

export function estimateRunCostRub(charCount: number, model: 'sonnet' | 'haiku'): number {
  // chars/4 — эвристика для английского; кириллица токенизируется плотнее (~2.5 символа/токен).
  const inTok = charCount / 2.5;
  const outTok = 2_000; // ~2К выход на структурированный ответ
  const usd = (inTok * PRICE_PER_MTOK[model].in + outTok * PRICE_PER_MTOK[model].out) / 1_000_000;
  return Math.round(usd * USD_RUB * 10) / 10;
}
