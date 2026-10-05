'use client';

import type { MouseEvent } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatBudget } from '@/lib/validators/project';
import { afterText, dueText } from '@/lib/utils/today-text';
import type { TodayDealView } from '@/lib/domain/today-model';

interface TodayDealRowProps {
  view: TodayDealView;
  /** Сделка в фокусе. */
  selected: boolean;
  /** Клик — в фокус; ⌘/Ctrl или средняя кнопка — карточка сделки в новой вкладке. */
  onSelect: (e: MouseEvent) => void;
  kbdIndex: number;
  /** ACT-1: по сделке сегодня записан ход — строка стоит на месте до перезагрузки. */
  writtenToday?: boolean;
}

/**
 * Строка сделки в две линии (макет, кадр 1): название и шаг целиком — без обрезки;
 * сумма и стадия; срок шага и «что было после» словами.
 *
 * Цвет — только у смысла: красный — число дней свежего срыва (`--danger-text`),
 * сигнал риска — `--warning-text`. Точек-маркеров нет. `--accent` для смысла не
 * берётся: в `t-washi` он равен красному.
 *
 * S-TODAY-FOCUS-1: строка не раскрывается — клик выбирает сделку в фокус. Шеврон
 * пока стоит: его снимает S2 вместе с новой сеткой строки.
 */
export function TodayDealRow({ view, selected, onSelect, kbdIndex, writtenToday }: TodayDealRowProps) {
  const { source, cls } = view;
  const step = source.next_step?.trim();
  const due = dueText(view);
  const after = afterText(view);
  const dimStep = cls.group === 'stale' || cls.group === 'decide';

  return (
    <button
      type="button"
      data-row-index={kbdIndex}
      data-today-pick
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
      onAuxClick={(e) => { if (e.button === 1) onSelect(e); }}
      className={cn(
        'today-row-grid w-full items-start border-t border-border px-4 py-2.5 text-left transition-colors',
        !selected && 'queue-row-hover',
      )}
    >
      <span className="flex min-w-0 gap-1.5">
        <ChevronRight
          size={14}
          aria-hidden="true"
          className="mt-1 shrink-0 text-text-mute"
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
        {writtenToday ? (
          <span className="block text-xs text-success-text">записано сегодня</span>
        ) : after && (
          <span className={cn('block text-xs', view.after.kind === 'signals' ? 'text-warning-text' : 'text-text-dim')}>
            {after}
          </span>
        )}
      </span>
    </button>
  );
}
