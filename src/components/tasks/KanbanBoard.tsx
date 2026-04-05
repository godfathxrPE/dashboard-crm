'use client';

import { useState, useCallback, useRef } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  rectIntersection,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import { useTasksByLane, useUpdateTask, useDeleteTask } from '@/lib/hooks/use-tasks';
import { taskLanes } from '@/lib/validators/task';
import { AccordionLane } from './AccordionLane';
import { TaskModal } from './TaskModal';
import { staggerClass } from '@/lib/utils/stagger';
import { TasksSidebar } from '@/components/widgets/TasksSidebar';
import { Loader2, Plus } from 'lucide-react';
import { useThemeStore } from '@/lib/stores/theme-store';
import { CTAButton } from '@/components/ui/CTAButton';
import { Watermark } from '@/components/ui/Watermark';
import { useWatermarkHover } from '@/lib/hooks/use-watermark-hover';
import { WATERMARK_GRADIENTS } from '@/lib/watermark-gradients';
import type { Task } from '@/types/entities';
import type { TaskLane } from '@/types/database';

function TasksPageHeader({ onAdd }: { onAdd: () => void }) {
  const isScandi = useThemeStore((s) => s.theme) === 't-scandi';
  const { isActive, onMouseEnter, onMouseLeave } = useWatermarkHover(2000);

  return (
    <div className="flex items-center justify-between mb-4">
      <div onMouseEnter={isScandi ? onMouseEnter : undefined} onMouseLeave={isScandi ? onMouseLeave : undefined}>
        {isScandi ? (
          <>
            <Watermark text="Задачи" colors={WATERMARK_GRADIENTS.sunset} size="lg" isActive={isActive} className="block" />
            <p className="text-[13px] text-text-mute mt-1">Перетаскивай задачи между секциями</p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-text-main">Задачи</h1>
            <p className="text-xs text-text-mute mt-0.5">Перетаскивай задачи между секциями</p>
          </>
        )}
      </div>
      <CTAButton onClick={onAdd}>
        <Plus size={16} />
        Задача
      </CTAButton>
    </div>
  );
}

export function KanbanBoard() {
  const { lanes, isLoading, isError, error } = useTasksByLane();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [openLanes, setOpenLanes] = useState<Set<TaskLane>>(new Set(['now']));
  const dragExpandTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const toggleLane = useCallback((lane: TaskLane) => {
    setOpenLanes((prev) => {
      const next = new Set(prev);
      if (next.has(lane)) next.delete(lane);
      else next.add(lane);
      return next;
    });
  }, []);

  const handleEdit = useCallback((task: Task) => {
    setEditTask(task);
    setModalOpen(true);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      if (window.confirm('Удалить задачу?')) {
        deleteTask.mutate(id);
      }
    },
    [deleteTask],
  );

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const id = event.active.id as string;
      const allTasks = Object.values(lanes).flat();
      const task = allTasks.find((t) => t.id === id);
      if (task) setActiveTask(task);
    },
    [lanes],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const overId = event.over?.id as string | undefined;
      if (!overId) {
        clearTimeout(dragExpandTimer.current);
        return;
      }

      // Check if hovering over a lane droppable
      const isLane = taskLanes.includes(overId as TaskLane);
      let targetLane: TaskLane | null = isLane ? (overId as TaskLane) : null;

      // If hovering over a task, find its lane
      if (!targetLane) {
        for (const lane of taskLanes) {
          if (lanes[lane].some((t) => t.id === overId)) {
            targetLane = lane;
            break;
          }
        }
      }

      if (targetLane && !openLanes.has(targetLane)) {
        clearTimeout(dragExpandTimer.current);
        dragExpandTimer.current = setTimeout(() => {
          setOpenLanes((prev) => new Set([...prev, targetLane]));
        }, 500);
      }
    },
    [lanes, openLanes],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveTask(null);
      clearTimeout(dragExpandTimer.current);
      const { active, over } = event;
      if (!over) return;

      const taskId = active.id as string;
      const overId = over.id as string;

      const allTasks = Object.values(lanes).flat();
      const task = allTasks.find((t) => t.id === taskId);
      if (!task) return;

      let targetLane: TaskLane | null = null;

      if (taskLanes.includes(overId as TaskLane)) {
        targetLane = overId as TaskLane;
      } else {
        for (const lane of taskLanes) {
          if (lanes[lane].some((t) => t.id === overId)) {
            targetLane = lane;
            break;
          }
        }
      }

      if (targetLane && task.lane !== targetLane) {
        updateTask.mutate({ id: taskId, lane: targetLane });
      }
    },
    [lanes, updateTask],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-accent" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-red/30 bg-red-l p-6 text-center">
        <p className="text-sm text-red font-medium">Ошибка загрузки задач</p>
        <p className="mt-1 text-xs text-text-mute">
          {error instanceof Error ? error.message : 'Неизвестная ошибка'}
        </p>
      </div>
    );
  }

  return (
    <>
      <TasksPageHeader onAdd={() => { setEditTask(null); setModalOpen(true); }} />

      <div className="flex gap-6">
        {/* Accordion kanban */}
        <div className="flex-1 min-w-0">
          <DndContext
            sensors={sensors}
            collisionDetection={rectIntersection}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="flex flex-col gap-2">
              {taskLanes.map((lane, i) => (
                <div key={lane} className={staggerClass(i)}>
                  <AccordionLane
                    lane={lane}
                    tasks={lanes[lane]}
                    isOpen={openLanes.has(lane)}
                    onToggle={() => toggleLane(lane)}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                </div>
              ))}
            </div>

            <DragOverlay>
              {activeTask ? (
                <div className="rounded-lg border border-accent/50 bg-surface p-3 elevation-3 opacity-90 rotate-2 max-w-[280px]">
                  <p className="text-sm text-text-main">{activeTask.text}</p>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>

        {/* Right sidebar — hidden on < lg */}
        <TasksSidebar />
      </div>

      <TaskModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditTask(null); }}
        editTask={editTask}
      />
    </>
  );
}
