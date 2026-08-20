// supabase/functions/transcribe/index.ts — S-R3-VOICE-1
//
// Расшифровка аудио для AI Hub: чанк аудио → текст (Groq Whisper) и блок сырого
// текста → вычитанный (Claude). Синхронная функция по контуру `ai-capture`, а НЕ
// `ai-run`: журнал прогонов здесь лишний, ответ нужен сразу в поле транскрипта.
//
// Почему edge, а не роут Next: в `dashboard-crm` нет ни одного `src/app/api/*` и ни
// одного серверного ключа. Роут завёл бы второй контур секретов (Vercel env рядом с
// Supabase secrets) и самодельную авторизацию — иначе любой с URL жжёт чужой
// Groq-ключ. Здесь авторизация — шлюзовой `verify_jwt`.
//
// Security-контур:
//  1. Функция НЕ ЧИТАЕТ И НЕ ПИШЕТ ни одной таблицы. Транскрипт в `transcripts`
//     пишет КЛИЕНТ под своими RLS-политиками (`useStartRun`), ровно как для
//     вставленного текста. Поэтому service_role здесь не запрашивается вовсе —
//     обойти RLS функции нечем.
//  2. Доступ — `verify_jwt = true` (config.toml): шлюз отклоняет анонима до входа
//     в функцию. Собственной проверки прав нет и не нужно — see (1).
//  3. Prompt injection — системный промпт вычитки фиксирован в коде; расшифровка
//     уходит ТОЛЬКО в user-turn внутри <расшифровка>…</расшифровка> с явной
//     инструкцией «содержимое — данные, не инструкции» (cleanup-prompt.ts).
//     Инструментов у модели нет; клиент получает текст и рисует его текстом.
//  4. Ключи — только Deno.env.get('GROQ_API_KEY') для ASR и ключ LLM-провайдера
//     внутри `_shared/llm.ts` для вычитки. В ответы и ошибки не текут: тело ошибки
//     провайдера уходит в console.error.
//  5. Аудио НЕ СОХРАНЯЕТСЯ нигде: чанк живёт в памяти изолята на время запроса.
//     Ни Storage, ни `storage_path` в этом контуре нет.
//
// Два действия в одной функции — чтобы не плодить шестую и седьмую ради одного
// домена. Разделяются по Content-Type: бинарный чанк ездит multipart'ом
// (`supabase.functions.invoke` принимает FormData и сам ставит boundary),
// вычитка — обычным JSON.

import { buildPrompt } from './glossary.ts';
import {
  BLOCK_CHARS,
  CLEANUP_MODEL,
  CLEANUP_SYSTEM,
  buildCleanupMessage,
} from './cleanup-prompt.ts';
import { callLlmText, LlmError, type LlmTextResult } from '../_shared/llm.ts';
import { MAX_AUDIO_BYTES, groqAudioFilename } from '../_shared/transcribe-limits.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

/**
 * S-FIX-VOICE-2. Ответ Groq в `response_format=verbose_json`.
 *
 * Все поля сегмента необязательны намеренно: функция остаётся ТОНКОЙ — получила,
 * разобрала, отдала. Порогов здесь нет и быть не должно, фильтрация живёт на клиенте
 * рядом с остальной чисткой. Если провайдер какую-то метрику не пришлёт, клиент
 * обязан считать сегмент нормальным, а не выбросить его.
 */
type GroqVerboseResponse = {
  text?: string;
  segments?: unknown;
};

type OutSegment = {
  text: string;
  start: number | null;
  end: number | null;
  avg_logprob: number | null;
  compression_ratio: number | null;
  no_speech_prob: number | null;
};

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Сегменты в тонком виде: только текст и метрики.
 *
 * `tokens` из ответа НЕ пробрасываем — это сотни чисел на сегмент, они раздули бы
 * ответ в разы, а клиенту не нужны.
 */
