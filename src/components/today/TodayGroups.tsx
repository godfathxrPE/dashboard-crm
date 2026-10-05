'use client';

import type { MouseEvent } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { pluralRu } from '@/lib/utils/plural';
import { inMovesText, namesText, planItemText } from '@/lib/utils/today-text';
import { TODAY_GROUP_LABELS, TODAY_GROUP_RULES } from '@/lib/constants/today-groups';
import type { TodayDealView, TodayGroupView } from '@/lib/domain/today-model';
import { TodayDealRow } from './TodayDealRow';

/** Группа так, как её рисует экран: что свёрнуто и какие строки видны. */
export interface TodayGroupLayout {
  view: TodayGroupView;
  collapsible: boolean;
  collapsed: boolean;
  /** Видимые строки: открытая группа — до лимита или все; свёрнутая — пусто. */
  rows: TodayDealView[];
  /** Строк скрыто лимитом «Показаны 7 из N». */
  hidden: number;
}

interface TodayGroupsProps {
  loading: boolean;
  total: number;
  noStepAhead: number;
  noAmount: number;
  layout: readonly TodayGroupLayout[];
  onToggleGroup: (key: TodayGroupView['key']) => void;
  onShowAll: (key: TodayGroupView['key']) => void;
  /** Сделка в фокусе. */
  selectedId: string | null;
  onSelect: (id: string, e: MouseEvent) => void;
  kbdIndexOf: (id: string) => number;
  /** ACT-1: сделки, по которым сегодня записан ход. */
  writtenIds: ReadonlySet<string>;
  /** «Разобрать по одной» у свёрнутой «Решить судьбу». */
  onSweep: () => void;
}

function RowSkeleton() {
  return (
    <div className="today-row-grid border-t border-border px-4 py-2.5" aria-hidden="true">
      <div className="pl-5">
        <div className="h-3.5 w-32 animate-pulse rounded bg-surface2" />
        <div className="mt-1.5 h-3 w-2/3 animate-pulse rounded bg-surface2" />
      </div>
      <div className="today-row-sub">
        <div className="ml-auto h-3 w-12 animate-pulse rounded bg-surface2" />
        <div className="ml-auto mt-1.5 h-2.5 w-20 animate-pulse rounded bg-surface2" />
      </div>
      <div className="today-row-sub">
        <div className="h-3 w-28 animate-pulse rounded bg-surface2" />
        <div className="mt-1.5 h-2.5 w-36 animate-pulse rounded bg-surface2" />
      </div>
    </div>
  );
}

/** Итог свёрнутой группы одной строкой. */
function collapsedSummary(g: TodayGroupView): string {
  const note = g.inMoves > 0 ? inMovesText(g.inMoves) : '';
  if (g.key === 'decide') {
    const n = g.rows.length;
    if (n === 0) return note;
    const head = `${n} ${pluralRu(n, 'сделка молчит', 'сделки молчат', 'сделок молчат')} дольше 14 дней: ${namesText(g.rows.map((v) => v.source.name))}`;
    return note ? `${head} · ещё ${note}` : head;
  }
  const items = namesText(g.rows.map(planItemText), ' · ');
  return [items, note].filter(Boolean).join(' · ');
}

