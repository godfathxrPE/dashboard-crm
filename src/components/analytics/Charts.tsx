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
const SCANDI_MONO_LANE: Record<string, string> = { done: '#3E6B58', wait: '#6D5D7B', now: '#5B5EA6', next: '#3D6B7E' };
const VIVID_LANE: Record<string, string> = { now: '#5B5EA6', next: '#3D6B7E', wait: '#6D5D7B', done: '#3E6B58' };
const PHASE_COLORS: Record<string, string> = { attract: 'var(--blue)', develop: 'var(--accent)', negotiate: 'var(--yellow)', close: 'var(--green)' };
const VIVID_PHASE: Record<string, string> = { attract: '#3D6B7E', develop: '#4A5E8A', negotiate: '#5B5EA6', close: '#6D5D7B' };

const TT: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-md)', fontSize: 11 };
const TT_L: React.CSSProperties = { color: 'var(--text)' };
const TT_I: React.CSSProperties = { color: 'var(--text-dim)' };
const TT_C = { fill: 'var(--surface2)', opacity: 0.5 };

/* ══ SVG Donut: Задачи по статусу ══ */
export function TasksDistribution() {
  const { data: tasks } = useTasks();
  const isScandi = useThemeStore((s) => s.theme) === 't-scandi';
  const [hovered, setHovered] = useState(false);

  const chartData = useMemo(() => {
    if (!tasks) return [];
    const counts: Record<string, number> = { now: 0, next: 0, wait: 0, done: 0 };
    for (const t of tasks) counts[t.lane] = (counts[t.lane] ?? 0) + 1;
    return (['done', 'wait', 'now', 'next'] as const)
      .filter((lane) => counts[lane] > 0)
      .map((lane) => ({ lane, name: LANE_LABELS[lane], value: counts[lane] }));
  }, [tasks]);

  const active = isScandi && hovered;
  const total = chartData.reduce((s, d) => s + d.value, 0);

  const arcs = useMemo(() => {
    let cumulative = 0;
    return chartData.map((d) => {
      const start = cumulative;
      const fraction = d.value / (total || 1);
      cumulative += fraction;
      return { ...d, startAngle: start * 360, endAngle: (start + fraction) * 360 };
    });
  }, [chartData, total]);

  const cx = 100, cy = 100, outer = 70, inner = 40, gap = 1.5;

  function arcPath(startDeg: number, endDeg: number, r: number, ir: number) {
    const pad = gap / r;
    const s = ((startDeg + pad * (180 / Math.PI)) * Math.PI) / 180;
    const e = ((endDeg - pad * (180 / Math.PI)) * Math.PI) / 180;
    if (e - s <= 0) return '';
    const large = e - s > Math.PI ? 1 : 0;
    const x1 = cx + r * Math.cos(s), y1 = cy + r * Math.sin(s);
    const x2 = cx + r * Math.cos(e), y2 = cy + r * Math.sin(e);
    const x3 = cx + ir * Math.cos(e), y3 = cy + ir * Math.sin(e);
    const x4 = cx + ir * Math.cos(s), y4 = cy + ir * Math.sin(s);
    return `M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} L${x3},${y3} A${ir},${ir} 0 ${large} 0 ${x4},${y4} Z`;
  }

  return (
    <div className="p-4" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <h3 className="mb-3 text-xs font-semibold text-text-dim">Задачи по статусу</h3>
      <div className="h-48 flex items-center justify-center">
        <svg viewBox="0 0 200 200" width="160" height="160">
          {arcs.map((arc) => (
            <path
              key={arc.lane}
              d={arcPath(arc.startAngle - 90, arc.endAngle - 90, outer, inner)}
              fill={active ? (VIVID_LANE[arc.lane] ?? '#888') : isScandi ? (SCANDI_MONO_LANE[arc.lane] ?? '#888') : (LANE_COLORS[arc.lane] ?? '#888')}
              style={{ transition: 'fill 0.5s cubic-bezier(0.16, 1, 0.3, 1)' }}
            />
          ))}
        </svg>
      </div>
      <div className="flex justify-center gap-4 mt-2">
        {chartData.map((d, i) => {
          const color = active ? (VIVID_LANE[d.lane] ?? '#888') : isScandi ? (SCANDI_MONO_LANE[d.lane] ?? '#888') : (LANE_COLORS[d.lane] ?? '#888');
          const shapes = ['filled-sq', 'empty-sq', 'filled-circle', 'half-circle'] as const;
          const shape = isScandi ? shapes[i % shapes.length] : 'filled-sq';
          return (
            <div key={d.lane} className="flex items-center gap-1.5 text-[10px]">
              <span className="w-2.5 h-2.5 inline-block shrink-0" style={{
                background: shape === 'half-circle'
                  ? `linear-gradient(90deg, ${color} 50%, transparent 50%)`
                  : (shape === 'filled-sq' || shape === 'filled-circle') ? color : 'transparent',
                border: shape === 'empty-sq' || shape === 'half-circle' ? `1.5px solid ${color}` : 'none',
                borderRadius: shape.includes('circle') ? '50%' : '1px',
                transition: 'background 0.5s ease, border-color 0.5s ease',
              }} />
              <span style={{ color: 'var(--text-dim)' }}>{d.name}</span>
            </div>
          );
        })}
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
    const active = projects.filter((p) => p.stage && p.stage !== 'won' && p.stage !== 'lost');
    return phases.map((phase) => {
      const items = active.filter((p) => p.stage && getPhaseForStage(p.stage) === phase);
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
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <BarChart data={chartData} layout="vertical" barSize={16}>
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--text-mute)' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TT} labelStyle={TT_L} itemStyle={TT_I} cursor={TT_C} />
            <Bar dataKey="count" name="Проектов" radius={[0, 4, 4, 0]} isAnimationActive={false}
              activeBar={isScandi ? { fill: '#333', opacity: 1 } : undefined}>
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
