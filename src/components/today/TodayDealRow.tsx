'use client';

import type { MouseEvent } from 'react';
import { TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatBudget } from '@/lib/validators/project';
import { rowPill } from '@/lib/utils/today-text';
import type { TodayDealView } from '@/lib/domain/today-model';

interface TodayDealRowProps {
  view: TodayDealView;
  /** Сделка в фокусе — язычок выходит из-под листа. */
  selected: boolean;
  /** Клик — в фокус; ⌘/Ctrl или средняя кнопка — карточка сделки в новой вкладке. */
  onSelect: (e: MouseEvent) => void;
  kbdIndex: number;
  /** Ключ сегодняшнего дня — для «сегодня» / «через N дн.» у риска. */
  todayKey: string;
  /** ACT-1: по сделке сегодня записан ход — плашка показывает новый шаг. */
  written: { nextDateKey: string | null } | null;
}

const PILL_TONE: Record<ReturnType<typeof rowPill>['tone'], string> = {
  hot: 'bg-danger-l text-danger-text',
  risk: 'today-pill-risk text-text-main',
  plain: 'bg-surface2 text-text-dim',
  done: 'bg-success-l text-success-text',
};

/**
 * Строка сделки (S-TODAY-FOCUS-2, спека §5; макет, кадр 2): слева название и шаг,
 * справа сумма и плашка `rowPill`. Стадия и «что было после срока» живут в фокусе.
 *
 * Выбор — язычок `.today-tab`: он есть в КАЖДОЙ строке, видимость задаёт CSS по
 * `aria-current`. Так уходящий язычок успевает доиграть анимацию — условный рендер
 * одного язычка убрал бы старый мгновенно. Фон строки при выборе не меняется: один
 * факт — один маркер.
 */
export function TodayDealRow({ view, selected, onSelect, kbdIndex, todayKey, written }: TodayDealRowProps) {
  const { source, cls } = view;
  const step = source.next_step?.trim();
  const dimStep = cls.group === 'stale' || cls.group === 'decide' || !step;
  const pill = rowPill(view, todayKey, written);
  const amount = view.amount.amount;

  return (
    <button
      type="button"
      data-row-index={kbdIndex}
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
      onAuxClick={(e) => { if (e.button === 1) onSelect(e); }}
      className="today-row text-left"
    >
      <span className="today-tab" aria-hidden="true" />
      <span className="min-w-0">
        <span data-today-name className="block text-sm font-semibold leading-[1.35] text-text-main">{source.name}</span>
        <span data-today-step className={cn('mt-0.5 line-clamp-2 text-[0.8125rem] leading-snug', dimStep ? 'text-text-dim' : 'text-text-main')}>
          {step || 'Шаг не задан'}
        </span>
      </span>

      <span className="flex flex-col items-end gap-1 text-right">
        {amount !== null ? (
          <span className="text-[0.8125rem] font-medium leading-[1.35] tabular-nums text-text-main">{formatBudget(amount)}</span>
        ) : (
          <span className="text-xs text-text-mute">без суммы</span>
        )}
        <span
          className={cn('today-pill', PILL_TONE[pill.tone])}
          title={pill.title ?? undefined}
        >
          {pill.tone === 'risk' && <TriangleAlert aria-hidden="true" className="h-3 w-3 shrink-0 text-warning-text" />}
          {pill.text}
        </span>
        {pill.tone === 'done' && <span className="text-meta text-success-text">записано сегодня</span>}
      </span>
    </button>
  );
}
