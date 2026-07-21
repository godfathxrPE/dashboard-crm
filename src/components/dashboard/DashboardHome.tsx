'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
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
} from 'lucide-react';
import { useThemeStore } from '@/lib/stores/theme-store';
import { useProjects } from '@/lib/hooks/use-projects';
import { projectHref } from '@/lib/utils/project-href';
import { useTasks } from '@/lib/hooks/use-tasks';
import { useCalls } from '@/lib/hooks/use-calls';
import { useRecentActivity } from '@/lib/hooks/use-activity-log';
import { useActorMap } from '@/lib/hooks/use-actor';
import { formatBudget } from '@/lib/validators/project';
import { describeEvent, relativeTime } from '@/lib/utils/activity-events';
import { AnimatedNumber } from '@/components/shared/AnimatedNumber';
import { PortfolioRiskWidget } from './PortfolioRiskWidget';
import { FujiWatermark } from './FujiWatermark';
import { staggerClass } from '@/lib/utils/stagger';
import type { ActivityLog } from '@/types/entities';
import { localDateKey } from '@/lib/utils/date-helpers';
import { dealMetrics } from '@/lib/selectors/deal-metrics';

// W4a: recharts-чарты — отдельным dynamic-чанком (см. OverviewCharts.tsx),
// первый чанк /overview без recharts. Fallback — тот же SkeletonChart.
const PipelineFunnelChart = dynamic(
  () => import('./OverviewCharts').then((m) => m.PipelineFunnelChart),
  { ssr: false, loading: () => <SkeletonChart /> },
);
const CallsRecentChart = dynamic(
  () => import('./OverviewCharts').then((m) => m.CallsRecentChart),
  { ssr: false, loading: () => <SkeletonChart /> },
);


