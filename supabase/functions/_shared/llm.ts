// supabase/functions/_shared/llm.ts
//
// Единая точка вызова LLM для всех edge-функций. Появилась при переезде с прямого
// Anthropic Messages API на OpenRouter: раньше `fetch('https://api.anthropic.com/...')`
// был скопирован в четырёх функциях, и смена провайдера означала четыре правки
// в четырёх местах с четырьмя шансами разойтись.
//
// Контракт адаптера — форма ОТВЕТА Anthropic (то, что уже разбирает вызывающий код):
//   callLlmTool → { input, usage: { input_tokens, output_tokens } }
//   callLlmText → { text, truncated, usage }
// Провайдерские различия (OpenAI-формат tools у OpenRouter, arguments строкой,
// prompt_tokens вместо input_tokens) прячутся здесь и наружу не текут.
//
// Security:
//   1. Ключи — только из Deno.env, наружу (в текст ошибки, в ответ) не отдаются.
//      Тело ошибки апстрима кладём в console.error, вызывающему — код и краткая метка.
//   2. Данные пользователя ходят тем же путём, что и раньше: system + user-turn.
//      Анти-injection преамбулы остаются на стороне вызывающих функций.
//   3. `data_collection: 'deny'` по умолчанию у OpenRouter — маршрутизация в обход
//      провайдеров, которые логируют промпты для обучения. В CRM ходят ПДн и
//      коммерческие условия клиентов, это не тот случай, где экономят на политике.

import { classifyLlmError, type LlmErrorKind } from './llm-error.ts';
export { classifyLlmError };
export type { LlmErrorKind };

export type LlmProvider = 'anthropic' | 'openrouter';

/** Инструмент в формате Anthropic — исторический формат проекта, конвертируется внутри. */
export type LlmTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

/** Токены в терминах Anthropic. Для OpenRouter маппится из prompt_/completion_tokens. */
export type LlmUsage = { input_tokens?: number; output_tokens?: number };

export type LlmToolResult = {
  input: Record<string, unknown>;
  usage: LlmUsage;
  /** Фактический слаг модели, который ушёл в апстрим. В журнал ai_runs пишем именно его. */
  model: string;
};

export type LlmTextResult = {
  text: string;
  /** Ответ обрезан лимитом max_tokens — показываем явно, а не склеиваем молча. */
  truncated: boolean;
  usage: LlmUsage;
  model: string;
};


/**
 * Ошибка вызова LLM. `status` — HTTP апстрима, чтобы вызывающий сохранил своё
 * отображение кодов (429 апстрима → 429 клиенту в transcribe). Значения вне HTTP:
 *   0   — сеть/таймаут (fetch бросил),
 *   422 — апстрим ответил 200, но структурированного результата в ответе нет.
 *
 * `kind` — то же самое, но в терминах «что делать пользователю» (см. выше).
 */
export class LlmError extends Error {
  readonly kind: LlmErrorKind;

  constructor(
    readonly status: number,
    message: string,
    readonly provider: LlmProvider,
    kind?: LlmErrorKind,
  ) {
    super(message);
    this.name = 'LlmError';
    this.kind = kind ?? classifyLlmError(status);
  }
}

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_TIMEOUT_MS = 75_000;

/**
 * Провайдер по умолчанию — `anthropic`. Дефолт намеренно совпадает с поведением
 * ДО миграции: функция, задеплоенная без нового секрета, работает ровно как раньше.
 * Переключение — секретом LLM_PROVIDER, без редеплоя кода.
 *
 * `override` — имя функционального секрета (например AI_RUN_PROVIDER): позволяет
 * переводить функции по одной, а не все разом.
 */
export function resolveProvider(overrideEnvKey?: string): LlmProvider {
  const raw = (overrideEnvKey ? Deno.env.get(overrideEnvKey) : undefined) ??
    Deno.env.get('LLM_PROVIDER') ?? 'anthropic';
  return raw.trim().toLowerCase() === 'openrouter' ? 'openrouter' : 'anthropic';
}

