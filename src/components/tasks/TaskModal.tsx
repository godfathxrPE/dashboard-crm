'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { cn } from '@/lib/utils/cn';
import { useCreateTask, useUpdateTask } from '@/lib/hooks/use-tasks';
import { useCompanies } from '@/lib/hooks/use-companies';
import { useContacts } from '@/lib/hooks/use-contacts';
import { AssigneeSelect } from '@/components/shared/AssigneeSelect';
import { Modal } from '@/components/shared/Modal';
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
  defaultContactId?: string | null;
  defaultCompanyId?: string | null;
  /** Préfill текста задачи при создании (напр. action item из AI-протокола) */
  defaultText?: string | null;
  /** Préfill дедлайна при создании, YYYY-MM-DDTHH:mm или ISO */
  defaultDeadline?: string | null;
  /** P2a: lane при создании (фазовая доска delivery — 'next', статус «Не начата») */
  defaultLane?: TaskFormValues['lane'];
}

export function TaskModal({ isOpen, onClose, editTask, defaultProjectId, defaultContactId, defaultCompanyId, defaultText, defaultDeadline, defaultLane }: TaskModalProps) {
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const { data: companies } = useCompanies();
  const { data: contacts } = useContacts();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      text: '',
      lane: 'now',
      priority: 'normal',
      project_id: null,
      company_id: null,
      contact_id: null,
      deadline: null,
      start_date: null,
      end_date: null,
      remind_min: null,
      assigned_to: null,
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
        company_id: editTask.company_id ?? null,
        contact_id: editTask.contact_id ?? null,
        deadline: editTask.deadline?.slice(0, 16) ?? null,
        start_date: editTask.start_date ?? null,
        end_date: editTask.end_date ?? null,
        remind_min: editTask.remind_min,
        assigned_to: editTask.assigned_to ?? null,
      });
    } else {
      reset({
        text: defaultText ?? '',
        lane: defaultLane ?? 'now',
        priority: 'normal',
        project_id: defaultProjectId ?? null,
        company_id: defaultCompanyId ?? null,
        contact_id: defaultContactId ?? null,
        deadline: defaultDeadline?.slice(0, 16) ?? null,
        start_date: null,
        end_date: null,
        remind_min: null,
        assigned_to: null,
      });
    }
  }, [editTask, defaultProjectId, defaultContactId, defaultCompanyId, defaultText, defaultDeadline, defaultLane, reset]);

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
    <Modal
      title={editTask ? 'Редактировать задачу' : 'Новая задача'}
      onClose={onClose}
      isDirty={isDirty}
      maxWidth="max-w-md"
      footer={
        <>
          <button type="button" onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-text-dim hover:bg-surface2 transition-colors">
            Отмена
          </button>
          <button type="submit" form="task-form" disabled={createTask.isPending || updateTask.isPending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity">
            {createTask.isPending || updateTask.isPending ? 'Сохраняем...' : 'Сохранить'}
          </button>
        </>
      }
    >
      <form id="task-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Text */}
          <div>
            <label className="block text-xs font-medium text-text-dim mb-1">
              Задача
            </label>
            <textarea
              {...register('text')}
              autoFocus
              placeholder="Что нужно сделать?"
              rows={2}
              className="w-full rounded-lg border border-input bg-surface2 px-3 py-2 text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none"
              style={{ minHeight: '60px', resize: 'vertical' }}
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
              className="w-full rounded-lg border border-input bg-surface2 px-3 py-2 text-sm text-text-main focus:border-accent focus:outline-none"
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

          {/* Company + Contact */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-dim mb-1">Компания</label>
              <select
                {...register('company_id')}
                className="w-full rounded-lg border border-input bg-surface2 px-3 py-2 text-sm text-text-main focus:border-accent focus:outline-none"
              >
                <option value="">— не указана —</option>
                {(companies ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-dim mb-1">Контакт</label>
              <select
                {...register('contact_id')}
                className="w-full rounded-lg border border-input bg-surface2 px-3 py-2 text-sm text-text-main focus:border-accent focus:outline-none"
              >
                <option value="">— не указан —</option>
                {(contacts ?? []).map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
              </select>
            </div>
          </div>

          {/* Assignee */}
          <AssigneeSelect
            label="Исполнитель"
            value={watch('assigned_to') ?? null}
            onChange={(v) => setValue('assigned_to', v)}
          />

          {/* Deadline */}
          <div>
            <label className="block text-xs font-medium text-text-dim mb-1">
              Дедлайн
            </label>
            <input
              type="datetime-local"
              {...register('deadline')}
              className="w-full rounded-lg border border-input bg-surface2 px-3 py-2 text-sm text-text-main focus:border-accent focus:outline-none"
            />
          </div>

          {/* Gantt: план по датам */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-dim mb-1">Начало</label>
              <input
                type="date"
                {...register('start_date', { setValueAs: (v) => (v === '' ? null : v) })}
                className="w-full rounded-lg border border-input bg-surface2 px-3 py-2 text-sm text-text-main focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-dim mb-1">Конец</label>
              <input
                type="date"
                {...register('end_date', { setValueAs: (v) => (v === '' ? null : v) })}
                className="w-full rounded-lg border border-input bg-surface2 px-3 py-2 text-sm text-text-main focus:border-accent focus:outline-none"
              />
              {errors.end_date && (
                <p className="mt-1 text-xs text-red">{errors.end_date.message}</p>
              )}
            </div>
          </div>

          {/* Remind */}
          <div>
            <label className="block text-xs font-medium text-text-dim mb-1">
              Напомнить до дедлайна
            </label>
            <select
              {...register('remind_min', { valueAsNumber: true })}
              className="w-full rounded-lg border border-input bg-surface2 px-3 py-2 text-sm text-text-main focus:border-accent focus:outline-none"
            >
              <option value="">Не напоминать</option>
              <option value={15}>За 15 минут</option>
              <option value={60}>За 1 час</option>
              <option value={1440}>За 1 день</option>
            </select>
          </div>
      </form>
    </Modal>
  );
}
