'use client';

import { useState, useMemo } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight, Phone, Calendar, CheckSquare, Briefcase, Flag, Plus, Sparkles } from 'lucide-react';
import { useCalls, type Call } from '@/lib/hooks/use-calls';
import { useMeetings, type Meeting } from '@/lib/hooks/use-meetings';
import { useTasks, useUpdateTask } from '@/lib/hooks/use-tasks';
import { useProjects } from '@/lib/hooks/use-projects';
import { useAuth } from '@/lib/hooks/use-auth';
import { useTeamMembers } from '@/lib/hooks/use-team-members';
import { useMeetingAttendees } from '@/lib/hooks/use-meeting-attendees';
import { useOrgRole } from '@/lib/hooks/use-org-role';
import { isMine } from '@/lib/utils/task-view';
import { projectHref } from '@/lib/utils/project-href';
import { localDateKey, localDateTimeKey, mskDateKey } from '@/lib/utils/date-helpers';
import { CallModal } from '@/components/calls/CallModal';
import { MeetingModal } from '@/components/meetings/MeetingModal';
import { AiWorkspaceModal } from '@/components/ai/AiWorkspaceModal';
import { TaskModal } from '@/components/tasks/TaskModal';
import { WeekGrid } from '@/components/calendar/WeekGrid';
import { TeamDayGrid } from '@/components/calendar/TeamDayGrid';
import type { Task } from '@/types/entities';

interface CalEvent {
  id: string;
  type: 'call' | 'meeting' | 'task' | 'deal-step' | 'deal-deadline';
  title: string;
  time?: string;
  sub?: string;
}

const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const DAY_NAMES = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
const FULL_DAYS = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
const FULL_MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];