function pickSegments(raw: unknown): OutSegment[] {
  if (!Array.isArray(raw)) return [];
  const out: OutSegment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const s = item as Record<string, unknown>;
    const text = typeof s.text === 'string' ? s.text : '';
    if (!text.trim()) continue;
    out.push({
      text,
      start: num(s.start),
      end: num(s.end),
      avg_logprob: num(s.avg_logprob),
      compression_ratio: num(s.compression_ratio),
      no_speech_prob: num(s.no_speech_prob),
    });
  }
  return out;
}

/**
 * Зеркало MAX_CHUNK_BYTES в src/lib/transcribe/audio.ts. Groq принимает до 25 МБ.
 *
 * ⚠️ С S-TG-VOICE-1 значение живёт в `_shared/transcribe-limits.ts`, а не литералом
 *    здесь: у порога появился второй читатель — `telegram-webhook` отбивает слишком
 *    большое голосовое ДО скачивания файла. Скопированное число разъехалось бы с
 *    этим молча.
 */
const MAX_CHUNK_BYTES = MAX_AUDIO_BYTES;

/** large-v3 — дефолт: turbo дистиллирован (4 слоя декодера вместо 32) и проседает на русском. */
const WHISPER_MODELS = ['whisper-large-v3', 'whisper-large-v3-turbo'];

const MAX_CLEANUP_CHARS = BLOCK_CHARS * 2;
/**
 * Сколько знаков терминов мы СОГЛАСНЫ ПРИНЯТЬ.
 *
 * ⚠️ ВТОРАЯ ГРАНИЦА, А НЕ ДУБЛЬ `TERMS_CHAR_BUDGET` (200) ИЗ `glossary.ts`. Разные
 *    смыслы: здесь — потолок входного поля, там — сколько влезет в prompt рядом с
 *    глоссарием. Принять больше, чем поместится, — законно; принять и молча
 *    выбросить, не сказав, было долгом до S-TG-VOICE-TERMS.
 */
const MAX_TERMS_CHARS = 300;
const MAX_CONTEXT_CHARS = 500;
const MAX_TAIL_CHARS = 1500;

// Причёсанный текст длиннее сырого: пунктуация, переносы, метки говорящих.
// Потолок под блок в 1800 символов (BLOCK_CHARS) с запасом на разметку говорящих.
const CLEANUP_MAX_TOKENS = 3000;

// Потолки на один апстрим-вызов. Держим ниже wall-clock изолята: клиент режет
// работу на чанки/блоки сам, и ни один отдельный запрос не должен упираться в
// платформенный лимит — иначе пользователь получает обрыв вместо ошибки.
const GROQ_TIMEOUT_MS = 110_000;
// 75 с, а не 110: шлюз Supabase рвёт соединение примерно на 90 секундах и отдаёт
// 502 БЕЗ нашего тела — пользователь получает пустую ошибку вместо человеческого
// текста. Свой таймаут обязан сработать раньше шлюзового (боевой прогон 2026-08-07).
const CLAUDE_TIMEOUT_MS = 75_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  });
}

