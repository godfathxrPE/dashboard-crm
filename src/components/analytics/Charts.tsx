'use client';

import { useMemo, useState } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis,
} from 'recharts';
import { useTasks } from '@/lib/hooks/use-tasks';
import { useProjects } from '@/lib/hooks/use-projects';
import { useThemeStore } from '@/lib/stores/theme-store';
import { PHASE_CONFIG, phases, getPhaseForStage, formatBudget } from '@/lib/validators/project';

const VIVID_LANE: Record<string, string> = { now: '#000000', next: '#d500f9', wait: '#2979ff', done: '#00c853' };
const VIVID_PHASE: Record<string, string> = { attract: '#00b874', develop: '#c44cff', negotiate: '#e09030', close: '#0652DD' };

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

const TOOLTIP_STYLE: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  boxShadow: 'var(--shadow-md)',
  fontSize: 11,
};
const TOOLTIP_LABEL: React.CSSProperties = { color: 'var(--text)' };
const TOOLTIP_ITEM: React.CSSProperties = { color: 'var(--text-dim)' };
const TOOLTIP_CURSOR = { fill: 'var(--surface2)', opacity: 0.5 };

export function TasksDistribution() {
  const { data: tasks } = useTasks();
  const isScandi = useThemeStore((s) => s.theme) === 't-scandi';
  const [hovered, setHovered] = useState(false);

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
    <div
      className="rounded-lg bg-surface p-4 elevation-hover"
      onMouseEnter={isScandi ? () => setHovered(true) : undefined}
      onMouseLeave={isScandi ? () => setHovered(false) : undefined}
    >
      <h3 className="mb-3 text-xs font-semibold text-text-dim">Задачи по статусу</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={chartData} cx="50%" cy="50%" innerRadius={40} outerRadius={70}
              paddingAngle={3} dataKey="value" nameKey="name" stroke="var(--bg)" strokeWidth={1}>
              {chartData.map((entry, i) => {
                const lane = Object.entries(LANE_LABELS).find(([, v]) => v === entry.name)?.[0] ?? '';
                return <Cell key={i} fill={isScandi && hovered ? (VIVID_LANE[lane] ?? entry.color) : entry.color} fillOpacity={1} />;
              })}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM} cursor={TOOLTIP_CURSOR} />
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
  const isScandi2 = useThemeStore((s) => s.theme) === 't-scandi';
  const [hovered2, setHovered2] = useState(false);

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
    <div
      className="rounded-lg bg-surface p-4 elevation-hover min-w-0 overflow-hidden"
      onMouseEnter={isScandi2 ? () => setHovered2(true) : undefined}
      onMouseLeave={isScandi2 ? () => setHovered2(false) : undefined}
    >
      <h3 className="mb-3 text-xs font-semibold text-text-dim">Проекты по фазам</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" barSize={16}>
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--text-mute)' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={TOOLTIP_LABEL} itemStyle={TOOLTIP_ITEM} cursor={TOOLTIP_CURSOR} />
            <Bar dataKey="count" name="Проектов" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, i) => {
                const phase = phases[i];
                return <Cell key={i} fill={isScandi2 && hovered2 ? (VIVID_PHASE[phase] ?? entry.fill) : entry.fill} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
