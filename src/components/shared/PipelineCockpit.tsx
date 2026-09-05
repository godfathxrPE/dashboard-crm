'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  Clock,
  Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { StageTimeGauge } from '@/lib/domain/stage-norm';

// ═══════════════════════════════════════════════════════
// S-PIPELINE-COCKPIT-1: приборная строка позиции в воронке.
//
// Единый язык для лидов, сделок и проектов внедрения — вместо трёх (пилюли+«›»,
// шевроны, треки с чипами). Слева направо:
//   [✓ N прошлых] — [ячейка текущей стадии с тайм-заливкой] — [готовность гейта]
//   — [кнопка следующей стадии] — [+N хвост] — [⌄ карта]
//
// Компонент презентационный: данные собирают вызывающие (ProjectDetail,
// LeadDetail) — у кокпита нет запросов и нет знания о сущностях. Тайм-часть
// опциональна (`gauge: null`) — у лида нет ни stage_entered_at, ни норм, и
// выдумывать их нельзя: сигнал времени там несут LeadHealthMark и фокус-панель.
// ═══════════════════════════════════════════════════════

export interface CockpitGateItem {
  label: string;
  met: boolean;
}

export interface PipelineCockpitProps {
  pastCount: number;
  /** Имена пройденных стадий — в title чипа «✓ N». */
  pastNames: string[];
  current: { name: string };
  /** null — строка без тайм-части (лид). */
  gauge: StageTimeGauge | null;
  /** Слот после счётчика внутри ячейки (лид: LeadHealthMark). */
  currentExtra?: React.ReactNode;
  /** Подпись над строкой: «Привлечение · группа 1 из 4». */
  groupLabel?: string | null;
  /** null или пустой список требований — гейт-элемент скрыт. */
  gate?: { items: CockpitGateItem[]; title: string } | null;
  next?: {
    label: string;
    probability?: number | null;
    /** Требования не закрыты: кнопка приглушена, но клик работает — истина на сервере. */
    locked: boolean;
    onClick?: () => void;
  } | null;
  /** Слот сразу после кнопки следующей стадии (лид: «Отклонить»). Скрыт у терминала. */
  extraActions?: React.ReactNode;
  restCount: number;
  restGroupsCount?: number;
  /** Прижатая вправо мета: «3 из 5». */
  metaRight?: React.ReactNode;
  /** Терминал (won/lost/converted/completed): гейт и кнопка скрыты, заливки нет. */
  locked?: boolean;
  /**
   * Слот под основной строкой, НАД картой воронки (сделка: «Что делаем на стадии»,
   * S-STAGE-STORY-1). Опционален, потому что лиды его не передают: компонент общий
   * и знания о сущностях у него нет — данные собирают вызывающие.
   */
  guidance?: React.ReactNode;
  /** Карта воронки (StageRail) — раскрывается под строкой. */
  map: React.ReactNode;
}

const FILL_BY_STATE = {
  ok: 'var(--time-ok-fill)',
  warn: 'var(--time-warn-fill)',
  over: 'var(--time-over-fill)',
} as const;

const BORDER_BY_STATE = {
  ok: 'var(--accent)',
  warn: 'var(--yellow)',
  over: 'var(--red)',
} as const;

