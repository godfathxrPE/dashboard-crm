'use client';

import { useMemo, useState } from 'react';
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
  Trash2,
  X,
  Loader2,
} from 'lucide-react';
import { useThemeStore } from '@/lib/stores/theme-store';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
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
import { AnimatedNumber } from '@/components/shared/AnimatedNumber';
import { staggerClass } from '@/lib/utils/stagger';
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

function TrendBadge({ delta, label = 'за нед.' }: { delta: number; label?: string }) {
  if (delta === 0) return <span className="text-[9px] text-text-mute">→ без изменений</span>;
  const up = delta > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[9px] font-medium ${up ? 'text-green' : 'text-red'}`}>
      <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d={up ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
      </svg>
      {up ? '+' : ''}{delta} {label}
    </span>
  );
}

const FUJI_KPI_META: Record<string, { watermark: string; wmColor: string }> = {
  'Активные проекты':  { watermark: 'ПРОЕКТЫ',  wmColor: 'rgba(26,39,68,0.05)' },
  'Сумма pipeline':    { watermark: 'PIPELINE',  wmColor: 'rgba(196,170,120,0.07)' },
  'Задачи на сегодня': { watermark: 'ЗАДАЧИ',    wmColor: 'rgba(26,39,68,0.05)' },
  'Звонки за неделю':  { watermark: 'ЗВОНКИ',    wmColor: 'rgba(194,59,59,0.05)' },
  'Конверсия':         { watermark: 'КОНВЕРСИЯ',  wmColor: 'rgba(74,122,90,0.05)' },
};

const WASHI_KPI_META: Record<string, { kanji: string; color: string; short: string }> = {
  'Активные проекты':  { kanji: '案', color: '#2B5F8A', short: 'Проекты' },
  'Сумма pipeline':    { kanji: '額', color: '#2B5F8A', short: 'Pipeline' },
  'Задачи на сегодня': { kanji: '務', color: '#4E6A2E', short: 'Задачи' },
  'Звонки за неделю':  { kanji: '電', color: '#C23B3B', short: 'Звонки' },
  'Конверсия':         { kanji: '率', color: '#8B6914', short: 'Конверсия' },
};

function KpiCards() {
  const { data: projects, isLoading: loadingP } = useProjects();
  const { data: tasks, isLoading: loadingT } = useTasks();
  const { data: calls, isLoading: loadingC } = useCalls();
  const theme = useThemeStore((s) => s.theme);
  const isWashi = theme === 't-washi';
  const isFuji = theme === 't-fuji';

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

    const weekAgo = new Date(today.getTime() - 7 * 86400000).toISOString();
    const twoWeeksAgo = new Date(today.getTime() - 14 * 86400000).toISOString();
    const weekCalls = (calls ?? []).filter((c) => c.date >= weekAgo);
    const prevWeekCalls = (calls ?? []).filter((c) => c.date >= twoWeeksAgo && c.date < weekAgo);

    const closed = won.length + lost.length;
    const conversion = closed > 0 ? Math.round((won.length / closed) * 100) : 0;

    // Trends: new projects this week vs last week
    const newThisWeek = active.filter((p) => p.created_at >= weekAgo).length;
    const newLastWeek = active.filter((p) => p.created_at >= twoWeeksAgo && p.created_at < weekAgo).length;

    return {
      activeProjects: active.length,
      pipeline,
      urgentTasks: urgentTasks.length,
      weekCalls: weekCalls.length,
      conversion,
      trends: {
        projects: newThisWeek - newLastWeek,
        calls: weekCalls.length - prevWeekCalls.length,
      },
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
      num: kpi.activeProjects,
      fmt: (n: number) => String(Math.round(n)),
      iconBg: 'bg-accent-l text-accent',
      href: '/projects',
      trend: kpi.trends.projects,
    },
    {
      icon: Banknote,
      label: 'Сумма pipeline',
      num: kpi.pipeline,
      fmt: (n: number) => formatBudget(Math.round(n)),
      iconBg: 'bg-accent-l text-accent',
      href: '/projects',
    },
    {
      icon: CheckSquare,
      label: 'Задачи на сегодня',
      num: kpi.urgentTasks,
      fmt: (n: number) => String(Math.round(n)),
      sub: 'просрочено или дедлайн сегодня',
      iconBg: 'bg-red-l text-red',
      href: '/tasks',
    },
    {
      icon: Phone,
      label: 'Звонки за неделю',
      num: kpi.weekCalls,
      fmt: (n: number) => String(Math.round(n)),
      iconBg: 'bg-green-l text-green',
      href: '/calls',
      trend: kpi.trends.calls,
    },
    {
      icon: TrendingUp,
      label: 'Конверсия',
      num: kpi.conversion,
      fmt: (n: number) => `${Math.round(n)}%`,
      sub: 'won / (won + lost)',
      iconBg: 'bg-green-l text-green',
      href: '/analytics',
    },
  ];

  // Fuji: 4 cards (skip Конверсия)
  const visibleCards = isFuji ? cards.filter((c) => c.label !== 'Конверсия') : cards;
  const gridCols = isFuji ? 'grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5';

  return (
    <div className={`grid ${gridCols}`}>
      {visibleCards.map((c, i) => {
        const isEmpty = c.num === 0;
        const wm = isWashi ? WASHI_KPI_META[c.label] : null;
        const fm = isFuji ? FUJI_KPI_META[c.label] : null;

        // Fuji: watermark layout — no icon, text watermark bottom-right
        if (fm) {
          return (
            <a
              key={c.label}
              href={c.href}
              data-kpi
              className={`group relative overflow-hidden rounded-lg bg-surface px-5 py-5
                         elevation-hover border border-border ${staggerClass(i)}`}
              style={{ minHeight: 100 }}
            >
              {/* Watermark text */}
              <span
                className="absolute select-none pointer-events-none"
                aria-hidden="true"
                style={{
                  right: 12,
                  bottom: 8,
                  fontSize: '48px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '2px',
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                  color: fm.wmColor,
                }}
              >
                {fm.watermark}
              </span>
              {/* Value */}
              <AnimatedNumber
                value={c.num}
                formatFn={c.fmt}
                className="text-[32px] font-bold leading-none block relative z-[1] text-text-main"
              />
              {/* Trend */}
              {'trend' in c && c.trend != null && (
                <div className="relative z-[1] mt-1.5">
                  <TrendBadge delta={c.trend} />
                </div>
              )}
            </a>
          );
        }

        return (
          <a
            key={c.label}
            href={c.href}
            data-kpi
            className={`group relative overflow-hidden flex items-center gap-3 rounded-lg bg-surface px-4 py-4
                       elevation-hover border border-border ${staggerClass(i)}`}
          >
            {/* Washi: kanji watermark */}
            {wm && (
              <span
                className="absolute -top-1 -right-1 select-none pointer-events-none"
                aria-hidden="true"
                style={{
                  fontSize: '56px',
                  lineHeight: 1,
                  fontFamily: "'Noto Sans JP', sans-serif",
                  fontWeight: 400,
                  color: wm.color,
                  opacity: 0.06,
                }}
              >
                {wm.kanji}
              </span>
            )}
            {/* Icon */}
            {wm ? (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center">
                <c.icon size={28} style={{ color: isEmpty ? undefined : wm.color }} className={isEmpty ? 'text-text-mute opacity-50' : ''} />
              </div>
            ) : (
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full
                              ${isEmpty ? 'bg-surface2 text-text-mute opacity-50' : c.iconBg}`}>
                <c.icon size={18} />
              </div>
            )}
            <div className="min-w-0">
              <AnimatedNumber
                value={c.num}
                formatFn={c.fmt}
                className={`text-2xl font-extrabold leading-tight block
                            ${isEmpty ? 'text-text-mute opacity-50' : 'text-text-main'}`}
              />
              <div className="text-[11px] text-text-mute leading-tight mt-0.5" title={wm ? c.label : undefined}>
                {wm ? wm.short : c.label}
              </div>
              {c.sub && !wm && <div className="text-[9px] text-text-dim">{c.sub}</div>}
              {'trend' in c && c.trend != null && <TrendBadge delta={c.trend} />}
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
  const [drillStage, setDrillStage] = useState<string | null>(null);

  const chartData = useMemo(() => {
    if (!projects) return [];
    const active = projects.filter((p) => p.stage !== 'won' && p.stage !== 'lost');

    return getActiveStages().map((stage) => {
      const count = active.filter((p) => p.stage === stage).length;
      const config = STAGE_CONFIG[stage];
      return {
        stage,
        name: config.shortLabel,
        count,
        phase: config.phase,
      };
    });
  }, [projects]);

  const drillProjects = useMemo(() => {
    if (!drillStage || !projects) return [];
    return projects.filter((p) => p.stage === drillStage);
  }, [drillStage, projects]);

  if (isLoading) return <SkeletonChart />;

  return (
    <div className="rounded-lg bg-surface p-4 elevation-hover">
      <h3 className="mb-4 text-xs font-semibold text-text-dim">Воронка по стадиям</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 60, right: 16, top: 0, bottom: 0 }}>
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--text-mute)' }} axisLine={false} tickLine={false} />
          <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: 'var(--text-dim)' }} width={55} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              boxShadow: 'var(--shadow-md)',
              fontSize: 11,
            }}
            labelStyle={{ color: 'var(--text)' }}
            itemStyle={{ color: 'var(--text-dim)' }}
            cursor={{ fill: 'var(--surface2)', opacity: 0.5 }}
          />
          <Bar
            dataKey="count"
            radius={[0, 4, 4, 0]}
            barSize={16}
            className="cursor-pointer"
            onClick={(_data: unknown, idx: number) => {
              const stage = chartData[idx]?.stage;
              if (stage) setDrillStage((prev) => (prev === stage ? null : stage));
            }}
          >
            {chartData.map((entry, idx) => {
              const fills: Record<string, string> = {
                attract: 'var(--track-prep-current)',
                develop: 'var(--track-exp-current)',
                negotiate: 'var(--track-nego-current, var(--track-exp-current))',
                close: 'var(--track-proj-current)',
              };
              return <Cell key={idx} fill={fills[entry.phase] ?? 'var(--text-mute)'} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Drill-down panel */}
      {drillStage && drillProjects.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-text-main">
              {STAGE_CONFIG[drillStage as DealStage]?.label} — {drillProjects.length}
            </span>
            <button onClick={() => setDrillStage(null)} className="text-text-mute hover:text-text-main transition-colors">
              <X size={14} />
            </button>
          </div>
          <div className="space-y-1">
            {drillProjects.map((p) => (
              <a
                key={p.id}
                href={`/projects/${p.id}`}
                className="group flex items-center justify-between rounded-lg px-2 py-1.5 transition-colors hover:bg-surface2"
              >
                <div className="min-w-0">
                  <span className="text-sm text-text-main group-hover:text-accent">{p.name}</span>
                  {p.company?.name && <span className="ml-2 text-xs text-text-mute">{p.company.name}</span>}
                </div>
                {p.budget != null && p.budget > 0 && (
                  <span className="shrink-0 text-xs text-text-dim">{formatBudget(p.budget)}</span>
                )}
              </a>
            ))}
          </div>
        </div>
      )}
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
    <div className="rounded-lg bg-surface p-4 elevation-hover">
      <h3 className="mb-4 text-xs font-semibold text-text-dim">Звонки за 14 дней</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--text-mute)' }} interval={1} axisLine={false} tickLine={false} />
          <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--text-mute)' }} width={24} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              boxShadow: 'var(--shadow-md)',
              fontSize: 11,
            }}
            labelStyle={{ color: 'var(--text)' }}
            itemStyle={{ color: 'var(--text-dim)' }}
            cursor={{ fill: 'var(--surface2)', opacity: 0.5 }}
          />
          <Bar dataKey="done" stackId="calls" fill="var(--green)" name="Выполнено" radius={[0, 0, 0, 0]} />
          <Bar dataKey="pending" stackId="calls" fill="var(--blue)" name="Запланир." radius={[0, 0, 0, 0]} />
          <Bar dataKey="cancelled" stackId="calls" fill="var(--red)" name="Отменено" radius={[2, 2, 0, 0]} />
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
    <div className="rounded-xl bg-surface p-4 elevation-hover">
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
                  <span className="hidden shrink-0 text-xs text-text-dim sm:inline">
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
  entity_deleted: Trash2,
};

