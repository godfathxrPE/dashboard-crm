'use client';

import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils/cn';
import { QueueRow } from './QueueRow';

/** Строка раскрытого чипа — существующий `QueueRow` с ключом для очереди клавиш. */
export type OffDealRow = { key: string } & Omit<ComponentProps<typeof QueueRow>, 'kbdIndex' | 'focused'>;

export interface OffDealChip {
  key: string;
  label: string;
  /** Счётчик на чипе; у «Остывают» он общий, а строк — первые пять. */
  count: number;
  rows: OffDealRow[];
}

interface TodayOffDealsProps {
  chips: readonly OffDealChip[];
  openKey: string | null;
  onToggle: (key: string) => void;
  kbdIndexOf: (rowKey: string) => number;
  activeIndex: number;
}

/**
 * «Не сделки» — чипы под списком (макет, кадр 1). Правила отбора — прежние, из
 * старого `TodayView`; задачи, звонки и встречи сделок экрана сюда не попадают — они
 * внутри сделки, в «Сейчас». Чип с нулём не рисуется, открыт один список.
 */
export function TodayOffDeals({ chips, openKey, onToggle, kbdIndexOf, activeIndex }: TodayOffDealsProps) {
  const visible = chips.filter((c) => c.count > 0);
  if (visible.length === 0) return null;
  const open = visible.find((c) => c.key === openKey) ?? null;

  return (
    <section aria-label="Не сделки" className="mb-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-text-dim">Не сделки:</span>
        {visible.map((c) => (
          <button
            key={c.key}
            type="button"
            aria-expanded={openKey === c.key}
            onClick={() => onToggle(c.key)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs transition-colors',
              openKey === c.key
                ? 'border-border2 bg-surface2 text-text-main'
                : 'border-border text-text-dim hover:bg-surface2 hover:text-text-main',
            )}
          >
            {c.label} <b className="font-semibold tabular-nums text-text-main">{c.count}</b>
          </button>
        ))}
      </div>

      {open && (
        <div className="sheet mt-2 overflow-hidden">
          <div className="px-4 py-1 [&>*:last-child]:border-b-0">
            {open.rows.map(({ key, ...row }) => (
              <QueueRow key={key} {...row} kbdIndex={kbdIndexOf(key)} focused={activeIndex === kbdIndexOf(key)} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
