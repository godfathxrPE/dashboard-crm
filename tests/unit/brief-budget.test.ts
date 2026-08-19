import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  createInFlightRuns,
  flushInFlightRuns,
} from '../../supabase/functions/ai-run/in-flight';

// ═══════════════════════════════════════════════════════
// S-BRIEF-BUDGET — общий бюджет времени вместо двух статических потолков.
//
// Первый живой прогон двухпроходного брифа (19.08 11:41) отработал проходом 1 на
// сорок один источник — и упал на проходе 2 по потолку 25 000 мс. Число было взято
// от одного замера в 22 с, то есть запас 14% на провайдере, уже показавшем 22 с.
// Причинно-следственная связь обратная ожидаемой: ЧЕМ ЛУЧШЕ ИЩЕТ ПРОХОД 1, ТЕМ
// ВЕРНЕЕ ПРОМАХИВАЕТСЯ СТАТИЧЕСКИЙ ПОТОЛОК ПРОХОДА 2 — толще черновик, больше вход
// упаковщика, дольше упаковка. Поднять 25 000 до 40 000 значило бы переставить ту
// же грабку на шаг дальше.
//
// S-BRIEF-BUDGET-2. Числа пересчитаны по РЕАЛЬНОМУ лимиту: шлюз Supabase (~90 с) к
// `processRun` не относится вовсе — он живёт в `EdgeRuntime.waitUntil`, а `ai-run`
// отвечает `{ run_id }` сразу. Потолок — wall clock ВОРКЕРА (150 с на Free), отсюда
// бюджет 100 с. Отказ «остатка не хватает» заменён ПОЛОМ в 25 с: превысить оценочный
// бюджет не смертельно, отказать — смертельно точно.
//
// Эти тесты держат арифметику остатка, пол, запись расхода на пути `catch`, потолок
// черновика с логом и реестр прогонов в работе.
// ═══════════════════════════════════════════════════════

// ── Стенд для Deno-модуля _shared/llm.ts ─────────────────────────────────────
const env = new Map<string, string>();
(globalThis as unknown as { Deno: unknown }).Deno = {
  env: { get: (key: string) => env.get(key) },
};

/** Сроки, с которыми транспорт звал AbortSignal.timeout — по одному на запрос. */
const timeouts: number[] = [];
(AbortSignal as unknown as { timeout: (ms: number) => AbortSignal }).timeout = (ms: number) => {
  timeouts.push(ms);
  return new AbortController().signal;
};

const { callLlmSearch, LlmError } = await import('../../supabase/functions/_shared/llm');

type Body = Record<string, unknown>;

function reply(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload),
    text: () => Promise.resolve(JSON.stringify(payload)),
  } as unknown as Response;
}

const DRAFT = 'Компания переименована в «Логику молока», сайт https://logikamoloka.ru/.';

const SEARCH_REPLY = {
  provider: 'xAI',
  model: 'x-ai/grok-4.3',
  choices: [{
    finish_reason: 'stop',
    message: { content: DRAFT, annotations: [{}, {}, {}, {}, {}, {}] },
  }],
  usage: { prompt_tokens: 25_442, completion_tokens: 1_200 },
};

const STRUCT_REPLY = {
  provider: 'DeepSeek',
  model: 'deepseek/deepseek-v4-flash',
  choices: [{
    finish_reason: 'tool_calls',
    message: {
      tool_calls: [{
        function: {
          name: 'submit_company_brief',
          arguments: JSON.stringify({ summary: 'Молочный холдинг', sources: ['https://x.ru/'] }),
        },
      }],
    },
  }],
  usage: { prompt_tokens: 2_169, completion_tokens: 800 },
};

