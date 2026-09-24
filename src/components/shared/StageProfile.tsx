'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { ArrowRight, Check, ChevronUp, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatDateShort } from '@/lib/utils/dates';
import { Button } from '@/components/ui/Button';
import type { StageRailProps, StageRailStage } from '@/components/shared/StageRail';
import type { StageTimeGauge } from '@/lib/domain/stage-norm';
import {
  buildStageProfile,
  type ProfileColumn,
  type ProfileGroup,
  type ProfileTone,
  type StageProfileLayout,
} from '@/lib/domain/stage-profile';

// ═══════════════════════════════════════════════════════
// S-STAGE-PROFILE-1: карта воронки «Профиль времени» (W1, часть B).
//
// Стадия — столбик, высота = дни; пунктир — норма, заливка — факт. Встаёт в слот
// `map` кокпита вместо StageRail (у сделок и внедрений); StageRail остаётся лиду —
// у лида нет ни stage_entered_at, ни норм, профиль там рисовать нечем.
//
// Компонент презентационный: ноль запросов, данные собирает ProjectStageCockpit.
// Математика — в `buildStageProfile` (чистая, с тестами), здесь только разметка.
//
// ⚠️ Тултипа нет НАМЕРЕННО (решение гейта, утверждено владельцем): его содержимое
// дословно повторяло бы вкладку «История» (второй носитель одного факта), по
// наведению недоступно с клавиатуры и тача, а в `overflow-x: auto` самописное
// позиционирование обрезалось бы. Клик по столбику раскрывает СТРОКУ ДЕТАЛЕЙ под
// картой — и туда же переехал откат на стадию: в StageRail он был одним кликом
// по узлу, здесь это кнопка рядом с фактом «сколько длилась и кто вёл».
//
// ⚠️ Состояние `ok` красится `--mark-today`, а НЕ `--accent`: в t-washi accent
// равен --red, и «идём по норме» слилось бы с «просрочено» на главном элементе
// карты. Второй потребитель токена после таймлайна дедлайнов.
// ═══════════════════════════════════════════════════════

export interface StageProfileStage extends StageRailStage {
  probability?: number | null;
}

/** Один заход в стадию — для строки деталей. Готовит вызывающий из StageStory. */
export interface StageProfileVisit {
  enteredAt: string;
  /** null — сделка в стадии сейчас. */
  leftAt: string | null;
  days: number;
  actor: string | null;
}

export interface StageProfileProps extends StageRailProps {
  stages: StageProfileStage[];
  /** stageId → суммарно дней за все заходы (StageStory.totalByStage). Нет ключа — стадия не посещалась. */
  factDays: Record<string, number>;
  /** stageId → заходы; число заходов ≥2 — бейдж «×N». */
  stageVisits?: Record<string, StageProfileVisit[]>;
  /** stageId → норма дней (resolveStageNorm по каждой стадии). Пустой объект — контуры не рисуются. */
  normDays: Record<string, number>;
  /** Датчик текущей стадии — ТОТ ЖЕ объект, что уходит в PipelineCockpit.gauge. */
  gauge: StageTimeGauge | null;
  pipelineName?: string | null;
  /** Терминал: подпись и дата для правой части футера («выиграна 28 авг»). */
  closed?: { label: string; at: string | null } | null;
  /** «Сейчас» для прогноза финиша; по умолчанию — момент рендера. */
  now?: Date;
  /**
   * S-COCKPIT-ROW-1: «Свернуть ⌃» в шапке карты. Шеврон строки кокпита в раскрытом
   * состоянии переезжает сюда (спека A1); не задан — кнопки нет.
   */
  onCollapse?: () => void;
}

/** Цвет состояния текущей колонки: заливка/контур. `ok` — --mark-today (П4). */
const TONE_COLOR: Record<ProfileTone, string> = {
  ok: 'var(--mark-today)',
  warn: 'var(--yellow)',
  over: 'var(--red)',
  muted: 'var(--profile-norm)',
};

const TONE_TEXT: Record<ProfileTone, string | undefined> = {
  ok: undefined,
  warn: 'var(--yellow-text, var(--yellow))',
  over: 'var(--red-text, var(--red))',
  muted: undefined,
};

/** px макета → rem: размеры карты считаются в px (H = 90), в разметку идут rem. */
const rem = (px: number) => `${px / 16}rem`;

