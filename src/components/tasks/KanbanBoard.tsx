'use client';

import { useState, useCallback } from 'react';
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
} from '@dnd-kit/core';
import { useTasksByLane, useUpdateTask, useDeleteTask } from '@/lib/hooks/use-tasks';
import { taskLanes } from '@/lib/validators/task';
import { LaneColumn } from './LaneColumn';
import { TaskModal } from './TaskModal';
import { TasksSidebar } from '@/components/widgets/TasksSidebar';
import { Loader2, Plus } from 'lucide-react';
import type { Task } from '@/types/entities';
import type { TaskLane } from '@/types/database';

export function KanbanBoard() {
  const { lanes, isLoading, isError, error } = useTasksByLane();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

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

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveTask(null);
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
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-text-main">Задачи</h1>
          <p className="text-xs text-text-mute mt-0.5">
            Перетаскивай карточки между колонками
          </p>
        </div>
        <button
          onClick={() => { setEditTask(null); setModalOpen(true); }}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          <Plus size={16} />
          Задача
        </button>
      </div>

      <div className="flex gap-6">
        {/* Main kanban */}
        <div className="flex-1 min-w-0">
          <DndContext
            sensors={sensors}
            collisionDetection={rectIntersection}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="rounded-lg bg-surface shadow-card overflow-hidden
                        grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {taskLanes.map((lane) => (
                <LaneColumn
                  key={lane}
                  lane={lane}
                  tasks={lanes[lane]}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>

            <DragOverlay>
              {activeTask ? (
                <div className="rounded-lg border border-accent/50 bg-surface p-3 shadow-lg opacity-90 rotate-2 max-w-[280px]">
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
