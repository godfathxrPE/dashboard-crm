'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight } from 'lucide-react';
import {
  leadConversionSchema,
  type LeadConversionFormData,
} from '@/lib/validators/lead';
import { useConvertLead } from '@/lib/hooks/use-leads';
import { useCompanies } from '@/lib/hooks/use-companies';
import { useContacts } from '@/lib/hooks/use-contacts';
import { parseBudgetInput, formatBudget } from '@/lib/validators/project';
import { Combobox } from '@/components/shared/Combobox';
import { Modal } from '@/components/shared/Modal';
import { normalizePhone } from '@/lib/utils/phone';
import type { Lead } from '@/types/database';

interface LeadConversionModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead;
}

export function LeadConversionModal({ isOpen, onClose, lead }: LeadConversionModalProps) {
  const router = useRouter();
  const convertLead = useConvertLead();
  const { data: companies = [] } = useCompanies();
  const { data: contacts = [] } = useContacts();

  const companyOptions = useMemo(
    () => companies.map((c) => ({ value: c.id, label: c.name })),
    [companies],
  );
  const contactOptions = useMemo(
    () => contacts.map((c) => ({
      value: c.id,
      label: `${c.first_name} ${c.last_name ?? ''}`.trim(),
      sub: c.phone ?? c.email ?? undefined,
    })),
    [contacts],
  );

  const {
    register,
    handleSubmit,
    reset,
    watch,
    control,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<LeadConversionFormData>({
    resolver: zodResolver(leadConversionSchema),
    defaultValues: {
      company_id: null,
      company_name: '',
      contact_id: null,
      contact_first_name: '',
      contact_last_name: null,
      contact_phone: null,
      contact_email: null,
      direction: 'iiot',
      deal_title: null,
      deal_amount: null,
    },
  });

  // Pre-fill from lead data + автоподбор существующих компании/контакта
  useEffect(() => {
    if (!lead) return;

    // Split contact_name_raw into first + last name
    const nameParts = (lead.contact_name_raw ?? '').trim().split(/\s+/);
    const firstName = nameParts[0] ?? '';
    const lastName = nameParts.slice(1).join(' ') || null;

    // Компания: точное совпадение имени (без регистра)
    const rawName = (lead.company_name_raw ?? '').trim().toLowerCase();
    const matchedCompany = rawName
      ? companies.find((c) => c.name.trim().toLowerCase() === rawName)
      : undefined;

    // Контакт: совпадение телефона или email
    const leadPhone = lead.phone ? normalizePhone(lead.phone) : null;
    const leadEmail = lead.email?.trim().toLowerCase() || null;
    const matchedContact = contacts.find((c) =>
      (leadPhone && c.phone && normalizePhone(c.phone) === leadPhone) ||
      (leadEmail && c.email && c.email.trim().toLowerCase() === leadEmail),
    );

    reset({
      company_id: matchedCompany?.id ?? null,
      company_name: lead.company_name_raw ?? '',
      contact_id: matchedContact?.id ?? null,
      contact_first_name: firstName,
      contact_last_name: lastName,
      contact_phone: lead.phone,
      contact_email: lead.email,
      direction: lead.direction ?? 'iiot',
      deal_title: lead.title,
      deal_amount: null,
    });
  }, [lead, reset, companies, contacts]);

  const onSubmit = async (values: LeadConversionFormData) => {
    try {
      const result = await convertLead.mutateAsync({
        leadId: lead.id,
        companyId: values.company_id ?? undefined,
        companyName: values.company_id ? undefined : values.company_name ?? undefined,
        contactId: values.contact_id ?? undefined,
        contactFirstName: values.contact_id ? undefined : values.contact_first_name ?? undefined,
        contactLastName: values.contact_last_name ?? undefined,
        contactPhone: values.contact_phone ?? undefined,
        contactEmail: values.contact_email ?? undefined,
        direction: values.direction,
        dealTitle: values.deal_title ?? undefined,
        dealAmount: values.deal_amount ?? undefined,
      });
      onClose();
      router.push(`/deals/${result.deal_id}`);
    } catch {
      // Ошибку показывает глобальный mutationCache.onError (toast). Модалку НЕ
      // закрываем — даём исправить и повторить.
    }
  };

  const selectedCompanyId = watch('company_id');
  const selectedContactId = watch('contact_id');

  if (!isOpen) return null;

  const currentDirection = watch('direction');

  return (
    <Modal
      title="Конвертировать лид"
      description={
        selectedCompanyId && selectedContactId
          ? 'Будет создана: Сделка (компания и контакт — существующие)'
          : selectedCompanyId
            ? 'Будут созданы: Контакт + Сделка'
            : selectedContactId
              ? 'Будут созданы: Компания + Сделка'
              : 'Будут созданы: Компания + Контакт + Сделка'
      }
      onClose={onClose}
      isDirty={isDirty}
      footer={
        <>
          <button type="button" onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-text-dim transition-colors hover:bg-surface2">
            Отмена
          </button>
          <button type="submit" form="lead-conversion-form" disabled={isSubmitting}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50">
            {isSubmitting ? 'Конвертирую...' : (<>Конвертировать <ArrowRight size={14} /></>)}
          </button>
        </>
      }
    >
      <form id="lead-conversion-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
              Существующая компания
            </label>
            <Controller
              name="company_id"
              control={control}
              render={({ field }) => (
                <Combobox
                  options={companyOptions}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Не выбрана — будет создана новая"
                />
              )}
            />
          </div>

          {!selectedCompanyId && (
            <div>
              <label className="mb-1 block text-xs font-medium text-text-dim">
                Название новой компании *
              </label>
              <input
                {...register('company_name')}
                placeholder="ООО «Коралл»"
                className="w-full rounded-lg border border-input bg-surface px-3 py-2
                           text-sm text-text-main placeholder:text-text-mute
                           focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              {errors.company_name && (
                <p className="mt-1 text-xs text-red">{errors.company_name.message}</p>
              )}
            </div>
          )}

          {/* Section: Contact */}
          <div className="modal-section-divider"><span>Контакт</span></div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">
              Существующий контакт
            </label>
            <Controller
              name="contact_id"
              control={control}
              render={({ field }) => (
                <Combobox
                  options={contactOptions}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Не выбран — будет создан новый"
                />
              )}
            />
          </div>

          {!selectedContactId && (<>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-dim">
                Имя *
              </label>
              <input
                {...register('contact_first_name')}
                placeholder="Иван"
                className="w-full rounded-lg border border-input bg-surface px-3 py-2
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
                className="w-full rounded-lg border border-input bg-surface px-3 py-2
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
                {...register('contact_email')}
                type="email"
                placeholder="ivan@corall.ru"
                className="w-full rounded-lg border border-input bg-surface px-3 py-2
                           text-sm text-text-main placeholder:text-text-mute
                           focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>
          </>)}

          {/* Section: Deal */}
          <div className="modal-section-divider"><span>Сделка</span></div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">
              Название сделки
            </label>
            <input
              {...register('deal_title')}
              placeholder={lead.title}
              className="w-full rounded-lg border border-input bg-surface px-3 py-2
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
                  className="w-full rounded-lg border border-input bg-surface px-3 py-2
                             text-sm text-text-main placeholder:text-text-mute
                             focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              )}
            />
            {watch('deal_amount') != null && (
              <p className="mt-0.5 text-xs text-text-mute">
                = {formatBudget(watch('deal_amount'))}
              </p>
            )}
          </div>
      </form>
    </Modal>
  );
}
