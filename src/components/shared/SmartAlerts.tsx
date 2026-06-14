'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useTasks } from '@/lib/hooks/use-tasks';
import { useProjects } from '@/lib/hooks/use-projects';
import { useCalls } from '@/lib/hooks/use-calls';
import { useUiStore } from '@/lib/stores/ui-store';
import { localDateKey } from '@/lib/utils/date-helpers';

interface Alert {
  id: string;
  label: string;
  color: 'red' | 'yellow' | 'accent';
  href: string;
}

export function SmartAlerts() {
  const { data: tasks } = useTasks();
  const { data: projects } = useProjects();
  const { data: calls } = useCalls();
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);

  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const alerts = useMemo(() => {
    const result: Alert[] = [];
    const todayStr = localDateKey();

    const overdue = (tasks ?? []).filter(
      (t) => t.lane !== 'done' && t.deadline && t.deadline.slice(0, 10) < todayStr,
    );
    if (overdue.length > 0) {
      result.push({
        id: 'overdue-tasks',
        label: `${overdue.length} просроч. ${overdue.length === 1 ? 'задача' : 'задач'}`,
        color: 'red',
        href: '/tasks',
      });
    }

    const noContact = (projects ?? []).filter(
      (p) => p.stage !== 'won' && p.stage !== 'lost' && !p.contact_id,
    );
    for (const p of noContact.slice(0, 2)) {
      result.push({
        id: `no-contact-${p.id}`,
        label: `${p.name}: нет контакта`,
        color: 'accent',
        href: `/projects/${p.id}`,
      });
    }

    const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString();
    const active = (projects ?? []).filter(
      (p) => p.stage !== 'won' && p.stage !== 'lost' && p.company_id,
    );
    for (const p of active.slice(0, 3)) {
      const recentCall = (calls ?? []).find(
        (c) => c.project_id === p.id && c.date >= fiveDaysAgo,
      );
      if (!recentCall) {
        const last = (calls ?? [])
          .filter((c) => c.project_id === p.id)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        if (last) {
          const days = Math.floor((Date.now() - new Date(last.date).getTime()) / 86400000);
          result.push({
            id: `stale-${p.id}`,
            label: `${p.name}: ${days}д без контакта`,
            color: 'yellow',
            href: `/projects/${p.id}`,
          });
        }
      }
    }

    return result.slice(0, 5);
  }, [tasks, projects, calls]);

  // Auto-hide after 10s, reset on data change
  useEffect(() => {
    if (alerts.length === 0) return;
    setDismissed(false);
    setVisible(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 10000);
    return () => clearTimeout(timerRef.current);
  }, [alerts.length]);

  if (alerts.length === 0 || dismissed) return null;

  const colorMap: Record<string, string> = {
    red: 'bg-red-l text-red',
    yellow: 'bg-yellow-l text-yellow',
    accent: 'bg-accent-l text-accent',
  };

  return (
    <div
      className={`fixed top-14 z-40 flex flex-wrap items-center gap-1.5
                  bg-surface border-b border-border shadow-sm
                  px-4 py-1.5 transition-opacity duration-300
                  ${sidebarOpen ? 'left-56' : 'left-16'} right-0
                  ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
    >
      {alerts.map((a) => (
        <a
          key={a.id}
          href={a.href}
          className={`inline-flex items-center rounded-full px-2.5 py-[3px] text-xs font-medium
                     transition-opacity hover:opacity-80 ${colorMap[a.color]}`}
        >
          {a.label}
        </a>
      ))}
      <button
        onClick={() => setDismissed(true)}
        className="ml-auto rounded p-0.5 text-text-mute transition-colors hover:text-text-main"
      >
        <X size={14} />
      </button>
    </div>
  );
}
