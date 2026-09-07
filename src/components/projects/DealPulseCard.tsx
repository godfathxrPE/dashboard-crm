'use client';

import { TrendingUp } from 'lucide-react';
import { RailCard } from '@/components/shared/RailCard';
import { useDealPulse } from '@/lib/hooks/use-deal-pulse';
import { buildDealPulse, silenceWithin } from '@/lib/domain/deal-pulse';
import { mskDateKey, mskDayCaption } from '@/lib/utils/date-helpers';
import { pluralEvents } from '@/lib/domain/month-cells';
import { relativeTime } from '@/lib/utils/activity-events';
import type { Project } from '@/lib/hooks/use-projects';

// ═══════════════════════════════════════════════════════
// S-DEAL-PULSE-1 (W8): пульс активности сделки — последний в зоне «Риски».
//
// Отвечает на вопрос, который цифрой не отвечается: КАК шла сделка. «14
// событий» — число; провал в середине графика и три серых клетки подряд —
// картина, по которой видно, что две недели назад сделка стояла.
//
// Цвета — семантические токены (`--green` и его разбавления), НЕ `--accent`:
// в теме `t-washi` акцент равен `--red`, и «активный день» покрасился бы как
// ошибка. `--lime` спеки (написана под тему `minimal`) в продукте нет вовсе.
//
// Иконка `Activity` занята «Здоровьем» в этой же рельсе — берём `TrendingUp`.
// ═══════════════════════════════════════════════════════

const SPARK_WIDTH = 300;
const SPARK_HEIGHT = 46;
const SPARK_PAD_TOP = 4;
const SPARK_PAD_BOTTOM = 4;
const HEAT_WINDOW_DAYS = 14;
/** Разрыв короче — не «тишина», а обычная пауза между визитами. */
const MIN_SILENCE_TO_SHOW = 3;

function buildSparkline(points: readonly number[]) {
  const max = Math.max(1, ...points);
  const usable = SPARK_HEIGHT - SPARK_PAD_TOP - SPARK_PAD_BOTTOM;
  const stepX = SPARK_WIDTH / (points.length - 1);
  const coords = points.map((v, i) => ({
    x: i * stepX,
    y: SPARK_HEIGHT - SPARK_PAD_BOTTOM - (v / max) * usable,
  }));
  const line = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const area = `0,${SPARK_HEIGHT} ${line} ${SPARK_WIDTH},${SPARK_HEIGHT}`;
  return { line, area, end: coords[coords.length - 1] };
}

/** Заливка ступени тепловой полосы: 0 событий — фон, 1/2 — разбавленный
 *  зелёный, 3+ — полный. `color-mix` вместо второго hex-токена — тот же приём,
 *  что в `BoardColumn`/`PipelineBoard`. */
function heatBackground(count: number): string {
  if (count === 0) return 'var(--surface2)';
  if (count === 1) return 'color-mix(in srgb, var(--green) 22%, var(--surface))';
  if (count === 2) return 'color-mix(in srgb, var(--green) 45%, var(--surface))';
  return 'var(--green)';
}

export function DealPulseCard({ project }: { project: Project }) {
  const { data, isLoading, isError, error } = useDealPulse(project.id);

  if (isLoading) {
    return (
      <RailCard icon={TrendingUp} title="Пульс · 30 дней">
        <div className="animate-pulse space-y-2.5">
          <div className="h-[46px] rounded bg-surface2" />
          <div className="h-2.5 w-full rounded bg-surface2" />
          <div className="h-2.5 w-20 rounded bg-surface2" />
          <div className="grid grid-cols-[repeat(14,1fr)] gap-[3px]">
            {Array.from({ length: HEAT_WINDOW_DAYS }, (_, i) => (
              <div key={i} className="h-3.5 rounded bg-surface2" />
            ))}
          </div>
        </div>
      </RailCard>
    );
  }

  if (isError) {
    return (
      <RailCard icon={TrendingUp} title="Пульс · 30 дней">
        <p className="py-1 text-xs text-red">
          Не удалось загрузить пульс активности
          {error instanceof Error ? `: ${error.message}` : ''}
        </p>
      </RailCard>
    );
  }

  const now = new Date();
  const pulse = buildDealPulse(data ?? [], now);

  // Сделка создана сегодня и в журнале пусто — пульсу измерять нечего, это шум,
  // а не картина. Сделка старше дня с пустым журналом — это и есть тишина,
  // виджет остаётся и рисует 30 серых дней (аналогия с `PinnedNoteCard`, которая
  // всегда на месте, здесь не работает: там редактор и есть пустое состояние).
  if (pulse.total === 0 && mskDateKey(project.created_at) === mskDateKey(now)) {
    return null;
  }

  const spark = buildSparkline(pulse.points);
  const heatDays = pulse.days.slice(-HEAT_WINDOW_DAYS);
  const heatSilence = silenceWithin(pulse.days, HEAT_WINDOW_DAYS);
  const showSilenceLabel = pulse.longestSilence.days >= MIN_SILENCE_TO_SHOW;

  return (
    <RailCard
      icon={TrendingUp}
      title="Пульс · 30 дней"
      action={
        <span className="text-xs tabular-nums text-text-mute">
          {pluralEvents(pulse.total)} · последнее {relativeTime(pulse.lastEventAt)}
        </span>
      }
    >
      <svg
        aria-hidden="true"
        width="100%"
        height={SPARK_HEIGHT}
        viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
        preserveAspectRatio="none"
        className="block"
      >
        <defs>
          <linearGradient id={`deal-pulse-spark-${project.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--green)" stopOpacity="0.7" />
            <stop offset="1" stopColor="var(--green)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={spark.area} fill={`url(#deal-pulse-spark-${project.id})`} />
        <polyline
          points={spark.line}
          fill="none"
          stroke="var(--green)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle cx={spark.end.x} cy={spark.end.y} r="3.5" fill="var(--text)" />
      </svg>

      {/* График не носитель уникального смысла — числа рядом уже сказаны в
          шапке (total/последнее) и здесь (начало окна · тишина · сегодня). */}
      <div className="my-0.5 flex items-baseline justify-between text-[9.5px] text-text-mute">
        <span>{mskDayCaption(pulse.days[0].day)}</span>
        {showSilenceLabel && (
          <span className="tabular-nums">тишина {pulse.longestSilence.days} дн.</span>
        )}
        <span>сегодня</span>
      </div>

      <div className="mb-1.5 mt-2.5 text-[10.5px] text-text-mute">
        Дни без активности · {heatSilence.days} дн.
      </div>
      <div className="grid grid-cols-[repeat(14,1fr)] gap-[3px]">
        {heatDays.map((d) => (
          <span
            key={d.day}
            className="h-3.5 rounded"
            style={{ background: heatBackground(d.count) }}
            title={`${d.count} событ. · ${mskDayCaption(d.day)}`}
          />
        ))}
      </div>
    </RailCard>
  );
}
