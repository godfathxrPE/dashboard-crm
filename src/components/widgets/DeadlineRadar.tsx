'use client';

import { useMemo } from 'react';
import { AlertTriangle, Clock, CheckSquare, FolderKanban } from 'lucide-react';
import { useProjects } from '@/lib/hooks/use-projects';
import { useTasks } from '@/lib/hooks/use-tasks';
import { STAGE_CONFIG } from '@/lib/validators/project';

interface DeadlineItem {
  id: string;
  title: string;
  date: Date;
  type: 'task' | 'project';
  meta?: string;
  href: string;
}

export function DeadlineRadar() {
  const { data: projects } = useProjects();
  const { data: tasks } = useTasks();

  const items = useMemo(() => {
    const result: DeadlineItem[] = [];
    const now = new Date();

    // Tasks with deadlines
    for (const t of tasks ?? []) {
      if (t.deadline && t.lane !== 'done') {
        result.push({
          id: t.id,
          title: t.text,
          date: new Date(t.deadline),
          type: 'task',
          href: '/tasks',
        });
      }
    }

    // Projects with deadlines
    for (const p of projects ?? []) {
      if (p.deadline && p.stage !== 'won' && p.stage !== 'lost') {
        result.push({
          id: p.id,
          title: p.name,
          date: new Date(p.deadline),
          type: 'project',
          meta: p.stage ? STAGE_CONFIG[p.stage].shortLabel : '—',
          href: `/projects/${p.id}`,
        });
      }
    }

    // Sort by date, soonest first
    result.sort((a, b) => a.date.getTime() - b.date.getTime());

    return result.slice(0, 8); // Top 8
  }, [projects, tasks]);

  function getUrgency(date: Date): { label: string; color: string } {
    const now = new Date();
    const diffDays = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { label: `${Math.abs(diffDays)}д просрочено`, color: 'text-red' };
    if (diffDays === 0) return { label: 'Сегодня', color: 'text-red' };
    if (diffDays === 1) return { label: 'Завтра', color: 'text-yellow' };
    if (diffDays <= 3) return { label: `Через ${diffDays}д`, color: 'text-yellow' };
    if (diffDays <= 7) return { label: `Через ${diffDays}д`, color: 'text-blue' };
    return { label: `Через ${diffDays}д`, color: 'text-text-mute' };
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle size={14} className="text-yellow" />
        <span className="text-xs font-semibold text-text-dim">Дедлайн-радар</span>
        <span className="rounded-full bg-bg px-1.5 py-0.5 text-[10px] text-text-mute">{items.length}</span>
      </div>

      {items.length === 0 ? (
        <p className="py-4 text-center text-xs text-text-mute italic">Нет ближайших дедлайнов</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => {
            const urgency = getUrgency(item.date);
            return (
              <a key={item.id} href={item.href}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-hover">
                {item.type === 'task'
                  ? <CheckSquare size={11} className="shrink-0 text-blue" />
                  : <FolderKanban size={11} className="shrink-0 text-accent" />
                }
                <span className="min-w-0 flex-1 truncate text-xs text-text-main">{item.title}</span>
                {item.meta && (
                  <span data-tag className="shrink-0 rounded bg-accent-l px-1 py-0.5 text-[9px] text-accent">{item.meta}</span>
                )}
                <span className={`shrink-0 text-[10px] font-medium ${urgency.color}`}>{urgency.label}</span>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
