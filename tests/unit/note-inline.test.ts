import { describe, it, expect } from 'vitest';
import { parseInline, stripInline } from '@/lib/text/note-inline';

// S-NOTES-2.2. Инлайн-разметка заметки → узлы. Отказы (непарный маркер, пробел внутри,
// небезопасная схема) зафиксированы так же строго, как успехи: они защищают старые
// заметки и ссылки от `javascript:`.

describe('parseInline', () => {
  it('`**a** и *b*` → strong, text, em', () => {
    expect(parseInline('**a** и *b*')).toEqual([
      { t: 'strong', v: 'a' },
      { t: 'text', v: ' и ' },
      { t: 'em', v: 'b' },
    ]);
  });

  it('`_a_` → курсив', () => {
    expect(parseInline('_a_')).toEqual([{ t: 'em', v: 'a' }]);
  });

  it('непарная звёздочка — обычный текст', () => {
    expect(parseInline('5 * 3 и *хвост')).toEqual([{ t: 'text', v: '5 * 3 и *хвост' }]);
    expect(parseInline('**без пары')).toEqual([{ t: 'text', v: '**без пары' }]);
  });

  it('пробел внутри маркера — не разметка: `* 3 = 15 *`, `** a **`', () => {
    expect(parseInline('* 3 = 15 *')).toEqual([{ t: 'text', v: '* 3 = 15 *' }]);
    expect(parseInline('** a **')).toEqual([{ t: 'text', v: '** a **' }]);
  });

  it('подчёркивание внутри слова — не курсив: snake_case_name, ИНН_123_ок', () => {
    expect(parseInline('snake_case_name')).toEqual([{ t: 'text', v: 'snake_case_name' }]);
    expect(parseInline('ИНН_123_ок')).toEqual([{ t: 'text', v: 'ИНН_123_ок' }]);
  });

  it('`[сайт](https://x.ru)` → ссылка', () => {
    expect(parseInline('[сайт](https://x.ru)')).toEqual([
      { t: 'link', v: 'сайт', href: 'https://x.ru' },
    ]);
  });

  it('mailto: и http: разрешены', () => {
    expect(parseInline('[я](mailto:a@b.ru) [x](http://x.ru)')).toEqual([
      { t: 'link', v: 'я', href: 'mailto:a@b.ru' },
      { t: 'text', v: ' ' },
      { t: 'link', v: 'x', href: 'http://x.ru' },
    ]);
  });

  it('`[x](javascript:alert(1))` → текст, ссылки нет', () => {
    const nodes = parseInline('[x](javascript:alert(1))');
    expect(nodes.every((n) => n.t === 'text')).toBe(true);
    expect(nodes.map((n) => n.v).join('')).toBe('[x](javascript:alert(1))');
  });

  it.each(['data:text/html,<b>', 'vbscript:x', 'JAVASCRIPT:x', '//evil.ru', '/relative'])(
    'схема %s ссылкой не становится',
    (href) => {
      expect(parseInline(`[x](${href})`).some((n) => n.t === 'link')).toBe(false);
    },
  );

  it('разметка внутри жирного не разбирается (один уровень)', () => {
    expect(parseInline('**a *b* c**')).toEqual([{ t: 'strong', v: 'a *b* c' }]);
  });

  it('текст без разметки — один text-узел; пустой вход → []', () => {
    expect(parseInline('просто текст\nс переносом')).toEqual([
      { t: 'text', v: 'просто текст\nс переносом' },
    ]);
    expect(parseInline('')).toEqual([]);
  });

  it('20 000 открывающих скобок разбираются быстро', () => {
    const t0 = performance.now();
    parseInline('['.repeat(20000));
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

describe('stripInline', () => {
  it('снимает разметку, оставляя подпись ссылки', () => {
    expect(stripInline('**Итог:** [КП](https://x) и *всё*')).toBe('Итог: КП и всё');
  });
});
