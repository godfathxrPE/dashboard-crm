'use client';

import { useMemo } from 'react';
import type { Task } from '@/types/entities';
import { mskMinutesOfDay, mskDateKey, mskTimeRange } from '@/lib/utils/date-helpers';

// Ось времени сетки: 07:00–22:00 (15 часовых полос). hourHeight в rem — вся
// вертикаль (top/height блоков, линии, линия «сейчас») считается от неё.
const START_HOUR = 7;
const END_HOUR = 22;
const HOURS = END_HOUR - START_HOUR;
const HOUR_REM = 3.5;
const GUTTER_REM = 3;
const START_MIN = START_HOUR * 60;
const END_MIN = END_HOUR * 60;
const MIN_BLOCK_REM = 1.25; // чтобы текст короткого блока не схлопывался

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

// Цвет левого акцента блока — семантические токены темы (inline var, без хардкода).
const PRIORITY_ACCENT: Record<string, string> = {
  critical: 'var(--danger)',
  important: 'var(--warning)',
  normal: 'var(--text-mute)',
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const remOfMin = (min: number) => ((min - START_MIN) / 60) * HOUR_REM;

interface WeekGridProps {
  /** Понедельник отображаемой недели (локальная полночь). */
  weekStart: Date;
  /** Уже отфильтрованные задачи: scheduled_start задан + isMine. */
  tasks: Task[];
  onSlotClick: (dayDate: Date, hour: number) => void;
  onBlockClick: (taskId: string) => void;
}

interface Placed {
  task: Task;
  startMin: number;
  endMin: number;
  lane: number;
  cols: number;
}

// Раскладка блоков одного дня по под-колонкам: кластеры пересекающихся интервалов,
// внутри — жадное назначение дорожки (первая свободная). cols = ширина кластера.
function layoutDay(items: { task: Task; startMin: number; endMin: number }[]): Placed[] {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const placed: Placed[] = [];
  let cluster: { task: Task; startMin: number; endMin: number; lane: number }[] = [];
  let clusterMaxEnd = -Infinity;
  let laneEnds: number[] = [];

  const flush = () => {
    const cols = cluster.reduce((m, c) => Math.max(m, c.lane + 1), 0);
    for (const c of cluster) placed.push({ ...c, cols });
    cluster = [];
    laneEnds = [];
    clusterMaxEnd = -Infinity;
  };

  for (const it of sorted) {
    if (cluster.length && it.startMin >= clusterMaxEnd) flush();
    let lane = laneEnds.findIndex((e) => e <= it.startMin);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = it.endMin;
    cluster.push({ ...it, lane });
    clusterMaxEnd = Math.max(clusterMaxEnd, it.endMin);
  }
  if (cluster.length) flush();
  return placed;
}

export function WeekGrid({ weekStart, tasks, onSlotClick, onBlockClick }: WeekGridProps) {
  // 7 дней недели: локальная полночь (для onSlotClick/шапки) + MSK-ключ (для матча задач).
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i);
        return { date: d, key: mskDateKey(d) };
      }),
    [weekStart],
  );

  // Задачи по дню недели, разложенные по под-колонкам.
  const perDay = useMemo(() => {
    const buckets: Record<string, { task: Task; startMin: number; endMin: number }[]> = {};
    for (const t of tasks) {
      if (!t.scheduled_start) continue;
      const key = mskDateKey(t.scheduled_start);
      const rawStart = mskMinutesOfDay(t.scheduled_start);
      const rawEnd = t.scheduled_end ? mskMinutesOfDay(t.scheduled_end) : rawStart + 60;
      // Клампим в диапазон 07–22, не теряем задачу вне окна (схлопнется к краю с min-высотой).
      const startMin = clamp(rawStart, START_MIN, END_MIN);
      const endMin = clamp(Math.max(rawEnd, rawStart + 15), START_MIN, END_MIN);
      (buckets[key] ??= []).push({ task: t, startMin, endMin });
    }
    const out: Record<string, Placed[]> = {};
    for (const key of Object.keys(buckets)) out[key] = layoutDay(buckets[key]);
    return out;
  }, [tasks]);

  // «Сегодня» и линия «сейчас» — по МСК.
  const now = new Date();
  const todayKey = mskDateKey(now);
  const nowMin = mskMinutesOfDay(now.toISOString());
  const showNow = days.some((d) => d.key === todayKey) && nowMin >= START_MIN && nowMin <= END_MIN;

  const gridCols = `${GUTTER_REM}rem repeat(7, 1fr)`;
  const bodyHeight = `${HOURS * HOUR_REM}rem`;

  return (
    <div style={{ minWidth: '48rem' }}>
      {/* Шапка дней */}
      <div style={{ display: 'grid', gridTemplateColumns: gridCols, borderBottom: '0.5px solid var(--border)' }}>
        <div />
        {days.map((d, i) => {
          const isToday = d.key === todayKey;
          return (
            <div
              key={d.key}
              style={{
                textAlign: 'center',
                padding: '0.375rem 0',
                color: isToday ? 'var(--accent)' : 'var(--text-mute)',
                fontWeight: isToday ? 600 : 500,
              }}
            >
              <div style={{ fontSize: '0.6875rem', letterSpacing: '0.03em' }}>{DAY_NAMES[i]}</div>
              <div style={{ fontSize: '0.9375rem', color: isToday ? 'var(--accent)' : 'var(--text)' }}>
                {d.date.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Тело: линейка часов + 7 колонок */}
      <div style={{ display: 'grid', gridTemplateColumns: gridCols }}>
        {/* Линейка часов */}
        <div style={{ position: 'relative', height: bodyHeight }}>
          {Array.from({ length: HOURS + 1 }, (_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: `${i * HOUR_REM}rem`,
                right: '0.5rem',
                transform: 'translateY(-0.5em)',
                fontSize: '0.6875rem',
                color: 'var(--text-mute)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {String(START_HOUR + i).padStart(2, '0')}:00
            </div>
          ))}
        </div>

        {/* Дни */}
        {days.map((d) => {
          const isToday = d.key === todayKey;
          return (
            <div
              key={d.key}
              style={{
                position: 'relative',
                height: bodyHeight,
                borderLeft: '0.5px solid var(--border)',
                background: isToday ? 'var(--surface)' : 'transparent',
              }}
            >
              {/* Часовые слоты (линии + клик по пустому месту) */}
              {Array.from({ length: HOURS }, (_, i) => (
                <div
                  key={i}
                  onClick={() => onSlotClick(d.date, START_HOUR + i)}
                  style={{
                    position: 'absolute',
                    top: `${i * HOUR_REM}rem`,
                    left: 0,
                    right: 0,
                    height: `${HOUR_REM}rem`,
                    borderTop: '0.5px solid var(--border)',
                    cursor: 'pointer',
                  }}
                />
              ))}

              {/* Линия «сейчас» */}
              {showNow && isToday && (
                <div
                  style={{
                    position: 'absolute',
                    top: `${remOfMin(nowMin)}rem`,
                    left: 0,
                    right: 0,
                    height: 0,
                    borderTop: '1px solid var(--danger)',
                    pointerEvents: 'none',
                    zIndex: 2,
                  }}
                />
              )}

              {/* Блоки задач */}
              {(perDay[d.key] ?? []).map((p) => {
                const topRem = remOfMin(p.startMin);
                const hRem = Math.max((p.endMin - p.startMin) / 60 * HOUR_REM, MIN_BLOCK_REM);
                const widthPct = 100 / p.cols;
                const range = mskTimeRange(p.task.scheduled_start, p.task.scheduled_end);
                return (
                  <button
                    key={p.task.id}
                    type="button"
                    onClick={() => onBlockClick(p.task.id)}
                    style={{
                      position: 'absolute',
                      top: `${topRem}rem`,
                      height: `${hRem}rem`,
                      left: `calc(${p.lane * widthPct}% + 0.125rem)`,
                      width: `calc(${widthPct}% - 0.25rem)`,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.0625rem',
                      overflow: 'hidden',
                      textAlign: 'left',
                      padding: '0.1875rem 0.375rem',
                      borderRadius: '0.25rem',
                      border: '0.5px solid var(--border)',
                      borderLeft: `2px solid ${PRIORITY_ACCENT[p.task.priority] ?? 'var(--text-mute)'}`,
                      background: 'var(--surface2, var(--surface))',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      zIndex: 1,
                    }}
                  >
                    {range && (
                      <span style={{ fontSize: '0.625rem', color: 'var(--text-dim)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
                        {range}
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        lineHeight: 1.2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {p.task.text}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
