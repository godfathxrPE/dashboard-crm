'use client';

import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { parseNoteBlocks } from '@/lib/text/note-blocks';

// ═══════════════════════════════════════════════════════
// S-DEAL-NOTES-READ-1: плоский текст заметки → читаемые блоки со свёрткой.
//
// Один компонент на плитку «Событие» и строку ленты. Живёт в `components/shared`, а
// не в `lib`: `content` Tailwind сканирует только `src/components` и `src/app`, и
// классы из `src/lib` в сборку не попадают (замер 26.09, см. DealActivityFeed).
//
// ⚠️ Только текстовые узлы React — никакого `dangerouslySetInnerHTML` (XSS-контур S28).
// Цвета — токены; внутри `.glass-sheet` они уже переопределены (`--sheet-*`),
// theme-if в разметке нет.
// ═══════════════════════════════════════════════════════

const FADE_MASK = 'linear-gradient(to bottom, black 70%, transparent)';

export function NoteBody({
  text,
  collapsedLines = 6,
  className,
}: {
  text: string;
  /** Высота свёрнутого вида в строках; 0 — без свёртки. */
  collapsedLines?: number;
  className?: string;
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
          if (b.type === 'heading') {
            return (
              <p
                key={i}
                className="mt-1 text-meta font-semibold uppercase tracking-wide text-text-mute first:mt-0"
              >
                {b.text}
              </p>
            );
          }
          if (b.type === 'paragraph') {
            return (
              <p key={i} className="whitespace-pre-line text-body leading-relaxed text-text-main">
                {b.text}
              </p>
            );
          }
          return (
            <ul key={i} className="space-y-1">
              {b.items.map((item, j) => (
                <li
                  key={j}
                  className="relative pl-3.5 text-body leading-relaxed text-text-main before:absolute
                             before:left-0.5 before:top-[0.65em] before:size-1 before:rounded-full
                             before:bg-text-mute before:content-['']"
                >
                  {item}
                </li>
              ))}
            </ul>
          );
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
          className="mt-1 text-xs font-semibold text-text-dim transition-colors hover:text-text-main"
        >
          {expanded ? 'Свернуть' : 'Развернуть'}
        </button>
      )}
    </div>
  );
}
