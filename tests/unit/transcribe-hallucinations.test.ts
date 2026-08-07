// S-FIX-VOICE-1: субтитровые штампы Whisper и тихие фрагменты.
//
// Оба модуля чистые: `stripHallucinations`/`buildTail` — над строками, `isSilent` —
// над `Float32Array`. Ни сети, ни Web Audio API для них не нужно.

import { describe, it, expect } from 'vitest';
import { stripHallucinations, buildTail } from '@/lib/transcribe/hallucinations';
import { isSilent } from '@/lib/transcribe/audio';

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
