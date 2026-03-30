'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import {
  CheckSquare, FolderKanban, Phone, CalendarDays,
  Users, Building2, TrendingUp, Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface Props {
  userId: string;
}

interface StatCard {
  label: string;
  icon: React.ElementType;
  value: number;
  color: string;
  href: string;
}

function useStats() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const [tasks, projects, calls, meetings, contacts, companies] =
        await Promise.all([
          supabase.from('tasks').select('id', { count: 'exact', head: true }).neq('lane', 'done'),
          supabase.from('projects').select('id', { count: 'exact', head: true }).neq('stage', 'lost').neq('stage', 'won'),
          supabase.from('calls').select('id', { count: 'exact', head: true }),
          supabase.from('meetings').select('id', { count: 'exact', head: true }),
          supabase.from('contacts').select('id', { count: 'exact', head: true }),
          supabase.from('companies').select('id', { count: 'exact', head: true }),
        ]);

      return {
        activeTasks: tasks.count ?? 0,
        activeProjects: projects.count ?? 0,
        totalCalls: calls.count ?? 0,
        totalMeetings: meetings.count ?? 0,
        totalContacts: contacts.count ?? 0,
        totalCompanies: companies.count ?? 0,
      };
    },
  });
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 6)  return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

function formatDate(): string {
  return new Date().toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function DashboardContent({ userId }: Props) {
  const { data, isLoading } = useStats();

  const stats: StatCard[] = [
    { label: 'Задач в работе',    icon: CheckSquare,   value: data?.activeTasks ?? 0,    color: 'text-blue bg-blue-l',     href: '/tasks' },
    { label: 'Активных проектов', icon: FolderKanban,  value: data?.activeProjects ?? 0, color: 'text-green bg-green-l',   href: '/projects' },
    { label: 'Всего звонков',     icon: Phone,         value: data?.totalCalls ?? 0,     color: 'text-accent bg-accent-l', href: '/calls' },
    { label: 'Встреч',            icon: CalendarDays,  value: data?.totalMeetings ?? 0,  color: 'text-yellow bg-yellow-l', href: '/meetings' },
    { label: 'Контактов',         icon: Users,         value: data?.totalContacts ?? 0,  color: 'text-blue bg-blue-l',     href: '/contacts' },
    { label: 'Компаний',          icon: Building2,     value: data?.totalCompanies ?? 0, color: 'text-green bg-green-l',   href: '/companies' },
  ];

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-xl font-semibold text-text-main">
          {getGreeting()} 👋
        </h1>
        <p className="text-sm text-text-mute capitalize">{formatDate()}</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map(({ label, icon: Icon, value, color, href }) => (
          <a
            key={label}
            href={href}
            className="group rounded-xl border border-border bg-surface p-4 shadow-[var(--shadow-card)] transition-all hover:border-accent/30 hover:shadow-md"
          >
            <div className="flex items-center justify-between">
              <div
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg',
                  color,
                )}
              >
                <Icon size={18} />
              </div>
              <TrendingUp
                size={14}
                className="text-text-mute opacity-0 transition-opacity group-hover:opacity-100"
              />
            </div>
            <div className="mt-3">
              <div className="text-2xl font-bold text-text-main">
                {isLoading ? '—' : value}
              </div>
              <div className="text-xs text-text-mute">{label}</div>
            </div>
          </a>
        ))}
      </div>

      {/* Placeholder for widgets */}
      <div className="rounded-xl border border-dashed border-border p-12 text-center">
        <Clock size={32} className="mx-auto text-text-mute" />
        <h2 className="mt-3 text-sm font-medium text-text-dim">
          Виджеты будут здесь
        </h2>
        <p className="mt-1 text-xs text-text-mute">
          Sprint 5 — Pomodoro, Funnel, Heatmap, и ещё 9 виджетов
        </p>
      </div>
    </div>
  );
}
