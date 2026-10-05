'use client';

import type { MouseEvent } from 'react';
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
  /** Сделка в фокусе. */
  selected: boolean;
  /** Клик — в фокус; ⌘/Ctrl или средняя кнопка — карточка сделки в новой вкладке. */
  onSelect: (e: MouseEvent) => void;
  /** Ход сделан — подпись итога; `null` — ход не сделан. «Вернуть» — в шапке фокуса. */
  doneText: string | null;
  kbdIndex: number;
}

/**
 * Карточка хода дня (макет V3, кадры 1, 4, 5). S-TODAY-FOCUS-1: карточка — кнопка
 * выбора целиком; действия хода и форма живут в шапке фокуса. Сделанный ход остаётся
 * карточкой: номер зелёный, шаг зачёркнут, внизу — итог записи.
 *
 * Внутри `<button>` — только фразовые элементы (`span` с `block`), не `p`.
 *
 * `useFieldMoves` зовётся здесь, а не в контейнере: запросов переносов ровно столько,
 * сколько карточек (до трёх), а не по одному на каждую сделку экрана.
 */
export function TodayMoveCard({ view, slot, number, selected, onSelect, doneText, kbdIndex }: TodayMoveCardProps) {
  const { data: moves } = useFieldMoves(view.source.id);
  const why = moveWhy(view, slot, moves?.step.count ?? 0);
  const step = view.source.next_step?.trim();
  const amount = view.amount.amount;
  const done = doneText !== null;

  return (
    <button
      type="button"
      data-row-index={kbdIndex}
      data-today-pick
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
      onAuxClick={(e) => { if (e.button === 1) onSelect(e); }}
      className={cn('sheet flex flex-col px-4 py-3.5 text-left transition-colors', !selected && 'queue-row-hover')}
    >
      <span className="flex w-full items-start gap-2">
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
      </span>

      <span
        data-today-step
        className={cn(
          'mt-2 line-clamp-2 text-[0.9375rem] font-medium leading-snug',
          step ? 'text-text-main' : 'text-text-dim',
          done && 'text-text-dim line-through',
        )}
      >
        {step || 'Шаг не задан'}
      </span>

      <span className="mt-1.5 block text-xs text-text-dim">
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
      </span>

      {done && (
        <span className="mt-auto block pt-3 text-xs font-medium text-success-text">{doneText}</span>
      )}
    </button>
  );
}
