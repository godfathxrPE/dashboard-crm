'use client';

import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useCalls } from '@/lib/hooks/use-calls';
import { useThemeStore } from '@/lib/stores/theme-store';

// Aura: сочные градиенты для баров [насыщенный, светлее]
const AURA_DONE: [string, string] = ['#2F8F5B', '#7FD4A6'];
const AURA_PENDING: [string, string] = ['#3B7FD4', '#85C2F0'];

export function CallsChart() {
  const { data: calls } = useCalls();
  const theme = useThemeStore((s) => s.theme);
  const isScandi = theme === 't-scandi';
  const isAura = theme === 't-aura';
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

  const hasCalls = chartData.some((w) => w.done + w.pending + w.cancelled > 0);

  return (
    <div
      className="rounded-lg bg-surface p-4 elevation-hover"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <h3 className="mb-3 text-xs font-semibold text-text-dim">Звонки по неделям</h3>
      <div className="h-48">
        {!hasCalls ? (
          <div className="flex h-full items-center justify-center text-xs text-text-mute">
            Нет звонков за период
          </div>
        ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barGap={2}>
            {isAura && (
              <defs>
                <linearGradient id="calls-done" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={AURA_DONE[0]} />
                  <stop offset="100%" stopColor={AURA_DONE[1]} stopOpacity={0.55} />
                </linearGradient>
                <linearGradient id="calls-pending" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={AURA_PENDING[0]} />
                  <stop offset="100%" stopColor={AURA_PENDING[1]} stopOpacity={0.55} />
                </linearGradient>
              </defs>
            )}
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
            <Bar dataKey="done" name="Выполнено" fill={isAura ? 'url(#calls-done)' : isScandi ? '#4A5E8A' : 'var(--green)'} radius={[4, 4, 0, 0]} isAnimationActive={false} animationDuration={700} animationEasing="ease-out" />
            <Bar dataKey="pending" name="Запланировано" fill={isAura ? 'url(#calls-pending)' : isScandi ? '#4A5E8A' : 'var(--blue)'} radius={[4, 4, 0, 0]} isAnimationActive={false} animationDuration={700} animationEasing="ease-out" />
          </BarChart>
        </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
