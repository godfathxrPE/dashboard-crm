'use client';

import type { MouseEvent } from 'react';
import { CalendarClock, Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatBudget } from '@/lib/validators/project';
import { SLOT_KINDS, clockCaption } from '@/lib/utils/today-text';
import type { DecideClock } from '@/lib/domain/decide-clock';
import { DEFAULT_TODAY_THRESHOLDS, type MoveSlot } from '@/lib/domain/today-deals';
import type { TodayDealView } from '@/lib/domain/today-model';

interface TodayMoveTileProps {
  view: TodayDealView;
  slot: MoveSlot;
  /** Номер хода, 1-based. */
  number: number;
  /** Таймер остывания; `state === 'done'` — ход сделан. */
  clock: DecideClock;
  /** Сделка в фокусе — плитка на стекле. */
  selected: boolean;
  /** Клик — в фокус; ⌘/Ctrl или средняя кнопка — карточка сделки в новой вкладке. */
  onSelect: (e: MouseEvent) => void;
  /** Ход сделан — подпись итога; `null` — ход не сделан. «Вернуть» — в шапке фокуса. */
  doneText: string | null;
  kbdIndex: number;
}

/** Радиус дорожки в единицах `viewBox` 56×56: 23 + половина штриха 5 = 25.5 < 28. */
const RING_R = 23;
const RING_C = 2 * Math.PI * RING_R;

function ringLabel(clock: DecideClock, windowDays: number): string {
  if (clock.state === 'done') return 'ход сделан';
  if (clock.basis === 'overdue') return `${clock.days} дн. после срока из ${windowDays}`;
  if (clock.basis === 'silence') return `${clock.days} дн. тишины из ${windowDays}`;
  return 'шаг впереди, таймера нет';
}

function ClockRing({ clock, windowDays }: { clock: DecideClock; windowDays: number }) {
  const showArc = clock.ratio > 0;
  return (
    <span role="img" aria-label={ringLabel(clock, windowDays)} className="today-ring">
      <svg className="today-ring-svg" viewBox="0 0 56 56" aria-hidden="true">
        <circle className="today-ring-track" cx="28" cy="28" r={RING_R} />
        {showArc && (
          <circle
            className="today-ring-arc"
            cx="28"
            cy="28"
            r={RING_R}
            strokeDasharray={`${clock.ratio * RING_C} ${RING_C}`}
          />
        )}
      </svg>
      {clock.state === 'done' ? (
        <Check aria-hidden="true" className="today-ring-check" strokeWidth={2.5} />
      ) : clock.state === 'none' || clock.days === null ? (
        <CalendarClock aria-hidden="true" className="h-5 w-5 text-text-dim" />
      ) : (
        <span aria-hidden="true" className="today-ring-center">
          <span className="today-ring-num">{clock.days}</span>
          <span className="today-ring-unit">дн.</span>
        </span>
      )}
    </span>
  );
}

/**
 * Плитка хода дня (спека `today-focus-spec.md`, §6; макет, кадры 1, 4, 6). Плитка —
 * переключатель фокуса целиком; действия хода и форма живут в шапке фокуса. Кольцо —
 * сколько дней из окна `decideDays` уже прошло до «Решить судьбу».
 *
 * Внутри `<button>` — только фразовые элементы (`span` с `block`), не `p`.
 *
 * Стекло выбранной плитки — `.glass-sheet` и пара `.today-tile.glass-sheet` в
 * `globals.css`; `data-card` не ставить: `.t-aura [data-card]` перебивает стекло.
 */
export function TodayMoveTile({ view, slot, number, clock, selected, onSelect, doneText, kbdIndex }: TodayMoveTileProps) {
  const step = view.source.next_step?.trim();
  const amount = view.amount.amount;
  const done = doneText !== null;
  const windowDays = DEFAULT_TODAY_THRESHOLDS.decideDays;

  return (
    <button
      type="button"
      data-row-index={kbdIndex}
      data-clock={clock.state}
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
      onAuxClick={(e) => { if (e.button === 1) onSelect(e); }}
      className={cn('today-tile', selected && 'glass-sheet')}
    >
      <span className="flex w-full items-start gap-3">
        <ClockRing clock={clock} windowDays={windowDays} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="today-tile-kind text-meta font-semibold uppercase tracking-wide text-text-dim">
            {number} · {SLOT_KINDS[slot]}
          </span>
          <span data-today-name title={view.source.name} className="today-tile-name mt-0.5 text-sm font-semibold leading-snug text-text-main">
            {view.source.name}
          </span>
          {amount !== null ? (
            <span className="mt-0.5 text-body font-semibold tabular-nums text-text-main">{formatBudget(amount)}</span>
          ) : (
            <span className="mt-0.5 text-xs text-text-mute">без суммы</span>
          )}
        </span>
      </span>

      <span
        data-today-step
        className={cn('today-tile-step text-xs leading-snug text-text-dim', done && 'line-through')}
      >
        {step || 'Шаг не задан'}
      </span>

      <span className={cn('today-tile-foot text-meta', done ? 'today-tile-done font-medium' : 'text-text-mute')}>
        {done ? doneText : clockCaption(clock, view)}
      </span>
    </button>
  );
}
