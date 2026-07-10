'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2, Calendar, Check, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatDateShort } from '@/lib/utils/dates';
import { localDateKey } from '@/lib/utils/date-helpers';
import { useUpdateTask } from '@/lib/hooks/use-tasks';
import { useThemeStore } from '@/lib/stores/theme-store';
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
  const router = useRouter();
  const updateTask = useUpdateTask();
  // Aura: приоритет — НЕ палка сбоку, а цветной чекбокс + тон строки (через data-priority)
  const isAura = useThemeStore((s) => s.theme === 't-aura');

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

  // «На завтра» — как в «Сегодня»: завтра от текущего дня, не от старого дедлайна
  function bumpToTomorrow() {
    updateTask.mutate({ id: task.id, deadline: localDateKey(new Date(Date.now() + 86400000)) });
  }

  function toggleDone() {
    updateTask.mutate({ id: task.id, lane: isDone ? 'now' : 'done' });
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      data-priority={isAura && !isDone ? task.priority : undefined}
      className={cn(
        'group flex items-start gap-2 rounded-sm px-2 py-[7px] text-left',
        'cursor-grab transition-all duration-fast',
        'hover:bg-surface2 active:scale-[0.99]',
        isDragging && 'opacity-40 rotate-1 bg-accent-l',
        isDone && 'opacity-45',
        // Палки-маркеры — только НЕ в Aura (Aura показывает приоритет иначе)
        !isAura && task.priority === 'important' && 'border-l-[3px] border-yellow bg-yellow/[0.06]',
        !isAura && task.priority === 'critical' && 'border-l-[3px] border-red bg-red/[0.06]',
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
        {(task.deadline || task.project_id || task.company_id) && (
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
              <button
                onClick={(e) => { e.stopPropagation(); router.push(`/deals/${task.project_id}`); }}
                onPointerDown={(e) => e.stopPropagation()}
                data-tag
                className="rounded bg-accent-l px-1 py-0.5 text-[0.625rem] text-accent truncate max-w-[120px] cursor-pointer hover:text-text-main hover:bg-accent-l2 transition-colors"
              >
                {task.project?.name ?? 'проект'}
              </button>
            )}
            {task.company_id && (
              <button
                onClick={(e) => { e.stopPropagation(); router.push(`/companies/${task.company_id}`); }}
                onPointerDown={(e) => e.stopPropagation()}
                className="rounded bg-purple-l px-1 py-0.5 text-[0.625rem] text-purple truncate max-w-[120px] cursor-pointer hover:text-text-main hover:bg-accent-l2 transition-colors"
              >
                {task.company?.name ?? 'компания'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Actions — on hover */}
      <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {task.deadline && !isDone && (
          <button
            onClick={(e) => { e.stopPropagation(); bumpToTomorrow(); }}
            onPointerDown={(e) => e.stopPropagation()}
            title="Перенести на завтра"
            className="flex items-center gap-0.5 rounded p-0.5 text-text-mute hover:text-accent transition-colors"
          >
            <ArrowRight size={12} />
            <Calendar size={11} />
          </button>
        )}
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
