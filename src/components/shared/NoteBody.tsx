'use client';

import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { parseNoteBlocks, type NoteBlock } from '@/lib/text/note-blocks';
import { parseInline } from '@/lib/text/note-inline';

// ═══════════════════════════════════════════════════════
// S-DEAL-NOTES-READ-1: плоский текст заметки → читаемые блоки со свёрткой.
//
// Один компонент на плитку «Событие» и строку ленты. Живёт в `components/shared`, а
// не в `lib`: `content` Tailwind сканирует только `src/components` и `src/app`, и
// классы из `src/lib` в сборку не попадают (замер 26.09, см. DealActivityFeed).
//
// ⚠️ Только узлы React — сырой HTML в разметку не попадает ни при каких условиях (XSS-контур S28).
// S-NOTES-2.2: инлайн-разметка (`**x**`, `*x*`, `[a](b)`) собирается из узлов
// `parseInline` — те же React-элементы, схемы ссылок режет сам парсер.
// Цвета — токены; внутри `.glass-sheet` они уже переопределены (`--sheet-*`),
// theme-if в разметке нет.
// ═══════════════════════════════════════════════════════

const FADE_MASK = 'linear-gradient(to bottom, black 70%, transparent)';

/**
 * Заголовок заметки: `###` и эвристика плоского текста — мелкая подпись капителью (как
 * раньше), `#` и `##` — обычный текст заметки, но жирнее. Не `<h1>`: страница уже имеет
 * свою иерархию, а заметка живёт внутри карточки ленты.
 */
const HEADING_CLASS: Record<1 | 2 | 3, string> = {
  1: 'mt-1 text-base font-semibold text-text-main first:mt-0',
  2: 'mt-1 text-body font-semibold text-text-main first:mt-0',
  3: 'mt-1 text-meta font-semibold uppercase tracking-wide text-text-mute first:mt-0',
};

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((n, i) => {
        if (n.t === 'strong') return <strong key={i} className="font-semibold">{n.v}</strong>;
        if (n.t === 'em') return <em key={i}>{n.v}</em>;
        if (n.t === 'link') {
          return (
            <a
              key={i}
              href={n.href}
              target="_blank"
              rel="noopener noreferrer"
              // Строка ленты сама кликабельна — переход по ссылке её не раскрывает.
              onClick={(e) => e.stopPropagation()}
              className="text-text-main underline decoration-text-mute underline-offset-2
                         transition-colors hover:decoration-text-main"
            >
              {n.v}
            </a>
          );
        }
        return n.v;
      })}
    </>
  );
}

const ALIGN_CLASS = { left: 'text-left', center: 'text-center', right: 'text-right' } as const;

/**
 * GFM-таблица. Широкая таблица прокручивается внутри карточки, с клавиатуры — фокус на
 * обёртке и стрелки. Без зебры и вертикальных линий: только нижние границы строк.
 * Числовая колонка (`right`) не переносится.
 */
function NoteTable({ block }: { block: Extract<NoteBlock, { type: 'table' }> }) {
  const cell = (c: number) =>
    cn('px-2 py-1 align-top first:pl-0', ALIGN_CLASS[block.align[c]], block.align[c] === 'right' && 'whitespace-nowrap');
  return (
    <div
      role="region"
      aria-label="Таблица"
      tabIndex={0}
      className="max-w-full overflow-x-auto rounded-sm focus-visible:outline-none focus-visible:ring-2
                 focus-visible:ring-accent"
    >
      <table className="note-table w-max min-w-full border-collapse text-body tabular-nums">
        <thead>
          <tr className="border-b border-border">
            {block.header.map((h, c) => (
              <th key={c} scope="col" className={cn(cell(c), 'text-meta font-semibold text-text-mute')}>
                <Inline text={h} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, r) => (
            <tr key={r} className="border-b border-border last:border-b-0">
              {row.map((v, c) => (
                <td key={c} className={cn(cell(c), 'text-text-main')}>
                  <Inline text={v} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function NoteBody({
  text,
  collapsedLines = 6,
  className,
  expandLabel = 'Развернуть',
  collapseLabel = 'Свернуть',
}: {
  text: string;
  /** Высота свёрнутого вида в строках; 0 — без свёртки. */
  collapsedLines?: number;
  className?: string;
  /** S-NOTES-2.1: подписи кнопки (лента сделки — «Показать полностью»). */
  expandLabel?: string;
  collapseLabel?: string;
}) {
  const blocks = useMemo(() => parseNoteBlocks(text), [text]);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const collapsible = collapsedLines > 0;

  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const collapsed = collapsible && !expanded;

  // Нужна ли кнопка — мерим, а не гадаем по длине текста: перенос строк зависит от
  // ширины колонки. Меряем только в свёрнутом виде (в раскрытом scrollHeight ===
  // clientHeight и замер дал бы «не переполнено»); последний результат хранится,
  // поэтому у раскрытой заметки кнопка «Свернуть» остаётся.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !collapsed) return;
    const measure = () => setOverflowing(el.scrollHeight > el.clientHeight + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [collapsed, blocks, collapsedLines]);

  if (blocks.length === 0) return null;

  const faded = collapsed && overflowing;

  return (
    <div className={className}>
      <div
        ref={ref}
        id={id}
        className={cn('flex flex-col gap-2 text-body leading-relaxed', collapsed && 'overflow-hidden')}
        style={{
          ...(collapsed ? { maxHeight: `${collapsedLines}lh` } : {}),
          ...(faded ? { maskImage: FADE_MASK, WebkitMaskImage: FADE_MASK } : {}),
        }}
      >
        {blocks.map((b, i) => {
          switch (b.type) {
            case 'heading':
              return (
                <p key={i} role="heading" aria-level={b.level + 3} className={HEADING_CLASS[b.level]}>
                  <Inline text={b.text} />
                </p>
              );
            case 'paragraph':
              return (
                <p key={i} className="whitespace-pre-line text-body leading-relaxed text-text-main">
                  <Inline text={b.text} />
                </p>
              );
            case 'olist':
              return (
                <ol key={i} className="list-decimal space-y-1 pl-5 marker:text-text-mute">
                  {b.items.map((item, j) => (
                    <li key={j} className="pl-0.5 text-body leading-relaxed text-text-main">
                      <Inline text={item} />
                    </li>
                  ))}
                </ol>
              );
            case 'list':
              return (
                <ul key={i} className="space-y-1">
                  {b.items.map((item, j) => (
                    <li
                      key={j}
                      className="relative pl-3.5 text-body leading-relaxed text-text-main before:absolute
                                 before:left-0.5 before:top-[0.65em] before:size-1 before:rounded-full
                                 before:bg-text-mute before:content-['']"
                    >
                      <Inline text={item} />
                    </li>
                  ))}
                </ul>
              );
            case 'table':
              return <NoteTable key={i} block={b} />;
            default: {
              const _exhaustive: never = b;
              return _exhaustive;
            }
          }
        })}
      </div>

      {collapsible && (overflowing || expanded) && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={(e) => {
            // Строка ленты сама кликабельна — раскрытие заметки её не переключает.
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="mt-1 rounded-sm text-xs font-semibold text-text-dim transition-colors hover:text-text-main
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {expanded ? collapseLabel : expandLabel}
        </button>
      )}
    </div>
  );
}
