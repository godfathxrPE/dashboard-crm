// supabase/functions/telegram-send/index.ts — S-TG-1, + reply_markup в S-TG-2
//
// Дренаж очереди `telegram_outbox`: берёт готовые строки и отправляет их ботом.
// Зовётся БД (telegram_send_tick, 107) через pg_net, а не браузером.
//
// ⚠️ ОСОЗНАННОЕ ОТСТУПЛЕНИЕ ОТ ИНВАРИАНТА «EDGE НЕ ПИШЕТ В БД».
//    Инвариант закреплён хендоффом 2026-08-08 (эпик голоса) и там держался, потому
//    что рядом всегда был браузер с сессией пользователя: транскрипт писал клиент под
//    своими RLS. ЗДЕСЬ БРАУЗЕРА НЕТ — очередь дренит cron, сообщения шлёт бот, и
//    закрыть строку очереди, кроме самой функции, некому.
//
//    Компенсация ровно та, что записана в спринте:
//      • `telegram_outbox` для `authenticated` закрыта ПОЛНОСТЬЮ (revoke all + RLS
//        без политик) — писать в неё может только service_role, то есть эта функция
//        и триггер-постановщик;
//      • строки очереди — не рабочие данные, а транспорт: их правка ничего не меняет
//        ни в сделках, ни в задачах;
//      • всё, что меняет РАБОЧИЕ данные, идёт через RPC с явным актором
//        (link_telegram_account здесь; отметки «Выполнено» — S-TG-2).
//
// Четыре границы атаки, как у webhook-dispatch:
//  1. `verify_jwt = false` в config.toml (у БД JWT нет) — взамен заголовок
//     X-Dispatch-Key, сверяется без ранней остановки с секретом TELEGRAM_SEND_KEY.
//  2. Функция НЕ ПРИНИМАЕТ ДАННЫХ: POST без тела, очередь читает сама. Даже с
//     валидным ключом ей нельзя продиктовать ни текст, ни адресата.
//  3. Ответ всегда `{ processed: N }` — наружу не течёт содержимое очереди.
//  4. Токен бота живёт ТОЛЬКО в Function Secrets. В БД, в cron.job.command и на
//     клиенте его нет и быть не должно.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { requireEnv } from '../_shared/env.ts';

// ⚠️ Обязательные переменные — при холодном старте, броском. Было `?? ''`: пустая
//    строка вместо ключа отказывает не здесь, а тремя переходами дальше.
const SUPABASE_URL = requireEnv('SUPABASE_URL', (n) => Deno.env.get(n));
const SUPABASE_SERVICE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY', (n) => Deno.env.get(n));

const TELEGRAM_API = 'https://api.telegram.org';

/** Сколько строк берём за тик. Тот же порядок, что батч у webhook-dispatch (50). */
const BATCH_LIMIT = 25;

/** После пятой неудачной попытки строка закрывается как `error`. */
const MAX_ATTEMPTS = 5;

/**
 * Бэкофф по номеру УЖЕ СДЕЛАННОЙ попытки: 1 м → 5 м → 15 м → 1 ч.
 * Пятой записи нет — на ней строка становится `error`.
 */
const BACKOFF_MS = [60_000, 300_000, 900_000, 3_600_000];

/** Висящий fetch держал бы воркер до таймаута шлюза — рвём сами. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Строка, отданная `claim_telegram_outbox`. Поле называется `message_text`, а не
 * `text`: имя колонки в RETURNS TABLE становится переменной plpgsql и затенило бы
 * имя типа `text` внутри функции (107).
 */
interface OutboxRow {
  id: string;
  chat_id: number;
  message_text: string;
  attempts: number;
  /** S-TG-2 (108): inline-клавиатура. NULL — сообщение без кнопок. */
  reply_markup: Record<string, unknown> | null;
}

/** Ответ Telegram Bot API. `parameters.retry_after` приходит только с 429. */
interface TelegramResponse {
  ok?: boolean;
  description?: string;
  parameters?: { retry_after?: number };
}

