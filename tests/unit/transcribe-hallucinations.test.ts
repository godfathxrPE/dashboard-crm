// S-FIX-VOICE-1: субтитровые штампы Whisper и тихие фрагменты.
//
// Оба модуля чистые: `stripHallucinations`/`buildTail` — над строками, `isSilent` —
// над `Float32Array`. Ни сети, ни Web Audio API для них не нужно.

import { describe, it, expect } from 'vitest';
import {
  stripHallucinations,
  buildTail,
  segmentsToText,
  isLowQualitySegment,
  SEGMENT_THRESHOLDS,
  type WhisperSegment,
} from '@/lib/transcribe/hallucinations';
import {
  isSilent,
  silenceThresholdFor,
  SILENT_CHUNK_MEAN_AMPLITUDE,
  FIRST_CHUNK_SILENCE_MULTIPLIER,
} from '@/lib/transcribe/audio';

describe('stripHallucinations', () => {
  it('одиночный штамп вычищается вместе с многоточием', () => {
    expect(stripHallucinations('Продолжение следует...')).toBe('');
    expect(stripHallucinations('Спасибо за просмотр!')).toBe('');
    expect(stripHallucinations('ПОДПИШИСЬ')).toBe('');
  });

  it('шесть штампов подряд вычищаются все', () => {
    // Ровно то, что пришло с боевого файла 2026-08-07 на первых фрагментах.
    const noise = 'Продолжение следует... '.repeat(6);
    expect(stripHallucinations(noise)).toBe('');
  });

  it('штамп внутри осмысленной фразы НЕ трогается', () => {
    // Живая речь, а не артефакт: у штампа есть продолжение по смыслу.
    const text = 'Продолжение следует из договора, там третий пункт.';
    expect(stripHallucinations(text)).toBe(text);

    // Тот же принцип на другом штампе: канал в мессенджере — нормальная фраза.
    const promo = 'Подписывайтесь на канал в телеграме, там выкладываем инструкции.';
    expect(stripHallucinations(promo)).toBe(promo);
  });

  it('субтитровая подпись вычищается вместе с именем автора', () => {
    // `prefix`-штампы: хвост у них — ник или ФИО редактора, в разговоре их не бывает.
    expect(stripHallucinations('Субтитры сделал DimaTorzok')).toBe('');
    expect(stripHallucinations('Редактор субтитров А.Синецкая Корректор А.Егорова')).toBe('');
  });

  it('осмысленный текст между штампами сохраняется целиком', () => {
    const chunk =
      'Продолжение следует... Мы отгрузили две паллеты в четверг. Спасибо за просмотр!';
    expect(stripHallucinations(chunk)).toBe('Мы отгрузили две паллеты в четверг.');
  });

  it('фрагмент из одних штампов даёт пустую строку — такой в результат не идёт', () => {
    // Пустая строка — сигнал вызывающему коду не добавлять фрагмент в `parts`.
    expect(stripHallucinations('Продолжение следует. Субтитры сделал DimaTorzok.')).toBe('');
  });

  it('вырожденный вход не роняет функцию', () => {
    expect(stripHallucinations('')).toBe('');
    expect(stripHallucinations('   ')).toBe('');
    expect(stripHallucinations('...')).toBe('...');
  });

  it('регистр и «ё» не мешают сверке', () => {
    expect(stripHallucinations('продолжение СЛЕДУЕТ…')).toBe('');
  });
});

describe('buildTail — контекст следующего фрагмента', () => {
  it('хвост собран из ОЧИЩЕННОГО текста: петля самоусиления разорвана', () => {
    // Механизм бага: штамп попадает в `parts` → из `parts` собирается previousTail →
    // хвост уходит в prompt следующего фрагмента → Whisper продолжает начатое.
    const parts = ['Продолжение следует...', 'Обсудили аппликатор и коды маркировки.'];
    const tail = buildTail(parts, 300);

    expect(tail.toLowerCase()).not.toContain('продолжение следует');
    expect(tail).toContain('аппликатор');
  });

  it('хвост обрезан по длине и не падает на пустом списке', () => {
    expect(buildTail([], 300)).toBe('');
    expect(buildTail(['я' + 'а'.repeat(500)], 300)).toHaveLength(300);
  });
});