const OPTS = {
  model: 'claude-sonnet-5',
  maxTokens: 4096,
  system: 'системный промпт пресета',
  systemSearch: 'системный промпт поиска',
  userTurn: '<data kind="company">\nКомпания: ЭЙЧ ЭНД ЭН\n</data>',
  tool: {
    name: 'submit_company_brief',
    description: 'Вернуть бриф по компании к звонку',
    input_schema: { type: 'object', properties: { summary: { type: 'string' } } },
  },
  providerEnvKey: 'AI_RUN_PROVIDER',
};

const bodies: Body[] = [];
/** Управляемые часы: адаптер меряет проход 1 через Date.now, а не оценивает его. */
let clock = 1_700_000_000_000;

/**
 * Стенд одного прогона. `searchMs` — сколько «занимает» проход 1: мок двигает часы
 * ровно на этот срок, и остаток бюджета считается по нему, как в бою.
 */
function stand(opts: {
  searchMs?: number;
  search?: unknown;
  searchStatus?: number;
  struct?: unknown;
  structStatus?: number;
} = {}) {
  const searchMs = opts.searchMs ?? 20_000;
  globalThis.fetch = vi.fn((_url: unknown, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? '{}') as Body;
    bodies.push(body);
    if (body.tools) {
      return Promise.resolve(reply(opts.struct ?? STRUCT_REPLY, opts.structStatus ?? 200));
    }
    clock += searchMs;
    return Promise.resolve(reply(opts.search ?? SEARCH_REPLY, opts.searchStatus ?? 200));
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  bodies.length = 0;
  timeouts.length = 0;
  clock = 1_700_000_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
  env.clear();
  env.set('LLM_PROVIDER', 'openrouter');
  env.set('OPENROUTER_API_KEY', 'sk-test');
  stand();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('срок прохода 2 — ОСТАТОК бюджета, а не константа', () => {
  it('проход 1 занял 27 с ⇒ упаковщику достаётся 73 с, а не статичные 25', async () => {
    stand({ searchMs: 27_000 });
    await callLlmSearch(OPTS);

    expect(timeouts).toHaveLength(2);
    expect(timeouts[1]).toBe(100_000 - 27_000);
    // Ради этого числа спринт и затевался: 25 000 уронили бы ровно этот прогон.
    expect(timeouts[1]).toBeGreaterThan(25_000);
  });

  it('быстрый поиск отдаёт упаковщику больше, медленный — меньше', async () => {
    stand({ searchMs: 10_000 });
    await callLlmSearch(OPTS);
    const fast = timeouts[1];

    bodies.length = 0;
    timeouts.length = 0;
    clock = 1_700_000_000_000;
    stand({ searchMs: 45_000 });
    await callLlmSearch(OPTS);
    const slow = timeouts[1];

    expect(fast).toBe(90_000);
    expect(slow).toBe(55_000);
    // Сумма не выходит за бюджет ни в каком случае — это и есть смысл правки.
    expect(10_000 + fast).toBe(100_000);
    expect(45_000 + slow).toBe(100_000);
  });

  it('проход 1 упёрся в свой потолок ⇒ упаковщику ровно столько же', async () => {
    // Худший случай: 50 + 50 = 100 с при wall clock воркера 150 с.
    stand({ searchMs: 50_000 });
    await callLlmSearch(OPTS);

    expect(timeouts[0]).toBe(50_000);
    expect(timeouts[1]).toBe(50_000);
    expect(timeouts[0] + timeouts[1]).toBeLessThanOrEqual(100_000);
  });

  it('ретрай формы: поиска не было ⇒ упаковщику весь бюджет', async () => {
    // Проход 1 пропущен, его время равно нулю — вычитать нечего.
    await callLlmSearch({ ...OPTS, priorDraft: DRAFT, retryHint: 'не по схеме' });

    expect(bodies).toHaveLength(1);
    expect(timeouts).toEqual([100_000]);
  });
});

describe('остаток меньше пола ⇒ проход 2 всё равно ЗОВЁМ', () => {
  it('гипотетические 90 с поиска ⇒ упаковщику пол 25 с, вызов состоялся', async () => {
    // Прежняя редакция здесь ОТКАЗЫВАЛА до вызова — придуманная стена: бюджет
    // оценочный, а потеря оплаченного черновика гарантированная.
    stand({ searchMs: 90_000 });
    const res = await callLlmSearch(OPTS);

    expect(bodies).toHaveLength(2);
    expect(timeouts[1]).toBe(25_000);
    expect(res.usage.input_tokens).toBe(25_442 + 2_169);
  });

  it('перерасход бюджета попадает в лог — это не норма, хоть и не ошибка', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stand({ searchMs: 90_000 });
    await callLlmSearch(OPTS);

    const line = warn.mock.calls.find((c) => String(c[0]).includes('overran the budget'));
    expect(line, 'перерасход обязан быть в логе').toBeDefined();
    expect(JSON.parse(String(line![1])).search_ms).toBe(90_000);
  });

  it('граница: 75 с оставляют ровно пол, пол не «дотягивает» остаток вверх', async () => {
    stand({ searchMs: 75_000 });
    await callLlmSearch(OPTS);

    expect(timeouts[1]).toBe(25_000);
  });

  it('настоящий таймаут прохода 2 никуда не делся', async () => {
    // Ветку `timedOut` снял бы только предварительный отказ; сам отвал по времени
    // по-прежнему приезжает своим текстом.
    globalThis.fetch = vi.fn((_url: unknown, init?: { body?: string }) => {
      const body = JSON.parse(init?.body ?? '{}') as Body;
      bodies.push(body);
      if (body.tools) {
        const err = new Error('Signal timed out.');
        err.name = 'TimeoutError';
        return Promise.reject(err);
      }
      clock += 20_000;
      return Promise.resolve(reply(SEARCH_REPLY));
    }) as unknown as typeof fetch;

    const err = await callLlmSearch(OPTS).catch((e: unknown) => e) as InstanceType<typeof LlmError>;

    expect(err.timedOut).toBe(true);
    expect(err.kind).toBe('upstream');
    // И расход прохода 1 при этом не потерян.
    expect(err.spentUsage).toEqual({ input_tokens: 25_442, output_tokens: 1_200 });
    expect(err.spentModel).toBe('x-ai/grok-4.3');
  });
});

describe('расход и слаг доезжают до отказа', () => {
  it('упал проход 2 ⇒ ошибка несёт оплаченный проход 1 и его слаг', async () => {
    stand({ structStatus: 500, struct: { error: { message: 'upstream down' } } });

    const err = await callLlmSearch(OPTS).catch((e: unknown) => e) as InstanceType<typeof LlmError>;

    expect(err).toBeInstanceOf(LlmError);
    // Самый дорогой сценарий был единственным без следа в журнале — больше нет.
    expect(err.spentUsage).toEqual({ input_tokens: 25_442, output_tokens: 1_200 });
    expect(err.spentModel).toBe('x-ai/grok-4.3');
    // Слаг ФАКТИЧЕСКИЙ: в строке прогона стоял `claude-sonnet-5` при живом Grok.
    expect(err.spentModel).not.toBe(OPTS.model);
  });

  it('упал проход 1 ⇒ расход НЕИЗВЕСТЕН: undefined, а не ноль', async () => {
    stand({ searchStatus: 500, search: { error: { message: 'upstream down' } } });

    const err = await callLlmSearch(OPTS).catch((e: unknown) => e) as InstanceType<typeof LlmError>;

    expect(bodies).toHaveLength(1);
    expect(err.spentUsage).toBeUndefined();
    expect(err.spentModel).toBeUndefined();
    // Ноль сказал бы «прогон был бесплатным». Он не был — он не начинался.
    expect(err.spentUsage?.input_tokens).not.toBe(0);
  });

  it('наружу по-прежнему не течёт тело апстрима — только наш текст', async () => {
    stand({ structStatus: 500, struct: { error: { message: 'sk-secret quota detail' } } });

    const err = await callLlmSearch(OPTS).catch((e: unknown) => e) as InstanceType<typeof LlmError>;

    expect(err.message).not.toContain('sk-secret');
    expect(err.message).not.toContain('quota detail');
  });
});

describe('таймаут называет себя таймаутом', () => {
  /** Как `AbortSignal.timeout` роняет запрос в Deno: имя TimeoutError. */
  function timeoutError(): Error {
    const err = new Error('Signal timed out.');
    err.name = 'TimeoutError';
    return err;
  }

  it('обрыв на запросе ⇒ LlmError с флагом времени и классом upstream', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(timeoutError())) as unknown as typeof fetch;

    const err = await callLlmSearch(OPTS).catch((e: unknown) => e) as InstanceType<typeof LlmError>;

    expect(err).toBeInstanceOf(LlmError);
    expect(err.timedOut).toBe(true);
    expect(err.kind).toBe('upstream');
  });

  it('обрыв на ЧТЕНИИ ТЕЛА — тот же случай, а не безымянный сбой', async () => {
    // Ровно прогон 19.08 11:42: `resp.json()` стоял ВНЕ try, и голый
    // `DOMException: Signal timed out.` проходил мимо классификации — в журнал
    // приезжал безымянный `upstream|Не удалось выполнить анализ`.
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.reject(timeoutError()),
      text: () => Promise.reject(timeoutError()),
    } as unknown as Response)) as unknown as typeof fetch;

    const err = await callLlmSearch(OPTS).catch((e: unknown) => e) as InstanceType<typeof LlmError>;

    expect(err).toBeInstanceOf(LlmError);
    expect(err.timedOut).toBe(true);
  });

  it('обычный сбой сети таймаутом НЕ прикидывается', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.reject(new TypeError('network error'))) as unknown as typeof fetch;

    const err = await callLlmSearch(OPTS).catch((e: unknown) => e) as InstanceType<typeof LlmError>;

    expect(err.timedOut).toBe(false);
    expect(err.kind).toBe('network');
  });
});

