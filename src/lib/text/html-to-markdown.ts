// ═══════════════════════════════════════════════════════
// S-NOTES-2.2: HTML из буфера обмена → markdown заметки.
//
// Word, Google Docs, почта и мессенджеры кладут в буфер `text/html` со стилями. Берём
// из него структуру (жирный, курсив, заголовки, списки, ссылки) и выбрасываем всё
// остальное: шрифты, цвета. Таблица данных → GFM-таблица, вёрстка письма таблицами —
// обычные блоки (fix-S-NOTES-2.2-tables).
//
// Чистая функция: DOM-парсер приходит аргументом (в браузере — `DOMParser`, в тестах —
// jsdom), поэтому модуль не трогает `window` и работает на сервере.
//
// Ограничения под парсер `note-inline.ts` (вложенности разметки там нет):
//  • жирный + курсив на одном тексте → только жирный;
//  • разметка внутри ссылки снимается, ссылка внутри жирного остаётся ссылкой.
// ═══════════════════════════════════════════════════════

import { NOTE_MAX_LENGTH } from '@/lib/notes/build-insert';
import { isSafeHref } from '@/lib/text/note-inline';

/** Потолок результата — `notes_body_len` (20 000). */
export const HTML_MD_MAX_LENGTH = NOTE_MAX_LENGTH;

/** Вход длиннее режется до разбора: гигантский буфер (выгрузка таблицы) подвесил бы вкладку. */
const MAX_INPUT = 1_000_000;

type Parse = (html: string) => Document;

/** Что входит в текстовый узел: жирный/курсив из предков; `plain` — разметку не ставить. */
interface Ctx {
  b: boolean;
  i: boolean;
  plain: boolean;
}

interface Seg {
  t: string;
  b: boolean;
  i: boolean;
  /** Уже готовая разметка (ссылка): не оборачивать и не склеивать. */
  raw: boolean;
}

const ROOT: Ctx = { b: false, i: false, plain: false };
const PLAIN: Ctx = { b: false, i: false, plain: true };

/** Содержимое этих тегов не читаем вовсе. `o:p` — служебный абзац Word. */
const SKIP = new Set([
  'script', 'style', 'head', 'title', 'meta', 'link', 'noscript', 'xml', 'template', 'o:p',
]);

/** Теги, которые обрывают строку. Остальные — инлайн. */
const BLOCK = new Set([
  'p', 'div', 'li', 'ul', 'ol', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'section', 'article', 'header',
  'footer', 'aside', 'nav', 'main', 'figure', 'figcaption', 'address', 'dl', 'dt', 'dd',
  'hr', 'form', 'fieldset',
]);

/** Между абзацами — пустая строка, между div (строки письма) — просто перенос. */
const PARAGRAPH_GAP = new Set(['p', 'blockquote', 'pre']);

const tagOf = (el: Element): string => el.tagName.toLowerCase();

/** Вес шрифта из `style`: `undefined` — не задан. 600 и выше — жирный. */
function styleBold(style: string): boolean | undefined {
  const m = /font-weight\s*:\s*([a-z0-9]+)/i.exec(style);
  if (!m) return undefined;
  const w = m[1].toLowerCase();
  if (w === 'bold' || w === 'bolder') return true;
  const n = Number(w);
  return Number.isFinite(n) ? n >= 600 : false;
}

function styleItalic(style: string): boolean | undefined {
  const m = /font-style\s*:\s*([a-z]+)/i.exec(style);
  if (!m) return undefined;
  const v = m[1].toLowerCase();
  return v === 'italic' || v === 'oblique';
}

/**
 * Жирный/курсив внутри элемента. Google Docs оборачивает ВЕСЬ документ в
 * `<b style="font-weight:normal">` — по тегу это жирный, по стилю — нет, и верен стиль;
 * настоящий жирный там — `<span style="font-weight:700">`.
 */
function childCtx(el: Element, ctx: Ctx): Ctx {
  if (ctx.plain) return ctx;
  const tag = tagOf(el);
  const style = el.getAttribute('style') ?? '';
  let { b, i } = ctx;
  if (tag === 'b' || tag === 'strong') b = styleBold(style) ?? true;
  else if (tag === 'span') b = styleBold(style) ?? b;
  if (tag === 'i' || tag === 'em') i = styleItalic(style) ?? true;
  else if (tag === 'span') i = styleItalic(style) ?? i;
  return b === ctx.b && i === ctx.i ? ctx : { b, i, plain: false };
}