describe('isSilent — тихий фрагмент не отправляем', () => {
  it('полная тишина отбрасывается', () => {
    expect(isSilent(new Float32Array(16_000))).toBe(true);
    // Пустой фрагмент — тоже нечего распознавать.
    expect(isSilent(new Float32Array(0))).toBe(true);
  });

  it('тихая речь остаётся: порог ниже уровня далёкого микрофона', () => {
    // ~0.005 средней амплитуды — речь издалека; терять её нельзя.
    const distant = new Float32Array(16_000);
    for (let i = 0; i < distant.length; i++) distant[i] = i % 2 === 0 ? 0.005 : -0.005;
    expect(isSilent(distant)).toBe(false);

    // Шум комнаты около −80 dBFS — это уже пауза.
    const roomTone = new Float32Array(16_000).fill(0.0001);
    expect(isSilent(roomTone)).toBe(true);
  });
});

// ─── S-FIX-VOICE-2: признак вместо списка ───
//
// Второй боевой прогон дал штамп, которого в списке не было («Вопросы на сайте
// www.vk.com»). Явление шире перечисления, поэтому ловим структурно: метриками,
// которые Whisper выставляет собственной выдаче, и признаком домена в реплике.

const seg = (text: string, m: Partial<WhisperSegment> = {}): WhisperSegment => ({ text, ...m });

describe('isLowQualitySegment — метрики самой модели', () => {
  it('модель не слышала речи и не уверена в написанном — мусор', () => {
    expect(isLowQualitySegment(seg('Продолжение следует', {
      no_speech_prob: 0.92,
      avg_logprob: -1.4,
    }))).toBe(true);
  });

  it('высокий no_speech_prob при нормальной уверенности — это тихая речь, оставляем', () => {
    // Человек говорит далеко от микрофона: модель сомневается, что там речь, но
    // слова выдала уверенно. Приоритет ошибки — не съесть реплику.
    expect(isLowQualitySegment(seg('Да, мы готовы подписать', {
      no_speech_prob: 0.85,
      avg_logprob: -0.3,
    }))).toBe(false);
  });

  it('низкий avg_logprob сам по себе не приговор — редкая терминология', () => {
    expect(isLowQualitySegment(seg('Аппликатор для термотрансфера', {
      no_speech_prob: 0.05,
      avg_logprob: -1.6,
    }))).toBe(false);
  });

  it('высокий compression_ratio отбрасывается сам по себе — текст повторяет сам себя', () => {
    expect(isLowQualitySegment(seg('Продолжение следует. Продолжение следует. Продолжение следует.', {
      compression_ratio: 3.1,
      no_speech_prob: 0.1,
      avg_logprob: -0.2,
    }))).toBe(true);
  });

  it('сегмент без метрик остаётся, фильтр не падает', () => {
    expect(isLowQualitySegment(seg('Добрый день!'))).toBe(false);
    expect(isLowQualitySegment(seg('Добрый день!', {
      no_speech_prob: null,
      avg_logprob: null,
      compression_ratio: null,
    }))).toBe(false);
  });

  it('значения ровно на пороге не отбрасываются — при сомнении оставляем', () => {
    expect(isLowQualitySegment(seg('на границе', {
      no_speech_prob: SEGMENT_THRESHOLDS.noSpeechProb,
      avg_logprob: SEGMENT_THRESHOLDS.avgLogprob,
      compression_ratio: SEGMENT_THRESHOLDS.compressionRatio,
    }))).toBe(false);
  });
});

