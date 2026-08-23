import { describe, it, expect } from 'vitest';
import { looksLikeSubtitles, stripSubtitleMarkup } from '@/lib/domain/transcript';

// S-TR-VTT-1: вкладка «Файл» принимает .vtt/.srt от Zoom/Teams/Телемоста.
// Главное требование теста — НЕ порча обычного текста: вкладка принимает любой
// текстовый файл, и ложное срабатывание хуже недочищенных субтитров.

const VTT = `WEBVTT - Kind: captions

NOTE recorded by Zoom

1
00:00:12.480 --> 00:00:15.120
<v Наиля>Рассмотрим взаимодействие с бит-консультантом.

2
00:00:15.400 --> 00:00:18.900
Открывается этот же ERP-консультант в Telegram.

3
00:00:22.000 --> 00:00:24.300
А это уже следующая мысль.
`;

const SRT = `1
00:00:01,000 --> 00:00:03,500
Да, да, звонил. Спасибо, что призвонили.

2
00:00:03,900 --> 00:00:07,100
А так мы вчера общались с Глебом.
`;

describe('looksLikeSubtitles', () => {
  it('узнаёт WebVTT по заголовку', () => {
    expect(looksLikeSubtitles(VTT)).toBe(true);
  });

  it('узнаёт SRT по таймкодам без заголовка', () => {
    expect(looksLikeSubtitles(SRT)).toBe(true);
  });

  it('не считает субтитрами обычный текст со стрелкой', () => {
    expect(looksLikeSubtitles('Схема простая: заявка --> проверка --> отгрузка.')).toBe(false);
  });

  it('не считает субтитрами упоминание формата без таймкодов', () => {
    expect(looksLikeSubtitles('Клиент выгружает WEBVTT из Zoom, но пришлёт позже.')).toBe(false);
  });
});

describe('stripSubtitleMarkup', () => {
  it('снимает заголовок, NOTE, номера, таймкоды и инлайн-теги WebVTT', () => {
    const out = stripSubtitleMarkup(VTT);
    expect(out).not.toMatch(/WEBVTT|NOTE|-->|<v /);
    expect(out).not.toMatch(/^\d+$/m);
    expect(out).toContain('Рассмотрим взаимодействие с бит-консультантом.');
  });

  it('склеивает реплики одного блока и рвёт абзац на пустой строке', () => {
    // Реплики 1 и 2 разделены пустой строкой исходника → разные абзацы.
    expect(stripSubtitleMarkup(VTT).split('\n\n')).toHaveLength(3);
  });

  it('чистит SRT', () => {
    expect(stripSubtitleMarkup(SRT)).toBe(
      'Да, да, звонил. Спасибо, что призвонили.\n\nА так мы вчера общались с Глебом.',
    );
  });

  it('обычный текст возвращает БАЙТ В БАЙТ', () => {
    const plain = 'C1: Рассмотрим взаимодействие.\n  Отступ и хвост  \n\n\nТри пустые строки.';
    expect(stripSubtitleMarkup(plain)).toBe(plain);
  });

  it('пустой вход не роняет', () => {
    expect(stripSubtitleMarkup('')).toBe('');
  });

  it('субтитры без единой реплики дают пустую строку, а не мусор', () => {
    const empty = 'WEBVTT\n\n1\n00:00:01,000 --> 00:00:02,000\n';
    expect(stripSubtitleMarkup(empty)).toBe('');
  });
});
