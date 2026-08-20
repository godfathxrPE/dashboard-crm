// supabase/functions/telegram-webhook/voice.ts — S-TG-VOICE-1
//
// Голосовое сообщение → текст → СУЩЕСТВУЮЩАЯ ветка свободного текста.
//
// ⚠️ ФАЙЛ ЗАКАНЧИВАЕТСЯ НА СТРОКЕ ТЕКСТА. Всё, что дальше — разбор `ai-capture`,
//    резолверы, карточка, кнопки, RPC — уже написано и работает для текста; голос
//    вызывает ТУ ЖЕ `handleCaptureText`, а не её копию. Если в этом файле однажды
//    появится «для голосовых разбираем иначе», значит что-то делается неправильно:
//    голос — второй вход в ту же трубу, а не второй разбор.
//
// ⚠️ АУДИО НИГДЕ НЕ СОХРАНЯЕТСЯ. Голосовое остаётся в Telegram, у нас живёт только
//    текст в `source_text` черновика. Файл существует в памяти изолята ровно на время
//    запроса — тот же контур, что у `transcribe` (Security №5).

import {
  CAPTURE_MAX_CHARS,
  MSG_NOT_LINKED,
  handleCaptureText,
  invokeJson,
  resolveActor,
  type BotApi,
  type Supa,
} from './capture.ts';
import {
  VOICE_MSG,
  checkVoiceLimits,
  transcriptToText,
  voiceLimitMessage,
  type VoiceMeta,
} from '../_shared/telegram-voice.ts';
import { buildVoiceTerms } from '../_shared/voice-terms.ts';
// ⚠️ ИМПОРТ ЧЕРЕЗ ГРАНИЦУ ФУНКЦИИ — ОСОЗНАННО. Бюджет подсказки принадлежит
//    `buildPrompt`, и переписать сюда число 200 значит завести ровно тот долг,
//    который этот спринт закрывает (принимали 300, доезжало 200, разницу молча
//    выбрасывали). `glossary.ts` — чистый модуль без `Deno.serve`, импортируется
//    безопасно. Цена: правка бюджета требует редеплоя ОБЕИХ функций.
import { TERMS_CHAR_BUDGET } from '../transcribe/glossary.ts';

const TELEGRAM_API = 'https://api.telegram.org';
/** Скачивание файла — не Bot API-метод: таймаут свой, аудио тяжелее JSON. */
const FILE_TIMEOUT_MS = 30_000;

/** Ответ `getFile`. Нужен ровно `file_path`. */
interface TelegramFile {
  file_path?: unknown;
}

/**
 * Скачать голосовое в память.
 *
 * ⚠️ СОБРАННЫЙ URL В ЛОГ НЕ ПИШЕТСЯ НИ ПРИ КАКОМ ИСХОДЕ — в нём токен бота целиком.
 *    Логировать можно `file_path` (он временный и сам по себе бесполезен), статус и
 *    размер. Логи функций читаются из дашборда, и токен в них — это токен в них.
 */
async function downloadVoice(botToken: string, fileId: string): Promise<ArrayBuffer | null> {
  let info: unknown;
  try {
    const resp = await fetch(`${TELEGRAM_API}/bot${botToken}/getFile`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ file_id: fileId }),
      signal: AbortSignal.timeout(FILE_TIMEOUT_MS),
    });
    const body = (await resp.json().catch(() => null)) as
      | { ok?: boolean; result?: unknown; description?: string }
      | null;
    if (!resp.ok || body?.ok !== true) {
      console.error('telegram-webhook: getFile отвергнут:', resp.status, body?.description ?? '');
      return null;
    }
    info = body.result;
  } catch (e) {
    console.error('telegram-webhook: getFile не прошёл:', e instanceof Error ? e.message : String(e));
    return null;
  }

  const filePath = (info as TelegramFile | null)?.file_path;
  if (typeof filePath !== 'string' || filePath === '') {
    console.error('telegram-webhook: getFile вернул пустой file_path');
    return null;
  }

  try {
    const resp = await fetch(`${TELEGRAM_API}/file/bot${botToken}/${filePath}`, {
      signal: AbortSignal.timeout(FILE_TIMEOUT_MS),
    });
    if (!resp.ok) {
      // Печатаем file_path, а не URL: путь временный и без токена бесполезен.
      console.error(`telegram-webhook: файл ${filePath} не скачался:`, resp.status);
      return null;
    }
    return await resp.arrayBuffer();
  } catch (e) {
    console.error(
      `telegram-webhook: скачивание ${filePath} не прошло:`,
      e instanceof Error ? e.message : String(e),
    );
    return null;
  }
}