/**
 * Сравнение без ранней остановки. Разницу длин не скрываем осознанно — та же
 * позиция, что в webhook-dispatch: длина общего секрета не то, что его защищает.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length || ea.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

function backoffMs(attemptsMade: number): number {
  return BACKOFF_MS[Math.min(attemptsMade - 1, BACKOFF_MS.length - 1)];
}

Deno.serve(async (req: Request): Promise<Response> => {
  const expectedKey = Deno.env.get('TELEGRAM_SEND_KEY') ?? '';
  const providedKey = req.headers.get('X-Dispatch-Key') ?? '';

  if (!expectedKey || !timingSafeEqual(providedKey, expectedKey)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
  if (!botToken) {
    // Окружение не настроено. 200, а не 500: минутная джоба не должна сыпать
    // ошибками в логи из-за незаведённого секрета, а очередь никуда не денется.
    console.error('telegram-send: TELEGRAM_BOT_TOKEN не задан — очередь не тронута');
    return new Response(JSON.stringify({ processed: 0 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // ЗАХВАТ, А НЕ ПРОСТО SELECT. Джоба минутная, а 25 сообщений при медленном
  // Telegram упираются в таймаут 10 с каждое — тик может не уложиться в минуту, и
  // следующий забрал бы те же строки. `claim_telegram_outbox` (107) делает
  // `for update skip locked` + лизинг 2 минуты и заодно увеличивает attempts:
  // захват и есть попытка. Дубль в личном чате живого человека заметен сильнее,
  // чем дубль вебхука, — поэтому здесь ровно та же машинерия, что в 088.
  const { data: rows, error } = await supabase.rpc('claim_telegram_outbox', {
    p_limit: BATCH_LIMIT,
  });

  if (error) {
    console.error('telegram-send: чтение очереди упало:', error.message);
    return new Response(JSON.stringify({ processed: 0 }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  const queue = (rows ?? []) as OutboxRow[];
  let processed = 0;

  for (const row of queue) {
    // Ошибка одной строки не роняет батч — тот же контракт, что у processRun в
    // ai-run и у доставок в webhook-dispatch.
    try {
      await sendOne(supabase, botToken, row);
      processed++;
    } catch (e) {
      console.error(
        'telegram-send: строка',
        row.id,
        'упала:',
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  return new Response(JSON.stringify({ processed }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});

// deno-lint-ignore no-explicit-any
async function sendOne(supabase: any, botToken: string, row: OutboxRow): Promise<void> { // eslint-disable-line @typescript-eslint/no-explicit-any -- тип клиента supabase-js в Deno-бандле недоступен, tsconfig сюда не заходит; директив две, потому что линтера два
  // Уже увеличен захватом (claim_telegram_outbox) — второй раз не растим.
  const attempts = row.attempts;

  let status = 0;
  let body: TelegramResponse = {};
  let networkError: string | null = null;

  try {
    const resp = await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: row.chat_id,
        text: row.message_text,
        // Текст УЖЕ экранирован в SQL (telegram_escape_html, 107). Второй раз здесь
        // экранировать нельзя — получились бы «&amp;amp;».
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        // S-TG-2 (108): клавиатуру собирает telegram_task_keyboard в SQL и кладёт в
        // строку очереди. Ключ подмешивается ТОЛЬКО когда она есть: `reply_markup:
        // null` Telegram принимает, а `reply_markup: undefined` после JSON.stringify
        // исчез бы сам — но явное условие читается однозначно и не зависит от того,
        // как ведёт себя сериализатор.
        ...(row.reply_markup ? { reply_markup: row.reply_markup } : {}),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    status = resp.status;
    try {
      body = (await resp.json()) as TelegramResponse;
    } catch {
      body = {};
    }
  } catch (e) {
    networkError = e instanceof Error ? e.message : String(e);
  }

  // ── 1. Успех ────────────────────────────────────────────────────────
  if (!networkError && status === 200 && body.ok === true) {
    await supabase
      .from('telegram_outbox')
      .update({
        status: 'sent',
        attempts,
        sent_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('id', row.id);
    return;
  }

  // ── 2. 429: Telegram сам говорит, когда вернуться ───────────────────
  // ⚠️ Счётчик попыток ОТКАТЫВАЕТСЯ на дозахватное значение: 429 — не отказ, а
  //    расписание, и сжигать им лимит нельзя. Иначе всплеск уведомлений (массовое
  //    назначение задач) упёрся бы в лимит Telegram и сам себя похоронил: пять
  //    «подожди 30 секунд» закрыли бы сообщение как ошибку.
  if (status === 429) {
    const retryAfterSec = body.parameters?.retry_after ?? 30;
    await supabase
      .from('telegram_outbox')
      .update({
        attempts: Math.max(attempts - 1, 0),
        next_retry_at: new Date(Date.now() + retryAfterSec * 1000).toISOString(),
        last_error: `429 retry_after=${retryAfterSec}`,
      })
      .eq('id', row.id);
    return;
  }

  // ── 3. Прочие 4xx: повторять бессмысленно ───────────────────────────
  // 403 — «bot was blocked by the user»: человек отвязал бота, и следующие 999
  // попыток дадут ровно то же. 400 — «chat not found» или «can't parse entities»:
  // ошибка на нашей стороне, ретрай её не вылечит. Та же логика, что у
  // webhook-dispatch (4xx кроме 408/429 → failed без ретраев).
  if (status >= 400 && status < 500 && status !== 408) {
    await supabase
      .from('telegram_outbox')
      .update({
        status: 'error',
        attempts,
        last_error: `${status}: ${body.description ?? 'без описания'}`.slice(0, 500),
      })
      .eq('id', row.id);
    return;
  }

  // ── 4. 5xx / 408 / сеть / таймаут: экспоненциальный бэкофф ──────────
  const reason = networkError
    ? `сеть: ${networkError}`
    : `${status}: ${body.description ?? 'без описания'}`;

  if (attempts >= MAX_ATTEMPTS) {
    await supabase
      .from('telegram_outbox')
      .update({ status: 'error', attempts, last_error: reason.slice(0, 500) })
      .eq('id', row.id);
    return;
  }

  await supabase
    .from('telegram_outbox')
    .update({
      attempts,
      next_retry_at: new Date(Date.now() + backoffMs(attempts)).toISOString(),
      last_error: reason.slice(0, 500),
    })
    .eq('id', row.id);
}
