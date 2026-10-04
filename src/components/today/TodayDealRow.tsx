'use client';

import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatBudget } from '@/lib/validators/project';
import { afterText, dueText } from '@/lib/utils/today-text';
import type { TodayDealView } from '@/lib/domain/today-model';

interface TodayDealRowProps {
  view: TodayDealView;
  expanded: boolean;
  onToggle: () => void;
  kbdIndex: number;
  focused: boolean;
}

/**
 * Строка сделки в две линии (макет, кадр 1): название и шаг целиком — без обрезки;
 * сумма и стадия; срок шага и «что было после» словами.
 *
 * Цвет — только у смысла: красный — число дней свежего срыва (`--danger-text`),
 * сигнал риска — `--warning-text`. Точек-маркеров нет. `--accent` для смысла не
 * берётся: в `t-washi` он равен красному.
 */
export function TodayDealRow({ view, expanded, onToggle, kbdIndex, focused }: TodayDealRowProps) {
  const { source, cls } = view;
  const step = source.next_step?.trim();
  const due = dueText(view);
  const after = afterText(view);
  const dimStep = cls.group === 'stale' || cls.group === 'decide';

  return (
    <button
      type="button"
      data-row-index={kbdIndex}
      aria-expanded={expanded}
      onClick={onToggle}
      className={cn(
        'today-row-grid w-full items-start border-t border-border px-4 py-2.5 text-left transition-colors',
        focused ? 'kbd-focus-row' : 'queue-row-hover',
      )}
    >
      <span className="flex min-w-0 gap-1.5">
        <ChevronRight
          size={14}
          aria-hidden="true"
          className={cn('mt-1 shrink-0 text-text-mute transition-transform', expanded && 'rotate-90')}
        />
        <span className="min-w-0">
          <span data-today-name className="block text-[0.9375rem] font-semibold leading-snug text-text-main">
            {source.name}
          </span>
          <span
            data-today-step
            className={cn('mt-0.5 line-clamp-2 text-body', dimStep || !step ? 'text-text-dim' : 'text-text-main')}
          >
            {step || 'Шаг не задан'}
          </span>
        </span>
      </span>

      <span className="today-row-amount today-row-sub block min-w-0">
        {view.amount.amount !== null ? (
          <span className="block text-body font-medium tabular-nums text-text-main">{formatBudget(view.amount.amount)}</span>
        ) : (
          <span
            className="block text-body text-text-mute"
            title="Сумма не указана — в ходы сделка попадает только как свежий срыв"
          >
            —
          </span>
        )}
        {source.stage && <span className="block text-xs text-text-dim">{source.stage.name}</span>}
      </span>

      <span className="today-row-sub block min-w-0">
        <span className="block text-body text-text-main">
          {due.label}
          {due.days && (
            <span className={cn('ml-1.5 font-medium tabular-nums', cls.group === 'fresh' ? 'text-danger-text' : 'text-text-main')}>
              {due.days}
            </span>
          )}
        </span>
        {after && (
          <span className={cn('block text-xs', view.after.kind === 'signals' ? 'text-warning-text' : 'text-text-dim')}>
            {after}
          </span>
        )}
      </span>
    </button>
  );
}