export function StageProfile({
  stages,
  currentIndex,
  locked = false,
  allDone = false,
  onStageClick,
  groupLabels,
  factDays,
  stageVisits,
  normDays,
  gauge,
  pipelineName,
  closed,
  now,
  onCollapse,
}: StageProfileProps) {
  const detailId = useId();
  const [openId, setOpenId] = useState<string | null>(null);
  // Анимация роста — только при маунте: через 0.6 с класс снимается, и столбики,
  // появившиеся после смены стадии, встают мгновенно (не «прыгают» вместе с кокпитом).
  const [grow, setGrow] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setGrow(false), 600);
    return () => clearTimeout(t);
  }, []);

  const visitCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [id, list] of Object.entries(stageVisits ?? {})) out[id] = list.length;
    return out;
  }, [stageVisits]);

  const nowMs = now?.getTime();
  const layout = useMemo<StageProfileLayout>(
    () =>
      buildStageProfile(stages, factDays, normDays, gauge, nowMs != null ? new Date(nowMs) : new Date(), {
        currentIndex,
        allDone,
        locked,
        visits: visitCounts,
      }),
    [stages, factDays, normDays, gauge, nowMs, currentIndex, allDone, locked, visitCounts],
  );

  // Смена стадии — раскрытая строка закрывается: её кнопка («вернуть» / «перейти»)
  // считалась от прежней позиции.
  useEffect(() => setOpenId(null), [currentIndex]);

  // Escape закрывает строку деталей; слушатель живёт, только пока она раскрыта.
  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenId(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [openId]);

  if (stages.length === 0) return null;

  const readOnly = locked || !onStageClick;
  const n = stages.length;
  const hasGroupLabels = !!groupLabels && layout.groups.length > 1 && layout.groups.some((g) => g.key !== '—');
  const openCol = layout.columns.find((c) => c.id === openId) ?? null;

  return (
    <div className="border-t border-border pt-3.5">
      {/* ═══ Шапка: имя воронки + масштаб, легенда ═══ */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="text-meta font-semibold uppercase tracking-wider text-text-dim">
          Карта воронки{pipelineName ? ` · ${pipelineName}` : ''}
          {layout.scaleLabel && (
            <span className="font-normal normal-case tracking-normal"> · {layout.scaleLabel}</span>
          )}
        </span>
        <div className="flex items-center gap-3.5 text-[0.65625rem] text-text-dim">
          <LegendItem swatch={<i className="h-2 w-2.5 rounded-sm" style={{ background: 'var(--profile-fact)' }} />}>факт</LegendItem>
          {layout.hasNorms && (
            <>
              <LegendItem
                swatch={
                  <i
                    className="h-2 w-2.5 rounded-sm border-[1.5px] border-dashed"
                    style={{ borderColor: 'var(--profile-norm)' }}
                  />
                }
              >
                норма
              </LegendItem>
              <LegendItem swatch={<i className="h-2 w-2.5 rounded-sm" style={{ background: 'var(--profile-over-past)' }} />}>сверх нормы</LegendItem>
            </>
          )}
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              aria-expanded
              title="Свернуть карту воронки"
              className="inline-flex items-center gap-1 rounded-md px-1 text-[0.71875rem] text-text-dim
                         transition-colors hover:text-text-main"
            >
              Свернуть
              <ChevronUp size={12} strokeWidth={2.2} aria-hidden />
            </button>
          )}
        </div>
      </div>

      {/* ═══ Сетка: группы, столбики и подписи в ОДНОМ скролл-контейнере —
          рассинхрон колонок при скролле невозможен ═══ */}
      <div className="overflow-x-auto pb-0.5">
        <div style={{ minWidth: `${n * 4}rem` }}>
          {hasGroupLabels && (
            <div
              className="mb-2 grid"
              style={{ gridTemplateColumns: layout.groups.map((g) => `${g.span}fr`).join(' ') }}
            >
              {layout.groups.map((g, gi) => (
                <GroupHead
                  key={`${g.key}-${gi}`}
                  group={g}
                  label={groupLabels?.[g.key] ?? g.key}
                  first={gi === 0}
                  last={gi === layout.groups.length - 1}
                  hasNorms={layout.hasNorms}
                />
              ))}
            </div>
          )}

          <div
            className="grid border-b-[1.5px]"
            style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, borderColor: 'var(--profile-norm)' }}
          >
            {layout.columns.map((col) => (
              <Column
                key={col.id}
                col={col}
                disabled={readOnly || col.kind === 'current'}
                expanded={openId === col.id}
                detailId={detailId}
                grow={grow}
                onToggle={() => setOpenId((v) => (v === col.id ? null : col.id))}
              />
            ))}
          </div>

          <div className="mt-2 grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
            {layout.columns.map((col) => (
              <ColumnLabel key={col.id} col={col} last={col.index === n - 1} allDone={allDone} />
            ))}
          </div>
        </div>
      </div>

      {/* ═══ Строка деталей (аккордеон: одна стадия за раз) ═══ */}
      {openCol && !readOnly && (
        <StageDetail
          id={detailId}
          col={openCol}
          probability={stages[openCol.index]?.probability ?? null}
          visits={stageVisits?.[openCol.id] ?? []}
          onAction={() => {
            setOpenId(null);
            onStageClick?.(openCol.id);
          }}
        />
      )}

      <Footer layout={layout} closed={closed ?? null} />
    </div>
  );
}