const EVENT_COLOR: Record<string, string> = {
  stage_change: 'text-blue',
  call_logged: 'text-green',
  task_created: 'text-purple',
  task_completed: 'text-purple',
  meeting_scheduled: 'text-yellow',
  project_updated: 'text-text-dim',
  comment_added: 'text-text-mute',
  entity_deleted: 'text-red',
};

const ENTITY_TYPE_LABEL: Record<string, string> = {
  projects: 'проект',
  tasks: 'задача',
  contacts: 'контакт',
  companies: 'компания',
  calls: 'звонок',
  meetings: 'встреча',
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
    case 'entity_deleted': {
      const entityType = ENTITY_TYPE_LABEL[p.entity_type as string] ?? String(p.entity_type);
      const entityName = p.entity_name as string;
      return `Удалён ${entityType}: ${entityName}`;
    }
    default:
      return entry.event_type;
  }
}

const ACTIVITY_TABS = [
  { key: 'all', label: 'Все', filter: () => true },
  { key: 'stage', label: 'Стадии', filter: (a: ActivityLog) => a.event_type === 'stage_change' },
  { key: 'call', label: 'Звонки', filter: (a: ActivityLog) => a.event_type === 'call_logged' },
  { key: 'task', label: 'Задачи', filter: (a: ActivityLog) => a.event_type === 'task_created' || a.event_type === 'task_completed' },
  { key: 'delete', label: 'Удаления', filter: (a: ActivityLog) => a.event_type === 'entity_deleted' },
] as const;