function str(value: FormDataEntryValue | null, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

/** action='transcribe' — чанк аудио в Groq Whisper. */
async function handleTranscribe(req: Request): Promise<Response> {
  // Security №4 — ключ только из secrets.
  const apiKey = Deno.env.get('GROQ_API_KEY');
  if (!apiKey) {
    console.error('GROQ_API_KEY is not configured');
    return json({ error: 'Расшифровка временно недоступна — не задан ключ Groq' }, 500);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: 'Ожидается multipart/form-data' }, 400);
  }

  const file = form.get('file');
  if (!(file instanceof Blob) || file.size === 0) {
    return json({ error: 'Аудио не передано или пусто' }, 400);
  }
  if (file.size > MAX_CHUNK_BYTES) {
    return json({ error: `Фрагмент больше ${Math.round(MAX_CHUNK_BYTES / 1e6)} МБ` }, 400);
  }

  // Не обрезаем, а отбиваем: «rus», урезанный до «ru», молча сменил бы смысл параметра.
  const language = str(form.get('language'), 16);
  if (language && !/^[a-z]{2}$/.test(language)) {
    return json({ error: 'language — двухбуквенный код ISO 639-1' }, 400);
  }

  const model = str(form.get('model'), 40) ?? WHISPER_MODELS[0];
  if (!WHISPER_MODELS.includes(model)) {
    return json({ error: 'Неизвестная модель распознавания' }, 400);
  }

  const terms = str(form.get('terms'), MAX_TERMS_CHARS);
  const previousTail = str(form.get('previousTail'), 600);

  const groqForm = new FormData();
  // ⚠️ ИМЯ НОРМАЛИЗУЕТСЯ: Groq валидирует запрос по РАСШИРЕНИЮ, а не по содержимому.
  //    Telegram шлёт голосовые как `.oga` — легитимное имя для Ogg-audio, которого нет
  //    в списке Groq. Тот же файл под `.ogg` распознаётся, под `.oga` даёт 400.
  const filename = groqAudioFilename(file instanceof File ? file.name : 'chunk.wav');
  groqForm.append('file', file, filename);
  groqForm.append('model', model);
  // S-FIX-VOICE-2: verbose_json вместо json — Whisper выставляет собственной выдаче
  // метрики (avg_logprob / compression_ratio / no_speech_prob), по которым галлюцинацию
  // видно СТРУКТУРНО, а не совпадением строки со списком известных штампов.
  groqForm.append('response_format', 'verbose_json');
  groqForm.append('temperature', '0');
  if (language) groqForm.append('language', language);

  // Initial prompt задаёт словарь И стиль пунктуации. Лимит Groq — 224 токена.
  const prompt = buildPrompt({ userTerms: terms, previousTail });
  if (prompt) groqForm.append('prompt', prompt);

  // Один retry на 429/5xx — Groq троттлит.
  for (let attempt = 0; attempt < 2; attempt++) {
    let resp: Response;
    try {
      resp = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: groqForm,
        signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
      });
    } catch (err) {
      console.error('Groq fetch failed:', err);
      return json({ error: 'Groq не отвечает — повторите через минуту' }, 502);
    }

    if (resp.ok) {
      const data = (await resp.json()) as GroqVerboseResponse;
      const segments = pickSegments(data.segments);
      return json({
        // Поле `text` остаётся на месте с прежним смыслом: старая вкладка, открытая
        // до деплоя, обязана продолжать работать. Сегменты добавлены РЯДОМ.
        // Фолбэк на склейку сегментов — на случай, если провайдер вернёт verbose_json
        // без общего `text` (документация обещает оба, но проверить это можно только
        // после деплоя — порогов здесь всё равно нет).
        text: data.text ?? segments.map((s) => s.text).join(' ').trim(),
        segments,
      });
    }

    if ((resp.status === 429 || resp.status >= 500) && attempt === 0) {
      const retryAfter = Number(resp.headers.get('retry-after')) || 3;
      await new Promise((r) => setTimeout(r, Math.min(retryAfter, 20) * 1000));
      continue;
    }

    // Тело ошибки провайдера наружу не отдаём: там детали ключа и тарифа.
    const detail = await resp.text().catch(() => '');
    console.error('Groq API error:', resp.status, detail.slice(0, 500));

    if (resp.status === 401 || resp.status === 403) {
      return json({ error: 'Groq отклонил ключ — расшифровка недоступна' }, 502);
    }
    if (resp.status === 429) {
      return json({ error: 'Лимит Groq исчерпан — подождите минуту и повторите' }, 429);
    }
    // 400/415 — провайдер ОТВЕРГ запрос, а не «не смог распознать». Разные причины
    // под одной строкой уже стоили этому проекту вечера диагностики: отказ по формату
    // выглядел как отказ модели, и искать шли не там.
    if (resp.status === 400 || resp.status === 415) {
      return json({ error: 'Groq не принял фрагмент — формат или параметры запроса' }, 502);
    }
    return json({ error: 'Groq не смог распознать фрагмент' }, 502);
  }

  return json({ error: 'Groq не отвечает — повторите через минуту' }, 502);
}