/** Ключ провайдера. Отсутствует → LlmError(500): наружу вызывающий отдаёт свой текст. */
export function resolveApiKey(provider: LlmProvider): string {
  const envKey = provider === 'openrouter' ? 'OPENROUTER_API_KEY' : 'ANTHROPIC_API_KEY';
  const key = Deno.env.get(envKey);
  if (!key) {
    console.error(`${envKey} is not configured`);
    throw new LlmError(500, `${envKey} is not configured`, provider);
  }
  return key;
}

/**
 * Слаг модели под провайдера.
 *
 * У OpenRouter слаг всегда с вендором: `deepseek/deepseek-v4-flash`. Старые значения
 * секретов (`claude-haiku-4-5`) вендора не содержат — им дописываем `anthropic/`,
 * чтобы переключение LLM_PROVIDER не требовало одновременной правки всех секретов
 * с моделями. Обратный случай (слаг с вендором на прямом Anthropic) — режем префикс:
 * api.anthropic.com такого слага не знает и ответит 404.
 */
export function resolveModel(model: string, provider: LlmProvider): string {
  const trimmed = model.trim();
  if (provider === 'openrouter') {
    return trimmed.includes('/') ? trimmed : `anthropic/${trimmed}`;
  }
  return trimmed.startsWith('anthropic/') ? trimmed.slice('anthropic/'.length) : trimmed;
}

type BaseOpts = {
  model: string;
  maxTokens: number;
  system: string;
  userTurn: string;
  /** Имя функционального секрета-переключателя, например 'AI_RUN_PROVIDER'. */
  providerEnvKey?: string;
  timeoutMs?: number;
};

/** Тело ответа OpenRouter в части, которую мы читаем. Остальное игнорируем осознанно. */
type OpenRouterResponse = {
  error?: { message?: string; code?: number };
  /** Кто ФАКТИЧЕСКИ обслужил запрос после маршрутизации ('Anthropic', 'Google AI Studio', …). */
  provider?: string;
  /** Слаг модели глазами OpenRouter: может отличаться от запрошенного (алиас, авто-роутинг). */
  model?: string;
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | null;
      tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>;
      /** Цитаты веб-плагина. Нам нужна только ДЛИНА — «сколько ссылок приехало в контекст». */
      annotations?: unknown[];
    };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

type AnthropicResponse = {
  content?: Array<{ type: string; name?: string; text?: string; input?: Record<string, unknown> }>;
  stop_reason?: string;
  usage?: LlmUsage;
};

/**
 * Общий транспорт: POST + таймаут + единая обработка не-2xx.
 * Тело ошибки апстрима логируем усечённым и НЕ возвращаем наружу — там детали ключа,
 * тарифа и внутренних лимитов провайдера.
 */
async function post(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  provider: LlmProvider,
  timeoutMs: number,
): Promise<unknown> {
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    console.error(`${provider} fetch failed:`, err);
    throw new LlmError(0, 'LLM upstream unreachable', provider);
  }

  if (!resp.ok) {
    const detail = await resp.text();
    console.error(`${provider} API error:`, resp.status, detail.slice(0, 500));
    // Тело нужно ТОЛЬКО для классификации (400 про баланс ≠ 400 про кривой запрос)
    // и наружу не уходит: в нём детали ключа, тарифа и внутренних лимитов провайдера.
    throw new LlmError(resp.status, `LLM API ${resp.status}`, provider, classifyLlmError(resp.status, detail));
  }

  return await resp.json();
}

/**
 * Заголовки OpenRouter. HTTP-Referer / X-Title необязательны — они лишь подписывают
 * трафик в консоли OpenRouter, помогая разделить расходы по функциям.
 */
function openRouterHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { authorization: `Bearer ${apiKey}` };
  const referer = Deno.env.get('OPENROUTER_APP_URL');
  const title = Deno.env.get('OPENROUTER_APP_TITLE');
  if (referer) headers['HTTP-Referer'] = referer;
  if (title) headers['X-Title'] = title;
  return headers;
}

/**
 * Маршрутизация OpenRouter.
 *
 * `require_parameters: true` — не косметика, а условие корректности: при false
 * запрос может уехать к провайдеру, который не поддерживает tool_choice, и тот
 * молча ПРОИГНОРИРУЕТ форс — вместо структурированного результата вернётся текст,
 * и функция отдаст 502 на ровном месте. С true такие провайдеры исключены из
 * маршрутизации. Источник: OpenRouter, Provider Routing.
 *
 * `data_collection` управляется секретом на случай, если понадобится расширить
 * пул провайдеров ради цены; дефолт — 'deny'.
 */
