'use client';

import { useEffect, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import {
  projectFormSchema,
  dealStages,
  STAGE_CONFIG,
  LOSS_REASON_CONFIG,
  lossReasons,
  parseBudgetInput,
  formatBudget,
  type ProjectFormValues,
  type DealStage,
} from '@/lib/validators/project';
import {
  useCreateProject,
  useUpdateProject,
  type Project,
} from '@/lib/hooks/use-projects';
import { useCompanies } from '@/lib/hooks/use-companies';
import { useContacts } from '@/lib/hooks/use-contacts';
import { Combobox, type ComboboxOption } from '@/components/shared/Combobox';

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  editProject: Project | null;
  defaultCompanyId?: string | null;
}

export function ProjectModal({ isOpen, onClose, editProject, defaultCompanyId }: ProjectModalProps) {
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const { data: companies = [] } = useCompanies();
  const { data: contacts = [] } = useContacts();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      name: '',
      stage: 'new_lead',
      company_id: null,
      contact_id: null,
      budget: null,
      deadline: null,
      next_step: null,
      loss_reason: null,
      loss_detail: null,
    },
  });

  const currentStage = watch('stage');
  const isLost = currentStage === 'lost';
  const selectedCompanyId = watch('company_id');

  const companyOptions: ComboboxOption[] = useMemo(
    () => companies.map((c) => ({ value: c.id, label: c.name, sub: c.inn ?? undefined })),
    [companies],
  );

  // Контакты, привязанные к выбранной компании (или все, если компания не выбрана)
  const contactOptions: ComboboxOption[] = useMemo(() => {
    const list = selectedCompanyId
      ? contacts.filter((c) =>
          c.companies?.some((cc) => cc.company_id === selectedCompanyId),
        )
      : contacts;
    return list.map((c) => ({
      value: c.id,
      label: [c.last_name, c.first_name].filter(Boolean).join(' '),
      sub: c.position ?? undefined,
    }));
  }, [contacts, selectedCompanyId]);

  // Заполнить форму при редактировании
  useEffect(() => {
    if (editProject) {
      reset({
        name: editProject.name,
        stage: editProject.stage,
        company_id: editProject.company_id,
        contact_id: editProject.contact_id,
        budget: editProject.budget,
        deadline: editProject.deadline,
        next_step: editProject.next_step,
        loss_reason: editProject.loss_reason,
        loss_detail: editProject.loss_detail,
      });
    } else {
      reset({
        name: '',
        stage: 'new_lead',
        company_id: defaultCompanyId ?? null,
        contact_id: null,
        budget: null,
        deadline: null,
        next_step: null,
        loss_reason: null,
        loss_detail: null,
      });
    }
  }, [editProject, defaultCompanyId, reset]);

  const onSubmit = async (values: ProjectFormValues) => {
    try {
      if (editProject) {
        await updateProject.mutateAsync({ id: editProject.id, ...values });
      } else {
        await createProject.mutateAsync(values);
      }
      onClose();
    } catch (err) {
      console.error('Project save error:', err);
    }
  };

  if (!isOpen) return null;

  // Фильтруем стадии: won/lost только при редактировании
  const availableStages = editProject
    ? dealStages
    : dealStages.filter((s) => s !== 'won' && s !== 'lost');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 elevation-3 ring-1 ring-border"
        role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-main">
            {editProject ? 'Редактировать проект' : 'Новый проект'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="rounded-lg p-1 text-text-mute transition-colors hover:bg-surface-hover"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Name */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">
              Название проекта *
            </label>
            <input
              {...register('name')}
              autoFocus
              placeholder="Поставка оборудования для ООО «Рога»"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2
                         text-sm text-text-main placeholder:text-text-mute
                         focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red">{errors.name.message}</p>
            )}
          </div>

          {/* Stage */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">
              Стадия
            </label>
            <select
              {...register('stage')}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2
                         text-sm text-text-main
                         focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {availableStages.map((s) => (
                <option key={s} value={s}>
                  {STAGE_CONFIG[s].label} ({STAGE_CONFIG[s].probability}%)
                </option>
              ))}
            </select>
          </div>

          {/* Budget — ввод в рублях, хранение в копейках */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">
              Бюджет (₽)
            </label>
            <Controller
              name="budget"
              control={control}
              render={({ field }) => (
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="150000"
                  defaultValue={
                    field.value != null ? (field.value / 100).toString() : ''
                  }
                  onChange={(e) => {
                    field.onChange(parseBudgetInput(e.target.value));
                  }}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2
                             text-sm text-text-main placeholder:text-text-mute
                             focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              )}
            />
            {watch('budget') != null && (
              <p className="mt-0.5 text-[10px] text-text-mute">
                = {formatBudget(watch('budget'))}
              </p>
            )}
          </div>

          {/* Deadline */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">
              Дедлайн
            </label>
            <input
              {...register('deadline')}
              type="date"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2
                         text-sm text-text-main
                         focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Next Step */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">
              Следующий шаг
            </label>
            <input
              {...register('next_step')}
              placeholder="Отправить КП до пятницы"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2
                         text-sm text-text-main placeholder:text-text-mute
                         focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Loss reason — только для стадии 'lost' */}
          {isLost && (
            <div className="space-y-3 rounded-lg border border-red/30 bg-red/5 p-3">
              <h3 className="text-xs font-semibold text-red">Причина проигрыша</h3>
              <div>
                <select
                  {...register('loss_reason')}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2
                             text-sm text-text-main
                             focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="">Выбери причину...</option>
                  {lossReasons.map((r) => (
                    <option key={r} value={r}>
                      {LOSS_REASON_CONFIG[r].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <textarea
                  {...register('loss_detail')}
                  placeholder="Подробности..."
                  rows={2}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2
                             text-sm text-text-main placeholder:text-text-mute
                             focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>
          )}

          {/* Section divider */}
          <div className="modal-section-divider"><span>Связи</span></div>

          {/* Company */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">
              Компания
            </label>
            <Controller
              name="company_id"
              control={control}
              render={({ field }) => (
                <Combobox
                  options={companyOptions}
                  value={field.value}
                  onChange={(val) => {
                    field.onChange(val);
                    // Сбросить контакт при смене компании
                    if (val !== field.value) setValue('contact_id', null);
                  }}
                  placeholder="Выбрать компанию..."
                />
              )}
            />
          </div>

          {/* Contact */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">
              Контактное лицо
            </label>
            <Controller
              name="contact_id"
              control={control}
              render={({ field }) => (
                <Combobox
                  options={contactOptions}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder={
                    selectedCompanyId
                      ? 'Выбрать контакт...'
                      : 'Сначала выберите компанию'
                  }
                  disabled={!selectedCompanyId && contactOptions.length === 0}
                />
              )}
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm
                         text-text-dim transition-colors hover:bg-surface-hover"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium
                         text-white transition-opacity hover:opacity-90
                         disabled:opacity-50"
            >
              {isSubmitting
                ? 'Сохраняю...'
                : editProject
                  ? 'Сохранить'
                  : 'Создать проект'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
