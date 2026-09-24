'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * S-DEAL-CONTACT-1: «копировать» → на 1.5 с «скопировано», тоста нет.
 *
 * Ширина не прыгает: обе подписи лежат в одной ячейке grid, невидимая держит
 * размер — кнопка всегда шириной с длинную. Фиксированный `min-width` в rem
 * разошёлся бы с кеглем темы.
 *
 * `iconOnly` — квадрат с иконкой для групп действий: подпись уходит в `aria-label`,
 * «скопировано» показывает смена иконки на галочку.
 *
 * ⚠️ `className` склеивается строкой, НЕ через `cn`: tailwind-merge принимает
 * проектные кегли `text-meta`/`text-body` за цвет и выкидывает их рядом с
 * `text-text-*`, а вызывающие передают именно такие пары.
 *
 * Clipboard недоступен (http, запрет браузера) — тихо игнорируем, как в
 * `TranscriptViewModal`: подпись просто не сменится.
 */
export function CopyButton({
  value,
  className,
  iconSize = 10,
  title,
  iconOnly = false,
}: {
  value: string;
  className?: string;
  iconSize?: number;
  title?: string;
  iconOnly?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard недоступен — тихо игнорируем */ }
  }

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={copy}
        title={copied ? 'Скопировано' : title}
        aria-label={copied ? 'Скопировано' : title}
        className={`inline-flex shrink-0 items-center justify-center ${className ?? ''}`}
      >
        {copied ? <Check size={iconSize} aria-hidden /> : <Copy size={iconSize} aria-hidden />}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap ${className ?? ''}`}
    >
      <Copy size={iconSize} aria-hidden />
      <span className="grid" aria-live="polite">
        <span className={cn('col-start-1 row-start-1', copied && 'invisible')}>копировать</span>
        <span className={cn('col-start-1 row-start-1', !copied && 'invisible')}>скопировано</span>
      </span>
    </button>
  );
}