function openRouterProviderPrefs(): Record<string, unknown> {
  const collection = Deno.env.get('OPENROUTER_DATA_COLLECTION') === 'allow' ? 'allow' : 'deny';
  const prefs: Record<string, unknown> = {
    require_parameters: true,
    data_collection: collection,
  };
  const order = Deno.env.get('OPENROUTER_PROVIDER_ORDER');
  if (order) {
    prefs.order = order.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return prefs;
}

/**
 * Слабые модели иногда заворачивают JSON-аргументы в markdown-забор ```json … ```.
 * Anthropic такого не делает, DeepSeek/Qwen — бывает. Снимаем забор до JSON.parse:
 * это дешевле, чем ретрай целого вызова.
 */
function stripFence(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
}

/**
 * OpenRouter-ветка вызова с форсированным инструментом. Вынесена из `callLlmTool`,
 * чтобы её переиспользовал `callLlmSearch`: у OpenRouter поиск — это ТО ЖЕ САМОЕ
 * тело запроса плюс поле `plugins`, а не отдельный протокол (см. шапку `callLlmSearch`).
 *
 * `plugins` не передан — обычный вызов без веба, байт в байт как было.
 */
async function openRouterTool(
  opts: BaseOpts & { tool: LlmTool },
  model: string,
  apiKey: string,
  timeoutMs: number,
  provider: LlmProvider,
  plugins?: Record<string, unknown>[],
): Promise<{ input: Record<string, unknown>; usage: LlmUsage }> {
  const data = await post(OPENROUTER_URL, openRouterHeaders(apiKey), {
    model,
    max_tokens: opts.maxTokens,
    // У OpenAI-формата нет отдельного поля system — это первое сообщение диалога.
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.userTurn },
    ],
    tools: [{
      type: 'function',
      function: {
        name: opts.tool.name,
        description: opts.tool.description,
        // input_schema (Anthropic) и parameters (OpenAI) — один и тот же JSON Schema.
        parameters: opts.tool.input_schema,
      },
    }],
    tool_choice: { type: 'function', function: { name: opts.tool.name } },
    provider: openRouterProviderPrefs(),
    ...(plugins ? { plugins } : {}),
  }, provider, timeoutMs) as OpenRouterResponse;

  // OpenRouter умеет отвечать 200 с телом-ошибкой (сбой провайдера уже после
  // маршрутизации). Без этой проверки такой ответ выглядел бы как «модель промолчала».
  if (data.error) {
    console.error('openrouter body error:', JSON.stringify(data.error).slice(0, 500));
    throw new LlmError(data.error.code ?? 502, 'LLM upstream error', provider);
  }

  const message = data.choices?.[0]?.message;

  // S-LLM-SEARCH-2. Успешный ответ не логировался ВООБЩЕ — поэтому первый боевой
  // регресс (бриф с нулём источников на входе в 8–16 раз меньше прежнего) нельзя было
  // разобрать постфактум: мы не знали ни кто обслужил запрос, ни приехали ли цитаты.
  // Строка одна, `log` а не `error` (это норма, а не сбой), без тел и без ключей:
  // обслуживший провайдер, слаг его глазами, число цитат плагина, причина остановки.
  // `annotations` — число НАЙДЕННЫХ ССЫЛОК, а не выполненных поисков (см. `searches`).
  console.log('openrouter response:', JSON.stringify({
    provider: data.provider ?? null,
    model: data.model ?? null,
    annotations: message?.annotations?.length ?? 0,
    tool_calls: message?.tool_calls?.length ?? 0,
    finish_reason: data.choices?.[0]?.finish_reason ?? null,
    plugins: plugins ? plugins.map((p) => p.id).join(',') : null,
  }));

  const call = message?.tool_calls?.find(
    (c) => c.function?.name === opts.tool.name,
  ) ?? message?.tool_calls?.[0];
  const rawArgs = call?.function?.arguments;
  if (typeof rawArgs !== 'string' || !rawArgs.trim()) {
    // Голова content'а нужна, чтобы отличить «модель промолчала» от «модель ИМИТИРОВАЛА
    // вызов инструмента текстом» (`<parameter name=` в ответе — ровно этот случай).
    console.error(
      'No tool_calls in openrouter response, finish_reason:',
      data.choices?.[0]?.finish_reason,
      'content head:',
      (message?.content ?? '').slice(0, 300),
    );
    throw new LlmError(422, 'Модель не вернула структурированный результат', provider);
  }

  let input: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(stripFence(rawArgs));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('arguments is not an object');
    }
    input = parsed as Record<string, unknown>;
  } catch (err) {
    // Частая причина — обрыв по max_tokens посреди JSON: его видно по ХВОСТУ.
    // Голова (300 символов) отвечает на другой вопрос — «а что вообще пришло»:
    // забор ```json, разметка tool-use, чужой формат. Наружу деталей не отдаём.
    console.error(
      'tool arguments parse failed:', err,
      'head:', rawArgs.slice(0, 300),
      'tail:', rawArgs.slice(-200),
    );
    throw new LlmError(422, 'Модель вернула невалидный JSON инструмента', provider);
  }
  return {
    input,
    usage: {
      input_tokens: data.usage?.prompt_tokens,
      output_tokens: data.usage?.completion_tokens,
    },
  };
}

