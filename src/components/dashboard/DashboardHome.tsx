'use client';

import { useMemo } from 'react';
import {
  FolderKanban,
  CheckSquare,
  Phone,
  TrendingUp,
  Banknote,
  Calendar,
  Clock,
  ArrowRightLeft,
  MessageSquare,
  Users,
  Pencil,
  Loader2,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useProjects } from '@/lib/hooks/use-projects';
import { useTasks } from '@/lib/hooks/use-tasks';
import { useCalls } from '@/lib/hooks/use-calls';
import { useRecentActivity } from '@/lib/hooks/use-activity-log';
import {
  STAGE_CONFIG,
  PHASE_CONFIG,
  getActiveStages,
  formatBudget,
  type DealStage,
} from '@/lib/validators/project';
import type { ActivityLog } from '@/types/entities';

// ═══════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════

function relativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins}м назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}ч назад`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}д назад`;
  return new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function deadlineUrgency(date: string): { label: string; color: string } {
  const days = Math.ceil(
    (new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  if (days < 0) return { label: `${Math.abs(days)}д просрочено`, color: 'text-red' };
  if (days === 0) return { label: 'Сегодня', color: 'text-red' };
  if (days <= 3) return { label: `Через ${days}д`, color: 'text-red' };
  if (days <= 14) return { label: `Через ${days}д`, color: 'text-yellow' };
  if (days <= 30) return { label: `Через ${days}д`, color: 'text-yellow' };
  return { label: `Через ${days}д`, color: 'text-green' };
}

// ═══════════════════════════════════════════════════════
// Skeleton
// ═══════════════════════════════════════════════════════

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-border/50 bg-surface p-4">
      <div className="mb-2 h-3 w-16 rounded bg-border/50" />
      <div className="h-7 w-20 rounded bg-border/50" />
    </div>
  );
}

