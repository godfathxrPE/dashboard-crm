'use client';

import { useMemo, useState } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis,
} from 'recharts';
import { useTasks } from '@/lib/hooks/use-tasks';
import { useProjects } from '@/lib/hooks/use-projects';
import { usePipelineStages } from '@/lib/hooks/use-pipelines';
import { useThemeStore } from '@/lib/stores/theme-store';
import { cn } from '@/lib/utils/cn';

/* ── Цвета ── */
const LANE_LABELS: Record<string, string> = { now: 'Сейчас', next: 'Следующие', wait: 'Отложено', done: 'Выполнено' };
const LANE_COLORS: Record<string, string> = { now: 'var(--accent)', next: 'var(--blue)', wait: 'var(--yellow)', done: 'var(--green)' };
const SCANDI_MONO_LANE: Record<string, string> = { done: '#3E6B58', wait: '#6D5D7B', now: '#5B5EA6', next: '#3D6B7E' };
const VIVID_LANE: Record<string, string> = { now: '#5B5EA6', next: '#3D6B7E', wait: '#6D5D7B', done: '#3E6B58' };
const PHASE_COLORS: Record<string, string> = { attract: 'var(--blue)', develop: 'var(--accent)', negotiate: 'var(--yellow)', close: 'var(--green)' };

/* phase_group (источник истины — pipeline_stages) → label + ключ цвета (legacy phase-палитра выше).
   Аналитика группирует по stage_id → phase_group, без legacy enum `stage`. */
const PHASE_GROUP_ORDER = ['attraction', 'working', 'approval', 'closing'] as const;
const PHASE_GROUP_LABEL: Record<string, string> = {
  attraction: 'Привлечение', working: 'Проработка', approval: 'Согласование', closing: 'Закрытие',
};
const PHASE_GROUP_COLOR_KEY: Record<string, string> = {
  attraction: 'attract', working: 'develop', approval: 'negotiate', closing: 'close',
};
const VIVID_PHASE: Record<string, string> = { attract: '#3D6B7E', develop: '#4A5E8A', negotiate: '#5B5EA6', close: '#6D5D7B' };

/* Aura: сочные градиенты [насыщенный, светлее] per lane/phase для SVG defs */
const AURA_DONUT: Record<string, [string, string]> = {
  now: ['#C77A1E', '#E0A03A'], next: ['#3B7FD4', '#5DA8E8'], wait: ['#B0810F', '#D4A82A'], done: ['#2F8F5B', '#4FB87E'],
};
const AURA_PHASE: Record<string, [string, string]> = {
  attract: ['#3B7FD4', '#5DA8E8'], develop: ['#C77A1E', '#E0A03A'], negotiate: ['#B0810F', '#D4A82A'], close: ['#2F8F5B', '#4FB87E'],
};

const TT: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-md)', fontSize: 11 };
const TT_L: React.CSSProperties = { color: 'var(--text)' };
const TT_I: React.CSSProperties = { color: 'var(--text-dim)' };
const TT_C = { fill: 'var(--surface2)', opacity: 0.5 };

