'use client';

import { useRef, useEffect } from 'react';
import { ChevronRight } from 'lucide-react';
import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { cn } from '@/lib/utils/cn';
import { LANE_CONFIG } from '@/lib/validators/task';
import { Bracket } from '@/components/ui/Bracket';
import { TaskCard } from './TaskCard';
import { TaskQuickAdd } from './TaskQuickAdd';
import type { Task } from '@/types/entities';
import type { TaskLane } from '@/types/database';

interface AccordionLaneProps {
  lane: TaskLane;
  tasks: Task[];
  isOpen: boolean;
  onToggle: () => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  isDragTarget?: boolean;
}

export function AccordionLane({
  lane,
  tasks,
  isOpen,
  onToggle,
  onEdit,
  onDelete,
  isDragTarget,
}: AccordionLaneProps) {
  const config = LANE_CONFIG[lane];
  const { setNodeRef, isOver } = useDroppable({ id: lane });
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <Bracket
      className={cn(
        'overflow-hidden transition-all duration-200',
        (isOver || isDragTarget) && 'ring-2 ring-accent/60 ring-inset',
      )}
    >
    <div ref={setNodeRef}>
      {/* Header — always visible */}
      <button
        onClick={onToggle}
        className={cn(
          'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors',
          'hover:bg-surface2',
        )}
      >
        <ChevronRight
          size={16}
          className={cn(
            'shrink-0 text-text-mute transition-transform duration-200',
            isOpen && 'rotate-90',
          )}
        />
        <span className={cn('text-xs font-bold uppercase tracking-[0.06em]', config.color)}>
          {config.label}
        </span>
        <span
          className={cn(
            'ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold',
            config.bg,
            config.color,
          )}
        >
          {tasks.length}
        </span>
      </button>

      {/* Content — animated expand/collapse */}
      <div
        ref={contentRef}
        className={cn(
          'grid transition-all duration-250 ease-out',
          isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="overflow-hidden">
          <div className="px-3 py-2">
            <SortableContext
              items={tasks.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col">
                {tasks.length === 0 && (
                  <div className="flex items-center justify-center py-4">
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

            {lane !== 'done' && (
              <div className="mt-1 pt-1">
                <TaskQuickAdd lane={lane} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </Bracket>
  );
}
