'use client';

import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useCalls } from '@/lib/hooks/use-calls';

export function CallsChart() {
  const { data: calls } = useCalls();

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
    <div className="rounded-xl border border-border bg-surface p-4">
      <h3 className="mb-3 text-xs font-semibold text-text-dim">Звонки по неделям</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--color-text-mute)' }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: 'var(--color-text-mute)' }} width={24} />
            <Tooltip
              contentStyle={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 8,
                fontSize: 11,
              }}
            />
            <Bar dataKey="done" name="Выполнено" fill="var(--color-green, #22c55e)" radius={[3, 3, 0, 0]} />
            <Bar dataKey="pending" name="Запланировано" fill="var(--color-blue, #3b82f6)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
