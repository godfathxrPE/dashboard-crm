'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X, ArrowRight } from 'lucide-react';
import {
  leadConversionSchema,
  type LeadConversionFormData,
} from '@/lib/validators/lead';
import { useConvertLead } from '@/lib/hooks/use-leads';
import { parseBudgetInput, formatBudget } from '@/lib/validators/project';
import type { Lead } from '@/types/database';

interface LeadConversionModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead;
}

export function LeadConversionModal({ isOpen, onClose, lead }: LeadConversionModalProps) {
  const router = useRouter();
  const convertLead = useConvertLead();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LeadConversionFormData>({
    resolver: zodResolver(leadConversionSchema),
    defaultValues: {
      company_name: '',
      contact_first_name: '',
      contact_last_name: null,
      contact_phone: null,
      contact_email: null,
      direction: 'iiot',
      deal_title: null,
      deal_amount: null,
    },
  });

  // Pre-fill from lead data
  useEffect(() => {
    if (!lead) return;

    // Split contact_name_raw into first + last name
    const nameParts = (lead.contact_name_raw ?? '').trim().split(/\s+/);
    const firstName = nameParts[0] ?? '';
    const lastName = nameParts.slice(1).join(' ') || null;

    reset({
      company_name: lead.company_name_raw ?? '',
      contact_first_name: firstName,
      contact_last_name: lastName,
      contact_phone: lead.phone,
      contact_email: lead.email,
      direction: lead.direction ?? 'iiot',
      deal_title: lead.title,
      deal_amount: null,
    });
  }, [lead, reset]);

  const onSubmit = async (values: LeadConversionFormData) => {
    try {
      const result = await convertLead.mutateAsync({
        leadId: lead.id,
        companyName: values.company_name,
        contactFirstName: values.contact_first_name,
        contactLastName: values.contact_last_name ?? undefined,
        contactPhone: values.contact_phone ?? undefined,
        contactEmail: values.contact_email ?? undefined,
        direction: values.direction,
        dealTitle: values.deal_title ?? undefined,
        dealAmount: values.deal_amount ?? undefined,
      });
      onClose();
      router.push(`/projects/${result.deal_id}`);
    } catch (err) {
      console.error('Lead conversion error:', err);
    }
  };

  if (!isOpen) return null;

  const currentDirection = watch('direction');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 elevation-3 ring-1 ring-border"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-text-main">
              Конвертировать лид
            </h2>
            <p className="mt-0.5 text-xs text-text-mute">
              Будут созданы: Компания + Контакт + Сделка
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="rounded-lg p-1 text-text-mute transition-colors hover:bg-surface2"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Direction */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">
              Направление *
            </label>
            <div className="flex rounded-lg border border-border p-1">
              {([
                { value: 'iiot' as const, label: 'IIoT / Маркировка' },
                { value: 'erp' as const, label: 'ERP' },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setValue('direction', opt.value)}
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

          {/* Section: Company */}
          <div className="modal-section-divider"><span>Компания</span></div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">
              Название компании *
            </label>
            <input
              {...register('company_name')}
              placeholder="ООО «Коралл»"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2
                         text-sm text-text-main placeholder:text-text-mute
                         focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {errors.company_name && (
              <p className="mt-1 text-xs text-red">{errors.company_name.message}</p>
            )}
          </div>

          {/* Section: Contact */}
          <div className="modal-section-divider"><span>Контакт</span></div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-dim">
                Имя *
              </label>
              <input
                {...register('contact_first_name')}
                placeholder="Иван"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2
                           text-sm text-text-main placeholder:text-text-mute
                           focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              {errors.contact_first_name && (
                <p className="mt-1 text-xs text-red">{errors.contact_first_name.message}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-dim">
                Фамилия
              </label>
              <input
                {...register('contact_last_name')}
                placeholder="Петров"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2
                           text-sm text-text-main placeholder:text-text-mute
                           focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-dim">
                Телефон
              </label>
              <input
                {...register('contact_phone')}
                type="tel"
                placeholder="+7 (999) 123-45-67"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2
                           text-sm text-text-main placeholder:text-text-mute
                           focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-dim">
                Email
              </label>
              <input
                {...register('contact_email')}
                type="email"
                placeholder="ivan@corall.ru"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2
                           text-sm text-text-main placeholder:text-text-mute
                           focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>

          {/* Section: Deal */}
          <div className="modal-section-divider"><span>Сделка</span></div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">
              Название сделки
            </label>
            <input
              {...register('deal_title')}
              placeholder={lead.title}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2
                         text-sm text-text-main placeholder:text-text-mute
                         focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">
              Бюджет (₽)
            </label>
            <Controller
              name="deal_amount"
              control={control}
              render={({ field }) => (
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="150000"
                  defaultValue=""
                  onChange={(e) => {
                    field.onChange(parseBudgetInput(e.target.value));
                  }}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2
                             text-sm text-text-main placeholder:text-text-mute
                             focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              )}
            />
            {watch('deal_amount') != null && (
              <p className="mt-0.5 text-[10px] text-text-mute">
                = {formatBudget(watch('deal_amount'))}
              </p>
            )}
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
              className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium
                         text-white transition-opacity hover:opacity-90
                         disabled:opacity-50"
            >
              {isSubmitting ? (
                'Конвертирую...'
              ) : (
                <>
                  Конвертировать
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
