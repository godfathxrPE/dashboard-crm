import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  checkSearchAnnotations,
  checkSearchYield,
  groundWebsite,
  hasEmptySearch,
  hostOf,
  hardClaims,
  softClaims,
} from '../../supabase/functions/ai-run/shape';
import { actualRunCostRub, priceForSlug } from '@/lib/constants/ai-presets';

// ═══════════════════════════════════════════════════════
// S-BRIEF-2PASS — бриф в два прохода: Grok ищет, DeepSeek структурирует.
//
// Почему схема такая, а не один вызов: замер P-BRIEF-MODELS (одна компания,
// АО «ЭЙЧ ЭНД ЭН», каркас без поиска = 4 812 токенов входа) —
//   exa + форс инструмента      →  8 069 вход, 10 ссылок — сниппеты;
//   native + форс инструмента   →  3 330 вход,  0 ссылок — ОТКАЗ ПОИСКА;
//   native без форса            → 25 442 вход,  6 ссылок — страницы целиком.
// Один вызов не может одновременно искать нативно и вернуть структуру: форс
// подавляет поиск. Отсюда два прохода — и отсюда же половина этих тестов.
// ═══════════════════════════════════════════════════════

// ── Стенд для Deno-модуля _shared/llm.ts ─────────────────────────────────────
// Модуль читает секреты через `Deno.env.get` ВНУТРИ функций (не на верхнем
// уровне), поэтому из vitest он импортируется — достаточно подменить глобаль.
// Проверять тело запроса важнее, чем результат: вся правка спринта — про то,
// ЧТО именно уходит в апстрим на каждом из двух проходов.
const env = new Map<string, string>();
(globalThis as unknown as { Deno: unknown }).Deno = {
  env: { get: (key: string) => env.get(key) },
};
// jsdom не всегда несёт AbortSignal.timeout, а транспорт `post` его зовёт.
if (typeof AbortSignal.timeout !== 'function') {
  (AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout = () =>
    new AbortController().signal;
}

const { callLlmSearch } = await import('../../supabase/functions/_shared/llm');

type Body = Record<string, unknown>;
const bodies: Body[] = [];

/** Ответ провайдера в форме OpenAI. `ok: true` — транспорт читает только json(). */
function reply(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(payload),
    text: () => Promise.resolve(JSON.stringify(payload)),
  } as unknown as Response;
}

const DRAFT =
  'Компания переименована в «Логику молока», официальный сайт https://logikamoloka.ru/ ' +
  '(источник: https://www.rbc.ru/news/1). Выручка за 2024 год — 105,8 млрд ₽.';

const SEARCH_REPLY = {
  provider: 'xAI',
  model: 'x-ai/grok-4.3',
  choices: [{
    finish_reason: 'stop',
    message: { content: DRAFT, annotations: [{}, {}, {}, {}, {}, {}] },
  }],
  usage: { prompt_tokens: 25_442, completion_tokens: 1_200 },
};

const STRUCT_ARGS = {
  summary: 'Молочный холдинг',
  website: 'https://logikamoloka.ru/',
  sources: ['https://logikamoloka.ru/', 'https://www.rbc.ru/news/1'],
};

const STRUCT_REPLY = {
  provider: 'DeepSeek',
  model: 'deepseek/deepseek-v4-flash',
  choices: [{
    finish_reason: 'tool_calls',
    message: {
      tool_calls: [{
        function: { name: 'submit_company_brief', arguments: JSON.stringify(STRUCT_ARGS) },
      }],
    },
  }],
  usage: { prompt_tokens: 2_169, completion_tokens: 800 },
};

const TOOL = {
  name: 'submit_company_brief',
  description: 'Вернуть бриф по компании к звонку',
  input_schema: { type: 'object', properties: { website: { type: 'string' } } },
};

const OPTS = {
  model: 'claude-sonnet-5',
  maxTokens: 4096,
  system: 'системный промпт пресета. Отвечай ТОЛЬКО через вызов инструмента.',
  userTurn: '<data kind="company">\nКомпания: ЭЙЧ ЭНД ЭН\n</data>',
  tool: TOOL,
  providerEnvKey: 'AI_RUN_PROVIDER',
};

