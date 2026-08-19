// supabase/functions/_shared/hallucinations.ts — S-FIX-VOICE-1, переехал в S-TG-VOICE-1.
//
// ⚠️ РЕАЛИЗАЦИЯ ПЕРЕЕХАЛА, А НЕ РАЗДВОИЛАСЬ. Файл лежал в `src/lib/transcribe/`, пока
//    единственным потребителем был браузер. С S-TG-VOICE-1 их два: клиентский пайплайн
//    (`use-transcribe.ts`, через реэкспорт `src/lib/transcribe/hallucinations.ts`) и
//    Deno-функция `telegram-webhook` (голосовое из мессенджера). Зеркало по образцу
//    `glossary.ts` было альтернативой и отвергнуто: расхождение копий стоило проекту
//    времени уже дважды, а фильтр штампов — ровно то место, где расхождение НЕ ИМЕЕТ
//    СИМПТОМА (несработавший фильтр отдаёт «Продолжение следует» как живой текст).
//    Импортный путь: Deno — с расширением `.ts`, tsc — без него.
//
// ⚠️ Модуль обязан оставаться БЕЗ ИМПОРТОВ и без `Deno`/`window`: его читают оба
//    рантайма.
//
// S-FIX-VOICE-1: чистка субтитровых штампов Whisper.
//
// `whisper-large-v3` обучен на субтитрах и на тишине выдаёт субтитровые клише —
// на боевом файле 2026-08-07 первые фрагменты дали «Продолжение следует…» шесть раз
// подряд. Само по себе это мусор в тексте; хуже механизм самоусиления: мусор попадает
// в `parts`, из `parts` собирается `previousTail`, тот уходит в prompt следующего
// фрагмента — и Whisper охотно продолжает начатое. Поэтому чистка обязана идти ДО
// сборки хвоста, а не при показе текста.
//
// Модуль чистый: ни сети, ни Web Audio, ни React.

/**
 * Как штамп сверяется с текстом:
 *  • `exact`  — артефакт, только если он занимает предложение ЦЕЛИКОМ. Иначе выкусили
 *    бы живую речь: «продолжение следует из договора», «подписывайтесь на канал
 *    в телеграме» — нормальные фразы делового разговора.
 *  • `prefix` — субтитровая подпись, за которой идёт имя автора («Субтитры сделал
 *    DimaTorzok», «Редактор субтитров А.Синецкая Корректор А.Егорова»). Такое начало
 *    предложения в деловом разговоре не встречается вовсе, поэтому хвост не важен.
 *
 * S-FIX-VOICE-2 добавил третий режим сверки — `domain` (см. `isDomainArtifact`). Он
 * не в этом списке, потому что сверяется не со строкой, а с правилом: перечислить
 * все домены, которые Whisper может дописать, нельзя по построению.
 */
type StampMode = 'exact' | 'prefix';

const STAMPS: ReadonlyArray<{ text: string; mode: StampMode }> = [
  { text: 'продолжение следует', mode: 'exact' },
  { text: 'субтитры сделал', mode: 'prefix' },
  { text: 'субтитры создавал', mode: 'prefix' },
  { text: 'редактор субтитров', mode: 'prefix' },
  { text: 'спасибо за просмотр', mode: 'exact' },
  { text: 'подписывайтесь на канал', mode: 'exact' },
  { text: 'подпишись', mode: 'exact' },
];

