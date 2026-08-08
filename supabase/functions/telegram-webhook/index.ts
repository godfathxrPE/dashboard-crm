// supabase/functions/telegram-webhook/index.ts — S-TG-1
//
// Входящие апдейты от Telegram. В ЭТОМ СПРИНТЕ ОБРАБАТЫВАЕТСЯ ТОЛЬКО `/start <token>`.
// Всё остальное — 200 и молчание. Кнопки «Выполнено», напоминания и быстрый ввод —
// S-TG-2/S-TG-3, и разбирать их заранее «на будущее» здесь нечем.
//
// ⚠️ `verify_jwt = false` — Telegram JWT НЕ НОСИТ и носить не может. Это осознанно
//    и компенсируется тремя вещами:
//
//    1. ОБЯЗАТЕЛЬНАЯ проверка заголовка `X-Telegram-Bot-Api-Secret-Token` против
//       секрета TELEGRAM_WEBHOOK_SECRET (значение задаётся при setWebhook). Не
//       совпал — 401 и выход. БЕЗ ЭТОЙ ПРОВЕРКИ ENDPOINT ОТКРЫТ МИРУ: любой,
//       угадавший URL, слал бы боту фальшивые `/start`.
//    2. Идемпотентность по `update_id` (таблица telegram_updates, 107): Telegram
//       ретраит апдейт, если ответ не пришёл за таймаут.
//    3. Привязка идёт через DEFINER-RPC link_telegram_account, а не прямым INSERT:
//       проверка токена, создание строки и её гашение — одна транзакция с
//       `for update`. Два одновременных `/start` с одним токеном иначе дали бы две
//       привязки.
//
// ⚠️ ВСЕГДА 200, даже на непонятное. Не-200 заставляет Telegram повторять апдейт по
//    нарастающей и в итоге отключить вебхук. Единственное исключение — 401 на
//    неверный секрет: это не Telegram, и уговаривать его нечего.
//
// ⚠️ Отступление от «edge не пишет в БД» — см. шапку telegram-send/index.ts.
//    Здесь функция пишет только в telegram_updates (журнал транспорта, для
//    authenticated закрыт полностью); рабочие данные меняет RPC с явным актором.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const TELEGRAM_API = 'https://api.telegram.org';
const REQUEST_TIMEOUT_MS = 10_000;

const MSG_LINKED =
  'Готово — Telegram привязан. Теперь уведомления CRM приходят сюда.';
const MSG_BAD_TOKEN =
  'Ссылка устарела или уже использована. Откройте Настройки → Telegram в CRM и получите новую.';
const MSG_NO_TOKEN =
  'Привязка делается из CRM: Настройки → Telegram → «Подключить Telegram».';

/** Минимальная форма апдейта. Всё, чего здесь нет, в этом спринте не разбирается. */
interface TelegramUpdate {
  update_id?: number;
  message?: {
    text?: string;
    chat?: { id?: number };
    from?: { id?: number; username?: string };
  };
}

function ok(): Response {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/** Сравнение без ранней остановки — та же функция, что в telegram-send. */
function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length || ea.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}

/**
 * Ответ пользователю — ПРЯМЫМ вызовом, не через outbox: это реакция на его
 * действие прямо сейчас, а очередь добавила бы к ней до минуты задержки.
 * Без `parse_mode`: тексты — литералы выше, размечать в них нечего, а plain text
 * снимает вопрос экранирования целиком.
 */
async function reply(botToken: string, chatId: number, text: string): Promise<void> {
  try {
    await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    // Ответить не смогли — привязка при этом уже создана и работает. Ронять
    // обработку нельзя: Telegram начнёт ретраить и создаст вторую попытку привязки.
    console.error('telegram-webhook: ответ не ушёл:', e instanceof Error ? e.message : String(e));
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const expectedSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? '';
  const providedSecret = req.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? '';

  // Пустой секрет в окружении = закрыто. «Не задан — пропускаем» превратило бы
  // забытую переменную в открытый миру endpoint.
  if (!expectedSecret || !timingSafeEqual(providedSecret, expectedSecret)) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return ok(); // мусор в теле — Telegram ретраить не заставляем
  }

  const updateId = update.update_id;
  if (typeof updateId !== 'number') return ok();

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

  // Идемпотентность. 23505 = такой update_id уже обработан, это повтор.
  const { error: dupErr } = await supabase
    .from('telegram_updates')
    .insert({ update_id: updateId });

  if (dupErr) {
    if (dupErr.code === '23505') return ok();
    console.error('telegram-webhook: журнал апдейтов недоступен:', dupErr.message);
    return ok();
  }

  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
  const text = update.message?.text?.trim() ?? '';
  const chatId = update.message?.chat?.id;
  const fromId = update.message?.from?.id;

  // Не `/start` — молчим. Любые другие апдейты (свободный текст, callback_query)
  // разбирает S-TG-2; отвечать на них «не понимаю» значит учить людей, что бот
  // умеет переписку, которой у него нет.
  if (!text.startsWith('/start') || typeof chatId !== 'number' || typeof fromId !== 'number') {
    return ok();
  }

  if (!botToken) {
    console.error('telegram-webhook: TELEGRAM_BOT_TOKEN не задан');
    return ok();
  }

  // `/start` без аргумента — человек нашёл бота сам, минуя CRM.
  const token = text.slice('/start'.length).trim();
  if (!token) {
    await reply(botToken, chatId, MSG_NO_TOKEN);
    return ok();
  }

  const { data, error } = await supabase.rpc('link_telegram_account', {
    p_token: token,
    p_telegram_user_id: fromId,
    p_chat_id: chatId,
    p_username: update.message?.from?.username ?? null,
  });

  if (error) {
    console.error('telegram-webhook: link_telegram_account упал:', error.message);
    await reply(botToken, chatId, MSG_BAD_TOKEN);
    return ok();
  }

  const linked = (data as { ok?: boolean } | null)?.ok === true;
  await reply(botToken, chatId, linked ? MSG_LINKED : MSG_BAD_TOKEN);

  return ok();
});
