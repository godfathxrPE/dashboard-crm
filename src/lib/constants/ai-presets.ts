// Sprint AI-1: клиентский реестр AI-пресетов — ТОЛЬКО метаданные для UI
// (кнопки, оценка стоимости, выбор renderer). System-промпты и tool-схемы
// живут ТОЛЬКО в edge-функции ai-run (injection-контур: промпт не в БД/не на клиенте).

export type PresetKey = 'meeting_protocol' | 'analytic_note' | 'spin_review';

export type PresetMeta = {
  key: PresetKey;
  title: string;
  description: string;
  input: 'transcript' | 'transcript+entity';
  entityTypes: ('call' | 'meeting')[];
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
    model: 'sonnet',
    maxInputChars: 120_000,
  },
  {
    key: 'analytic_note',
    title: 'Аналитическая записка',
    description: 'Ситуация клиента, боли, стейкхолдеры, риски сделки, рекомендации, аргументы для КП.',
    input: 'transcript+entity',
    entityTypes: ['call', 'meeting'],
    model: 'sonnet',
    maxInputChars: 120_000,
  },
  {
    key: 'spin_review',
    title: 'SPIN-разбор звонка',
    description: 'Счёт S/P/I/N с цитатами, что упущено, 3 вопроса к следующему звонку, оценка 1–10.',
    input: 'transcript',
    entityTypes: ['call'],
    model: 'sonnet',
    maxInputChars: 120_000,
  },
];

export function presetsForEntity(entityType: 'call' | 'meeting'): PresetMeta[] {
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
