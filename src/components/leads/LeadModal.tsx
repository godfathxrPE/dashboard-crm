'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  leadFormSchema,
  leadSources,
  LEAD_SOURCE_CONFIG,
  type LeadFormData,
} from '@/lib/validators/lead';
import { useCreateLead, useUpdateLead } from '@/lib/hooks/use-leads';
import { Modal } from '@/components/shared/Modal';
import type { Lead } from '@/types/database';

interface LeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  editLead: Lead | null;
}

export function LeadModal({ isOpen, onClose, editLead }: LeadModalProps) {
  const createLead = useCreateLead();
  const updateLead = useUpdateLead();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<LeadFormData>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: {
      title: '',
      source: null,
      direction: null,
      company_name_raw: null,
      contact_name_raw: null,
      phone: null,
      email: null,
      notes: null,
    },
  });

  useEffect(() => {
    if (editLead) {
      reset({
        title: editLead.title,
        source: editLead.source,
        direction: editLead.direction,
        company_name_raw: editLead.company_name_raw,
        contact_name_raw: editLead.contact_name_raw,
        phone: editLead.phone,
        email: editLead.email,
        notes: editLead.notes,
      });
    } else {
      reset({
        title: '',
        source: null,
        direction: null,
        company_name_raw: null,
        contact_name_raw: null,
        phone: null,
        email: null,
        notes: null,
      });
    }
  }, [editLead, reset]);

  const onSubmit = async (values: LeadFormData) => {
    try {
      if (editLead) {
        await updateLead.mutateAsync({ id: editLead.id, ...values });
      } else {
        await createLead.mutateAsync(values);
      }
      onClose();
    } catch {
      // Ошибку показывает глобальный mutationCache.onError (toast). Модалку НЕ
      // закрываем — даём исправить и повторить.
    }
  };

  if (!isOpen) return null;

  const currentDirection = watch('direction');

  return (
    <Modal
      title={editLead ? 'Редактировать лид' : 'Новый лид'}
      onClose={onClose}
      isDirty={isDirty}
      footer={
        <>
          <button type="button" onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-text-dim transition-colors hover:bg-surface2">
            Отмена
          </button>
          <button type="submit" form="lead-form" disabled={isSubmitting}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50">
            {isSubmitting ? 'Сохраняю...' : editLead ? 'Сохранить' : 'Создать лид'}
          </button>
        </>
      }
    >
      <form id="lead-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Title */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">
              Название *
            </label>
            <input
              {...register('title')}
              autoFocus
              placeholder="Звонок от Коралл, 12.04"
              className="w-full rounded-lg border border-input bg-surface px-3 py-2
                         text-sm text-text-main placeholder:text-text-mute
                         focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {errors.title && (
              <p className="mt-1 text-xs text-red">{errors.title.message}</p>
            )}
          </div>

          {/* Source */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">
              Источник
            </label>
            <select
              {...register('source')}
              className="w-full rounded-lg border border-input bg-surface px-3 py-2
                         text-sm text-text-main
                         focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="">Не указан</option>
              {leadSources.map((s) => (
                <option key={s} value={s}>
                  {LEAD_SOURCE_CONFIG[s].label}
                </option>
              ))}
            </select>
          </div>

          {/* Direction — segmented control with nullable */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">
              Направление
            </label>
            <div className="flex rounded-lg border border-border p-1">
              {([
                { value: null, label: 'Не определено' },
                { value: 'iiot' as const, label: 'IIoT' },
                { value: 'erp' as const, label: 'ERP' },
              ]).map((opt) => (
                <button
                  key={opt.value ?? 'null'}
                  type="button"
                  onClick={() => setValue('direction', opt.value)}
                  className={`flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
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

          {/* Company name (raw) */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">
              Компания
            </label>
            <input
              {...register('company_name_raw')}
              placeholder="ООО «Коралл»"
              className="w-full rounded-lg border border-input bg-surface px-3 py-2
                         text-sm text-text-main placeholder:text-text-mute
                         focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Contact name (raw) */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">
              Контактное лицо
            </label>
            <input
              {...register('contact_name_raw')}
              placeholder="Иван Петров"
              className="w-full rounded-lg border border-input bg-surface px-3 py-2
                         text-sm text-text-main placeholder:text-text-mute
                         focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Phone + Email row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-dim">
                Телефон
              </label>
              <input
                {...register('phone')}
                type="tel"
                placeholder="+7 (999) 123-45-67"
                className="w-full rounded-lg border border-input bg-surface px-3 py-2
                           text-sm text-text-main placeholder:text-text-mute
                           focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-dim">
                Email
              </label>
              <input
                {...register('email')}
                type="email"
                placeholder="ivan@corall.ru"
                className="w-full rounded-lg border border-input bg-surface px-3 py-2
                           text-sm text-text-main placeholder:text-text-mute
                           focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">
              Заметки
            </label>
            <textarea
              {...register('notes')}
              rows={2}
              placeholder="Контекст звонка, что обсуждали..."
              className="w-full rounded-lg border border-input bg-surface px-3 py-2
                         text-sm text-text-main placeholder:text-text-mute
                         focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
      </form>
    </Modal>
  );
}
