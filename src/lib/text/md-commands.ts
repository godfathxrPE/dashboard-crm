// ═══════════════════════════════════════════════════════
// S-NOTES-2.2: команды панели редактора заметки — чистые функции над строкой.
//
// Принимают текст и выделение (`start`/`end` — индексы textarea), возвращают новый
// текст и новое выделение. Компонент `MarkdownEditor` только применяет результат и
// возвращает выделение в поле: в этих функциях нет DOM, поэтому они тестируются
// без браузера.
// ═══════════════════════════════════════════════════════

export interface EditResult {
  value: string;
  start: number;
  end: number;
}

/** Для маркера из одной `*` соседняя `**` — это жирный, а не наш курсив. */
function isSurrounded(before: string, after: string, mark: string): boolean {
  if (!before.endsWith(mark) || !after.startsWith(mark)) return false;
  return mark.length > 1 || (!before.endsWith('**') && !after.startsWith('**'));
}

/**
 * Жирный/курсив: оборачивает выделение в `mark` или снимает разметку, если выделение
 * уже обёрнуто (маркеры внутри выделения либо вокруг него). Без выделения ставит пару
 * маркеров и курсор между ними; курсор между парой — убирает её.
 * Пробелы по краям выделения остаются снаружи: `** слово**` парсер не считает жирным.
 */
export function wrapSelection(value: string, start: number, end: number, mark: string): EditResult {
  const before = value.slice(0, start);
  const sel = value.slice(start, end);
  const after = value.slice(end);

  // Выделили вместе с маркерами: **слово** → слово.
  if (
    sel.length > mark.length * 2 &&
    sel.startsWith(mark) &&
    sel.endsWith(mark) &&
    (mark.length > 1 || (!sel.startsWith('**') && !sel.endsWith('**')))
  ) {
    const inner = sel.slice(mark.length, sel.length - mark.length);
    return { value: before + inner + after, start, end: start + inner.length };
  }

  // Выделили слово внутри маркеров (или курсор между парой): **|слово|** → слово.
  if (isSurrounded(before, after, mark)) {
    const cut = before.length - mark.length;
    return {
      value: value.slice(0, cut) + sel + after.slice(mark.length),
      start: cut,
      end: cut + sel.length,
    };
  }

  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(sel);
  const lead = m?.[1] ?? '';
  const core = m?.[2] ?? '';
  const trail = m?.[3] ?? '';
  if (core === '') {
    // Пустое или пробельное выделение: пара маркеров, курсор посередине.
    const at = start + lead.length;
    return {
      value: value.slice(0, at) + mark + mark + value.slice(at),
      start: at + mark.length,
      end: at + mark.length,
    };
  }
  const s = start + lead.length + mark.length;
  return {
    value: before + lead + mark + core + mark + trail + after,
    start: s,
    end: s + core.length,
  };
}

/** Префиксы строк: маркированный и нумерованный список, заголовок. */
export type LinePrefix = '- ' | '1. ' | '## ';

const KIND: Record<LinePrefix, RegExp> = {
  '- ': /^[-*•]\s+/,
  '1. ': /^\d+[.)]\s+/,
  '## ': /^#{1,3}\s+/,
};