function wrapRun(mark: string, text: string): string {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
  if (!m || m[2] === '') return text;
  // Пробел внутри маркера (`**a **`) парсер заметки разметкой не считает — выносим наружу.
  return `${m[1]}${mark}${m[2]}${mark}${m[3]}`;
}

function markOf(s: Seg): '**' | '*' | '' {
  if (s.raw) return '';
  return s.b ? '**' : s.i ? '*' : '';
}

/** Сегменты → строка: соседние одинаковые склеиваются, жирный+курсив → жирный. */
function serialize(segs: Seg[]): string {
  const marks = segs.map(markOf);
  // Пробел между двумя жирными кусками принадлежит им обоим: `**a b**`, а не `**a** **b**`.
  for (let k = 1; k < segs.length - 1; k++) {
    if (!segs[k].raw && marks[k] === '' && /^[ ]+$/.test(segs[k].t) && marks[k - 1] !== '' && marks[k - 1] === marks[k + 1]) {
      marks[k] = marks[k - 1];
    }
  }
  let out = '';
  let run = '';
  let runMark: '**' | '*' | '' = '';
  const closeRun = () => {
    out += runMark ? wrapRun(runMark, run) : run;
    run = '';
  };
  segs.forEach((s, k) => {
    if (s.raw) {
      closeRun();
      runMark = '';
      out += s.t;
      return;
    }
    if (marks[k] !== runMark) {
      closeRun();
      runMark = marks[k];
    }
    run += s.t;
  });
  closeRun();
  return out
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Накопитель. Обычный режим собирает блоки через «отложенный разделитель»: два
 * `<div>` подряд дают один перенос, два `<p>` — пустую строку, а не их сумму.
 * Плоский режим (`flat`) — содержимое одной строки: пункт списка, ячейка, ссылка,
 * заголовок; переносы и границы блоков там превращаются в пробел.
 */
class Writer {
  private out = '';
  private segs: Seg[] = [];
  private pending = 0;

  constructor(readonly flat: boolean) {}

  add(t: string, ctx: Ctx, raw = false): void {
    this.segs.push({ t, b: ctx.b, i: ctx.i, raw });
  }

  lineBreak(): void {
    this.segs.push({ t: this.flat ? ' ' : '\n', b: false, i: false, raw: false });
  }

  /** Граница блока: `n` = 1 — перенос строки, 2 — пустая строка. */
  gap(n: number): void {
    if (this.flat) {
      this.segs.push({ t: ' ', b: false, i: false, raw: false });
      return;
    }
    this.flush();
    this.pending = Math.max(this.pending, n);
  }

  /** Готовая строка/блок; `after` — разделитель, который нужен ПОСЛЕ неё. */
  emit(s: string, after: number): void {
    this.flush();
    if (this.out) this.out += '\n'.repeat(Math.max(this.pending, 1));
    this.out += s;
    this.pending = after;
  }

  private flush(): void {
    if (this.flat || this.segs.length === 0) return;
    const s = serialize(this.segs);
    this.segs = [];
    if (s) {
      if (this.out) this.out += '\n'.repeat(Math.max(this.pending, 1));
      this.out += s;
      this.pending = 0;
    } else if (this.out) {
      // Абзац из одного <br> — это пустая строка между соседями.
      this.pending = Math.max(this.pending, 2);
    }
  }

  done(): string {
    if (this.flat) return serialize(this.segs).replace(/\s+/g, ' ').trim();
    this.flush();
    return this.out.trim();
  }
}

function flatText(el: Element | ChildNode[], ctx: Ctx): string {
  const w = new Writer(true);
  const nodes = Array.isArray(el) ? el : Array.from(el.childNodes);
  for (const n of nodes) walk(n, ctx, w);
  return w.done();
}

function encodeHref(href: string): string {
  return href.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
}

function renderList(list: Element, depth: number, ctx: Ctx): string[] {
  const ordered = tagOf(list) === 'ol';
  const start = parseInt(list.getAttribute('start') ?? '', 10);
  let n = Number.isFinite(start) ? start : 1;
  const indent = '  '.repeat(depth);
  const lines: string[] = [];

  for (const child of Array.from(list.children)) {
    const tag = tagOf(child);
    if (tag === 'ul' || tag === 'ol') {
      lines.push(...renderList(child, depth + 1, ctx));
      continue;
    }
    if (tag !== 'li') continue;
    const own: ChildNode[] = [];
    const nested: string[] = [];
    for (const node of Array.from(child.childNodes)) {
      if (node.nodeType === 1 && (tagOf(node as Element) === 'ul' || tagOf(node as Element) === 'ol')) {
        nested.push(...renderList(node as Element, depth + 1, ctx));
      } else {
        own.push(node);
      }
    }
    const text = flatText(own, ctx);
    if (text) lines.push(`${indent}${ordered ? `${n++}.` : '-'} ${text}`);
    lines.push(...nested);
  }
  return lines;
}

/**
 * Word кладёт список абзацами `MsoListParagraph*` с «·» или «1.» текстом вместо `<ul>`;
 * уровень — в `mso-list:l0 level2`. Вернёт готовую строку списка или `null`, если это
 * не такой абзац.
 */
function msoListLine(el: Element, text: string): string | null {
  if (!/MsoListParagraph/i.test(el.getAttribute('class') ?? '')) return null;
  const m = /^(?:([·•○▪■§o])|(\d+)[.)])\s+(\S[\s\S]*)$/.exec(text);
  if (!m) return null;
  const level = /level(\d+)/i.exec(el.getAttribute('style') ?? '');
  const depth = Math.max(0, (level ? parseInt(level[1], 10) : 1) - 1);
  return `${'  '.repeat(depth)}${m[2] ? `${m[2]}.` : '-'} ${m[3]}`;
}

