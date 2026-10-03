import { describe, it, expect } from 'vitest';
import { htmlToMarkdown, HTML_MD_MAX_LENGTH } from '@/lib/text/html-to-markdown';
import { parseNoteBlocks } from '@/lib/text/note-blocks';

// S-NOTES-2.2. Буфер обмена → markdown. Фикстуры повторяют то, что реально кладут в
// буфер Google Docs и Word (обёртки, `Mso*`, `<o:p>`), а не учебный HTML.

const parse = (html: string): Document => new DOMParser().parseFromString(html, 'text/html');
const md = (html: string): string => htmlToMarkdown(html, parse);

describe('htmlToMarkdown · Google Docs', () => {
  const GDOCS =
    '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1a2b">' +
    '<p dir="ltr" style="line-height:1.38;margin-top:0pt;"><span style="font-size:11pt;font-weight:400;">Обычный </span>' +
    '<span style="font-size:11pt;font-weight:700;">жирный</span>' +
    '<span style="font-size:11pt;font-weight:400;"> и </span>' +
    '<span style="font-size:11pt;font-style:italic;font-weight:400;">курсив</span></p></b>';

  it('обёртка <b font-weight:normal> не жирная; жирный — только span:700', () => {
    expect(md(GDOCS)).toBe('Обычный **жирный** и *курсив*');
  });

  it('список Google Docs: <li><p><span> → пункты', () => {
    const html =
      '<b style="font-weight:normal;"><ul><li dir="ltr" style="list-style-type:disc;"><p dir="ltr" role="presentation"><span>Первый</span></p></li>' +
      '<li dir="ltr"><p dir="ltr" role="presentation"><span>Второй</span></p></li></ul></b>';
    expect(md(html)).toBe('- Первый\n- Второй');
  });

  it('заголовок: <h2><span font-weight:400> → `## `', () => {
    expect(md('<h2 dir="ltr"><span style="font-weight:400;">Итоги</span></h2>')).toBe('## Итоги');
  });
});

describe('htmlToMarkdown · Word', () => {
  it('<p class=MsoNormal> и <o:p> → чистые абзацы, пустой <o:p>&nbsp; не плодит строк', () => {
    const html =
      '<html><body><!--StartFragment--><p class=MsoNormal>Первый абзац<o:p></o:p></p>' +
      '<p class=MsoNormal><o:p>&nbsp;</o:p></p>' +
      '<p class=MsoNormal>Второй абзац<o:p></o:p></p><!--EndFragment--></body></html>';
    expect(md(html)).toBe('Первый абзац\n\nВторой абзац');
  });

  it('условные комментарии <!--[if gte mso 9]> выброшены', () => {
    const html = '<p>до</p><!--[if gte mso 9]><xml><w:WordDocument>мусор</w:WordDocument></xml><![endif]--><p>после</p>';
    expect(md(html)).toBe('до\n\nпосле');
  });

  it('список абзацами MsoListParagraph: «·» и «1.» → пункты, уровень → отступ', () => {
    const html =
      "<p class=MsoListParagraphCxSpFirst style='mso-list:l0 level1 lfo1'><![if !supportLists]><span>·<span>&nbsp;&nbsp;&nbsp;</span></span><![endif]>Первый<o:p></o:p></p>" +
      "<p class=MsoListParagraphCxSpLast style='mso-list:l0 level2 lfo1'><![if !supportLists]><span>o<span>&nbsp;&nbsp;</span></span><![endif]>Вложенный<o:p></o:p></p>" +
      "<p class=MsoListParagraph style='mso-list:l1 level1 lfo2'><![if !supportLists]><span>1.<span>&nbsp;&nbsp;</span></span><![endif]>Нумерованный<o:p></o:p></p>";
    expect(md(html)).toBe('- Первый\n  - Вложенный\n1. Нумерованный');
  });
});

