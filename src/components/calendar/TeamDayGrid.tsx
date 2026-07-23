'use client';

import { useMemo } from 'react';
import { Calendar } from 'lucide-react';
import type { Task } from '@/types/entities';
import type { Meeting } from '@/lib/hooks/use-meetings';
import type { TeamMember } from '@/lib/hooks/use-team-members';
import { mskMinutesOfDay, mskDateKey, mskTimeRange } from '@/lib/utils/date-helpers';
import {
  START_HOUR, HOURS, HOUR_REM, GUTTER_REM, START_MIN, END_MIN,
  MIN_BLOCK_REM, MIN_DUR, MEETING_NOMINAL_MIN, PRIORITY_ACCENT,
  clamp, remOfMin, timeToMin, layoutColumn, MeetingBlock,
  type GridItem, type Placed,
} from '@/components/calendar/grid-core';

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
}

interface ColumnDef {
  id: string;
  member: TeamMember | null; // null → служебная «Прочие»
}

interface ColumnData {
  items: { item: GridItem; startMin: number; endMin: number }[];
  allDay: Meeting[];
}

interface StaticTaskBlockProps {
  p: Placed;
  task: Task;
  onBlockClick: (taskId: string) => void;
}

// Read-only блок задачи в командной сетке: тот же вид, что TimeBlock (время,
// текст, priority-акцент), но обычный <button> БЕЗ useDraggable/resize.
// Интерактив (drag=reschedule, drag между дорожками=reassign) — B2, там же
// унификация со StaticTaskBlock из week-версии (TimeBlock).
function StaticTaskBlock({ p, task, onBlockClick }: StaticTaskBlockProps) {
  const { startMin, endMin, lane, cols } = p;
  const topRem = remOfMin(startMin);
  const hRem = Math.max((endMin - startMin) / 60 * HOUR_REM, MIN_BLOCK_REM);
  const widthPct = 100 / cols;
  const range = mskTimeRange(task.scheduled_start, task.scheduled_end);

  return (
    <button
      type="button"
      onClick={() => onBlockClick(task.id)}
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
        border: '0.5px solid var(--border)',
        borderLeft: `2px solid ${PRIORITY_ACCENT[task.priority] ?? 'var(--text-mute)'}`,
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
        {task.text}
      </span>
    </button>
  );
}

// Дневная сетка «Команда»: колонки = люди, та же вертикальная механика 07–22
// из grid-core. Задача → дорожка assigned_to ?? created_by. Встреча → дорожки
// участников (attendeesMap), при отсутствии профилей — дорожка created_by;
// встреча может лечь в несколько дорожек (по блоку в каждой). Read-only.
export function TeamDayGrid({
  dayDate, members, tasks, meetings, attendeesMap, onBlockClick, onMeetingClick,
}: TeamDayGridProps) {
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

      {/* Тело: линейка часов + колонки людей. */}
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
        {columns.map((c) => (
          <div
            key={c.id}
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

            {/* Блоки: задачи (read-only) + встречи (импортированный MeetingBlock) */}
            {(byColumn.placed[c.id] ?? []).map((p) =>
              p.item.kind === 'task' ? (
                <StaticTaskBlock
                  key={p.item.task.id}
                  p={p}
                  task={p.item.task}
                  onBlockClick={onBlockClick}
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
    </div>
  );
}
