'use client';

import { useMemo } from 'react';
import { X, CheckSquare, Phone, FolderKanban, CalendarDays, TrendingUp, Award } from 'lucide-react';
import { useTasks } from '@/lib/hooks/use-tasks';
import { useCalls } from '@/lib/hooks/use-calls';
import { useProjects } from '@/lib/hooks/use-projects';
import { useMeetings } from '@/lib/hooks/use-meetings';
import { STAGE_CONFIG, formatBudget } from '@/lib/validators/project';

interface WeeklyReviewProps {
  isOpen: boolean;
  onClose: () => void;
}

export function WeeklyReview({ isOpen, onClose }: WeeklyReviewProps) {
  const { data: tasks } = useTasks();
  const { data: calls } = useCalls();
  const { data: projects } = useProjects();
  const { data: meetings } = useMeetings();

  const review = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    weekStart.setHours(0, 0, 0, 0);

    const inWeek = (dateStr: string) => new Date(dateStr) >= weekStart;

    const tasksDone = (tasks ?? []).filter((t) => t.lane === 'done' && inWeek(t.updated_at));
    const callsDone = (calls ?? []).filter((c) => c.status === 'done' && inWeek(c.date));
    const meetingsHeld = (meetings ?? []).filter((m) => m.date >= weekStart.toISOString().slice(0, 10) && m.date <= now.toISOString().slice(0, 10));

    // Projects that moved stage this week
    const projectsMoved = (projects ?? []).filter((p) => inWeek(p.updated_at) && p.stage !== 'new_lead');
    const projectsWon = (projects ?? []).filter((p) => p.stage === 'won' && inWeek(p.updated_at));
    const wonBudget = projectsWon.reduce((sum, p) => sum + (p.budget ?? 0), 0);

    // Active tasks remaining
    const activeTasks = (tasks ?? []).filter((t) => t.lane !== 'done');

    return {
      tasksDone: tasksDone.length,
      callsDone: callsDone.length,
      meetingsHeld: meetingsHeld.length,
      projectsMoved: projectsMoved.length,
      projectsWon: projectsWon.length,
      wonBudget,
      activeTasks: activeTasks.length,
      topTasks: tasksDone.slice(0, 5),
      topCalls: callsDone.slice(0, 3),
    };
  }, [tasks, calls, projects, meetings]);

  if (!isOpen) return null;

  const stats = [
    { icon: CheckSquare, label: 'Задач выполнено', value: review.tasksDone, color: 'text-green' },
    { icon: Phone, label: 'Звонков сделано', value: review.callsDone, color: 'text-blue' },
    { icon: CalendarDays, label: 'Встреч проведено', value: review.meetingsHeld, color: 'text-yellow' },
    { icon: FolderKanban, label: 'Проектов продвинуто', value: review.projectsMoved, color: 'text-accent' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-xl rounded-xl border border-border p-6 shadow-2xl ring-1 ring-black/5"
        style={{ backgroundColor: 'var(--color-surface, #fff)' }}
        onClick={(e) => e.stopPropagation()}>

        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-accent" />
            <h2 className="text-lg font-semibold text-text-main">Итоги недели</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-text-mute hover:bg-surface-hover">
            <X size={18} />
          </button>
        </div>

        {/* Stats grid */}
        <div className="mb-5 grid grid-cols-2 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg border border-border/50 bg-bg px-3 py-2.5 text-center">
              <s.icon size={16} className={`mx-auto mb-1 ${s.color}`} />
              <div className="text-xl font-bold text-text-main">{s.value}</div>
              <div className="text-[10px] text-text-mute">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Won deals highlight */}
        {review.projectsWon > 0 && (
          <div className="mb-4 rounded-lg border border-green/30 bg-green/5 px-4 py-3 text-center">
            <Award size={20} className="mx-auto mb-1 text-green" />
            <div className="text-sm font-semibold text-green">
              Выиграно: {review.projectsWon} проект(ов) на {formatBudget(review.wonBudget)}
            </div>
          </div>
        )}

        {/* Completed tasks */}
        {review.topTasks.length > 0 && (
          <div className="mb-4">
            <h3 className="mb-2 text-xs font-semibold text-text-dim">Выполненные задачи</h3>
            <div className="space-y-1">
              {review.topTasks.map((t) => (
                <div key={t.id} className="flex items-center gap-2 rounded px-2 py-1 text-xs text-text-main">
                  <CheckSquare size={10} className="text-green" />
                  <span className="truncate">{t.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Remaining */}
        <div className="rounded-lg bg-bg px-4 py-3 text-center">
          <p className="text-xs text-text-mute">
            В работе осталось <span className="font-semibold text-text-main">{review.activeTasks}</span> задач
          </p>
        </div>

        <div className="mt-4 flex justify-end">
          <button onClick={onClose}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
