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
  contactBelongsToCompany,
  contactsForCompany,
  deriveFromContact,
} from '@/lib/forms/derive-links';
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
  /** A2a: préfill интервала «Запланировано» при создании из слота недельной сетки, YYYY-MM-DDTHH:mm или ISO */
  defaultScheduledStart?: string | null;
  defaultScheduledEnd?: string | null;
}

export function TaskModal({ isOpen, onClose, editTask, defaultProjectId, defaultContactId, defaultCompanyId, defaultText, defaultDeadline, defaultLane, defaultScheduledStart, defaultScheduledEnd }: TaskModalProps) {
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const { data: companies } = useCompanies();
  const { data: contacts } = useContacts();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
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
      scheduled_start: null,
      scheduled_end: null,
      remind_min: null,
      assigned_to: null,
      parent_task_id: null,
      wbs_code: null,
    },
  });

  const selectedPriority = watch('priority');

  // S-TG-2 (108): напоминание отсчитывается ОТ дедлайна — без него планировщик
  // задачу не увидит вовсе. Поэтому поле не «серое на вид», а настоящим disabled:
  // выбор, который ничего не сделает, хуже отсутствующего.
  const hasDeadline = Boolean(watch('deadline'));

  useEffect(() => {
    // Дедлайн сняли — снимаем и напоминание: иначе значение осталось бы в форме,
    // спрятанное за disabled, и уехало бы в БД мёртвым грузом.
    if (!hasDeadline) setValue('remind_min', null);
  }, [hasDeadline, setValue]);

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

  // S-FIX-BATCH-1: контакты — только выбранной компании (без компании — все).
  const selectedCompanyId = watch('company_id');
  const contactOptions = useMemo(
    () => contactsForCompany(contacts, selectedCompanyId),
    [contacts, selectedCompanyId],
  );

  // Регистрации связанных полей разворачиваем, чтобы дописать свой onChange
  // ПОСЛЕ RHF-овского: сброс/вывод должны видеть уже применённое значение.
  const companyField = register('company_id');
  const contactField = register('contact_id');

  /**
   * Смена компании при выбранном контакте: чужой контакт снимаем. Иначе он
   * остаётся в задаче невидимым — отфильтрованный список его не показывает,
   * а в БД он лежит и противоречит компании.
   * Делаем на onChange, а не в useEffect: эффект сработал бы и на reset при
   * открытии, молча затерев контакт в уже сохранённой задаче.
   */
  function handleCompanyChange(e: React.ChangeEvent<HTMLSelectElement>) {
    companyField.onChange(e);
    const nextCompanyId = e.target.value || null;
    const currentContactId = getValues('contact_id');
    if (!nextCompanyId || !currentContactId) return; // «не указана» → список снова полный
    const current = (contacts ?? []).find((c) => c.id === currentContactId);
    if (!current || !contactBelongsToCompany(current, nextCompanyId)) {
      setValue('contact_id', null, { shouldDirty: true });
    }
  }

  /**
   * Обратный порядок (сначала контакт): подставляем компанию, если она у контакта
   * ровно одна. Тот же `deriveFromContact`, что в CallModal, и те же гейты —
   * только создание и только пустое поле. `projects: []` — вывод проекта здесь не
   * нужен (у задачи свой список проектов и своя семантика привязки).
   */
  function handleContactChange(e: React.ChangeEvent<HTMLSelectElement>) {
    contactField.onChange(e);
    if (editTask) return;
    const contactId = e.target.value || null;
    if (!contactId || getValues('company_id')) return;
    const derived = deriveFromContact(contactId, { contacts, projects: [] });
    if (derived.company_id) setValue('company_id', derived.company_id, { shouldDirty: true });
  }

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
        scheduled_start: isoToDatetimeLocal(editTask.scheduled_start),
        scheduled_end: isoToDatetimeLocal(editTask.scheduled_end),
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
        scheduled_start: isoToDatetimeLocal(defaultScheduledStart),
        scheduled_end: isoToDatetimeLocal(defaultScheduledEnd),
        remind_min: null,
        assigned_to: null,
        parent_task_id: null,
        wbs_code: null,
      });
    }
  }, [editTask, defaultProjectId, defaultContactId, defaultCompanyId, defaultText, defaultDeadline, defaultLane, defaultScheduledStart, defaultScheduledEnd, reset]);

  function onSubmit(values: TaskFormValues) {
    // datetime-local (локальное время) → ISO UTC для timestamptz-полей;
    // пустая строка → null. start_date/end_date — date-only, идут как есть.
    const payload = {
      ...values,
      deadline: datetimeLocalToIso(values.deadline),
      scheduled_start: datetimeLocalToIso(values.scheduled_start),
      scheduled_end: datetimeLocalToIso(values.scheduled_end),
    };
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
                {...companyField}
                onChange={handleCompanyChange}
                className="w-full rounded-lg border border-input bg-surface2 px-3 py-2 text-sm text-text-main focus:border-accent focus:outline-none"
              >
                <option value="">— не указана —</option>
                {(companies ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-dim mb-1">Контакт</label>
              <select
                {...contactField}
                onChange={handleContactChange}
                className="w-full rounded-lg border border-input bg-surface2 px-3 py-2 text-sm text-text-main focus:border-accent focus:outline-none"
              >
                <option value="">— не указан —</option>
                {contactOptions.map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
              </select>
              {/* Пустой <select> без подписи читается как «не загрузилось» */}
              {selectedCompanyId && contactOptions.length === 0 && (
                <p className="mt-1 text-xs text-text-dim">У этой компании нет контактов</p>
              )}
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

          {/* S-TIMEBLOCK-A1: «когда делаю» — интервал времени (тайм-блок). Отдельно
              от дедлайна «сделать к» и от дат Ганта ниже. Оба поля опциональны. */}
          <div>
            <label className="block text-xs font-medium text-text-dim mb-1">Запланировано</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <input
                  type="datetime-local"
                  aria-label="Начало тайм-блока"
                  {...register('scheduled_start')}
                  className="w-full rounded-lg border border-input bg-surface2 px-3 py-2 text-sm text-text-main focus:border-accent focus:outline-none"
                />
              </div>
              <div>
                <input
                  type="datetime-local"
                  aria-label="Конец тайм-блока"
                  {...register('scheduled_end')}
                  className="w-full rounded-lg border border-input bg-surface2 px-3 py-2 text-sm text-text-main focus:border-accent focus:outline-none"
                />
                {errors.scheduled_end && (
                  <p className="mt-1 text-xs text-red">{errors.scheduled_end.message}</p>
                )}
              </div>
            </div>
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

          {/* Remind — S-TG-2 (108): доставку этому полю даёт enqueue_task_reminders */}
          <div>
            <label className="block text-xs font-medium text-text-dim mb-1">
              Напомнить до дедлайна
            </label>
            <select
              // ⚠️ `setValueAs`, а НЕ `valueAsNumber`. RHF на valueAsNumber отдаёт для
              //    пустой строки NaN, а Zod `z.number()` NaN отвергает — выбор
              //    «Не напоминать» после любого другого значения молча ломал сабмит
              //    (ошибку этого поля форма нигде не рендерит). Тот же приём, что у
              //    `parent_task_id` выше.
              {...register('remind_min', {
                setValueAs: (v) => (v === '' || v === null ? null : Number(v)),
              })}
              disabled={!hasDeadline}
              className="w-full rounded-lg border border-input bg-surface2 px-3 py-2 text-sm text-text-main focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">Не напоминать</option>
              <option value={15}>За 15 минут</option>
              <option value={60}>За 1 час</option>
              <option value={180}>За 3 часа</option>
              <option value={1440}>За 1 день</option>
            </select>
            {!hasDeadline && (
              <p className="mt-1 text-xs text-text-dim">
                Сначала укажите дедлайн — напоминание считается от него
              </p>
            )}
          </div>
      </form>
    </Modal>
  );
}
