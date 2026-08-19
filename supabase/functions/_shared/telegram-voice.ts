// supabase/functions/_shared/telegram-voice.ts — S-TG-VOICE-1
//
// Голосовое сообщение как ВТОРОЙ ВХОД в быстрый ввод.
//
// ⚠️ ЗДЕСЬ НЕТ НИКАКОГО РАЗБОРА, И ЭТО ГЛАВНОЕ СВОЙСТВО ФАЙЛА. Голос заканчивается
//    на строке текста, дальше идёт та же `handleCaptureText`, что и у `message.text`.
//    Развилки «а это из голоса» не существует ни на одном шаге ниже расшифровки: две
//    ветки «разобрать и показать карточку» разъедутся на первой же правке.
//
// ⚠️ Модуль ЧИСТЫЙ: ни сети, ни `Deno`. Всё, что здесь есть, — выбор ветки, проверка
//    лимитов и сборка текстов. Скачивание файла и вызов `transcribe` живут в
//    `telegram-webhook/voice.ts` и проверяются сквозным смоком, а не юнит-тестом.

import { MAX_AUDIO_BYTES, MAX_VOICE_SECONDS } from './transcribe-limits.ts';
import { segmentsToText, stripHallucinations, type WhisperSegment } from './hallucinations.ts';

// ═══ Выбор ветки ═══

/**
 * Что делать с входящим сообщением.
 *
 * `unsupported_media` — отдельный исход, а не молчание: человек, приславший кружок,
 * должен узнать, что бот его не понимает. Молчащий бот неотличим от сломанного.
 */
export type MessageRoute = 'voice' | 'text' | 'unsupported_media' | 'ignore';

/**
 * Минимальная форма сообщения. Всё, чего здесь нет, не разбирается.
 *
 * `voice.duration` и `voice.file_size` необязательны намеренно: Bot API помечает
 * `file_size` опциональным, и отсутствие метрики не повод отказывать — отсутствующий
 * размер проверит сам `transcribe`, у которого файл уже в руках.
 */
export interface VoiceMeta {
  file_id?: string;
  duration?: number;
  file_size?: number;
  mime_type?: string;
}

export interface RoutableMessage {
  text?: string;
  caption?: string;
  voice?: VoiceMeta;
  audio?: unknown;
  video_note?: unknown;
  video?: unknown;
  document?: unknown;
  sticker?: unknown;
  photo?: unknown;
}

/**
 * Ветка обработки.
 *
 * ⚠️ ГОЛОС ПРОВЕРЯЕТСЯ ПЕРВЫМ, И ЭТО НЕ БОРЬБА ЗА ПРИОРИТЕТ: у голосового апдейта
 *    поля `text` нет вовсе, перепутать нельзя. Порядок зафиксирован ради
 *    предсказуемости — `voice` с `caption` обязан остаться голосовым, а не уехать в
 *    текстовую ветку по подписи, которую человек к голосовому вообще не пишет
 *    (Telegram её к `voice` и не прикрепляет, но форма апдейта этого не запрещает).
 *
 * ⚠️ `audio` / `video_note` / `document` / `video` — ВНЕ СКОУПА, а не «тоже голос».
 *    У присланного музыкального файла и кружка другой сценарий и другой размер:
 *    часовой mp3 упрётся в лимит уже после скачивания, то есть после того, как мы
 *    заплатили за трафик.
 */
export function routeMessage(message: RoutableMessage | null | undefined): MessageRoute {
  if (!message) return 'ignore';
  if (message.voice) return 'voice';
  if (typeof message.text === 'string' && message.text.trim() !== '') return 'text';
  if (
    message.audio ||
    message.video_note ||
    message.video ||
    message.document ||
    message.sticker ||
    message.photo
  ) {
    return 'unsupported_media';
  }
  return 'ignore';
}

// ═══ Лимиты (проверяются ДО скачивания) ═══

export type VoiceLimitVerdict =
  | { ok: true }
  | { ok: false; reason: 'too_long'; seconds: number }
  | { ok: false; reason: 'too_big'; bytes: number };

/**
 * Годится ли голосовое к расшифровке.
 *
 * ⚠️ ПРОВЕРКА ДО СКАЧИВАНИЯ. Четыре минуты речи — это мегабайты, за которые мы
 *    платим трафиком и временем изолята, чтобы затем отказать. Метаданные приходят
 *    в самом апдейте бесплатно.
 *
 * ⚠️ Границы включающие: ровно `MAX_VOICE_SECONDS` — ещё годно. Отказ на «ровно
 *    три минуты» человек прочтёт как ошибку счёта, а не как правило.
 */
