'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export interface RowMarker {
  /** заполненная точка = срочно/просрочено; контурная = ожидает */
  filled: boolean;
  /** CSS-переменная цвета, напр. 'var(--red-text, var(--red))' */
  color: string;
  title?: string;
}

interface QueueRowProps {
  marker?: RowMarker;
  title: string;
  subtitle?: ReactNode;
  /** правый блок с датой/временем */
  meta?: ReactNode;
  onOpen: () => void;
  primary?: { label: string; onClick: () => void };
  secondary?: { label: string; onClick: () => void };
  /** Позиция в плоской очереди для j/k (Sprint W2d) */
  kbdIndex?: number;
  focused?: boolean;
}

/**
 * Строка очереди «Сегодня». Три зоны: тело (переход к сущности),
 * secondary (напр. «на завтра»), primary (главное действие).
 * Действия останавливают всплытие, чтобы не триггерить переход.
 */
export function QueueRow({ marker, title, subtitle, meta, onOpen, primary, secondary, kbdIndex, focused }: QueueRowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      data-row-index={kbdIndex}
      aria-selected={focused}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className={cn(
        'group -mx-2 flex cursor-pointer items-center gap-3 rounded-lg border-b border-border/60 px-2 py-2.5 transition-colors',
        focused ? 'kbd-focus-row' : 'queue-row-hover',
      )}
    >
      {marker && (
        <span
          title={marker.title}
          className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
          style={marker.filled ? { backgroundColor: marker.color } : { border: `1px solid ${marker.color}` }}
        />
      )}

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-text-main">{title}</div>
        {subtitle && <div className="truncate text-xs text-text-dim">{subtitle}</div>}
      </div>

      {meta && <div className="shrink-0 text-xs tabular-nums text-text-mute">{meta}</div>}

      <div className="flex shrink-0 items-center gap-1">
        {secondary && (
          /* F-12: hover|focus, не теряется при kbd-навигации (`focused`) */
          <button
            onClick={(e) => { e.stopPropagation(); secondary.onClick(); }}
            className={cn(
              'rounded px-2 py-1 text-xs text-text-mute opacity-0 transition-opacity hover:text-text-main',
              'group-hover:opacity-100 focus-within:opacity-100',
              focused && 'opacity-100',
            )}
          >
            {secondary.label}
          </button>
        )}
        {primary && (
          <button
            onClick={(e) => { e.stopPropagation(); primary.onClick(); }}
            className="rounded border border-border px-2.5 py-1 text-xs font-medium text-text-dim
                       transition-colors hover:border-accent hover:bg-accent-l hover:text-accent"
          >
            {primary.label}
          </button>
        )}
      </div>
    </div>
  );
}
