// supabase/functions/telegram-webhook/index.ts — S-TG-1, + callback_query в S-TG-2,
// + свободный текст в S-TG-3
//
// Входящие апдейты от Telegram: `/start <token>` (привязка, S-TG-1), нажатие
// кнопки «Выполнено» (`callback_query` с data `tgdone:<uuid>`, S-TG-2) и свободный
// текст — быстрый ввод компании или контакта (S-TG-3, разбор в `./capture.ts`).
// Команды, кроме `/start`, — 200 и молчание.
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
//    4. S-TG-2: закрытие задачи — тоже RPC (tg_complete_task) С ЯВНЫМ АКТОРОМ.
//       Прямого UPDATE по `tasks` здесь нет и быть не может: функция работает под
//       service_role, где `auth.uid()` = NULL, то есть RLS не защищает ничего.
//       Актор берётся из привязки, права проверяет сама RPC.
//
// ⚠️ ВСЕГДА 200, даже на непонятное. Не-200 заставляет Telegram повторять апдейт по
//    нарастающей и в итоге отключить вебхук. Единственное исключение — 401 на
//    неверный секрет: это не Telegram, и уговаривать его нечего.
//
// ⚠️ Отступление от «edge не пишет в БД» — см. шапку telegram-send/index.ts.
//    Здесь функция пишет только в telegram_updates (журнал транспорта, для
//    authenticated закрыт полностью); рабочие данные меняет RPC с явным актором.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { handleCaptureCallback, handleCaptureText, type BotApi } from './capture.ts';
import { parseCaptureCallbackData } from '../_shared/telegram-capture.ts';
import { requireEnv } from '../_shared/env.ts';

// ⚠️ ЧИТАЕМ ПРИ ХОЛОДНОМ СТАРТЕ И БРОСАЕМ. Было `Deno.env.get(...) ?? ''`: без
//    переменной клиент уходил без ключа, а видно это становилось за три перехода —
//    чужим 401. Бросок здесь роняет функцию с именем переменной в первой строке лога.
//    Стрелка, а не сам `Deno.env.get`: оторванный метод теряет `this`.
const SUPABASE_URL = requireEnv('SUPABASE_URL', (n) => Deno.env.get(n));
const SUPABASE_SERVICE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY', (n) => Deno.env.get(n));

const TELEGRAM_API = 'https://api.telegram.org';
const REQUEST_TIMEOUT_MS = 10_000;

const MSG_LINKED =
  'Готово — Telegram привязан. Теперь уведомления CRM приходят сюда.';
const MSG_BAD_TOKEN =
  'Ссылка устарела или уже использована. Откройте Настройки → Telegram в CRM и получите новую.';
const MSG_NO_TOKEN =
  'Привязка делается из CRM: Настройки → Telegram → «Подключить Telegram».';

/** Минимальная форма апдейта. Всё, чего здесь нет, не разбирается. */
interface TelegramUpdate {
  update_id?: number;
  message?: {
    text?: string;
    chat?: { id?: number };
    from?: { id?: number; username?: string };
  };
  /** S-TG-2: нажатие inline-кнопки. */
  callback_query?: {
    id?: string;
    data?: string;
    from?: { id?: number };
    message?: {
      message_id?: number;
      text?: string;
      chat?: { id?: number };
    };
  };
}

// ═══ S-TG-2: формат callback_data ═══
//
// ⚠️ ЗЕРКАЛО `src/lib/domain/telegram-message.ts` (там же юнит-тесты) и
//    `public.telegram_task_keyboard()` (108). Импортом не связаны: edge-функция
//    бандлится отдельно от приложения и до `src/` не дотягивается. Правится тем же
//    коммитом — расхождение означает кнопку, которую бот не понимает.
const TASK_DONE_PREFIX = 'tgdone:';
const CALLBACK_DATA_MAX_BYTES = 64;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const CB_DONE = 'Готово';
const CB_ALREADY = 'Задача уже закрыта';
const CB_FOREIGN = 'Это не ваша задача';
const CB_NOT_LINKED = 'Профиль не привязан — откройте Настройки в CRM';
const CB_FAILED = 'Не удалось. Откройте задачу в CRM';
const CB_UNKNOWN = 'Кнопка устарела';

