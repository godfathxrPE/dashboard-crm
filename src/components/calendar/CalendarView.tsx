'use client';

import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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
import { localDateKey, localDateTimeKey, mskDateKey, mskMinutesOfDay, mskTime } from '@/lib/utils/date-helpers';
import { CallModal } from '@/components/calls/CallModal';
import { MeetingModal } from '@/components/meetings/MeetingModal';
import { AiWorkspaceModal } from '@/components/ai/AiWorkspaceModal';
import { TaskModal } from '@/components/tasks/TaskModal';
import { WeekLanes, type LaneDeadline } from '@/components/calendar/WeekLanes';
import { TeamDayGrid } from '@/components/calendar/TeamDayGrid';
import { MonthGrid } from '@/components/calendar/MonthGrid';
import { DayPeek } from '@/components/calendar/DayPeek';
import { MEETING_NOMINAL_MIN, timeToMin } from '@/components/calendar/grid-core';
import type { CalEvent } from '@/components/calendar/cal-event';
import { monthDeadlines } from '@/lib/domain/month-cells';
import type { Task } from '@/types/entities';

const MONTH_NAMES = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
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
  const todayStr = localDateKey();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;

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

  // Семь ключей МСК отображаемой недели — один набор на все выборки ленты.
  const weekKeys = useMemo(
    () =>
      new Set(
        Array.from({ length: 7 }, (_, i) =>
          mskDateKey(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)),
        ),
      ),
    [weekStart],
  );

  // Задачи недели: scheduled_start задан, мои, дата (МСК) в пределах недели.
  const weekTasks = useMemo(() => {
    if (view !== 'week') return [];
    return tasks.filter(
      (t) => t.scheduled_start && isMine(t, currentUserId) && weekKeys.has(mskDateKey(t.scheduled_start)),
    );
  }, [view, weekKeys, tasks, currentUserId]);

  // S-CAL-LANES-1: мои задачи недели БЕЗ времени — на дорожку их не поставить,
  // но и терять нельзя: счётчик «+N без времени» в паспорте дня, по дню срока.
  const weekUndatedTasks = useMemo(() => {
    if (view !== 'week') return [];
    return tasks.filter(
      (t) =>
        !t.scheduled_start && t.deadline && t.lane !== 'done' &&
        isMine(t, currentUserId) && weekKeys.has(mskDateKey(t.deadline)),
    );
  }, [view, weekKeys, tasks, currentUserId]);

  // A2c: встречи недели (org-scoped RLS). Скоуп — все встречи недели; персональный
  // фильтр по вовлечённости — под фазу B/команду. Матч по календарной дате.
  const weekMeetings = useMemo(() => {
    if (view !== 'week') return [];
    return meetings.filter((m) => m.date && weekKeys.has(m.date.slice(0, 10)));
  }, [view, weekKeys, meetings]);

  // S-CAL-LANES-1: звонки недели. В прежней сетке их не было вовсе — при том что
  // на живых данных это самый плотный вид событий org (14 звонков против 1 встречи),
  // и без них лента показывала бы пустую неделю. Скоуп org-wide, как у встреч.
  const weekCalls = useMemo(() => {
    if (view !== 'week') return [];
    return calls.filter((c) => c.date && weekKeys.has(mskDateKey(c.date)));
  }, [view, weekKeys, calls]);

  // S-CAL-LANES-1: дедлайны сделок недели — из того же `useProjects`, что и
  // месячный вид (`eventsMap`), без нового запроса. Закрытые сделки не показываем
  // тем же правилом, что месяц. `projects.deadline` — колонка `date` (не timestamptz,
  // в отличие от `tasks.deadline`), поэтому день берётся срезом, как в месяце:
  // одно поле не должно читаться в проекте двумя разными способами.
  const weekDeadlines = useMemo<LaneDeadline[]>(() => {
    if (view !== 'week') return [];
    const out: LaneDeadline[] = [];
    for (const p of projects) {
      if (p.status === 'won' || p.status === 'lost' || !p.deadline) continue;
      const dateKey = p.deadline.slice(0, 10);
      if (weekKeys.has(dateKey)) out.push({ id: p.id, title: p.name, dateKey });
    }
    return out;
  }, [view, weekKeys, projects]);

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

  // B2: командный drag → reschedule (+ опц. reassign). assigned_to в патче → оптимистичный
  // onMutate перекладывает блок в дорожку нового исполнителя; триггер notify_task_assigned
  // шлёт ему уведомление сам. Обратимо драгом назад — модалка подтверждения не нужна.
  function handleTeamReschedule(
    id: string,
    patch: { scheduled_start: string; scheduled_end: string; assigned_to?: string },
  ) {
    updateTask.mutate({ id, ...patch });
    if (patch.assigned_to) {
      const who = members.find((m) => m.id === patch.assigned_to)?.full_name;
      if (who) toast.success(`Переназначено → ${who}`);
    }
  }

  // A2c: клик по встрече в сетке → существующая MeetingModal (тот же путь, что month-view).
  function handleMeetingClick(id: string) {
    const m = meetings.find((x) => x.id === id);
    if (m) { setEditMeeting(m); setMeetingModalOpen(true); }
  }

  // S-CAL-LANES-1: чипы звонка и дедлайна ведут ровно туда же, куда события
  // месячного вида (`openEvent`) — CallModal и карточка сделки.
  function handleCallClick(id: string) {
    const c = calls.find((x) => x.id === id);
    if (c) { setEditCall(c); setCallModalOpen(true); }
  }

  function handleDeadlineClick(projectId: string) {
    const project = projects.find((p) => p.id === projectId);
    router.push(project ? projectHref(project) : `/deals/${projectId}`);
  }

  // События по дням месяца.
  //
  // ⚠️ Ключ дня — МСК (`mskDateKey`), как во всём календарном коде проекта.
  // До S-CAL-MONTH-1 звонки и задачи попадали в ячейку по `date.slice(0,10)`,
  // то есть по UTC-дате: звонок 09.08 в 00:30 МСК ложился в ячейку 8-го, а
  // недельная лента показывала его 9-го — два вида противоречили друг другу.
  // Незаметно, пока в ячейке был только счётчик; на чипе видно время, и
  // расхождение стало бы видно глазом. `meetings.date` и `projects.deadline` —
  // колонки `date`, не timestamptz: у них срез строки и есть календарный день.
  const eventsMap = useMemo(() => {
    const map: Record<string, CalEvent[]> = {};
    const add = (key: string, ev: CalEvent) => { (map[key] ??= []).push(ev); };

    calls.forEach((c) => {
      if (!c.date) return;
      const startMin = mskMinutesOfDay(c.date);
      // Длительность звонка — фактическая, иначе номинал: те же 30 минут, что
      // берёт упаковка дорожки недели.
      const durMin = c.duration_s ? Math.round(c.duration_s / 60) : 30;
      add(mskDateKey(c.date), {
        id: c.id, kind: 'call',
        title: c.contact ? `${c.contact.first_name} ${c.contact.last_name}` : c.company?.name ?? 'Звонок',
        time: mskTime(c.date),
        startMin, endMin: startMin + durMin,
        sub: c.company?.name,
      });
    });

    meetings.forEach((m) => {
      if (!m.date) return;
      const startMin = timeToMin(m.time);
      add(m.date.slice(0, 10), {
        id: m.id, kind: 'meeting',
        title: m.title,
        time: startMin === null ? null : (m.time?.slice(0, 5) ?? null),
        startMin,
        endMin: startMin === null ? null : startMin + MEETING_NOMINAL_MIN,
        sub: m.location ?? undefined,
      });
    });

    // Задача попадает в день по СРОКУ, а времени у срока нет — в паспорте дня
    // такие идут строкой «+N без времени», как в неделе.
    tasks.forEach((t) => {
      if (!t.deadline || t.lane === 'done') return;
      add(mskDateKey(t.deadline), {
        id: t.id, kind: 'task', title: t.text,
        time: null, startMin: null, endMin: null,
      });
    });

    // Сделки: шаг (next_action_date) и дедлайн — главные даты CRM после W1a
    projects.forEach((p) => {
      if (p.status === 'won' || p.status === 'lost') return;
      if (p.next_action_date) {
        add(p.next_action_date.slice(0, 10), {
          id: p.id, kind: 'deal-step',
          title: p.name,
          time: null, startMin: null, endMin: null,
          sub: p.next_step ?? 'шаг по сделке',
        });
      }
      if (p.deadline) {
        add(p.deadline.slice(0, 10), {
          id: p.id, kind: 'deal-deadline',
          title: p.name,
          time: null, startMin: null, endMin: null,
          sub: 'дедлайн сделки',
        });
      }
    });

    return map;
  }, [calls, meetings, tasks, projects]);

  // Фокус-полоса: дедлайны сделок отображаемого месяца. Источник — тот же
  // `useProjects`, что у сетки и у недели; второго запроса нет.
  const focusDeadlines = useMemo(
    () =>
      monthDeadlines(
        projects
          .filter((p) => p.status !== 'won' && p.status !== 'lost' && !!p.deadline)
          .map((p) => ({ id: p.id, title: p.name, dateKey: p.deadline!.slice(0, 10) })),
        monthPrefix,
        todayStr,
      ),
    [projects, monthPrefix, todayStr],
  );

  const dayEvents = selectedDate ? (eventsMap[selectedDate] ?? []) : [];

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  // «Сегодня» ведёт к текущей дате, но peek не открывает: раньше этот клик
  // наполнял панель справа, теперь он распахнул бы поверх сетки целую панель,
  // о которой не просили.
  const goToday = () => setCurrentDate(new Date());

  // Клик по событию: звонок/встреча — модалка редактирования; сделка — карточка; задача — доска
  function openEvent(ev: CalEvent) {
    if (ev.kind === 'call') {
      const call = calls.find((c) => c.id === ev.id);
      if (call) { setEditCall(call); setCallModalOpen(true); }
      return;
    }
    if (ev.kind === 'meeting') {
      const meeting = meetings.find((m) => m.id === ev.id);
      if (meeting) { setEditMeeting(meeting); setMeetingModalOpen(true); }
      return;
    }
    if (ev.kind === 'deal-step' || ev.kind === 'deal-deadline') {
      const project = projects.find((p) => p.id === ev.id);
      router.push(project ? projectHref(project) : `/deals/${ev.id}`);
      return;
    }
    router.push('/tasks');
  }

  // Создание из паспорта дня. Peek остаётся открытым под модалкой (её оверлей
  // помечен `data-modal-overlay` и попадает в `keepOpenSelector`): после
  // сохранения новое событие видно в том же дне, без повторного клика.
  function createTaskOnDay() {
    setEditTask(null);
    setSlotDefaults(null);
    setTaskModalOpen(true);
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
          <div style={{ display: 'flex', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-s)', overflow: 'hidden' }}>
            {(['month', 'week', 'team'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  ...navBtn, border: 'none', fontSize: 12, padding: '4px 12px',
                  ...(view === v ? { background: 'var(--accent)', color: 'var(--on-accent)' } : {}),
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
              onTeamReschedule={handleTeamReschedule}
              canReassign={!limitedVisibility}
            />
          </div>
        </div>
      ) : view === 'week' ? (
        <div style={{ overflowX: 'auto' }}>
          <WeekLanes
            weekStart={weekStart}
            tasks={weekTasks}
            undatedTasks={weekUndatedTasks}
            meetings={weekMeetings}
            calls={weekCalls}
            deadlines={weekDeadlines}
            onSlotClick={handleSlotClick}
            onBlockClick={handleBlockClick}
            onMeetingClick={handleMeetingClick}
            onCallClick={handleCallClick}
            onDeadlineClick={handleDeadlineClick}
          />
        </div>
      ) : (
        <MonthGrid
          year={year}
          month={month}
          todayKey={todayStr}
          selectedKey={selectedDate}
          eventsByDay={eventsMap}
          deadlines={focusDeadlines}
          onSelectDay={setSelectedDate}
          onOpenEvent={openEvent}
        />
      )}

    {/* Паспорт дня. Только в месяце: у недели и «Команды» день раскрыт сеткой. */}
    {view === 'month' && selectedDate && (
      <DayPeek
        dateKey={selectedDate}
        events={dayEvents}
        onClose={() => setSelectedDate(null)}
        onOpenEvent={openEvent}
        onOpenAi={(ev) => setAiEvent({ type: ev.kind as 'call' | 'meeting', id: ev.id })}
        onCreateCall={() => { setEditCall(null); setCallModalOpen(true); }}
        onCreateMeeting={() => { setEditMeeting(null); setMeetingModalOpen(true); }}
        onCreateTask={createTaskOnDay}
      />
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
      // Задача из паспорта дня получает СРОК на этот день, а не интервал:
      // в ячейку месяца задача попадает по `deadline`, и созданная тут же
      // должна появиться в том дне, из которого её создали. Из слота недели
      // приходит интервал — там ось времени есть.
      defaultDeadline={!editTask && !slotDefaults && selectedDate ? `${selectedDate}T18:00` : null}
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