describe('htmlToMarkdown · структура', () => {
  it('<b>, <strong>, <i>, <em>; одинаковые соседи через пробел — один отрезок', () => {
    expect(md('<p><b>a</b> text <i>c</i></p>')).toBe('**a** text *c*');
    expect(md('<p><b>a</b> <strong>b</strong> <i>c</i> <em>d</em></p>')).toBe('**a b** *c d*');
  });

  it('пробел внутри <b> уходит наружу: `<b>Итог: </b>текст` → `**Итог:** текст`', () => {
    expect(md('<p><b>Итог: </b>текст</p>')).toBe('**Итог:** текст');
  });

  it('соседние жирные куски склеиваются, жирный+курсив → жирный', () => {
    expect(md('<p><b>а</b><b>б</b> <b>в</b></p>')).toBe('**аб в**');
    expect(md('<p><b><i>x</i></b></p>')).toBe('**x**');
  });

  it('h1–h3 → #–###, h4–h6 → ###; жирный внутри заголовка не дублируется', () => {
    expect(md('<h1>a</h1><h2>b</h2><h3>c</h3><h4>d</h4><h6>e</h6>')).toBe('# a\n\n## b\n\n### c\n\n### d\n\n### e');
    expect(md('<h2><b>Итоги</b></h2>')).toBe('## Итоги');
  });

  it('вложенный список: `- a\\n  - b`', () => {
    expect(md('<ul><li>a<ul><li>b</li></ul></li></ul>')).toBe('- a\n  - b');
  });

  it('<ol> нумеруется 1., 2.; start учитывается', () => {
    expect(md('<ol><li>a</li><li>b</li></ol>')).toBe('1. a\n2. b');
    expect(md('<ol start="3"><li>a</li><li>b</li></ol>')).toBe('3. a\n4. b');
  });

  it('ссылка http/https/mailto → [текст](href)', () => {
    expect(md('<p><a href="https://x.ru/a">сайт</a> <a href="mailto:a@b.ru">почта</a></p>')).toBe(
      '[сайт](https://x.ru/a) [почта](mailto:a@b.ru)',
    );
  });

  it('<a href="javascript:…"> → только текст', () => {
    expect(md('<p><a href="javascript:alert(1)">нажми</a></p>')).toBe('нажми');
    expect(md('<p><a href="data:text/html,x">y</a></p>')).toBe('y');
  });

  it('скобки в адресе и подписи не ломают ссылку', () => {
    expect(md('<a href="https://x.ru/a_(b)">[a]</a>')).toBe('[a](https://x.ru/a_%28b%29)');
  });

  it('жирный внутри ссылки снимается, ссылка внутри жирного остаётся ссылкой', () => {
    expect(md('<a href="https://x.ru"><b>сайт</b></a>')).toBe('[сайт](https://x.ru)');
    expect(md('<p><b>см. <a href="https://x.ru">сайт</a></b></p>')).toBe('**см.** [сайт](https://x.ru)');
  });

  it('таблица 2×2 → GFM-таблица', () => {
    const html = '<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>';
    expect(md(html)).toBe('| a | b |\n| --- | --- |\n| c | d |');
  });

  it('<br> — перенос строки внутри абзаца; <div> подряд — строки без пустых между ними', () => {
    expect(md('<p>раз<br>два</p>')).toBe('раз\nдва');
    expect(md('<div>раз</div><div>два</div>')).toBe('раз\nдва');
  });

  it('<div><br></div> между строк письма — одна пустая строка', () => {
    expect(md('<div>раз</div><div><br></div><div>два</div>')).toBe('раз\n\nдва');
  });

  it('больше двух пустых строк подряд → одна', () => {
    expect(md('<p>a</p><p><br></p><p><br></p><p><br></p><p>b</p>')).toBe('a\n\nb');
    expect(md('a<br><br><br><br>b')).toBe('a\n\nb');
  });

  it('неразрывные пробелы и переносы исходника схлопываются', () => {
    expect(md('<p>раз&nbsp;&nbsp;два\n   три</p>')).toBe('раз два три');
  });

  it('<script>, <style>, <title> выброшены вместе с содержимым', () => {
    expect(md('<style>p{color:red}</style><script>alert(1)</script><p>текст</p>')).toBe('текст');
  });

  it('без текста (только картинка) → пустая строка', () => {
    expect(md('<img src="x.png">')).toBe('');
    expect(md('')).toBe('');
    expect(md('   ')).toBe('');
  });
});

describe('htmlToMarkdown · предел длины', () => {
  it('25 000 знаков → 20 000', () => {
    const out = md(`<p>${'а'.repeat(25000)}</p>`);
    expect(out.length).toBe(20000);
    expect(HTML_MD_MAX_LENGTH).toBe(20000);
  });

  it('обрез не оставляет половину эмодзи', () => {
    const out = md(`<p>${'а'.repeat(19999)}😀</p>`);
    expect(out.length).toBe(19999);
  });
});

describe('htmlToMarkdown → parseNoteBlocks (сквозное)', () => {
  it('документ Google Docs с заголовком, списком и жирным становится блоками заметки', () => {
    const html =
      '<b style="font-weight:normal;"><h2><span>Итоги</span></h2>' +
      '<p><span>Клиент </span><span style="font-weight:700;">согласен</span><span>.</span></p>' +
      '<ul><li><p><span>КП до пятницы</span></p></li><li><p><span>Созвон во вторник</span></p></li></ul></b>';
    expect(parseNoteBlocks(md(html))).toEqual([
      { type: 'heading', level: 2, text: 'Итоги' },
      { type: 'paragraph', text: 'Клиент **согласен**.' },
      { type: 'list', items: ['КП до пятницы', 'Созвон во вторник'] },
    ]);
  });
});