/** Любой префикс из трёх: чужой при смене вида заменяется, а не копится (`- 1. a`). */
const ANY_PREFIX = /^(?:#{1,3}\s+|[-*•]\s+|\d+[.)]\s+)/;

/**
 * Ставит `prefix` каждой выделенной строке или снимает, если он уже стоит у всех
 * непустых. `1. ` нумерует строки по порядку. Пустые строки в многострочном выделении
 * пропускаются; единственная пустая строка под курсором получает префикс.
 * Выделение после — все затронутые строки; для курсора — он сам, сдвинутый на длину префикса.
 */
export function toggleLinePrefix(value: string, start: number, end: number, prefix: LinePrefix): EditResult {
  const blockStart = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
  // Выделение «до начала следующей строки» (тройной клик) эту строку не затрагивает.
  const lastChar = end > start && value[end - 1] === '\n' ? end - 1 : end;
  const nl = value.indexOf('\n', lastChar);
  const blockEnd = nl === -1 ? value.length : nl;
  const lines = value.slice(blockStart, blockEnd).split('\n');

  const single = lines.length === 1;
  const target = lines.filter((l) => single || l.trim() !== '');
  const remove = target.length > 0 && target.every((l) => KIND[prefix].test(l));

  let n = 0;
  const next = lines.map((l) => {
    if (!single && l.trim() === '') return l;
    const bare = l.replace(remove ? KIND[prefix] : ANY_PREFIX, '');
    if (remove) return bare;
    n += 1;
    return (prefix === '1. ' ? `${n}. ` : prefix) + bare;
  });

  const joined = next.join('\n');
  const result = value.slice(0, blockStart) + joined + value.slice(blockEnd);
  if (start === end) {
    // Курсор остаётся на своём месте в строке: двигается на разницу длин этой строки.
    const delta = next[0].length - lines[0].length;
    const caret = Math.max(blockStart, start + delta);
    return { value: result, start: caret, end: caret };
  }
  return { value: result, start: blockStart, end: blockStart + joined.length };
}

const URL_START = /^https?:\/\/\S+$/i;

/**
 * Ссылка. Выделенный адрес становится `[ссылка](адрес)` с выделенной подписью; выделенный
 * текст — `[текст](https://)` с выделенным адресом; без выделения — `[текст](https://)`
 * с выделенным «текст».
 */
export function insertLink(value: string, start: number, end: number): EditResult {
  const sel = value.slice(start, end);
  const before = value.slice(0, start);
  const after = value.slice(end);

  if (URL_START.test(sel.trim())) {
    const label = 'ссылка';
    return {
      value: `${before}[${label}](${sel.trim()})${after}`,
      start: start + 1,
      end: start + 1 + label.length,
    };
  }
  if (sel.trim() !== '') {
    const url = 'https://';
    const urlStart = start + 1 + sel.length + 2;
    return { value: `${before}[${sel}](${url})${after}`, start: urlStart, end: urlStart + url.length };
  }
  const label = 'текст';
  const url = 'https://';
  return {
    value: `${before}[${label}](${url})${after}`,
    start: start + 1,
    end: start + 1 + label.length,
  };
}

/** Вставка текста в позицию курсора/на место выделения; курсор — после вставленного. */
export function insertAt(value: string, start: number, end: number, text: string): EditResult {
  const caret = start + text.length;
  return { value: value.slice(0, start) + text + value.slice(end), start: caret, end: caret };
}

/** Строка-блок: пункт списка или `#`-заголовок. */
const BLOCK_LINE = /^(?:[-*•]\s|\d+[.)]\s|#{1,3}\s)/;

/**
 * Вставка markdown, который может начинаться или кончаться блоком (список, заголовок).
 * Блок в середине строки склеился бы с ней: текст перед курсором стал бы частью абзаца,
 * а строка после — продолжением последнего пункта. Поэтому перед блоком, если курсор
 * не в начале строки, ставится `\n`; после блока, если дальше в строке есть текст, — тоже.
 * Курсор — сразу за вставленным `md` (до добавленного переноса). Без блоков — как `insertAt`.
 */
export function insertBlock(value: string, start: number, end: number, md: string): EditResult {
  const lines = md.split('\n');
  const before = start > 0 && value[start - 1] !== '\n' && BLOCK_LINE.test(lines[0]) ? '\n' : '';
  const after = end < value.length && value[end] !== '\n' && BLOCK_LINE.test(lines[lines.length - 1]) ? '\n' : '';
  const caret = start + before.length + md.length;
  return { value: value.slice(0, start) + before + md + after + value.slice(end), start: caret, end: caret };
}