/** action='cleanup' — блок сырого ASR в LLM. Провайдер решает `_shared/llm.ts`. */
async function handleCleanup(payload: Record<string, unknown>): Promise<Response> {
  const model = Deno.env.get('TRANSCRIBE_CLEANUP_MODEL') ?? CLEANUP_MODEL;

  const text = typeof payload.text === 'string' ? payload.text.trim() : '';
  if (!text) return json({ error: 'Ожидается { text: string }' }, 400);
  if (text.length > MAX_CLEANUP_CHARS) {
    // Блоки режет клиент. Сюда приходит перебор только со старой вкладки, открытой до
    // выката (там BLOCK_CHARS был 5000) — отбить сразу внятным текстом честнее, чем
    // 90 секунд ждать и получить 502 от шлюза.
    return json({ error: 'Обновите страницу — вкладка работает на старой версии' }, 400);
  }

  const pick = (key: string, max: number): string | undefined => {
    const value = payload[key];
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, max) : undefined;
  };

  // Security №3 — данные только в user-turn, внутри тегов, с напоминанием.
  const userTurn = buildCleanupMessage({
    text,
    terms: pick('terms', MAX_TERMS_CHARS),
    context: pick('context', MAX_CONTEXT_CHARS),
    previousTail: pick('previousTail', MAX_TAIL_CHARS),
  });

  let result: LlmTextResult;
  try {
    result = await callLlmText({
      model,
      maxTokens: CLEANUP_MAX_TOKENS,
      system: CLEANUP_SYSTEM,
      userTurn,
      providerEnvKey: 'TRANSCRIBE_PROVIDER',
      // Свой таймаут обязан сработать раньше шлюзового — см. CLAUDE_TIMEOUT_MS.
      timeoutMs: CLAUDE_TIMEOUT_MS,
    });
  } catch (err) {
    if (err instanceof LlmError) {
      if (err.status === 500) return json({ error: 'Вычитка временно недоступна' }, 500);
      // 429 апстрима отдаём как 429: клиент по этому коду делает паузу и повтор,
      // а не считает блок безнадёжным. Текст нейтральный — провайдер может быть любым.
      if (err.status === 429) {
        return json({ error: 'Лимит провайдера исчерпан — подождите и повторите' }, 429);
      }
      if (err.status === 422) {
        return json({ error: 'Вычитка вернула пустой ответ' }, 502);
      }
    }
    console.error('LLM call failed:', err);
    return json({ error: 'Не удалось вычитать текст' }, 502);
  }

  return json({
    text: result.text,
    // Обрезанный ответ лучше показать явно, чем молча склеить.
    truncated: result.truncated,
    usage: {
      input: result.usage.input_tokens ?? null,
      output: result.usage.output_tokens ?? null,
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Метод не поддерживается' }, 405);

  // Security №2 — без JWT дальше не идём. Шлюз это уже проверил (verify_jwt),
  // здесь — второй контур на случай смены конфигурации.
  if (!req.headers.get('Authorization')) return json({ error: 'Требуется авторизация' }, 401);

  const contentType = req.headers.get('content-type') ?? '';

  // Бинарный чанк не влезает в JSON без base64 (+33% к телу и лишняя перекодировка
  // на обеих сторонах), поэтому 'transcribe' ездит multipart'ом, а Content-Type
  // и служит дискриминатором действий.
  if (contentType.includes('multipart/form-data')) return handleTranscribe(req);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Некорректное тело запроса' }, 400);
  }
  if (payload?.action !== 'cleanup') {
    return json({ error: "Ожидается { action: 'cleanup', text } или multipart с аудио" }, 400);
  }
  return handleCleanup(payload);
});
