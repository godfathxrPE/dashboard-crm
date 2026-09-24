import type { StageTimeGauge, StageTimeState } from '@/lib/domain/stage-norm';
import { mskDateKey, shiftDateKeyByBuckets } from '@/lib/utils/date-helpers';

// ═══════════════════════════════════════════════════════
// S-STAGE-PROFILE-1: раскладка карты воронки «Профиль времени».
//
// Стадия — столбик, высота = дни; контур — норма, заливка — факт. Здесь только
// математика: масштаб, высоты, состояния колонок, суммы групп и футер. Разметку
// рисует `StageProfile`, данные собирает `ProjectStageCockpit`.
//
// Чистая логика: «сейчас» параметром, ноль запросов, юнит-тесты в tests/unit.
//
// ⚠️ Факт ТЕКУЩЕЙ стадии — `gauge.days` (текущий заход), а не `totalByStage`
// (все заходы): столбик и ячейка кокпита обязаны показывать одно число, и это
// держится общим объектом `gauge`, а не договорённостью.
//
// ⚠️ Факт бывает и у стадий ПОСЛЕ текущей: сделку откатывали назад (живые данные
// 24.09 — «ЭЙЧ ЭНД ЭН», «Продовольственный фонд»). Спека этого случая не знает.
// Колонка остаётся будущей (контур + «≈ норма» — это прогноз), а прошлые дни
// рисуются приглушённой заливкой `historic` — стирать историю нельзя, выдавать
// её за пройденную стадию тоже. В футер «прошло» такие дни входят: иначе он
// разошёлся бы с `ageDays − gauge.days`.
// ═══════════════════════════════════════════════════════

/** Рабочая высота столбика, px (колонка 110 минус число сверху). */
export const PROFILE_BAR_H = 90;
/** Минимальная высота ненулевой заливки — иначе 1 день на фоне 60 исчезает. */
export const PROFILE_MIN_FILL = 3;
/** Заглушка для факта 0 (стадия пройдена в тот же день). */
export const PROFILE_ZERO_FILL = 2;

export interface StageProfileInputStage {
  id: string;
  name: string;
  phase_group?: string | null;
}

export type ProfileColumnKind = 'past' | 'skipped' | 'current' | 'next' | 'todo';

/** Тон текущей колонки: состояние датчика, либо `muted` у терминала. */
export type ProfileTone = StageTimeState | 'muted';

export interface ProfileColumn {
  id: string;
  name: string;
  index: number;
  kind: ProfileColumnKind;
  /** Дни на стадии; null — не заходили (или у текущей пуст stage_entered_at). */
  fact: number | null;
  /** Норма дней; null — норм нет, контур не рисуется. */
  norm: number | null;
  visits: number;
  /** Высота заливки, px; 0 — заливки нет. */
  fillPx: number;
  /** Высота контура нормы, px; 0 — контура нет. */
  contourPx: number;
  /** Факт выше нормы: контур превращается в линию, верх заливки — пересвет. */
  over: boolean;
  /** Высота пересвета (часть заливки над линией нормы), px. */
  overPx: number;
  /** Будущая колонка с прошлыми днями (сделку откатывали): заливка приглушена. */
  historic: boolean;
  /** Только у текущей. */
  tone: ProfileTone | null;
  /** Линия «сегодня» на высоте факта текущей; null — не рисуется. */
  todayPx: number | null;
}

export interface ProfileGroup {
  key: string;
  /** Сколько стадий в группе — доля ширины в сетке. */
  span: number;
  /** Σ факт пройденных + текущей; null — фактов в группе нет («—»). */
  factSum: number | null;
  normSum: number | null;
  /** Тон группы с текущей стадией; null у остальных. */
  tone: ProfileTone | null;
}

export type ProfileFooter =
  | {
      mode: 'open';
      /** Σ факт всех стадий, кроме текущей (заход в неё — отдельно). */
      priorFact: number;
      /** Σ норм тех же стадий, где был заход; null — норм нет. */
      priorNorm: number | null;
      /** priorFact − priorNorm; null — сравнивать не с чем. */
      diff: number | null;
      /** Остаток нормы текущей + нормы будущих; null — норма хоть одной неизвестна. */
      ahead: number | null;
      /** Сколько дней назад исчерпана норма текущей; null — не исчерпана. */
      overBy: number | null;
      /** Прогноз финиша, YYYY-MM-DD по МСК; null — как у `ahead`. */
      finishKey: string | null;
    }
  | {
      /** won (allDone) — «воронка пройдена за», иначе — терминал без победы. */
      mode: 'won' | 'closed';
      /** Сколько стадий с заходом; 0 — журнал пуст (сделка закрыта до 27.07). */
      visited: number;
      totalFact: number;
      totalNorm: number | null;
      diff: number | null;
    };

