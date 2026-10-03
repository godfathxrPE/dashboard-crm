// ═══════════════════════════════════════════════════════
// fix-S-NOTES-2.2-tables: GFM-таблица в тексте заметки.
//
// Таблица хранится в `notes.body` pipe-синтаксисом GFM: заголовок, разделитель
// `|---|:---:|---:|`, строки тела. Без строки-разделителя таблицы нет — строка с `|`
// в старой заметке («1С | ЧЗ») остаётся абзацем. Чистые функции, без React.
// ═══════════════════════════════════════════════════════

import { stripInline } from '@/lib/text/note-inline';

export type Align = 'left' | 'center' | 'right' | null;

/** Неэкранированная черта: `\|` — литерал внутри ячейки. */
const PIPE = /(?<!\\)\|/;
const PIPE_SPLIT = /(?<!\\)\|/g;

const SEPARATOR_CELL = /^:?-+:?$/;

/** Число, проценты, рубли, тысячи/миллионы. Пробелы-разделители разрядов — любые (`\s` ловит и NBSP). */
const NUMERIC = /^[-+−]?\d[\d\s]*([.,]\d+)?\s?(%|₽|руб\.?|тыс\.?|млн|млрд)?$/i;

export function hasPipe(line: string): boolean {
  return PIPE.test(line);
}

/** Строка таблицы → ячейки. Внешние `|` необязательны; `\|` → `|`. */
export function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  return s.split(PIPE_SPLIT).map((c) => c.trim().replace(/\\\|/g, '|'));
}

/** Строка-разделитель → выравнивание колонок; `null` — это не разделитель. */
export function parseSeparator(line: string): Align[] | null {
  if (!hasPipe(line)) return null;
  const cells = splitRow(line);
  if (cells.length === 0) return null;
  const out: Align[] = [];
  for (const c of cells) {
    if (!SEPARATOR_CELL.test(c)) return null;
    const l = c.startsWith(':');
    const r = c.endsWith(':');
    out.push(l && r ? 'center' : r ? 'right' : l ? 'left' : null);
  }
  return out;
}

/** На `lines[i]` начинается таблица: черта в строке, за ней разделитель с тем же числом колонок. */
export function isTableStart(lines: string[], i: number): boolean {
  const head = lines[i];
  const sep = lines[i + 1];
  if (head === undefined || sep === undefined || !hasPipe(head)) return false;
  const align = parseSeparator(sep);
  return align !== null && align.length === splitRow(head).length;
}

/** Хвостовая пометка отчёта: `721 105 (×8,5)`, `16 355 (−9%)`. Длиннее 16 символов — уже текст. */
const TRAILING_NOTE = /\s*\([^()]{1,16}\)$/;

/** Число, в том числе с одной пометкой в скобках в конце. Пометка без числа (`(н/д)`) — не число. */
export function isNumericCell(text: string): boolean {
  const t = stripInline(text).trim().replace(TRAILING_NOTE, '');
  return t !== '' && NUMERIC.test(t);
}
