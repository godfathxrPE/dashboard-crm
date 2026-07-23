'use client';

import Link from 'next/link';
import { Check, CalendarClock, CalendarDays, Building2, Briefcase, Repeat, Clock } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useUpdateTask } from '@/lib/hooks/use-tasks';
import { daysOverdue } from '@/lib/utils/task-view';
import { mskTimeRange } from '@/lib/utils/date-helpers';
import type { Task } from '@/types/entities';

// Точка приоритета — семантические токены темы (inline var, без bg-хардкода).
const PRIORITY_DOT: Record<string, string> = {
  critical: 'var(--danger)',
  important: 'var(--warning)',
  normal: 'var(--text-mute)',
};

function projectHref(t: Task): string | null {
  if (!t.project_id || !t.project) return null;
  // routing-split: client → /deals, internal|delivery → /projects
  return t.project.type === 'client' ? `/deals/${t.project_id}` : `/projects/${t.project_id}`;
}

function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

interface TaskStreamRowProps {
  task: Task;
  now: Date;
  isOverdue: boolean;
  onEdit: (task: Task) => void;
  canEdit: boolean;
  /** Позиция в плоской очереди для j/k (S-TASKS-POLISH-1, з.4 — паттерн QueueRow/W2d). */
  kbdIndex?: number;
  focused?: boolean;
}

export function TaskStreamRow({ task, now, isOverdue, onEdit, canEdit, kbdIndex, focused }: TaskStreamRowProps) {
  const updateTask = useUpdateTask();
  const done = task.lane === 'done';
  const href = projectHref(task);
  const overdueBy = isOverdue ? daysOverdue(task, now) : 0;
  const timeBlock = mskTimeRange(task.scheduled_start, task.scheduled_end);

  function toggleDone(e: React.MouseEvent) {
    e.stopPropagation();
    updateTask.mutate({ id: task.id, lane: done ? 'now' : 'done' });
  }

  function pushToTomorrow(e: React.MouseEvent) {
    e.stopPropagation();
    const base = task.deadline ? new Date(task.deadline) : now;
    const next = new Date(base.getTime() + 86_400_000);
    updateTask.mutate({ id: task.id, deadline: next.toISOString() });
  }

  return (
    <div
      onClick={() => onEdit(task)}
      data-row-index={kbdIndex}
      aria-selected={focused}
      className={cn(
        'group/row flex items-center gap-3 rounded-lg border border-transparent px-2 py-2 cursor-pointer transition-colors',
        focused ? 'kbd-focus-row' : 'hover:border-border/60 hover:bg-surface2/50',
      )}
    >
      {/* Чекбокс «Готово» */}
      <button
        type="button"
        onClick={toggleDone}
        disabled={!canEdit}
        aria-checked={done}
        role="checkbox"
        aria-label={done ? 'Вернуть в работу' : 'Отметить выполненной'}
        style={done ? { background: 'var(--green)', borderColor: 'var(--green)' } : undefined}
        className={cn(
          'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border',
          'transition-colors disabled:opacity-40',
          done ? 'text-white' : 'border-input hover:border-accent',
        )}
      >
        {done && <Check size={12} strokeWidth={3} />}
      </button>

      {/* Точка приоритета */}
      <span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: PRIORITY_DOT[task.priority] ?? 'var(--text-mute)' }}
      />

      {/* Текст задачи */}
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-sm',
          done ? 'text-text-mute line-through' : 'text-text-main',
        )}
      >
        {task.text}
      </span>

      {/* S-RECUR-1: бейдж спавненной задачи (069) */}
      {task.recurrence_template_id && (
        <span title="Повторяющаяся" className="shrink-0 text-text-mute">
          <Repeat size={12} aria-label="Повторяющаяся" />
        </span>
      )}

      {/* Чип связи (проект/компания) */}
      {href && task.project ? (
        <Link
          href={href}
          onClick={(e) => e.stopPropagation()}
          className="hidden shrink-0 items-center gap-1 truncate rounded px-1.5 py-0.5 text-xs
                     text-text-mute hover:text-accent sm:inline-flex max-w-[160px]"
        >
          <Briefcase size={11} className="shrink-0" />
          <span className="truncate">{task.project.name}</span>
        </Link>
      ) : task.company ? (
        <Link
          href={`/companies/${task.company_id}`}
          onClick={(e) => e.stopPropagation()}
          className="hidden shrink-0 items-center gap-1 truncate rounded px-1.5 py-0.5 text-xs
                     text-text-mute hover:text-accent sm:inline-flex max-w-[160px]"
        >
          <Building2 size={11} className="shrink-0" />
          <span className="truncate">{task.company.name}</span>
        </Link>
      ) : null}

      {/* S-TIMEBLOCK-A1: чип тайм-блока «когда делаю» (ЧЧ:ММ–ЧЧ:ММ, МСК) */}
      {timeBlock && (
        <span className="hidden shrink-0 items-center gap-1 text-xs tabular-nums text-text-mute sm:inline-flex">
          <Clock size={11} className="shrink-0" />
          {timeBlock}
        </span>
      )}

      {/* Срок */}
      {task.deadline && (
        <span
          className="shrink-0 text-xs tabular-nums"
          style={isOverdue ? { color: 'var(--danger)' } : undefined}
        >
          <span className={isOverdue ? undefined : 'text-text-mute'}>{formatDeadline(task.deadline)}</span>
          {overdueBy > 0 && <span className="ml-1">· {overdueBy} дн.</span>}
        </span>
      )}

      {/* Quick actions на hover|focus (F-12: не теряются при kbd-навигации) */}
      {canEdit && (
        <div
          className={cn(
            'flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100',
            focused && 'opacity-100',
          )}
        >
          <button
            type="button"
            onClick={pushToTomorrow}
            title="На завтра"
            aria-label="Перенести на завтра"
            className="rounded p-1 text-text-mute hover:text-accent hover:bg-surface2"
          >
            <CalendarClock size={14} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onEdit(task); }}
            title="Дата…"
            aria-label="Изменить дату"
            className="rounded p-1 text-text-mute hover:text-accent hover:bg-surface2"
          >
            <CalendarDays size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
