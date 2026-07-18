'use client';

import { useMemo } from 'react';
import { useTasks } from './use-tasks';
import { useProjects } from './use-projects';
import { useCalls } from './use-calls';
import type { AlertItem } from '@/components/shared/StatusBeacon';
import { localDateKey } from '@/lib/utils/date-helpers';

export function useAlerts(): AlertItem[] {
  const { data: tasks } = useTasks();
  const { data: projects } = useProjects();
  const { data: calls } = useCalls();

  return useMemo(() => {
    const alerts: AlertItem[] = [];
    const todayStr = localDateKey();

    // Просроченные задачи
    const overdue = (tasks ?? []).filter(
      // deadline — timestamptz: голый slice(0,10) даёт UTC-дату (00:00–03:00 МСК → вчера).
      (t) => t.lane !== 'done' && t.deadline && localDateKey(new Date(t.deadline)) < todayStr,
    );
    if (overdue.length > 0) {
      alerts.push({
        id: 'overdue-tasks',
        type: 'overdue',
        severity: 'critical',
        title: `${overdue.length} просроч. ${overdue.length === 1 ? 'задача' : 'задач'}`,
        href: '/tasks',
      });
    }

    // Проекты без контакта
    const noContact = (projects ?? []).filter(
      (p) => p.type === 'client' && p.status !== 'won' && p.status !== 'lost' && !p.contact_id,
    );
    for (const p of noContact.slice(0, 2)) {
      alerts.push({
        id: `no-contact-${p.id}`,
        type: 'no_contact',
        severity: 'warning',
        title: `${p.name}: нет контакта`,
        href: `/deals/${p.id}`,
      });
    }

    // Проекты без свежих звонков (>5 дней)
    const fiveDaysAgo = new Date(Date.now() - 5 * 86400000).toISOString();
    const active = (projects ?? []).filter(
      (p) => p.type === 'client' && p.status !== 'won' && p.status !== 'lost' && p.company_id,
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
          alerts.push({
            id: `stale-${p.id}`,
            type: 'stale',
            severity: 'warning',
            title: `${p.name}: ${days}д без контакта`,
            href: `/deals/${p.id}`,
          });
        }
      }
    }

    return alerts.slice(0, 5);
  }, [tasks, projects, calls]);
}
