'use client';

import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { cn } from '@/lib/utils/cn';
import { LANE_CONFIG } from '@/lib/validators/task';
import { TaskCard } from './TaskCard';
import { TaskQuickAdd } from './TaskQuickAdd';
import type { Task } from '@/types/entities';
import type { TaskLane } from '@/types/database';

const LANE_HEADER_COLOR: Record<TaskLane, string> = {
  now: 'text-accent',
  next: 'text-blue',
  wait: 'text-text-dim',
  done: 'text-text-mute',
};

interface LaneColumnProps {
  lane: TaskLane;
  tasks: Task[];
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
}

export function LaneColumn({ lane, tasks, onEdit, onDelete }: LaneColumnProps) {
  const config = LANE_CONFIG[lane];
  const { setNodeRef, isOver } = useDroppable({ id: lane });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col min-h-[200px] px-4 py-3.5 transition-colors',
        // Last column (done) gets different bg, no right border
        lane === 'done'
          ? 'bg-surface2/50'
          : 'border-r border-border',
        isOver && 'bg-accent-l/20',
      )}
    >
      {/* Lane header */}
      <div className="flex items-center justify-between mb-3">
        <span className={cn('text-xs font-bold uppercase tracking-[0.06em]', LANE_HEADER_COLOR[lane])}>
          {config.label}
        </span>
        <span
          className={cn(
            'flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-medium',
            config.bg,
            config.color,
          )}
        >
          {tasks.length}
        </span>
      </div>

      {/* Sortable task cards */}
      <SortableContext
        items={tasks.map((t) => t.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-1 flex-col">
          {tasks.length === 0 && (
            <div className="flex-1 flex items-center justify-center min-h-[60px]">
              <span className="text-xs text-text-mute">Пусто</span>
            </div>
          )}
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      </SortableContext>

      {/* Quick add */}
      {lane !== 'done' && (
        <div className="mt-2 pt-2 border-t border-border/40">
          <TaskQuickAdd lane={lane} />
        </div>
      )}
    </div>
  );
}
