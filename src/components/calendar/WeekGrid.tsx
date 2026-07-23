'use client';

import { useMemo, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { Calendar } from 'lucide-react';
import type { Task } from '@/types/entities';
import type { Meeting } from '@/lib/hooks/use-meetings';
import {
  mskMinutesOfDay,
  mskDateKey,
  localDateTimeKey,
  datetimeLocalToIso,
} from '@/lib/utils/date-helpers';
// B1: механика сетки вынесена в общий модуль (константы, геометрия, упаковка,
// GridItem/Placed, read-only MeetingBlock). Поведение недельной сетки не изменилось.
// B2: draggable-блок тоже вынесен в grid-core как DraggableTimeBlock (доедена
// унификация B1) — обе сетки используют один блок; интерпретация Δ живёт в родителе.
import {
  START_HOUR, HOURS, HOUR_REM, GUTTER_REM, START_MIN, END_MIN,
  SNAP, MIN_DUR, MEETING_NOMINAL_MIN,
  clamp, remOfMin, timeToMin, layoutColumn, MeetingBlock, DraggableTimeBlock,
  type GridItem, type Placed, type MoveData,
} from '@/components/calendar/grid-core';

const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

// Локальный Date для (день, минута-от-полуночи-МСК). Ввод трактуется как
// browser-local — тот же путь, что при создании (browser==МСК; полная TZ-
// независимость — отдельный hardening, см. долги A2b).
const atMin = (dayDate: Date, min: number) =>
  new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), Math.floor(min / 60), min % 60);

interface WeekGridProps {
  /** Понедельник отображаемой недели (локальная полночь). */
  weekStart: Date;
  /** Уже отфильтрованные задачи: scheduled_start задан + isMine. */
  tasks: Task[];
  /** A2c: встречи недели (org-scoped RLS). Read-only слой отдельным классом. */
  meetings: Meeting[];
  onSlotClick: (dayDate: Date, hour: number) => void;
  onBlockClick: (taskId: string) => void;
  /** A2b: применить новое расписание задачи (drag/resize). Мутирует родитель. */
  onReschedule: (taskId: string, startIso: string, endIso: string) => void;
  /** A2c: открыть встречу (существующая MeetingModal в родителе). */
  onMeetingClick: (meetingId: string) => void;
}