describe('потолок черновика — страховка, и она ЗАЛОГИРОВАНА', () => {
  const LONG = 'а'.repeat(30_000);

  function longDraftStand() {
    stand({
      search: {
        ...SEARCH_REPLY,
        choices: [{ finish_reason: 'stop', message: { content: LONG, annotations: [{}] } }],
      },
    });
  }

  it('черновик длиннее потолка обрезается до 24 000 знаков', async () => {
    longDraftStand();
    const res = await callLlmSearch(OPTS);

    const messages = bodies[1].messages as { role: string; content: string }[];
    const user = messages.find((m) => m.role === 'user')!.content;
    expect(user).toContain('а'.repeat(24_000));
    expect(user).not.toContain('а'.repeat(24_001));
    // Наружу уходит ровно тот текст, который видел упаковщик: по нему сверяется website.
    expect(res.draft).toHaveLength(24_000);
  });

  it('обрезка попадает в лог — иначе она читается как «упаковали всё»', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    longDraftStand();
    await callLlmSearch(OPTS);

    const line = warn.mock.calls.find((c) => String(c[0]).includes('draft truncated'));
    expect(line, 'обрезка обязана быть в логе').toBeDefined();
    // Обе величины: сколько было и сколько осталось.
    const payload = JSON.parse(String(line![1])) as Record<string, number>;
    expect(payload.from).toBe(30_000);
    expect(payload.to).toBe(24_000);
  });

  it('нормальный черновик не трогается и лога не порождает', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await callLlmSearch(OPTS);

    expect(res.draft).toBe(DRAFT);
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('draft truncated'))).toHaveLength(0);
  });
});

