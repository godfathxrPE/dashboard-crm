'use client';

import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { AlarmClock, CalendarDays, ChevronRight, Pencil, Scale, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { inMovesText, rowPill } from '@/lib/utils/today-text';
import { TODAY_GROUP_LABELS, TODAY_GROUP_RULES } from '@/lib/constants/today-groups';
import type { TodayGroup } from '@/lib/domain/today-deals';
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
  /** Ключ сегодняшнего дня — для плашки `rowPill`. */
  todayKey: string;
  /** ACT-1: ход по сделке записан сегодня — день нового шага; `null` — не записан. */
  writtenOf: (id: string) => { nextDateKey: string | null } | null;
  /** «Разобрать по одной» у свёрнутой «Решить судьбу». */
  onSweep: () => void;
}

/** Иконка группы: цвет — только у срыва и риска, остальные тихие. */
const GROUP_ICON: Record<TodayGroup, ReactNode> = {
  fresh: <AlarmClock aria-hidden="true" className="h-4 w-4 shrink-0 text-danger-text" />,
  risk: <TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0 text-warning-text" />,
  stale: <Pencil aria-hidden="true" className="h-4 w-4 shrink-0 text-text-mute" />,
  decide: <Scale aria-hidden="true" className="h-4 w-4 shrink-0 text-text-mute" />,
  plan: <CalendarDays aria-hidden="true" className="h-4 w-4 shrink-0 text-text-mute" />,
};

/**
 * Полоса состава: доля `--text` у сегмента. «Решить судьбу» — штриховка: тишина
 * дольше 14 дней — не «меньше работы», а другой вид проблемы.
 */
const COMPOSITION: Record<TodayGroup, { word: string; fill: string }> = {
  fresh: { word: 'сорвано', fill: 'color-mix(in srgb, var(--text) 62%, transparent)' },
  risk: { word: 'риск', fill: 'color-mix(in srgb, var(--text) 46%, transparent)' },
  stale: { word: 'обновить', fill: 'color-mix(in srgb, var(--text) 32%, transparent)' },
  decide: {
    word: 'решить судьбу',
    fill: 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--text) 30%, transparent) 0 2px, color-mix(in srgb, var(--text) 8%, transparent) 2px 5px)',
  },
  plan: { word: 'план', fill: 'color-mix(in srgb, var(--text) 14%, transparent)' },
};

/** Правило группы — подсказкой на названии (F-13): строки правила под заголовком нет. */
function groupTitle(g: TodayGroupView): string {
  const rule = TODAY_GROUP_RULES[g.key];
  const head = rule.charAt(0).toUpperCase() + rule.slice(1);
  return g.inMoves > 0 ? `${head}. Ещё ${inMovesText(g.inMoves)}` : head;
}

function RowSkeleton() {
  return (
    <div className="today-row" aria-hidden="true">
      <span className="min-w-0">
        <span className="block h-3.5 w-32 animate-pulse rounded bg-surface2" />
        <span className="mt-1.5 block h-3 w-2/3 animate-pulse rounded bg-surface2" />
      </span>
      <span className="flex flex-col items-end gap-1.5">
        <span className="block h-3 w-12 animate-pulse rounded bg-surface2" />
        <span className="block h-4 w-14 animate-pulse rounded-full bg-surface2" />
      </span>
    </div>
  );
}

function Composition({ layout }: { layout: readonly TodayGroupLayout[] }) {
  const groups = layout.filter((l) => l.view.total > 0).map((l) => l.view);
  if (groups.length === 0) return null;
  const label = groups.map((g) => `${g.total} ${COMPOSITION[g.key].word}`).join(', ');
  return (
    <div role="img" aria-label={`Состав списка: ${label}`} className="mb-3 flex gap-2">
      {groups.map((g) => (
        <span
          key={g.key}
          className="flex flex-col gap-[0.3125rem] whitespace-nowrap text-xs text-text-dim"
          style={{ flex: `${g.total} 1 0`, minWidth: 'max-content' }}
        >
          <i className="block h-2 rounded-full" style={{ background: COMPOSITION[g.key].fill } as CSSProperties} />
          <span>
            <b className="mr-1 font-semibold tabular-nums text-text-main">{g.total}</b>
            {COMPOSITION[g.key].word}
          </span>
        </span>
      ))}
    </div>
  );
}

