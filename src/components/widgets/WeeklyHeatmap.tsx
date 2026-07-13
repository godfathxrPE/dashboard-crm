'use client';

import { useMemo } from 'react';
import { Activity } from 'lucide-react';
import { useCalls } from '@/lib/hooks/use-calls';
import { useTasks } from '@/lib/hooks/use-tasks';
import { useMeetings } from '@/lib/hooks/use-meetings';
import { localDateKey } from '@/lib/utils/date-helpers';

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function WeeklyHeatmap() {
  const { data: calls } = useCalls();
  const { data: tasks } = useTasks();
  const { data: meetings } = useMeetings();

  const heatmap = useMemo(() => {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    monday.setHours(0, 0, 0, 0);

    return DAYS.map((day, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      const dateStr = localDateKey(date);

      const callCount = (calls ?? []).filter(
        (c) => c.status === 'done' && c.date.slice(0, 10) === dateStr
      ).length;

      const taskCount = (tasks ?? []).filter(
        (t) => t.lane === 'done' && (t.updated_at ?? '').slice(0, 10) === dateStr
      ).length;

      const meetingCount = (meetings ?? []).filter(
        (m) => m.date === dateStr
      ).length;

      const total = callCount + taskCount + meetingCount;
      const isToday = dateStr === localDateKey(now);
      const isFuture = date > now;

      return { day, total, callCount, taskCount, meetingCount, isToday, isFuture };
    });
  }, [calls, tasks, meetings]);

  const maxActivity = Math.max(1, ...heatmap.map((d) => d.total));

  function getIntensity(total: number, isFuture: boolean): string {
    if (isFuture) return 'bg-border/30';
    if (total === 0) return 'bg-border/50';
    const pct = total / maxActivity;
    if (pct < 0.25) return 'bg-green/20';
    if (pct < 0.5) return 'bg-green/40';
    if (pct < 0.75) return 'bg-green/60';
    return 'bg-green/80';
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <Activity size={14} className="text-green" />
        <span className="text-xs font-semibold text-text-dim">Активность за неделю</span>
      </div>

      <div className="flex gap-1.5">
        {heatmap.map((d) => (
          <div key={d.day} className="flex-1 text-center">
            <div
              className={`mx-auto mb-1 flex h-10 w-full items-center justify-center rounded-lg
                transition-colors ${getIntensity(d.total, d.isFuture)}
                ${d.isToday ? 'ring-2 ring-accent ring-offset-1' : ''}`}
              title={`${d.day}: ${d.callCount} звонков, ${d.taskCount} задач, ${d.meetingCount} встреч`}
            >
              <span className={`text-xs font-bold ${d.total > 0 ? 'text-green' : 'text-text-mute'}`}>
                {d.isFuture ? '' : d.total}
              </span>
            </div>
            <span className={`text-[9px] ${d.isToday ? 'font-bold text-accent' : 'text-text-mute'}`}>
              {d.day}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-center gap-3 text-[9px] text-text-mute">
        <span>📞 Звонки</span>
        <span>✅ Задачи</span>
        <span>📅 Встречи</span>
      </div>
    </div>
  );
}