// ═══════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════

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
  if (delta === 0) return null;
  const up = delta > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${up ? 'text-green' : 'text-red'}`}>
      <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
        <path strokeLinecap="round" strokeLinejoin="round" d={up ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
      </svg>
      {up ? '+' : ''}{delta} {label}
    </span>
  );
}

const FUJI_KPI_META: Record<string, { watermark: string; wmColor: string }> = {
  'Активные проекты':  { watermark: 'СДЕЛКИ',  wmColor: 'rgba(26,39,68,0.05)' },
  'Сумма pipeline':    { watermark: 'PIPELINE',  wmColor: 'rgba(196,170,120,0.07)' },
  'Задачи на сегодня': { watermark: 'ЗАДАЧИ',    wmColor: 'rgba(26,39,68,0.05)' },
  'Звонки за неделю':  { watermark: 'ЗВОНКИ',    wmColor: 'rgba(194,59,59,0.05)' },
  'Конверсия':         { watermark: 'КОНВЕРСИЯ',  wmColor: 'rgba(74,122,90,0.05)' },
};

const WASHI_KPI_META: Record<string, { kanji: string; color: string; short: string }> = {
  'Активные проекты':  { kanji: '案', color: '#2B5F8A', short: 'Сделки' },
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
    // W2: единый источник метрик (совпадает со «Сделками»). Обзор = все направления.
    const m = dealMetrics(projects ?? []);
    const active = m.active;

    const today = new Date();
    const todayStr = localDateKey(today);

    const urgentTasks = (tasks ?? []).filter((t) => {
      if (t.lane === 'done' || !t.deadline) return false;
      // deadline — timestamptz: локальная дата, не UTC-срез
      return localDateKey(new Date(t.deadline)) <= todayStr;
    });

    const weekAgo = new Date(today.getTime() - 7 * 86400000).toISOString();
    const twoWeeksAgo = new Date(today.getTime() - 14 * 86400000).toISOString();
    const weekCalls = (calls ?? []).filter((c) => c.date >= weekAgo);
    const prevWeekCalls = (calls ?? []).filter((c) => c.date >= twoWeeksAgo && c.date < weekAgo);

    const conversion = m.conversion;

    // Trends: new projects this week vs last week
    const newThisWeek = active.filter((p) => p.created_at >= weekAgo).length;
    const newLastWeek = active.filter((p) => p.created_at >= twoWeeksAgo && p.created_at < weekAgo).length;

    return {
      activeProjects: active.length,
      pipeline: m.pipelineSum,
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
      href: '/deals',
      trend: kpi.trends.projects,
    },
    {
      icon: Banknote,
      label: 'Сумма pipeline',
      num: kpi.pipeline,
      fmt: (n: number) => formatBudget(Math.round(n)),
      sub: 'все направления',
      iconBg: 'bg-accent-l text-accent',
      href: '/deals',
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
      sub: 'won / (won + lost) · за всё время',
      iconBg: 'bg-green-l text-green',
      href: '/analytics',
    },
  ];

  // Fuji: 4 cards (skip Конверсия)
  const visibleCards = isFuji ? cards.filter((c) => c.label !== 'Конверсия') : cards;
  const gridCols = isFuji ? 'grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5';

  const kpiGrid = (
    <div data-stats-grid className={`grid ${gridCols}`}>
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
                  fontSize: '30px',
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
              {/* Label — тихий, над значением (ватермарка = атмосфера, не имя метрики) */}
              <div className="relative z-[1] text-xs text-text-dim leading-tight">{c.label}</div>
              {/* Value */}
              <AnimatedNumber
                value={c.num}
                formatFn={c.fmt}
                className="mt-1 text-3xl font-bold leading-none block relative z-[1] text-text-main"
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

        // Washi: kanji watermark + цветная иконка + wm.short (ветка сохранена как есть)
        if (wm) {
          return (
            <a
              key={c.label}
              href={c.href}
              data-kpi
              className={`group relative overflow-hidden flex items-center gap-3 rounded-lg bg-surface px-4 py-4
                         elevation-hover border border-border ${staggerClass(i)}`}
            >
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
              <div className="flex h-10 w-10 shrink-0 items-center justify-center">
                <c.icon size={28} style={{ color: isEmpty ? undefined : wm.color }} className={isEmpty ? 'text-text-mute opacity-50' : ''} />
              </div>
              <div className="min-w-0">
                <AnimatedNumber
                  value={c.num}
                  formatFn={c.fmt}
                  className={`text-2xl font-extrabold leading-tight block
                              ${isEmpty ? 'text-text-mute opacity-50' : 'text-text-main'}`}
                />
                <div className="text-meta text-text-mute leading-tight mt-0.5" title={c.label}>
                  {wm.short}
                </div>
                {'trend' in c && c.trend != null && <TrendBadge delta={c.trend} />}
              </div>
            </a>
          );
        }

        // Default: вертикальная анатомия label → значение → дельта/контекст, без иконки-круга
        return (
          <a
            key={c.label}
            href={c.href}
            data-kpi
            className={`group relative overflow-hidden flex flex-col rounded-lg bg-surface px-4 py-3.5
                       elevation-hover border border-border ${staggerClass(i)}`}
          >
            {/* Label — тихий, сверху */}
            <div className="text-xs text-text-dim leading-tight" title={c.sub}>
              {c.label}
            </div>
            {/* Value — главный элемент */}
            <AnimatedNumber
              value={c.num}
              formatFn={c.fmt}
              className={`mt-1 text-2xl font-semibold leading-tight tabular-nums block
                          ${isEmpty ? 'text-text-mute' : 'text-text-main'}`}
            />
            {/* Delta / контекст */}
            {'trend' in c && c.trend != null
              ? <div className="mt-0.5"><TrendBadge delta={c.trend} /></div>
              : c.sub && <div className="mt-0.5 text-meta text-text-mute leading-tight truncate">{c.sub}</div>}
          </a>
        );
      })}
    </div>
  );

  return kpiGrid;
}


// ═══════════════════════════════════════════════════════
// Upcoming Deadlines
// ═══════════════════════════════════════════════════════

function UpcomingDeadlines() {
  const { data: projects, isLoading } = useProjects();
  const themeVal3 = useThemeStore((s) => s.theme);
  const isFuji = themeVal3 === 't-fuji';

  const items = useMemo(() => {
    if (!projects) return [];
    return projects
      .filter((p) => p.deadline && p.status !== 'won' && p.status !== 'lost')
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
    <div className="relative overflow-hidden p-4 rounded-xl bg-surface elevation-hover">
      {isFuji ? <FujiWatermark text="ДЕДЛАЙНЫ" color="rgba(196,170,120,0.06)" /> : (
        <div className="mb-3 flex items-center gap-2">
          <Calendar size={14} className="text-yellow" />
          <span className="text-xs font-semibold text-text-dim">Ближайшие дедлайны</span>
        </div>
      )}

      {items.length === 0 ? (
        <p className="py-4 text-center text-xs text-text-mute italic">Нет ближайших дедлайнов</p>
      ) : (
        <div className="space-y-1">
          {items.map((p) => {
            const urg = deadlineUrgency(p.deadline!);
            return (
              <a
                key={p.id}
                href={projectHref(p)}
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
                <span className={`shrink-0 text-xs font-medium ${urg.color}`}>
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
  stage_changed: ArrowRightLeft,
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
  stage_changed: 'text-blue',
  call_logged: 'text-green',
  task_created: 'text-purple',
  task_completed: 'text-purple',
  meeting_scheduled: 'text-yellow',
  project_updated: 'text-text-dim',
  comment_added: 'text-text-mute',
  entity_deleted: 'text-red',
};

const ACTIVITY_TABS = [
  { key: 'all', label: 'Все', filter: () => true },
  { key: 'stage', label: 'Стадии', filter: (a: ActivityLog) => a.event_type === 'stage_change' || a.event_type === 'stage_changed' },
  { key: 'call', label: 'Звонки', filter: (a: ActivityLog) => a.event_type === 'call_logged' },
  { key: 'task', label: 'Задачи', filter: (a: ActivityLog) => a.event_type === 'task_created' || a.event_type === 'task_completed' },
  { key: 'delete', label: 'Удаления', filter: (a: ActivityLog) => a.event_type === 'entity_deleted' },
] as const;

function RecentActivityList() {
  const { data: entries, isLoading } = useRecentActivity(20);
  const actorMap = useActorMap();
  const themeVal4 = useThemeStore((s) => s.theme);
  const isFuji = themeVal4 === 't-fuji';
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
    <div className="relative overflow-hidden p-4 rounded-xl bg-surface elevation-hover">
      {isFuji ? <FujiWatermark text="АКТИВНОСТЬ" /> : (
        <div className="mb-3 flex items-center gap-2">
          <Clock size={14} className="text-text-dim" />
          <span className="text-xs font-semibold text-text-dim">Последние действия</span>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-3 flex gap-1 border-b border-border">
        {ACTIVITY_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-2.5 py-1.5 text-meta transition-colors -mb-px ${
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
          <a href="/deals" className="mt-2 text-xs text-accent hover:underline">Создать сделку →</a>
        </div>
      ) : (
        <div data-timeline-scroll="compact" className="max-h-[480px] space-y-1 overflow-y-auto scroll-smooth thin-scrollbar">
          {entries.filter(ACTIVITY_TABS.find((t) => t.key === activeTab)?.filter ?? (() => true)).map((entry) => {
            const Icon = EVENT_ICON[entry.event_type] ?? MessageSquare;
            const color = EVENT_COLOR[entry.event_type] ?? 'text-text-mute';
            const projectName = (entry as any).project?.name;
            const projectId = entry.project_id;
            const actorName = entry.user_id ? actorMap.get(entry.user_id) : undefined;

            const Tag = projectId ? 'a' : 'div';

            return (
              <Tag
                key={entry.id}
                {...(projectId ? { href: `/deals/${projectId}` } : {})}
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
                    <span className="text-xs text-text-main font-medium">{projectName}</span>
                  )}
                </div>
                <span className="shrink-0 text-xs text-text-mute">
                  {relativeTime(entry.created_at)}
                  {actorName && <span className="ml-1">• {actorName}</span>}
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

      {/* Row 1.5: Portfolio risk (management-сигнал) */}
      <div className="animate-appear stagger-5">
        <PortfolioRiskWidget />
      </div>

      {/* Row 2: Charts */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="animate-appear stagger-6">
          <PipelineFunnelChart />
        </div>
        <div className="animate-appear stagger-7">
          <CallsRecentChart />
        </div>
      </div>

      {/* Row 3: Lists */}
      <div className="grid gap-4 md:grid-cols-2">
        <UpcomingDeadlines />
        <RecentActivityList />
      </div>
    </div>
  );
}
