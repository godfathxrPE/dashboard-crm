import { describe, it, expect } from 'vitest';
import {
  routeMessage,
  checkVoiceLimits,
  transcriptToText,
  voiceLimitMessage,
  VOICE_MSG,
} from '../../supabase/functions/_shared/telegram-voice';
import {
  MAX_AUDIO_BYTES,
  MAX_VOICE_SECONDS,
} from '../../supabase/functions/_shared/transcribe-limits';

// ═══════════════════════════════════════════════════════
// S-TG-VOICE-1 — голосовое как второй вход в быстрый ввод.
//
// Тестируется ЧИСТАЯ часть: выбор ветки, лимиты, превращение ответа `transcribe`
// в строку текста и тексты исходов. Скачивание файла и вызов Groq — интеграционные,
// они проверяются сквозным смоком гейта живым голосом.
//
// ⚠️ ГЛАВНОЕ, ЧТО ЗДЕСЬ ОХРАНЯЕТСЯ: у голоса нет собственного разбора. Всё, что
//    ниже строки текста, — та же `handleCaptureText`, что и у `message.text`.
//    Поэтому и тестировать здесь нечего, кроме дороги ДО этой строки.
// ═══════════════════════════════════════════════════════

describe('routeMessage — выбор ветки по апдейту', () => {
  it('voice → голосовая', () => {
    expect(routeMessage({ voice: { file_id: 'abc', duration: 5 } })).toBe('voice');
  });

  it('text → текстовая', () => {
    expect(routeMessage({ text: 'позвонить Иванову' })).toBe('text');
  });

  // Telegram к `voice` подпись не прикрепляет, но форма апдейта этого не запрещает:
  // голосовое обязано остаться голосовым, а не уехать в текст по подписи.
  it('voice + caption → всё равно голосовая', () => {
    expect(routeMessage({ voice: { file_id: 'abc' }, caption: 'вот' })).toBe('voice');
  });

  it.each([
    ['audio', { audio: {} }],
    ['video_note', { video_note: {} }],
    ['video', { video: {} }],
    ['document', { document: {} }],
    ['sticker', { sticker: {} }],
    ['photo', { photo: [{}] }],
  ])('%s → нейтральный ответ, а не молчание', (_name, message) => {
    expect(routeMessage(message)).toBe('unsupported_media');
  });

  // Молчащий бот неотличим от сломанного — человек пришлёт то же самое ещё раз.
  it('на неподдержанное вложение есть текст ответа', () => {
    expect(VOICE_MSG.unsupportedMedia).toBe('Пришлите голосовое сообщение или текст.');
  });

  it.each([[undefined], [null], [{}], [{ text: '   ' }]])('пустое (%s) → ignore', (message) => {
    expect(routeMessage(message as Parameters<typeof routeMessage>[0])).toBe('ignore');
  });
});

describe('checkVoiceLimits — проверка ДО скачивания', () => {
  // Граница включающая: отказ на «ровно три минуты» человек прочтёт как ошибку
  // счёта, а не как правило.
  it.each([
    [MAX_VOICE_SECONDS - 1, true],
    [MAX_VOICE_SECONDS, true],
    [MAX_VOICE_SECONDS + 1, false],
  ])('duration %i сек → ok=%s', (duration, expected) => {
    expect(checkVoiceLimits({ duration }).ok).toBe(expected);
  });

  it.each([
    [MAX_AUDIO_BYTES - 1, true],
    [MAX_AUDIO_BYTES, true],
    [MAX_AUDIO_BYTES + 1, false],
  ])('file_size %i байт → ok=%s', (file_size, expected) => {
    expect(checkVoiceLimits({ duration: 10, file_size }).ok).toBe(expected);
  });

  // Bot API помечает `file_size` необязательным. Отсутствие метрики — не повод
  // отказывать: размер проверит сам `transcribe`, у которого файл уже в руках.
  it('без метрик — пропускаем, а не отказываем', () => {
    expect(checkVoiceLimits({ file_id: 'abc' }).ok).toBe(true);
  });

  it('длительность важнее размера: короткое, но тяжёлое отбивается по размеру', () => {
    const v = checkVoiceLimits({ duration: 10, file_size: MAX_AUDIO_BYTES + 1 });
    expect(v).toEqual({ ok: false, reason: 'too_big', bytes: MAX_AUDIO_BYTES + 1 });
  });
});