export interface StageProfileLayout {
  pxPerDay: number;
  /** Подпись масштаба: «3 px = 1 день» / «1 px = 4 дн.»; null — норм нет. */
  scaleLabel: string | null;
  hasNorms: boolean;
  columns: ProfileColumn[];
  groups: ProfileGroup[];
  footer: ProfileFooter;
}

export interface StageProfileOptions {
  /**
   * Индекс «текущей» колонки. У открытой сделки — текущая стадия; у терминала без
   * победы (lost/converted) — последняя активная стадия до выхода, её столбик
   * остаётся с фактом; −1 — выделять нечего (won).
   */
  currentIndex: number;
  /** won: все стадии пройдены, «текущей» нет. */
  allDone?: boolean;
  /** Терминал: «сегодня» нет, тон текущей приглушён. */
  locked?: boolean;
  /** stageId → число заходов; ≥2 — бейдж «×N». */
  visits?: Record<string, number>;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Высота заливки по дням: минимум 3px у ненулевого факта, заглушка у нуля. */
function fillHeight(fact: number | null, pxPerDay: number): number {
  if (fact == null) return 0;
  if (fact === 0) return PROFILE_ZERO_FILL;
  return Math.max(PROFILE_MIN_FILL, fact * pxPerDay);
}

/**
 * Раскладка карты.
 *
 * @param factDays stageId → суммарно дней за все заходы (`StageStory.totalByStage`).
 *   Нет ключа — стадия не посещалась.
 * @param normDays stageId → норма (`resolveStageNorm`). Пустой объект — норм нет.
 * @param gauge датчик текущей стадии — ТОТ ЖЕ объект, что у ячейки кокпита.
 * @param now «сейчас» — для прогноза финиша (МСК-ключ дня).
 */
export function buildStageProfile(
  stages: StageProfileInputStage[],
  factDays: Record<string, number>,
  normDays: Record<string, number>,
  gauge: StageTimeGauge | null,
  now: Date,
  opts: StageProfileOptions,
): StageProfileLayout {
  const { allDone = false, locked = false, visits = {} } = opts;
  const currentIndex = allDone ? -1 : opts.currentIndex;
  // Терминал без победы: «текущая» — стадия, где сделка была на момент выхода.
  // Её факт — из журнала, а не из датчика: датчик меряет терминальную стадию.
  const terminal = locked && !allDone && currentIndex >= 0;
  const hasNorms = gauge !== null && Object.keys(normDays).length > 0;

  // ── 1. Сырые значения и типы колонок ──
  const raw = stages.map((stage, index) => {
    const known = Object.prototype.hasOwnProperty.call(factDays, stage.id);
    let kind: ProfileColumnKind;
    if (allDone || (currentIndex >= 0 && index < currentIndex)) kind = known ? 'past' : 'skipped';
    else if (index === currentIndex) kind = 'current';
    else if (currentIndex >= 0 && index === currentIndex + 1 && !locked) kind = 'next';
    else kind = 'todo';

    let fact: number | null = known ? factDays[stage.id] : null;
    if (kind === 'current' && !terminal) fact = gauge?.days ?? null;

    const norm = hasNorms ? (normDays[stage.id] ?? null) : null;
    return { stage, index, kind, fact, norm };
  });

  // ── 2. Масштаб ──
  const maxDays = Math.max(0, ...raw.map((c) => Math.max(c.fact ?? 0, c.norm ?? 0)));
  const pxPerDay = maxDays > 0 ? PROFILE_BAR_H / maxDays : PROFILE_BAR_H;
  const scaleLabel = !hasNorms
    ? null
    : pxPerDay >= 1
      ? `${round1(pxPerDay)} px = 1 день`
      : `1 px = ${round1(1 / pxPerDay)} дн.`;

  const tone: ProfileTone = locked ? 'muted' : (gauge?.state ?? 'ok');

  // ── 3. Колонки ──
  const columns: ProfileColumn[] = raw.map(({ stage, index, kind, fact, norm }) => {
    const future = kind === 'next' || kind === 'todo';
    const fillPx = fillHeight(fact, pxPerDay);
    const contourPx = norm != null && norm > 0 ? Math.max(PROFILE_MIN_FILL, norm * pxPerDay) : 0;
    // Пересвет — только у фактических заходов (не у истории будущей колонки:
    // её контур — прогноз, а не мерка для прошлого).
    const over = !future && fact != null && norm != null && fact > norm;
    return {
      id: stage.id,
      name: stage.name,
      index,
      kind,
      fact,
      norm,
      visits: visits[stage.id] ?? (fact != null && kind !== 'current' ? 1 : 0),
      fillPx: kind === 'skipped' ? 0 : fillPx,
      contourPx,
      over,
      overPx: over ? Math.max(0, fillPx - contourPx) : 0,
      historic: future && fact != null,
      tone: kind === 'current' ? tone : null,
      todayPx: kind === 'current' && !locked && fact != null ? fillPx : null,
    };
  });

  // ── 4. Группы — подряд идущие phase_group (та же логика, что в StageRail) ──
  const groups: ProfileGroup[] = [];
  const groupCols: ProfileColumn[][] = [];
  stages.forEach((stage, i) => {
    const key = stage.phase_group ?? '—';
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.span += 1;
      groupCols[groupCols.length - 1].push(columns[i]);
    } else {
      groups.push({ key, span: 1, factSum: null, normSum: null, tone: null });
      groupCols.push([columns[i]]);
    }
  });
  groups.forEach((g, gi) => {
    const cols = groupCols[gi];
    // Σ факт = сумме чисел над столбиками: будущие колонки печатают «≈ норма»,
    // поэтому их история в сумму не входит.
    const facts = cols
      .filter((c) => (c.kind === 'past' || c.kind === 'current') && c.fact != null)
      .map((c) => c.fact!);
    g.factSum = facts.length > 0 ? sum(facts) : null;
    g.normSum = hasNorms ? sum(cols.map((c) => c.norm ?? 0)) : null;
    const cur = cols.find((c) => c.kind === 'current');
    g.tone = cur ? cur.tone : null;
  });

