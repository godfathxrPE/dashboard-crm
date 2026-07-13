'use client';

import { useState, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Phone, Calendar, CheckSquare, Briefcase, Flag, Plus, Sparkles } from 'lucide-react';
import { useCalls, type Call } from '@/lib/hooks/use-calls';
import { useMeetings, type Meeting } from '@/lib/hooks/use-meetings';
import { useTasks } from '@/lib/hooks/use-tasks';
import { useProjects } from '@/lib/hooks/use-projects';
import { projectHref } from '@/lib/utils/project-href';
import { localDateKey } from '@/lib/utils/date-helpers';
import { CallModal } from '@/components/calls/CallModal';
import { MeetingModal } from '@/components/meetings/MeetingModal';
import { AiWorkspaceModal } from '@/components/ai/AiWorkspaceModal';

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
  const searchParams = useSearchParams();
  const dateParam = searchParams.get('date');

  const [currentDate, setCurrentDate] = useState(() => dateParam ? new Date(dateParam) : new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(dateParam);

  const { data: calls = [] } = useCalls();
  const { data: meetings = [] } = useMeetings();
  const { data: tasks = [] } = useTasks();
  const { data: projects = [] } = useProjects();

  // Модалки: редактирование события и создание на выбранный день
  const [callModalOpen, setCallModalOpen] = useState(false);
  const [editCall, setEditCall] = useState<Call | null>(null);
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [editMeeting, setEditMeeting] = useState<Meeting | null>(null);
  const [aiEvent, setAiEvent] = useState<{ type: 'call' | 'meeting'; id: string } | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  const todayStr = localDateKey();

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
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, minHeight: 500 }}>
      {/* Grid */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={prevMonth} style={navBtn}><ChevronLeft size={18} /></button>
            <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--text)', minWidth: 160, textAlign: 'center' }}>
              {MONTH_NAMES[month]} {year}
            </span>
            <button onClick={nextMonth} style={navBtn}><ChevronRight size={18} /></button>
          </div>
          <button onClick={goToday} style={{ ...navBtn, fontSize: 12, padding: '4px 12px' }}>Сегодня</button>
        </div>

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
              className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px]
                         text-text-dim transition-colors hover:border-accent hover:text-accent"
            >
              <Plus size={11} /> Звонок
            </button>
            <button
              onClick={() => { setEditMeeting(null); setMeetingModalOpen(true); }}
              className="flex items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px]
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
    </div>
  );
}

const navBtn: React.CSSProperties = {
  background: 'transparent', border: '0.5px solid var(--border)',
  cursor: 'pointer', padding: '4px 8px', color: 'var(--text-dim)',
  display: 'flex', alignItems: 'center', fontFamily: 'inherit',
};
