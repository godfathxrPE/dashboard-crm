import { describe, it, expect } from 'vitest';
import { parseNoteBlocks, splitNoteHead, noteToPlainLine, noteHeadline, hasMarkdown } from '@/lib/text/note-blocks';

// S-DEAL-NOTES-READ-1. Заметки хранятся плоским текстом; структуру восстанавливает
// эта функция. Чистая, без React — тесты фиксируют правила, в том числе НАМЕРЕННЫЕ
// отказы (нет эвристики « - » → список).

const ANFISH = [
  '02.10.2026 · Zoom · ООО «АНФИШ» (ИНН 5056005909)',
  'Участники: Олег, Сергей.',
  '',
  'Ситуация',
  '- Считают вручную',
  '- В ЧЗ нет интеграции',
  '',
  'Решение (предварительно)',
  '– Подключить 1С',
  '– Завести шаблон',
  '– Обучить кладовщиков',
].join('\n');

describe('parseNoteBlocks', () => {
  it('«АНФИШ»: дата·Zoom — абзац, «Ситуация» — заголовок, пункты — один список без маркеров', () => {
    const blocks = parseNoteBlocks(ANFISH);
    expect(blocks).toEqual([
      {
        type: 'paragraph',
        text: '02.10.2026 · Zoom · ООО «АНФИШ» (ИНН 5056005909)\nУчастники: Олег, Сергей.',
      },
      { type: 'heading', level: 3, text: 'Ситуация' },
      { type: 'list', items: ['Считают вручную', 'В ЧЗ нет интеграции'] },
      { type: 'heading', level: 3, text: 'Решение (предварительно)' },
      { type: 'list', items: ['Подключить 1С', 'Завести шаблон', 'Обучить кладовщиков'] },
    ]);
  });

  it('\\r\\n и \\r дают то же, что \\n', () => {
    expect(parseNoteBlocks(ANFISH.replace(/\n/g, '\r\n'))).toEqual(parseNoteBlocks(ANFISH));
    expect(parseNoteBlocks(ANFISH.replace(/\n/g, '\r'))).toEqual(parseNoteBlocks(ANFISH));
  });

  it('«Участники: Олег, Сергей.» перед списком — абзац (кончается точкой)', () => {
    expect(parseNoteBlocks('Участники: Олег, Сергей.\n- пункт')).toEqual([
      { type: 'paragraph', text: 'Участники: Олег, Сергей.' },
      { type: 'list', items: ['пункт'] },
    ]);
  });

  it('«Итоги:» перед списком — заголовок, двоеточие сохраняется', () => {
    expect(parseNoteBlocks('Итоги:\n- первое\n- второе')).toEqual([
      { type: 'heading', level: 3, text: 'Итоги:' },
      { type: 'list', items: ['первое', 'второе'] },
    ]);
  });

  it('заголовок находится через пустую строку до списка', () => {
    expect(parseNoteBlocks('Итоги\n\n- первое')[0]).toEqual({ type: 'heading', level: 3, text: 'Итоги' });
  });

  it('строка длиной 49 без пунктуации перед списком — абзац', () => {
    const long = 'а'.repeat(49);
    expect(parseNoteBlocks(`${long}\n- пункт`)[0]).toEqual({ type: 'paragraph', text: long });
    const ok = 'а'.repeat(48);
    expect(parseNoteBlocks(`${ok}\n- пункт`)[0]).toEqual({ type: 'heading', level: 3, text: ok });
  });

  it('строка без маркера сразу после пункта склеивается с пунктом', () => {
    expect(parseNoteBlocks('- первый пункт\nего продолжение\n- второй')).toEqual([
      { type: 'list', items: ['первый пункт его продолжение', 'второй'] },
    ]);
  });

  it.each([
    ['•', '• пункт'],
    ['–', '– пункт'],
    ['—', '— пункт'],
    ['*', '* пункт'],
    ['-', '- пункт'],
  ])('маркер %s — пункт списка', (_m, line) => {
    expect(parseNoteBlocks(line)).toEqual([{ type: 'list', items: ['пункт'] }]);
  });

  it.each([
    ['1.', '1. пункт'],
    ['1)', '1) пункт'],
  ])('маркер %s — пункт нумерованного списка', (_m, line) => {
    expect(parseNoteBlocks(line)).toEqual([{ type: 'olist', items: ['пункт'] }]);
  });

  it('маркер без пробела — не пункт: «1.5 млн», «-5 градусов», «*важно*»', () => {
    for (const s of ['1.5 млн', '-5 градусов', '*важно*']) {
      expect(parseNoteBlocks(s)).toEqual([{ type: 'paragraph', text: s }]);
    }
  });

  it('пустой и пробельный вход → []', () => {
    expect(parseNoteBlocks('')).toEqual([]);
    expect(parseNoteBlocks('  \n\t\n  ')).toEqual([]);
  });

  it('сплющенный текст «Ситуация - Считают … - В ЧЗ …» — один абзац (эвристики « - » нет намеренно)', () => {
    const flat = 'Ситуация - Считают вручную - В ЧЗ нет интеграции - Решение - подключить 1С';
    expect(parseNoteBlocks(flat)).toEqual([{ type: 'paragraph', text: flat }]);
  });

  it('переносы внутри абзаца сохраняются как \\n', () => {
    expect(parseNoteBlocks('раз\nдва\n\nтри')).toEqual([
      { type: 'paragraph', text: 'раз\nдва' },
      { type: 'paragraph', text: 'три' },
    ]);
  });
});