describe('voiceLimitMessage — отказ с числом', () => {
  it('слишком длинное: названы и факт, и порог', () => {
    const msg = voiceLimitMessage({ ok: false, reason: 'too_long', seconds: 240 });
    expect(msg).toContain('240 сек');
    expect(msg).toContain(String(MAX_VOICE_SECONDS));
    expect(msg).toContain('текстом');
  });

  it('слишком большое: мегабайты, а не байты', () => {
    const msg = voiceLimitMessage({ ok: false, reason: 'too_big', bytes: 25_000_000 });
    expect(msg).toContain('25.0 МБ');
  });
});

describe('transcriptToText — транскрипт в строку', () => {
  it('обычная речь проходит как есть', () => {
    expect(transcriptToText({ text: 'Позвонить Иванову завтра.' })).toBe(
      'Позвонить Иванову завтра.',
    );
  });

  // ⚠️ ПУСТОТА ПРОВЕРЯЕТСЯ ПОСЛЕ ФИЛЬТРА ШТАМПОВ. `whisper-large-v3` обучен на
  //    субтитрах и на тишине выдаёт «Продолжение следует…» — формально непустой
  //    текст, который без фильтра уехал бы в ai-capture и стал задачей
  //    «продолжение следует».
  it('чистый штамп → пусто', () => {
    expect(transcriptToText({ text: 'Продолжение следует...' })).toBe('');
  });

  it('несколько штампов подряд → пусто', () => {
    expect(
      transcriptToText({ text: 'Продолжение следует... Субтитры сделал DimaTorzok.' }),
    ).toBe('');
  });

  // Обратная ошибка дороже: выкусив соседние предложения, мы потеряли бы поручение.
  it('штамп посреди живой речи не выкусывает соседние предложения', () => {
    const out = transcriptToText({
      text: 'Позвонить Иванову завтра. Продолжение следует. Подготовить КП для Тандера.',
    });
    expect(out).toContain('Позвонить Иванову завтра.');
    expect(out).toContain('Подготовить КП для Тандера.');
    expect(out).not.toContain('Продолжение следует');
  });

  it('«продолжение следует из договора» — живая речь, не штамп', () => {
    const out = transcriptToText({ text: 'Продолжение следует из договора.' });
    expect(out).toBe('Продолжение следует из договора.');
  });

  it('сегменты с плохими метриками отбраковываются до склейки', () => {
    const out = transcriptToText({
      text: 'нерелевантный общий текст',
      segments: [
        { text: 'Позвонить Иванову.', avg_logprob: -0.2, no_speech_prob: 0.01 },
        { text: 'Продолжение следует.', avg_logprob: -1.5, no_speech_prob: 0.9 },
      ],
    });
    expect(out).toBe('Позвонить Иванову.');
  });

  it('сегментов нет — работаем по общему text, как до S-FIX-VOICE-2', () => {
    expect(transcriptToText({ text: 'Позвонить Иванову.', segments: [] })).toBe(
      'Позвонить Иванову.',
    );
  });

  it.each([[null], [undefined], [{}], [{ text: '' }], [{ text: '   ' }]])(
    'пустой ответ (%s) → пустая строка',
    (reply) => {
      expect(transcriptToText(reply as Parameters<typeof transcriptToText>[0])).toBe('');
    },
  );

  it('мусор вместо сегментов не роняет разбор', () => {
    expect(transcriptToText({ text: 'Позвонить.', segments: 'не массив' })).toBe('Позвонить.');
  });
});

describe('тексты исходов', () => {
  // ⚠️ РАЗНЫЕ СТРОКИ, И РАЗНИЦА НЕ КОСМЕТИЧЕСКАЯ. Первая предлагает повтор, потому
  //    что повтор может помочь; вторая его НЕ предлагает, потому что помочь не может.
  //    Склейка этих исходов уже стоила часа: при исчерпанном балансе провайдера
  //    человек полчаса переформулировал сообщение боту, которому нечем было отвечать.
  it('«ничего не разобрал» ≠ «на нашей стороне»', () => {
    expect(VOICE_MSG.empty).not.toBe(VOICE_MSG.unavailable);
  });

  it('«ничего не разобрал» предлагает повтор', () => {
    expect(VOICE_MSG.empty).toContain('ещё раз');
  });

  it('«на нашей стороне» повтора НЕ предлагает', () => {
    expect(VOICE_MSG.unavailable).not.toContain('ещё раз');
    expect(VOICE_MSG.unavailable).toContain('на нашей стороне');
  });

  it('прогресс уходит до обращения к Groq и до разбора — два разных текста', () => {
    expect(VOICE_MSG.progress).toBe('Расшифровываю…');
    expect(VOICE_MSG.parsing).toBe('Разбираю…');
  });
});
