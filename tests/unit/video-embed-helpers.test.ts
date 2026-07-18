import { describe, test, expect } from 'vitest';
import { parseVideoUrl } from '@/lib/utils/video-embed-helpers';

describe('parseVideoUrl — YouTube', () => {
  const EMBED = 'https://www.youtube.com/embed/dQw4w9WgXcQ';

  test('watch?v=', () => {
    expect(parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      embedUrl: EMBED,
    });
  });

  test('watch с доп. параметрами перед v=', () => {
    expect(parseVideoUrl('https://youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=42')).toEqual({
      provider: 'youtube',
      embedUrl: EMBED,
    });
  });

  test('m.youtube.com (W5)', () => {
    expect(parseVideoUrl('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      embedUrl: EMBED,
    });
  });

  test('youtu.be', () => {
    expect(parseVideoUrl('https://youtu.be/dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      embedUrl: EMBED,
    });
  });

  test('embed-ссылка', () => {
    expect(parseVideoUrl('https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0')).toEqual({
      provider: 'youtube',
      embedUrl: EMBED,
    });
  });

  test('shorts', () => {
    expect(parseVideoUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toEqual({
      provider: 'youtube',
      embedUrl: EMBED,
    });
  });
});

describe('parseVideoUrl — VK', () => {
  test('vk.com video сообщества (отрицательный oid)', () => {
    expect(parseVideoUrl('https://vk.com/video-123_456')).toEqual({
      provider: 'vk',
      embedUrl: 'https://vk.com/video_ext.php?oid=-123&id=456&hd=2',
    });
  });

  test('vkvideo.ru положительный oid', () => {
    expect(parseVideoUrl('https://vkvideo.ru/video789_101112')).toEqual({
      provider: 'vk',
      embedUrl: 'https://vk.com/video_ext.php?oid=789&id=101112&hd=2',
    });
  });
});

describe('parseVideoUrl — Rutube', () => {
  test('video-ссылка', () => {
    expect(parseVideoUrl('https://rutube.ru/video/0aa1bb2cc3dd4ee5ff66778899aabbcc/')).toEqual({
      provider: 'rutube',
      embedUrl: 'https://rutube.ru/play/embed/0aa1bb2cc3dd4ee5ff66778899aabbcc',
    });
  });

  test('уже embed-ссылка', () => {
    expect(parseVideoUrl('https://rutube.ru/play/embed/0aa1bb2cc3dd4ee5ff66778899aabbcc')).toEqual({
      provider: 'rutube',
      embedUrl: 'https://rutube.ru/play/embed/0aa1bb2cc3dd4ee5ff66778899aabbcc',
    });
  });
});

describe('parseVideoUrl — other / инъекции', () => {
  test('Я.Диск → other, без embed', () => {
    expect(parseVideoUrl('https://disk.yandex.ru/i/AbCdEf123')).toEqual({
      provider: 'other',
      embedUrl: null,
    });
  });

  test('Google Drive → other', () => {
    expect(parseVideoUrl('https://drive.google.com/file/d/xyz/view')).toEqual({
      provider: 'other',
      embedUrl: null,
    });
  });

  test('мусор → other', () => {
    expect(parseVideoUrl('не ссылка вообще')).toEqual({ provider: 'other', embedUrl: null });
  });

  test('пустая строка → other', () => {
    expect(parseVideoUrl('')).toEqual({ provider: 'other', embedUrl: null });
  });

  test('инъекция разметки → other, ничего не попадает в embedUrl', () => {
    expect(parseVideoUrl('"><script>alert(1)</script>')).toEqual({
      provider: 'other',
      embedUrl: null,
    });
  });

  test('фейковый домен evil.com с youtube-подстрокой в query НЕ матчится как хост', () => {
    // W7-контур: даже если матч случится по подстроке — embedUrl собран из id,
    // сырой url в iframe не попадает. Здесь — ссылка без валидного видео-id.
    expect(parseVideoUrl('https://evil.com/?u=youtube.com/watch')).toEqual({
      provider: 'other',
      embedUrl: null,
    });
  });

  test('youtube-ссылка без валидного 11-значного id → other', () => {
    expect(parseVideoUrl('https://www.youtube.com/watch?v=short')).toEqual({
      provider: 'other',
      embedUrl: null,
    });
  });
});