/**
 * Вызов модели с ФОРСИРОВАННЫМ инструментом — «tool use trick» для структурированного
 * вывода. Ровно тот путь, которым до миграции ходили ai-run (callClaude), ai-summarize
 * и ai-capture: один инструмент, tool_choice форсирован, ответ = аргументы инструмента.
 *
 * НЕ покрывает сценарий с веб-поиском (ai-run, callClaudeWithSearch): там несколько
 * инструментов, tool_choice: auto, серверный web_search Anthropic и продолжение диалога
 * по stop_reason: 'pause_turn'. У OpenRouter это другой инструмент с другим форматом
 * цитат, и переносить его надо отдельной задачей, а не заодно.
 */
export async function callLlmTool(
  opts: BaseOpts & { tool: LlmTool },
): Promise<LlmToolResult> {
  const provider = resolveProvider(opts.providerEnvKey);
  const apiKey = resolveApiKey(provider);
  const model = resolveModel(opts.model, provider);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (provider === 'anthropic') {
    const data = await post(ANTHROPIC_URL, {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    }, {
      model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages: [{ role: 'user', content: opts.userTurn }],
      tools: [opts.tool],
      tool_choice: { type: 'tool', name: opts.tool.name },
    }, provider, timeoutMs) as AnthropicResponse;

    const toolUse = data.content?.find((b) => b.type === 'tool_use' && b.name === opts.tool.name);
    if (!toolUse?.input) {
      console.error('No tool_use in anthropic response');
      throw new LlmError(422, 'Модель не вернула структурированный результат', provider);
    }
    return { input: toolUse.input, usage: data.usage ?? {}, model };
  }

  return { ...await openRouterTool(opts, model, apiKey, timeoutMs, provider), model };
}

/**
 * Вызов модели за обычным текстом, без инструментов — путь вычитки транскрипта
 * (transcribe, action='cleanup'). `truncated` считаем по признаку обрыва лимитом:
 * у Anthropic это stop_reason='max_tokens', у OpenAI-формата finish_reason='length'.
 */