export function WeekGrid({ weekStart, tasks, meetings, onSlotClick, onBlockClick, onReschedule, onMeetingClick }: WeekGridProps) {
  const colRef = useRef<HTMLDivElement>(null);
  const [resize, setResize] = useState<{ id: string; endMin: number } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  // 7 дней недели: локальная полночь (для onSlotClick/шапки) + MSK-ключ (для матча задач).
  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i);
        return { date: d, key: mskDateKey(d) };
      }),
    [weekStart],
  );

  // По дню недели: задачи + timed-встречи в единой упаковке (Placed[]), плюс
  // all-day-встречи (time===null) отдельным набором для чипов сверху колонки.
  const { perDay, allDay } = useMemo(() => {
    const dayKeys = new Set(days.map((d) => d.key));
    const buckets: Record<string, { item: GridItem; startMin: number; endMin: number }[]> = {};
    const allDayBuckets: Record<string, Meeting[]> = {};

    for (const t of tasks) {
      if (!t.scheduled_start) continue;
      const key = mskDateKey(t.scheduled_start);
      const rawStart = mskMinutesOfDay(t.scheduled_start);
      const rawEnd = t.scheduled_end ? mskMinutesOfDay(t.scheduled_end) : rawStart + 60;
      // Клампим в диапазон 07–22, не теряем задачу вне окна (схлопнется к краю с min-высотой).
      const startMin = clamp(rawStart, START_MIN, END_MIN);
      const endMin = clamp(Math.max(rawEnd, rawStart + MIN_DUR), START_MIN, END_MIN);
      (buckets[key] ??= []).push({ item: { kind: 'task', task: t }, startMin, endMin });
    }

    // Встречи: день = date.slice(0,10) (как в month-view). Время — naive `time`,
    // прямой парс (не ISO-путь). Без времени → all-day чип, не теряем.
    for (const m of meetings) {
      const key = m.date?.slice(0, 10);
      if (!key || !dayKeys.has(key)) continue;
      const s = timeToMin(m.time);
      if (s === null) {
        (allDayBuckets[key] ??= []).push(m);
        continue;
      }
      const startMin = clamp(s, START_MIN, END_MIN);
      const endMin = clamp(s + MEETING_NOMINAL_MIN, START_MIN, END_MIN);
      (buckets[key] ??= []).push({ item: { kind: 'meeting', meeting: m }, startMin, endMin });
    }

    const out: Record<string, Placed[]> = {};
    for (const key of Object.keys(buckets)) out[key] = layoutColumn(buckets[key]);
    return { perDay: out, allDay: allDayBuckets };
  }, [tasks, meetings, days]);

  // «Сегодня» и линия «сейчас» — по МСК.
  const now = new Date();
  const todayKey = mskDateKey(now);
  const nowMin = mskMinutesOfDay(now.toISOString());
  const showNow = days.some((d) => d.key === todayKey) && nowMin >= START_MIN && nowMin <= END_MIN;

  const gridCols = `${GUTTER_REM}rem repeat(7, 1fr)`;
  const bodyHeight = `${HOURS * HOUR_REM}rem`;

  // Геометрия из runtime (не rem→px хардкод): высота колонки → px/мин, ширина → px/день.
  const readPxPerMin = () => {
    const el = colRef.current;
    return el ? el.clientHeight / (HOURS * 60) : 1;
  };
  const readColWidthPx = () => colRef.current?.clientWidth ?? 1;

  // DRAG-перенос: Δдень из delta.x/ширина, Δмин из delta.y/(px/мин) со snap 15;
  // длительность сохраняется, старт клампится в окно. ISO — путём создания.
  function handleDragEnd(e: DragEndEvent) {
    const data = e.active.data.current as MoveData | undefined;
    if (!data || data.mode !== 'move') return;
    const pxPerMin = readPxPerMin();
    const deltaDays = Math.round(e.delta.x / readColWidthPx());
    const deltaMin = Math.round((e.delta.y / pxPerMin) / SNAP) * SNAP;
    if (deltaDays === 0 && deltaMin === 0) return;

    const dur = data.endMin - data.startMin;
    const newStartMin = clamp(data.startMin + deltaMin, START_MIN, END_MIN - dur);
    const newDayDate = days[clamp(data.colIndex + deltaDays, 0, 6)].date;
    const startDate = atMin(newDayDate, newStartMin);
    const startIso = datetimeLocalToIso(localDateTimeKey(startDate));
    const endIso = datetimeLocalToIso(localDateTimeKey(new Date(startDate.getTime() + dur * 60000)));
    if (startIso && endIso) onReschedule(data.task.id, startIso, endIso);
  }

  // RESIZE-коммит: старт не меняется, endIso из (день, новый конец МСК).
  function handleResizeCommit(task: Task, dayDate: Date, newEndMin: number) {
    const endIso = datetimeLocalToIso(localDateTimeKey(atMin(dayDate, newEndMin)));
    if (task.scheduled_start && endIso) onReschedule(task.id, task.scheduled_start, endIso);
  }

  const handleResizePreview = (id: string | null, endMin: number) =>
    setResize(id ? { id, endMin } : null);

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

      {/* Тело: линейка часов + 7 колонок (draggable-блоки внутри DndContext) */}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
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
          {days.map((d, dayIndex) => {
            const isToday = d.key === todayKey;
            return (
              <div
                key={d.key}
                ref={dayIndex === 0 ? colRef : undefined}
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

                {/* Блоки: задачи (draggable) + встречи (read-only), единая упаковка */}
                {(perDay[d.key] ?? []).map((p) =>
                  p.item.kind === 'task' ? (
                    <DraggableTimeBlock
                      key={p.item.task.id}
                      p={p}
                      task={p.item.task}
                      colIndex={dayIndex}
                      dayDate={d.date}
                      renderEndMin={resize?.id === p.item.task.id ? resize.endMin : p.endMin}
                      onBlockClick={onBlockClick}
                      readPxPerMin={readPxPerMin}
                      onResizePreview={handleResizePreview}
                      onResizeCommit={handleResizeCommit}
                    />
                  ) : (
                    <MeetingBlock
                      key={p.item.meeting.id}
                      p={p}
                      meeting={p.item.meeting}
                      onMeetingClick={onMeetingClick}
                    />
                  ),
                )}

                {/* All-day встречи (без времени): чипы сверху колонки, read-only.
                    Полноценная all-day-полоса над телом — refinement (см. долги). */}
                {(allDay[d.key] ?? []).map((m, i) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onMeetingClick(m.id)}
                    title={m.title}
                    style={{
                      position: 'absolute',
                      top: `${i * 1.1}rem`,
                      left: '0.125rem',
                      right: '0.125rem',
                      height: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.1875rem',
                      padding: '0 0.25rem',
                      borderRadius: '0.25rem',
                      border: '1px dashed var(--accent)',
                      background: 'var(--surface)',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: '0.625rem',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      zIndex: 2,
                    }}
                  >
                    <Calendar size={10} strokeWidth={1.5} style={{ flexShrink: 0, color: 'var(--accent)' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </DndContext>
    </div>
  );
}
