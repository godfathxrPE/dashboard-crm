'use client';

import { useState, useEffect } from 'react';
import { Phone, Calendar, CheckSquare } from 'lucide-react';
import { useThemeStore } from '@/lib/stores/theme-store';
import { useDrawerStore } from '@/lib/stores/drawer-store';
import { useTasks } from '@/lib/hooks/use-tasks';
import { useCalls } from '@/lib/hooks/use-calls';
import { useMeetings } from '@/lib/hooks/use-meetings';
import { useProjects } from '@/lib/hooks/use-projects';
import { useRecentActivity } from '@/lib/hooks/use-activity-log';
import { Bracket } from '@/components/ui/Bracket';

// ═══════════════════════════════════════════════════════
// Main Drawer
// ═══════════════════════════════════════════════════════

export function ActivityDrawer() {
  // Aura использует тот же shell, что Scandi → drawer тоже рендерим.
  // Раньше: if(!isScandi) return null — а layout всё равно резервировал
  // marginRight:280 для isTextNav, из-за чего в Aura доска сжималась до 150px.
  const theme = useThemeStore((s) => s.theme);
  const isTextNav = theme === 't-scandi' || theme === 't-aura';
  const isOpen = useDrawerStore((s) => s.isOpen);

  if (!isTextNav) return null;


  return (
    <aside
      style={{
        width: isOpen ? 280 : 0,
        minWidth: isOpen ? 280 : 0,
        overflow: 'hidden',
        borderLeft: isOpen ? '0.5px solid var(--border)' : 'none',
        transition: 'width 0.3s cubic-bezier(0.16,1,0.3,1), min-width 0.3s cubic-bezier(0.16,1,0.3,1)',
        height: '100vh',
        position: 'fixed',
        right: 0,
        top: 0,
        overflowY: 'auto',
        background: 'var(--bg)',
        zIndex: 10,
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--border) transparent',
      }}
    >
      <div style={{
        padding: '12px 14px 24px',
        opacity: isOpen ? 1 : 0,
        transition: 'opacity 0.2s',
        minWidth: 280,
      }}>
        <Bracket className="mb-4"><TimeWidget /></Bracket>
        <Bracket className="mb-4"><FocusWidget /></Bracket>
        <Bracket className="mb-4"><PlannedCallsWidget /></Bracket>
        <Bracket className="mb-4"><CalendarWidget /></Bracket>
        <Bracket className="mb-4"><StatsWidget /></Bracket>
        <Bracket className="mb-4"><ActivityWidget /></Bracket>
      </div>
    </aside>
  );
}

// ═══════════════════════════════════════════════════════
// 1. Time
// ═══════════════════════════════════════════════════════

function TimeWidget() {
  // mounted-guard: время инициализируется на клиенте, иначе SSR-mismatch
  // (сервер рендерит одну минуту, клиент — другую → hydration error).
  const [mounted, setMounted] = useState(false);
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    setMounted(true);
    setTime(new Date());
    const id = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  // До монтирования — стабильный placeholder (совпадает на сервере и клиенте)
  if (!mounted) {
    return (
      <div style={{ textAlign: 'center', padding: '6px 0 16px' }}>
        <div style={{ fontSize: 42, fontWeight: 300, letterSpacing: '-0.02em', color: 'var(--text)' }}>
          --:--
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>&nbsp;</div>
      </div>
    );
  }

  const h = String(time.getHours()).padStart(2, '0');
  const m = String(time.getMinutes()).padStart(2, '0');
  const days = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
  const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const start = new Date(time.getFullYear(), 0, 1);
  const week = Math.ceil(((time.getTime() - start.getTime()) / 86400000) / 7);

  return (
    <div style={{ textAlign: 'center', padding: '6px 0 16px' }}>
      <div style={{ fontSize: 42, fontWeight: 300, letterSpacing: '-0.02em', color: 'var(--text)' }}>
        {h}:{m}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
        {days[time.getDay()]}, {time.getDate()} {months[time.getMonth()]}
        <span style={{ marginLeft: 12, color: 'var(--text-mute)' }}>Неделя {week}</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// 2. Focus
// ═══════════════════════════════════════════════════════

function FocusWidget() {
  const [text, setText] = useState('');
  useEffect(() => {
    const key = `focus-${new Date().toISOString().slice(0, 10)}`;
    setText(localStorage.getItem(key) ?? '');
  }, []);
  const save = (val: string) => {
    setText(val);
    const key = `focus-${new Date().toISOString().slice(0, 10)}`;
    if (val.trim()) localStorage.setItem(key, val); else localStorage.removeItem(key);
  };

  return (
    <Section title="ФОКУС ДНЯ">
      <input
        value={text}
        onChange={(e) => save(e.target.value)}
        placeholder="Одно главное дело на сегодня..."
        style={{
          width: '100%', background: 'transparent',
          border: 'none', borderBottom: '0.5px solid var(--border)',
          padding: '6px 0', fontSize: 12, color: 'var(--text)',
          fontFamily: 'inherit', outline: 'none',
        }}
      />
    </Section>
  );
}

// ═══════════════════════════════════════════════════════
// 3. Planned Calls
// ═══════════════════════════════════════════════════════

function PlannedCallsWidget() {
  const { data: calls = [] } = useCalls();
  const pending = calls
    .filter((c) => c.status === 'pending')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 5);

  return (
    <Section title="ЗАПЛАНИРОВАННЫЕ ЗВОНКИ" count={pending.length}>
      {pending.length === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--text-mute)', padding: '4px 0' }}>Нет запланированных</div>
      ) : (
        pending.map((c) => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12 }}>
            <span style={{ color: 'var(--text)' }}>
              {c.contact ? `${c.contact.first_name} ${c.contact.last_name}` : c.company?.name ?? 'Звонок'}
            </span>
            <span style={{ color: 'var(--text-mute)', fontSize: 11 }}>
              {new Date(c.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
              {' '}{new Date(c.date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))
      )}
    </Section>
  );
}