describe('htmlToMarkdown · таблицы (fix-S-NOTES-2.2-tables)', () => {
  it('thead/th + tbody, <strong> в ячейке → `**…**`', () => {
    const html =
      '<table><thead><tr><th>Год</th><th>Выручка</th></tr></thead>' +
      '<tbody><tr><td>2025</td><td><strong>17 930</strong></td></tr></tbody></table>';
    expect(md(html)).toBe('| Год | Выручка |\n| --- | --- |\n| 2025 | **17 930** |');
  });

  it('`|` в ячейке → `\\|`, <br> → пробел', () => {
    const html = '<table><tr><td>a|b</td><td>раз<br>два</td></tr><tr><td>1</td><td>2</td></tr></table>';
    expect(md(html)).toBe('| a\\|b | раз два |\n| --- | --- |\n| 1 | 2 |');
  });

  it('colspan="2" в строке 3×3 → ячейка + пустая', () => {
    const html =
      '<table><tr><td>a</td><td>b</td><td>c</td></tr>' +
      '<tr><td colspan="2">d</td><td>e</td></tr><tr><td>f</td><td>g</td><td>h</td></tr></table>';
    expect(md(html)).toBe('| a | b | c |\n| --- | --- | --- |\n| d |  | e |\n| f | g | h |');
  });

  it('строки разной длины дополнены до максимума', () => {
    const html = '<table><tr><td>a</td></tr><tr><td>b</td><td>c</td></tr></table>';
    expect(md(html)).toBe('| a |  |\n| --- | --- |\n| b | c |');
  });

  it('пустая строка таблицы пропущена', () => {
    const html = '<table><tr><td>a</td><td>b</td></tr><tr><td></td><td> </td></tr><tr><td>c</td><td>d</td></tr></table>';
    expect(md(html)).toBe('| a | b |\n| --- | --- |\n| c | d |');
  });

  it('GFM-таблица из буфера разбирается парсером заметки', () => {
    const html = '<p>Итоги</p><table><tr><td>a</td><td>b</td></tr><tr><td>1</td><td>2</td></tr></table><p>после</p>';
    expect(parseNoteBlocks(md(html)).map((b) => b.type)).toEqual(['paragraph', 'table', 'paragraph']);
  });

  it('вёрстка: одна колонка с <p> → абзацы без `|`', () => {
    const html = '<table><tr><td><p>Привет</p><p>Текст письма</p></td></tr><tr><td><p>Подпись</p></td></tr></table>';
    const out = md(html);
    expect(out).not.toContain('|');
    expect(out).toBe('Привет\n\nТекст письма\n\nПодпись');
  });

  it('вёрстка: вложенная table → без `|`', () => {
    const html =
      '<table><tr><td>Шапка</td><td>лого</td></tr><tr><td colspan="2">' +
      '<table><tr><td>внутри</td><td>ещё</td></tr></table></td></tr></table>';
    const out = md(html);
    expect(out).not.toContain('|');
    expect(out).toContain('внутри');
  });

  it('вёрстка: ячейка с <ul> → список `- `', () => {
    const html = '<table><tr><td>Слева</td><td><ul><li>раз</li><li>два</li></ul></td></tr></table>';
    const out = md(html);
    expect(out).not.toContain('|');
    expect(out).toContain('- раз\n- два');
  });

  it('вёрстка: ячейка длиннее 300 символов → без `|`', () => {
    const long = 'с'.repeat(301);
    const html = `<table><tr><td>${long}</td><td>б</td></tr></table>`;
    expect(md(html)).not.toContain('|');
  });

  it('подпись письма: ячейка-логотип без текста → вёрстка, строки подписи отдельно', () => {
    const html =
      '<table><tr><td><img src="https://x/logo.png"></td><td>Иван Петров<br>+7 900 000-00-00</td></tr></table>';
    const out = md(html);
    expect(out).not.toContain('|');
    expect(out.split('\n')).toEqual(expect.arrayContaining(['Иван Петров', '+7 900 000-00-00']));
  });

  it('<table role="presentation"> 2×2 → вёрстка, без `|`', () => {
    const html = '<table role="presentation"><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>';
    expect(md(html)).not.toContain('|');
  });

  it('картинка рядом с текстом в ячейке — не признак вёрстки', () => {
    const html =
      '<table><tr><td>Город</td><td>Офис</td></tr>' +
      '<tr><td><img src="https://x/pin.png"> Москва</td><td>1</td></tr></table>';
    expect(md(html)).toBe('| Город | Офис |\n| --- | --- |\n| Москва | 1 |');
  });

  it('Word: MsoTableGrid с <p class=MsoNormal> в ячейках → GFM без o:p', () => {
    const html =
      '<table class=MsoTableGrid border=1>' +
      '<tr><td><p class=MsoNormal>Год<o:p></o:p></p></td><td><p class=MsoNormal><b>Выручка</b><o:p></o:p></p></td></tr>' +
      '<tr><td><p class=MsoNormal>2025<o:p></o:p></p></td><td><p class=MsoNormal>10<o:p></o:p></p></td></tr></table>';
    const out = md(html);
    expect(out).toBe('| Год | **Выручка** |\n| --- | --- |\n| 2025 | 10 |');
    expect(out).not.toContain('o:p');
  });
});
