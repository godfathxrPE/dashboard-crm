'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Pencil, Trash2, Repeat } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Modal } from '@/components/shared/Modal';
import { AssigneeSelect } from '@/components/shared/AssigneeSelect';
import { useCompanies } from '@/lib/hooks/use-companies';
import { useContacts } from '@/lib/hooks/use-contacts';
import { useProjects } from '@/lib/hooks/use-projects';
import {
  useRecurringTemplates,
  useCreateRecurringTemplate,
  useUpdateRecurringTemplate,
  useToggleRecurringTemplate,
  useDeleteRecurringTemplate,
} from '@/lib/hooks/use-recurring-tasks';
import {
  recurringTemplateFormSchema,
  recurringCadences,
  CADENCE_CONFIG,
  WEEKDAY_LABELS,
  cadenceLabel,
  type RecurringTemplateFormValues,
} from '@/lib/validators/recurring';
import { PRIORITY_CONFIG, taskPriorities } from '@/lib/validators/task';
import { computeInitialNextRunDate } from '@/lib/utils/recurring';
import type { RecurringTaskTemplate } from '@/types/entities';

interface RecurringTemplatesModalProps {
  onClose: () => void;
}

/**
 * S-RECUR-1: настройка повторяющихся задач — список шаблонов + редактор в одной
 * модалке (паттерн AutomationsSection/RuleEditorModal, консолидированный в один
 * файл). Спавн инстансов делает только spawn_recurring_tasks() (cron, 069) —
 * здесь только CRUD над шаблоном.
 */
export function RecurringTemplatesModal({ onClose }: RecurringTemplatesModalProps) {
  const { data: templates = [] } = useRecurringTemplates();
  const toggle = useToggleRecurringTemplate();
  const del = useDeleteRecurringTemplate();

  // null — список; 'new' — пустой редактор; шаблон — редактирование.
  const [editing, setEditing] = useState<RecurringTaskTemplate | 'new' | null>(null);

  if (editing) {
    return (
      <RecurringTemplateEditor
        template={editing === 'new' ? undefined : editing}
        onClose={() => setEditing(null)}
      />
    );
  }

  return (
    <Modal
      title="Повторяющиеся задачи"
      description="Шаблон повторения спавнит один открытый инстанс — пропущенные циклы не копятся."
      onClose={onClose}
      maxWidth="max-w-lg"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-text-dim transition-colors hover:bg-surface2"
          >
            Закрыть
          </button>
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <Plus size={14} /> Шаблон
          </button>
        </>
      }
    >
      {templates.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-mute">
          Шаблонов ещё нет. Заведи повторяющуюся задачу — например, еженедельный прозвон клиента.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center gap-2 py-2.5">
              <Repeat size={13} className="shrink-0 text-text-mute" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-text-main" title={t.text}>{t.text}</p>
                <p className="text-meta text-text-mute">{cadenceLabel(t)}</p>
              </div>

              <button
                onClick={() => toggle.mutate({ id: t.id, is_active: !t.is_active })}
                disabled={toggle.isPending}
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium transition-colors',
                  t.is_active ? 'bg-accent-l text-accent' : 'bg-surface2 text-text-mute',
                )}
                title={t.is_active ? 'Активен — нажмите, чтобы выключить' : 'Выключен — нажмите, чтобы включить'}
              >
                {t.is_active ? 'вкл' : 'выкл'}
              </button>

              <button
                onClick={() => setEditing(t)}
                className="shrink-0 p-1.5 text-text-mute transition-colors hover:text-text-main"
                aria-label="Изменить шаблон"
                title="Изменить"
              >
                <Pencil size={13} />
              </button>

              <button
                onClick={() => del.mutate(t.id)}
                disabled={del.isPending}
                className="shrink-0 p-1.5 text-text-mute transition-colors hover:text-text-main"
                aria-label="Удалить шаблон"
                title="Удалить"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════
// Редактор (создание/правка) — вложенная модалка поверх списка.
// ═══════════════════════════════════════════════════════

function defaultsFor(template?: RecurringTaskTemplate): RecurringTemplateFormValues {
  if (!template) {
    return {
      text: '',
      cadence: 'daily',
      weekly_dow: null,
      monthly_dom: null,
      priority: 'normal',
      lane: 'now',
      project_id: null,
      company_id: null,
      contact_id: null,
      assigned_to: null,
      is_active: true,
    };
  }
  return {
    text: template.text,
    cadence: template.cadence,
    weekly_dow: template.weekly_dow,
    monthly_dom: template.monthly_dom,
    priority: template.priority,
    lane: template.lane === 'done' ? 'now' : template.lane,
    project_id: template.project_id,
    company_id: template.company_id,
    contact_id: template.contact_id,
    assigned_to: template.assigned_to,
    is_active: template.is_active,
  };
}

