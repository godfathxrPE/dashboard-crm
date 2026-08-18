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
 */
export class LlmError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly provider: LlmProvider,
  ) {
    super(message);
    this.name = 'LlmError';
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
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | null;
      tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>;
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
    throw new LlmError(resp.status, `LLM API ${resp.status}`, provider);
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
  }, provider, timeoutMs) as OpenRouterResponse;

  // OpenRouter умеет отвечать 200 с телом-ошибкой (сбой провайдера уже после
  // маршрутизации). Без этой проверки такой ответ выглядел бы как «модель промолчала».
  if (data.error) {
    console.error('openrouter body error:', JSON.stringify(data.error).slice(0, 500));
    throw new LlmError(data.error.code ?? 502, 'LLM upstream error', provider);
  }

  const call = data.choices?.[0]?.message?.tool_calls?.find(
    (c) => c.function?.name === opts.tool.name,
  ) ?? data.choices?.[0]?.message?.tool_calls?.[0];
  const rawArgs = call?.function?.arguments;
  if (typeof rawArgs !== 'string' || !rawArgs.trim()) {
    console.error('No tool_calls in openrouter response, finish_reason:', data.choices?.[0]?.finish_reason);
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
    // Частая причина — обрыв по max_tokens посреди JSON. Логируем хвост, чтобы
    // отличить обрыв от галлюцинации формата, но наружу деталей не отдаём.
    console.error('tool arguments parse failed:', err, 'tail:', rawArgs.slice(-200));
    throw new LlmError(422, 'Модель вернула невалидный JSON инструмента', provider);
  }

  return {
    input,
    usage: {
      input_tokens: data.usage?.prompt_tokens,
      output_tokens: data.usage?.completion_tokens,
    },
    model,
  };
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