function RecentActivityList() {
  const { data: entries, isLoading } = useRecentActivity(20);
  const [activeTab, setActiveTab] = useState('all');

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
    <div className="rounded-xl bg-surface p-4 elevation-hover">
      <div className="mb-3 flex items-center gap-2">
        <Clock size={14} className="text-text-dim" />
        <span className="text-xs font-semibold text-text-dim">Последние действия</span>
      </div>

      {/* Tabs */}
      <div className="mb-3 flex gap-1 border-b border-border">
        {ACTIVITY_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-2.5 py-1.5 text-[11px] transition-colors -mb-px ${
              activeTab === tab.key
                ? 'text-accent border-b-2 border-accent font-medium'
                : 'text-text-dim hover:text-text-main'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {(!entries || entries.length === 0) ? (
        <div className="flex flex-col items-center py-6 text-center">
          <Clock size={20} className="mb-2 text-text-mute" />
          <p className="text-xs text-text-dim">Нет активности</p>
          <a href="/projects" className="mt-2 text-xs text-accent hover:underline">Создать проект →</a>
        </div>
      ) : (
        <div className="max-h-[480px] space-y-1 overflow-y-auto scroll-smooth thin-scrollbar">
          {entries.filter(ACTIVITY_TABS.find((t) => t.key === activeTab)?.filter ?? (() => true)).map((entry) => {
            const Icon = EVENT_ICON[entry.event_type] ?? MessageSquare;
            const color = EVENT_COLOR[entry.event_type] ?? 'text-text-mute';
            const projectName = (entry as any).project?.name;
            const projectId = entry.project_id;

            const Tag = projectId ? 'a' : 'div';

            return (
              <Tag
                key={entry.id}
                {...(projectId ? { href: `/projects/${projectId}` } : {})}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5
                           transition-colors hover:bg-surface-hover"
              >
                <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-bg ${color}`}>
                  <Icon size={10} />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-text-dim">
                    {describeEvent(entry)}
                  </span>
                  {projectName && (
                    <span className="text-[10px] text-text-main font-medium">{projectName}</span>
                  )}
                </div>
                <span className="shrink-0 text-xs text-text-mute">
                  {relativeTime(entry.created_at)}
                </span>
              </Tag>
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
        <div className="animate-appear stagger-6"><PipelineFunnelChart /></div>
        <div className="animate-appear stagger-7"><CallsRecentChart /></div>
      </div>

      {/* Row 3: Lists — no animate-appear (re-renders on realtime updates) */}
      <div className="grid gap-4 md:grid-cols-2">
        <UpcomingDeadlines />
        <RecentActivityList />
      </div>
    </div>
  );
}