export async function callLlmText(opts: BaseOpts): Promise<LlmTextResult> {
  const provider = resolveProvider(opts.providerEnvKey);
  const apiKey = resolveApiKey(provider);
  const model = resolveModel(opts.model, provider);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (provider === 'anthropic') {
    const data = await post(ANTHROPIC_URL, {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    }, {
      model,
      max_tokens: opts.maxTokens,
      // temperature НЕ задаём: в claude-sonnet-5 параметр deprecated и запрос
      // с ним падает 400 (поймано в trans-app — не повторять).
      system: opts.system,
      messages: [{ role: 'user', content: opts.userTurn }],
    }, provider, timeoutMs) as AnthropicResponse;

    const text = data.content?.find((b) => b.type === 'text')?.text?.trim() ?? '';
    if (!text) throw new LlmError(422, 'Пустой текстовый блок в ответе модели', provider);
    return {
      text,
      truncated: data.stop_reason === 'max_tokens',
      usage: data.usage ?? {},
      model,
    };
  }

  const data = await post(OPENROUTER_URL, openRouterHeaders(apiKey), {
    model,
    max_tokens: opts.maxTokens,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: opts.userTurn },
    ],
    provider: openRouterProviderPrefs(),
  }, provider, timeoutMs) as OpenRouterResponse;

  if (data.error) {
    console.error('openrouter body error:', JSON.stringify(data.error).slice(0, 500));
    throw new LlmError(data.error.code ?? 502, 'LLM upstream error', provider);
  }

  const text = data.choices?.[0]?.message?.content?.trim() ?? '';
  if (!text) throw new LlmError(422, 'Пустой текстовый блок в ответе модели', provider);

  return {
    text,
    truncated: data.choices?.[0]?.finish_reason === 'length',
    usage: {
      input_tokens: data.usage?.prompt_tokens,
      output_tokens: data.usage?.completion_tokens,
    },
    model,
  };
}


// ═══════════════════════════════════════════════════════
// S-LLM-SEARCH-1: вызов С ВЕБ-ПОИСКОМ
//
// ⚠️ ДВЕ ВЕТКИ УСТРОЕНЫ ПРИНЦИПИАЛЬНО ПО-РАЗНОМУ, и это не разнобой, а разница
// самих провайдеров:
//
//   • ANTHROPIC — поиск это СЕРВЕРНЫЙ ИНСТРУМЕНТ ВНУТРИ ДИАЛОГА. Отсюда
//     `tool_choice: auto` (форс несовместим с поиском: модель обязана вызвать
//     submit немедленно и искать не успевает), `server_tool_use` в ответе,
//     `stop_reason: 'pause_turn'` и цикл продолжений. Ветка перенесена из
//     `ai-run/callClaudeWithSearch` МЕХАНИЧЕСКИ: она рабочая, проверена смоками
//     085 и fix-S-R2-AI-SHAPE, и единственная причина её трогать — переезд в
//     общий модуль. Единственное содержательное изменение — транспорт `post()`
//     вместо своего `fetch`: оттуда бесплатно приходят таймаут, классы ошибок
//     и запрет отдавать тело апстрима наружу.
//
//   • OPENROUTER — поиск это ПЛАГИН, отрабатывающий ДО генерации: результаты
//     подмешиваются в контекст текстом, и модель просто отвечает по ним. Значит
//     `pause_turn` не существует, цикл продолжений не нужен, а структурированный
//     вывод берётся ОБЫЧНЫМ ФОРСОМ инструмента. То есть это `callLlmTool` плюс
//     поле `plugins` — ровно поэтому OpenRouter-тело вынесено в `openRouterTool`.
// ═══════════════════════════════════════════════════════

/** Сообщение диалога. `content` — строка или массив блоков; разбирать его здесь
 *  незачем: оно едет обратно в API как есть. */
export type LlmSearchMessage = { role: 'user' | 'assistant'; content: unknown };

export type LlmSearchResult = {
  input: Record<string, unknown>;
  usage: LlmUsage;
  model: string;
  /**
   * Сколько веб-запросов РЕАЛЬНО выполнено. `null` — провайдер не сказал.
   *
   * ⚠️ null здесь значит «неизвестно», а не «ноль», и подставлять единицу нельзя:
   * стоимость с придуманным числом поисков — то же правдоподобное враньё, которое
   * чинил S-LLM-OPENROUTER-1. OpenRouter числа поисков не отдаёт вовсе (сверено с
   * документацией плагина 2026-08-18: в ответе только `annotations`, никаких
   * usage-полей про поиск) — оттуда всегда null.
   */
  searches: number | null;
  /** Диалог попытки — только у Anthropic; ретрай продолжит его вместо нового поиска. */
  messages: LlmSearchMessage[];
};

/**
 * Версия API инструмента: `web_search_20250305` — базовый вариант, работающий на
 * любой модели. Есть более новый `web_search_20260209` (динамическая фильтрация),
 * но он требует модель не ниже Sonnet 4.6 / Opus 4.6, а модель здесь подменяется
 * секретом без редеплоя — на старой модели новый тип даст 400 на весь прогон.
 * Меняем осознанно и вместе с пином модели.
 */
