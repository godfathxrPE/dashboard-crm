// S-R3-VOICE-1. Перенесено из ~/Documents/Projects/trans-app/lib/audio.ts.
// Логика нарезки не менялась; изменены только пороги размера и добавлен
// `probeDuration` (нужен UI для оценки стоимости до запуска).
// S-FIX-VOICE-1: порог прямой отправки разведён с потолком запроса, тихие
// фрагменты не отправляются вовсе.
//
// Клиентская подготовка аудио: декодирование, ресемплинг в 16kHz mono,
// нарезка на WAV-чанки. Whisper внутри всё равно работает на 16kHz — качество
// не теряем. Аудио НИКУДА не сохраняется: чанк уходит в edge и забывается.
//
// Ключевой момент: режем не по таймеру, а по ближайшей паузе. Разрыв
// посреди фразы Whisper переваривает плохо — теряет и слово, и контекст
// для следующего чанка.

const TARGET_RATE = 16_000;
const CHUNK_SECONDS = 120; // 120s * 32KB/s ≈ 3.84MB WAV — длина выбрана под контекст Whisper, не под транспорт
const SEARCH_SECONDS = 15; // окно поиска паузы перед номинальной границей
const SILENCE_WINDOW_MS = 300;

/**
 * Потолок тела одного запроса к edge-функции `transcribe`.
 *
 * В `trans-app` тут было 4.5 МБ — это ЛИМИТ VERCEL на тело serverless-запроса,
 * а не лимит Groq: Groq принимает файл до 25 МБ. У Supabase Edge вериселевского
 * ограничения нет, поэтому берём 20 МБ — запас до 25 МБ Groq на служебные поля
 * multipart.
 *
 * Зеркалится в `supabase/functions/transcribe/index.ts` (MAX_CHUNK_BYTES):
 * клиент не шлёт больше, функция не принимает больше. Порог прямой отправки —
 * НЕ это число, см. `DIRECT_UPLOAD_LIMIT` ниже.
 */
export const MAX_CHUNK_BYTES = 20_000_000;

/**
 * Файл меньше порога уходит в Groq как есть, без декодирования и перекодирования —
 * Groq сам понимает mp3/m4a/webm/ogg/wav.
 *
 * S-FIX-VOICE-1 (долг гейта F-01): 8 МБ, а не `MAX_CHUNK_BYTES`. Одна константа на два
 * разных смысла склеивала несклеиваемое: потолок ОДНОГО запроса — про транспорт, а
 * порог прямой отправки — про качество. Файл, ушедший целиком, идёт без нарезки, а
 * значит и без `previousTail` между фрагментами: контекст, который держит термины и
 * имена, теряется. 8 МБ — это примерно 8–15 минут сжатого аудио; разговор длиннее
 * режется и получает сквозной контекст.
 *
 * На размер самих фрагментов `MAX_CHUNK_BYTES` не влияет: WAV-фрагмент на 120 секунд
 * весит около 3.8 МБ независимо от исходного формата, и потолок работает страховкой.
 */
export const DIRECT_UPLOAD_LIMIT = 8_000_000;

/**
 * Порог «фрагмент — это пауза»: средняя амплитуда (|сэмпл| в среднем) ниже него.
 * Такой фрагмент не отправляем вовсе — распознавать в нём нечего, а Groq именно на
 * тишине и выдаёт субтитровые штампы (см. `hallucinations.ts`).
 *
 * 0.001 ≈ −60 dBFS. Число подобрано эмпирически и уточняется по боевым файлам;
 * выбрано СОЗНАТЕЛЬНО низким: речь издалека от микрофона даёт примерно 0.005, и
 * потерять реплику дороже, чем отправить лишнюю паузу. При сомнении — не отбрасывать.
 */
const SILENT_CHUNK_MEAN_AMPLITUDE = 0.001;

export type PrepareProgress =
  | { stage: 'decoding' }
  | { stage: 'resampling' }
  | { stage: 'chunking'; done: number; total: number };

export type AudioChunk = { blob: Blob; filename: string };

