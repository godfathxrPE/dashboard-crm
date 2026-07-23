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
import type { TeamMember } from '@/lib/hooks/use-team-members';
import {
  mskMinutesOfDay, mskDateKey, localDateTimeKey, datetimeLocalToIso,
} from '@/lib/utils/date-helpers';
import {
  START_HOUR, HOURS, HOUR_REM, GUTTER_REM, START_MIN, END_MIN,
  SNAP, MIN_DUR, MEETING_NOMINAL_MIN,
  clamp, remOfMin, timeToMin, layoutColumn, MeetingBlock, DraggableTimeBlock,
  type GridItem, type Placed, type MoveData,
} from '@/components/calendar/grid-core';

// Локальный Date для (день, минута-от-полуночи-МСК) — путь A2b (browser==МСК).
// Дублируется из WeekGrid намеренно: недельный drag-путь не трогаем (диф хирургический).
const atMin = (dayDate: Date, min: number) =>
  new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), Math.floor(min / 60), min % 60);

// Служебная колонка для задач/встреч, чей владелец вне текущего состава org
// (обычно пусто — рендерим только если реально встретится, не теряем данные).
const OTHER = '__other__';

const ROLE_LABEL: Record<string, string> = {
  owner: 'Владелец',
  admin: 'Админ',
  manager: 'Менеджер',
  viewer: 'Наблюдатель',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}

interface TeamDayGridProps {
  /** Отображаемый день (локальная полночь). */
  dayDate: Date;
  /** Со-члены org — колонки сетки (порядок как отдал useTeamMembers). */
  members: TeamMember[];
  /** Уже отфильтрованные задачи дня (scheduled_start в этом дне; БЕЗ isMine). */
  tasks: Task[];
  /** Уже отфильтрованные встречи дня (org-scoped RLS). */
  meetings: Meeting[];
  /** meeting_id → profile_id[] внутренних участников (для раскладки по дорожкам). */
  attendeesMap: Record<string, string[]>;
  onBlockClick: (taskId: string) => void;
  onMeetingClick: (meetingId: string) => void;
  /** B2: drag=reschedule (Δy) / reassign (Δx→assigned_to). Мутирует родитель (optimistic). */
  onTeamReschedule: (taskId: string, patch: { scheduled_start: string; scheduled_end: string; assigned_to?: string }) => void;
  /** B2: cross-lane reassign разрешён только owner/admin (UI-гейт; RLS — второй слой). */
  canReassign: boolean;
}

interface ColumnDef {
  id: string;
  member: TeamMember | null; // null → служебная «Прочие»
}

interface ColumnData {
  items: { item: GridItem; startMin: number; endMin: number }[];
  allDay: Meeting[];
}

