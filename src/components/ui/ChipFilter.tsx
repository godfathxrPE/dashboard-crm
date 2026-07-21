'use client';

import { cn } from '@/lib/utils/cn';

export interface ChipOption {
  label: string;
  value: string;
  count?: number;
}

interface ChipFilterProps {
  options: ChipOption[];
  selected: string[];
  onToggle: (value: string) => void;
  onReset?: () => void;
  /** F-06: пока true — не рендерить count-бейджи (иначе мигают ложным «0» до загрузки) */
  loading?: boolean;
}

export function ChipFilter({ options, selected, onToggle, onReset, loading }: ChipFilterProps) {
  if (options.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {options.map((opt) => {
        const active = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            onClick={() => onToggle(opt.value)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium',
              'border transition-colors duration-150',
              active
                ? 'bg-accent-l border-accent text-accent'
                : 'bg-surface border-input text-text-dim hover:border-accent/50',
            )}
          >
            {opt.label}
            {!loading && opt.count != null && (
              <span className={cn(
                'rounded-full px-1.5 py-0.5 text-xs leading-none',
                active ? 'bg-accent/20' : 'bg-surface2',
              )}>
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
      {selected.length > 0 && onReset && (
        <button
          onClick={onReset}
          className="shrink-0 text-xs text-text-mute hover:text-accent transition-colors"
        >
          Сбросить
        </button>
      )}
    </div>
  );
}