export async function prepareChunks(
  file: Blob,
  onProgress: (p: PrepareProgress) => void,
): Promise<AudioChunk[]> {
  // Маленький файл — Groq принимает mp3/m4a/webm/ogg/wav напрямую
  if (file.size <= DIRECT_UPLOAD_LIMIT) {
    const name = file instanceof File ? file.name : 'recording.webm';
    return [{ blob: file, filename: name }];
  }

  onProgress({ stage: 'decoding' });
  const arrayBuffer = await file.arrayBuffer();

  const AC: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const decodeCtx = new AC();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuffer);
  } catch {
    throw new Error('Не удалось декодировать аудио. Формат не поддерживается браузером.');
  } finally {
    void decodeCtx.close();
  }

  onProgress({ stage: 'resampling' });
  const length = Math.ceil(decoded.duration * TARGET_RATE);
  const offline = new OfflineAudioContext(1, length, TARGET_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  const samples = rendered.getChannelData(0);

  const bounds = findChunkBounds(samples);
  const chunks: AudioChunk[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    onProgress({ stage: 'chunking', done: i, total: bounds.length - 1 });
    const slice = samples.subarray(bounds[i], bounds[i + 1]);
    // Тишину не отправляем: распознавать нечего, а Groq на ней галлюцинирует.
    // Считаем здесь же — данные уже под рукой, второй проход по массиву не нужен.
    if (isSilent(slice)) continue;
    chunks.push({
      // Нумеруем ОТПРАВЛЯЕМЫЕ фрагменты, а не нарезанные: иначе прогресс «фрагмент N
      // из M» и имена файлов разошлись бы на каждой выброшенной паузе.
      blob: encodeWav(slice, TARGET_RATE),
      filename: `chunk-${chunks.length + 1}.wav`,
    });
  }
  return chunks;
}

/**
 * Средняя амплитуда фрагмента ниже порога — это пауза, а не тихая речь.
 *
 * Считаем по каждому четвёртому сэмплу, как и поиск паузы в `findChunkBounds`: для
 * оценки уровня прореживания достаточно, а полный проход по часовому сигналу — нет.
 */
export function isSilent(samples: Float32Array, threshold = SILENT_CHUNK_MEAN_AMPLITUDE): boolean {
  if (samples.length === 0) return true;
  let sum = 0;
  let counted = 0;
  for (let i = 0; i < samples.length; i += 4) {
    sum += Math.abs(samples[i]);
    counted++;
  }
  return sum / counted < threshold;
}

/**
 * Параметры нарезки. Вынесены из модульных констант в аргумент, чтобы тест
 * задавал маленький номинал (и не собирал часовой `Float32Array` ради проверки
 * поиска паузы). Значения по умолчанию — боевые.
 */
export type ChunkBoundsOptions = {
  sampleRate?: number;
  chunkSeconds?: number;
  searchSeconds?: number;
  silenceWindowMs?: number;
};

/**
 * Границы чанков: от номинальной точки (120s) отступаем назад в поисках
 * самого тихого окна в 300мс. Так рез приходится на паузу между фразами,
 * а не на середину слова.
 *
 * Возвращает возрастающий список позиций, включая 0 и `samples.length`:
 * i-й чанк — `samples.subarray(bounds[i], bounds[i + 1])`, вместе они
 * покрывают сигнал целиком и без пересечений.
 */
export function findChunkBounds(samples: Float32Array, opts: ChunkBoundsOptions = {}): number[] {
  const rate = opts.sampleRate ?? TARGET_RATE;
  const nominal = (opts.chunkSeconds ?? CHUNK_SECONDS) * rate;
  const searchSpan = (opts.searchSeconds ?? SEARCH_SECONDS) * rate;
  const windowSize = Math.round(((opts.silenceWindowMs ?? SILENCE_WINDOW_MS) / 1000) * rate);
  const step = Math.max(1, Math.round(windowSize / 4));

  const bounds = [0];
  let cursor = 0;

  while (samples.length - cursor > nominal) {
    const target = cursor + nominal;
    const from = Math.max(cursor + windowSize, target - searchSpan);

    let bestPos = target;
    let bestEnergy = Infinity;
    for (let pos = from; pos + windowSize <= target; pos += step) {
      let energy = 0;
      // Сумма модулей вместо RMS — дешевле, для поиска минимума достаточно
      for (let i = pos; i < pos + windowSize; i += 4) {
        energy += Math.abs(samples[i]);
      }
      if (energy < bestEnergy) {
        bestEnergy = energy;
        bestPos = pos + Math.floor(windowSize / 2);
      }
    }

    bounds.push(bestPos);
    cursor = bestPos;
  }

  bounds.push(samples.length);
  return bounds;
}

/**
 * Длительность в секундах без полного декодирования — через `<audio>` и метаданные.
 * Нужна ДО запуска пайплайна: по ней считается оценка стоимости.
 *
 * `null` — честный ответ «неизвестно»: MediaRecorder в webm часто пишет
 * `duration: Infinity`, и подставлять вместо этого ноль значило бы показать
 * «≈ 0 ₽» на часовой записи.
 */
export function probeDuration(blob: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const el = document.createElement('audio');
    const done = (value: number | null) => {
      el.removeAttribute('src');
      URL.revokeObjectURL(url);
      resolve(value);
    };
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      done(Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null);
    };
    el.onerror = () => done(null);
    el.src = url;
  });
}

// PCM 16-bit mono WAV
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // размер fmt-блока
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // бит на сэмпл
  writeString(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
