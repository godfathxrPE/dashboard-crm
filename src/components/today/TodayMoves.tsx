'use client';

import type { ReactNode } from 'react';
import { pluralRu } from '@/lib/utils/plural';
import type { TodayDealView } from '@/lib/domain/today-model';
import { TodayMoveCard } from './TodayMoveCard';

interface TodayMovesProps {
  moves: readonly TodayDealView[];
  /** Сколько ходов назначено на сегодня (слот `assigned`). */
  assignedCount: number;
  limit: number;
  loading: boolean;
  openId: string | null;
  onToggle: (id: string) => void;
  onPlan: (view: TodayDealView) => void;
  onSnooze: (view: TodayDealView) => void;
  /** Панель открытой карточки — под рядом карточек. */
  panel: ReactNode;
  kbdIndexOf: (id: string) => number;
  activeIndex: number;
}

function CardSkeleton() {
  return (
    <div className="sheet px-4 py-3.5" aria-hidden="true">
      <div className="h-3.5 w-1/2 animate-pulse rounded bg-surface2" />
      <div className="mt-2 h-3.5 w-11/12 animate-pulse rounded bg-surface2" />
      <div className="mt-2 h-2.5 w-2/3 animate-pulse rounded bg-surface2" />
    </div>
  );
}

/** Ходы дня: три карточки (макет, кадр 1). Заголовок стоит и во время загрузки. */
export function TodayMoves({
  moves, assignedCount, limit, loading, openId, onToggle, onPlan, onSnooze, panel, kbdIndexOf, activeIndex,
}: TodayMovesProps) {
  return (
    <section aria-label="Ходы на сегодня" className="mb-6">
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-body font-semibold text-text-main">Ходы на сегодня</h2>
        <span className="text-xs text-text-dim">
          сначала назначенное на сегодня, затем свежие срывы по фазе и сумме, последний — крупнейшая сумма без шага
        </span>
      </div>

      {loading ? (
        <div className="today-cards">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : moves.length === 0 ? (
        <p className="sheet px-4 py-3 text-xs text-text-dim">
          Ходов на сегодня нет: назначенного нет, сорванных и устаревших шагов тоже.
        </p>
      ) : (
        <div className="today-cards">
          {moves.map((v, i) => (
            <TodayMoveCard
              key={v.source.id}
              view={v}
              slot={v.slot ?? 'fill'}
              number={i + 1}
              primary={i === 0}
              expanded={openId === v.source.id}
              onToggle={() => onToggle(v.source.id)}
              onPlan={() => onPlan(v)}
              onSnooze={() => onSnooze(v)}
              kbdIndex={kbdIndexOf(v.source.id)}
              focused={activeIndex === kbdIndexOf(v.source.id)}
            />
          ))}
        </div>
      )}

      {!loading && assignedCount > limit && (
        <p className="mt-2 text-xs text-text-dim">
          На сегодня назначено {assignedCount} {pluralRu(assignedCount, 'шаг', 'шага', 'шагов')} при лимите {limit}. Показаны все.
        </p>
      )}

      {panel && <div className="mt-3">{panel}</div>}
    </section>
  );
}
