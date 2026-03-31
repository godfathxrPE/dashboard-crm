'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Pencil, Trash2, Calendar, Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatDateShort } from '@/lib/utils/dates';
import { useUpdateTask } from '@/lib/hooks/use-tasks';
import type { Task } from '@/types/entities';

interface TaskCardProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
}

function deadlineUrgency(deadline: string, lane: string): { cls: string; label: string } {
  if (lane === 'done') return { cls: 'text-text-mute', label: formatDateShort(deadline) };
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86400000);
  if (days < 0) return { cls: 'text-red font-semibold', label: formatDateShort(deadline) };
  if (days === 0) return { cls: 'text-accent font-medium', label: 'Сегодня' };
  return { cls: 'text-text-mute', label: formatDateShort(deadline) };
}

export function TaskCard({ task, onEdit, onDelete }: TaskCardProps) {
  const updateTask = useUpdateTask();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isDone = task.lane === 'done';

  function toggleDone() {
    updateTask.mutate({ id: task.id, lane: isDone ? 'now' : 'done' });
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'group flex items-start gap-2 rounded-sm px-2 py-[7px] text-left',
        'cursor-grab transition-all duration-fast',
        'hover:bg-surface2 active:scale-[0.99]',
        isDragging && 'opacity-40 rotate-1 bg-accent-l',
        isDone && 'opacity-45',
        task.priority === 'important' && 'border-l-[3px] border-yellow bg-yellow/[0.06]',
        task.priority === 'critical' && 'border-l-[3px] border-red bg-red/[0.06]',
      )}
    >
      {/* Checkbox */}
      <button
        onClick={(e) => { e.stopPropagation(); toggleDone(); }}
        onPointerDown={(e) => e.stopPropagation()}
        className={cn(
          'mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border-[1.5px] transition-all',
          isDone
            ? 'border-green bg-green text-white'
            : 'border-border2 group-hover:border-accent group-hover:shadow-[0_0_0_3px_var(--accent-l)]',
        )}
      >
        {isDone && <Check size={10} strokeWidth={3} />}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={cn(
            'text-[0.8125rem] leading-[1.4] text-text-main',
            isDone && 'line-through text-text-mute',
          )}
        >
          {task.text}
        </p>

        {/* Meta */}
        {(task.deadline || task.project_id) && (
          <div className="mt-0.5 flex items-center gap-2 flex-wrap">
            {task.deadline && (() => {
              const urg = deadlineUrgency(task.deadline, task.lane);
              return (
                <span className={cn('flex items-center gap-1 text-[0.625rem]', urg.cls)}>
                  <Calendar size={9} />
                  {urg.label}
                </span>
              );
            })()}
            {task.project_id && (
              <span className="rounded bg-accent-l px-1 py-0.5 text-[0.625rem] text-accent truncate max-w-[100px]">
                проект
              </span>
            )}
          </div>
        )}
      </div>

      {/* Actions — on hover */}
      <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(task); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="rounded p-0.5 text-text-mute hover:text-accent transition-colors"
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
          onPointerDown={(e) => e.stopPropagation()}
          className="rounded p-0.5 text-text-mute hover:text-red transition-colors"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}