/* ══ SVG Donut: Задачи по статусу ══ */
export function TasksDistribution() {
  const { data: tasks } = useTasks();
  const theme = useThemeStore((s) => s.theme);
  const isScandi = theme === 't-scandi';
  const isAura = theme === 't-aura';
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
    <div
      className={cn('p-4', !isScandi && 'rounded-lg bg-surface elevation-hover')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <h3 className="mb-3 text-xs font-semibold text-text-dim">Задачи по статусу</h3>
      <div className="h-48 flex items-center justify-center">
        <svg viewBox="0 0 200 200" width="160" height="160" style={isAura ? { overflow: 'visible' } : undefined}>
          {isAura && (
            <defs>
              {/* Градиенты на сегмент: насыщенный → чуть светлее по дуге */}
              {Object.entries(AURA_DONUT).map(([lane, [c1, c2]]) => (
                <linearGradient key={lane} id={`donut-${lane}`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={c1} />
                  <stop offset="100%" stopColor={c2} />
                </linearGradient>
              ))}
              {/* Мягкий glow под кольцом */}
              <filter id="donut-glow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="3" stdDeviation="5" floodColor="#1a1a2e" floodOpacity="0.16" />
              </filter>
            </defs>
          )}
          <g filter={isAura ? 'url(#donut-glow)' : undefined}>
            {arcs.map((arc) => {
              const auraFill = `url(#donut-${arc.lane})`;
              const fill = isAura
                ? auraFill
                : active ? (VIVID_LANE[arc.lane] ?? '#888') : isScandi ? (SCANDI_MONO_LANE[arc.lane] ?? '#888') : (LANE_COLORS[arc.lane] ?? '#888');
              return (
                <path
                  key={arc.lane}
                  d={arcPath(arc.startAngle - 90, arc.endAngle - 90, outer, inner)}
                  fill={fill}
                  style={{
                    transition: 'fill 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                    ...(isAura ? { animation: 'donutIn 0.7s cubic-bezier(0.16,1,0.3,1)', opacity: 1, transformOrigin: '100px 100px' } : {}),
                  }}
                />
              );
            })}
          </g>
          {/* Центр: общая цифра (только Aura) */}
          {isAura && total > 0 && (
            <text x="100" y="100" textAnchor="middle" dominantBaseline="central"
              style={{ fontSize: 30, fontWeight: 700, fill: 'var(--text)', fontFamily: 'var(--font-unbounded, sans-serif)' }}>
              {total}
            </text>
          )}
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
  const { data: pipelineStages } = usePipelineStages();
  const theme = useThemeStore((s) => s.theme);
  const isScandi = theme === 't-scandi';
  const isAura = theme === 't-aura';
  const [hovered, setHovered] = useState(false);

  const chartData = useMemo(() => {
    if (!projects) return [];
    const byId = new Map((pipelineStages ?? []).map((s) => [s.id, s] as const));
    // Источник истины — stage_id → pipeline_stages.phase_group; legacy `stage` не используется.
    const active = projects.filter((p) => {
      const st = p.stage_id ? byId.get(p.stage_id) : undefined;
      return st && !st.is_won && !st.is_lost;
    });
    return PHASE_GROUP_ORDER.map((pg) => ({
      phase: PHASE_GROUP_COLOR_KEY[pg],
      name: PHASE_GROUP_LABEL[pg],
      count: active.filter((p) => (p.stage_id ? byId.get(p.stage_id)?.phase_group : undefined) === pg).length,
    }));
  }, [projects, pipelineStages]);

  const active = isScandi && hovered;

  return (
    <div
      className={cn('p-4 min-w-0 overflow-hidden', !isScandi && 'rounded-lg bg-surface elevation-hover')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <h3 className="mb-3 text-xs font-semibold text-text-dim">Проекты по фазам</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <BarChart data={chartData} layout="vertical" barSize={18}>
            {isAura && (
              <defs>
                {Object.entries(AURA_PHASE).map(([phase, [c1, c2]]) => (
                  <linearGradient key={phase} id={`phase-${phase}`} x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={c1} />
                    <stop offset="100%" stopColor={c2} />
                  </linearGradient>
                ))}
              </defs>
            )}
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--text-mute)' }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10, fill: 'var(--text-dim)' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={TT} labelStyle={TT_L} itemStyle={TT_I} cursor={TT_C} />
            <Bar dataKey="count" name="Проектов" radius={[0, 6, 6, 0]} isAnimationActive={false} animationDuration={700} animationEasing="ease-out"
              activeBar={isScandi ? { fill: '#333', opacity: 1 } : undefined}>
              {chartData.map((entry) => (
                <Cell
                  key={`bar-${entry.phase}-${active}`}
                  fill={isAura ? `url(#phase-${entry.phase})` : active ? (VIVID_PHASE[entry.phase] ?? '#888') : (PHASE_COLORS[entry.phase] ?? '#888')}
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
