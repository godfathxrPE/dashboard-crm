import { describe, expect, it } from 'vitest';
import {
  GROQ_AUDIO_EXTENSIONS,
  groqAudioFilename,
} from '../../supabase/functions/_shared/transcribe-limits';

// ⚠️ ЗАЧЕМ ЭТОТ ФАЙЛ СУЩЕСТВУЕТ (S-TG-VOICE-1, находка гейта).
//
//    Groq валидирует запрос по РАСШИРЕНИЮ в filename части multipart — не по
//    содержимому и не по MIME. Telegram отдаёт голосовые как `.oga`; это штатное имя
//    для Ogg-audio, но списка Groq оно не проходит.
//
//    Проверено боем: один файл, отправленный как `probe.oga` → 400 от Groq и 502
//    наружу, как `probe.ogg` → 200 с текстом. Байты идентичны.
//
//    Симптом был максимально уводящий: бот показывал «Расшифровка временно
//    недоступна», функция логировала «Groq не смог распознать фрагмент», и всё это
//    читалось как проблема ключа, баланса или модели.

describe('groqAudioFilename — имя, которое Groq примет', () => {
  it.each([
    ['voice.oga', 'voice.ogg'],
    ['probe.oga', 'probe.ogg'],
    ['note.OGA', 'note.ogg'],
    ['clip.opus', 'clip.ogg'],
  ])('«%s» → «%s» — контейнер тот же, имя провайдер знает', (input, expected) => {
    expect(groqAudioFilename(input)).toBe(expected);
  });

  it.each(['chunk.wav', 'call.mp3', 'meeting.m4a', 'audio.ogg', 'rec.webm', 'x.flac'])(
    'имя из списка Groq не трогается: %s',
    (name) => {
      expect(groqAudioFilename(name)).toBe(name);
    },
  );

  // Соврать про формат хуже, чем получить честный отказ провайдера.
  it.each(['tape.aiff', 'voice.amr', 'raw.pcm'])('неизвестное расширение НЕ подменяется: %s', (name) => {
    expect(groqAudioFilename(name)).toBe(name);
  });

  it('имя без расширения остаётся как есть', () => {
    expect(groqAudioFilename('voice')).toBe('voice');
  });

  // Точка первым символом — не расширение, а скрытый файл.
  it('скрытый файл не превращается в расширение', () => {
    expect(groqAudioFilename('.oga')).toBe('.oga');
  });

  it('результат всегда имеет расширение из списка Groq либо исходное', () => {
    for (const name of ['voice.oga', 'clip.opus', 'chunk.wav']) {
      const out = groqAudioFilename(name);
      expect(GROQ_AUDIO_EXTENSIONS.has(out.slice(out.lastIndexOf('.') + 1))).toBe(true);
    }
  });
});
