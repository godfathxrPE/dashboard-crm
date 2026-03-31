'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Trash2, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatDateShort } from '@/lib/utils/dates';
import { PRIORITY_CONFIG } from '@/lib/validators/task';
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

  const priorityCfg = PRIORITY_CONFIG[task.priority];
  const isOverdue =
    task.deadline && new Date(task.deadline) < new Date() && task.lane !== 'done';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative rounded-sm bg-surface px-3 py-2 text-left transition-colors duration-fast',
        'task-card hover:bg-surface2',
        isDragging && 'opacity-50 shadow-md rotate-1',
        isOverdue && 'ring-1 ring-red/30',
      )}
    >
      <div className="flex items-start gap-2">
        {/* Priority dot */}
        {task.priority !== 'normal' && (
          <span
            className={cn(
              'mt-1.5 h-2 w-2 shrink-0 rounded-full',
              task.priority === 'critical' ? 'bg-red' : 'bg-yellow',
            )}
          />
        )}

        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="mt-0.5 shrink-0 cursor-grab text-text-mute opacity-0 group-hover:opacity-100 transition-opacity active:cursor-grabbing"
          tabIndex={-1}
        >
          <GripVertical size={14} />
        </button>

        <div className="flex-1 min-w-0">
          {/* Task text */}
          <p
            className={cn(
              'text-sm text-text-main leading-snug',
              task.lane === 'done' && 'line-through text-text-mute',
            )}
          >
            {task.text}
          </p>

          {/* Meta row */}
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            {/* Priority badge */}
            {task.priority !== 'normal' && (
              <span
                className={cn(
                  'text-[10px] font-medium px-1.5 py-0.5 rounded',
                  task.priority === 'critical'
                    ? 'bg-red-l text-red'
                    : 'bg-yellow-l text-yellow',
                )}
              >
                {priorityCfg.label}
              </span>
            )}

            {/* Project badge */}
            {task.project_id && (
              <span className="rounded bg-accent-l px-1.5 py-0.5 text-[10px] text-accent truncate max-w-[120px]">
                проект
              </span>
            )}

            {/* Deadline */}
            {task.deadline && (() => {
              const urg = deadlineUrgency(task.deadline, task.lane);
              return (
                <span className={cn('flex items-center gap-1 text-[10px]', urg.cls)}>
                  <Calendar size={10} />
                  {urg.label}
                </span>
              );
            })()}
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(task)}
            className="rounded p-1 text-text-mute hover:text-accent hover:bg-accent-l transition-colors"
            title="Редактировать"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={() => onDelete(task.id)}
            className="rounded p-1 text-text-mute hover:text-red hover:bg-red-l transition-colors"
            title="Удалить"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
