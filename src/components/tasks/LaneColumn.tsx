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

interface LaneColumnProps {
  lane: TaskLane;
  tasks: Task[];
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
}

export function LaneColumn({ lane, tasks, onEdit, onDelete }: LaneColumnProps) {
  const config = LANE_CONFIG[lane];

  // Регистрируем колонку как droppable-зону
  const { setNodeRef, isOver } = useDroppable({ id: lane });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col rounded-xl border bg-surface2/50 p-3 transition-colors min-h-[200px]',
        isOver ? 'border-accent/50 bg-accent-l/30' : 'border-border',
      )}
    >
      {/* Lane header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={cn('h-2 w-2 rounded-full', config.dotColor)} />
          <span className="text-xs font-bold uppercase tracking-wider text-text-main">
            {config.label}
          </span>
        </div>
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
        <div className="flex flex-1 flex-col gap-1">
          {tasks.length === 0 && (
            <div className="flex-1 rounded-lg border border-dashed border-border/60 flex items-center justify-center min-h-[60px]">
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

      {/* Quick add (не в "done") */}
      {lane !== 'done' && (
        <div className="mt-2 pt-2 border-t border-border/40">
          <TaskQuickAdd lane={lane} />
        </div>
      )}
    </div>
  );
}