beforeEach(() => {
  bodies.length = 0;
  env.clear();
  env.set('LLM_PROVIDER', 'openrouter');
  env.set('OPENROUTER_API_KEY', 'sk-test');
  // Ответ выбирается ПО ТЕЛУ запроса, а не по порядку: на ретрае проход 1
  // пропускается, и очередь по счётчику отдала бы упаковщику ответ поисковика.
  globalThis.fetch = vi.fn((_url: unknown, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? '{}') as Body;
    bodies.push(body);
    return Promise.resolve(reply(body.tools ? STRUCT_REPLY : SEARCH_REPLY));
  }) as unknown as typeof fetch;
});

describe('два прохода: что уходит в апстрим', () => {
  it('проход 1 — поиск: без инструментов, плагин web с engine native', async () => {
    await callLlmSearch(OPTS);

    expect(bodies).toHaveLength(2);
    const search = bodies[0];
    // Главное утверждение спринта: форса тут нет. Именно он давал 0 ссылок.
    expect(search.tools).toBeUndefined();
    expect(search.tool_choice).toBeUndefined();
    expect(search.plugins).toEqual([{ id: 'web', engine: 'native' }]);
    // Слаг первого прохода — из секрета, дефолт по замеру.
    expect(search.model).toBe('x-ai/grok-4.3');
    // Потолок вывода поднят: на 4096 черновик обрывался по finish_reason='length'.
    expect(search.max_tokens).toBe(8192);
  });

  it('проход 2 — структура: без плагинов, с форсом инструмента, дешёвой моделью', async () => {
    await callLlmSearch(OPTS);

    const struct = bodies[1];
    expect(struct.plugins).toBeUndefined();
    expect(struct.tool_choice).toEqual({
      type: 'function',
      function: { name: 'submit_company_brief' },
    });
    expect(struct.model).toBe('deepseek/deepseek-v4-flash');
    expect(struct.max_tokens).toBe(4096);
  });

  it('черновик едет во второй проход как ДАННЫЕ, а не как инструкция', async () => {
    await callLlmSearch(OPTS);

    const messages = bodies[1].messages as { role: string; content: string }[];
    const user = messages.find((m) => m.role === 'user')!.content;
    expect(user).toContain('<data kind="web_research">');
    expect(user).toContain(DRAFT);
    // Реквизиты из CRM обязаны остаться: черновик их не заменяет, а дополняет.
    expect(user).toContain('Компания: ЭЙЧ ЭНД ЭН');
    // Анти-инъекционная преамбула пресета — та же, новых текстов не заводили.
    expect(messages.find((m) => m.role === 'system')!.content).toBe(OPTS.system);
  });

  it('в первом проходе хвост «вызови инструмент» переопределён — вызывать нечего', async () => {
    await callLlmSearch(OPTS);

    const messages = bodies[0].messages as { role: string; content: string }[];
    const system = messages.find((m) => m.role === 'system')!.content;
    expect(system).toContain(OPTS.system); // промпт пресета целиком на месте
    expect(system).toContain('инструментов нет'); // и переопределение поверх него
  });

  it('слаги проходов берутся из секретов', async () => {
    env.set('OPENROUTER_SEARCH_MODEL', 'x-ai/grok-4.6');
    env.set('OPENROUTER_STRUCT_MODEL', 'qwen/qwen3.7-flash');
    await callLlmSearch(OPTS);

    expect(bodies[0].model).toBe('x-ai/grok-4.6');
    expect(bodies[1].model).toBe('qwen/qwen3.7-flash');
  });

  it('движок переключается секретом, max_results — только у exa', async () => {
    env.set('OPENROUTER_SEARCH_ENGINE', 'exa');
    env.set('OPENROUTER_SEARCH_MAX_RESULTS', '10');
    await callLlmSearch(OPTS);

    expect(bodies[0].plugins).toEqual([{ id: 'web', engine: 'exa', max_results: 10 }]);
  });
});