  // ── 5. Футер ──
  let footer: ProfileFooter;
  if (locked || allDone) {
    const visited = columns.filter((c) => c.fact != null);
    const totalFact = sum(visited.map((c) => c.fact!));
    const totalNorm = hasNorms ? sum(visited.map((c) => c.norm ?? 0)) : null;
    footer = {
      mode: allDone ? 'won' : 'closed',
      visited: visited.length,
      totalFact,
      totalNorm,
      diff: totalNorm != null && visited.length > 0 ? totalFact - totalNorm : null,
    };
  } else {
    const prior = columns.filter((c) => c.kind !== 'current' && c.fact != null);
    const priorFact = sum(prior.map((c) => c.fact!));
    const priorNorm = hasNorms ? sum(prior.map((c) => c.norm ?? 0)) : null;
    const cur = columns.find((c) => c.kind === 'current') ?? null;
    const future = columns.filter((c) => c.kind === 'next' || c.kind === 'todo');

    let ahead: number | null = null;
    let overBy: number | null = null;
    if (hasNorms && cur && cur.norm != null && cur.fact != null && future.every((c) => c.norm != null)) {
      ahead = Math.max(0, cur.norm - cur.fact) + sum(future.map((c) => c.norm!));
      if (cur.fact > cur.norm) overBy = cur.fact - cur.norm;
    }

    footer = {
      mode: 'open',
      priorFact,
      priorNorm,
      diff: priorNorm != null && prior.length > 0 ? priorFact - priorNorm : null,
      ahead,
      overBy,
      // Та же ось дней, что у пунктира нормы на таймлайне: МСК-ключ + сдвиг на
      // UTC-полдне, иначе прогноз уехал бы на сутки на границе.
      finishKey: ahead != null ? shiftDateKeyByBuckets(mskDateKey(now), 'day', ahead) : null,
    };
  }

  return { pxPerDay, scaleLabel, hasNorms, columns, groups, footer };
}
