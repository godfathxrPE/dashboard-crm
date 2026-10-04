'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
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
  /** Ход сделан — подпись итога и «Вернуть»; `null` — ход не сделан. */
  doneOf: (view: TodayDealView) => { text: string; onRestore?: () => void; restoring?: boolean } | null;
  renderActions: (view: TodayDealView, extra: ReactNode) => ReactNode;
  /** Все ходы набора сделаны — карточки свёрнуты в строку. */
  allDone: boolean;
  /** «Взять ещё ход»; `null` — кандидатов нет, кнопки нет. */
  onTakeMore: (() => void) | null;
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

/**
 * Ходы дня (макет, кадры 1, 5, 10). Заголовок стоит и во время загрузки. Все ходы
 * набора сделаны — карточки сворачиваются в строку: лимит защищает день, следующий
 * ход берётся только кнопкой.
 */
export function TodayMoves({
  moves, assignedCount, limit, loading, openId, onToggle, doneOf, renderActions, allDone, onTakeMore, panel,
  kbdIndexOf, activeIndex,
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
      ) : allDone ? (
        <div className="sheet flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-text-main">
              {moves.length} из {moves.length} {pluralRu(moves.length, 'хода', 'ходов', 'ходов')} сделано
            </p>
            <p className="text-xs text-text-dim">
              {moves.map((v) => v.source.name).join(', ')} — шаги записаны в сделки
            </p>
          </div>
          {onTakeMore && (
            <Button size="sm" variant="secondary" onClick={onTakeMore} className="whitespace-nowrap">
              Взять ещё ход
            </Button>
          )}
        </div>
      ) : (
        <div className="today-cards">
          {moves.map((v, i) => (
            <TodayMoveCard
              key={v.source.id}
              view={v}
              slot={v.slot ?? 'fill'}
              number={i + 1}
              expanded={openId === v.source.id}
              onToggle={() => onToggle(v.source.id)}
              done={doneOf(v)}
              renderActions={(extra) => renderActions(v, extra)}
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

      {panel && !allDone && <div className="mt-3">{panel}</div>}
    </section>
  );
}
