'use client';

import { useMemo } from 'react';
import { FolderKanban, CheckSquare, Phone, CalendarDays, TrendingUp, Users } from 'lucide-react';
import { useProjects } from '@/lib/hooks/use-projects';
import { useTasks } from '@/lib/hooks/use-tasks';
import { useCalls } from '@/lib/hooks/use-calls';
import { useMeetings } from '@/lib/hooks/use-meetings';
import { useContacts } from '@/lib/hooks/use-contacts';
import { formatBudget } from '@/lib/validators/project';

interface StatCardProps {
  icon: typeof FolderKanban;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  href: string;
}

function StatCard({ icon: Icon, label, value, sub, color, href }: StatCardProps) {
  return (
    <a href={href}
      className="group flex items-center gap-3 rounded-xl border border-border/50 bg-surface px-4 py-3
                 transition-all hover:border-border hover:shadow-sm">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color}`}>
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <div className="text-lg font-bold text-text-main">{value}</div>
        <div className="text-[10px] text-text-mute">{label}</div>
        {sub && <div className="text-[9px] text-text-dim">{sub}</div>}
      </div>
    </a>
  );
}

export function StatsWidget() {
  const { data: projects } = useProjects();
  const { data: tasks } = useTasks();
  const { data: calls } = useCalls();
  const { data: meetings } = useMeetings();
  const { data: contacts } = useContacts();

  const stats = useMemo(() => {
    const activeProjects = (projects ?? []).filter((p) => p.stage !== 'won' && p.stage !== 'lost');
    const wonProjects = (projects ?? []).filter((p) => p.stage === 'won');
    const totalPipeline = activeProjects.reduce((sum, p) => sum + (p.budget ?? 0), 0);

    const activeTasks = (tasks ?? []).filter((t) => t.lane !== 'done');
    const doneTasks = (tasks ?? []).filter((t) => t.lane === 'done');

    const today = new Date().toISOString().slice(0, 10);
    const todayCalls = (calls ?? []).filter((c) => c.status === 'done' && c.date.slice(0, 10) === today);

    const upcomingMeetings = (meetings ?? []).filter((m) => m.date >= today);

    return {
      activeProjects: activeProjects.length,
      wonCount: wonProjects.length,
      pipeline: formatBudget(totalPipeline),
      activeTasks: activeTasks.length,
      doneTasks: doneTasks.length,
      todayCalls: todayCalls.length,
      totalCalls: (calls ?? []).length,
      upcomingMeetings: upcomingMeetings.length,
      contacts: (contacts ?? []).length,
    };
  }, [projects, tasks, calls, meetings, contacts]);

  return (
    <div>
      <h2 className="mb-3 text-xs font-semibold text-text-dim">Ключевые метрики</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard icon={FolderKanban} label="Активных проектов" value={stats.activeProjects}
          sub={`Воронка: ${stats.pipeline}`} color="bg-accent-l text-accent" href="/projects" />
        <StatCard icon={CheckSquare} label="Задач в работе" value={stats.activeTasks}
          sub={`Выполнено: ${stats.doneTasks}`} color="bg-blue/10 text-blue" href="/tasks" />
        <StatCard icon={Phone} label="Звонков сегодня" value={stats.todayCalls}
          sub={`Всего: ${stats.totalCalls}`} color="bg-green/10 text-green" href="/calls" />
        <StatCard icon={CalendarDays} label="Ближайших встреч" value={stats.upcomingMeetings}
          color="bg-yellow/10 text-yellow" href="/meetings" />
        <StatCard icon={Users} label="Контактов" value={stats.contacts}
          color="bg-purple/10 text-purple" href="/contacts" />
      </div>
    </div>
  );
}
