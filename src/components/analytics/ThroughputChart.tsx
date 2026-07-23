'use client';

import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts';
import type { ThroughputPoint } from '@/lib/hooks/use-task-analytics';

/* Токен-стили тултипа — зеркало Charts.tsx (одна визуальная система на /analytics). */
const TT: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)',
  borderRadius: 'var(--radius)', boxShadow: 'var(--elevation-2)', fontSize: 11,
};
const TT_L: React.CSSProperties = { color: 'var(--text)' };
const TT_I: React.CSSProperties = { color: 'var(--text-dim)' };

/** "YYYY-MM-DD" → "DD.MM" (ось X: начало недели). */
function weekLabel(iso: string): string {
  const [, m, d] = iso.split('-');
  return d && m ? `${d}.${m}` : iso;
}

export function ThroughputChart({ data }: { data: ThroughputPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} vertical={false} />
        <XAxis
          dataKey="week_start" tickFormatter={weekLabel}
          tick={{ fontSize: 10, fill: 'var(--text-mute)' }} axisLine={false} tickLine={false} />
        <YAxis
          allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--text-mute)' }}
          axisLine={false} tickLine={false} width={28} />
        <Tooltip
          contentStyle={TT} labelStyle={TT_L} itemStyle={TT_I}
          labelFormatter={(v) => `Неделя ${weekLabel(String(v))}`} />
        <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-dim)' }} iconType="plainline" />
        <Line
          type="monotone" dataKey="completed" name="Завершено"
          stroke="var(--green)" strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line
          type="monotone" dataKey="created" name="Создано"
          stroke="var(--accent)" strokeWidth={2} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