/** Сколько строк тянем из БД. Потолок ВЫБОРКИ, не бюджета — бюджет режет `buildVoiceTerms`. */
const DEALS_FETCH_LIMIT = 40;
const PEOPLE_FETCH_LIMIT = 30;

function textField(row: unknown, key: string): string {
  if (typeof row !== 'object' || row === null) return '';
  const value = (row as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

/**
 * Имена клиентов и коллег для подсказки Whisper.
 *
 * ⚠️ СПИСОК СОБИРАЕТСЯ ИЗ БД, А НЕ ИЗ ГОЛОВЫ. Зашитые названия — это враньё с
 *    отложенным сроком: завтра появится новый клиент, и подсказка будет учить
 *    Whisper вчерашнему справочнику.
 *
 * ⚠️ СБОЙ ВЫБОРКИ НЕ ОТМЕНЯЕТ РАСШИФРОВКУ. Нет имён — идём без них, ровно как до
 *    этого спринта. Голосовое, потерянное из-за упавшего `select`, — цена,
 *    несопоставимая с пользой от подсказки.
 *
 * ⚠️ `limit` ЗДЕСЬ — ЗАЩИТА ОТ РАЗРАСТАНИЯ ВЫБОРКИ, А НЕ ОТ БЮДЖЕТА. Сорок сделок
 *    в 200 знаков не влезут никогда, и это нормально: порядок `updated_at desc`
 *    означает, что попадут самые свежие — те, о которых сейчас и говорят.
 */
async function loadVoiceTerms(supabase: Supa, orgId: string): Promise<string> {
  try {
    const [dealsRes, peopleRes] = await Promise.all([
      supabase
        .from('projects')
        .select('name')
        .eq('org_id', orgId)
        .eq('type', 'client')
        .order('updated_at', { ascending: false })
        .limit(DEALS_FETCH_LIMIT),
      supabase
        .from('memberships')
        .select('profiles!inner(full_name)')
        .eq('org_id', orgId)
        .limit(PEOPLE_FETCH_LIMIT),
    ]);

    if (dealsRes?.error) console.error('telegram-webhook: сделки для terms не выбрались:', dealsRes.error.message);
    if (peopleRes?.error) console.error('telegram-webhook: коллеги для terms не выбрались:', peopleRes.error.message);

    const deals: string[] = Array.isArray(dealsRes?.data)
      ? dealsRes.data.map((row: unknown) => textField(row, 'name')).filter((n: string) => n !== '')
      : [];

    const people: string[] = Array.isArray(peopleRes?.data)
      ? peopleRes.data
          .map((row: unknown) => {
            // PostgREST отдаёт embedded many-to-one объектом, но на некоторых
            // версиях — массивом из одного элемента. Оба вида читаем, гадать незачем.
            const raw = typeof row === 'object' && row !== null ? (row as Record<string, unknown>).profiles : null;
            return textField(Array.isArray(raw) ? raw[0] : raw, 'full_name');
          })
          .filter((n: string) => n !== '')
      : [];

    return buildVoiceTerms({ deals, people }, TERMS_CHAR_BUDGET);
  } catch (e) {
    console.error('telegram-webhook: сбор terms не прошёл:', e instanceof Error ? e.message : String(e));
    return '';
  }
}

/**
 * Голосовое сообщение целиком: лимиты → скачивание → расшифровка → общий путь.
 *
 * ⚠️ ЛИМИТЫ ПРОВЕРЯЮТСЯ ДО СКАЧИВАНИЯ. Метаданные приходят в самом апдейте
 *    бесплатно; четыре минуты речи — это мегабайты, за которые незачем платить
 *    трафиком и временем изолята, чтобы затем отказать.
 *
 * ⚠️ «Расшифровываю…» уходит ДО обращения к Groq. Молчание бота на несколько секунд
 *    человек читает как поломку и присылает голосовое повторно — то есть платит
 *    вторым прогоном ASR за наше молчание (тот же приём, что «Разбираю…» в тексте).
 */
export async function handleVoiceMessage(
  supabase: Supa,
  bot: BotApi,
  botToken: string,
  chatId: number,
  fromId: number,
  voice: VoiceMeta,
): Promise<void> {
  // ⚠️ ПРИВЯЗКА ПРОВЕРЯЕТСЯ ПЕРВОЙ, ДО СКАЧИВАНИЯ И ДО GROQ. Иначе любой, кто нашёл
  //    бота в поиске, жжёт нам ASR своим голосовым, а отказ получает через десять
  //    секунд вместо мгновения. `handleCaptureText` проверит её ещё раз — это не
  //    дубль, а разные точки: там она нужна ради org_id.
  const actor = await resolveActor(supabase, fromId);
  if (!actor) {
    await bot.send(chatId, MSG_NOT_LINKED);
    return;
  }

  const verdict = checkVoiceLimits(voice);
  if (!verdict.ok) {
    await bot.send(chatId, voiceLimitMessage(verdict));
    return;
  }

  const fileId = typeof voice.file_id === 'string' ? voice.file_id : '';
  if (!fileId) {
    console.error('telegram-webhook: голосовое без file_id');
    await bot.send(chatId, VOICE_MSG.unavailable);
    return;
  }

  const progressId = await bot.send(chatId, VOICE_MSG.progress);
  // Не отправилась заглушка — редактировать нечего; дальше отвечаем новым
  // сообщением. Терять расшифровку из-за сбоя одного sendMessage незачем.
  const say = async (text: string) => {
    if (progressId !== null) await bot.edit(chatId, progressId, text);
    else await bot.send(chatId, text);
  };

  // ⚠️ ЗАПРОСЫ УХОДЯТ ДО `await` НА СКАЧИВАНИИ, А НЕ ПОСЛЕ. Пока Telegram отдаёт
  //    `file_path` и гонит нам байты, БД отвечает параллельно — ожидание бота не
  //    удлиняется ни на миллисекунду. Последовательный вызов добавил бы два
  //    круговых к каждому голосовому просто так.
  const termsPromise = loadVoiceTerms(supabase, actor.org_id);

  const bytes = await downloadVoice(botToken, fileId);
  if (bytes === null) {
    await say(VOICE_MSG.unavailable);
    return;
  }

  // Telegram отдаёт голосовые в Ogg/Opus, Groq принимает ogg напрямую —
  // перекодировать не нужно и нечем: ffmpeg в Deno Edge Runtime нет.
  const form = new FormData();
  const mime = typeof voice.mime_type === 'string' && voice.mime_type ? voice.mime_type : 'audio/ogg';
  form.append('file', new Blob([bytes], { type: mime }), 'voice.oga');
  // `language` задаём явно: без него Whisper определяет язык сам и на коротких
  // репликах ошибается — двухсекундное «Позвонить Иванову» уезжало в английский.
  form.append('language', 'ru');
  // Имена собственные — первыми в prompt, до доменного глоссария: `buildPrompt`
  // расставляет приоритет сам. Пусто — поля не шлём вовсе.
  const terms = await termsPromise;
  if (terms) form.append('terms', terms);

  // ⚠️ Content-Type руками НЕ выставляется: boundary проставляет fetch. Свой
  //    заголовок сломал бы разбор multipart на стороне `transcribe`.
  const reply = await invokeJson(supabase, 'transcribe', form);
  if (reply === null) {
    // `invokeJson` отдаёт null ТОЛЬКО на сбое вызова — это наша сторона, и «попробуйте
    // ещё раз» тут ложный совет.
    await say(VOICE_MSG.unavailable);
    return;
  }

  const text = transcriptToText(reply as { text?: unknown; segments?: unknown });
  if (text === '') {
    // Пусто ПОСЛЕ фильтра штампов: «Продолжение следует…» формально непустой текст,
    // и без фильтра он уехал бы в разбор и стал задачей «продолжение следует».
    await say(VOICE_MSG.empty);
    return;
  }

  // ⚠️ ДЛИНУ ОТБИВАЕМ ЗДЕСЬ, СВОИМ ТЕКСТОМ. Две минуты плотной речи дают больше
  //    2000 знаков и упираются в лимит `ai-capture`; общий отказ текстовой ветки
  //    («пришлите только карточку контакта или реквизиты») человеку, который ничего
  //    не присылал, а говорил, читается как ответ не на его действие.
  if (text.length > CAPTURE_MAX_CHARS) {
    await say(
      `Расшифровка получилась слишком длинной (${text.length} знаков, максимум ` +
        `${CAPTURE_MAX_CHARS}). Скажите короче — одно поручение или один контакт.`,
    );
    return;
  }

  // ── Здесь голос заканчивается ──────────────────────────────────────
  // Дальше — ровно тот же путь, что у `message.text`: разбор, резолверы, карточка,
  // кнопки. Собственной ветки у голоса нет и не должно быть. Сообщение прогресса
  // передаём: «Расшифровываю…» обязано стать «Разбираю…», а не остаться висеть.
  await handleCaptureText(supabase, bot, chatId, fromId, text, progressId);
}