/** Строки самой таблицы, без строк вложенных. */
function ownRows(table: Element): Element[] {
  return Array.from(table.querySelectorAll('tr')).filter((tr) => tr.closest('table') === table);
}

function cellsOf(tr: Element): Element[] {
  return Array.from(tr.children).filter((c) => tagOf(c) === 'td' || tagOf(c) === 'th');
}

/** Ячейка длиннее — это колонка письма, а не значение. */
const LAYOUT_CELL_MAX = 300;

/**
 * Сетка таблицы: текст ячеек (инлайн `**…**` сохраняется), переносы → пробел, `|` → `\|`.
 * `colspan` — ячейка плюс пустые; пустые строки выброшены; строки дополнены до общей ширины.
 */
function tableGrid(rows: Element[], ctx: Ctx): string[][] {
  const grid = rows
    .map((tr) =>
      cellsOf(tr).flatMap((c) => {
        const text = flatText(c, ctx).replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|');
        const span = Math.max(1, Math.min(parseInt(c.getAttribute('colspan') ?? '', 10) || 1, 100));
        return [text, ...Array<string>(span - 1).fill('')];
      }),
    )
    .filter((r) => r.some((v) => v !== ''));
  const width = Math.max(0, ...grid.map((r) => r.length));
  return grid.map((r) => [...r, ...Array<string>(width - r.length).fill('')]);
}

/**
 * Колонка без текста во всех ячейках (включая первую строку) выбрасывается: колонка
 * логотипа подписи, фото в каталоге, отступы Outlook. Картинки в заметке не хранятся —
 * пустая колонка ничего не теряет.
 */
function dropEmptyColumns(grid: string[][]): string[][] {
  const width = grid[0]?.length ?? 0;
  const keep = Array.from({ length: width }, (_, c) => c).filter((c) => grid.some((r) => r[c] !== ''));
  return grid.map((r) => keep.map((c) => r[c]));
}

/**
 * Вёрстка (письма Outlook и рассылок строятся таблицами), а не таблица данных.
 * `<p class=MsoNormal>` в ячейке — не признак: Word кладёт абзац в каждую ячейку.
 * `grid` — сетка уже без пустых колонок: подпись «логотип | контакты» после отброса
 * колонки логотипа остаётся в одну колонку и попадает под правило `≤ 1`.
 */
function isLayoutTable(table: Element, rows: Element[], grid: string[][]): boolean {
  // Разметка доступности: так помечают вёрстку письма.
  const role = (table.getAttribute('role') ?? '').toLowerCase();
  if (role === 'presentation' || role === 'none') return true;
  // Вложенная таблица — часть той же вёрстки, и сама вложенная — тоже. Вложенные таблицы
  // в письмах — чаще всего подписи (логотип | контакты) и шапки рассылок: если судить
  // вложенную отдельно, подпись станет GFM-таблицей. Прайс в рассылке уйдёт текстом —
  // это меньшее зло (решение гейта 03.10).
  if (table.querySelector('table') || table.parentElement?.closest('table')) return true;
  const cells = rows.flatMap(cellsOf);
  if (cells.some((c) => c.querySelector('ul, ol, h1, h2, h3, h4, h5, h6, blockquote'))) return true;
  if ((grid[0]?.length ?? 0) <= 1) return true;
  return grid.some((r) => r.some((v) => v.length > LAYOUT_CELL_MAX));
}

/**
 * Сетка → GFM. Заголовок — первая строка (у Excel и Google Sheets она и есть заголовок).
 * Выравнивание не переносим: числовые колонки выравнивает рендер.
 */