const WEB_SEARCH_TOOL = {
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 5, // потолок стоимости прогона; 5 поисков хватает на бриф по компании
};

/** Сколько раз продолжаем серверный цикл Anthropic после `pause_turn`. */
const MAX_SEARCH_CONTINUATIONS = 2;

type SearchBlock = { type: string; id?: string; name?: string; input?: Record<string, unknown> };

/**
 * Пользовательский ход, которым продолжается диалог на ретрае формы (Anthropic).
 *
 * Просто дописать `{role:'user', content: hint}` нельзя: последний ход ассистента
 * заканчивается блоком `tool_use`, а API требует, чтобы СЛЕДУЮЩЕЕ сообщение
 * начиналось с `tool_result` на каждый такой блок — иначе 400 на весь запрос.
 * Блоки веб-поиска (`server_tool_use`) сюда не относятся: их результат сервер
 * кладёт в тот же ход ассистента сам.
 */
function retryTurn(prior: LlmSearchMessage[], hint: string): LlmSearchMessage {
  const last = prior[prior.length - 1];
  const blocks = Array.isArray(last?.content) ? last.content as SearchBlock[] : [];
  const content: unknown[] = blocks
    .filter((b) => b.type === 'tool_use' && typeof b.id === 'string')
    .map((b) => ({
      type: 'tool_result',
      tool_use_id: b.id,
      content: 'Результат не принят: не соответствует схеме инструмента.',
    }));
  content.push({ type: 'text', text: hint });
  return { role: 'user', content };
}

/**
 * Плагин веба OpenRouter.
 *
 * ⚠️ `max_uses: 5` у Anthropic и `max_results` у OpenRouter — РАЗНЫЕ ВЕЛИЧИНЫ:
 * первое ограничивает число ПОИСКОВ, второе — число РЕЗУЛЬТАТОВ на поиск. Приравнять
 * их одной константой значит считать потолок стоимости неверно, поэтому у них разные
 * секреты и разные дефолты.
 *
 * ⚠️ `OPENROUTER_SEARCH_ENGINE=exa` в проде ОБЯЗАТЕЛЕН, хотя параметр и необязательный.
 * Дефолт OpenRouter для anthropic-слагов — `native`, то есть серверный веб-поиск внутри
 * генерации. Мы форсируем `tool_choice` ради структурированного вывода, а форс не
 * оставляет модели хода на поиск: она сразу вызывает инструмент. Результат — бриф со
 * статусом «Готово», нулём источников и сочинённым текстом (прогоны 18–19.08: вход
 * 4.8–10К токенов против 77–80К, 7–12 с против 42–49 с, sources = 0).
 * Снятие пина = возврат этого отказа. Проверено на проде 19.08: exa → 5 источников.
 */
function webPlugin(): Record<string, unknown> {
  const plugin: Record<string, unknown> = { id: 'web' };
  const raw = Deno.env.get('OPENROUTER_SEARCH_MAX_RESULTS');
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  plugin.max_results = Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
  const engine = Deno.env.get('OPENROUTER_SEARCH_ENGINE');
  if (engine) plugin.engine = engine.trim();
  return plugin;
}

/**
 * `priorMessages` — диалог первой попытки. Передан вместе с `retryHint` — это РЕТРАЙ ФОРМЫ.
 *
 *   • Anthropic: вторая попытка ПРОДОЛЖАЕТ диалог — модель уже нашла источники, её просят
 *     переупаковать результат, а не искать заново. Без этого ретрай был полным повторным
 *     прогоном: новые веб-запросы, оплаченный заново контекст, удвоенное ожидание
 *     (85 с на живых прогонах 2026-08-03).
 *
 *   • OpenRouter: `priorMessages` ИГНОРИРУЮТСЯ намеренно. Мы пиним `engine: exa`
 *     (см. `webPlugin`), а exa отрабатывает ДО генерации и подмешивает результаты
 *     в контекст на каждом запросе — продолжение диалога всё равно оплатило бы новый
 *     поиск, и экономия, ради которой заводился `priorMessages`, там недостижима.
 *     Поэтому ретрай идёт полным повторным вызовом с подсказкой в user-turn, ровно как
 *     у остальных шести пресетов. Цена — один лишний поиск (~$0.007), дешевле, чем
 *     городить историю tool_calls в OpenAI-формате ради экономии, которой нет.
 *
 *     ⚠️ Это рассуждение держится на `engine: exa`. При `native` поиск был бы серверным
 *     инструментом ВНУТРИ генерации (как у Anthropic) — и тогда `priorMessages` снова
 *     имели бы смысл. Меняешь движок — перечитай этот блок.
 */
