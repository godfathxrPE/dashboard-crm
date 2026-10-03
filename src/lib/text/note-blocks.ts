// ═══════════════════════════════════════════════════════
// S-DEAL-NOTES-READ-1: плоский текст заметки → блоки для рендера.
//
// Заметка, notes встречи и agreements звонка хранятся ПЛОСКИМ текстом (rich text
// намеренно не вводили). Структуру восстанавливает рендерер — эта функция. Чистая,
// без React и без HTML: её читают и плитка «Событие», и строка ленты.
//
// Правила детерминированные, без угадывания. Эвристики « - » → список здесь НЕТ
// намеренно: дефис внутри фраз («1С - ЧЗ») дал бы ложные списки.
//
// S-NOTES-2.2: поверх плоского текста — markdown-блоки (`#`–`###`, `1.` отдельным
// типом `olist`). Эвристики плоского текста остаются: 78 перенесённых заметок и всё,
// что написано до 2.2, не размечено и показывается как раньше. Инлайн (`**x**`) —
// отдельно, в `note-inline.ts`: блок хранит текст как есть.
// ═══════════════════════════════════════════════════════

import { parseInline, stripInline } from '@/lib/text/note-inline';
import { hasPipe, isNumericCell, isTableStart, parseSeparator, splitRow } from '@/lib/text/note-table';

export type NoteBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'olist'; items: string[] }
  /** GFM-таблица; `align` итоговое: явное из разделителя, иначе числовая колонка → `right`. */
  | { type: 'table'; header: string[]; align: ('left' | 'center' | 'right')[]; rows: string[][] };

/** Заголовок короче порога и без конечной пунктуации (двоеточие допустимо). */
const HEADING_MAX_LEN = 48;
const HEADING_BAD_END = /[.,;!?]$/;

/** «- », «– », «— », «• », «* », «1. », «1) » в начале строки. Пробел после маркера обязателен. */
const MARKER = /^(?:[-–—•*]|\d+[.)])\s+(\S.*)$/;
const ORDERED = /^\d+[.)]\s/;

/** «# », «## », «### » — markdown-заголовок. Четыре решётки и больше — обычный текст. */
const MD_HEADING = /^(#{1,3})\s+(\S.*)$/;

function normalize(raw: string): string[] {
  return raw.replace(/\r\n?/g, '\n').split('\n').map((l) => l.trim());
}

type Line =
  | { kind: 'blank' }
  | { kind: 'mdhead'; level: 1 | 2 | 3; text: string }
  | { kind: 'item'; ordered: boolean; text: string }
  | { kind: 'text'; text: string };

function classify(line: string): Line {
  if (line === '') return { kind: 'blank' };
  const h = MD_HEADING.exec(line);
  if (h) return { kind: 'mdhead', level: h[1].length as 1 | 2 | 3, text: h[2].trim() };
  const m = MARKER.exec(line);
  return m
    ? { kind: 'item', ordered: ORDERED.test(line), text: m[1].trim() }
    : { kind: 'text', text: line };
}

/** Строка с разметкой (`**x**`, `*x*`, ссылка) — это абзац, который написали руками, а не заголовок. */
function hasInlineMarkup(text: string): boolean {
  return parseInline(text).some((n) => n.t !== 'text');
}

function isHeadingText(text: string): boolean {
  return text.length <= HEADING_MAX_LEN && !HEADING_BAD_END.test(text) && !hasInlineMarkup(text);
}

/**
 * Заметка написана в markdown-редакторе (2.2+): есть `#`-заголовок, `**жирный**` или
 * ссылка. Курсив не в счёт: `*` в старом плоском тексте встречается и без разметки.
 * Разбор — тем же `parseInline`, построчно (жирный через пустую строку парой не считается).
 */
export function hasMarkdown(raw: string): boolean {
  const lines = normalize(raw);
  return lines.some(
    (l, i) =>
      MD_HEADING.test(l) ||
      parseInline(l).some((n) => n.t === 'strong' || n.t === 'link') ||
      isTableStart(lines, i),
  );
}

/** Строка тела таблицы: есть `|`, и это не пустая строка, не `#`-заголовок и не пункт списка. */
function isTableRow(raw: string, line: Line): boolean {
  return line.kind === 'text' && hasPipe(raw);
}

/**
 * Таблица с `lines[start]` (заголовок) → блок и индекс первой строки после неё.
 * Строки тела выравниваются по числу колонок заголовка: короткие дополняются, длинные режутся.
 */
function readTable(
  raw: string[],
  lines: Line[],
  start: number,
): { block: Extract<NoteBlock, { type: 'table' }>; next: number } {
  const header = splitRow(raw[start]);
  const explicit = parseSeparator(raw[start + 1]) ?? [];
  const width = header.length;
  const rows: string[][] = [];
  let j = start + 2;
  for (; j < raw.length && isTableRow(raw[j], lines[j]); j++) {
    const cells = splitRow(raw[j]).slice(0, width);
    while (cells.length < width) cells.push('');
    rows.push(cells);
  }
  const align = header.map((_, c) => {
    const a = explicit[c];
    if (a) return a;
    const filled = rows.map((r) => r[c]).filter((v) => v !== '');
    return filled.length > 0 && filled.every(isNumericCell) ? 'right' : 'left';
  });
  return { block: { type: 'table', header, align, rows }, next: j };
}

/**
 * Плоский текст → блоки.
 *
 * Приоритет: строка без маркера сразу после пункта списка — продолжение пункта, а не
 * заголовок (иначе короткое продолжение перед следующим пунктом стало бы заголовком).
 * Заголовку нужна пустая строка или абзац перед ним.
 *
 * Эвристика заголовка — только для плоского текста (78 перенесённых заметок и всё до 2.2).
 * В markdown-заметке заголовок ставят явно (`#`), и короткая строка перед списком
 * остаётся абзацем.
 */
export function parseNoteBlocks(raw: string): NoteBlock[] {
  const rawLines = normalize(raw);
  const lines = rawLines.map(classify);
  const guessHeadings = !hasMarkdown(raw);
  const blocks: NoteBlock[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length > 0) blocks.push({ type: 'paragraph', text: para.join('\n') });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ type: list.ordered ? 'olist' : 'list', items: list.items });
    list = null;
  };
  const nextNonBlank = (from: number): Line | undefined => {
    for (let j = from + 1; j < lines.length; j++) if (lines[j].kind !== 'blank') return lines[j];
    return undefined;
  };

  // Проход по индексу: таблице нужен просмотр вперёд (строка-разделитель).
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.kind === 'blank') {
      flushPara();
      flushList();
      i++;
      continue;
    }
    if (line.kind === 'mdhead') {
      flushPara();
      flushList();
      blocks.push({ type: 'heading', level: line.level, text: line.text });
      i++;
      continue;
    }
    if (line.kind === 'item') {
      flushPara();
      // Нумерованный и маркированный пункты подряд — два списка, а не один.
      if (list && list.ordered !== line.ordered) flushList();
      list ??= { ordered: line.ordered, items: [] };
      list.items.push(line.text);
      i++;
      continue;
    }
    // text. Таблица прерывает абзац и список без пустой строки (так в GFM).
    if (isTableStart(rawLines, i)) {
      flushPara();
      flushList();
      const { block, next } = readTable(rawLines, lines, i);
      blocks.push(block);
      i = next;
      continue;
    }
    if (list) {
      // Пустая строка закрывает список, так что открытый список = мы сразу после пункта.
      list.items[list.items.length - 1] += ` ${line.text}`;
      i++;
      continue;
    }
    if (guessHeadings && isHeadingText(line.text) && nextNonBlank(i)?.kind === 'item') {
      flushPara();
      blocks.push({ type: 'heading', level: 3, text: line.text });
      i++;
      continue;
    }
    para.push(line.text);
    i++;
  }
  flushPara();
  flushList();
  return blocks;
}

