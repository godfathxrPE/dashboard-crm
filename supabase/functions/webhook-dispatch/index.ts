// supabase/functions/webhook-dispatch/index.ts — S-R2-WEBHOOK-TRANSPORT (B2, спринт 1)
//
// Диспетчер очереди исходящих вебхуков. ПРИНЦИПИАЛЬНО отличается от ai-run и
// ai-summarize: те работают под JWT вызывающего, эта — под service_role, и её
// зовёт БД (dispatch_webhooks_tick, 089), у которой JWT нет.
//
// Отсюда четыре решения, каждое — граница атаки:
//
//  1. `verify_jwt = false` в config.toml, вместо JWT — заголовок X-Dispatch-Key,
//     сверяется constant-time с Function Secret WEBHOOK_DISPATCH_KEY.
//  2. Функция НЕ ПРИНИМАЕТ НИКАКИХ ДАННЫХ — только POST без тела. Очередь читает
//     сама из БД. Это снимает целый класс атак: даже с валидным ключом нельзя
//     заставить её отправить произвольный payload на произвольный URL.
//  3. Ответ всегда `{ processed: N }` без деталей — наружу не течёт ничего о
//     содержимом очереди.
//  4. Сервисный ключ не трогает таблицы напрямую: все три операции (захват,
//     секреты, запись результата) идут через DEFINER-RPC с ACL только у
//     service_role (088, п. 11). Утёкший ключ открывает ровно эти три двери.
//
// ⚠️ Вся чистая логика — в ./transport.ts, и это не стиль: Deno-модуль с
//    Deno.env на верхнем уровне из vitest не импортируется, а юниты по SSRF,
//    ретраям и подписи требование спринта. Тот же приём, что ai-run/shape.ts.
//
// ═══ ВОПРОС №1 СПРИНТА (Deno.resolveDns в Supabase Edge Runtime) ═══
// Ответить деплоем пробной функции CC не может — деплой edge вне его полномочий.
// Поэтому путь определяется В РАНТАЙМЕ, один раз на isolate, и пишется в лог:
//   • резолв доступен  → путь A: DNS + отбой приватных диапазонов, allowlist
//                        опционален (пустой не блокирует);
//   • резолв недоступен → путь B: allowlist обязателен (пустой запрещает всё),
//                        плюс запрет IP-литералов и портов кроме 443.
// Обе ветки всегда идут с redirect:'manual' — без него публичный хост из
// allowlist редиректит на 127.0.0.1 и вся защита рассыпается.
// Первая строка логов после деплоя даёт фактический ответ на вопрос №1.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import {
  BATCH_LIMIT,
  checkWebhookUrl,
  classifyStatus,
  EVENT_VERSION,
  isPrivateIp,
  MAX_DELIVERIES_PER_ENDPOINT_PER_TICK,
  nextRetryDelayMs,
  parseRetryAfterMs,
  REQUEST_TIMEOUT_MS,
  RESPONSE_BODY_LIMIT_BYTES,
  signPayload,
  truncateBody,
  URL_REJECT_MESSAGE,
  USER_AGENT,
} from './transport.ts';

// ═══════════════════════════════════════════════════════════════════
// Авторизация вызывающего
// ═══════════════════════════════════════════════════════════════════

/**
 * Сравнение без ранней остановки. Разницу длин не скрываем осознанно: длина
 * общего секрета — не то, что защищает ключ, а выравнивание буферов ради этого
 * добавило бы кода больше, чем пользы.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length || ea.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

// ═══════════════════════════════════════════════════════════════════
// SSRF: выбор пути один раз на isolate
// ═══════════════════════════════════════════════════════════════════

type DnsMode = 'resolve' | 'allowlist';
let dnsMode: DnsMode | null = null;

async function detectDnsMode(): Promise<DnsMode> {
  if (dnsMode !== null) return dnsMode;

  const resolver = (Deno as unknown as {
    resolveDns?: (host: string, type: string) => Promise<string[]>;
  }).resolveDns;

  if (typeof resolver !== 'function') {
    dnsMode = 'allowlist';
    console.log('webhook-dispatch: Deno.resolveDns отсутствует в рантайме');
  } else {
    try {
      await resolver('example.com', 'A');
      dnsMode = 'resolve';
    } catch (e) {
      dnsMode = 'allowlist';
      console.log('webhook-dispatch: resolveDns unavailable:', e instanceof Error ? e.message : String(e));
    }
  }

  console.log(
    dnsMode === 'resolve'
      ? 'webhook-dispatch: SSRF путь A — резолв DNS + отбой приватных диапазонов, allowlist опционален'
      : 'webhook-dispatch: SSRF путь B — allowlist обязателен, резолва нет',
  );
  return dnsMode;
}

/**
 * Резолв и проверка адресов. Пустой результат — отказ: имя, которое не
 * резолвится, отправлять некуда, а «попробуем и посмотрим» отдаёт решение
 * стороннему резолверу.
 */
