'use client';

// W4a: два чарт-блока «Обзора» вынесены из DashboardHome, чтобы recharts
// грузился отдельным dynamic-чанком (ssr:false в DashboardHome), а не в
// первом чанке /overview. Логика 1:1, без изменений.
import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { useThemeStore } from '@/lib/stores/theme-store';
import { useProjects } from '@/lib/hooks/use-projects';
import { usePipelineStages } from '@/lib/hooks/use-pipelines';
import { useCalls } from '@/lib/hooks/use-calls';
import { projectHref } from '@/lib/utils/project-href';
import { formatBudget } from '@/lib/validators/project';
import { localDateKey } from '@/lib/utils/date-helpers';
import { FujiWatermark } from './FujiWatermark';

function SkeletonChart() {
  return (
    <div className="animate-pulse rounded-xl border border-border/50 bg-surface p-4">
      <div className="mb-4 h-3 w-32 rounded bg-border/50" />
      <div className="h-48 rounded bg-border/30" />
    </div>
  );
}

// Путь B: фаза бара из phase_group стадии (stage_id → pipeline_stages) → цвет-ключ
// (совпадает с легаси-фазами fills). Не читаем legacy `stage`.
const PHASE_GROUP_TO_PHASE: Record<string, string> = {
  attraction: 'attract',
  working: 'develop',
  approval: 'negotiate',
  closing: 'close',
};

// ═══════════════════════════════════════════════════════
// Pipeline Funnel Chart (horizontal bars)
// ═══════════════════════════════════════════════════════

export function PipelineFunnelChart() {
  const { data: projects, isLoading } = useProjects();
  const { data: allStages } = usePipelineStages();
  const themeVal = useThemeStore((s) => s.theme);
  const isFuji = themeVal === 't-fuji';
  // drillStage — stage_id (истина стадии), не legacy enum
  const [drillStage, setDrillStage] = useState<string | null>(null);

  const chartData = useMemo(() => {
    if (!projects || !allStages) return [];
    const active = projects.filter((p) => p.type === 'client' && p.status !== 'won' && p.status !== 'lost');

    // Считаем активные сделки по stage_id (истина pipeline_stages), не legacy `stage`.
    const countByStage = new Map<string, number>();
    for (const p of active) {
      if (p.stage_id) countByStage.set(p.stage_id, (countByStage.get(p.stage_id) ?? 0) + 1);
    }

    // Один бар на стадию с активными сделками, сорт по order_index (прогресс воронки).
    return allStages
      .filter((s) => !s.is_won && !s.is_lost && countByStage.has(s.id))
      .sort((a, b) => a.order_index - b.order_index || a.name.localeCompare(b.name))
      .map((s) => ({
        stage: s.id,
        name: s.name,
        count: countByStage.get(s.id) ?? 0,
        phase: PHASE_GROUP_TO_PHASE[s.phase_group ?? ''] ?? 'attract',
      }));
  }, [projects, allStages]);

  const drillProjects = useMemo(() => {
    if (!drillStage || !projects) return [];
    return projects.filter((p) => p.stage_id === drillStage);
  }, [drillStage, projects]);

  const drillStageName = drillStage
    ? allStages?.find((s) => s.id === drillStage)?.name ?? '—'
    : '—';

  if (isLoading) return <SkeletonChart />;

  return (
    <div className="relative overflow-hidden p-4 rounded-lg bg-surface elevation-hover">
      {isFuji ? <FujiWatermark text="ВОРОНКА" /> : (
        <h3 className="mb-4 text-xs font-semibold text-text-dim">Воронка по стадиям</h3>
      )}
      <ResponsiveContainer width="100%" height={260} style={{ position: 'relative', zIndex: 1 }}>
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
            isAnimationActive={false}
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
              {drillStageName} — {drillProjects.length}
            </span>
            <button onClick={() => setDrillStage(null)} className="text-text-mute hover:text-text-main transition-colors">
              <X size={14} />
            </button>
          </div>
          <div className="space-y-1">
            {drillProjects.map((p) => (
              <a
                key={p.id}
                href={projectHref(p)}
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

export function CallsRecentChart() {
  const { data: calls, isLoading } = useCalls();
  const themeVal2 = useThemeStore((s) => s.theme);
  const isFuji = themeVal2 === 't-fuji';
  const dayCount = isFuji ? 7 : 14;
  const [callsHovered, setCallsHovered] = useState(false);

  const chartData = useMemo(() => {
    if (!calls) return [];
    const now = new Date();
    const days: { date: string; label: string; done: number; pending: number; cancelled: number }[] = [];

    for (let i = dayCount - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = localDateKey(d);
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
  }, [calls, dayCount]);

  if (isLoading) return <SkeletonChart />;

  const hasCalls = chartData.some((d) => d.done + d.pending + d.cancelled > 0);

  return (
    <div
      className="relative overflow-hidden p-4 rounded-lg bg-surface elevation-hover"
      onMouseEnter={() => setCallsHovered(true)}
      onMouseLeave={() => setCallsHovered(false)}
    >
      {isFuji ? <FujiWatermark text="ЗВОНКИ" color="rgba(43,80,120,0.05)" /> : (
        <h3 className="mb-4 text-xs font-semibold text-text-dim">Звонки за {dayCount} дней</h3>
      )}
      {!hasCalls ? (
        <div className="flex items-center justify-center text-xs text-text-mute" style={{ height: 260 }}>
          Нет звонков за период
        </div>
      ) : (
      <ResponsiveContainer width="100%" height={260} style={{ position: 'relative', zIndex: 1 }}>
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
          <Bar dataKey="done" stackId="calls" isAnimationActive={false} fill="var(--green)" name="Выполнено" radius={[0, 0, 0, 0]} />
          <Bar dataKey="pending" stackId="calls" isAnimationActive={false} fill="var(--blue)" name="Запланир." radius={[0, 0, 0, 0]} />
          <Bar dataKey="cancelled" stackId="calls" isAnimationActive={false} fill="var(--red)" name="Отменено" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      )}
    </div>
  );
}