/** Обрамляющая пунктуация и кавычки — многоточие штампа сюда же. */
const EDGE_PUNCT = /^[\s.,!?…:;"'«»()\-—–]+|[\s.,!?…:;"'«»()\-—–]+$/g;

/** Сравниваем регистронезависимо, без обрамляющей пунктуации, «ё» = «е». */
function normalize(segment: string): string {
  return segment
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(EDGE_PUNCT, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Домен внутри предложения (`www.` или TLD) — третий режим сверки, S-FIX-VOICE-2.
 *
 * В телефонном разговоре человек не диктует голосом «www.vk.com»: на боевом прогоне
 * 2026-08-08 Whisper дописал «Вопросы на сайте www.vk.com» в начало часовой записи.
 * Признак структурный — списком доменов его не поймать.
 *
 * ⚠️ Ограничение по длине обязательно, иначе фильтр съедает живую речь: «отправьте
 * на почту, там на сайте bit.ru всё есть» — нормальная реплика делового разговора.
 * Артефакт — это отдельная короткая фраза-вставка, а не упоминание сайта внутри речи.
 */
const DOMAIN_RE = /\bwww\.[a-zа-я0-9-]|[a-zа-я0-9-]{2,}\.(ru|com|рф|net|org)\b/i;

/**
 * Порог длины «фраза-вставка, а не речь».
 *
 * Спринт называл ориентир ~80 символов, но его же контрпример («отправьте на почту,
 * там на сайте bit.ru всё есть» — 46 символов) при 80 отбрасывался бы вместе с
 * артефактом. Взято 40: известный артефакт — 28 символов, контрпример остаётся жив.
 * Приоритет ошибки тот же, что у порога тишины: **лучше пропустить мусор, чем съесть
 * реплику**. Уточняется по боевым файлам.
 */
const DOMAIN_ARTIFACT_MAX_CHARS = 40;

function isDomainArtifact(segment: string): boolean {
  const norm = normalize(segment);
  if (!norm || norm.length > DOMAIN_ARTIFACT_MAX_CHARS) return false;
  return DOMAIN_RE.test(norm);
}

function isHallucination(segment: string): boolean {
  const norm = normalize(segment);
  if (!norm) return false;
  if (isDomainArtifact(segment)) return true;
  return STAMPS.some(({ text, mode }) =>
    mode === 'exact' ? norm === text : norm === text || norm.startsWith(`${text} `),
  );
}

/**
 * Режем на предложения, СОХРАНЯЯ разделители: склейка оставшихся кусков должна быть
 * побайтово тем же текстом, из которого просто вынули штампы. Поэтому split с
 * захватывающей группой, а не по границе с потерей пунктуации.
 *
 * Точка считается концом предложения, только если за ней пробел или конец строки.
 * Иначе инициалы разрывают подпись: «Редактор субтитров А.Синецкая Корректор
 * А.Егорова» распадалось на «Редактор субтитров А.» (штамп, выкусывался) и
 * «Синецкая Корректор А.Егорова» — мусор оставался в тексте. Поймано тестом.
 * Смотрим вперёд, а не назад: lookbehind не поддерживает Safari до 16.4, а в
 * мобильном сценарии спринта это половина случаев.
 */
function toSegments(text: string): string[] {
  const parts = text.split(/([.!?…]+(?=\s|$))/);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const segment = (parts[i] ?? '') + (parts[i + 1] ?? '');
    if (segment) out.push(segment);
  }
  return out;
}

/**
 * Убирает субтитровые штампы. Пустая строка на выходе означает «фрагмент состоял из
 * одного мусора» — такой фрагмент не добавляют в результат вовсе.
 */
export function stripHallucinations(text: string): string {
  if (!text.trim()) return '';
  return toSegments(text)
    .filter((segment) => !isHallucination(segment))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Хвост уже распознанного текста для prompt следующего фрагмента.
 *
 * Чистка здесь — НЕ дубль защиты, а её суть: петля самоусиления замыкается именно
 * через хвост, и порядок вызовов в цикле («сначала почисти, потом собери») — правило,
 * которое легко нарушить правкой рядом. Пропустив всё через `stripHallucinations` тут,
 * мы делаем нарушение невозможным, а не маловероятным. Двойная чистка ничего не стоит.
 */
export function buildTail(parts: readonly string[], maxChars: number): string {
  return stripHallucinations(parts.join(' ')).slice(-maxChars);
}

/** Список штампов — для тестов и отладки; править только через `STAMPS`. */
export const HALLUCINATION_STAMPS = STAMPS.map((s) => s.text);

// ─── S-FIX-VOICE-2: фильтр по метрикам сегментов ───

/**
 * Сегмент ответа Whisper в `verbose_json`. Метрики необязательны: провайдер может
 * их не прислать, и это НЕ повод считать сегмент мусором.
 */
export type WhisperSegment = {
  text: string;
  avg_logprob?: number | null;
  compression_ratio?: number | null;
  no_speech_prob?: number | null;
};

/**
 * Пороги отбраковки сегмента.
 *
 * Взяты из эвристик `whisper.cpp` / `faster-whisper` (там те же метрики используются
 * для отсечения «плохих» сегментов) и **уточняются по боевым файлам** — это не
 * окончательные числа, а стартовая точка.
 *
 * `noSpeech` и `avgLogprob` работают ТОЛЬКО В ПАРЕ: по отдельности каждый даёт ложные
 * срабатывания на тихой речи (человек говорит далеко от микрофона — no_speech_prob
 * высокий, но речь настоящая; редкая терминология — avg_logprob низкий, но слова
 * верные). Вместе — «модель и не слышала речи, и не уверена в том, что написала».
 */
export const SEGMENT_THRESHOLDS = {
  /** Модель сама оценивает, что речи в сегменте нет. */
  noSpeechProb: 0.6,
  /** Средняя уверенность в выданных токенах. */
  avgLogprob: -1.0,
  /** Повторяемость текста: «Продолжение следует» ×6 даёт именно это. */
  compressionRatio: 2.4,
} as const;

/**
 * Сегмент — машинный мусор по собственным метрикам модели?
 *
 * ⚠️ Приоритет ошибки — как у порога тишины: **лучше пропустить мусор, чем съесть
 * реплику**. При сомнении (метрики не пришли, значения на границе) сегмент остаётся.
 */
export function isLowQualitySegment(segment: WhisperSegment): boolean {
  const { avg_logprob, compression_ratio, no_speech_prob } = segment;

  const noSpeech = typeof no_speech_prob === 'number' ? no_speech_prob : null;
  const logprob = typeof avg_logprob === 'number' ? avg_logprob : null;
  if (
    noSpeech !== null && logprob !== null &&
    noSpeech > SEGMENT_THRESHOLDS.noSpeechProb &&
    logprob < SEGMENT_THRESHOLDS.avgLogprob
  ) {
    return true;
  }

  const ratio = typeof compression_ratio === 'number' ? compression_ratio : null;
  return ratio !== null && ratio > SEGMENT_THRESHOLDS.compressionRatio;
}

/**
 * Текст фрагмента из сегментов: метрики → отбраковка → склейка.
 *
 * Возвращает то, что дальше уйдёт в `stripHallucinations` (вторая линия — список
 * известных штампов) и только потом в `buildTail`. Порядок обязателен: хвост
 * собирается из УЖЕ очищенного, иначе петля самоусиления замыкается через prompt.
 *
 * Сегментов нет (старый ответ функции, провайдер их не прислал) — работаем по
 * общему `text`, как до S-FIX-VOICE-2: фильтр не должен отнимать то, что уже было.
 */
export function segmentsToText(
  segments: readonly WhisperSegment[] | null | undefined,
  fallbackText: string,
): string {
  if (!Array.isArray(segments) || segments.length === 0) return fallbackText;
  return segments
    .filter((s) => !isLowQualitySegment(s))
    .map((s) => s.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
