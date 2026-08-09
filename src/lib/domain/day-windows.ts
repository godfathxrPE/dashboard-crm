// ═══════════════════════════════════════════════════════
// S-CAL-LANES-1: свободное окно дня — чистый домен, без React.
//
// «Паспорт дня» слева от дорожки отвечает на единственный вопрос, ради которого
// человек открывает неделю: КОГДА Я СВОБОДЕН. Считать это в компоненте нельзя —
// правила («окно короче 45 минут окном не считается», «события вне рабочей рамки
// её не сужают») слишком легко разъезжаются с тем, что показано в UI.
//
// Ось — минуты от полуночи МСК (как всё календарное в проекте: mskMinutesOfDay).
// ═══════════════════════════════════════════════════════

export interface TimedInterval {
  startMin: number;
  endMin: number;
}

/** Рабочая рамка по умолчанию: окно «07–09» никому не нужно, оно не окно, а ночь. */
export const WORK_START_MIN = 9 * 60;
export const WORK_END_MIN = 18 * 60;

/** Промежуток короче — это не окно, а зазор между событиями. */
export const MIN_WINDOW_MIN = 45;

/**
 * Слияние пересекающихся и соприкасающихся интервалов.
 *
 * ⚠️ Соприкасающиеся (10:00–11:00 и 11:00–12:00) сливаются намеренно: зазор
 * нулевой длины окном стать не может, а два интервала вместо одного дали бы
 * лишнюю итерацию с гарантированно отброшенным результатом.
 */
export function mergeIntervals(items: TimedInterval[]): TimedInterval[] {
  const sorted = items
    .filter((i) => i.endMin > i.startMin)
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const out: TimedInterval[] = [];
  for (const it of sorted) {
    const last = out[out.length - 1];
    if (last && it.startMin <= last.endMin) last.endMin = Math.max(last.endMin, it.endMin);
    else out.push({ startMin: it.startMin, endMin: it.endMin });
  }
  return out;
}

/**
 * Наибольший свободный промежуток рабочего дня между событиями.
 * `null` — свободного места ≥ MIN_WINDOW_MIN в рамке не осталось.
 *
 * События целиком вне рамки её не сужают: встреча в 20:00 не отнимает вечер у дня,
 * который в рамке 9–18 пуст. Технически это клип к рамке + отбрасывание пустых.
 */
export function largestFreeWindow(
  items: TimedInterval[],
  workStart = WORK_START_MIN,
  workEnd = WORK_END_MIN,
): TimedInterval | null {
  if (workEnd - workStart < MIN_WINDOW_MIN) return null;

  const busy = mergeIntervals(items)
    .map((i) => ({ startMin: Math.max(i.startMin, workStart), endMin: Math.min(i.endMin, workEnd) }))
    .filter((i) => i.endMin > i.startMin);

  let best: TimedInterval | null = null;
  const consider = (startMin: number, endMin: number) => {
    const len = endMin - startMin;
    if (len < MIN_WINDOW_MIN) return;
    if (!best || len > best.endMin - best.startMin) best = { startMin, endMin };
  };

  let cursor = workStart;
  for (const b of busy) {
    consider(cursor, b.startMin);
    cursor = Math.max(cursor, b.endMin);
  }
  consider(cursor, workEnd);

  return best;
}

/** «11», «15:30» — час без нулевых минут, как в утверждённом макете. */
export function formatMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const hh = String(h).padStart(2, '0');
  return m === 0 ? hh : `${hh}:${String(m).padStart(2, '0')}`;
}

/**
 * Подпись окна для паспорта дня. Разделена на `prefix` + `value`, потому что
 * значение в макете акцентное (вес 600, `--accent`), а префикс — нет; строкой
 * это пришлось бы резать регэкспом в компоненте.
 */
export interface FreeWindowLabel {
  prefix: string;
  /** null — подпись целиком в `prefix` («весь день свободен»). */
  value: string | null;
}

export function formatFreeWindow(
  items: TimedInterval[],
  workStart = WORK_START_MIN,
  workEnd = WORK_END_MIN,
): FreeWindowLabel {
  const win = largestFreeWindow(items, workStart, workEnd);
  if (!win) return { prefix: 'нет окна', value: null };
  if (win.startMin <= workStart && win.endMin >= workEnd) return { prefix: 'весь день свободен', value: null };
  if (win.endMin >= workEnd) return { prefix: 'окно', value: `после ${formatMin(win.startMin)}` };
  if (win.startMin <= workStart) return { prefix: 'окно', value: `до ${formatMin(win.endMin)}` };
  return { prefix: 'окно', value: `${formatMin(win.startMin)} – ${formatMin(win.endMin)}` };
}