describe('segmentsToText', () => {
  it('мусорные сегменты выброшены, живые склеены', () => {
    const text = segmentsToText([
      seg('Вопросы на сайте www.vk.com.', { no_speech_prob: 0.9, avg_logprob: -1.5 }),
      seg('Добрый день!', { no_speech_prob: 0.02, avg_logprob: -0.2 }),
    ], 'запасной текст');
    expect(text).toBe('Добрый день!');
  });

  it('сегментов нет — работаем по общему тексту, как до спринта', () => {
    expect(segmentsToText(undefined, 'Добрый день!')).toBe('Добрый день!');
    expect(segmentsToText([], 'Добрый день!')).toBe('Добрый день!');
    expect(segmentsToText(null, 'Добрый день!')).toBe('Добрый день!');
  });

  it('всё отфильтровано — пустая строка, такой фрагмент в результат не добавляют', () => {
    const text = segmentsToText([
      seg('Продолжение следует', { no_speech_prob: 0.95, avg_logprob: -1.9 }),
    ], 'запасной');
    expect(text).toBe('');
  });
});

describe('домен как признак артефакта', () => {
  it('короткая вставка с www отбрасывается', () => {
    expect(stripHallucinations('Вопросы на сайте www.vk.com. Добрый день!')).toBe('Добрый день!');
  });

  it('короткая вставка с доменом верхнего уровня отбрасывается', () => {
    expect(stripHallucinations('Подробности на sait.ru. Начнём.')).toBe('Начнём.');
  });

  it('живая реплика с упоминанием сайта остаётся', () => {
    const live = 'Отправьте на почту, там на сайте bit.ru всё есть.';
    expect(stripHallucinations(live)).toBe(live);
  });

  it('длинная деловая фраза с доменом не трогается', () => {
    const live = 'Я вам скинул коммерческое предложение, оно лежит на нашем сайте example.com в разделе для партнёров.';
    expect(stripHallucinations(live)).toBe(live);
  });

  it('сокращение с точкой доменом не считается', () => {
    const live = 'Стоимость 1.5 млн.';
    expect(stripHallucinations(live)).toBe(live);
  });
});

describe('порядок пайплайна: метрики → штампы → хвост', () => {
  it('хвост собирается из уже очищенного обоими фильтрами', () => {
    // Как в цикле распознавания: сегменты → фильтр метрик → штампы → parts → buildTail.
    const parts: string[] = [];
    const fragment = segmentsToText([
      seg('Вопросы на сайте www.vk.com.', { no_speech_prob: 0.1, avg_logprob: -0.2 }),
      seg(' Продолжение следует.', { no_speech_prob: 0.1, avg_logprob: -0.2 }),
      seg(' Нужен аппликатор на линию.', { no_speech_prob: 0.02, avg_logprob: -0.1 }),
    ], '');
    const cleaned = stripHallucinations(fragment);
    if (cleaned) parts.push(cleaned);

    const tail = buildTail(parts, 300);
    expect(tail).toBe('Нужен аппликатор на линию.');
    expect(tail.toLowerCase()).not.toContain('vk.com');
    expect(tail.toLowerCase()).not.toContain('продолжение следует');
  });
});

describe('silenceThresholdFor — начало записи строже', () => {
  it('до первого принятого фрагмента порог выше', () => {
    expect(silenceThresholdFor(0)).toBe(SILENT_CHUNK_MEAN_AMPLITUDE * FIRST_CHUNK_SILENCE_MULTIPLIER);
    expect(silenceThresholdFor(0)).toBeGreaterThan(SILENT_CHUNK_MEAN_AMPLITUDE);
  });

  it('после первого принятого — обычный порог', () => {
    expect(silenceThresholdFor(1)).toBe(SILENT_CHUNK_MEAN_AMPLITUDE);
    expect(silenceThresholdFor(42)).toBe(SILENT_CHUNK_MEAN_AMPLITUDE);
  });

  it('оргшум в начале отбрасывается, но та же амплитуда в середине — нет', () => {
    // 0.002 — между обычным порогом (0.001) и строгим (0.004).
    const quiet = new Float32Array(16_000).fill(0.002);
    expect(isSilent(quiet, silenceThresholdFor(0))).toBe(true);
    expect(isSilent(quiet, silenceThresholdFor(1))).toBe(false);
  });
});
