// supabase/functions/webhook-dispatch/transport.ts — S-R2-WEBHOOK-TRANSPORT (B2, спринт 1)
//
// Чистая логика транспорта: разбор и проверка URL, SSRF-фильтр по IP, расписание
// ретраев, классификация ответа, усечение тела, подпись.
//
// Модуль ЧИСТЫЙ — ни Deno, ни supabase-js, ни сети, ни глобалов на верхнем уровне.
// Это не эстетика: Deno-модуль с `Deno.env` наверху из vitest не импортируется, и
// без такого разделения требование «прогнать юниты 1–5» превращается в обещание.
// Тот же приём, что в ai-run/shape.ts. index.ts импортирует относительным путём,
// поэтому `supabase functions deploy` собирает всё в один бандл.
//
// Единственная зависимость от рантайма — `globalThis.crypto.subtle` в signPayload,
// и читается она ВНУТРИ функции (в тестах подменяется webcrypto из node:crypto).

// ═══════════════════════════════════════════════════════════════════
// SSRF: приватные диапазоны
// ═══════════════════════════════════════════════════════════════════
// Список — §4.1 арх-дока, плюс 0.0.0.0/8. 169.254.0.0/16 здесь не «на всякий»:
// это link-local, где живёт 169.254.169.254 — эндпоинт метаданных облака, ради
// которого SSRF обычно и эксплуатируют.

/** Разбирает IPv4-литерал в 4 октета. null — это не IPv4. */
function parseIpv4(host: string): number[] | null {
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const p of parts) {
    // Ведущие нули запрещаем намеренно: '010.0.0.1' некоторые резолверы читают
    // как восьмеричное, и это классический обход строкового блоклиста.
    if (!/^\d{1,3}$/.test(p)) return null;
    if (p.length > 1 && p.startsWith('0')) return null;
    const n = Number(p);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets;
}

/** IPv4 из приватного/служебного диапазона? */
function isPrivateIpv4(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === 0) return true;                                   // 0.0.0.0/8
  if (a === 10) return true;                                  // 10.0.0.0/8
  if (a === 127) return true;                                 // 127.0.0.0/8
  if (a === 169 && b === 254) return true;                    // 169.254.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true;           // 172.16.0.0/12
  if (a === 192 && b === 168) return true;                    // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true;          // 100.64.0.0/10 (CGNAT)
  return false;
}

/**
 * Приватный или служебный адрес? Принимает IPv4, IPv6 и IPv6 в скобках.
 * Неразобранное считаем приватным — при сомнении не отправляем (fail closed).
 */
export function isPrivateIp(raw: string): boolean {
  const ip = raw.trim().replace(/^\[|\]$/g, '').toLowerCase();
  if (ip.length === 0) return true;

  const v4 = parseIpv4(ip);
  if (v4) return isPrivateIpv4(v4);

  if (!ip.includes(':')) return true;   // не IPv4 и не IPv6 — не адрес вовсе

  // IPv4-mapped / IPv4-compatible: ::ffff:127.0.0.1 обходит любую проверку,
  // которая смотрит только на префикс IPv6.
  const tail = ip.slice(ip.lastIndexOf(':') + 1);
  const mapped = parseIpv4(tail);
  if (mapped) return isPrivateIpv4(mapped);

  if (ip === '::' || ip === '::1') return true;               // unspecified / loopback
  const head = ip.split(':')[0];
  if (head.length === 0) return true;                          // ::-формы прочие
  const first16 = parseInt(head, 16);
  if (Number.isNaN(first16)) return true;
  if ((first16 & 0xfe00) === 0xfc00) return true;              // fc00::/7 unique-local
  if ((first16 & 0xffc0) === 0xfe80) return true;              // fe80::/10 link-local
  return false;
}

// ═══════════════════════════════════════════════════════════════════
// Разбор и проверка URL
// ═══════════════════════════════════════════════════════════════════

export type UrlRejectReason =
  | 'not_a_url'
  | 'scheme_not_https'
  | 'ip_literal_forbidden'
  | 'port_forbidden'
  | 'host_not_allowlisted'
  | 'credentials_forbidden';

export interface UrlCheckOk {
  ok: true;
  host: string;
  url: string;
}
export interface UrlCheckFail {
  ok: false;
  reason: UrlRejectReason;
}
export type UrlCheck = UrlCheckOk | UrlCheckFail;

export interface UrlCheckOptions {
  /**
   * Разрешённые хосты (точное совпадение, регистр не важен).
   * organizations.settings.webhook_allowed_hosts.
   */
  allowedHosts?: readonly string[];
  /**
   * Обязателен ли allowlist. true — пустой список запрещает всё (путь B: DNS
   * проверить нечем, allowlist остаётся единственной защитой от rebinding).
   * false — пустой список ничего не ограничивает (путь A: работу делает резолв).
   */
  allowlistRequired: boolean;
}

