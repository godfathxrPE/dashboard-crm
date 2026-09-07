// src/lib/domain/deal-pulse.ts — S-DEAL-PULSE-1 (W8)
//
// «Пульс» отвечает на вопрос, который цифрой не отвечается: КАК шла сделка.
// «14 событий» — число; провал в середине графика и три серых клетки подряд —
// картина, по которой видно, что две недели назад сделка стояла.
//
// Ось дней — `mskDateKey` (`lib/utils/date-helpers.ts`), НЕ `mskMinutesOfDay`
// и НЕ `lib/domain/day-windows.ts`: та ось — минуты внутри суток для окон
// рабочего дня календаря, для раскладки событий по календарным дням не годится.
//
// `now` — аргумент, не `Date.now()` внутри (урок S-LEAD-HUB-2b: leadStaleness
// читала часы мимо переданного времени, и тест этого не поймал).
//
// Спека W8 говорит «16 точек = 30 дней / 2» — 30/2 = 15, офф-бай-ван спеки.
// Берём 15: окно ровно 30 дней, пары без остатка (см. ТЕСТЫ спринта).

import { mskDateKey } from '@/lib/utils/date-helpers';

const WINDOW_DAYS = 30;
const MS_PER_DAY = 86_400_000;

export interface PulsePoint {
  /** Календарный день по МСК, 'YYYY-MM-DD'. */
  day: string;
  count: number;
}

export interface SilenceGap {
  /** Длина самого длинного разрыва подряд идущих нулей (в днях). */
  days: number;
  /** Последний день разрыва — календарный ключ, либо `null`, если разрывов нет. */
  endedOn: string | null;
}

export interface DealPulse {
  /** 30 дней от now−29 до now включительно, БЕЗ пропусков — дни без событий = 0. */
  days: PulsePoint[];
  /** 15 значений: пары дней, сумма — вершины спарклайна. */
  points: number[];
  total: number;
  /** Максимальный разрыв подряд идущих нулей ЗА ВСЕ 30 дней, включая хвост. */
  longestSilence: SilenceGap;
  lastEventAt: string | null;
}

/**
 * Самый длинный разрыв подряд идущих нулей в переданном срезе дней.
 *
 * Разрыв, упирающийся в границу среза (начало ИЛИ конец), считается наравне с
 * «завершёнными»: если событий не было последние 9 дней, это самый важный
 * разрыв, а не «незавершённый» и потому невидимый.
 *
 * При равенстве длин побеждает более поздний разрыв (`>=`, не `>`) — он ближе
 * к «сегодня» и практически важнее для читателя виджета.
 */
function longestZeroRun(points: readonly PulsePoint[]): SilenceGap {
  let bestLen = 0;
  let bestEnd: string | null = null;
  let curLen = 0;
  let curEnd: string | null = null;

  for (const p of points) {
    if (p.count === 0) {
      curLen += 1;
      curEnd = p.day;
      if (curLen >= bestLen) {
        bestLen = curLen;
        bestEnd = curEnd;
      }
    } else {
      curLen = 0;
      curEnd = null;
    }
  }

  return { days: bestLen, endedOn: bestLen > 0 ? bestEnd : null };
}

/**
 * Разрыв тишины В ПРЕДЕЛАХ последних `n` дней среза `days` — отдельно от
 * `longestSilence` за все 30, чтобы тепловая полоса (14 дней) и её заголовок
 * говорили про одно и то же число, а не про разные окна (W2 ревью).
 */
export function silenceWithin(days: readonly PulsePoint[], n: number): SilenceGap {
  return longestZeroRun(days.slice(-n));
}

export function buildDealPulse(
  events: readonly { created_at: string }[],
  now: Date,
): DealPulse {
  // Календарные ключи 30 дней окна, от now−29 до now включительно. МСК — фиксированный
  // офсет (без перевода часов), поэтому шаг «минус 24ч в UTC» = «минус один календарный
  // день в МСК» без расхождений на границе.
  const dayKeys: string[] = [];
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    dayKeys.push(mskDateKey(new Date(now.getTime() - i * MS_PER_DAY)));
  }

  const counts = new Map<string, number>();
  for (const key of dayKeys) counts.set(key, 0);

  let lastEventAt: string | null = null;
  for (const ev of events) {
    const key = mskDateKey(ev.created_at);
    // Событие вне 30-дневного окна (старше) в бакеты не попадает и total его не
    // считает — ключ дня не найдётся среди 30 подготовленных.
    if (!counts.has(key)) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (lastEventAt === null || new Date(ev.created_at).getTime() > new Date(lastEventAt).getTime()) {
      lastEventAt = ev.created_at;
    }
  }

  const days: PulsePoint[] = dayKeys.map((day) => ({ day, count: counts.get(day) ?? 0 }));

  // 15 точек спарклайна: пары дней (0,1)…(28,29), сумма пары. 30 дней делятся
  // без остатка — паддинга 16-й нулевой точкой нет.
  const points: number[] = [];
  for (let i = 0; i < days.length; i += 2) {
    points.push(days[i].count + (days[i + 1]?.count ?? 0));
  }

  const total = days.reduce((sum, d) => sum + d.count, 0);
  const longestSilence = longestZeroRun(days);

  return { days, points, total, longestSilence, lastEventAt };
}