describe('parseNoteBlocks · markdown (S-NOTES-2.2)', () => {
  it('`## Итоги` — заголовок уровня 2', () => {
    expect(parseNoteBlocks('## Итоги')).toEqual([{ type: 'heading', level: 2, text: 'Итоги' }]);
  });

  it.each([
    ['# a', 1],
    ['## a', 2],
    ['### a', 3],
  ])('«%s» — уровень %i', (line, level) => {
    expect(parseNoteBlocks(line)).toEqual([{ type: 'heading', level, text: 'a' }]);
  });

  it('четыре решётки, «#хэштег» и «#» без текста — обычный текст', () => {
    for (const s of ['#### a', '#хэштег', '#']) {
      expect(parseNoteBlocks(s)).toEqual([{ type: 'paragraph', text: s }]);
    }
  });

  it('заголовок разрывает абзац и список без пустой строки', () => {
    expect(parseNoteBlocks('текст\n## Итоги\n- а\n## Дальше\nещё')).toEqual([
      { type: 'paragraph', text: 'текст' },
      { type: 'heading', level: 2, text: 'Итоги' },
      { type: 'list', items: ['а'] },
      { type: 'heading', level: 2, text: 'Дальше' },
      { type: 'paragraph', text: 'ещё' },
    ]);
  });

  it('`1. a` и `2. b` — один нумерованный список', () => {
    expect(parseNoteBlocks('1. a\n2. b')).toEqual([{ type: 'olist', items: ['a', 'b'] }]);
  });

  it('нумерованный сразу после маркированного — отдельный список', () => {
    expect(parseNoteBlocks('- a\n1. b')).toEqual([
      { type: 'list', items: ['a'] },
      { type: 'olist', items: ['b'] },
    ]);
  });

  it('инлайн-разметка остаётся в тексте блока как есть', () => {
    expect(parseNoteBlocks('**Итог:** см. [КП](https://x.ru)')).toEqual([
      { type: 'paragraph', text: '**Итог:** см. [КП](https://x.ru)' },
    ]);
  });
});

describe('parseNoteBlocks · эвристика заголовка и markdown (гейт 2.2)', () => {
  it('`Клиент **согласен**` перед списком — абзац, а не заголовок', () => {
    expect(parseNoteBlocks('Клиент **согласен**\n- пункт')).toEqual([
      { type: 'paragraph', text: 'Клиент **согласен**' },
      { type: 'list', items: ['пункт'] },
    ]);
  });

  it('есть `#` — эвристика выключена: короткая строка перед списком — абзац', () => {
    expect(parseNoteBlocks('## Итоги\nКороткая строка\n- пункт')).toEqual([
      { type: 'heading', level: 2, text: 'Итоги' },
      { type: 'paragraph', text: 'Короткая строка' },
      { type: 'list', items: ['пункт'] },
    ]);
  });

  it('ссылка где угодно в заметке выключает эвристику', () => {
    expect(parseNoteBlocks('Ситуация\n- пункт\n\nсм. [КП](https://x.ru)')[0]).toEqual({
      type: 'paragraph',
      text: 'Ситуация',
    });
  });

  it('строка с курсивом заголовком не становится, остальная эвристика работает', () => {
    expect(parseNoteBlocks('Итоги *вчерне*\n- пункт')[0]).toEqual({ type: 'paragraph', text: 'Итоги *вчерне*' });
    expect(parseNoteBlocks('Итоги *вчерне*\n- пункт\n\nСитуация\n- ещё')[2]).toEqual({
      type: 'heading',
      level: 3,
      text: 'Ситуация',
    });
  });

  it('плоский текст без разметки: `Ситуация\n- пункт` → заголовок уровня 3 (регрессия)', () => {
    expect(parseNoteBlocks('Ситуация\n- пункт')).toEqual([
      { type: 'heading', level: 3, text: 'Ситуация' },
      { type: 'list', items: ['пункт'] },
    ]);
  });
});