/**
 * Первая непустая строка — заголовок превью; остальное — тело (без ведущих пустых строк).
 * Заметка, которая начинается с таблицы, заголовка не имеет: строка заголовка таблицы
 * в заголовке карточки оставила бы тело без неё, и таблица сломалась бы.
 */
export function splitNoteHead(raw: string): { head: string; rest: string } {
  const lines = normalize(raw);
  const first = lines.findIndex((l) => l !== '');
  if (first === -1) return { head: '', rest: '' };
  if (isTableStart(lines, first)) return { head: '', rest: lines.slice(first).join('\n').trim() };
  const rest = lines.slice(first + 1).join('\n').trim();
  return { head: stripLine(lines[first], false), rest };
}

/** Длиннее — первая строка уже не заголовок, а сам текст (заметка без переносов). */
export const NOTE_HEADLINE_MAX = 120;

/**
 * Заголовок плитки «Заметка». Как `splitNoteHead`, но длинная первая строка заголовком
 * не становится: жирный абзац в 300 символов — тот же дефект, что был до спринта.
 * Замер 02.10: у 5 из 8 длинных заметок первая строка 211–364 символа (переносов нет).
 * `head: null` — жирной строки нет, весь текст уходит в тело.
 */
export function noteHeadline(
  raw: string,
  max: number = NOTE_HEADLINE_MAX,
): { head: string | null; rest: string } {
  const { head, rest } = splitNoteHead(raw);
  if (head === '' && rest !== '') return { head: null, rest };
  if (head.length <= max) return { head, rest };
  return { head: null, rest: normalize(raw).join('\n').trim() };
}

/**
 * Строка без разметки: `## ` и инлайн (`**x**`, `[a](b)`) сняты. `withMarker` — снять ещё
 * и маркер списка; заголовку карточки он не мешает («- пункт» первой строкой остаётся).
 */
function stripLine(line: string, withMarker: boolean): string {
  const h = MD_HEADING.exec(line);
  if (h) return stripInline(h[2].trim());
  const m = withMarker ? MARKER.exec(line) : null;
  return stripInline(m ? m[1] : line);
}

/**
 * Текст без разметки для превью в одну-две строки: переносы → пробел, маркеры сняты.
 * Таблица — построчно: разделитель выброшен, строка с `|` → ячейки через « · ».
 */
export function noteToPlainLine(raw: string): string {
  return normalize(raw)
    .filter((l) => parseSeparator(l) === null)
    .map((l) =>
      hasPipe(l)
        ? splitRow(l).map(stripInline).filter(Boolean).join(' · ')
        : stripLine(l, true),
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