// ═══════════════════════════════════════════════════════
// 4. Calendar
// ═══════════════════════════════════════════════════════

function CalendarWidget() {
  const { selectedDate, setSelectedDate, setPendingAction } = useDrawerStore();
  const { data: calls = [] } = useCalls();
  const { data: meetings = [] } = useMeetings();
  const { data: tasks = [] } = useTasks();
  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const todayStr = new Date().toISOString().slice(0, 10);
  const offset = (() => { const d = new Date(month.y, month.m, 1).getDay(); return d === 0 ? 6 : d - 1; })();
  const days = new Date(month.y, month.m + 1, 0).getDate();
  const mNames = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const dNames = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

  // Build set of dates with events
  const markedDates = new Set<string>();
  calls.forEach((c) => { if (c.status === 'pending' && c.date) markedDates.add(c.date.slice(0, 10)); });
  meetings.forEach((m) => { if (m.date) markedDates.add(m.date.slice(0, 10)); });
  tasks.forEach((t) => { if (t.lane !== 'done' && t.deadline) markedDates.add(t.deadline.slice(0, 10)); });

  const handleDay = (day: number) => {
    const ds = `${month.y}-${String(month.m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setSelectedDate(selectedDate === ds ? null : ds);
  };

  return (
    <Section title="КАЛЕНДАРЬ">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <button onClick={() => setMonth((p) => p.m === 0 ? { y: p.y - 1, m: 11 } : { y: p.y, m: p.m - 1 })} style={navBtn}>&lsaquo;</button>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{mNames[month.m]} {month.y}</span>
        <button onClick={() => setMonth((p) => p.m === 11 ? { y: p.y + 1, m: 0 } : { y: p.y, m: p.m + 1 })} style={navBtn}>&rsaquo;</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center' }}>
        {dNames.map((d) => <div key={d} style={{ fontSize: 10, color: 'var(--text-mute)', padding: '2px 0' }}>{d}</div>)}
        {Array.from({ length: offset }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: days }).map((_, i) => {
          const day = i + 1;
          const ds = `${month.y}-${String(month.m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const isToday = ds === todayStr;
          const isSel = ds === selectedDate;
          const hasEv = markedDates.has(ds);
          return (
            <div key={day} onClick={() => handleDay(day)} style={{
              fontSize: 12, padding: '5px 0', cursor: 'pointer',
              fontWeight: isToday ? 500 : 400,
              color: isSel ? '#fff' : isToday ? 'var(--text)' : 'var(--text-dim)',
              background: isSel ? '#1a1a1a' : 'transparent',
              transition: 'background 0.15s, color 0.15s',
              position: 'relative', textAlign: 'center',
            }}>
              {day}
              {hasEv && <span style={{
                position: 'absolute', bottom: 2, right: 2, width: 0, height: 0,
                borderLeft: '4px solid transparent',
                borderBottom: `4px solid ${isSel ? '#fff' : '#1a1a1a'}`,
              }} />}
            </div>
          );
        })}
      </div>
      {/* Quick actions */}
      <div style={{ display: 'flex', gap: 6, marginTop: 10, opacity: selectedDate ? 1 : 0.3, pointerEvents: selectedDate ? 'auto' : 'none', transition: 'opacity 0.2s' }}>
        {([
          { icon: <Phone size={13} />, label: 'Звонок', type: 'call' as const },
          { icon: <Calendar size={13} />, label: 'Встреча', type: 'meeting' as const },
          { icon: <CheckSquare size={13} />, label: 'Задача', type: 'task' as const },
        ]).map((a) => (
          <button key={a.label} onClick={() => selectedDate && setPendingAction({ type: a.type, date: selectedDate })} style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            padding: '6px 0', fontSize: 11, fontWeight: 500, color: 'var(--text-dim)',
            background: 'transparent', border: '0.5px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit',
          }}>{a.icon} {a.label}</button>
        ))}
      </div>
      {selectedDate && (
        <div style={{ fontSize: 10, color: 'var(--text-mute)', marginTop: 6, textAlign: 'center' }}>
          {new Date(selectedDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      )}
    </Section>
  );
}