/**
 * Проверка URL получателя. Гоняется ДВАЖДЫ: при создании endpoint'а (быстрый
 * отказ с понятной ошибкой) и перед КАЖДОЙ отправкой — DNS мог переехать на
 * внутренний адрес уже после сохранения (§4.1 п.6, DNS-rebinding).
 *
 * ⚠️ Порт: разрешён ТОЛЬКО 443. Арх-док §4.1 допускал «443 и высокие
 *    пользовательские»; путь B спринта сузил до 443, и мы следуем спринту —
 *    allowlist высоких портов без DNS-резолва открывает сканирование внутренней
 *    сети по портам, ради чего SSRF обычно и делают.
 */
export function checkWebhookUrl(raw: string, opts: UrlCheckOptions): UrlCheck {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: 'not_a_url' };
  }

  if (u.protocol !== 'https:') return { ok: false, reason: 'scheme_not_https' };

  // user:pass@host — не наш сценарий, зато удобный способ спрятать настоящий хост
  // от беглого взгляда в UI.
  if (u.username !== '' || u.password !== '') {
    return { ok: false, reason: 'credentials_forbidden' };
  }

  // URL.hostname отдаёт IPv6 в скобках; убираем перед разбором.
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host.length === 0) return { ok: false, reason: 'not_a_url' };

  // IP-литерал запрещён всегда: имя хоста можно проверить по allowlist, а голый
  // адрес обходит и allowlist (если он пуст), и человеческий контроль в UI.
  if (parseIpv4(host) !== null || host.includes(':')) {
    return { ok: false, reason: 'ip_literal_forbidden' };
  }

  // Пустой u.port означает дефолт схемы, то есть 443.
  if (u.port !== '' && u.port !== '443') return { ok: false, reason: 'port_forbidden' };

  const allow = (opts.allowedHosts ?? []).map((h) => h.trim().toLowerCase()).filter(Boolean);
  if (allow.length > 0) {
    if (!allow.includes(host)) return { ok: false, reason: 'host_not_allowlisted' };
  } else if (opts.allowlistRequired) {
    return { ok: false, reason: 'host_not_allowlisted' };
  }

  return { ok: true, host, url: u.toString() };
}

/** Человекочитаемая причина отказа — идёт в webhook_deliveries.error. */
export const URL_REJECT_MESSAGE: Record<UrlRejectReason, string> = {
  not_a_url: 'Некорректный URL',
  scheme_not_https: 'Разрешён только https',
  ip_literal_forbidden: 'IP-адрес вместо имени хоста запрещён',
  port_forbidden: 'Разрешён только порт 443',
  host_not_allowlisted: 'Хост не в списке разрешённых (настройки организации)',
  credentials_forbidden: 'Логин/пароль в URL запрещены',
};

// ═══════════════════════════════════════════════════════════════════
// Расписание ретраев
// ═══════════════════════════════════════════════════════════════════
// §5 арх-дока. Индекс массива — номер ТОЛЬКО ЧТО СДЕЛАННОЙ попытки:
// после 1-й ждём минуту, …, после 6-й — сутки, после 7-й ретраев нет.

const RETRY_DELAYS_MS: readonly number[] = [
  60_000,          // после попытки 1 → +1 мин
  5 * 60_000,      // после 2 → +5 мин
  30 * 60_000,     // после 3 → +30 мин
  2 * 3_600_000,   // после 4 → +2 ч
  6 * 3_600_000,   // после 5 → +6 ч
  24 * 3_600_000,  // после 6 → +24 ч
];

/** Максимум попыток; после неё доставка получает статус failed. */
export const MAX_ATTEMPTS = 7;

/** Пауза перед следующей попыткой. null — попытки исчерпаны. */
export function nextRetryDelayMs(attemptJustMade: number): number | null {
  if (!Number.isInteger(attemptJustMade) || attemptJustMade < 1) return null;
  return RETRY_DELAYS_MS[attemptJustMade - 1] ?? null;
}

/** Момент следующей попытки в ISO. null — ретраев больше нет. */
export function nextRetryAt(attemptJustMade: number, nowMs: number): string | null {
  const delay = nextRetryDelayMs(attemptJustMade);
  return delay === null ? null : new Date(nowMs + delay).toISOString();
}

/** Потолок уважения к Retry-After: сутки (§5, «в разумных пределах»). */
export const RETRY_AFTER_CAP_MS = 24 * 3_600_000;

/**
 * Retry-After → миллисекунды. Принимает и число секунд, и HTTP-дату.
 * null — заголовка нет либо он мусорный: тогда работает обычное расписание.
 */