export async function callLlmSearch(
  opts: BaseOpts & {
    tool: LlmTool;
    priorMessages?: LlmSearchMessage[];
    retryHint?: string;
  },
): Promise<LlmSearchResult> {
  const provider = resolveProvider(opts.providerEnvKey);
  const apiKey = resolveApiKey(provider);
  const model = resolveModel(opts.model, provider);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (provider === 'openrouter') {
    const userTurn = opts.retryHint ? `${opts.userTurn}\n\n${opts.retryHint}` : opts.userTurn;
    const res = await openRouterTool(
      { ...opts, userTurn },
      model,
      apiKey,
      timeoutMs,
      provider,
      [webPlugin()],
    );
    // searches: провайдер числа поисков не сообщает. Считать по длине annotations
    // нельзя — это число НАЙДЕННЫХ ССЫЛОК, а не выполненных запросов.
    return { ...res, model, searches: null, messages: [] };
  }

  const messages: LlmSearchMessage[] = opts.priorMessages && opts.retryHint
    ? [...opts.priorMessages, retryTurn(opts.priorMessages, opts.retryHint)]
    : [
      {
        role: 'user',
        content:
          `${opts.userTurn}\n\nСначала выполни поиск в вебе по тому, что нужно найти, ` +
          `затем ОБЯЗАТЕЛЬНО заверши ответ вызовом инструмента ${opts.tool.name}. ` +
          `Ответ без вызова инструмента не будет принят.`,
      },
    ];

  // Токены суммируем по всем продолжениям: прогон оплачен целиком, и журнал
  // обязан показывать полную стоимость, а не последнюю итерацию.
  let inputTokens = 0;
  let outputTokens = 0;
  let sawUsage = false;
  let searches: number | null = null;

  for (let i = 0; i <= MAX_SEARCH_CONTINUATIONS; i++) {
    const data = await post(ANTHROPIC_URL, {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    }, {
      model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages,
      tools: [WEB_SEARCH_TOOL, opts.tool],
      tool_choice: { type: 'auto' },
    }, provider, timeoutMs) as AnthropicResponse & {
      usage?: LlmUsage & { server_tool_use?: { web_search_requests?: number } };
    };

    if (typeof data.usage?.input_tokens === 'number') {
      inputTokens += data.usage.input_tokens;
      sawUsage = true;
    }
    if (typeof data.usage?.output_tokens === 'number') {
      outputTokens += data.usage.output_tokens;
      sawUsage = true;
    }
    const used = data.usage?.server_tool_use?.web_search_requests;
    if (typeof used === 'number') searches = (searches ?? 0) + used;

    const toolUse = data.content?.find((b) => b.type === 'tool_use' && b.name === opts.tool.name);
    if (toolUse?.input) {
      return {
        input: toolUse.input,
        usage: sawUsage ? { input_tokens: inputTokens, output_tokens: outputTokens } : {},
        model,
        searches,
        // Диалог отдаём вместе с последним ходом ассистента: ретрай продолжит именно его.
        messages: [...messages, { role: 'assistant', content: data.content ?? [] }],
      };
    }

    // Серверный цикл поиска упёрся в лимит итераций — продолжаем, повторив запрос
    // с ответом ассистента. Отдельного user-сообщения слать НЕ нужно: сервер видит
    // хвостовой server_tool_use и возобновляет работу сам.
    if (data.stop_reason === 'pause_turn' && data.content) {
      messages.push({ role: 'assistant', content: data.content });
      continue;
    }
    break;
  }

  throw new LlmError(422, 'Модель не вернула структурированный результат', provider);
}