describe('что возвращает callLlmSearch', () => {
  it('usage — СУММА обоих проходов, иначе журнал занизит расход', async () => {
    const res = await callLlmSearch(OPTS);

    expect(res.usage.input_tokens).toBe(25_442 + 2_169);
    expect(res.usage.output_tokens).toBe(1_200 + 800);
  });

  it('model — слаг ПЕРВОГО прохода, компаундного `a+b` не бывает', async () => {
    const res = await callLlmSearch(OPTS);

    expect(res.model).toBe('x-ai/grok-4.3');
    expect(res.model).not.toContain('+');
    // Слаг обязан быть тем же, что уехал в апстрим первым проходом.
    expect(res.model).toBe(bodies[0].model);
  });

  it('annotations и draft приезжают наружу, searches остаётся null', async () => {
    const res = await callLlmSearch(OPTS);

    expect(res.annotations).toBe(6);
    expect(res.draft).toBe(DRAFT);
    // Ссылки — не поиски. Подставлять одно вместо другого нельзя.
    expect(res.searches).toBeNull();
  });
});

describe('ретрай формы переигрывает только проход 2', () => {
  it('с черновиком — ровно один вызов, и это упаковка', async () => {
    const res = await callLlmSearch({
      ...OPTS,
      priorDraft: DRAFT,
      retryHint: 'Предыдущий ответ не соответствовал схеме инструмента.',
    });

    // Счётчик вызовов — суть проверки: второй поиск не оплачивается.
    expect(bodies).toHaveLength(1);
    expect(bodies[0].plugins).toBeUndefined();
    expect(bodies[0].tool_choice).toBeDefined();
    // Проход 1 не выполнялся ⇒ проверять его выхлоп не на чем: null, а не ноль.
    expect(res.annotations).toBeNull();
    // Черновик уехал дальше — по нему сверяется website второй попытки.
    expect(res.draft).toBe(DRAFT);
    // Оплачен только второй проход.
    expect(res.usage.input_tokens).toBe(2_169);
  });

  it('подсказка ретрая доезжает до user-хода вместе с черновиком', async () => {
    await callLlmSearch({ ...OPTS, priorDraft: DRAFT, retryHint: 'ПОДСКАЗКА-РЕТРАЯ' });

    const messages = bodies[0].messages as { role: string; content: string }[];
    const user = messages.find((m) => m.role === 'user')!.content;
    expect(user).toContain('ПОДСКАЗКА-РЕТРАЯ');
    expect(user).toContain('<data kind="web_research">');
  });

  it('без черновика (поиск не отработал) переигрываются ОБА прохода', async () => {
    // ai-run гасит priorDraft ровно в этом случае — иначе упаковка перепаковала бы пустоту.
    await callLlmSearch({ ...OPTS, priorDraft: null, retryHint: 'ищи заново' });

    expect(bodies).toHaveLength(2);
    expect(bodies[0].plugins).toEqual([{ id: 'web', engine: 'native' }]);
  });

  it('черновик БЕЗ retryHint не считается ретраем — поиск идёт как обычно', async () => {
    await callLlmSearch({ ...OPTS, priorDraft: DRAFT });

    expect(bodies).toHaveLength(2);
  });
});

describe('ноль annotations — отказ поиска, а не пустой результат', () => {
  it('ноль ссылок → жёсткая претензия своего класса', () => {
    const claims = checkSearchAnnotations(0);

    expect(claims).toHaveLength(1);
    expect(hardClaims(claims)).toHaveLength(1);
    expect(hasEmptySearch(claims)).toBe(true);
  });

  it('null — «неприменимо»: Anthropic и пропущенный проход 1 молчат', () => {
    // Ноль и null тут РАЗНЫЕ вещи; спутать их значит валить рабочие прогоны.
    expect(checkSearchAnnotations(null)).toEqual([]);
    expect(checkSearchAnnotations(undefined)).toEqual([]);
    expect(checkSearchAnnotations(6)).toEqual([]);
  });

  it('это ОТДЕЛЬНАЯ претензия от пустого sources — виноваты разные проходы', () => {
    // Поиск отработал (6 ссылок), но модель не процитировала ничего: виноват проход 2.
    const onlySources = [
      ...checkSearchYield({ sources: [] }),
      ...checkSearchAnnotations(6),
    ];
    expect(hasEmptySearch(onlySources)).toBe(false);
    expect(hardClaims(onlySources)).toHaveLength(1);

    // Поиска не было вовсе: виноват проход 1, и sources пуст как следствие.
    const both = [...checkSearchYield({ sources: [] }), ...checkSearchAnnotations(0)];
    expect(hasEmptySearch(both)).toBe(true);
    expect(hardClaims(both)).toHaveLength(2);
  });
});

