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
//
// S-COCKPIT-ROW-1: рестайл строки по макету (спека S-STAGE-PROFILE-1, раздел A).
// Всё новое включается НАЛИЧИЕМ `gauge`: у лида (`gauge === null`) строка
// рендерится прежней веткой `LegacyRow` без единого изменения — это главный
// регрессионный риск спринта, поэтому ветки разведены целиком, а не условиями
// в каждом классе.
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
  /**
   * Карта воронки — раскрывается под строкой. Функцией — карта сама несёт
   * «Свернуть» в своей шапке (S-COCKPIT-ROW-1): шеврон строки тогда живёт
   * только в свёрнутом состоянии.
   */
  map: React.ReactNode | ((api: { collapse: () => void }) => React.ReactNode);
  /** Раскрыта ли карта по умолчанию (сделка: текущая стадия в группе `closing`). */
  mapDefaultOpen?: boolean;
  /** Ключ localStorage для ручного выбора «раскрыть/свернуть». Нет — выбор не запоминается. */
  mapStorageKey?: string;
  /** Даты шкалы — уже отформатированные подписи («15 авг.»). Терминал — `closed`. */
  dates?: { entered: string | null; norm: string | null; closed?: string | null } | null;
  /** Мини-карта групп справа от строки. Строит вызывающий из stages + currentIndex. */
  miniMap?: { groups: CockpitMiniGroup[] } | null;
}

export type CockpitSegment = 'done' | 'current' | 'todo';