function LegendItem({ swatch, children }: { swatch: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5" aria-hidden>
      {swatch}
      {children}
    </span>
  );
}

function GroupHead({
  group,
  label,
  first,
  last,
  hasNorms,
}: {
  group: ProfileGroup;
  label: string;
  first: boolean;
  last: boolean;
  hasNorms: boolean;
}) {
  const current = group.tone !== null;
  const factColor = group.tone ? TONE_TEXT[group.tone] : undefined;
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-2 whitespace-nowrap px-2 text-[0.625rem]',
        first && 'pl-1',
        last && 'pr-1',
        !first && 'border-l',
      )}
      style={first ? undefined : { borderColor: 'var(--profile-norm)' }}
    >
      <b className={cn('truncate font-bold uppercase tracking-[0.08em]', current ? 'text-text-main' : 'text-text-dim')}>
        {label}
      </b>
      <span
        className={cn('tabular-nums', factColor ? 'font-semibold' : 'text-text-dim')}
        style={factColor ? { color: factColor } : undefined}
      >
        {group.factSum ?? '—'}
        {hasNorms && group.normSum != null && (
          <span className={cn('font-normal', factColor ? 'text-text-dim' : 'opacity-70')}> / {group.normSum}</span>
        )}
      </span>
    </div>
  );
}

/** Подпись действия колонки — для aria-label и строки деталей. */
function actionWord(col: ProfileColumn): string | null {
  if (col.kind === 'past' || col.kind === 'skipped') return 'вернуть на стадию';
  if (col.kind === 'next' || col.kind === 'todo') return 'перейти';
  return null;
}

/** Первая строка описания колонки: «Демо · 5 дн. за 2 захода при норме 3». */
function describeColumn(col: ProfileColumn): string {
  const norm = col.norm != null ? ` при норме ${col.norm}` : '';
  if (col.kind === 'skipped') return `${col.name} · пройдена без захода`;
  if (col.kind === 'next' || col.kind === 'todo') {
    const prefix = col.kind === 'next' ? ' · следующая' : '';
    return col.norm != null ? `${col.name}${prefix} · норма ${col.norm} дн.` : `${col.name}${prefix}`;
  }
  if (col.fact == null) return `${col.name} · —`;
  const visits = col.visits >= 2 ? ` за ${col.visits} ${visitsWord(col.visits)}` : '';
  const over = col.over && col.norm != null ? `, сверх нормы ${col.fact - col.norm}` : '';
  if (col.kind === 'current') {
    return col.norm != null
      ? `${col.name} · текущая · ${col.fact} дн. из ${col.norm} по норме`
      : `${col.name} · текущая · ${col.fact} дн.`;
  }
  return `${col.name} · ${col.fact} дн.${visits}${norm}${over}`;
}

function visitsWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'заход';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'захода';
  return 'заходов';
}