function GroupHeading({ layout, onToggle, onSweep }: { layout: TodayGroupLayout; onToggle: () => void; onSweep: () => void }) {
  const g = layout.view;
  const label = (
    <>
      <span className="shrink-0 text-meta font-semibold uppercase tracking-wider text-text-dim">{TODAY_GROUP_LABELS[g.key]}</span>
      <span className="shrink-0 text-meta font-semibold tabular-nums text-text-mute">{g.total}</span>
    </>
  );

  if (layout.collapsible) {
    const sweep = layout.collapsed && g.key === 'decide' && g.rows.length > 0;
    return (
      <div className="flex items-baseline gap-2 border-t border-border pr-4">
        <button
          type="button"
          aria-expanded={!layout.collapsed}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-baseline gap-x-2 py-2.5 pl-4 text-left transition-colors queue-row-hover"
        >
          <ChevronRight
            size={14}
            aria-hidden="true"
            className={cn('shrink-0 self-start mt-0.5 text-text-mute transition-transform', !layout.collapsed && 'rotate-90')}
          />
          {label}
          <span className={cn('min-w-0 flex-1 text-text-dim', layout.collapsed ? 'text-body' : 'text-xs')}>
            {layout.collapsed ? collapsedSummary(g) : TODAY_GROUP_RULES[g.key]}
          </span>
          {!layout.collapsed && g.inMoves > 0 && (
            <span className="shrink-0 text-xs text-text-mute">{inMovesText(g.inMoves)}</span>
          )}
        </button>
        {sweep && (
          <button
            type="button"
            onClick={onSweep}
            className="inline-flex min-h-7 shrink-0 items-center whitespace-nowrap rounded px-1.5 text-xs font-medium text-text-main underline-offset-2 hover:underline"
          >
            Разобрать по одной
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-t border-border px-4 pb-1.5 pt-3">
      {label}
      <span className="text-xs text-text-dim">{TODAY_GROUP_RULES[g.key]}</span>
      <span className="flex-1" />
      {g.inMoves > 0 && <span className="text-xs text-text-mute">{inMovesText(g.inMoves)}</span>}
    </div>
  );
}

/** Список «Сделки в работе»: один лист, группы по типу решения (макет, кадр 1). */
export function TodayGroups({
  loading, total, noStepAhead, noAmount, layout, onToggleGroup, onShowAll, selectedId, onSelect,
  kbdIndexOf, writtenIds, onSweep,
}: TodayGroupsProps) {
  const visibleGroups = layout.filter((l) => l.view.total > 0);

  return (
    <section aria-label="Сделки в работе" className="sheet mb-4 overflow-hidden">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
        <h2 className="text-body font-semibold text-text-main">Сделки в работе</h2>
        {loading ? (
          <span className="h-3 w-36 animate-pulse self-center rounded bg-surface2" aria-hidden="true" />
        ) : total > 0 ? (
          <span className="text-xs text-text-dim">
            {noStepAhead === 0 ? (
              <>у всех <b className="font-semibold text-text-main">{total}</b> шаг впереди</>
            ) : (
              <>у <b className="font-semibold text-text-main">{noStepAhead}</b> из {total} нет шага впереди</>
            )}
          </span>
        ) : null}
        <span className="flex-1" />
        {!loading && noAmount > 0 && (
          <span className="text-xs text-text-dim" title="Сделка без суммы попадает в ходы только как свежий срыв">
            у <b className="font-semibold text-text-main">{noAmount}</b> не указана сумма
          </span>
        )}
      </div>

      <div className="today-row-head today-row-grid border-t border-border px-4 py-1.5 text-meta text-text-mute">
        <span className="pl-5">Сделка и шаг</span>
        <span className="text-right">Сумма · стадия</span>
        <span>Срок шага · что было после</span>
      </div>

      {loading ? (
        <>
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </>
      ) : total === 0 ? (
        <p className="border-t border-border px-4 py-3 text-xs text-text-dim">Открытых сделок нет</p>
      ) : (
        visibleGroups.map((l) => (
          <div key={l.view.key}>
            <GroupHeading layout={l} onToggle={() => onToggleGroup(l.view.key)} onSweep={onSweep} />
            {l.rows.map((v) => (
              <TodayDealRow
                key={v.source.id}
                view={v}
                selected={selectedId === v.source.id}
                onSelect={(e) => onSelect(v.source.id, e)}
                kbdIndex={kbdIndexOf(v.source.id)}
                writtenToday={writtenIds.has(v.source.id)}
              />
            ))}
            {l.hidden > 0 && (
              <div className="border-t border-border px-4 py-2 text-xs text-text-dim">
                Показаны {l.rows.length} из {l.rows.length + l.hidden}.{' '}
                <button
                  type="button"
                  onClick={() => onShowAll(l.view.key)}
                  className="font-medium text-text-main underline-offset-2 hover:underline"
                >
                  Показать все
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </section>
  );
}