async function resolvesToPublicIp(host: string): Promise<{ ok: boolean; detail: string }> {
  const resolver = (Deno as unknown as {
    resolveDns?: (host: string, type: string) => Promise<string[]>;
  }).resolveDns!;

  const addrs: string[] = [];
  for (const type of ['A', 'AAAA']) {
    try {
      addrs.push(...(await resolver(host, type)));
    } catch {
      // NXDOMAIN для одной из записей — норма (у хоста может не быть AAAA).
    }
  }
  if (addrs.length === 0) return { ok: false, detail: 'DNS не вернул адресов' };

  const bad = addrs.filter((ip) => isPrivateIp(ip));
  if (bad.length > 0) return { ok: false, detail: `адрес из приватного диапазона: ${bad[0]}` };
  return { ok: true, detail: addrs.join(', ') };
}

// ═══════════════════════════════════════════════════════════════════
// Типы строк очереди (ровно то, что отдаёт claim_webhook_deliveries)
// ═══════════════════════════════════════════════════════════════════

interface ClaimedDelivery {
  delivery_id: string;
  org_id: string;
  endpoint_id: string;
  event: string;
  payload: unknown;
  attempt: number;
  url: string;
  endpoint_active: boolean;
  allowed_hosts: unknown;
  failure_threshold: number;
}

/** jsonb → массив хостов. Мусор в настройках не должен ронять доставку. */
function toHostList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((h): h is string => typeof h === 'string');
}

// ═══════════════════════════════════════════════════════════════════
// Запись результата
// ═══════════════════════════════════════════════════════════════════

interface ResultPatch {
  status: 'pending' | 'delivered' | 'failed' | 'dropped';
  responseStatus?: number | null;
  responseBody?: string | null;
  error?: string | null;
  nextRetryAt?: string | null;
}

async function record(
  db: SupabaseClient,
  deliveryId: string,
  patch: ResultPatch,
): Promise<void> {
  const { error } = await db.rpc('record_webhook_result', {
    p_delivery_id: deliveryId,
    p_status: patch.status,
    p_response_status: patch.responseStatus ?? null,
    p_response_body: patch.responseBody ?? null,
    p_error: patch.error ?? null,
    p_next_retry_at: patch.nextRetryAt ?? null,
  });
  if (error) {
    // Запись результата — последний шаг; если и он не удался, строка останется
    // под лизингом и вернётся в очередь через 5 минут. Терять батч из-за этого
    // нельзя.
    console.error('webhook-dispatch: record failed', deliveryId, error.message);
  }
}

/** Ретрай по расписанию либо окончательный провал, если попытки исчерпаны. */
function retryOrFail(attempt: number, nowMs: number, reason: string, retryAfterMs: number | null): ResultPatch {
  const base = nextRetryDelayMs(attempt);
  if (base === null) {
    return { status: 'failed', error: `${reason} — попытки исчерпаны` };
  }
  // Retry-After уважаем, но не раньше собственного расписания: получатель может
  // попросить «через секунду», а мы этим и завалили бы его повторно.
  const delay = retryAfterMs !== null ? Math.max(retryAfterMs, base) : base;
  return {
    status: 'pending',
    error: reason,
    nextRetryAt: new Date(nowMs + delay).toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════════
// Чтение тела ответа с потолком
// ═══════════════════════════════════════════════════════════════════
// Не `await res.text()`: получатель волен стримить гигабайты, и тогда лимит
// §4.5 сработает уже после того, как память съедена.

async function readCapped(res: Response, limitBytes: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < limitBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.length > 0) {
        chunks.push(value);
        total += value.length;
      }
    }
  } catch {
    // Обрыв на чтении тела не меняет вердикт по коду ответа.
  } finally {
    await reader.cancel().catch(() => {});
  }

  const size = Math.min(total, limitBytes);
  const buf = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    if (off >= size) break;
    const take = Math.min(c.length, size - off);
    buf.set(c.subarray(0, take), off);
    off += take;
  }
  return truncateBody(new TextDecoder().decode(buf), limitBytes);
}

