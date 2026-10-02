// ═══════════════════════════════════════════════════════
// S-DEAL-NOTES-READ-1: плоский текст заметки → блоки для рендера.
//
// Заметка, notes встречи и agreements звонка хранятся ПЛОСКИМ текстом (rich text
// намеренно не вводили). Структуру восстанавливает рендерер — эта функция. Чистая,
// без React и без HTML: её читают и плитка «Событие», и строка ленты.
//
// Правила детерминированные, без угадывания. Эвристики « - » → список здесь НЕТ
// намеренно: дефис внутри фраз («1С - ЧЗ») дал бы ложные списки.
// ═══════════════════════════════════════════════════════

export type NoteBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] };

/** Заголовок короче порога и без конечной пунктуации (двоеточие допустимо). */
const HEADING_MAX_LEN = 48;
const HEADING_BAD_END = /[.,;!?]$/;

/** «- », «– », «— », «• », «* », «1. », «1) » в начале строки. Пробел после маркера обязателен. */
const MARKER = /^(?:[-–—•*]|\d+[.)])\s+(\S.*)$/;

function normalize(raw: string): string[] {
  return raw.replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim());
}

type Line = { kind: 'blank' } | { kind: 'item'; text: string } | { kind: 'text'; text: string };

function classify(line: string): Line {
  if (line === '') return { kind: 'blank' };
  const m = MARKER.exec(line);
  return m ? { kind: 'item', text: m[1].trim() } : { kind: 'text', text: line };
}

function isHeadingText(text: string): boolean {
  return text.length <= HEADING_MAX_LEN && !HEADING_BAD_END.test(text);
}

/**
 * Плоский текст → блоки.
 *
 * Приоритет: строка без маркера сразу после пункта списка — продолжение пункта, а не
 * заголовок (иначе короткое продолжение перед следующим пунктом стало бы заголовком).
 * Заголовку нужна пустая строка или абзац перед ним.
 */
export function parseNoteBlocks(raw: string): NoteBlock[] {
  const lines = normalize(raw).map(classify);
  const blocks: NoteBlock[] = [];
  let para: string[] = [];
  let list: string[] | null = null;

  const flushPara = () => {
    if (para.length > 0) blocks.push({ type: 'paragraph', text: para.join('\n') });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ type: 'list', items: list });
    list = null;
  };
  const nextNonBlank = (from: number): Line | undefined => {
    for (let j = from + 1; j < lines.length; j++) if (lines[j].kind !== 'blank') return lines[j];
    return undefined;
  };

  lines.forEach((line, i) => {
    if (line.kind === 'blank') {
      flushPara();
      flushList();
      return;
    }
    if (line.kind === 'item') {
      flushPara();
      list ??= [];
      list.push(line.text);
      return;
    }
    // text
    if (list) {
      // Пустая строка закрывает список, так что открытый список = мы сразу после пункта.
      list[list.length - 1] += ` ${line.text}`;
      return;
    }
    if (isHeadingText(line.text) && nextNonBlank(i)?.kind === 'item') {
      flushPara();
      blocks.push({ type: 'heading', text: line.text });
      return;
    }
    para.push(line.text);
  });
  flushPara();
  flushList();
  return blocks;
}

/** Первая непустая строка — заголовок превью; остальное — тело (без ведущих пустых строк). */
export function splitNoteHead(raw: string): { head: string; rest: string } {
  const lines = normalize(raw);
  const first = lines.findIndex((l) => l !== '');
  if (first === -1) return { head: '', rest: '' };
  const rest = lines.slice(first + 1).join('\n').trim();
  return { head: lines[first], rest };
}

/** Текст без разметки для превью в одну-две строки: переносы → пробел, маркеры сняты. */
export function noteToPlainLine(raw: string): string {
  return normalize(raw)
    .map((l) => MARKER.exec(l)?.[1] ?? l)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
