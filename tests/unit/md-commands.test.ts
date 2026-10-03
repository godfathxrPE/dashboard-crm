import { describe, it, expect } from 'vitest';
import { insertAt, insertBlock, insertLink, toggleLinePrefix, wrapSelection } from '@/lib/text/md-commands';

// S-NOTES-2.2. Команды панели — чистые функции: текст + выделение → текст + выделение.

describe('wrapSelection', () => {
  it('оборачивает выделение и оставляет выделенным само слово', () => {
    expect(wrapSelection('abc', 1, 2, '**')).toEqual({ value: 'a**b**c', start: 3, end: 4 });
  });

  it('без выделения вставляет пару маркеров, курсор посередине', () => {
    expect(wrapSelection('abc', 1, 1, '**')).toEqual({ value: 'a****bc', start: 3, end: 3 });
  });

  it('повторное оборачивание: слово внутри маркеров → разметка снята', () => {
    expect(wrapSelection('a**b**c', 3, 4, '**')).toEqual({ value: 'abc', start: 1, end: 2 });
  });

  it('повторное оборачивание: выделено вместе с маркерами → разметка снята', () => {
    expect(wrapSelection('a**b**c', 1, 6, '**')).toEqual({ value: 'abc', start: 1, end: 2 });
  });

  it('курсор между пустой парой убирает пару', () => {
    expect(wrapSelection('a****b', 3, 3, '**')).toEqual({ value: 'ab', start: 1, end: 1 });
  });

  it('курсив: `*` внутри `**` — не курсив, а жирный; оборачивает ещё раз', () => {
    expect(wrapSelection('**b**', 2, 3, '*').value).toBe('***b***');
  });

  it('курсив снимается так же, как жирный', () => {
    expect(wrapSelection('a*b*c', 2, 3, '*')).toEqual({ value: 'abc', start: 1, end: 2 });
  });

  it('пробелы по краям выделения остаются снаружи маркеров', () => {
    expect(wrapSelection('x слово y', 1, 8, '**')).toEqual({
      value: 'x **слово** y',
      start: 4,
      end: 9,
    });
  });

  it('выделение из одних пробелов — пара маркеров, а не `** **`', () => {
    expect(wrapSelection('a  b', 1, 3, '**').value).toBe('a  ****b');
  });
});

describe('toggleLinePrefix', () => {
  it('три строки получают `- `, повторно — снимает', () => {
    const text = 'а\nб\nв';
    const on = toggleLinePrefix(text, 0, text.length, '- ');
    expect(on.value).toBe('- а\n- б\n- в');
    expect(on.start).toBe(0);
    expect(on.end).toBe(on.value.length);
    const off = toggleLinePrefix(on.value, on.start, on.end, '- ');
    expect(off.value).toBe(text);
  });

  it('нумерованный список нумерует по порядку и снимается', () => {
    const on = toggleLinePrefix('а\nб\nв', 0, 5, '1. ');
    expect(on.value).toBe('1. а\n2. б\n3. в');
    expect(toggleLinePrefix(on.value, 0, on.value.length, '1. ').value).toBe('а\nб\nв');
  });

  it('затрагивает только строки выделения, а не весь текст', () => {
    const text = 'раз\nдва\nтри';
    // выделено «два»
    expect(toggleLinePrefix(text, 4, 7, '- ').value).toBe('раз\n- два\nтри');
  });

  it('курсор без выделения: префикс строке под курсором, курсор сдвигается вместе с текстом', () => {
    expect(toggleLinePrefix('раз\nдва', 5, 5, '- ')).toEqual({ value: 'раз\n- два', start: 7, end: 7 });
  });

  it('смена вида: `- а` → `1. а`, а не `1. - а`', () => {
    expect(toggleLinePrefix('- а\n- б', 0, 7, '1. ').value).toBe('1. а\n2. б');
  });

  it('заголовок `## ` ставится и снимается; чужой уровень заменяется', () => {
    expect(toggleLinePrefix('Итоги', 0, 0, '## ').value).toBe('## Итоги');
    expect(toggleLinePrefix('## Итоги', 0, 0, '## ').value).toBe('Итоги');
    expect(toggleLinePrefix('# Итоги', 0, 0, '## ').value).toBe('Итоги');
  });

  it('пустые строки внутри выделения пропускаются', () => {
    expect(toggleLinePrefix('а\n\nб', 0, 4, '- ').value).toBe('- а\n\n- б');
  });

  it('единственная пустая строка под курсором получает префикс', () => {
    expect(toggleLinePrefix('', 0, 0, '- ')).toEqual({ value: '- ', start: 2, end: 2 });
  });

  it('выделение, дошедшее до начала следующей строки, её не затрагивает', () => {
    expect(toggleLinePrefix('а\nб', 0, 2, '- ').value).toBe('- а\nб');
  });
});