// ═══════════════════════════════════════════════════════════════════
// Обработка одной доставки
// ═══════════════════════════════════════════════════════════════════

async function deliverOne(
  db: SupabaseClient,
  d: ClaimedDelivery,
  secret: string,
  mode: DnsMode,
): Promise<void> {
  const nowMs = Date.now();

  // ── SSRF, повторно и непосредственно перед отправкой ──
  // Проверка только при сохранении обходится сменой DNS-записи через минуту
  // (§4.1 п.6) — это и есть DNS-rebinding, а не паранойя.
  const check = checkWebhookUrl(d.url, {
    allowedHosts: toHostList(d.allowed_hosts),
    allowlistRequired: mode === 'allowlist',
  });
  if (!check.ok) {
    await record(db, d.delivery_id, {
      status: 'dropped',
      error: `Адрес отклонён: ${URL_REJECT_MESSAGE[check.reason]}`,
    });
    return;
  }

  if (mode === 'resolve') {
    const dns = await resolvesToPublicIp(check.host);
    if (!dns.ok) {
      await record(db, d.delivery_id, { status: 'dropped', error: `Адрес отклонён: ${dns.detail}` });
      return;
    }
  }

  // ── Тело и подпись ──
  // ⚠️ ОДИН JSON.stringify на всю функцию. Его результат идёт И в подпись, И в
  //    body. Пересобрать объект перед отправкой = сломать подпись у получателя:
  //    jsonb не хранит порядок ключей.
  const raw = JSON.stringify(d.payload);
  const t = Math.floor(nowMs / 1000);
  const signature = await signPayload(secret, t, raw);

  let res: Response;
  try {
    res = await fetch(check.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': USER_AGENT,
        'X-Torii-Delivery': d.delivery_id,
        'X-Torii-Event': d.event,
        'X-Torii-Event-Version': String(EVENT_VERSION),
        'X-Torii-Attempt': String(d.attempt),
        'X-Torii-Signature': signature,
      },
      body: raw,
      // Обязательно: без manual публичный хост редиректит на 127.0.0.1, и обе
      // проверки выше обходятся одним заголовком Location.
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const reason = /timed? ?out|abort/i.test(msg) ? 'Таймаут запроса' : `Сетевая ошибка: ${msg}`;
    await record(db, d.delivery_id, retryOrFail(d.attempt, nowMs, reason, null));
    return;
  }

  const body = await readCapped(res, RESPONSE_BODY_LIMIT_BYTES);
  const outcome = classifyStatus(res.status);

  if (outcome === 'delivered') {
    await record(db, d.delivery_id, {
      status: 'delivered',
      responseStatus: res.status,
      responseBody: body,
    });
    return;
  }

  if (outcome === 'failed') {
    // 3xx попадает сюда намеренно: при redirect:'manual' редирект — это просьба
    // увести запрос, то есть ровно обход проверки, а не успех.
    const reason = res.status >= 300 && res.status < 400
      ? `Получатель ответил редиректом ${res.status} — редиректы не выполняются`
      : `Получатель отклонил доставку (${res.status})`;
    await record(db, d.delivery_id, {
      status: 'failed',
      responseStatus: res.status,
      responseBody: body,
      error: reason,
    });
    return;
  }

  const retryAfter = res.status === 429
    ? parseRetryAfterMs(res.headers.get('retry-after'), nowMs)
    : null;
  const patch = retryOrFail(d.attempt, nowMs, `Ответ ${res.status}`, retryAfter);
  await record(db, d.delivery_id, {
    ...patch,
    responseStatus: res.status,
    responseBody: body,
  });
}

// ═══════════════════════════════════════════════════════════════════
// Батч
// ═══════════════════════════════════════════════════════════════════

