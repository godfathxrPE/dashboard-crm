// supabase/functions/_shared/invoke-error.ts — FIX tg-capture-401
//
// Разбор ошибки `supabase.functions.invoke` до чего-то, что можно прочитать в логе.
//
// Зачем: `error.message` у `FunctionsHttpError` — это всегда одна и та же фраза
// «Edge Function returned a non-2xx status code». Статуса в ней нет, тела нет,
// имени функции нет. Ровно поэтому шлюзовой 401 два дня выглядел как «ИИ не работает»:
// в логе была строка про упавшую функцию, а в ней — ноль сведений о том, ЧТО упало.
// Статус и голова тела отвечают на это за минуту.
//
// ⚠️ Модуль ЧИСТЫЙ: ни `Deno`, ни supabase-js. Ответ приходит внутри ошибки, а не
//    добывается из сети, — поэтому проверяется обычным тестом.

/** Сколько знаков тела кладём в лог: голова ответа, а не ответ. */
const BODY_HEAD_CHARS = 300;

export interface InvokeFailure {
  /** HTTP-статус ответа шлюза/функции, если ошибка его несёт. */
  status: number | null;
  /** `error.message` как есть. */
  message: string;
  /** Первые знаки тела, схлопнутые пробелы. Пусто, если тела нет или не прочиталось. */
  bodyHead: string;
}

/** Минимум от `Response`, который нам нужен: статус и читаемое тело. */
interface ResponseLike {
  status: number;
  text: () => Promise<string>;
  clone?: () => ResponseLike;
}

function responseOf(error: unknown): ResponseLike | null {
  if (typeof error !== 'object' || error === null) return null;
  const ctx = (error as { context?: unknown }).context;
  if (typeof ctx !== 'object' || ctx === null) return null;
  const candidate = ctx as { status?: unknown; text?: unknown; clone?: unknown };
  if (typeof candidate.status !== 'number' || typeof candidate.text !== 'function') return null;
  return candidate as unknown as ResponseLike;
}

export async function describeInvokeError(error: unknown): Promise<InvokeFailure> {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && typeof (error as { message?: unknown }).message === 'string'
    ? (error as { message: string }).message
    : String(error);

  const res = responseOf(error);
  if (!res) return { status: null, message, bodyHead: '' };

  let bodyHead = '';
  try {
    // Клон, а не сам ответ: тело читается один раз, и вызывающий код может
    // захотеть его сам. Клона нет — читаем как есть, лог важнее.
    const source = typeof res.clone === 'function' ? res.clone() : res;
    const text = await source.text();
    bodyHead = text.slice(0, BODY_HEAD_CHARS).replace(/\s+/g, ' ').trim();
  } catch {
    // Тело уже прочитано или не читается. Статуса достаточно — молчим.
  }

  return { status: res.status, message, bodyHead };
}

/** Одна строка для `console.error`: имя функции, статус, сообщение, голова тела. */
export function formatInvokeFailure(name: string, failure: InvokeFailure): string {
  const parts = [`${name} упала`, `статус ${failure.status ?? '—'}`, failure.message];
  if (failure.bodyHead) parts.push(`тело: ${failure.bodyHead}`);
  return parts.join(' · ');
}