describe('insertLink', () => {
  it('без выделения: `[текст](https://)`, выделено «текст»', () => {
    const r = insertLink('', 0, 0);
    expect(r.value).toBe('[текст](https://)');
    expect(r.value.slice(r.start, r.end)).toBe('текст');
  });

  it('выделенный текст становится подписью; выделен адрес-заглушка', () => {
    const r = insertLink('смотри сайт тут', 7, 11);
    expect(r.value).toBe('смотри [сайт](https://) тут');
    expect(r.value.slice(r.start, r.end)).toBe('https://');
  });

  it('выделенный адрес становится адресом; выделена подпись', () => {
    const r = insertLink('https://x.ru', 0, 12);
    expect(r.value).toBe('[ссылка](https://x.ru)');
    expect(r.value.slice(r.start, r.end)).toBe('ссылка');
  });
});

describe('insertAt', () => {
  it('заменяет выделение и ставит курсор за вставленным', () => {
    expect(insertAt('abc', 1, 2, 'XY')).toEqual({ value: 'aXYc', start: 3, end: 3 });
  });
});

describe('insertBlock', () => {
  it('список в середину строки: перенос до и после, курсор за `- y`', () => {
    const r = insertBlock('abc def', 3, 3, '- x\n- y');
    expect(r.value).toBe('abc\n- x\n- y\n def');
    expect(r.start).toBe(r.end);
    expect(r.value.slice(0, r.start)).toBe('abc\n- x\n- y');
  });

  it('в начале строки перед блоком `\\n` не добавляется', () => {
    expect(insertBlock('\nabc', 0, 0, '- x').value).toBe('- x\nabc');
    expect(insertBlock('a\nbc', 2, 2, '## Итоги').value).toBe('a\n## Итоги\nbc');
  });

  it('блок в конец текста — без хвостового `\\n`', () => {
    expect(insertBlock('abc', 3, 3, '- x')).toEqual({ value: 'abc\n- x', start: 7, end: 7 });
  });

  it('таблица в середину строки: перенос до и после', () => {
    expect(insertBlock('ab', 1, 1, '| x |\n| --- |').value).toBe('a\n| x |\n| --- |\nb');
  });

  it('перед переносом строки хвостовой `\\n` не добавляется', () => {
    expect(insertBlock('abc\ndef', 3, 3, '- x').value).toBe('abc\n- x\ndef');
  });

  it('текст без блока — как insertAt, без переносов', () => {
    expect(insertBlock('abc def', 3, 3, 'просто фраза')).toEqual(insertAt('abc def', 3, 3, 'просто фраза'));
  });

  it('абзац, кончающийся списком: перенос только после', () => {
    expect(insertBlock('abc def', 4, 4, 'Итог:\n\n- x').value).toBe('abc Итог:\n\n- x\ndef');
  });

  it('заменяет выделение', () => {
    expect(insertBlock('aXXb', 1, 3, '- x').value).toBe('a\n- x\nb');
  });
});
