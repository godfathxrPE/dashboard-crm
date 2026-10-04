'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';
import { useFieldMoves } from '@/lib/hooks/use-stage-story';
import { formatBudget } from '@/lib/validators/project';
import { moveWhy } from '@/lib/utils/today-text';
import type { MoveSlot } from '@/lib/domain/today-deals';
import type { TodayDealView } from '@/lib/domain/today-model';

interface TodayMoveCardProps {
  view: TodayDealView;
  slot: MoveSlot;
  /** Номер в круге, 1-based. */
  number: number;
  expanded: boolean;
  onToggle: () => void;
  /** Ход сделан: подпись итога и «Вернуть» (пока итог в памяти экрана). */
  done: { text: string; onRestore?: () => void; restoring?: boolean } | null;
  /** Ряд действий (`TodayStepActions`); `extra` — «Подробнее» этой карточки. */
  renderActions: (extra: ReactNode) => ReactNode;
  kbdIndex: number;
  focused: boolean;
}

/**
 * Карточка хода дня (макет, кадры 1, 4, 5). Действия — `TodayStepActions`: кнопки по
 * таблице хода или форма на месте. Сделанный ход остаётся карточкой: номер зелёный,
 * шаг зачёркнут, вместо кнопок — итог записи.
 *
 * `useFieldMoves` зовётся здесь, а не в контейнере: запросов переносов ровно столько,
 * сколько карточек (до трёх), а не по одному на каждую сделку экрана.
 */
export function TodayMoveCard({
  view, slot, number, expanded, onToggle, done, renderActions, kbdIndex, focused,
}: TodayMoveCardProps) {
  const { data: moves } = useFieldMoves(view.source.id);
  const why = moveWhy(view, slot, moves?.step.count ?? 0);
  const step = view.source.next_step?.trim();
  const amount = view.amount.amount;
  const toggle = (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={onToggle}
          className="inline-flex min-h-7 items-center whitespace-nowrap rounded px-1.5 text-xs text-text-dim transition-colors hover:bg-surface2 hover:text-text-main"
        >
          {expanded ? 'Свернуть' : 'Подробнее'}
        </button>
      );

  return (
    <article
      data-row-index={kbdIndex}
      className={cn('sheet flex flex-col px-4 py-3.5', focused && 'kbd-focus-row')}
    >
      <div className="flex items-start gap-2">
        <span
          aria-hidden="true"
          className={cn(
            'mt-0.5 inline-flex h-[1.125rem] w-[1.125rem] shrink-0 items-center justify-center rounded-full border text-meta tabular-nums',
            done ? 'border-success font-semibold text-success' : 'border-border text-text-dim',
          )}
        >
          {number}
        </span>
        <span data-today-name className="min-w-0 flex-1 text-[0.9375rem] font-semibold leading-snug text-text-main">
          {view.source.name}
        </span>
        {amount !== null ? (
          <span className="shrink-0 text-body font-medium tabular-nums text-text-main">{formatBudget(amount)}</span>
        ) : (
          <span className="shrink-0 text-body text-text-mute" title="Сумма не указана">—</span>
        )}
      </div>

      <p
        data-today-step
        className={cn(
          'mt-2 line-clamp-2 text-[0.9375rem] font-medium leading-snug',
          step ? 'text-text-main' : 'text-text-dim',
          done && 'text-text-dim line-through',
        )}
      >
        {step || 'Шаг не задан'}
      </p>

      <p className="mt-1.5 text-xs text-text-dim">
        <b className="font-semibold text-text-main">{why.lead}</b>{' '}
        {why.due && (
          <>
            {why.due.text}
            {why.due.days && <span className="font-medium text-danger-text">{why.due.days}</span>}
            {why.due.daysTail}
            {why.facts.length > 0 && ' · '}
          </>
        )}
        {why.facts.join(' · ')}
      </p>

      <div className="mt-auto pt-3">
        {done ? (
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="text-xs font-medium text-success-text">{done.text}</span>
            {done.onRestore && (
              <button
                type="button"
                disabled={done.restoring}
                onClick={done.onRestore}
                className="inline-flex min-h-7 items-center whitespace-nowrap rounded px-1.5 text-xs text-text-dim transition-colors hover:bg-surface2 hover:text-text-main disabled:opacity-50"
              >
                Вернуть
              </button>
            )}
            <span className="ml-auto">{toggle}</span>
          </div>
        ) : (
          renderActions(toggle)
        )}
      </div>
    </article>
  );
}
