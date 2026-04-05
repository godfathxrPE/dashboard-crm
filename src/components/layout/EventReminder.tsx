'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Phone, Calendar, CheckSquare, X } from 'lucide-react';
import { useCalls } from '@/lib/hooks/use-calls';
import { useMeetings } from '@/lib/hooks/use-meetings';
import { useTasks } from '@/lib/hooks/use-tasks';
import { useDrawerStore } from '@/lib/stores/drawer-store';

interface Reminder {
  id: string;
  type: 'call' | 'meeting' | 'task';
  title: string;
  time: string;
  sub?: string;
  link: string;
}

export function EventReminder() {
  const router = useRouter();
  const drawerOpen = useDrawerStore((s) => s.isOpen);
  const { data: calls = [] } = useCalls();
  const { data: meetings = [] } = useMeetings();
  const { data: tasks = [] } = useTasks();

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const dismissed = useRef(new Set<string>());

  const check = useCallback(() => {
    const now = Date.now();
    const in15 = now + 15 * 60 * 1000;
    const upcoming: Reminder[] = [];

    // Calls in next 15 min
    calls.forEach((c) => {
      if (c.status !== 'pending') return;
      const t = new Date(c.date).getTime();
      if (t < now || t > in15) return;
      const key = `call-${c.id}`;
      if (dismissed.current.has(key)) return;
      const d = new Date(c.date);
      upcoming.push({
        id: key, type: 'call',
        title: c.contact ? `${c.contact.first_name} ${c.contact.last_name}` : c.company?.name ?? 'Звонок',
        time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
        sub: c.company?.name,
        link: '/calls',
      });
    });

    // Meetings in next 15 min
    meetings.forEach((m) => {
      if (!m.time) return;
      const t = new Date(`${m.date}T${m.time}`).getTime();
      if (t < now || t > in15) return;
      const key = `meeting-${m.id}`;
      if (dismissed.current.has(key)) return;
      upcoming.push({
        id: key, type: 'meeting',
        title: m.title,
        time: m.time.slice(0, 5),
        sub: m.location ?? undefined,
        link: '/meetings',
      });
    });

    // Tasks due today (show once in morning 9-10)
    const todayStr = new Date().toISOString().slice(0, 10);
    const hour = new Date().getHours();
    if (hour >= 9 && hour < 10) {
      tasks.forEach((t) => {
        if (t.lane === 'done' || !t.deadline) return;
        if (t.deadline.slice(0, 10) !== todayStr) return;
        const key = `task-${t.id}`;
        if (dismissed.current.has(key)) return;
        upcoming.push({
          id: key, type: 'task',
          title: t.text,
          time: 'Сегодня',
          link: '/tasks',
        });
      });
    }

    setReminders(upcoming);
  }, [calls, meetings, tasks]);

  useEffect(() => {
    check();
    const id = setInterval(check, 60000);
    return () => clearInterval(id);
  }, [check]);

  const dismiss = (id: string) => {
    dismissed.current.add(id);
    setReminders((prev) => prev.filter((r) => r.id !== id));
  };

  if (reminders.length === 0) return null;

  const icons = { call: Phone, meeting: Calendar, task: CheckSquare };
  const labels = { call: 'ЗВОНОК', meeting: 'ВСТРЕЧА', task: 'ЗАДАЧА' };

  return (
    <div style={{
      position: 'fixed', top: 16, right: drawerOpen ? 300 : 16,
      zIndex: 9000, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360,
      transition: 'right 0.3s ease',
    }}>
      {reminders.map((r, i) => {
        const Icon = icons[r.type];
        return (
          <Toast key={r.id} index={i}
            onClick={() => { router.push(r.link); dismiss(r.id); }}
            onDismiss={() => dismiss(r.id)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Icon size={14} strokeWidth={1.5} style={{ color: 'var(--text-dim)' }} />
              <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.05em', color: 'var(--text-dim)' }}>{labels[r.type]}</span>
              <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{r.time}</span>
            </div>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)', marginBottom: r.sub ? 4 : 0 }}>{r.title}</div>
            {r.sub && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{r.sub}</div>}
          </Toast>
        );
      })}
    </div>
  );
}

function Toast({ children, index, onClick, onDismiss }: {
  children: React.ReactNode; index: number; onClick: () => void; onDismiss: () => void;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), index * 100); return () => clearTimeout(t); }, [index]);
  useEffect(() => { const t = setTimeout(onDismiss, 30000); return () => clearTimeout(t); }, [onDismiss]);

  return (
    <div onClick={onClick} style={{
      background: 'var(--bg)', border: '0.5px solid var(--border)',
      borderLeft: '3px solid var(--text)', borderRadius: 12,
      padding: '14px 16px', cursor: 'pointer', position: 'relative',
      boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
      transform: visible ? 'translateX(0)' : 'translateX(120%)',
      opacity: visible ? 1 : 0,
      transition: 'transform 0.4s cubic-bezier(0.16,1,0.3,1), opacity 0.4s ease',
    }}>
      <button onClick={(e) => { e.stopPropagation(); onDismiss(); }} style={{
        position: 'absolute', top: 8, right: 8, background: 'transparent',
        border: 'none', cursor: 'pointer', color: 'var(--text-mute)', padding: 4,
      }}><X size={14} /></button>
      {children}
      <div style={{ fontSize: 10, color: 'var(--text-mute)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 3 }}>
        Нажми чтобы открыть
      </div>
    </div>
  );
}