/**
 * Разбор `callback_data`. Возвращает `null` на всём, что не легло в форму ТОЧНО.
 *
 * Это единственная точка, где в бота приходит строка, выбранную не нами: нажать
 * кнопку может кто угодно, у кого сохранилось старое сообщение. Длина, префикс,
 * форма uuid — здесь только формат; права проверяет RPC.
 */
function parseTaskCallbackData(data: string | null | undefined): string | null {
  if (typeof data !== 'string') return null;
  if (new TextEncoder().encode(data).length > CALLBACK_DATA_MAX_BYTES) return null;
  if (!data.startsWith(TASK_DONE_PREFIX)) return null;
  const id = data.slice(TASK_DONE_PREFIX.length);
  return UUID_RE.test(id) ? id : null;
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
 *
 * Возвращает `message_id` отправленного сообщения или null: S-TG-3 редактирует
 * собственную заглушку «Разбираю…», и без id её не найти.
 */
function reply(botToken: string, chatId: number, text: string): Promise<number | null> {
  // Сбой глотается внутри callBotApi: привязка при этом уже создана и работает,
  // а ронять обработку нельзя — Telegram начнёт ретраить и создаст вторую попытку.
  return sendMessage(botToken, chatId, text);
}

/**
 * `sendMessage` с возвратом id. `parseMode`/`replyMarkup` — для карточки быстрого
 * ввода (S-TG-3); у остальных вызовов их нет.
 */
async function sendMessage(
  botToken: string,
  chatId: number,
  text: string,
  opts: { parseMode?: 'HTML'; replyMarkup?: unknown } = {},
): Promise<number | null> {
  const result = await callBotApi(botToken, 'sendMessage', {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...(opts.parseMode ? { parse_mode: opts.parseMode } : {}),
    ...(opts.replyMarkup ? { reply_markup: opts.replyMarkup } : {}),
  });
  const id = (result as { message_id?: unknown } | null)?.message_id;
  return typeof id === 'number' ? id : null;
}

/**
 * Общая обёртка над Bot API: сбой одного вызова не имеет права ронять обработку.
 *
 * Возвращает поле `result` ответа Telegram или null. ⚠️ Не-2xx тоже даёт null, и
 * это ВАЖНО логировать с телом: Telegram отвечает 400 с внятным `description`
 * («can't parse entities», «BUTTON_URL_INVALID»), и без него отладка карточки
 * превращается в гадание — сообщение просто не приходит.
 */
async function callBotApi(
  botToken: string,
  method: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  try {
    const resp = await fetch(`${TELEGRAM_API}/bot${botToken}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = (await resp.json().catch(() => null)) as
      | { ok?: boolean; result?: unknown; description?: string }
      | null;
    if (!resp.ok || body?.ok !== true) {
      console.error(`telegram-webhook: ${method} отвергнут:`, resp.status, body?.description ?? '');
      return null;
    }
    return body.result ?? null;
  } catch (e) {
    console.error(
      `telegram-webhook: ${method} не прошёл:`,
      e instanceof Error ? e.message : String(e),
    );
    return null;
  }
}

/**
 * ⚠️ ОБЯЗАТЕЛЕН В КАЖДОЙ ВЕТКЕ, ВКЛЮЧАЯ ОШИБОЧНЫЕ. Без ответа кнопка у человека
 *    «крутится» до таймаута Telegram, и он жмёт её ещё раз.
 */
async function answerCallback(botToken: string, callbackId: string, text: string): Promise<void> {
  await callBotApi(botToken, 'answerCallbackQuery', {
    callback_query_id: callbackId,
    text,
  });
}

/**
 * `editMessageText` общего назначения (S-TG-3).
 *
 * ⚠️ РАЗЛИЧАТЬ ДВА СЛУЧАЯ, И ЭТО НЕ ПРИДИРКА. Запрет на `parse_mode` из S-TG-2
 *    (см. `markMessageDone`) относится к правке, которая ПЕРЕСЫЛАЕТ обратно текст,
 *    полученный от Telegram: он приходит уже разрисованным, с вернувшимися `& < >`,
 *    и HTML на нём падает на первом амперсанде. Здесь же текст СВОЙ, собранный
 *    только что и экранированный `escapeTelegramHtml` — размечать его можно и нужно,
 *    иначе карточка подтверждения потеряет заголовок.
 */
async function editMessage(
  botToken: string,
  chatId: number,
  messageId: number,
  text: string,
  opts: { parseMode?: 'HTML'; replyMarkup?: unknown } = {},
): Promise<void> {
  await callBotApi(botToken, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    disable_web_page_preview: true,
    ...(opts.parseMode ? { parse_mode: opts.parseMode } : {}),
    // Пустая клавиатура — не то же, что её отсутствие: `{inline_keyboard: []}`
    // СНИМАЕТ кнопки, а пропуск поля оставляет старые нажимаемыми.
    reply_markup: opts.replyMarkup ?? { inline_keyboard: [] },
  });
}

/**
 * Дописать к сообщению отметку и СНЯТЬ КЛАВИАТУРУ. Без снятия кнопка остаётся
 * нажимаемой, и человек будет жать её повторно на уже закрытой задаче.
 *
 * ⚠️ БЕЗ `parse_mode`. Telegram отдаёт `message.text` уже РАЗМЕЧЕННЫМ (сущности
 *    вынесены в `entities`, а `&`, `<`, `>` вернулись в исходном виде). Отправить
 *    его обратно с parse_mode HTML нельзя: имя компании с амперсандом уронило бы
 *    правку. Цена — жирный заголовок в отредактированном сообщении становится
 *    обычным текстом; это уже отработанное сообщение, и читаемость важнее.
 */
async function markMessageDone(
  botToken: string,
  chatId: number,
  messageId: number,
  originalText: string,
  mark: string,
): Promise<void> {
  await callBotApi(botToken, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: `${originalText}\n\n${mark}`,
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [] },
  });
}

/**
 * Bot API, свёрнутый в три метода для `capture.ts` (S-TG-3).
 *
 * Так, а не прямым импортом хелперов: `capture.ts` импортируется отсюда, и обратный
 * импорт замкнул бы цикл. Заодно у модуля быстрого ввода не остаётся доступа к
 * `callBotApi` целиком — из мессенджера он умеет ровно три вещи.
 */
function makeBotApi(botToken: string): BotApi {
  return {
    send: (chatId, text) => sendMessage(botToken, chatId, text),
    edit: (chatId, messageId, text, opts) => editMessage(botToken, chatId, messageId, text, opts),
    answer: (callbackId, text) => answerCallback(botToken, callbackId, text),
  };
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

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

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

  if (!botToken) {
    console.error('telegram-webhook: TELEGRAM_BOT_TOKEN не задан');
    return ok();
  }

  // ── S-TG-2: нажатие кнопки «Выполнено» ──────────────────────────────
  // Ветка `/start` ниже НЕ ТРОГАЕТСЯ: привязка и закрытие задачи — разные апдейты,
  // и пересечься они не могут (у одного `message`, у другого `callback_query`).
  if (update.callback_query) {
    await handleCallbackQuery(supabase, botToken, update.callback_query);
    return ok();
  }

  const text = update.message?.text?.trim() ?? '';
  const chatId = update.message?.chat?.id;
  const fromId = update.message?.from?.id;

  if (!text || typeof chatId !== 'number' || typeof fromId !== 'number') return ok();

  // ── S-TG-3: свободный текст — быстрый ввод ──────────────────────────
  // ⚠️ ПОРЯДОК ВЕТОК ОБЯЗАТЕЛЕН: секрет → идемпотентность → callback_query →
  //    команды → свободный текст. Текст разбирается ПОСЛЕДНИМ; поставь его выше —
  //    и он проглотит `/start`, то есть сломает привязку, отправив токен в модель.
  if (!text.startsWith('/')) {
    await handleCaptureText(supabase, makeBotApi(botToken), chatId, fromId, text);
    return ok();
  }

  // Команда, но не `/start` — молчим. Отвечать «не понимаю» значит учить людей,
  // что у бота есть набор команд, которого нет.
  if (!text.startsWith('/start')) return ok();

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

/**
 * S-TG-2: кнопка «Выполнено».
 *
 * ⚠️ ДАННЫЕ МЕНЯЕТ ТОЛЬКО RPC `tg_complete_task` С ЯВНЫМ АКТОРОМ. Прямого UPDATE
 *    здесь нет и быть не может: функция работает под service_role, где
 *    `auth.uid()` = NULL, то есть RLS не защищает ничего. Актор берётся из
 *    привязки (`telegram_accounts.profile_id` по `from.id`), а права — org и
 *    владение задачей — проверяет сама RPC.
 *
 * ⚠️ РЕЗОЛВ АКТОРА ИДЁТ ПО `from.id`, А НЕ ПО `message.chat.id`. Для личного чата
 *    они совпадают, но кнопку можно нажать и в пересланном сообщении: там chat —
 *    чужой, а `from` всегда тот, кто нажал.
 */
async function handleCallbackQuery(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  botToken: string,
  cq: NonNullable<TelegramUpdate['callback_query']>,
): Promise<void> {
  const callbackId = cq.id;
  // Без id ответить нечем — и подтвердить нажатие невозможно. Дальше не идём:
  // менять данные по запросу, на который нельзя ответить, значит оставить
  // человека в неведении о результате.
  if (typeof callbackId !== 'string' || callbackId === '') return;

  const fromId = cq.from?.id;
  if (typeof fromId !== 'number') {
    await answerCallback(botToken, callbackId, CB_FAILED);
    return;
  }

  const taskId = parseTaskCallbackData(cq.data);
  if (!taskId) {
    // ── S-TG-3: кнопки карточки быстрого ввода ────────────────────────
    // ⚠️ Разборы РАЗДЕЛЬНЫЕ, а не один общий. `tgdone:` — про задачи, `tgcap*:` —
    //    про черновики; общий парсер потерял бы ответ на вопрос «чья это кнопка»,
    //    а вместе с ним и то, какую RPC звать. Пересечений между префиксами нет:
    //    двоеточие входит в каждый (`tgcap:` ≠ `tgcapx:`), проверено тестами.
    const capture = parseCaptureCallbackData(cq.data);
    if (capture) {
      await handleCaptureCallback(
        supabase,
        makeBotApi(botToken),
        {
          id: callbackId,
          from_id: fromId,
          chat_id: typeof cq.message?.chat?.id === 'number' ? cq.message.chat.id : null,
          message_id: typeof cq.message?.message_id === 'number' ? cq.message.message_id : null,
        },
        capture,
      );
      return;
    }
    await answerCallback(botToken, callbackId, CB_UNKNOWN);
    return;
  }

  const { data: account, error: accErr } = await supabase
    .from('telegram_accounts')
    .select('profile_id')
    .eq('telegram_user_id', fromId)
    .maybeSingle();

  if (accErr) {
    console.error('telegram-webhook: чтение привязки упало:', accErr.message);
    await answerCallback(botToken, callbackId, CB_FAILED);
    return;
  }

  const actorId = (account as { profile_id?: string } | null)?.profile_id;
  if (!actorId) {
    await answerCallback(botToken, callbackId, CB_NOT_LINKED);
    return;
  }

  const { data: result, error } = await supabase.rpc('tg_complete_task', {
    p_actor_id: actorId,
    p_task_id: taskId,
  });

  if (error) {
    // 42501 — единственный ожидаемый отказ: задача чужая или актор вне её org.
    // Остальное — настоящая поломка, и человеку про неё говорить нечего, кроме
    // «откройте в CRM».
    if (error.code === '42501') {
      await answerCallback(botToken, callbackId, CB_FOREIGN);
      return;
    }
    console.error('telegram-webhook: tg_complete_task упал:', error.message);
    await answerCallback(botToken, callbackId, CB_FAILED);
    return;
  }

  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;
  const originalText = cq.message?.text ?? '';
  const canEdit = typeof chatId === 'number' && typeof messageId === 'number';

  if (result === 'done' || result === 'already_done') {
    await answerCallback(botToken, callbackId, result === 'done' ? CB_DONE : CB_ALREADY);
    // Клавиатуру снимаем в ОБОИХ случаях: на уже закрытой задаче кнопка так же
    // бессмысленна, как на только что закрытой.
    if (canEdit) {
      await markMessageDone(botToken, chatId, messageId, originalText, '✓ Выполнено');
    }
    return;
  }

  // 'not_found' — задачу удалили между отправкой сообщения и нажатием. Кнопку
  // тоже убираем: возвращаться к ней незачем.
  await answerCallback(botToken, callbackId, CB_FAILED);
  if (canEdit) {
    await markMessageDone(botToken, chatId, messageId, originalText, '— задача не найдена');
  }
}
