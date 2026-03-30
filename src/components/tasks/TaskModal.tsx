'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useCreateTask, useUpdateTask } from '@/lib/hooks/use-tasks';
import {
  taskFormSchema,
  type TaskFormValues,
  LANE_CONFIG,
  PRIORITY_CONFIG,
  taskLanes,
  taskPriorities,
} from '@/lib/validators/task';
import type { Task } from '@/types/entities';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  editTask: Task | null;
  defaultProjectId?: string | null;
}

export function TaskModal({ isOpen, onClose, editTask, defaultProjectId }: TaskModalProps) {
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      text: '',
      lane: 'now',
      priority: 'normal',
      project_id: null,
      deadline: null,
      remind_min: null,
    },
  });

  const selectedPriority = watch('priority');

  // Заполняем форму при редактировании
  useEffect(() => {
    if (editTask) {
      reset({
        text: editTask.text,
        lane: editTask.lane,
        priority: editTask.priority,
        project_id: editTask.project_id,
        deadline: editTask.deadline?.slice(0, 16) ?? null, // datetime-local format
        remind_min: editTask.remind_min,
      });
    } else {
      reset({
        text: '',
        lane: 'now',
        priority: 'normal',
        project_id: defaultProjectId ?? null,
        deadline: null,
        remind_min: null,
      });
    }
  }, [editTask, defaultProjectId, reset]);

  function onSubmit(values: TaskFormValues) {
    if (editTask) {
      updateTask.mutate(
        { id: editTask.id, ...values },
        { onSuccess: () => onClose() },
      );
    } else {
      createTask.mutate(values, {
        onSuccess: () => {
          reset();
          onClose();
        },
      });
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-text-main">
            {editTask ? 'Редактировать задачу' : 'Новая задача'}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-text-mute hover:text-text-main hover:bg-surface2 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Text */}
          <div>
            <label className="block text-xs font-medium text-text-dim mb-1">
              Задача
            </label>
            <input
              {...register('text')}
              autoFocus
              placeholder="Что нужно сделать?"
              className="w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none"
            />
            {errors.text && (
              <p className="mt-1 text-xs text-red">{errors.text.message}</p>
            )}
          </div>

          {/* Lane */}
          <div>
            <label className="block text-xs font-medium text-text-dim mb-1">
              Столбец
            </label>
            <select
              {...register('lane')}
              className="w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-text-main focus:border-accent focus:outline-none"
            >
              {taskLanes.filter((l) => l !== 'done').map((l) => (
                <option key={l} value={l}>
                  {LANE_CONFIG[l].label}
                </option>
              ))}
            </select>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-xs font-medium text-text-dim mb-1">
              Приоритет
            </label>
            <div className="flex gap-2">
              {taskPriorities.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setValue('priority', p)}
                  className={cn(
                    'flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all',
                    selectedPriority === p
                      ? 'border-accent bg-accent-l text-accent'
                      : 'border-border text-text-dim hover:border-accent/30',
                  )}
                >
                  {PRIORITY_CONFIG[p].label}
                </button>
              ))}
            </div>
          </div>

          {/* Deadline */}
          <div>
            <label className="block text-xs font-medium text-text-dim mb-1">
              Дедлайн
            </label>
            <input
              type="datetime-local"
              {...register('deadline')}
              className="w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-text-main focus:border-accent focus:outline-none"
            />
          </div>

          {/* Remind */}
          <div>
            <label className="block text-xs font-medium text-text-dim mb-1">
              Напомнить до дедлайна
            </label>
            <select
              {...register('remind_min', { valueAsNumber: true })}
              className="w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-sm text-text-main focus:border-accent focus:outline-none"
            >
              <option value="">Не напоминать</option>
              <option value={15}>За 15 минут</option>
              <option value={60}>За 1 час</option>
              <option value={1440}>За 1 день</option>
            </select>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm text-text-dim hover:bg-surface2 transition-colors"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={createTask.isPending || updateTask.isPending}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {createTask.isPending || updateTask.isPending
                ? 'Сохраняем...'
                : 'Сохранить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