export function parseRetryAfterMs(header: string | null, nowMs: number): number | null {
  if (!header) return null;
  const raw = header.trim();
  if (raw === '') return null;

  if (/^\d+$/.test(raw)) {
    const ms = Number(raw) * 1000;
    return Math.min(ms, RETRY_AFTER_CAP_MS);
  }

  const at = Date.parse(raw);
  if (Number.isNaN(at)) return null;
  const ms = at - nowMs;
  if (ms <= 0) return 0;
  return Math.min(ms, RETRY_AFTER_CAP_MS);
}

// ═══════════════════════════════════════════════════════════════════
// Классификация ответа
// ═══════════════════════════════════════════════════════════════════

export type DeliveryOutcome = 'delivered' | 'retry' | 'failed';

/**
 * Что делать с полученным HTTP-кодом.
 *
 * ⚠️ 3xx — `failed`, а НЕ успех и не ретрай. При redirect:'manual' редирект
 *    означает «получатель просит увести запрос в другое место», а увод — ровно
 *    тот обход SSRF-проверки, ради которого manual и поставлен. Повтор ничего не
 *    изменит: адрес назначения в конфиге тот же.
 * ⚠️ 4xx кроме 408/429 — `failed` без ретраев: получатель отверг осмысленно.
 */
export function classifyStatus(status: number): DeliveryOutcome {
  if (status >= 200 && status < 300) return 'delivered';
  if (status >= 300 && status < 400) return 'failed';
  if (status === 408 || status === 429) return 'retry';
  if (status >= 400 && status < 500) return 'failed';
  return 'retry';   // 5xx и всё нестандартное выше — повторяем
}

// ═══════════════════════════════════════════════════════════════════
// Лимиты
// ═══════════════════════════════════════════════════════════════════

/** Тело ответа пишем не больше 8 КБ (§4.5) — иначе журнал раздувается чужим HTML. */
export const RESPONSE_BODY_LIMIT_BYTES = 8 * 1024;

/**
 * Усечение по БАЙТАМ, не по символам: лимит в §4.5 задан в килобайтах, а
 * кириллица в UTF-8 занимает два байта на символ — посимвольный срез пустил бы
 * вдвое больше. Суррогатную пару не разрываем.
 */
export function truncateBody(text: string, limitBytes = RESPONSE_BODY_LIMIT_BYTES): string {
  const enc = new TextEncoder();
  if (enc.encode(text).length <= limitBytes) return text;

  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (enc.encode(text.slice(0, mid)).length <= limitBytes) lo = mid;
    else hi = mid - 1;
  }
  // Не оставляем висящий верхний суррогат — иначе получится битый символ.
  let cut = lo;
  if (cut > 0) {
    const code = text.charCodeAt(cut - 1);
    if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
  }
  return text.slice(0, cut);
}

/** Потолок доставок на один endpoint за тик (§4.5: не более 60 в минуту). */
export const MAX_DELIVERIES_PER_ENDPOINT_PER_TICK = 60;

/** Сколько строк очереди берём за один проход. */
export const BATCH_LIMIT = 50;

/** Таймаут одного запроса — 5 с, как у HubSpot (§4.1 п.5). */
export const REQUEST_TIMEOUT_MS = 5000;

/** Порог авто-отключения по умолчанию; переопределяется настройками org. */
export const DEFAULT_FAILURE_THRESHOLD = 20;

// ═══════════════════════════════════════════════════════════════════
// Подпись
// ═══════════════════════════════════════════════════════════════════

/**
 * Подпись схемы Stripe / HubSpot v3: `hmac_sha256(secret, "<t>.<raw>")`.
 *
 * ⚠️ `raw` — ИМЕННО та строка, что уйдёт в body. Пересобирать объект перед
 *    отправкой нельзя: jsonb не хранит порядок ключей, и любая разница в порядке
 *    ломает подпись у получателя, который считает её от полученных байт.
 *
 * ⚠️ Формат значения — `t=<unix>,v1=<hex>` БЕЗ пробела после запятой. В §3.3
 *    арх-дока значение отрендерено с пробелом (`t=1769..., v1=…`), но это проза:
 *    названная там же схема Stripe пробела не содержит, а получатели (n8n, Make)
 *    парсят по образцу Stripe. Разночтение зафиксировано здесь, потому что заголовок
 *    уходит в документ контракта G3 дословно.
 */
export async function signPayload(secret: string, tSeconds: number, raw: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(`${tSeconds}.${raw}`));
  const hex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `t=${tSeconds},v1=${hex}`;
}

/** Версия контракта события — она же X-Torii-Event-Version и `version` в теле. */
export const EVENT_VERSION = 1;

export const USER_AGENT = 'torii-crm-webhooks/1';