function Column({
  col,
  disabled,
  expanded,
  detailId,
  grow,
  onToggle,
}: {
  col: ProfileColumn;
  disabled: boolean;
  expanded: boolean;
  detailId: string;
  grow: boolean;
  onToggle: () => void;
}) {
  const action = disabled ? null : actionWord(col);
  const label = action ? `${describeColumn(col)} · показать детали, ${action}` : describeColumn(col);
  const future = col.kind === 'next' || col.kind === 'todo';
  const tone = col.tone;

  // ── Число над столбиком ──
  let value: React.ReactNode;
  let valueColor: string | undefined;
  let valueStrong = false;
  if (future) {
    value = col.norm != null ? `≈ ${col.norm}` : '—';
  } else if (col.fact == null) {
    value = '—';
  } else if (col.kind === 'current' && col.norm != null) {
    value = (
      <>
        {col.fact} <i className="font-normal not-italic text-text-dim">/ {col.norm}</i>
      </>
    );
    valueColor = tone ? TONE_TEXT[tone] : undefined;
    valueStrong = tone !== 'muted';
  } else if (col.over && col.norm != null) {
    value = (
      <>
        {col.fact} <i className="font-normal not-italic">/ {col.norm}</i>
      </>
    );
    valueColor = TONE_TEXT.warn;
    valueStrong = true;
  } else {
    value = col.fact;
  }

  // ── Контур нормы ──
  let contour: React.CSSProperties | null = null;
  if (col.contourPx > 0) {
    const base: React.CSSProperties = { height: rem(col.contourPx) };
    if (col.kind === 'current') {
      const color = tone ? TONE_COLOR[tone] : TONE_COLOR.ok;
      contour = col.over
        ? { ...base, borderStyle: 'solid', borderColor: color, borderLeftWidth: 0, borderRightWidth: 0, borderRadius: 0 }
        : { ...base, borderStyle: 'solid', borderColor: color, borderRadius: '0.25rem 0.25rem 0 0' };
    } else if (col.kind === 'next') {
      contour = {
        ...base,
        borderStyle: 'solid',
        borderColor: 'var(--text)',
        borderRadius: '0.25rem 0.25rem 0 0',
      };
    } else if (col.kind === 'todo') {
      contour = { ...base, borderColor: 'var(--profile-norm)', borderRadius: '0.25rem 0.25rem 0 0' };
    } else if (col.over) {
      // Пересвет прошлой: контур → горизонтальная линия нормы, без боковых граней.
      contour = { ...base, borderColor: 'var(--yellow)', borderLeftWidth: 0, borderRightWidth: 0, borderRadius: 0 };
    } else {
      contour = { ...base, borderColor: 'var(--profile-norm)' };
    }
  }

  // ── Заливка факта ──
  let fill: React.CSSProperties | null = null;
  if (col.fillPx > 0) {
    const h = rem(col.fillPx);
    const top = rem(col.overPx);
    if (col.kind === 'current') {
      const t = tone ?? 'ok';
      const background =
        t === 'over'
          ? `linear-gradient(180deg, var(--profile-over-now) 0 ${top}, var(--mark-today) ${top})`
          : t === 'warn'
            ? 'linear-gradient(180deg, var(--profile-over-past), var(--mark-today))'
            : t === 'muted'
              ? 'var(--text-dim)'
              : 'var(--mark-today)';
      fill = { height: h, background, borderRadius: col.over ? '0.25rem 0.25rem 0 0' : 0 };
    } else if (col.over) {
      fill = { height: h, background: `linear-gradient(180deg, var(--profile-over-past) 0 ${top}, var(--profile-fact) ${top})` };
    } else {
      fill = { height: h, background: 'var(--profile-fact)' };
    }
  }

  const barPx = Math.max(col.contourPx, col.fillPx);

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-current={col.kind === 'current' ? 'step' : undefined}
      aria-expanded={disabled ? undefined : expanded}
      aria-controls={!disabled && expanded ? detailId : undefined}
      aria-label={label}
      title={col.name}
      className={cn(
        'relative flex h-[6.875rem] flex-col items-center justify-end rounded-t-lg px-1.5 transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2',
        'focus-visible:outline-[color:var(--accent-text,var(--accent))]',
        disabled ? 'cursor-default' : 'hover:bg-surface2',
        expanded && 'bg-surface2',
      )}
    >
      {col.visits >= 2 && (
        <span
          className="absolute right-0.5 top-[-0.125rem] rounded-full bg-surface px-1 text-[0.53125rem] font-bold
                     text-text-dim shadow-[inset_0_0_0_1px_var(--profile-norm)]"
        >
          ×{col.visits}
        </span>
      )}
      <span
        className={cn(
          'mb-[0.1875rem] whitespace-nowrap text-[0.625rem] tabular-nums',
          valueStrong ? 'font-semibold' : !valueColor && 'text-text-dim',
          col.kind === 'current' && tone === 'ok' && 'text-text-main',
        )}
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </span>
      <span className="relative flex w-full items-end" style={{ height: rem(barPx) }}>
        {contour && (
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 rounded-t-[0.1875rem] border-[1.5px] border-b-0 border-dashed"
            style={contour}
          />
        )}
        {fill && (
          <span
            aria-hidden
            className={cn(
              'relative w-full rounded-t-[0.1875rem]',
              col.historic && 'opacity-30',
              grow && 'stage-profile-grow',
            )}
            style={fill}
          />
        )}
        {col.todayPx != null && (
          <span
            aria-hidden
            className="absolute -left-1 -right-1 h-[2px] bg-text-main"
            style={{ bottom: rem(col.todayPx) }}
          />
        )}
      </span>
    </button>
  );
}