describe('hasMarkdown', () => {
  it.each([
    ['# Итоги', true],
    ['текст\n### x', true],
    ['**жирный**', true],
    ['[сайт](https://x.ru)', true],
    ['[почта](mailto:a@b.ru)', true],
    ['*курсив* не в счёт', false],
    ['#хэштег', false],
    ['**\n\n**', false],
    ['[x](javascript:alert(1))', false],
    ['Ситуация\n- пункт', false],
  ])('%j → %s', (raw, want) => {
    expect(hasMarkdown(raw)).toBe(want);
  });
});

describe('splitNoteHead', () => {
  it('ведущие пустые строки пропускаются', () => {
    expect(splitNoteHead('\n\n  Заголовок  \nтело\nещё')).toEqual({
      head: 'Заголовок',
      rest: 'тело\nещё',
    });
  });

  it('однострочный текст → rest пустой', () => {
    expect(splitNoteHead('одна строка')).toEqual({ head: 'одна строка', rest: '' });
  });

  it('пустой вход → пустые head и rest', () => {
    expect(splitNoteHead('  \n ')).toEqual({ head: '', rest: '' });
  });

  it('пустая строка между заголовком и телом не попадает в начало rest', () => {
    expect(splitNoteHead('Шапка\n\nтело').rest).toBe('тело');
  });
});

describe('noteToPlainLine', () => {
  it('переносы → пробел, маркеры сняты, двойные пробелы схлопнуты', () => {
    expect(noteToPlainLine('Ситуация\n- Считают  вручную\n\n1) В ЧЗ   нет\r\n— итог')).toBe(
      'Ситуация Считают вручную В ЧЗ нет итог',
    );
  });

  it('пустой вход → пустая строка', () => {
    expect(noteToPlainLine('  \n')).toBe('');
  });

  it('снимает инлайн-разметку: жирный, курсив, ссылка', () => {
    expect(noteToPlainLine('**Итог:** [КП](https://x)')).toBe('Итог: КП');
    expect(noteToPlainLine('это *важно* и _срочно_')).toBe('это важно и срочно');
  });

  it('`## ` и номер списка снимаются', () => {
    expect(noteToPlainLine('## Итоги\n1. **первое**\n2. второе')).toBe('Итоги первое второе');
  });
});

describe('noteHeadline', () => {
  it('короткая первая строка — заголовок, остальное — тело', () => {
    expect(noteHeadline('02.10 · Zoom · АНФИШ\nУчастники: …')).toEqual({
      head: '02.10 · Zoom · АНФИШ',
      rest: 'Участники: …',
    });
  });

  it('заметка в одну длинную строку — без заголовка, весь текст в теле', () => {
    const long = 'а'.repeat(215);
    expect(noteHeadline(long)).toEqual({ head: null, rest: long });
  });

  it('длинная первая строка с продолжением — тело целиком, переносы сохранены', () => {
    const first = 'б'.repeat(121);
    expect(noteHeadline(`${first}\n- пункт`)).toEqual({ head: null, rest: `${first}\n- пункт` });
  });

  it('разметка в первой строке снята: `## Итоги` и `**Итог**` → чистый заголовок', () => {
    expect(noteHeadline('## Итоги встречи\nтело')).toEqual({ head: 'Итоги встречи', rest: 'тело' });
    expect(noteHeadline('**Итог:** [КП](https://x)').head).toBe('Итог: КП');
  });

  it('ровно на пороге — ещё заголовок', () => {
    const edge = 'в'.repeat(120);
    expect(noteHeadline(edge).head).toBe(edge);
  });
});