export function checkVoiceLimits(voice: VoiceMeta): VoiceLimitVerdict {
  const seconds = typeof voice.duration === 'number' ? voice.duration : 0;
  if (seconds > MAX_VOICE_SECONDS) return { ok: false, reason: 'too_long', seconds };

  const bytes = typeof voice.file_size === 'number' ? voice.file_size : 0;
  if (bytes > MAX_AUDIO_BYTES) return { ok: false, reason: 'too_big', bytes };

  return { ok: true };
}

// ═══ Транскрипт → текст ═══

/**
 * Ответ `transcribe` в форме, которую бот действительно использует.
 * Поля необязательны: сужаем внешний payload, а не доверяем ему.
 */
export interface TranscribeReply {
  text?: unknown;
  segments?: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function toSegments(raw: unknown): WhisperSegment[] {
  if (!Array.isArray(raw)) return [];
  const out: WhisperSegment[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    if (typeof item.text !== 'string') continue;
    out.push({
      text: item.text,
      avg_logprob: typeof item.avg_logprob === 'number' ? item.avg_logprob : null,
      compression_ratio: typeof item.compression_ratio === 'number' ? item.compression_ratio : null,
      no_speech_prob: typeof item.no_speech_prob === 'number' ? item.no_speech_prob : null,
    });
  }
  return out;
}

/**
 * Готовый текст расшифровки или пустая строка.
 *
 * ⚠️ ПУСТОТА ПРОВЕРЯЕТСЯ ПОСЛЕ ФИЛЬТРА ШТАМПОВ, А НЕ ДО. `whisper-large-v3` обучен
 *    на субтитрах и на тишине выдаёт «Продолжение следует…» — формально непустой
 *    текст, который уехал бы в `ai-capture` и превратился в задачу «продолжение
 *    следует». Порядок: метрики сегментов → список известных штампов → проверка на
 *    пустоту.
 *
 * ⚠️ Тот же порядок и тот же фильтр, что у клиентского пайплайна
 *    (`use-transcribe.ts`) — не копия правил, а тот же модуль.
 */
export function transcriptToText(reply: TranscribeReply | null | undefined): string {
  if (!reply) return '';
  const fallback = typeof reply.text === 'string' ? reply.text : '';
  const merged = segmentsToText(toSegments(reply.segments), fallback);
  return stripHallucinations(merged);
}

// ═══ Тексты ═══

/**
 * ⚠️ «НИЧЕГО НЕ РАЗОБРАЛ» И «НА НАШЕЙ СТОРОНЕ» — РАЗНЫЕ СТРОКИ, И РАЗНИЦА НЕ
 *    КОСМЕТИЧЕСКАЯ. Первая предлагает повтор, потому что повтор может помочь: тише
 *    сказал, ближе к микрофону — и распознается. Вторая повтор НЕ предлагает, потому
 *    что помочь не может. Склейка этих исходов в одну строку уже стоила часа: при
 *    исчерпанном балансе провайдера человек полчаса переформулировал сообщение,
 *    пытаясь угодить боту, которому нечем было отвечать (S-TG-3).
 */
export const VOICE_MSG = {
  progress: 'Расшифровываю…',
  parsing: 'Разбираю…',
  empty: 'Ничего не разобрал — тихо или слишком коротко. Попробуйте ещё раз.',
  unavailable:
    'Расшифровка временно недоступна — это на нашей стороне. Сообщите администратору CRM.',
  unsupportedMedia: 'Пришлите голосовое сообщение или текст.',
} as const;

/** Отказ по лимиту — с числом, чтобы человек понял, насколько промахнулся. */
export function voiceLimitMessage(verdict: Extract<VoiceLimitVerdict, { ok: false }>): string {
  if (verdict.reason === 'too_long') {
    return (
      `Слишком длинное голосовое (${verdict.seconds} сек, максимум ${MAX_VOICE_SECONDS}). ` +
      'Пришлите покороче или текстом.'
    );
  }
  const mb = (verdict.bytes / 1e6).toFixed(1);
  return (
    `Слишком большое голосовое (${mb} МБ, максимум ${Math.round(MAX_AUDIO_BYTES / 1e6)} МБ). ` +
    'Пришлите покороче или текстом.'
  );
}
