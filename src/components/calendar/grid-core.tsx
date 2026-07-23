'use client';

// Механика вертикальной сетки тайм-блоков — общий модуль для недельной (WeekGrid)
// и командной (TeamDayGrid) сеток. Извлечено из WeekGrid БЕЗ изменения поведения
// (A2a/A2b/A2c): константы оси, геометрия, упаковка колонки, read-only MeetingBlock.
// .tsx (не .ts) — модуль экспортирует React-компонент MeetingBlock.

import { Calendar } from 'lucide-react';
import type { Task } from '@/types/entities';
import type { Meeting } from '@/lib/hooks/use-meetings';

// Ось времени сетки: 07:00–22:00 (15 часовых полос). hourHeight в rem — вся
// вертикаль (top/height блоков, линии, линия «сейчас») считается от неё.
export const START_HOUR = 7;
export const END_HOUR = 22;
export const HOURS = END_HOUR - START_HOUR;
export const HOUR_REM = 3.5;
export const GUTTER_REM = 3;
export const START_MIN = START_HOUR * 60;
export const END_MIN = END_HOUR * 60;
export const MIN_BLOCK_REM = 1.25; // чтобы текст короткого блока не схлопывался
export const SNAP = 15;            // шаг привязки drag/resize, мин
export const MIN_DUR = 15;         // минимальная длительность блока, мин
// Схема meetings без end/duration → номинальная высота для отрисовки. Реальную
// длительность даст будущая миграция (meetings.end_time/duration_min) — тогда
// встречи станут настоящими интервалами; сейчас держим место.
export const MEETING_NOMINAL_MIN = 30;

// Цвет левого акцента блока — семантические токены темы (inline var, без хардкода).
export const PRIORITY_ACCENT: Record<string, string> = {
  critical: 'var(--danger)',
  important: 'var(--warning)',
  normal: 'var(--text-mute)',
};

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const remOfMin = (min: number) => ((min - START_MIN) / 60) * HOUR_REM;

// naive `time` ('HH:MM' | 'HH:MM:SS') → минуты от полуночи; null/битое → null.
// Это `time without time zone` (МСК wall-clock как ввели) — прямой парс, БЕЗ
// mskMinutesOfDay (та ждёт ISO-timestamp и сдвинула бы TZ).
export function timeToMin(t: string | null): number | null {
  if (!t) return null;
  const m = /^(\d{2}):(\d{2})/.exec(t);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  return h >= 0 && h < 24 && min >= 0 && min < 60 ? h * 60 + min : null;
}

// A2c: единая упаковка — задача (draggable) или встреча (read-only), два рендер-класса.
export type GridItem =
  | { kind: 'task'; task: Task }
  | { kind: 'meeting'; meeting: Meeting };

export interface Placed {
  item: GridItem;
  startMin: number;
  endMin: number;
  lane: number;
  cols: number;
}

// Раскладка блоков одной колонки по под-дорожкам: кластеры пересекающихся интервалов,
// внутри — жадное назначение дорожки (первая свободная). cols = ширина кластера.
// A2c: обобщено над GridItem — алгоритм тот же, меняется только payload (task→item).
export function layoutColumn(items: { item: GridItem; startMin: number; endMin: number }[]): Placed[] {
  const sorted = [...items].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const placed: Placed[] = [];
  let cluster: { item: GridItem; startMin: number; endMin: number; lane: number }[] = [];
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

interface MeetingBlockProps {
  p: Placed;
  meeting: Meeting;
  onMeetingClick: (meetingId: string) => void;
}

// Встреча в сетке: read-only (внешнее событие, не задача) — обычный <button> БЕЗ
// useDraggable/resize. Визуально отдельный класс: пунктирная рамка var(--accent),
// иконка Calendar, naive-время. Клик → MeetingModal в родителе. Высота номинальная.
export function MeetingBlock({ p, meeting, onMeetingClick }: MeetingBlockProps) {
  const { startMin, endMin, lane, cols } = p;
  const topRem = remOfMin(startMin);
  const hRem = Math.max((endMin - startMin) / 60 * HOUR_REM, MIN_BLOCK_REM);
  const widthPct = 100 / cols;

  return (
    <button
      type="button"
      onClick={() => onMeetingClick(meeting.id)}
      style={{
        position: 'absolute',
        top: `${topRem}rem`,
        height: `${hRem}rem`,
        left: `calc(${lane * widthPct}% + 0.125rem)`,
        width: `calc(${widthPct}% - 0.25rem)`,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.0625rem',
        overflow: 'hidden',
        textAlign: 'left',
        padding: '0.1875rem 0.375rem',
        borderRadius: '0.25rem',
        border: '1px dashed var(--accent)',
        background: 'var(--surface)',
        color: 'var(--text)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        zIndex: 1,
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.1875rem',
          fontSize: '0.625rem',
          color: 'var(--accent)',
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1.2,
        }}
      >
        <Calendar size={11} strokeWidth={1.5} style={{ flexShrink: 0 }} />
        {meeting.time?.slice(0, 5)}
      </span>
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
        {meeting.title}
      </span>
      {meeting.location && (
        <span
          style={{
            fontSize: '0.625rem',
            color: 'var(--text-dim)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {meeting.location}
        </span>
      )}
    </button>
  );
}
