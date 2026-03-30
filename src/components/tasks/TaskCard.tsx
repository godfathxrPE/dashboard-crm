'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Trash2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatDateShort } from '@/lib/utils/dates';
import { PRIORITY_CONFIG } from '@/lib/validators/task';
import type { Task } from '@/types/entities';

interface TaskCardProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
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
        'group relative rounded-lg border bg-surface p-3 shadow-sm transition-all',
        'hover:shadow-md hover:border-accent/30',
        isDragging && 'opacity-50 shadow-lg rotate-1',
        priorityCfg.badge,
        isOverdue && 'border-red/40',
      )}
    >
      {/* Drag handle + content */}
      <div className="flex items-start gap-2">
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

            {/* Deadline */}
            {task.deadline && (
              <span
                className={cn(
                  'flex items-center gap-1 text-[10px]',
                  isOverdue ? 'text-red font-medium' : 'text-text-mute',
                )}
              >
                <Clock size={10} />
                {formatDateShort(task.deadline)}
              </span>
            )}
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