const navBtn: React.CSSProperties = {
  background: 'transparent', border: 'none', cursor: 'pointer',
  fontSize: 16, color: 'var(--text-dim)', padding: '2px 8px', fontFamily: 'inherit',
};

// ═══════════════════════════════════════════════════════
// 5. Stats
// ═══════════════════════════════════════════════════════

function StatsWidget() {
  const { data: tasks = [] } = useTasks();
  const { data: calls = [] } = useCalls();
  const { data: meetings = [] } = useMeetings();
  const { data: projects = [] } = useProjects();

  const todayStr = new Date().toISOString().slice(0, 10);
  const active = projects.filter((p) => p.stage !== 'won' && p.stage !== 'lost').length;
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const weekCalls = calls.filter((c) => c.date >= weekAgo).length;
  const nowTasks = tasks.filter((t) => t.lane === 'now' || t.lane === 'next').length;
  const upMeetings = meetings.filter((m) => m.date >= todayStr).length;

  const items = [
    { value: active, label: 'Проектов' },
    { value: weekCalls, label: 'Звонков' },
    { value: nowTasks, label: 'Задач' },
    { value: upMeetings, label: 'Встреч' },
  ];

  return (
    <Section title="СЕЙЧАС В РАБОТЕ">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {items.map((it) => (
          <div key={it.label} style={{ textAlign: 'center', padding: '6px 0' }}>
            <div style={{ fontSize: 22, fontWeight: 500, color: 'var(--text)' }}>{it.value}</div>
            <div style={{ fontSize: 10, color: 'var(--text-mute)' }}>{it.label}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ═══════════════════════════════════════════════════════
// 6. Activity
// ═══════════════════════════════════════════════════════

function ActivityWidget() {
  const { data: entries = [] } = useRecentActivity(5);

  return (
    <Section title="АКТИВНОСТЬ">
      {entries.map((entry) => (
        <div key={entry.id} style={{
          display: 'flex', justifyContent: 'space-between',
          padding: '5px 0', fontSize: 11,
          borderBottom: '0.5px solid var(--border)',
          color: 'var(--text-dim)',
        }}>
          <span>{(entry as any).project?.name ?? entry.event_type}</span>
          <span style={{ color: 'var(--text-mute)', fontSize: 10 }}>
            {(() => {
              const mins = Math.floor((Date.now() - new Date(entry.created_at).getTime()) / 60000);
              if (mins < 60) return `${mins}м`;
              const hrs = Math.floor(mins / 60);
              if (hrs < 24) return `${hrs}ч`;
              return `${Math.floor(hrs / 24)}д`;
            })()}
          </span>
        </div>
      ))}
    </Section>
  );
}

// ═══════════════════════════════════════════════════════
// Section helper
// ═══════════════════════════════════════════════════════

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5,
        marginBottom: 6, fontSize: 10, fontWeight: 500,
        letterSpacing: '0.04em', color: 'var(--text-dim)',
      }}>
        {title}
        {count !== undefined && (
          <span style={{ fontSize: 9, color: 'var(--text-mute)' }}>{count}</span>
        )}
      </div>
      {children}
    </div>
  );
}