describe('website обязан опираться на черновик', () => {
  it('хост из черновика — поле проходит', () => {
    const res = groundWebsite({ website: 'https://logikamoloka.ru/' }, DRAFT);

    expect(res.input.website).toBe('https://logikamoloka.ru/');
    expect(res.claims).toEqual([]);
  });

  it('чужой сайт гасится в null, претензия МЯГКАЯ — прогон не валится', () => {
    // Живой случай: прод дважды подставил alev.ru («Алев», Ульяновск) в поле,
    // которое одним кликом пишется в карточку компании.
    const res = groundWebsite({ summary: 'бриф', website: 'https://alev.ru/' }, DRAFT);

    expect(res.input.website).toBeNull();
    expect(res.input.summary).toBe('бриф'); // остальное не тронуто
    expect(softClaims(res.claims)).toHaveLength(1);
    expect(hardClaims(res.claims)).toHaveLength(0);
  });

  it('сравниваются ХОСТЫ, а не строки: www и схема роли не играют', () => {
    expect(hostOf('https://www.logikamoloka.ru/about?x=1')).toBe('logikamoloka.ru');
    expect(hostOf('logikamoloka.ru')).toBe('logikamoloka.ru');
    expect(hostOf('HTTPS://LogikaMoloka.RU')).toBe('logikamoloka.ru');
    expect(hostOf('не url')).toBeNull();
    expect(hostOf(null)).toBeNull();

    // Голый хост в ответе находится внутри полного URL черновика.
    expect(groundWebsite({ website: 'www.logikamoloka.ru' }, DRAFT).claims).toEqual([]);
  });

  it('нет черновика — поле не трогаем: опоры нет, наказывать не за что', () => {
    // Ветка Anthropic: черновика как отдельного шага там не существует.
    expect(groundWebsite({ website: 'https://alev.ru/' }, null).input.website)
      .toBe('https://alev.ru/');
    expect(groundWebsite({ website: 'https://alev.ru/' }, '').claims).toEqual([]);
  });

  it('website уже null или отсутствует — молчим', () => {
    expect(groundWebsite({ website: null }, DRAFT).claims).toEqual([]);
    expect(groundWebsite({ summary: 'x' }, DRAFT).claims).toEqual([]);
  });
});

describe('цена: неизвестный слаг — пусто, а не ноль', () => {
  it('actualRunCostRub для слагов новых проходов возвращает null', () => {
    // PRICE_BY_SLUG пополняется отдельным заходом. До тех пор карточка обязана
    // НЕ рисовать строку про рубли, а не показывать «0 ₽» за прогон за $0.06.
    expect(actualRunCostRub(25_442, 1_200, 'x-ai/grok-4.3')).toBeNull();
    expect(actualRunCostRub(2_169, 800, 'deepseek/deepseek-v4-flash')).toBeNull();
    expect(priceForSlug('x-ai/grok-4.3')).toBeNull();
  });

  it('точка против дефиса в слагах Anthropic — долг, а не фикс этого спринта', () => {
    // В каталоге OpenRouter слаг `anthropic/claude-haiku-4.5`, в PRICE_BY_SLUG —
    // `claude-haiku-4-5`. normalizeSlug точку не нормализует ⇒ цена молча null.
    // Тест фиксирует ФАКТ, чтобы находка не потерялась (см. отчёт спринта).
    expect(priceForSlug('anthropic/claude-haiku-4-5')).not.toBeNull();
    expect(priceForSlug('anthropic/claude-haiku-4.5')).toBeNull();
  });
});