// ── Путь `catch` в ai-run: проверяется по исходнику ──────────────────────────
// `processRun` не импортируется (модуль зовёт Deno.serve на верхнем уровне), но
// правка этого спринта — про ЧТО ИМЕННО пишется в строку, и без проверки она бы
// осталась вовсе не покрытой.
const EDGE_SRC = readFileSync(
  path.resolve(__dirname, '../../supabase/functions/ai-run/index.ts'),
  'utf8',
);

/** Тело `catch` из processRun — от строки с 'ai-run process error' до конца update. */
const CATCH_BODY = EDGE_SRC.slice(
  EDGE_SRC.indexOf("const llm = err instanceof LlmError ? err : null;"),
  EDGE_SRC.indexOf("}).eq('id', runId);", EDGE_SRC.indexOf("'ai-run process error:'")),
);

describe('processRun: отказ оставляет след расхода', () => {
  it('в строку уезжают токены, слаг и класс ошибки', () => {
    expect(CATCH_BODY).toContain("sumUsage(spent, 'input_tokens')");
    expect(CATCH_BODY).toContain("sumUsage(spent, 'output_tokens')");
    expect(CATCH_BODY).toContain('...(model ? { model } : {})');
    expect(CATCH_BODY).toContain("runError(llm?.kind ?? 'upstream'");
  });

  it('расход = завершившиеся попытки ПЛЮС оплаченное внутри упавшей', () => {
    expect(CATCH_BODY).toContain('llm?.spentUsage ? [...usages, llm.spentUsage] : usages');
    expect(CATCH_BODY).toContain('llm?.spentModel ?? actualModel');
  });

  it('неизвестный слаг колонку НЕ трогает — там значение с INSERT', () => {
    // Спред под условием, а не `model: model ?? null`: затирать известное значение
    // неизвестностью хуже, чем оставить как есть.
    expect(CATCH_BODY).not.toContain('model: model ?? null');
  });

  it('таймаут приезжает своим текстом при том же классе upstream', () => {
    expect(CATCH_BODY).toContain('llm?.timedOut ? TIMEOUT_TEXT : undefined');
    const text = EDGE_SRC.slice(EDGE_SRC.indexOf('const TIMEOUT_TEXT ='));
    expect(text).toContain('Анализ занял слишком долго');
    // Класс `upstream` ⇒ кнопка «Повторить» на месте: повтор здесь осмыслен.
    expect(text).toContain('Попробуйте повторить');
  });

  it('накопитель расхода живёт ВНЕ try — иначе catch его не увидит', () => {
    const head = EDGE_SRC.slice(
      EDGE_SRC.indexOf('  const started = Date.now();'),
      EDGE_SRC.indexOf("await supabase.from('ai_runs').update({ status: 'running' })"),
    );
    expect(head).toContain('const usages: ClaudeUsage[] = [];');
    expect(head).toContain('let actualModel: string | null = null;');
  });
});

