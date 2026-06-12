'use client';

import { useEffect, useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import {
  projectFormSchema,
  LOSS_REASON_CONFIG,
  lossReasons,
  parseBudgetInput,
  formatBudget,
  type ProjectFormValues,
} from '@/lib/validators/project';
import {
  useCreateProject,
  useUpdateProject,
  type Project,
} from '@/lib/hooks/use-projects';
import { usePipelines, usePipelineStages } from '@/lib/hooks/use-pipelines';
import { useCompanies } from '@/lib/hooks/use-companies';
import { useContacts } from '@/lib/hooks/use-contacts';
import { Combobox, type ComboboxOption } from '@/components/shared/Combobox';
import { mapToLegacyStage } from '@/lib/utils/stage-mapping';
import type { Direction } from '@/types/database';

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
  const { data: pipelines } = usePipelines();
  const { data: allStages } = usePipelineStages();

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
      direction: 'iiot',
      pipeline_id: '',
      stage_id: '',
      company_id: null,
      contact_id: null,
      stage: null,
      budget: null,
      deadline: null,
      next_step: null,
      loss_reason: null,
      loss_detail: null,
    },
  });

  const currentDirection = watch('direction');
  const currentPipelineId = watch('pipeline_id');
  const currentStageId = watch('stage_id');
  const selectedCompanyId = watch('company_id');

  // Find the current pipeline stage to check if it's "lost"
  const currentPipelineStage = useMemo(
    () => allStages?.find((s) => s.id === currentStageId),
    [allStages, currentStageId],
  );
  const isLost = currentPipelineStage?.is_lost ?? false;

  // Stages for the currently selected pipeline
  const pipelineStages = useMemo(() => {
    if (!currentPipelineId || !allStages) return [];
    return allStages.filter((s) => s.pipeline_id === currentPipelineId);
  }, [allStages, currentPipelineId]);

  // Default pipeline for a direction
  const getDefaultPipeline = (dir: Direction) =>
    pipelines?.find((p) => p.direction === dir && p.entity_type === 'deal' && p.is_default);

  // Set initial pipeline + stage once pipelines load
  useEffect(() => {
    if (!pipelines?.length || !allStages?.length) return;
    if (editProject) return; // edit mode handled separately
    if (watch('pipeline_id')) return; // already set

    const defaultPipeline = getDefaultPipeline('iiot');
    if (defaultPipeline) {
      setValue('pipeline_id', defaultPipeline.id);
      const firstStage = allStages.find(
        (s) => s.pipeline_id === defaultPipeline.id && s.order_index === 1,
      );
      if (firstStage) setValue('stage_id', firstStage.id);
    }
  }, [pipelines, allStages]); // eslint-disable-line react-hooks/exhaustive-deps

  const companyOptions: ComboboxOption[] = useMemo(
    () => companies.map((c) => ({ value: c.id, label: c.name, sub: c.inn ?? undefined })),
    [companies],
  );

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

  // Fill form on edit
  useEffect(() => {
    if (!pipelines?.length || !allStages?.length) return;

    if (editProject) {
      reset({
        name: editProject.name,
        direction: editProject.direction ?? 'iiot',
        pipeline_id: editProject.pipeline_id,
        stage_id: editProject.stage_id,
        company_id: editProject.company_id,
        contact_id: editProject.contact_id,
        stage: editProject.stage ?? null,
        budget: editProject.budget,
        deadline: editProject.deadline,
        next_step: editProject.next_step,
        loss_reason: editProject.loss_reason,
        loss_detail: editProject.loss_detail,
      });
    } else {
      const defaultPipeline = getDefaultPipeline('iiot');
      const firstStage = defaultPipeline
        ? allStages.find((s) => s.pipeline_id === defaultPipeline.id && s.order_index === 1)
        : undefined;

      reset({
        name: '',
        direction: 'iiot',
        pipeline_id: defaultPipeline?.id ?? '',
        stage_id: firstStage?.id ?? '',
        company_id: defaultCompanyId ?? null,
        contact_id: null,
        stage: null,
        budget: null,
        deadline: null,
        next_step: null,
        loss_reason: null,
        loss_detail: null,
      });
    }
  }, [editProject, defaultCompanyId, reset, pipelines, allStages]); // eslint-disable-line react-hooks/exhaustive-deps

  const onDirectionChange = (dir: Direction) => {
    setValue('direction', dir);
    const defaultPipeline = getDefaultPipeline(dir);
    if (defaultPipeline) {
      setValue('pipeline_id', defaultPipeline.id);
      const firstStage = allStages?.find(
        (s) => s.pipeline_id === defaultPipeline.id && s.order_index === 1,
      );
      if (firstStage) setValue('stage_id', firstStage.id);
    }
  };

  const onSubmit = async (values: ProjectFormValues) => {
    // Auto-fill legacy stage from mapping
    const pStage = allStages?.find((s) => s.id === values.stage_id);
    const legacyStage = mapToLegacyStage(pStage, values.direction);
    const payload = { ...values, stage: legacyStage };

    try {
      if (editProject) {
        await updateProject.mutateAsync({ id: editProject.id, ...payload });
      } else {
        await createProject.mutateAsync(payload);
      }
      onClose();
    } catch (err) {
      console.error('Project save error:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      data-modal-overlay
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        data-modal
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
            className="rounded-lg p-1 text-text-mute transition-colors hover:bg-surface2"
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

          {/* Direction — segmented control */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">
              Направление
            </label>
            <div className="flex rounded-lg border border-border p-1">
              {([
                { value: 'iiot' as const, label: 'IIoT / Маркировка' },
                { value: 'erp' as const, label: 'ERP' },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onDirectionChange(opt.value)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    currentDirection === opt.value
                      ? 'bg-accent-l text-accent'
                      : 'text-text-mute hover:text-text-main'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Stage — dynamic from pipeline */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">
              Стадия
            </label>
            <select
              {...register('stage_id')}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2
                         text-sm text-text-main
                         focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            >
              {pipelineStages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.probability != null ? ` (${s.probability}%)` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Budget */}
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

          {/* Loss reason — only for lost stage */}
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
                         text-text-dim transition-colors hover:bg-surface2"
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