function tableToGfm(grid: string[][]): string {
  if (grid.length === 0) return '';
  const line = (r: string[]) => `| ${r.join(' | ')} |`;
  const [head, ...body] = grid;
  return [line(head), line(head.map(() => '---')), ...body.map(line)].join('\n');
}

function walk(node: Node, ctx: Ctx, w: Writer): void {
  if (node.nodeType === 3) {
    const t = (node.nodeValue ?? '').replace(/[​﻿]/g, '').replace(/\s+/g, ' ');
    if (t) w.add(t, ctx);
    return;
  }
  // Комментарии (`<!--StartFragment-->`, условные комментарии Word) и всё не-элементы.
  if (node.nodeType !== 1) return;

  const el = node as Element;
  const tag = tagOf(el);
  if (SKIP.has(tag)) return;

  if (tag === 'br') {
    w.lineBreak();
    return;
  }

  if (tag === 'a') {
    const href = (el.getAttribute('href') ?? '').trim();
    if (isSafeHref(href)) {
      const label = flatText(el, PLAIN).replace(/[[\]]/g, '').trim();
      if (label) w.add(`[${label}](${encodeHref(href)})`, ctx, true);
      return;
    }
    // Небезопасная или пустая ссылка — просто текст внутри.
  }

  const inner = childCtx(el, ctx);

  if (!BLOCK.has(tag)) {
    for (const c of Array.from(el.childNodes)) walk(c, inner, w);
    return;
  }

  // Плоский режим: блоки внутри пункта/ячейки/ссылки — только пробелы вокруг.
  if (w.flat) {
    w.gap(1);
    for (const c of Array.from(el.childNodes)) walk(c, inner, w);
    w.gap(1);
    return;
  }

  if (/^h[1-6]$/.test(tag)) {
    const text = flatText(el, PLAIN);
    w.gap(2);
    if (text) w.emit(`${'#'.repeat(Math.min(Number(tag[1]), 3))} ${text}`, 2);
    return;
  }

  if (tag === 'ul' || tag === 'ol') {
    const lines = renderList(el, 0, ctx);
    w.gap(2);
    if (lines.length > 0) w.emit(lines.join('\n'), 2);
    return;
  }

  if (tag === 'table') {
    const rows = ownRows(el);
    const grid = dropEmptyColumns(tableGrid(rows, inner));
    w.gap(2);
    if (isLayoutTable(el, rows, grid)) {
      // Вёрстка письма: строки и ячейки — как `div`, содержимое разбирается обычными блоками.
      for (const tr of rows) {
        w.gap(1);
        for (const c of cellsOf(tr)) {
          w.gap(1);
          for (const n of Array.from(c.childNodes)) walk(n, inner, w);
          w.gap(1);
        }
        w.gap(1);
      }
    } else {
      const gfm = tableToGfm(grid);
      if (gfm) w.emit(gfm, 2);
    }
    w.gap(2);
    return;
  }

  if (tag === 'p') {
    const msoText = /MsoListParagraph/i.test(el.getAttribute('class') ?? '') ? flatText(el, ctx) : null;
    const line = msoText === null ? null : msoListLine(el, msoText);
    if (line) {
      w.gap(1);
      w.emit(line, 1);
      return;
    }
  }

  const gap = PARAGRAPH_GAP.has(tag) ? 2 : 1;
  w.gap(gap);
  for (const c of Array.from(el.childNodes)) walk(c, inner, w);
  w.gap(gap);
}

/**
 * HTML буфера → markdown. `parse` — разбор HTML в `Document` (в браузере
 * `(h) => new DOMParser().parseFromString(h, 'text/html')`; такой документ инертен:
 * скрипты не выполняются, картинки не грузятся).
 * Пустая строка в ответе — буфер без текста (например, только картинка).
 */
export function htmlToMarkdown(html: string, parse: Parse): string {
  if (!html.trim()) return '';
  const body = parse(html.length > MAX_INPUT ? html.slice(0, MAX_INPUT) : html).body;
  if (!body) return '';
  const w = new Writer(false);
  for (const n of Array.from(body.childNodes)) walk(n, ROOT, w);
  let md = w.done().replace(/\n{3,}/g, '\n\n');
  if (md.length > HTML_MD_MAX_LENGTH) {
    md = md.slice(0, HTML_MD_MAX_LENGTH);
    // Не оставляем половину суррогатной пары (эмодзи) на обрезе.
    if (/[\ud800-\udbff]/.test(md[md.length - 1])) md = md.slice(0, -1);
  }
  return md;
}
