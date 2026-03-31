'use client';

import { useState, useEffect, useCallback } from 'react';
import { Phone, Plus, Target } from 'lucide-react';
import { useProjects } from '@/lib/hooks/use-projects';
import { useTasks } from '@/lib/hooks/use-tasks';
import { useCalls } from '@/lib/hooks/use-calls';
import { useMeetings } from '@/lib/hooks/use-meetings';
import { CallModal } from '@/components/calls/CallModal';
import type { Call } from '@/lib/hooks/use-calls';

// ═══════════════════════════════════════════════════════
// Clock Widget
// ═══════════════════════════════════════════════════════

function ClockWidget() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    let raf: number;
    let last = 0;
    function tick(ts: number) {
      if (ts - last > 1000) {
        setNow(new Date());
        last = ts;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const time = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const dayName = now.toLocaleDateString('ru-RU', { weekday: 'long' });
  const date = now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7);

  return (
    <div className="rounded-lg bg-surface p-4 shadow-card">
      <div className="text-[2.5rem] font-extrabold leading-none text-text-main tabular-nums">
        {time}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-text-mute">
        <span className="capitalize">{dayName}, {date}</span>
        <span>Неделя {weekNum}</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Planned Calls
// ═══════════════════════════════════════════════════════

function PlannedCalls() {
  const { data: calls = [] } = useCalls();
  const [modalOpen, setModalOpen] = useState(false);

  const pending = calls
    .filter((c) => c.status === 'pending')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .slice(0, 5);

  return (
    <div className="rounded-lg bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-green">
            Запланированные звонки
          </span>
          {pending.length > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-medium text-white">
              {pending.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="rounded p-1 text-text-mute transition-colors hover:bg-accent-l hover:text-accent"
        >
          <Plus size={14} />
        </button>
      </div>

      {pending.length === 0 ? (
        <div className="flex flex-col items-center py-4 text-center">
          <Phone size={28} strokeWidth={1.2} className="text-text-mute" />
          <p className="mt-2 text-xs text-text-mute">Нет запланированных звонков</p>
          <button
            onClick={() => setModalOpen(true)}
            className="mt-1 text-[11px] text-accent hover:underline"
          >
            Добавь через «+» выше
          </button>
        </div>
      ) : (
        <div className="space-y-1">
          {pending.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-surface2">
              <span className="truncate text-text-main">
                {c.contact ? `${c.contact.first_name} ${c.contact.last_name}` : c.company?.name ?? 'Звонок'}
              </span>
              <span className="shrink-0 text-xs text-text-dim">
                {new Date(c.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
              </span>
            </div>
          ))}
        </div>
      )}

      <CallModal isOpen={modalOpen} onClose={() => setModalOpen(false)} editCall={null} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Focus of the Day
// ═══════════════════════════════════════════════════════

function FocusWidget() {
  const todayKey = `focus-day-${new Date().toISOString().slice(0, 10)}`;
  const [text, setText] = useState('');

  useEffect(() => {
    setText(localStorage.getItem(todayKey) ?? '');
  }, [todayKey]);

  const save = useCallback(
    (val: string) => {
      setText(val);
      if (val.trim()) {
        localStorage.setItem(todayKey, val);
      } else {
        localStorage.removeItem(todayKey);
      }
    },
    [todayKey],
  );

  return (
    <div className="rounded-lg border-l-[3px] border-yellow bg-surface p-4 shadow-card">
      <div className="mb-2 flex items-center gap-2">
        <Target size={12} className="text-yellow" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-yellow">
          Фокус дня
        </span>
      </div>
      <input
        value={text}
        onChange={(e) => save(e.target.value)}
        placeholder="Одно главное дело на сегодня..."
        className="w-full rounded border border-border bg-transparent px-2 py-1.5 text-sm text-text-main
                   placeholder:text-text-mute focus:border-accent focus:outline-none"
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Mini KPI Grid
// ═══════════════════════════════════════════════════════

function MiniKpi() {
  const { data: projects } = useProjects();
  const { data: tasks } = useTasks();
  const { data: calls } = useCalls();
  const { data: meetings } = useMeetings();

  const active = (projects ?? []).filter((p) => p.stage !== 'won' && p.stage !== 'lost').length;
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const weekCalls = (calls ?? []).filter((c) => c.date >= weekAgo).length;
  const todayStr = new Date().toISOString().slice(0, 10);
  const dueTasks = (tasks ?? []).filter((t) => t.lane !== 'done' && t.deadline && t.deadline.slice(0, 10) <= todayStr).length;
  const upMeetings = (meetings ?? []).filter((m) => m.date >= todayStr).length;

  const items = [
    { value: active, label: 'Проектов', color: 'text-accent' },
    { value: weekCalls, label: 'Звонков/нед', color: 'text-green' },
    { value: dueTasks, label: 'Задач к сроку', color: 'text-red' },
    { value: upMeetings, label: 'Встреч', color: 'text-yellow' },
  ];

  return (
    <div className="rounded-lg bg-surface p-4 shadow-card">
      <div className="mb-3 text-[10px] font-bold uppercase tracking-widest text-accent">
        Сейчас в работе
      </div>
      <div className="grid grid-cols-2 gap-3">
        {items.map((it) => (
          <div key={it.label}>
            <div className={`text-2xl font-bold tabular-nums ${it.color}`}>{it.value}</div>
            <div className="text-xs text-text-dim">{it.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Composed Sidebar
// ═══════════════════════════════════════════════════════

export function TasksSidebar() {
  return (
    <div className="hidden lg:flex w-80 shrink-0 flex-col gap-3 sticky top-4 self-start">
      <ClockWidget />
      <PlannedCalls />
      <FocusWidget />
      <MiniKpi />
    </div>
  );
}