// ═══════════════════════════════════════════════════════
// S-BRIEF-BUDGET-2 — ПРОГОНЫ-ЗОМБИ при выключении воркера.
//
// `processRun` живёт в `EdgeRuntime.waitUntil`. Воркер снимают по wall clock (150 с на
// Free) БЕЗ исключения — `catch` не выполняется, строка `ai_runs` остаётся в `running`
// навсегда, в карточке крутится спиннер до перезагрузки страницы. Реклейм на входе
// (`STALE_RUN_MINUTES`) чинил это только следующему пришедшему и не раньше 10 минут.
// ═══════════════════════════════════════════════════════

describe('реестр прогонов в работе', () => {
  type Call = { client: string; ids: string[] };

  it('один прогон в работе ⇒ ровно одна пометка', () => {
    const runs = createInFlightRuns<string>();
    runs.set('run-1', 'client-a');
    const calls: Call[] = [];

    const res = flushInFlightRuns(runs, (client, ids) => calls.push({ client, ids }));

    expect(calls).toEqual([{ client: 'client-a', ids: ['run-1'] }]);
    expect(res).toEqual({ clients: 1, runs: 1 });
  });

  it('прогон снят из набора ⇒ пометка не идёт вовсе', () => {
    // Ровно то, ради чего `finally` в processRun: завершённый прогон не должен
    // получить ложную ошибку при следующем выключении воркера.
    const runs = createInFlightRuns<string>();
    runs.set('run-1', 'client-a');
    runs.delete('run-1');
    const calls: Call[] = [];

    const res = flushInFlightRuns(runs, (client, ids) => calls.push({ client, ids }));

    expect(calls).toEqual([]);
    expect(res).toEqual({ clients: 0, runs: 0 });
  });

  it('несколько прогонов одного пользователя — ОДИН запрос со списком id', () => {
    // На beforeunload времени мало: лишние round-trip'ы туда не помещаются.
    const runs = createInFlightRuns<string>();
    runs.set('run-1', 'client-a');
    runs.set('run-2', 'client-a');
    runs.set('run-3', 'client-a');
    const calls: Call[] = [];

    flushInFlightRuns(runs, (client, ids) => calls.push({ client, ids }));

    expect(calls).toHaveLength(1);
    expect(calls[0].ids).toEqual(['run-1', 'run-2', 'run-3']);
  });

  it('разные пользователи — разные клиенты: под чужим JWT строку не написать', () => {
    const runs = createInFlightRuns<string>();
    runs.set('run-1', 'client-a');
    runs.set('run-2', 'client-b');
    runs.set('run-3', 'client-a');
    const calls: Call[] = [];

    const res = flushInFlightRuns(runs, (client, ids) => calls.push({ client, ids }));

    expect(res).toEqual({ clients: 2, runs: 3 });
    expect(calls).toEqual([
      { client: 'client-a', ids: ['run-1', 'run-3'] },
      { client: 'client-b', ids: ['run-2'] },
    ]);
  });

  it('повторное событие вторую пометку НЕ шлёт — набор очищен', () => {
    const runs = createInFlightRuns<string>();
    runs.set('run-1', 'client-a');
    const calls: Call[] = [];

    flushInFlightRuns(runs, (client, ids) => calls.push({ client, ids }));
    flushInFlightRuns(runs, (client, ids) => calls.push({ client, ids }));

    expect(calls).toHaveLength(1);
    expect(runs.size).toBe(0);
  });
});

