// ═══════════════════════════════════════════════════════
// S-NOTES-2.2: инлайн-разметка заметки → узлы для React.
//
// Заметка хранится markdown-текстом, но рендер — НЕ markdown-библиотека и НЕ HTML:
// строка режется в плоский список узлов, а NoteBody превращает их в <strong>/<em>/<a>.
// Поэтому `dangerouslySetInnerHTML` не нужен, а XSS-контура нет.
//
// Поддержано: `**жирный**`, `*курсив*`, `_курсив_`, `[текст](https://…)`.
// Вложенность — один уровень: внутри жирного/курсивного/ссылки разметки нет (текст
// как есть). Непарный маркер — обычный текст. Пробел сразу внутри маркера
// (`** a **`, `* 3 = 15 *`) разметкой не считается — так умножение и сноски не
// превращаются в курсив.
// ═══════════════════════════════════════════════════════

export type InlineNode =
  | { t: 'text' | 'strong' | 'em'; v: string }
  | { t: 'link'; v: string; href: string };

/** Схемы, которые ссылка может нести. Всё остальное (`javascript:`, `data:`) — текст. */
const SAFE_HREF = /^(?:https?:\/\/|mailto:)\S/i;

/** Метка ≤ 200 знаков: без потолка `[[[[…` на 20 000 знаков даёт квадратичный разбор. */
const LINK = /\[([^\]\n]{1,200})\]\(([^)\s]+)\)/y;

const WORD_CHAR = /[\p{L}\p{N}]/u;

/** Содержимое маркера: не пустое и без пробела по краям. */
function validInner(s: string): boolean {
  return s.length > 0 && !/^\s/.test(s) && !/\s$/.test(s);
}

export function isSafeHref(href: string): boolean {
  return SAFE_HREF.test(href);
}

export function parseInline(text: string): InlineNode[] {
  const out: InlineNode[] = [];
  let buf = '';
  const pushText = (s: string) => {
    buf += s;
  };
  const flush = () => {
    if (buf) out.push({ t: 'text', v: buf });
    buf = '';
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    if (ch === '[') {
      LINK.lastIndex = i;
      const m = LINK.exec(text);
      if (m) {
        if (isSafeHref(m[2])) {
          flush();
          out.push({ t: 'link', v: m[1], href: m[2] });
        } else {
          // `javascript:` и прочее: остаётся как написано, без ссылки.
          pushText(m[0]);
        }
        i += m[0].length;
        continue;
      }
    }

    if (ch === '*' && text[i + 1] === '*') {
      const j = text.indexOf('**', i + 2);
      if (j !== -1 && validInner(text.slice(i + 2, j))) {
        flush();
        out.push({ t: 'strong', v: text.slice(i + 2, j) });
        i = j + 2;
      } else {
        pushText('**');
        i += 2;
      }
      continue;
    }

    if (ch === '*' || ch === '_') {
      // `snake_case` и «ИНН_123»: подчёркивание внутри слова курсивом не бывает.
      const opensWord = ch === '_' && i > 0 && WORD_CHAR.test(text[i - 1]);
      const j = opensWord ? -1 : text.indexOf(ch, i + 1);
      const inner = j === -1 ? '' : text.slice(i + 1, j);
      const closesWord = ch === '_' && j !== -1 && j + 1 < text.length && WORD_CHAR.test(text[j + 1]);
      if (j !== -1 && !closesWord && validInner(inner)) {
        flush();
        out.push({ t: 'em', v: inner });
        i = j + 1;
      } else {
        pushText(ch);
        i += 1;
      }
      continue;
    }

    pushText(ch);
    i += 1;
  }
  flush();
  return out;
}

/** Текст без разметки: `**x**` → `x`, `[a](b)` → `a`. Для превью и заголовков карточек. */
export function stripInline(text: string): string {
  return parseInline(text)
    .map((n) => n.v)
    .join('');
}
