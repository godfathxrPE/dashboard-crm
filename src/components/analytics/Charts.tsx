'use client';

import { useMemo } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis,
} from 'recharts';
import { useTasks } from '@/lib/hooks/use-tasks';
import { useProjects } from '@/lib/hooks/use-projects';
import { PHASE_CONFIG, phases, getPhaseForStage, formatBudget } from '@/lib/validators/project';

const LANE_COLORS: Record<string, string> = {
  now: 'var(--accent)',
  next: 'var(--blue)',
  wait: 'var(--yellow)',
  done: 'var(--green)',
};

const LANE_LABELS: Record<string, string> = {
  now: 'Сейчас',
  next: 'Следующие',
  wait: 'Отложено',
  done: 'Выполнено',
};

const TOOLTIP_STYLE = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  boxShadow: 'var(--shadow-md)',
  fontSize: 11,
};

export function TasksDistribution() {
  const { data: tasks } = useTasks();

  const chartData = useMemo(() => {
    if (!tasks) return [];
    const counts: Record<string, number> = { now: 0, next: 0, wait: 0, done: 0 };
    for (const t of tasks) counts[t.lane] = (counts[t.lane] ?? 0) + 1;
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([lane, count]) => ({
        name: LANE_LABELS[lane] ?? lane,
        value: count,
        color: LANE_COLORS[lane] ?? '#888',
      }));
  }, [tasks]);

  return (
    <div className="rounded-lg bg-surface p-4 shadow-card transition-shadow duration-fast hover:shadow-card-hover">
      <h3 className="mb-3 text-xs font-semibold text-text-dim">Задачи по статусу</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chartData} cx="50%" cy="50%" innerRadius={40} outerRadius={70}
              paddingAngle={3} dataKey="value" nameKey="name">
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ═══ Pipeline Chart ═══

const PHASE_COLORS: Record<string, string> = {
  attract: 'var(--blue)',
  develop: 'var(--accent)',
  negotiate: 'var(--yellow)',
  close: 'var(--green)',
};

export function PipelineChart() {
  const { data: projects } = useProjects();

  const chartData = useMemo(() => {
    if (!projects) return [];
    const active = projects.filter((p) => p.stage !== 'won' && p.stage !== 'lost');

    return phases.map((phase) => {
      const items = active.filter((p) => getPhaseForStage(p.stage) === phase);
      const budget = items.reduce((sum, p) => sum + (p.budget ?? 0), 0) / 100;
      return {
        name: PHASE_CONFIG[phase].label,
        count: items.length,
        budget: Math.round(budget),
        fill: PHASE_COLORS[phase],
      };
    });
  }, [projects]);

  return (
    <div className="rounded-lg bg-surface p-4 shadow-card transition-shadow duration-fast hover:shadow-card-hover">
      <h3 className="mb-3 text-xs font-semibold text-text-dim">Проекты по фазам</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" barSize={16}>
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--text-mute)' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="count" name="Проектов" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