export function PipelineCockpit({
  pastCount,
  pastNames,
  current,
  gauge,
  currentExtra,
  groupLabel,
  gate,
  next,
  extraActions,
  restCount,
  restGroupsCount,
  metaRight,
  locked = false,
  guidance,
  map,
}: PipelineCockpitProps) {
  const [mapOpen, setMapOpen] = useState(false);
  const toggleMap = () => setMapOpen((v) => !v);

  const gateItems = gate?.items ?? [];
  const showGate = !locked && gateItems.length > 0;
  const gateMet = gateItems.filter((i) => i.met).length;
  const gatePassed = gateItems.length === 0 || gateMet === gateItems.length;

  const state = gauge?.state ?? 'ok';
  const showFill = !locked && gauge?.pct != null;

  return (
    // `group/cockpit` — якорь наведения для слота `guidance`: пустое приглашение
    // «Добавить подсказку» проявляется по наведению на блок стадии (S-FORMAT-1),
    // а не занимает строку на каждой ненастроенной сделке.
    <div className="group/cockpit">
      {groupLabel && (
        <div
          className="mb-1 text-meta font-semibold uppercase tracking-wider"
          style={{ color: 'var(--accent-text, var(--accent))' }}
        >
          {groupLabel}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {/* 1. Прошлое — свёрнутый хвост пройденных стадий */}
        {pastCount > 0 && (
          <>
            <button
              type="button"
              onClick={toggleMap}
              title={pastNames.join(', ')}
              className="inline-flex items-center gap-1 rounded-full bg-accent-l px-2.5 py-1 text-xs font-semibold"
              style={{ color: 'var(--accent-text, var(--accent))' }}
            >
              <Check size={11} strokeWidth={3} />
              {pastCount}
            </button>
            <span className="h-[2px] w-3.5 rounded bg-accent" aria-hidden />
          </>
        )}

        {/* 2. Ячейка текущей стадии — заливка = расход нормы дней */}
        <div
          className="relative inline-flex items-center gap-2 overflow-hidden rounded-[0.625rem]
                     border-[1.5px] bg-surface px-3 py-1.5"
          style={{ borderColor: locked ? 'var(--border)' : BORDER_BY_STATE[state] }}
        >
          {showFill && (
            <span
              aria-hidden
              className="absolute inset-y-0 left-0"
              style={{ width: `${gauge!.pct}%`, background: FILL_BY_STATE[state] }}
            />
          )}
          <span className="relative text-[0.8125rem] font-semibold text-text-main">{current.name}</span>
          {/* Гейт-фикс S-PIPELINE-COCKPIT-1: у терминала (won/lost/completed) возраст
              стадии — шум («Выиграна · 45 дн.» читается как проблема), счётчик скрыт. */}
          {!locked && gauge?.days != null && (
            <span
              className={cn(
                'relative inline-flex items-center gap-1 text-meta tabular-nums',
                state === 'ok' && 'text-text-dim',
              )}
              style={
                state === 'warn'
                  ? { color: 'var(--yellow-text, var(--yellow))' }
                  : state === 'over'
                    ? { color: 'var(--red-text, var(--red))' }
                    : undefined
              }
              title={gauge.norm != null ? `Норма стадии — ${gauge.norm} дн.` : undefined}
            >
              {state === 'over' && <Clock size={12} />}
              {state === 'over' && gauge.norm != null
                ? `${gauge.days} дн. · норма ${gauge.norm}`
                : `${gauge.days} дн.`}
            </span>
          )}
          {currentExtra && <span className="relative">{currentExtra}</span>}
        </div>

        {/* 3. Готовность гейта — точки + поповер с чек-листом */}
        {showGate && <GateChip items={gateItems} met={gateMet} title={gate!.title} />}

        {/* 4. Соединитель к следующей стадии */}
        {!locked && next && (
          <span
            aria-hidden
            className={cn('h-[2px] w-3.5 rounded', gatePassed ? 'bg-accent' : 'bg-border2')}
          />
        )}

        {/* 5. Следующая стадия */}
        {!locked && next && (
          <button
            type="button"
            onClick={next.onClick}
            title={
              next.locked
                ? `Перейти на «${next.label}» — требования стадии ещё не закрыты`
                : `Перейти на стадию «${next.label}»`
            }
            className={cn(
              'inline-flex items-center gap-1.5 rounded-[0.625rem] border px-3 py-1.5 text-xs transition-colors',
              next.locked ? 'border-border text-text-mute' : 'font-medium hover:bg-accent-l',
            )}
            style={next.locked ? undefined : { borderColor: 'var(--accent)', color: 'var(--accent-text, var(--accent))' }}
          >
            {next.locked ? <Lock size={12} /> : null}
            {next.label}
            {next.probability != null && <span className="tabular-nums">· {next.probability}%</span>}
            {!next.locked && <ArrowRight size={12} />}
          </button>
        )}

        {!locked && extraActions}

        {/* 6. Хвост — сколько стадий осталось за кадром */}
        {restCount > 0 && (
          <button
            type="button"
            onClick={toggleMap}
            title="Показать карту воронки"
            className="rounded-full border border-dashed border-border2 px-2 py-0.5 text-xs text-text-mute
                       transition-colors hover:bg-surface2"
          >
            +{restCount}
            {restGroupsCount != null && restGroupsCount > 0 && ` · ${restGroupsCount} ${groupsWord(restGroupsCount)}`}
          </button>
        )}

        {/* 7. Разворот карты */}
        <button
          type="button"
          onClick={toggleMap}
          aria-expanded={mapOpen}
          title={mapOpen ? 'Свернуть карту воронки' : 'Показать карту воронки'}
          className="flex h-6 w-6 items-center justify-center rounded-md text-text-mute
                     transition-colors hover:bg-surface2"
        >
          {mapOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {metaRight && <span className="ml-auto text-xs tabular-nums text-text-mute">{metaRight}</span>}
      </div>

      {/* empty:mt-0 — слот отдан, но содержимое условно (не-owner без подсказки
          не видит ничего): пустая обёртка не должна оставлять отступ. */}
      {guidance && <div className="mt-2 empty:mt-0">{guidance}</div>}

      {mapOpen && <div className="mt-2">{map}</div>}
    </div>
  );
}

/** «группа/группы/групп» — счётчик хвоста читается как фраза, а не как код. */
function groupsWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'группа';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'группы';
  return 'групп';
}

/**
 * Готовность к следующей стадии: точки-индикаторы + поповер с чек-листом.
 * Язык пунктов — тот же, что был у StageReadiness (Check/Circle, зачёркнутое
 * выполненное): компонент удалён, а формулировка требований осталась прежней.
 */
function GateChip({ items, met, title }: { items: CockpitGateItem[]; met: number; title: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Закрытие по клику вне и по Esc — оба слушателя живут только пока поповер открыт.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={title}
        className="inline-flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-meta text-text-dim
                   transition-colors hover:bg-surface2"
      >
        <span className="flex items-center gap-1">
          {items.map((item, i) => (
            <span
              key={i}
              aria-hidden
              className={cn(
                'h-[0.4375rem] w-[0.4375rem] rounded-full',
                item.met ? 'bg-accent' : 'border border-border2 bg-surface3',
              )}
            />
          ))}
        </span>
        готовность {met}/{items.length}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-72 rounded-[var(--radius)] border border-border bg-popover p-3 elevation-3">
          <div className="mb-2 text-meta font-semibold uppercase text-text-mute">{title}</div>
          <ul className="space-y-1.5">
            {items.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-body">
                {item.met ? (
                  <Check size={14} className="mt-0.5 shrink-0 text-green" />
                ) : (
                  <Circle size={14} className="mt-0.5 shrink-0 text-text-mute" />
                )}
                <span className={item.met ? 'text-text-dim line-through' : 'text-text-main'}>
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