export interface CockpitMiniGroup {
  key: string;
  label: string;
  /** Полное имя группы — в title подписи (подпись может быть сокращённой). */
  title?: string;
  segments: CockpitSegment[];
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

/**
 * S-COCKPIT-ROW-1 (П1): цвет состояния новой строки. `ok` — `--mark-today`, а НЕ
 * `--accent`: в t-washi `--accent` и `--red` — один #C23B3B, и рамка «идём по
 * норме» совпадала с рамкой «просрочено» ещё ДО рестайла (дефект существовал,
 * спринт его нашёл, а не создал). Тот же токен, что у столбика текущей стадии в
 * StageProfile (TONE_COLOR.ok) — ячейка и столбик не расходятся. Старая таблица
 * `BORDER_BY_STATE` осталась за строкой лида, которой спринт не касается.
 */
const STATE_COLOR = {
  ok: 'var(--mark-today)',
  warn: 'var(--yellow)',
  over: 'var(--red)',
} as const;

const STATE_TEXT = {
  ok: undefined,
  warn: 'var(--yellow-text, var(--yellow))',
  over: 'var(--red-text, var(--red))',
} as const;

/**
 * Заливка шкалы. warn — тот же переход, что у столбика текущей в карте
 * (`--mark-today` → `--profile-over-past`), только по горизонтали; хардкод
 * `#E7C25A` из макета не переносится (правило «никаких хардкод-цветов»).
 * over — шкала целиком `--red` (A3: pct зажат в 100).
 */
const SCALE_FILL = {
  ok: 'var(--mark-today)',
  warn: 'linear-gradient(90deg, var(--mark-today), var(--profile-over-past))',
  over: 'var(--red)',
} as const;

/**
 * Ручной выбор карты из localStorage. try/catch обязателен (П3): приватное окно
 * и заблокированные site data кидают на самом обращении к `localStorage`, а не
 * возвращают null. Недоступно — `null`, и строка живёт на дефолте.
 */
function readMapChoice(key: string | undefined): boolean | null {
  if (!key || typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(key);
    return v === '1' ? true : v === '0' ? false : null;
  } catch {
    return null;
  }
}

function writeMapChoice(key: string | undefined, open: boolean): void {
  if (!key) return;
  try {
    window.localStorage.setItem(key, open ? '1' : '0');
  } catch {
    // Хранилище недоступно — выбор живёт до перезагрузки, дефолт не ломается.
  }
}

export function PipelineCockpit(props: PipelineCockpitProps) {
  return props.gauge === null ? <LegacyRow {...props} /> : <CockpitRow {...props} gauge={props.gauge} />;
}

/**
 * Строка до S-COCKPIT-ROW-1 — ветка лида (`gauge === null`), П4 спринта: ни класса
 * не тронуто. Сделки и внедрения сюда больше не попадают — у них `gauge` есть всегда.
 */
function LegacyRow({
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

      {mapOpen && <div className="mt-2">{typeof map === 'function' ? map({ collapse: toggleMap }) : map}</div>}
    </div>
  );
}

/**
 * S-COCKPIT-ROW-1: строка сделки/внедрения по макету (спека, раздел A).
 *
 * Строка 1 — группа ↔ metaRight на одной линии. Строка 2 — чип пройденных,
 * ячейка текущей со шкалой, готовность, CTA, хвост, мини-карта справа.
 *
 * Узкие ширины — container query на корне строки (`.cockpit-row`, globals.css),
 * а не ResizeObserver (П2): ни состояния в React, ни подписки, ни лишнего
 * рендера на каждый ресайз. `@container` поддерживают все целевые браузеры
 * (Chrome 105, Safari 16, Firefox 110); правило «мобайл-ферст», так что без
 * поддержки мини-карта просто скрыта — строка остаётся рабочей.
 */
function CockpitRow({
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
  mapDefaultOpen = false,
  mapStorageKey,
  dates,
  miniMap,
}: PipelineCockpitProps & { gauge: StageTimeGauge }) {
  // Ручной выбор перекрывает дефолт; дефолт при этом живой — смена стадии на
  // `closing` раскроет карту, если пользователь её не трогал (П3).
  const [manual, setManual] = useState<boolean | null>(() => readMapChoice(mapStorageKey));
  const mapOpen = manual ?? mapDefaultOpen;
  const toggleMap = () => {
    const nextOpen = !mapOpen;
    setManual(nextOpen);
    writeMapChoice(mapStorageKey, nextOpen);
  };
  // Карта-функция несёт «Свернуть» сама — шеврон строки остаётся только у свёрнутой.
  const mapOwnsCollapse = typeof map === 'function';
  const showChevron = !(mapOpen && mapOwnsCollapse);

  const gateItems = gate?.items ?? [];
  const showGate = !locked && gateItems.length > 0;
  const gateMet = gateItems.filter((i) => i.met).length;
  const gatePassed = gateItems.length === 0 || gateMet === gateItems.length;

  const state = gauge.state;
  const showDays = !locked && gauge.days != null;
  // Шкала — только при норме и днях: без нормы ячейка однострочная (A3).
  const showScale = showDays && gauge.norm != null && gauge.pct != null;
  const overBy = state === 'over' && gauge.days != null && gauge.norm != null ? gauge.days - gauge.norm : 0;

  return (
    <div className="cockpit-row group/cockpit">
      {(groupLabel || metaRight) && (
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <span
            className="text-[0.65625rem] font-bold uppercase tracking-wider"
            style={{ color: 'var(--accent-text, var(--accent))' }}
          >
            {groupLabel}
          </span>
          {metaRight && <span className="text-xs tabular-nums text-text-dim">{metaRight}</span>}
        </div>
      )}

      {/* Мини-карта — соседом ряда, а не его элементом: внутри flex-wrap она при
          нехватке места уезжала бы на отдельную строку (на 866px так и было). Здесь
          переносится левая часть, мини-карта остаётся справа на первой линии. */}
      <div className="flex items-center gap-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          {/* 1. Пройденные. Фон — surface2, не акцент: акцент зарезервирован за
              действием (CTA) и «идёт» (шкала), A1. */}
          {pastCount > 0 && (
            <>
              <button
                type="button"
                onClick={toggleMap}
                title={pastNames.join(', ')}
                className="inline-flex h-[2.125rem] items-center gap-[0.3125rem] rounded-xl bg-surface2 px-3
                           text-xs font-semibold text-text-dim transition-colors hover:bg-surface3"
              >
                <Check size={12} strokeWidth={3} style={{ color: 'var(--accent-text, var(--accent))' }} />
                {pastCount}
              </button>
              <span className="cockpit-conn h-[2px] w-3.5 rounded bg-border2" aria-hidden />
            </>
          )}

          {/* 2. Ячейка текущей: имя ↔ счётчик, шкала, подписи дат */}
          <div
            className="cockpit-cell grid gap-1.5 rounded-[0.875rem] border-[1.5px] bg-surface px-3.5 pb-[0.5625rem] pt-2"
            style={{ borderColor: locked ? 'var(--border)' : STATE_COLOR[state] }}
          >
            <div className="flex min-h-[1.125rem] items-center justify-between gap-3">
              <span className="text-sm font-semibold text-text-main">{current.name}</span>
              {showDays && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 text-[0.71875rem] font-semibold tabular-nums',
                    state === 'ok' && 'text-text-dim',
                  )}
                  style={{ color: STATE_TEXT[state] }}
                  title={gauge.norm != null ? `Норма стадии — ${gauge.norm} дн.` : undefined}
                >
                  {state === 'over' && <Clock size={12} aria-hidden />}
                  {gauge.days} дн.
                  {gauge.norm != null && (
                    <span className="font-normal text-text-dim">из {gauge.norm} по норме</span>
                  )}
                </span>
              )}
              {/* Терминал: вместо счётчика — дата выхода («Выиграна · 28 авг.»). */}
              {locked && dates?.closed && (
                <span className="text-[0.71875rem] tabular-nums text-text-dim">{dates.closed}</span>
              )}
              {currentExtra}
            </div>

            {showScale && (
              <>
                <div className="relative h-2 rounded bg-surface2" aria-hidden>
                  <div
                    className="absolute inset-y-0 left-0 rounded"
                    style={{ width: `${gauge.pct}%`, background: SCALE_FILL[state] }}
                  />
                  {/* «Сегодня» у over не рисуется — совпал бы с маркером нормы (A3). */}
                  {state !== 'over' && (
                    <span
                      className="absolute -top-[0.1875rem] h-3.5 w-[2px] -translate-x-1/2 rounded-[1px] bg-text-main"
                      style={{ left: `${gauge.pct}%` }}
                    />
                  )}
                  <span
                    className="absolute -top-[0.1875rem] right-0 h-3.5 w-[2px] rounded-[1px]"
                    style={{ background: STATE_COLOR[state] }}
                  />
                </div>
                {(dates?.entered || dates?.norm) && (
                  <div className="flex justify-between gap-3 text-[0.625rem] tabular-nums text-text-dim">
                    <span>{dates.entered ? `вход ${dates.entered}` : ''}</span>
                    {dates.norm && (
                      <span
                        className={cn(state === 'over' && 'font-semibold')}
                        style={state === 'over' ? { color: STATE_TEXT.over } : undefined}
                      >
                        норма {dates.norm}
                        {overBy > 0 && ` · +${overBy} дн.`}
                      </span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* 3. Готовность гейта */}
          {showGate && <GateChip items={gateItems} met={gateMet} title={gate!.title} rich />}

          {/* 4. Соединитель к следующей стадии */}
          {!locked && next && (
            <span
              aria-hidden
              className={cn('cockpit-conn h-[2px] w-3.5 rounded', gatePassed ? 'bg-accent' : 'bg-border2')}
            />
          )}

          {/* 5. Следующая стадия — сплошной акцент. Вероятность убрана: она уже в
              metaRight и в карте (A1). `locked` — приглушена, но кликается: истина на сервере. */}
          {!locked && next && (
            <button
              type="button"
              onClick={next.onClick}
              title={
                next.locked
                  ? `Перейти на «${next.label}» — требования ещё не закрыты`
                  : `Перейти на стадию «${next.label}»`
              }
              className={cn(
                'inline-flex h-[2.375rem] items-center gap-2 rounded-[0.8125rem] px-4 text-body font-semibold transition',
                next.locked ? 'bg-surface2 text-text-dim hover:bg-surface3' : 'bg-accent text-white hover:brightness-95',
              )}
              style={next.locked ? undefined : { boxShadow: 'var(--shadow-accent)' }}
            >
              {next.locked && <Lock size={12} aria-hidden />}
              {next.label}
              {!next.locked && <ArrowRight size={14} strokeWidth={2.4} aria-hidden />}
            </button>
          )}

          {!locked && extraActions}

          {/* 6–7. Хвост и разворот карты — неразрывной парой: при переносе уходят на
              вторую строку вместе, шеврон не остаётся один. В раскрытом виде
              «Свернуть» живёт в шапке карты (A1), и шеврона здесь нет. */}
          {(restCount > 0 || showChevron) && (
            <span className="inline-flex items-center gap-2.5">
              {restCount > 0 && (
                <button
                  type="button"
                  onClick={toggleMap}
                  title="Показать карту воронки"
                  className="rounded-full border border-dashed border-border2 px-[0.5625rem] py-[0.1875rem] text-meta
                             text-text-dim transition-colors hover:bg-surface2"
                >
                  +{restCount}
                  {restGroupsCount != null && restGroupsCount > 0 && ` · ${restGroupsCount} ${groupsWord(restGroupsCount)}`}
                </button>
              )}
              {showChevron && (
                <button
                  type="button"
                  onClick={toggleMap}
                  aria-expanded={mapOpen}
                  title={mapOpen ? 'Свернуть карту воронки' : 'Показать карту воронки'}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-mute
                             transition-colors hover:bg-surface2"
                >
                  {mapOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              )}
            </span>
          )}
        </div>

        {/* 8. Мини-карта групп. Скрыта container query при строке < 720 (П2). */}
        {miniMap && miniMap.groups.length > 0 && (
          <MiniMap groups={miniMap.groups} ring={locked ? null : STATE_COLOR[state]} />
        )}
      </div>

      {/* flex-col, а не блок: свёрнутое приглашение «Добавить подсказку» (h-0,
          inline-flex) в блочной обёртке всё равно давало строку высотой line-height —
          на листе П6 это читалось пустой полосой между строкой и картой. */}
      {guidance && <div className="mt-3 flex flex-col empty:mt-0">{guidance}</div>}

      {mapOpen && (
        <div className="mt-3.5">{typeof map === 'function' ? map({ collapse: toggleMap }) : map}</div>
      )}
    </div>
  );
}

/**
 * Мини-карта: сегмент на стадию, группы по phase_group. Ширина группы — ширина её
 * сегментов (как в макете: 54/54/35/54), подпись центрируется и может выступать
 * в зазор между группами: иначе широкие подписи раздвигают мини-карту, и на 900px
 * хвост «+N» уезжал на вторую строку. Нижняя граница 2.25rem — для групп из одной
 * стадии (фазы внедрения): без неё «ИНИЦ.» и «ПЛАН» сливались в одно слово.
 */
function MiniMap({ groups, ring }: { groups: CockpitMiniGroup[]; ring: string | null }) {
  return (
    <div className="cockpit-minimap ml-auto shrink-0 items-start gap-2.5" aria-hidden>
      {groups.map((g, gi) => {
        const isCurrent = g.segments.includes('current');
        return (
          <div
            key={`${g.key}-${gi}`}
            className="grid justify-items-center gap-[0.3125rem]"
            style={{ width: `max(2.25rem, ${g.segments.length + (g.segments.length - 1) * 0.1875}rem)` }}
            title={g.title ?? g.label}
          >
            <div className="flex gap-[0.1875rem]">
              {g.segments.map((seg, i) => (
                <i
                  key={i}
                  className="block h-1.5 w-4 rounded-[0.1875rem]"
                  style={{
                    background:
                      seg === 'done' ? 'var(--text)' : seg === 'current' ? 'var(--accent)' : 'var(--border)',
                    boxShadow:
                      seg === 'current' && ring ? `0 0 0 2px var(--surface), 0 0 0 3.5px ${ring}` : undefined,
                  }}
                />
              ))}
            </div>
            <span
              className={cn(
                '-mx-4 whitespace-nowrap text-center text-[0.59375rem] uppercase tracking-[0.04em]',
                isCurrent ? 'font-bold' : 'text-text-dim',
              )}
              style={isCurrent ? { color: 'var(--accent-text, var(--accent))' } : undefined}
            >
              {g.label}
            </span>
          </div>
        );
      })}
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
function GateChip({
  items,
  met,
  title,
  rich = false,
}: {
  items: CockpitGateItem[];
  met: number;
  title: string;
  /** S-COCKPIT-ROW-1: точки 8px над подписью; met — акцент с внутренней обводкой accent-text. */
  rich?: boolean;
}) {
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
      {rich ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          title={title}
          className="grid justify-items-center gap-1 rounded-lg px-1.5 py-1 text-[0.65625rem] text-text-dim
                     transition-colors hover:bg-surface2"
        >
          <span className="flex items-center gap-1">
            {items.map((item, i) => (
              <span
                key={i}
                aria-hidden
                className={cn('h-2 w-2 rounded-full', item.met ? 'bg-accent' : 'bg-surface3')}
                // Обводка — inset-тенью, а не border: точка остаётся 8px ровно.
                // met: accent-text поверх акцента — светлый акцент на белом без
                // обводки не читается (1.29:1 у лайма, спека A1).
                style={{
                  boxShadow: item.met
                    ? 'inset 0 0 0 1.5px var(--accent-text, var(--accent))'
                    : 'inset 0 0 0 1px var(--border2)',
                }}
              />
            ))}
          </span>
          готовность {met}/{items.length}
        </button>
      ) : (
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
      )}

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