export function CalendarView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dateParam = searchParams.get('date');
  // A2a: вью-режим в URL (?cal=week), дефолт month — обратная совместимость.
  // B1: третий режим ?cal=team — командный день (колонки=люди).
  const calParam = searchParams.get('cal');
  const view: 'month' | 'week' | 'team' =
    calParam === 'week' ? 'week' : calParam === 'team' ? 'team' : 'month';

  const [currentDate, setCurrentDate] = useState(() => dateParam ? new Date(dateParam) : new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(dateParam);

  const { data: calls = [] } = useCalls();
  const { data: meetings = [] } = useMeetings();
  const { data: tasks = [] } = useTasks();
  const { data: projects = [] } = useProjects();
  const { data: members = [] } = useTeamMembers();
  const { data: orgRole } = useOrgRole();
  const { user } = useAuth();
  const currentUserId = user?.id ?? null;
  const updateTask = useUpdateTask();
  // B1: под ограниченной ролью RLS покажет чужие задачи только по общим проектам.
  const limitedVisibility = orgRole !== 'owner' && orgRole !== 'admin';

  // Модалки: редактирование события и создание на выбранный день
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [editCall, setEditCall] = useState<Call | null>(null);
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [editMeeting, setEditMeeting] = useState<Meeting | null>(null);
  const [aiEvent, setAiEvent] = useState<{ type: 'call' | 'meeting'; id: string } | null>(null);

  // A2a: TaskModal для тайм-блоков (создание по слоту / правка по клику на блок)
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [slotDefaults, setSlotDefaults] = useState<{ start: string; end: string } | null>(null);

  const setView = (v: 'month' | 'week' | 'team') => {
    const params = new URLSearchParams(searchParams.toString());
    if (v === 'month') params.delete('cal'); else params.set('cal', v);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  const todayStr = localDateKey();

  // A2a: недельная сетка — понедельник недели currentDate + метка диапазона.
  const weekStart = useMemo(() => {
    const d = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
    const dow = d.getDay(); // 0=Вс
    d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
    return d;
  }, [currentDate]);

  const weekEnd = useMemo(
    () => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6),
    [weekStart],
  );

  const weekLabel = weekStart.getMonth() === weekEnd.getMonth()
    ? `${weekStart.getDate()}–${weekEnd.getDate()} ${FULL_MONTHS[weekStart.getMonth()]}`
    : `${weekStart.getDate()} ${FULL_MONTHS[weekStart.getMonth()]} – ${weekEnd.getDate()} ${FULL_MONTHS[weekEnd.getMonth()]}`;

  // Задачи недели: scheduled_start задан, мои, дата (МСК) в пределах недели.
  const weekTasks = useMemo(() => {
    if (view !== 'week') return [];
    const keys = new Set(
      Array.from({ length: 7 }, (_, i) =>
        mskDateKey(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)),
      ),
    );
    return tasks.filter(
      (t) => t.scheduled_start && isMine(t, currentUserId) && keys.has(mskDateKey(t.scheduled_start)),
    );
  }, [view, weekStart, tasks, currentUserId]);

  // A2c: встречи недели (org-scoped RLS). Скоуп — все встречи недели; персональный
  // фильтр по вовлечённости — под фазу B/команду. Матч по календарной дате.
  const weekMeetings = useMemo(() => {
    if (view !== 'week') return [];
    const keys = new Set(
      Array.from({ length: 7 }, (_, i) =>
        mskDateKey(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)),
      ),
    );
    return meetings.filter((m) => m.date && keys.has(m.date.slice(0, 10)));
  }, [view, weekStart, meetings]);

  // B1: командный день — отображаемый день (локальная полночь) + метка «Среда, 23 июля».
  const dayDate = useMemo(
    () => new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate()),
    [currentDate],
  );
  const dayLabel = `${FULL_DAYS[dayDate.getDay()]}, ${dayDate.getDate()} ${FULL_MONTHS[dayDate.getMonth()]}`;

  // Задачи дня для командной сетки. ⚠️ БЕЗ isMine — team-вью показывает всё, что
  // отдаст RLS. Коммент-долг: фильтр client-side из уже загруженных useTasks
  // (не серверный range-query) — сознательно, чтобы optimistic-мутации A2b/B2
  // патчили единый кэш ['tasks']; серверный range — B3 (единый рефактор m/w/team).
  const teamTasks = useMemo(() => {
    if (view !== 'team') return [];
    const dayKey = mskDateKey(dayDate);
    return tasks.filter((t) => t.scheduled_start && mskDateKey(t.scheduled_start) === dayKey);
  }, [view, dayDate, tasks]);

  const teamMeetings = useMemo(() => {
    if (view !== 'team') return [];
    const dayKey = mskDateKey(dayDate);
    return meetings.filter((m) => m.date && m.date.slice(0, 10) === dayKey);
  }, [view, dayDate, meetings]);

  const { data: attendeesMap = {} } = useMeetingAttendees(teamMeetings.map((m) => m.id));

  const shiftDays = (n: number) =>
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + n));

  function handleSlotClick(dayDate: Date, hour: number) {
    const start = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), hour, 0);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate(), hour + 1, 0);
    setEditTask(null);
    setSlotDefaults({ start: localDateTimeKey(start), end: localDateTimeKey(end) });
    setTaskModalOpen(true);
  }

  function handleBlockClick(taskId: string) {
    const t = tasks.find((x) => x.id === taskId);
    if (t) { setEditTask(t); setSlotDefaults(null); setTaskModalOpen(true); }
  }

  // A2b: drag/resize блока → оптимистичный патч scheduled_start/end (onMutate уже optimistic).
  function handleReschedule(id: string, scheduled_start: string, scheduled_end: string) {
    updateTask.mutate({ id, scheduled_start, scheduled_end });
  }

  // A2c: клик по встрече в сетке → существующая MeetingModal (тот же путь, что month-view).
  function handleMeetingClick(id: string) {
    const m = meetings.find((x) => x.id === id);
    if (m) { setEditMeeting(m); setMeetingModalOpen(true); }
  }

  // Build events map for the month
  const eventsMap = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    const add = (key: string, ev: CalEvent) => { if (!map[key]) map[key] = []; map[key].push(ev); };

    calls.forEach((c) => {
      if (c.date) {
        const key = c.date.slice(0, 10);
        const d = new Date(c.date);
        add(key, {
          id: c.id, type: 'call',
          title: c.contact ? `${c.contact.first_name} ${c.contact.last_name}` : c.company?.name ?? 'Звонок',
          time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
          sub: c.company?.name,
        });
      }
    });

    meetings.forEach((m) => {
      if (m.date) {
        add(m.date.slice(0, 10), {
          id: m.id, type: 'meeting',
          title: m.title,
          time: m.time?.slice(0, 5),
          sub: m.location ?? undefined,
        });
      }
    });

    tasks.forEach((t) => {
      if (t.deadline && t.lane !== 'done') {
        add(t.deadline.slice(0, 10), {
          id: t.id, type: 'task',
          title: t.text,
        });
      }
    });

    // Сделки: шаг (next_action_date) и дедлайн — главные даты CRM после W1a
    projects.forEach((p) => {
      if (p.status === 'won' || p.status === 'lost') return;
      if (p.next_action_date) {
        add(p.next_action_date.slice(0, 10), {
          id: p.id, type: 'deal-step',
          title: p.name,
          sub: p.next_step ?? 'шаг по сделке',
        });
      }
      if (p.deadline) {
        add(p.deadline.slice(0, 10), {
          id: p.id, type: 'deal-deadline',
          title: p.name,
          sub: 'дедлайн сделки',
        });
      }
    });

    return map;
  }, [calls, meetings, tasks, projects]);

  const dayEvents = selectedDate ? (eventsMap[selectedDate] ?? []) : [];

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToday = () => { setCurrentDate(new Date()); setSelectedDate(todayStr); };

  const typeIcon = (type: string) => {
    if (type === 'call') return <Phone size={14} strokeWidth={1.5} />;
    if (type === 'meeting') return <Calendar size={14} strokeWidth={1.5} />;
    if (type === 'deal-step') return <Briefcase size={14} strokeWidth={1.5} />;
    if (type === 'deal-deadline') return <Flag size={14} strokeWidth={1.5} />;
    return <CheckSquare size={14} strokeWidth={1.5} />;
  };
  const typeLabel = (type: string) =>
    type === 'call' ? 'Звонок'
    : type === 'meeting' ? 'Встреча'
    : type === 'deal-step' ? 'Шаг по сделке'
    : type === 'deal-deadline' ? 'Дедлайн сделки'
    : 'Задача';

  // Клик по событию: звонок/встреча — модалка редактирования; сделка — карточка; задача — доска
  function openEvent(ev: CalEvent) {
    if (ev.type === 'call') {
      const call = calls.find((c) => c.id === ev.id);
      if (call) { setEditCall(call); setCallModalOpen(true); }
      return;
    }
    if (ev.type === 'meeting') {
      const meeting = meetings.find((m) => m.id === ev.id);
      if (meeting) { setEditMeeting(meeting); setMeetingModalOpen(true); }
      return;
    }
    if (ev.type === 'deal-step' || ev.type === 'deal-deadline') {
      const project = projects.find((p) => p.id === ev.id);
      router.push(project ? projectHref(project) : `/deals/${ev.id}`);
      return;
    }
    router.push('/tasks');
  }

  return (
    <div>
      {/* Шапка: навигация + тумблер Месяц/Неделя (A2a) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => (view === 'week' ? shiftDays(-7) : view === 'team' ? shiftDays(-1) : prevMonth())} style={navBtn}><ChevronLeft size={18} /></button>
          <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--text)', minWidth: 160, textAlign: 'center' }}>
            {view === 'week' ? weekLabel : view === 'team' ? dayLabel : `${MONTH_NAMES[month]} ${year}`}
          </span>
          <button onClick={() => (view === 'week' ? shiftDays(7) : view === 'team' ? shiftDays(1) : nextMonth())} style={navBtn}><ChevronRight size={18} /></button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', border: '0.5px solid var(--border)' }}>
            {(['month', 'week', 'team'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  ...navBtn, border: 'none', fontSize: 12, padding: '4px 12px',
                  ...(view === v ? { background: 'var(--accent)', color: 'var(--surface)' } : {}),
                }}
              >
                {v === 'month' ? 'Месяц' : v === 'week' ? 'Неделя' : 'Команда'}
              </button>
            ))}
          </div>
          <button onClick={goToday} style={{ ...navBtn, fontSize: 12, padding: '4px 12px' }}>Сегодня</button>
        </div>
      </div>

      {view === 'team' ? (
        <div>
          {limitedVisibility && (
            <div style={{ fontSize: 11, color: 'var(--text-mute)', marginBottom: 8 }}>
              Ограниченная видимость: чужие задачи — только по общим проектам.
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <TeamDayGrid
              dayDate={dayDate}
              members={members}
              tasks={teamTasks}
              meetings={teamMeetings}
              attendeesMap={attendeesMap}
              onBlockClick={handleBlockClick}
              onMeetingClick={handleMeetingClick}
            />
          </div>
        </div>
      ) : view === 'week' ? (
        <div style={{ overflowX: 'auto' }}>
          <WeekGrid weekStart={weekStart} tasks={weekTasks} meetings={weekMeetings} onSlotClick={handleSlotClick} onBlockClick={handleBlockClick} onReschedule={handleReschedule} onMeetingClick={handleMeetingClick} />
        </div>
      ) : (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, minHeight: 500 }}>
      {/* Grid */}
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', marginBottom: 4 }}>
          {DAY_NAMES.map((d) => (
            <div key={d} style={{ fontSize: 11, color: 'var(--text-mute)', padding: '6px 0', fontWeight: 500, letterSpacing: '0.03em' }}>{d}</div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {Array.from({ length: offset }).map((_, i) => <div key={`e-${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday = ds === todayStr;
            const isSel = ds === selectedDate;
            const hasEv = !!eventsMap[ds];
            const evCount = eventsMap[ds]?.length ?? 0;

            return (
              <div
                key={day}
                onClick={() => setSelectedDate(ds)}
                className="cal-day"
                data-today={isToday ? '' : undefined}
                data-selected={isSel ? '' : undefined}
                data-has-event={hasEv ? '' : undefined}
                style={{
                  padding: '10px 4px', cursor: 'pointer', textAlign: 'center',
                  position: 'relative', minHeight: 44, fontSize: 14,
                  background: isSel ? 'var(--accent)' : isToday ? 'var(--surface)' : 'transparent',
                  color: isSel ? 'var(--surface)' : 'var(--text)',
                  fontWeight: isToday ? 500 : 400,
                  transition: 'background 0.15s',
                }}
              >
                {day}
                {hasEv && <span className="cal-day-dot" style={{
                  position: 'absolute', bottom: 3, right: 3, width: 0, height: 0,
                  borderLeft: '5px solid transparent',
                  borderBottom: `5px solid ${isSel ? 'var(--surface)' : 'var(--accent)'}`,
                }} />}
                {evCount > 0 && <div style={{ fontSize: 9, color: isSel ? 'rgba(255,255,255,0.6)' : 'var(--text-mute)', marginTop: 2 }}>{evCount}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Day events */}
      <div style={{ borderLeft: '0.5px solid var(--border)', paddingLeft: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-dim)', marginBottom: 12, letterSpacing: '0.02em' }}>
          {selectedDate ? `${FULL_DAYS[new Date(selectedDate).getDay()]}, ${new Date(selectedDate).getDate()} ${FULL_MONTHS[new Date(selectedDate).getMonth()]}` : 'Выберите дату'}
        </div>

        {/* Создание на выбранный день */}
        {selectedDate && (
          <div className="mb-3 flex gap-1.5">
            <button
              onClick={() => { setEditCall(null); setCallModalOpen(true); }}
              className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-meta
                         text-text-dim transition-colors hover:border-accent hover:text-accent"
            >
              <Plus size={11} /> Звонок
            </button>
            <button
              onClick={() => { setEditMeeting(null); setMeetingModalOpen(true); }}
              className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-meta
                         text-text-dim transition-colors hover:border-accent hover:text-accent"
            >
              <Plus size={11} /> Встреча
            </button>
          </div>
        )}

        {!selectedDate && (
          <div style={{ fontSize: 12, color: 'var(--text-mute)', padding: '40px 16px', textAlign: 'center', maxWidth: 220, margin: '0 auto' }}>
            Выбери день в календаре слева, чтобы увидеть звонки, встречи и задачи.
          </div>
        )}

        {dayEvents.length === 0 && selectedDate && (
          <div style={{ fontSize: 12, color: 'var(--text-mute)', padding: '20px 0', textAlign: 'center' }}>Нет событий</div>
        )}

        {dayEvents.map((ev) => (
          <div key={`${ev.type}-${ev.id}`} onClick={() => openEvent(ev)} style={{
            padding: '10px 12px', border: '0.5px solid var(--border)', marginBottom: 8, cursor: 'pointer',
            transition: 'background 0.15s',
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              {typeIcon(ev.type)}
              <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-mute)', letterSpacing: '0.03em' }}>
                {typeLabel(ev.type).toUpperCase()}
              </span>
              {(ev.type === 'call' || ev.type === 'meeting') && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setAiEvent({ type: ev.type as 'call' | 'meeting', id: ev.id }); }}
                  aria-label="AI-анализ"
                  style={{ marginLeft: 'auto', display: 'inline-flex', padding: 2, color: 'var(--text-mute)', cursor: 'pointer' }}
                >
                  <Sparkles size={13} />
                </button>
              )}
              {ev.time && <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: (ev.type === 'call' || ev.type === 'meeting') ? 8 : 'auto' }}>{ev.time}</span>}
            </div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{ev.title}</div>
            {ev.sub && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{ev.sub}</div>}
          </div>
        ))}
      </div>
    </div>
      )}

    <CallModal
      isOpen={callModalOpen}
      onClose={() => { setCallModalOpen(false); setEditCall(null); }}
      editCall={editCall}
      defaultDate={selectedDate}
    />
    <MeetingModal
      isOpen={meetingModalOpen}
      onClose={() => { setMeetingModalOpen(false); setEditMeeting(null); }}
      editMeeting={editMeeting}
      defaultDate={selectedDate}
    />
    {aiEvent && (
      <AiWorkspaceModal
        isOpen={!!aiEvent}
        onClose={() => setAiEvent(null)}
        entityType={aiEvent.type}
        entityId={aiEvent.id}
      />
    )}
    <TaskModal
      isOpen={taskModalOpen}
      onClose={() => { setTaskModalOpen(false); setEditTask(null); setSlotDefaults(null); }}
      editTask={editTask}
      defaultScheduledStart={slotDefaults?.start ?? null}
      defaultScheduledEnd={slotDefaults?.end ?? null}
    />
    </div>
  );
}

const navBtn: React.CSSProperties = {
  background: 'transparent', border: '0.5px solid var(--border)',
  cursor: 'pointer', padding: '4px 8px', color: 'var(--text-dim)',
  display: 'flex', alignItems: 'center', fontFamily: 'inherit',
};