function GroupHeading({ layout, onToggle, onSweep }: { layout: TodayGroupLayout; onToggle: () => void; onSweep: () => void }) {
  const g = layout.view;
  const label = (
    <>
      {GROUP_ICON[g.key]}
      <span title={groupTitle(g)} className="cursor-help whitespace-nowrap text-sm font-semibold text-text-main">
        {TODAY_GROUP_LABELS[g.key]}
      </span>
      <span className="text-[0.8125rem] font-medium tabular-nums text-text-mute">{g.total}</span>
      <span className="flex-1" />
    </>
  );

  if (!layout.collapsible) return <div className="today-grp-head">{label}</div>;

  const sweep = layout.collapsed && g.key === 'decide' && g.rows.length > 0;
  return (
    <div className="flex items-center pr-4">
      <button
        type="button"
        aria-expanded={!layout.collapsed}
        onClick={onToggle}
        className={cn('today-grp-head min-w-0 flex-1 text-left', sweep && 'pr-2')}
      >
        {label}
        <ChevronRight
          aria-hidden="true"
          className={cn('h-3.5 w-3.5 shrink-0 text-text-mute transition-transform', !layout.collapsed && 'rotate-90')}
        />
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

/**
 * Список «Сделки в работе» (S-TODAY-FOCUS-2, спека §5): шапка книги и полоса
 * состава, каждая группа — свой лист. Свёрнутая группа показывает чипы сделок:
 * клик по чипу раскрывает группу и ведёт сделку в фокус (F-12).
 */
export function TodayGroups({
  loading, total, noStepAhead, noAmount, layout, onToggleGroup, onShowAll, selectedId, onSelect,
  kbdIndexOf, todayKey, writtenOf, onSweep,
}: TodayGroupsProps) {
  const visibleGroups = layout.filter((l) => l.view.total > 0);

  return (
    <section aria-label="Сделки в работе" className="mb-4">
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h2 className="text-sm font-semibold text-text-main">Сделки в работе</h2>
        {loading ? (
          <span className="h-3 w-36 animate-pulse self-center rounded bg-surface2" aria-hidden="true" />
        ) : total > 0 ? (
          <>
            <span className="text-xs font-semibold tabular-nums text-text-dim">{total}</span>
            <span className="text-xs text-text-dim">
              {noStepAhead === 0 ? (
                <>у всех <b className="font-semibold text-text-main">{total}</b> шаг впереди</>
              ) : (
                <>у <b className="font-semibold text-text-main">{noStepAhead}</b> из {total} нет шага впереди</>
              )}
            </span>
          </>
        ) : null}
        <span className="flex-1" />
        {!loading && noAmount > 0 && (
          <span className="text-xs text-text-dim" title="Сделка без суммы попадает в ходы только как свежий срыв">
            у <b className="font-semibold text-text-main">{noAmount}</b> не указана сумма
          </span>
        )}
      </div>

      {!loading && <Composition layout={layout} />}

      {loading ? (
        <div className="sheet today-grp">
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </div>
      ) : total === 0 ? (
        <p className="sheet today-grp px-4 py-3 text-xs text-text-dim">Открытых сделок нет</p>
      ) : (
        visibleGroups.map((l) => (
          <section key={l.view.key} aria-label={TODAY_GROUP_LABELS[l.view.key]} className="sheet today-grp">
            <GroupHeading layout={l} onToggle={() => onToggleGroup(l.view.key)} onSweep={onSweep} />

            {l.collapsed ? (
              <div className="flex flex-wrap gap-1.5 px-4 pb-3.5 pt-0.5">
                {l.view.rows.map((v) => (
                  <button
                    key={v.source.id}
                    type="button"
                    className="today-chip"
                    onClick={(e) => {
                      // ⌘/Ctrl — новая вкладка: группа не раскрывается, выбор прежний.
                      if (!(e.metaKey || e.ctrlKey)) onToggleGroup(l.view.key);
                      onSelect(v.source.id, e);
                    }}
                    onAuxClick={(e) => { if (e.button === 1) onSelect(v.source.id, e); }}
                  >
                    <b className="font-medium text-text-main">{v.source.name}</b>
                    <span className="text-xs tabular-nums text-text-mute">
                      {rowPill(v, todayKey, writtenOf(v.source.id)).text}
                    </span>
                  </button>
                ))}
                {l.view.inMoves > 0 && (
                  <span className="today-chip today-chip-more">ещё {inMovesText(l.view.inMoves)}</span>
                )}
              </div>
            ) : (
              <>
                {l.rows.map((v) => (
                  <TodayDealRow
                    key={v.source.id}
                    view={v}
                    selected={selectedId === v.source.id}
                    onSelect={(e) => onSelect(v.source.id, e)}
                    kbdIndex={kbdIndexOf(v.source.id)}
                    todayKey={todayKey}
                    written={writtenOf(v.source.id)}
                  />
                ))}
                {l.hidden > 0 && (
                  <div className="today-row-foot px-4 py-2 text-xs text-text-dim">
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
              </>
            )}
          </section>
        ))
      )}
    </section>
  );
}