async function processBatch(db: SupabaseClient): Promise<number> {
  const mode = await detectDnsMode();

  const { data: claimed, error: claimErr } = await db.rpc('claim_webhook_deliveries', {
    p_limit: BATCH_LIMIT,
  });
  if (claimErr) {
    console.error('webhook-dispatch: claim failed', claimErr.message);
    return 0;
  }
  const rows = (claimed ?? []) as ClaimedDelivery[];
  if (rows.length === 0) return 0;

  // Отключённый endpoint — до всякой сети и до чтения секретов.
  const live: ClaimedDelivery[] = [];
  const perEndpoint = new Map<string, number>();
  for (const d of rows) {
    if (!d.endpoint_active) {
      await record(db, d.delivery_id, { status: 'dropped', error: 'Endpoint отключён' });
      continue;
    }
    // §4.5: не более 60 доставок в минуту на endpoint. При BATCH_LIMIT = 50
    // потолок недостижим, но он обязан пережить рост батча.
    const seen = perEndpoint.get(d.endpoint_id) ?? 0;
    if (seen >= MAX_DELIVERIES_PER_ENDPOINT_PER_TICK) {
      await record(db, d.delivery_id, {
        status: 'pending',
        error: 'Отложено: лимит частоты на endpoint',
        nextRetryAt: new Date(Date.now() + 60_000).toISOString(),
      });
      continue;
    }
    perEndpoint.set(d.endpoint_id, seen + 1);
    live.push(d);
  }
  if (live.length === 0) return rows.length;

  // Секреты — одним вызовом и только для доставок, дошедших до отправки.
  const ids = [...new Set(live.map((d) => d.endpoint_id))];
  const { data: secretRows, error: secretErr } = await db.rpc('get_webhook_secrets', {
    p_endpoint_ids: ids,
  });
  if (secretErr) {
    console.error('webhook-dispatch: secrets failed', secretErr.message);
    return rows.length;   // строки под лизингом, вернутся через 5 минут
  }
  const secrets = new Map<string, string>(
    ((secretRows ?? []) as { endpoint_id: string; secret: string }[])
      .filter((r) => typeof r.secret === 'string' && r.secret.length > 0)
      .map((r) => [r.endpoint_id, r.secret]),
  );

  for (const d of live) {
    const secret = secrets.get(d.endpoint_id);
    if (!secret) {
      await record(db, d.delivery_id, {
        status: 'dropped',
        error: 'Секрет подписи не найден — пересоздайте endpoint',
      });
      continue;
    }
    try {
      await deliverOne(db, d, secret, mode);
    } catch (e) {
      // Тот же контракт, что у processRun в ai-run: необработанная ошибка одной
      // доставки пишется в её строку и НЕ роняет батч.
      console.error('webhook-dispatch: delivery error', d.delivery_id, e instanceof Error ? e.message : String(e));
      await record(db, d.delivery_id, retryOrFail(d.attempt, Date.now(), 'Внутренняя ошибка диспетчера', null));
    }
  }

  return rows.length;
}

// ═══════════════════════════════════════════════════════════════════
// HTTP
// ═══════════════════════════════════════════════════════════════════

Deno.serve(async (req: Request) => {
  // CORS нет намеренно: функцию зовёт БД, из браузера её звать незачем и нельзя.
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json' },
    });
  }

  const expected = Deno.env.get('WEBHOOK_DISPATCH_KEY') ?? '';
  const provided = req.headers.get('x-dispatch-key') ?? '';
  if (expected.length === 0 || !timingSafeEqual(provided, expected)) {
    // Без деталей: отличать «ключ не настроен» от «ключ неверен» снаружи незачем.
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  // ⚠️ Тело запроса НЕ ЧИТАЕТСЯ вовсе. Это не забывчивость: функция не принимает
  //    данных, поэтому даже с валидным ключом ей нельзя продиктовать ни payload,
  //    ни URL получателя. Очередь она читает сама.

  const db = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let processed = 0;
  try {
    processed = await processBatch(db);
  } catch (e) {
    console.error('webhook-dispatch: batch error', e instanceof Error ? e.message : String(e));
  }

  // Ответ всегда одинаковой формы и без подробностей об очереди.
  return new Response(JSON.stringify({ processed }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});
