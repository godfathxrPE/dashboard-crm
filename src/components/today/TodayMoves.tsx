'use client';

import type { CSSProperties, MouseEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils/cn';
import { pluralRu } from '@/lib/utils/plural';
import { decideClock } from '@/lib/domain/decide-clock';
import { DEFAULT_TODAY_THRESHOLDS } from '@/lib/domain/today-deals';
import type { TodayDealView } from '@/lib/domain/today-model';
import { TodayMoveTile } from './TodayMoveTile';

interface TodayMovesProps {
  moves: readonly TodayDealView[];
  /** Сколько ходов назначено на сегодня (слот `assigned`). */
  assignedCount: number;
  limit: number;
  loading: boolean;
  /** «Сейчас» экрана — от него считается таймер остывания; `null` — до первого тика. */
  now: Date | null;
  /** Сделка в фокусе. */
  selectedId: string | null;
  onSelect: (id: string, e: MouseEvent) => void;
  /** Ход сделан — подпись итога; `null` — ход не сделан. */
  doneOf: (view: TodayDealView) => { text: string } | null;
  /** «Взять ещё ход»; `null` — кандидатов нет, кнопки нет. */
  onTakeMore: (() => void) | null;
  kbdIndexOf: (id: string) => number;
}

/** Плиток в строке не больше четырёх; с пятой — перенос (решение владельца 05.10). */
const TILES_PER_ROW = 4;

function TileSkeleton() {
  return (
    <div className="today-tile today-tile-skeleton" aria-hidden="true">
      <span className="flex w-full items-start gap-3">
        <span className="today-ring rounded-full bg-surface2" />
        <span className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
          <span className="h-2.5 w-1/2 animate-pulse rounded bg-surface2" />
          <span className="h-3.5 w-11/12 animate-pulse rounded bg-surface2" />
          <span className="h-3 w-1/3 animate-pulse rounded bg-surface2" />
        </span>
      </span>
    </div>
  );
}

/**
 * Ходы дня — полоса над списком (спека `today-focus-spec.md`, §6; F-16, F-17). Плитка —
 * переключатель фокуса; все ходы сделаны — плитки остаются: иначе сделанный ход не
 * выбрать и «Вернуть» в шапке фокуса недоступно. Следующий ход — только кнопкой.
 */
export function TodayMoves({
  moves, assignedCount, limit, loading, now, selectedId, onSelect, doneOf, onTakeMore, kbdIndexOf,
}: TodayMovesProps) {
  const doneCount = moves.filter((v) => doneOf(v) !== null).length;
  const setDone = moves.length > 0 && doneCount === moves.length;
  const showProgress = !loading && moves.length > 0;
  const tiles = loading ? 3 : Math.min(moves.length, TILES_PER_ROW);

  return (
    <section aria-label="Ходы на сегодня" className="today-band">
      <div className="today-band-head">
        <h2 className="text-sm font-semibold text-text-main">Ходы на сегодня</h2>
        {showProgress && (
          <>
            <span className="flex gap-1" aria-hidden="true">
              {moves.map((v) => (
                <span key={v.source.id} className={cn('today-band-seg', doneOf(v) !== null && 'today-band-seg-done')} />
              ))}
            </span>
            <span className="text-xs text-text-main">
              <b className="font-semibold tabular-nums">{doneCount}</b> из {moves.length} сделано
            </span>
          </>
        )}
        {setDone && onTakeMore ? (
          <Button size="sm" variant="secondary" onClick={onTakeMore} className="ml-auto whitespace-nowrap">
            Взять ещё ход
          </Button>
        ) : (
          showProgress && (
            <span className="today-band-hint text-xs text-text-dim">
              кольцо — {DEFAULT_TODAY_THRESHOLDS.decideDays} дней срыва до «Решить судьбу»
            </span>
          )
        )}
      </div>

      {loading || moves.length > 0 ? (
        <div
          className="today-tiles"
          data-tiles={tiles}
          style={{ '--tiles': tiles } as CSSProperties}
        >
          {/* Модели без часов не бывает; `!now` — ради типа аргумента таймера. */}
          {loading || !now
            ? [0, 1, 2].map((i) => <TileSkeleton key={i} />)
            : moves.map((v, i) => {
                const done = doneOf(v);
                return (
                  <TodayMoveTile
                    key={v.source.id}
                    view={v}
                    slot={v.slot ?? 'fill'}
                    number={i + 1}
                    clock={decideClock(v, now, done !== null)}
                    selected={selectedId === v.source.id}
                    onSelect={(e) => onSelect(v.source.id, e)}
                    doneText={done?.text ?? null}
                    kbdIndex={kbdIndexOf(v.source.id)}
                  />
                );
              })}
        </div>
      ) : (
        <p className="px-1 text-xs text-text-dim">
          Ходов на сегодня нет: назначенного нет, сорванных и устаревших шагов тоже.
        </p>
      )}

      {!loading && assignedCount > limit && (
        <p className="mt-2 px-1 text-xs text-text-dim">
          На сегодня назначено {assignedCount} {pluralRu(assignedCount, 'шаг', 'шага', 'шагов')} при лимите {limit}. Показаны все.
        </p>
      )}
    </section>
  );
}
