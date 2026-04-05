'use client';

import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useCalls } from '@/lib/hooks/use-calls';
import { useThemeStore } from '@/lib/stores/theme-store';

export function CallsChart() {
  const { data: calls } = useCalls();
  const isScandi = useThemeStore((s) => s.theme) === 't-scandi';
  const [hovered, setHovered] = useState(false);

  const chartData = useMemo(() => {
    if (!calls) return [];
    const now = new Date();
    const weeks: { label: string; done: number; pending: number; cancelled: number }[] = [];

    for (let w = 7; w >= 0; w--) {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay() + 1 - w * 7);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);

      const label = weekStart.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
      let done = 0, pending = 0, cancelled = 0;

      for (const c of calls) {
        const d = new Date(c.date);
        if (d >= weekStart && d < weekEnd) {
          if (c.status === 'done') done++;
          else if (c.status === 'pending') pending++;
          else cancelled++;
        }
      }
      weeks.push({ label, done, pending, cancelled });
    }
    return weeks;
  }, [calls]);

  return (
    <div
      className="rounded-lg bg-surface p-4 elevation-hover"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <h3 className="mb-3 text-xs font-semibold text-text-dim">Звонки по неделям</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barGap={2}>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-mute)' }} axisLine={false} tickLine={false} />
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
            <Bar dataKey="done" name="Выполнено" fill={isScandi && hovered ? '#0652DD' : 'var(--green)'} radius={[3, 3, 0, 0]} />
            <Bar dataKey="pending" name="Запланировано" fill={isScandi && hovered ? '#36d1dc' : 'var(--blue)'} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