// Дневная сетка «Команда»: колонки = люди, та же вертикальная механика 07–22
// из grid-core. Задача → дорожка assigned_to ?? created_by. Встреча → дорожки
// участников (attendeesMap), при отсутствии профилей — дорожка created_by;
// встреча может лечь в несколько дорожек (по блоку в каждой). Read-only.
export function TeamDayGrid({
  dayDate, members, tasks, meetings, attendeesMap,
  onBlockClick, onMeetingClick, onTeamReschedule, canReassign,
}: TeamDayGridProps) {
  const colRef = useRef<HTMLDivElement>(null);
  const [resize, setResize] = useState<{ id: string; endMin: number } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const { columns, byColumn } = useMemo(() => {
    const memberIds = new Set(members.map((m) => m.id));
    const buckets: Record<string, ColumnData> = {};
    const ensure = (id: string) => (buckets[id] ??= { items: [], allDay: [] });
    let usedOther = false;

    // Задачи: дорожка = исполнитель, иначе автор (зеркало isMine). Вне состава → «Прочие».
    for (const t of tasks) {
      if (!t.scheduled_start) continue;
      const lane = t.assigned_to ?? t.created_by;
      const col = lane && memberIds.has(lane) ? lane : OTHER;
      if (col === OTHER) usedOther = true;
      const rawStart = mskMinutesOfDay(t.scheduled_start);
      const rawEnd = t.scheduled_end ? mskMinutesOfDay(t.scheduled_end) : rawStart + 60;
      const startMin = clamp(rawStart, START_MIN, END_MIN);
      const endMin = clamp(Math.max(rawEnd, rawStart + MIN_DUR), START_MIN, END_MIN);
      ensure(col).items.push({ item: { kind: 'task', task: t }, startMin, endMin });
    }

    // Встречи: дорожки участников; нет профилей → создатель; ничего не резолвится → «Прочие».
    for (const m of meetings) {
      const profiles = attendeesMap[m.id] ?? [];
      const targets = profiles.length ? profiles : (m.created_by ? [m.created_by] : []);
      const cols = new Set<string>();
      for (const pid of targets) cols.add(memberIds.has(pid) ? pid : OTHER);
      if (cols.size === 0) cols.add(OTHER);
      if (cols.has(OTHER)) usedOther = true;

      const s = timeToMin(m.time);
      for (const col of cols) {
        if (s === null) {
          ensure(col).allDay.push(m);
          continue;
        }
        const startMin = clamp(s, START_MIN, END_MIN);
        const endMin = clamp(s + MEETING_NOMINAL_MIN, START_MIN, END_MIN);
        ensure(col).items.push({ item: { kind: 'meeting', meeting: m }, startMin, endMin });
      }
    }

    const cols: ColumnDef[] = members.map((m) => ({ id: m.id, member: m }));
    if (usedOther) cols.push({ id: OTHER, member: null });

    const placed: Record<string, Placed[]> = {};
    for (const c of cols) placed[c.id] = layoutColumn(buckets[c.id]?.items ?? []);

    return { columns: cols, byColumn: { buckets, placed } };
  }, [members, tasks, meetings, attendeesMap]);

  // Геометрия из runtime (первая человеко-колонка): высота → px/мин, ширина → px/колонку.
  const readPxPerMin = () => {
    const el = colRef.current;
    return el ? el.clientHeight / (HOURS * 60) : 1;
  };
  const readColWidthPx = () => colRef.current?.clientWidth ?? 1;

  // DRAG: Δy = reschedule времени (день фикс — единственный день вида), Δx = reassign
  // (перенос в дорожку человека → assigned_to). Роль-гейт: не-owner/admin двигает только
  // по времени (RLS tasks_update — второй слой). Цель «Прочие» (member=null) → reassign игнор.
  function handleTeamDragEnd(e: DragEndEvent) {
    const data = e.active.data.current as MoveData | undefined;
    if (!data || data.mode !== 'move') return;
    const pxPerMin = readPxPerMin();
    const deltaMin = Math.round((e.delta.y / pxPerMin) / SNAP) * SNAP;
    const deltaCol = canReassign ? Math.round(e.delta.x / readColWidthPx()) : 0;

    const dur = data.endMin - data.startMin;
    const newStartMin = clamp(data.startMin + deltaMin, START_MIN, END_MIN - dur);
    const targetIndex = clamp(data.colIndex + deltaCol, 0, columns.length - 1);
    const target = columns[targetIndex];

    const changedTime = newStartMin !== data.startMin;
    const reassign = !!target?.member && targetIndex !== data.colIndex;
    if (!changedTime && !reassign) return;

    const startDate = atMin(dayDate, newStartMin);
    const startIso = datetimeLocalToIso(localDateTimeKey(startDate));
    const endIso = datetimeLocalToIso(localDateTimeKey(new Date(startDate.getTime() + dur * 60000)));
    if (!startIso || !endIso) return;

    onTeamReschedule(data.task.id, {
      scheduled_start: startIso,
      scheduled_end: endIso,
      assigned_to: reassign ? target!.member!.id : undefined,
    });
  }

  // RESIZE-коммит: старт не меняется, конец из (день вида, новый конец); assigned_to не трогаем.
  function handleResizeCommit(task: Task, dDate: Date, newEndMin: number) {
    const endIso = datetimeLocalToIso(localDateTimeKey(atMin(dDate, newEndMin)));
    if (task.scheduled_start && endIso) {
      onTeamReschedule(task.id, { scheduled_start: task.scheduled_start, scheduled_end: endIso });
    }
  }

  const handleResizePreview = (id: string | null, endMin: number) =>
    setResize(id ? { id, endMin } : null);

  // Линия «сейчас» — во всех колонках, если показываемый день = сегодня (МСК).
  const now = new Date();
  const nowMin = mskMinutesOfDay(now.toISOString());
  const isToday = mskDateKey(dayDate) === mskDateKey(now);
  const showNow = isToday && nowMin >= START_MIN && nowMin <= END_MIN;

  const gridCols = `${GUTTER_REM}rem repeat(${columns.length}, minmax(10rem, 1fr))`;
  const bodyHeight = `${HOURS * HOUR_REM}rem`;

  return (
    <div style={{ minWidth: `${GUTTER_REM + columns.length * 10}rem` }}>
      {/* Шапка колонок: люди (аватар/инициалы + имя + роль), служебная «Прочие». */}
      <div style={{ display: 'grid', gridTemplateColumns: gridCols, borderBottom: '0.5px solid var(--border)' }}>
        <div />
        {columns.map((c) => (
          <div
            key={c.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.375rem',
              padding: '0.375rem 0.5rem',
              minWidth: 0,
            }}
          >
            {c.member ? (
              c.member.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.member.avatar_url}
                  alt=""
                  style={{ width: '1.5rem', height: '1.5rem', borderRadius: '9999px', objectFit: 'cover', flexShrink: 0 }}
                />
              ) : (
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '1.5rem',
                    height: '1.5rem',
                    borderRadius: '9999px',
                    background: 'var(--surface2, var(--surface))',
                    border: '0.5px solid var(--border)',
                    color: 'var(--text-dim)',
                    fontSize: '0.625rem',
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {initials(c.member.full_name)}
                </span>
              )
            ) : null}
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  color: 'var(--text)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {c.member ? c.member.full_name : 'Прочие'}
              </div>
              {c.member?.role && (
                <div style={{ fontSize: '0.6875rem', color: 'var(--text-mute)', letterSpacing: '0.02em' }}>
                  {ROLE_LABEL[c.member.role] ?? c.member.role}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Тело: линейка часов + колонки людей (draggable-блоки внутри DndContext). */}
      <DndContext sensors={sensors} onDragEnd={handleTeamDragEnd}>
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

        {/* Колонки людей */}
        {columns.map((c, idx) => (
          <div
            key={c.id}
            ref={idx === 0 ? colRef : undefined}
            style={{
              position: 'relative',
              height: bodyHeight,
              borderLeft: '0.5px solid var(--border)',
            }}
          >
            {/* Часовые линии (read-only: без клика-создания — это B3) */}
            {Array.from({ length: HOURS }, (_, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  top: `${i * HOUR_REM}rem`,
                  left: 0,
                  right: 0,
                  height: `${HOUR_REM}rem`,
                  borderTop: '0.5px solid var(--border)',
                }}
              />
            ))}

            {/* Линия «сейчас» */}
            {showNow && (
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

            {/* Блоки: задачи (draggable=reschedule/reassign) + встречи (read-only MeetingBlock) */}
            {(byColumn.placed[c.id] ?? []).map((p) =>
              p.item.kind === 'task' ? (
                <DraggableTimeBlock
                  key={p.item.task.id}
                  p={p}
                  task={p.item.task}
                  colIndex={idx}
                  dayDate={dayDate}
                  renderEndMin={resize?.id === p.item.task.id ? resize.endMin : p.endMin}
                  onBlockClick={onBlockClick}
                  readPxPerMin={readPxPerMin}
                  onResizePreview={handleResizePreview}
                  onResizeCommit={handleResizeCommit}
                />
              ) : (
                <MeetingBlock
                  key={`${p.item.meeting.id}-${c.id}`}
                  p={p}
                  meeting={p.item.meeting}
                  onMeetingClick={onMeetingClick}
                />
              ),
            )}

            {/* All-day встречи (без времени): чипы сверху колонки, read-only. */}
            {(byColumn.buckets[c.id]?.allDay ?? []).map((m, i) => (
              <button
                key={`${m.id}-${c.id}`}
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
        ))}
      </div>
      </DndContext>
    </div>
  );
}