function ColumnLabel({ col, last, allDone }: { col: ProfileColumn; last: boolean; allDone: boolean }) {
  const tone = col.tone ?? 'ok';
  let node: React.ReactNode;
  if (allDone && last) {
    node = (
      <span className="grid h-3 w-3 place-items-center rounded-full bg-accent" style={{ color: 'var(--on-accent)' }}>
        <Check size={8} strokeWidth={3.5} />
      </span>
    );
  } else if (col.kind === 'past') {
    node = (
      <span className="grid h-3 w-3 place-items-center rounded-full bg-text-main" style={{ color: 'var(--surface)' }}>
        <Check size={8} strokeWidth={3.5} />
      </span>
    );
  } else if (col.kind === 'skipped') {
    // Пропущена перескоком: узел «пройдено», но пустой — захода не было.
    node = <span className="block h-3 w-3 rounded-full shadow-[inset_0_0_0_1.5px_var(--text)]" />;
  } else if (col.kind === 'current') {
    node = (
      <span
        className="block h-3 w-3 rounded-full"
        style={{
          background: tone === 'muted' ? 'var(--text-dim)' : 'var(--mark-today)',
          boxShadow: `0 0 0 2px var(--surface), 0 0 0 3.5px ${TONE_COLOR[tone]}`,
        }}
      />
    );
  } else if (col.kind === 'next') {
    node = (
      <span className="grid h-3 w-3 place-items-center rounded-full bg-surface text-text-main shadow-[inset_0_0_0_1.5px_var(--text)]">
        <ArrowRight size={7} strokeWidth={3.5} />
      </span>
    );
  } else {
    node = <span className="block h-3 w-3 rounded-full shadow-[inset_0_0_0_1.5px_var(--profile-norm)]" />;
  }

  return (
    <div
      className={cn(
        // min-w-0 + переносы: колонка 64px уже одного слова «Квалификация», и без них
        // подпись вылезала на соседнюю (тот же дефект, что StageRail лечил shrink-0).
        'flex min-w-0 flex-col items-center gap-[0.1875rem] px-[0.1875rem] text-center text-[0.65625rem] leading-tight',
        col.kind === 'current' || col.kind === 'next'
          ? 'font-semibold text-text-main'
          : col.kind === 'todo'
            ? 'font-normal text-text-dim'
            : 'font-medium text-text-dim',
      )}
      title={col.name}
    >
      <span className="block flex-none" aria-hidden>
        {node}
      </span>
      <span className="line-clamp-2 max-w-full hyphens-auto [overflow-wrap:anywhere] [text-wrap:balance]">{col.name}</span>
    </div>
  );
}