describe('ai-run: слушатель выключения воркера', () => {
  const LISTENER = EDGE_SRC.slice(
    EDGE_SRC.indexOf("addEventListener('beforeunload'"),
    EDGE_SRC.indexOf('Deno.serve(async (req: Request)'),
  );

  it('слушатель заведён и берёт причину из ev.detail', () => {
    expect(LISTENER).toContain("addEventListener('beforeunload'");
    expect(LISTENER).toContain('detail?.reason');
  });

  it('пишет класс upstream своим текстом — повтор осмыслен', () => {
    expect(LISTENER).toContain("runError('upstream', SHUTDOWN_TEXT)");
    const text = EDGE_SRC.slice(EDGE_SRC.indexOf('const SHUTDOWN_TEXT ='));
    expect(text).toContain('Анализ не был завершён');
  });

  it('пометка условная: строку, которую успели дописать, не трогаем', () => {
    expect(LISTENER).toContain("in('status', ['pending', 'running'])");
  });

  it('пустой набор ⇒ ни одного запроса', () => {
    expect(LISTENER).toContain('IN_FLIGHT.size === 0');
  });

  it('processRun снимает прогон из набора в finally', () => {
    const proc = EDGE_SRC.slice(
      EDGE_SRC.indexOf('  IN_FLIGHT.set(runId, supabase);'),
      EDGE_SRC.indexOf("addEventListener('beforeunload'"),
    );
    expect(proc).toContain('IN_FLIGHT.set(runId, supabase);');
    expect(proc).toContain('} finally {\n    IN_FLIGHT.delete(runId);\n  }');
  });
});
