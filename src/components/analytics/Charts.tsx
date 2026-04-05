'use client';

import { useMemo, useState } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis,
} from 'recharts';
import { useTasks } from '@/lib/hooks/use-tasks';
import { useProjects } from '@/lib/hooks/use-projects';
import { useThemeStore } from '@/lib/stores/theme-store';
import { PHASE_CONFIG, phases, getPhaseForStage } from '@/lib/validators/project';

/* ── Цвета ── */
const LANE_LABELS: Record<string, string> = { now: 'Сейчас', next: 'Следующие', wait: 'Отложено', done: 'Выполнено' };
const LANE_COLORS: Record<string, string> = { now: 'var(--accent)', next: 'var(--blue)', wait: 'var(--yellow)', done: 'var(--green)' };
const VIVID_LANE: Record<string, string> = { now: '#000000', next: '#d500f9', wait: '#2979ff', done: '#00c853' };
const PHASE_COLORS: Record<string, string> = { attract: 'var(--blue)', develop: 'var(--accent)', negotiate: 'var(--yellow)', close: 'var(--green)' };
const VIVID_PHASE: Record<string, string> = { attract: '#00b874', develop: '#c44cff', negotiate: '#e09030', close: '#0652DD' };

const TT: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-md)', fontSize: 11 };
const TT_L: React.CSSProperties = { color: 'var(--text)' };
const TT_I: React.CSSProperties = { color: 'var(--text-dim)' };
const TT_C = { fill: 'var(--surface2)', opacity: 0.5 };

/* ══ Donut: Задачи по статусу ══ */
export function TasksDistribution() {
  const { data: tasks } = useTasks();
  const isScandi = useThemeStore((s) => s.theme) === 't-scandi';
  const [hovered, setHovered] = useState(false);

  /* Готовим данные с сохранением lane-ключа */
  const chartData = useMemo(() => {
    if (!tasks) return [];
    const counts: Record<string, number> = { now: 0, next: 0, wait: 0, done: 0 };
    for (const t of tasks) counts[t.lane] = (counts[t.lane] ?? 0) + 1;
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([lane, count]) => ({ lane, name: LANE_LABELS[lane] ?? lane, value: count }));
  }, [tasks]);

  /* Определяем fill для каждого сегмента */
  const active = isScandi && hovered;

  return (
    <div
      className="p-4"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <h3 className="mb-3 text-xs font-semibold text-text-dim">Задачи по статусу</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              key={`pie-${active}`}
              data={chartData}
              cx="50%" cy="50%"
              innerRadius={40} outerRadius={70}
              paddingAngle={3}
              dataKey="value" nameKey="name"
              stroke="var(--bg)" strokeWidth={1}
              isAnimationActive={false}
            >
              {chartData.map((entry, i) => (
                <Cell
                  key={`pie-${entry.lane}-${active}`}
                  fill={active ? (VIVID_LANE[entry.lane] ?? '#888') : (LANE_COLORS[entry.lane] ?? '#888')}
                  fillOpacity={1}
                  style={{ transition: 'fill 0.5s ease' }}
                />
              ))}
            </Pie>
            <Tooltip contentStyle={TT} labelStyle={TT_L} itemStyle={TT_I} cursor={TT_C} />
            <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ══ Pipeline: Проекты по фазам ══ */
export function PipelineChart() {
  const { data: projects } = useProjects();
  const isScandi = useThemeStore((s) => s.theme) === 't-scandi';
  const [hovered, setHovered] = useState(false);

  const chartData = useMemo(() => {
    if (!projects) return [];
    const active = projects.filter((p) => p.stage !== 'won' && p.stage !== 'lost');
    return phases.map((phase) => {
      const items = active.filter((p) => getPhaseForStage(p.stage) === phase);
      return { phase, name: PHASE_CONFIG[phase].label, count: items.length };
    });
  }, [projects]);

  const active = isScandi && hovered;

  return (
    <div
      className="p-4 min-w-0 overflow-hidden"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <h3 className="mb-3 text-xs font-semibold text-text-dim">Проекты по фазам</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" barSize={16}>
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--text-mute)' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TT} labelStyle={TT_L} itemStyle={TT_I} cursor={TT_C} />
            <Bar dataKey="count" name="Проектов" radius={[0, 4, 4, 0]} isAnimationActive={false}>
              {chartData.map((entry) => (
                <Cell
                  key={`bar-${entry.phase}-${active}`}
                  fill={active ? (VIVID_PHASE[entry.phase] ?? '#888') : (PHASE_COLORS[entry.phase] ?? '#888')}
                  style={{ transition: 'fill 0.5s ease' }}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
