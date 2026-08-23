'use client';

import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

// ═══════════════════════════════════════════════════════
// Сегментированный переключатель — ОДИН на приложение.
//
// До S-TR-CREATE-1-UI жил в трёх копиях (фильтры раздела «Транскрипты», выбор
// «Звонок/Встреча» и «Вставить/Аудио/Файл» в мастере) с разными радиусами: контейнер
// `rounded-lg`, активный сегмент `rounded-md` — прямоугольник внутри скруглённой рамки.
// Форма чипов в проекте — пилюля (`ChipFilter`, `SavedViewChips`, бейджи), поэтому
// сегмент теперь тоже `rounded-full`: активный элемент повторяет форму контейнера.
//
// Правило: новый сегментированный выбор берёт ЭТОТ компонент. Копия = расхождение
// радиусов в следующем спринте.
// ═══════════════════════════════════════════════════════

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  /** Иконка слева от подписи — опциональна (у фильтров её нет, у «Звонок/Встреча» есть). */
  icon?: LucideIcon;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex items-center rounded-full border border-border bg-surface p-0.5',
        className,
      )}
    >
      {options.map(({ value: v, label, icon: Icon }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent',
            value === v
              ? 'bg-accent-l text-accent'
              : 'text-text-dim hover:bg-surface-hover hover:text-text-main',
          )}
        >
          {Icon ? <Icon size={13} /> : null}
          {label}
        </button>
      ))}
    </div>
  );
}
