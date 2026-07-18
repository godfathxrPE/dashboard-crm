'use client';

import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { cn } from '@/lib/utils/cn';
import { useCreateTask, useUpdateTask, useProjectBoard } from '@/lib/hooks/use-tasks';
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
import { datetimeLocalToIso, isoToDatetimeLocal } from '@/lib/utils/date-helpers';

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
      parent_task_id: null,
      wbs_code: null,
    },
  });

  const selectedPriority = watch('priority');

  // S-WBS-1: список кандидатов-родителей — задачи ТОГО ЖЕ проекта (родитель без
  // проекта не имеет смысла). Хук дизейблится при пустом projectId.
  const currentProjectId = watch('project_id');
  const { tasks: projectTasks } = useProjectBoard(currentProjectId ?? '');

  // Клиентский anti-cycle: исключаем саму задачу и всех её потомков (DB-триггер —
  // второй рубеж). Строим детей по parent_task_id и обходим поддерево вниз.
  const excludedParentIds = useMemo(() => {
    const set = new Set<string>();
    if (!editTask) return set;
    set.add(editTask.id);
    const childrenOf = new Map<string, string[]>();
    for (const t of projectTasks ?? []) {
      if (t.parent_task_id) {
        (childrenOf.get(t.parent_task_id) ??
          childrenOf.set(t.parent_task_id, []).get(t.parent_task_id)!).push(t.id);
      }
    }
    const stack = [editTask.id];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const child of childrenOf.get(cur) ?? []) {
        if (!set.has(child)) { set.add(child); stack.push(child); }
      }
    }
    return set;
  }, [editTask, projectTasks]);

  const parentOptions = useMemo(
    () => (projectTasks ?? []).filter((t) => !excludedParentIds.has(t.id)),
    [projectTasks, excludedParentIds],
  );

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
        deadline: isoToDatetimeLocal(editTask.deadline),
        start_date: editTask.start_date ?? null,
        end_date: editTask.end_date ?? null,
        remind_min: editTask.remind_min,
        assigned_to: editTask.assigned_to ?? null,
        parent_task_id: editTask.parent_task_id ?? null,
        wbs_code: editTask.wbs_code ?? null,
      });
    } else {
      reset({
        text: defaultText ?? '',
        lane: defaultLane ?? 'now',
        priority: 'normal',
        project_id: defaultProjectId ?? null,
        company_id: defaultCompanyId ?? null,
        contact_id: defaultContactId ?? null,
        deadline: isoToDatetimeLocal(defaultDeadline),
        start_date: null,
        end_date: null,
        remind_min: null,
        assigned_to: null,
        parent_task_id: null,
        wbs_code: null,
      });
    }
  }, [editTask, defaultProjectId, defaultContactId, defaultCompanyId, defaultText, defaultDeadline, defaultLane, reset]);

  function onSubmit(values: TaskFormValues) {
    // datetime-local (локальное время) → ISO UTC для timestamptz `deadline`;
    // пустая строка → null. start_date/end_date — date-only, идут как есть.
    const payload = { ...values, deadline: datetimeLocalToIso(values.deadline) };
    if (editTask) {
      updateTask.mutate(
        { id: editTask.id, ...payload },
        { onSuccess: () => onClose() },
      );
    } else {
      createTask.mutate(payload, {
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

          {/* S-WBS-1: WBS-код + родитель (иерархия задач). Родитель — только при
              наличии project_id (родитель без проекта не имеет смысла). */}
          <div className={cn('grid gap-3', currentProjectId ? 'grid-cols-2' : 'grid-cols-1')}>
            <div>
              <label className="block text-xs font-medium text-text-dim mb-1">WBS-код</label>
              <input
                type="text"
                {...register('wbs_code', { setValueAs: (v) => (v === '' ? null : v) })}
                placeholder="1.3.11"
                className="w-full rounded-lg border border-input bg-surface2 px-3 py-2 text-sm text-text-main tabular-nums placeholder:text-text-mute focus:border-accent focus:outline-none"
              />
              {errors.wbs_code && (
                <p className="mt-1 text-xs text-red">{errors.wbs_code.message}</p>
              )}
            </div>
            {currentProjectId && (
              <div>
                <label className="block text-xs font-medium text-text-dim mb-1">Родитель</label>
                <select
                  {...register('parent_task_id', { setValueAs: (v) => (v === '' ? null : v) })}
                  className="w-full rounded-lg border border-input bg-surface2 px-3 py-2 text-sm text-text-main focus:border-accent focus:outline-none"
                >
                  <option value="">— без родителя —</option>
                  {parentOptions.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.wbs_code ? `${t.wbs_code} ` : ''}{t.text}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