function RecurringTemplateEditor({
  template,
  onClose,
}: {
  template?: RecurringTaskTemplate;
  onClose: () => void;
}) {
  const create = useCreateRecurringTemplate();
  const update = useUpdateRecurringTemplate();
  const { data: companies } = useCompanies();
  const { data: contacts } = useContacts();
  const { data: projects } = useProjects();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<RecurringTemplateFormValues>({
    resolver: zodResolver(recurringTemplateFormSchema),
    defaultValues: defaultsFor(template),
  });

  const cadence = watch('cadence');
  const weeklyDow = watch('weekly_dow');
  const priority = watch('priority');

  const pending = create.isPending || update.isPending;

  function onSubmit(values: RecurringTemplateFormValues) {
    // next_run_date всегда пересчитывается от сегодня (MSK) — правка каденса
    // не должна оставлять устаревший якорь расписания.
    const next_run_date = computeInitialNextRunDate(values.cadence, values.weekly_dow, values.monthly_dom);
    const payload = { ...values, next_run_date };

    if (template) {
      update.mutate({ id: template.id, ...payload }, { onSuccess: onClose });
    } else {
      create.mutate(payload, { onSuccess: onClose });
    }
  }

  return (
    <Modal
      title={template ? 'Изменить шаблон' : 'Новый шаблон повторения'}
      onClose={onClose}
      isDirty={isDirty}
      maxWidth="max-w-md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-text-dim transition-colors hover:bg-surface2"
          >
            Отмена
          </button>
          <button
            type="submit"
            form="recurring-template-form"
            disabled={pending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {pending ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </>
      }
    >
      <form id="recurring-template-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Текст */}
        <div>
          <label className="mb-1 block text-xs font-medium text-text-dim">Задача</label>
          <textarea
            {...register('text')}
            autoFocus
            placeholder="Что нужно делать регулярно?"
            rows={2}
            className="w-full rounded-lg border border-input bg-surface2 px-3 py-2 text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none"
            style={{ minHeight: '60px', resize: 'vertical' }}
          />
          {errors.text && <p className="mt-1 text-xs text-red">{errors.text.message}</p>}
        </div>

        {/* Каденс */}
        <div>
          <label className="mb-1 block text-xs font-medium text-text-dim">Повторять</label>
          <div className="grid grid-cols-2 gap-2">
            {recurringCadences.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setValue('cadence', c, { shouldDirty: true })}
                className={cn(
                  'rounded-lg border px-3 py-2 text-xs font-medium transition-all',
                  cadence === c
                    ? 'border-accent bg-accent-l text-accent'
                    : 'border-border text-text-dim hover:border-accent/30',
                )}
              >
                {CADENCE_CONFIG[c].label}
              </button>
            ))}
          </div>
        </div>

        {/* День недели (weekly) */}
        {cadence === 'weekly' && (
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">День недели</label>
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAY_LABELS.map((label, dow) => (
                <button
                  key={dow}
                  type="button"
                  onClick={() => setValue('weekly_dow', dow, { shouldDirty: true })}
                  className={cn(
                    'rounded-lg border px-1 py-2 text-xs font-medium transition-all',
                    weeklyDow === dow
                      ? 'border-accent bg-accent-l text-accent'
                      : 'border-border text-text-dim hover:border-accent/30',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {errors.weekly_dow && <p className="mt-1 text-xs text-red">{errors.weekly_dow.message}</p>}
          </div>
        )}

        {/* Число месяца (monthly) */}
        {cadence === 'monthly' && (
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">Число месяца</label>
            <input
              type="number"
              min={1}
              max={28}
              {...register('monthly_dom', { setValueAs: (v) => (v === '' ? null : Number(v)) })}
              placeholder="1–28"
              className="w-full rounded-lg border border-input bg-surface2 px-3 py-2 text-sm text-text-main tabular-nums placeholder:text-text-mute focus:border-accent focus:outline-none"
            />
            <p className="mt-1 text-meta text-text-mute">Кап 28 — безопасно для любого месяца.</p>
            {errors.monthly_dom && <p className="mt-1 text-xs text-red">{errors.monthly_dom.message}</p>}
          </div>
        )}

        {/* Приоритет */}
        <div>
          <label className="mb-1 block text-xs font-medium text-text-dim">Приоритет</label>
          <div className="flex gap-2">
            {taskPriorities.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setValue('priority', p, { shouldDirty: true })}
                className={cn(
                  'flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-all',
                  priority === p
                    ? 'border-accent bg-accent-l text-accent'
                    : 'border-border text-text-dim hover:border-accent/30',
                )}
              >
                {PRIORITY_CONFIG[p].label}
              </button>
            ))}
          </div>
        </div>

        {/* Проект */}
        <div>
          <label className="mb-1 block text-xs font-medium text-text-dim">Проект</label>
          <select
            {...register('project_id', { setValueAs: (v) => (v === '' ? null : v) })}
            className="w-full rounded-lg border border-input bg-surface2 px-3 py-2 text-sm text-text-main focus:border-accent focus:outline-none"
          >
            <option value="">— не указан —</option>
            {(projects ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {/* Компания + Контакт */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">Компания</label>
            <select
              {...register('company_id', { setValueAs: (v) => (v === '' ? null : v) })}
              className="w-full rounded-lg border border-input bg-surface2 px-3 py-2 text-sm text-text-main focus:border-accent focus:outline-none"
            >
              <option value="">— не указана —</option>
              {(companies ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">Контакт</label>
            <select
              {...register('contact_id', { setValueAs: (v) => (v === '' ? null : v) })}
              className="w-full rounded-lg border border-input bg-surface2 px-3 py-2 text-sm text-text-main focus:border-accent focus:outline-none"
            >
              <option value="">— не указан —</option>
              {(contacts ?? []).map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
            </select>
          </div>
        </div>

        {/* Исполнитель */}
        <AssigneeSelect
          label="Исполнитель"
          value={watch('assigned_to')}
          onChange={(v) => setValue('assigned_to', v, { shouldDirty: true })}
        />
      </form>
    </Modal>
  );
}