function StageDetail({
  id,
  col,
  probability,
  visits,
  onAction,
}: {
  id: string;
  col: ProfileColumn;
  probability: number | null;
  visits: StageProfileVisit[];
  onAction: () => void;
}) {
  const future = col.kind === 'next' || col.kind === 'todo';
  const back = col.kind === 'past' || col.kind === 'skipped';

  let summary: string;
  if (future) {
    summary = [col.norm != null ? `норма ${col.norm} дн.` : null, probability != null ? `вероятность ${probability}%` : null]
      .filter(Boolean)
      .join(' · ');
  } else if (col.kind === 'skipped') {
    summary = 'пройдена без захода';
  } else {
    summary =
      col.norm != null ? `${col.fact ?? '—'} дн. при норме ${col.norm}` : `${col.fact ?? '—'} дн.`;
    if (col.visits >= 2) summary += ` · всего за ${col.visits} ${visitsWord(col.visits)}`;
  }

  return (
    <div id={id} className="mt-2 flex flex-wrap items-start gap-x-4 gap-y-2 rounded-lg bg-surface2 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-body font-semibold text-text-main">{col.name}</div>
        {summary && (
          <div
            className="text-meta tabular-nums text-text-dim"
            style={col.over ? { color: 'var(--yellow-text, var(--yellow))' } : undefined}
          >
            {summary}
          </div>
        )}
        {visits.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {future && <li className="text-meta text-text-mute">Раньше сделка здесь уже была:</li>}
            {visits.map((v, i) => (
              <li key={`${v.enteredAt}-${i}`} className="text-meta tabular-nums text-text-dim">
                {formatDateShort(v.enteredAt)} → {v.leftAt ? formatDateShort(v.leftAt) : 'сейчас'} · {v.days} дн.
                {v.actor ? ` · ${v.actor}` : ''}
              </li>
            ))}
          </ul>
        )}
      </div>
      {(back || future) && (
        <Button variant="secondary" size="sm" onClick={onAction} className="shrink-0">
          {back ? <RotateCcw size={12} aria-hidden /> : <ArrowRight size={12} aria-hidden />}
          {back ? 'Вернуть на стадию' : 'Перейти на стадию'}
        </Button>
      )}
    </div>
  );
}

function Footer({
  layout,
  closed,
}: {
  layout: StageProfileLayout;
  closed: { label: string; at: string | null } | null;
}) {
  const f = layout.footer;

  const diffNode = (diff: number | null, overColor: string) => {
    if (diff == null || diff === 0) return null;
    // «−N» — нейтральным весом, а не --accent-text, как в макете: в t-washi
    // accent-text равен red-text, и «быстрее нормы» читалось бы как «просрочено».
    // Знак несёт смысл, цвет — только сигнал «сверх».
    return diff > 0 ? (
      <span className="font-semibold" style={{ color: overColor }}>
        {' '}
        · +{diff} дн.
      </span>
    ) : (
      <span className="font-semibold text-text-main"> · −{-diff} дн.</span>
    );
  };

  let left: React.ReactNode;
  let right: React.ReactNode = null;

  if (f.mode === 'open') {
    const cur = layout.columns.find((c) => c.kind === 'current');
    const overColor = cur?.tone === 'over' ? 'var(--red-text, var(--red))' : 'var(--yellow-text, var(--yellow))';
    left = (
      <span>
        прошло <b className="font-semibold text-text-main">{f.priorFact} дн.</b>
        {f.priorNorm != null && f.diff != null && <> при норме {f.priorNorm}</>}
        {diffNode(f.diff, overColor)}
      </span>
    );
    if (f.ahead != null) {
      right = (
        <span>
          впереди ≈ <b className="font-semibold text-text-main">{f.ahead} дн.</b>
          {f.overBy != null
            ? ` · норма текущей исчерпана ${f.overBy} дн. назад`
            : f.finishKey
              ? ` по нормам · финиш ≈ ${formatDateShort(`${f.finishKey}T12:00:00Z`)}`
              : ''}
        </span>
      );
    }
  } else if (f.visited === 0) {
    // Сделка закрыта раньше, чем появился журнал переходов: «пройдена за 0 дн.»
    // было бы неправдой, честнее сказать, что считать не из чего.
    left = <span>переходы по стадиям не записаны</span>;
    if (closed) right = <span>{closed.at ? `${closed.label} ${formatDateShort(closed.at)}` : closed.label}</span>;
  } else {
    left = (
      <span>
        {f.mode === 'won' ? 'воронка пройдена за' : 'прошло'}{' '}
        <b className="font-semibold text-text-main">{f.totalFact} дн.</b>
        {f.totalNorm != null && f.diff != null && <> при норме {f.totalNorm}</>}
        {diffNode(f.diff, 'var(--yellow-text, var(--yellow))')}
      </span>
    );
    if (closed) right = <span>{closed.at ? `${closed.label} ${formatDateShort(closed.at)}` : closed.label}</span>;
  }

  return (
    <div className="mt-2.5 flex flex-wrap justify-between gap-x-3 gap-y-1 text-[0.625rem] tabular-nums text-text-dim">
      {left}
      {right}
    </div>
  );
}
