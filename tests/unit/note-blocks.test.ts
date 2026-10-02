import { describe, it, expect } from 'vitest';
import { parseNoteBlocks, splitNoteHead, noteToPlainLine, noteHeadline } from '@/lib/text/note-blocks';

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
      { type: 'heading', text: 'Ситуация' },
      { type: 'list', items: ['Считают вручную', 'В ЧЗ нет интеграции'] },
      { type: 'heading', text: 'Решение (предварительно)' },
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
      { type: 'heading', text: 'Итоги:' },
      { type: 'list', items: ['первое', 'второе'] },
    ]);
  });

  it('заголовок находится через пустую строку до списка', () => {
    expect(parseNoteBlocks('Итоги\n\n- первое')[0]).toEqual({ type: 'heading', text: 'Итоги' });
  });

  it('строка длиной 49 без пунктуации перед списком — абзац', () => {
    const long = 'а'.repeat(49);
    expect(parseNoteBlocks(`${long}\n- пункт`)[0]).toEqual({ type: 'paragraph', text: long });
    const ok = 'а'.repeat(48);
    expect(parseNoteBlocks(`${ok}\n- пункт`)[0]).toEqual({ type: 'heading', text: ok });
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
    ['1.', '1. пункт'],
    ['1)', '1) пункт'],
  ])('маркер %s — пункт списка', (_m, line) => {
    expect(parseNoteBlocks(line)).toEqual([{ type: 'list', items: ['пункт'] }]);
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

  it('ровно на пороге — ещё заголовок', () => {
    const edge = 'в'.repeat(120);
    expect(noteHeadline(edge).head).toBe(edge);
  });
});
