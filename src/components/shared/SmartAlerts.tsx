'use client';

import { useMemo, useState } from 'react';
import { useTasks } from '@/lib/hooks/use-tasks';
import { useProjects } from '@/lib/hooks/use-projects';
import { useCalls } from '@/lib/hooks/use-calls';

interface Alert {
  id: string;
  label: string;
  color: 'red' | 'yellow' | 'orange';
  href: string;
}

export function SmartAlerts() {
  const { data: tasks } = useTasks();
  const { data: projects } = useProjects();
  const { data: calls } = useCalls();
  const [expanded, setExpanded] = useState(false);

  const alerts = useMemo(() => {
    const result: Alert[] = [];
    const todayStr = new Date().toISOString().slice(0, 10);

    // Overdue tasks
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

    // Projects without contact
    const noContact = (projects ?? []).filter(
      (p) => p.stage !== 'won' && p.stage !== 'lost' && !p.contact_id,
    );
    for (const p of noContact.slice(0, 2)) {
      result.push({
        id: `no-contact-${p.id}`,
        label: `${p.name}: нет контакта`,
        color: 'yellow',
        href: `/projects/${p.id}`,
      });
    }

    // Projects with no recent calls (> 5 days)
    const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString();
    const activeProjects = (projects ?? []).filter(
      (p) => p.stage !== 'won' && p.stage !== 'lost' && p.company_id,
    );
    for (const p of activeProjects) {
      const recentCall = (calls ?? []).find(
        (c) => c.project_id === p.id && c.date >= fiveDaysAgo,
      );
      if (!recentCall) {
        const daysSince = (calls ?? [])
          .filter((c) => c.project_id === p.id)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
        if (daysSince) {
          const days = Math.floor((Date.now() - new Date(daysSince.date).getTime()) / 86400000);
          result.push({
            id: `stale-${p.id}`,
            label: `${p.name}: ${days}д без контакта`,
            color: 'orange',
            href: `/projects/${p.id}`,
          });
        }
      }
    }

    return result;
  }, [tasks, projects, calls]);

  if (alerts.length === 0) return null;

  const MAX_VISIBLE = 4;
  const visible = expanded ? alerts : alerts.slice(0, MAX_VISIBLE);
  const remaining = alerts.length - MAX_VISIBLE;

  const colorMap: Record<string, string> = {
    red: 'bg-red-l text-red',
    yellow: 'bg-yellow-l text-yellow',
    orange: 'bg-yellow-l text-yellow',
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5 py-1.5 border-b border-border">
      {visible.map((a) => (
        <a
          key={a.id}
          href={a.href}
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium
                     transition-opacity hover:opacity-80 ${colorMap[a.color]}`}
        >
          {a.label}
        </a>
      ))}
      {!expanded && remaining > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="rounded-full bg-surface2 px-2.5 py-0.5 text-xs font-medium text-text-mute
                     transition-colors hover:text-text-main"
        >
          +{remaining} ещё
        </button>
      )}
    </div>
  );
}