function SkeletonChart() {
  return (
    <div className="animate-pulse rounded-xl border border-border/50 bg-surface p-4">
      <div className="mb-4 h-3 w-32 rounded bg-border/50" />
      <div className="h-48 rounded bg-border/30" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// KPI Cards
// ═══════════════════════════════════════════════════════

function KpiCards() {
  const { data: projects, isLoading: loadingP } = useProjects();
  const { data: tasks, isLoading: loadingT } = useTasks();
  const { data: calls, isLoading: loadingC } = useCalls();

  const kpi = useMemo(() => {
    const active = (projects ?? []).filter((p) => p.stage !== 'won' && p.stage !== 'lost');
    const won = (projects ?? []).filter((p) => p.stage === 'won');
    const lost = (projects ?? []).filter((p) => p.stage === 'lost');
    const pipeline = active.reduce((s, p) => s + (p.budget ?? 0), 0);

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    const urgentTasks = (tasks ?? []).filter((t) => {
      if (t.lane === 'done' || !t.deadline) return false;
      return t.deadline.slice(0, 10) <= todayStr;
    });

    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const weekCalls = (calls ?? []).filter((c) => c.date >= weekAgo);

    const closed = won.length + lost.length;
    const conversion = closed > 0 ? Math.round((won.length / closed) * 100) : 0;

    return {
      activeProjects: active.length,
      pipeline,
      urgentTasks: urgentTasks.length,
      weekCalls: weekCalls.length,
      conversion,
    };
  }, [projects, tasks, calls]);

  if (loadingP || loadingT || loadingC) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  const cards = [
    {
      icon: FolderKanban,
      label: 'Активные проекты',
      value: kpi.activeProjects,
      iconBg: 'bg-blue-l text-blue',
      href: '/projects',
    },
    {
      icon: Banknote,
      label: 'Сумма pipeline',
      value: formatBudget(kpi.pipeline),
      iconBg: 'bg-green-l text-green',
      href: '/projects',
    },
    {
      icon: CheckSquare,
      label: 'Задачи на сегодня',
      value: kpi.urgentTasks,
      sub: 'просрочено или дедлайн сегодня',
      iconBg: 'bg-red-l text-red',
      href: '/tasks',
    },
    {
      icon: Phone,
      label: 'Звонки за неделю',
      value: kpi.weekCalls,
      iconBg: 'bg-accent-l text-accent',
      href: '/calls',
    },
    {
      icon: TrendingUp,
      label: 'Конверсия',
      value: `${kpi.conversion}%`,
      sub: 'won / (won + lost)',
      iconBg: 'bg-yellow-l text-yellow',
      href: '/analytics',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((c) => {
        const isEmpty = c.value === 0 || c.value === '0%' || c.value === '—';
        return (
          <a
            key={c.label}
            href={c.href}
            data-kpi
            className="group flex items-center gap-3 rounded-xl bg-surface px-4 py-3
                       shadow-card transition-all duration-150 hover:shadow-card-hover"
          >
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${c.iconBg}`}>
              <c.icon size={16} />
            </div>
            <div className="min-w-0">
              <div className={`text-lg font-bold ${isEmpty ? 'text-text-mute' : 'text-text-main'}`}>
                {c.value}
              </div>
              <div className="text-[10px] text-text-mute">{c.label}</div>
              {c.sub && <div className="text-[9px] text-text-dim">{c.sub}</div>}
            </div>
          </a>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Pipeline Funnel Chart (horizontal bars)
// ═══════════════════════════════════════════════════════

function PipelineFunnelChart() {
  const { data: projects, isLoading } = useProjects();

  const chartData = useMemo(() => {
    if (!projects) return [];
    const active = projects.filter((p) => p.stage !== 'won' && p.stage !== 'lost');

    return getActiveStages().map((stage) => {
      const count = active.filter((p) => p.stage === stage).length;
      const config = STAGE_CONFIG[stage];
      return {
        name: config.shortLabel,
        count,
        phase: config.phase,
      };
    });
  }, [projects]);

  if (isLoading) return <SkeletonChart />;

  const phaseColors: Record<string, string> = {
    attract: 'var(--color-blue, #3b82f6)',
    develop: 'var(--color-accent, #c27a3a)',
    negotiate: 'var(--color-yellow, #eab308)',
    close: 'var(--color-green, #22c55e)',
  };

  return (
    <div className="rounded-xl bg-surface p-4 shadow-card transition-shadow duration-150 hover:shadow-card-hover">
      <h3 className="mb-4 text-xs font-semibold text-text-dim">Воронка по стадиям</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 60, right: 16, top: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e5e5)" />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
          <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={55} />
          <Tooltip
            contentStyle={{
              background: 'var(--color-surface, #fff)',
              border: '1px solid var(--color-border, #e5e5e5)',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={16}>
            {chartData.map((entry, idx) => (
              <Cell key={idx} fill={phaseColors[entry.phase] ?? '#999'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Calls 14-day Chart (stacked vertical bars)
// ═══════════════════════════════════════════════════════

function CallsRecentChart() {
  const { data: calls, isLoading } = useCalls();

  const chartData = useMemo(() => {
    if (!calls) return [];
    const now = new Date();
    const days: { date: string; label: string; done: number; pending: number; cancelled: number }[] = [];

    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

      const dayCalls = calls.filter((c) => c.date.slice(0, 10) === dateStr);
      days.push({
        date: dateStr,
        label,
        done: dayCalls.filter((c) => c.status === 'done').length,
        pending: dayCalls.filter((c) => c.status === 'pending').length,
        cancelled: dayCalls.filter((c) => c.status === 'cancelled').length,
      });
    }
    return days;
  }, [calls]);

  if (isLoading) return <SkeletonChart />;

  return (
    <div className="rounded-xl bg-surface p-4 shadow-card transition-shadow duration-150 hover:shadow-card-hover">
      <h3 className="mb-4 text-xs font-semibold text-text-dim">Звонки за 14 дней</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e5e5)" />
          <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={1} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={24} />
          <Tooltip
            contentStyle={{
              background: 'var(--color-surface, #fff)',
              border: '1px solid var(--color-border, #e5e5e5)',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Bar dataKey="done" stackId="calls" fill="var(--color-green, #22c55e)" name="Выполнено" radius={[0, 0, 0, 0]} />
          <Bar dataKey="pending" stackId="calls" fill="var(--color-blue, #3b82f6)" name="Запланир." radius={[0, 0, 0, 0]} />
          <Bar dataKey="cancelled" stackId="calls" fill="var(--color-red, #ef4444)" name="Отменено" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Upcoming Deadlines
// ═══════════════════════════════════════════════════════

function UpcomingDeadlines() {
  const { data: projects, isLoading } = useProjects();

  const items = useMemo(() => {
    if (!projects) return [];
    return projects
      .filter((p) => p.deadline && p.stage !== 'won' && p.stage !== 'lost')
      .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())
      .slice(0, 5);
  }, [projects]);

  if (isLoading) {
    return (
      <div className="animate-pulse rounded-xl border border-border/50 bg-surface p-4">
        <div className="mb-3 h-3 w-32 rounded bg-border/50" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="mb-2 h-8 rounded bg-border/30" />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-surface p-4 shadow-card transition-shadow duration-150 hover:shadow-card-hover">
      <div className="mb-3 flex items-center gap-2">
        <Calendar size={14} className="text-yellow" />
        <span className="text-xs font-semibold text-text-dim">Ближайшие дедлайны</span>
      </div>

      {items.length === 0 ? (
        <p className="py-4 text-center text-xs text-text-mute italic">Нет ближайших дедлайнов</p>
      ) : (
        <div className="space-y-1">
          {items.map((p) => {
            const urg = deadlineUrgency(p.deadline!);
            return (
              <a
                key={p.id}
                href={`/projects/${p.id}`}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5
                           transition-colors hover:bg-surface-hover"
              >
                <FolderKanban size={11} className="shrink-0 text-accent" />
                <span className="min-w-0 flex-1 truncate text-xs text-text-main">
                  {p.name}
                </span>
                {p.company?.name && (
                  <span className="hidden shrink-0 text-[10px] text-text-mute sm:inline">
                    {p.company.name}
                  </span>
                )}
                <span className={`shrink-0 text-[10px] font-medium ${urg.color}`}>
                  {urg.label}
                </span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Recent Activity (global)
// ═══════════════════════════════════════════════════════

const EVENT_ICON: Record<string, typeof ArrowRightLeft> = {
  stage_change: ArrowRightLeft,
  call_logged: Phone,
  task_created: CheckSquare,
  task_completed: CheckSquare,
  meeting_scheduled: Calendar,
  project_updated: Pencil,
  comment_added: MessageSquare,
};

const EVENT_COLOR: Record<string, string> = {
  stage_change: 'text-blue',
  call_logged: 'text-green',
  task_created: 'text-purple',
  task_completed: 'text-purple',
  meeting_scheduled: 'text-yellow',
  project_updated: 'text-text-dim',
  comment_added: 'text-text-mute',
};

function stageName(key: unknown): string {
  const s = String(key);
  return (STAGE_CONFIG as Record<string, { shortLabel: string }>)[s]?.shortLabel ?? s;
}

function describeEvent(entry: ActivityLog): string {
  const p = entry.payload as Record<string, unknown>;
  switch (entry.event_type) {
    case 'stage_change':
      return `Стадия: ${stageName(p.from)} → ${stageName(p.to)}`;
    case 'call_logged':
      return p.contact_name ? `Звонок: ${p.contact_name}` : 'Звонок записан';
    case 'task_created':
      return `Задача: ${p.title ?? ''}`;
    case 'task_completed':
      return `Выполнено: ${p.title ?? ''}`;
    case 'meeting_scheduled':
      return `Встреча: ${p.title ?? ''}`;
    case 'project_updated': {
      const fields = p.fields_changed as string[] | undefined;
      return fields ? `Обновлено: ${fields.join(', ')}` : 'Проект обновлён';
    }
    case 'comment_added':
      return (p.text as string) ?? 'Комментарий';
    default:
      return entry.event_type;
  }
}

function RecentActivityList() {
  const { data: entries, isLoading } = useRecentActivity(5);

  if (isLoading) {
    return (
      <div className="animate-pulse rounded-xl border border-border/50 bg-surface p-4">
        <div className="mb-3 h-3 w-32 rounded bg-border/50" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="mb-2 h-8 rounded bg-border/30" />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-surface p-4 shadow-card transition-shadow duration-150 hover:shadow-card-hover">
      <div className="mb-3 flex items-center gap-2">
        <Clock size={14} className="text-text-dim" />
        <span className="text-xs font-semibold text-text-dim">Последние действия</span>
      </div>

      {(!entries || entries.length === 0) ? (
        <p className="py-4 text-center text-xs text-text-mute italic">Нет активности</p>
      ) : (
        <div className="space-y-1">
          {entries.map((entry) => {
            const Icon = EVENT_ICON[entry.event_type] ?? MessageSquare;
            const color = EVENT_COLOR[entry.event_type] ?? 'text-text-mute';
            const projectName = (entry as any).project?.name;
            const projectId = entry.project_id;

            return (
              <a
                key={entry.id}
                href={`/projects/${projectId}`}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5
                           transition-colors hover:bg-surface-hover"
              >
                <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-bg ${color}`}>
                  <Icon size={10} />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-text-main">
                    {describeEvent(entry)}
                  </span>
                  {projectName && (
                    <span className="text-[10px] text-text-mute">{projectName}</span>
                  )}
                </div>
                <span className="shrink-0 text-[10px] text-text-mute">
                  {relativeTime(entry.created_at)}
                </span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Main Dashboard Composition
// ═══════════════════════════════════════════════════════

export function DashboardHome() {
  return (
    <div className="space-y-4">
      {/* Row 1: KPI cards */}
      <KpiCards />

      {/* Row 2: Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <PipelineFunnelChart />
        <CallsRecentChart />
      </div>

      {/* Row 3: Lists */}
      <div className="grid gap-4 md:grid-cols-2">
        <UpcomingDeadlines />
        <RecentActivityList />
      </div>
    </div>
  );
}
