'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { companyFormSchema, type CompanyFormValues } from '@/lib/validators/company';
import { useCreateCompany, useUpdateCompany, type Company } from '@/lib/hooks/use-companies';

interface CompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
  editCompany: Company | null;
}

export function CompanyModal({ isOpen, onClose, editCompany }: CompanyModalProps) {
  const create = useCreateCompany();
  const update = useUpdateCompany();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CompanyFormValues>({
    resolver: zodResolver(companyFormSchema),
  });

  useEffect(() => {
    if (editCompany) {
      reset({
        name: editCompany.name,
        inn: editCompany.inn,
        industry: editCompany.industry,
        website: editCompany.website,
        phone: editCompany.phone,
        email: editCompany.email,
        address: editCompany.address,
        notes: editCompany.notes,
      });
    } else {
      reset({ name: '', inn: null, industry: null, website: null, phone: null, email: null, address: null, notes: null });
    }
  }, [editCompany, reset]);

  const onSubmit = async (values: CompanyFormValues) => {
    try {
      if (editCompany) {
        await update.mutateAsync({ id: editCompany.id, ...values });
      } else {
        await create.mutateAsync(values);
      }
      onClose();
    } catch (err) {
      console.error('Company save error:', err);
    }
  };

  if (!isOpen) return null;

  const fields: { name: keyof CompanyFormValues; label: string; placeholder: string; type?: string }[] = [
    { name: 'name', label: 'Название *', placeholder: 'ООО «Рога и Копыта»' },
    { name: 'inn', label: 'ИНН', placeholder: '7707083893' },
    { name: 'industry', label: 'Отрасль', placeholder: 'IT, Производство...' },
    { name: 'phone', label: 'Телефон', placeholder: '+7 (999) 123-45-67' },
    { name: 'email', label: 'Email', placeholder: 'info@company.ru', type: 'email' },
    { name: 'website', label: 'Сайт', placeholder: 'https://company.ru' },
    { name: 'address', label: 'Адрес', placeholder: 'Москва, ул. Примерная, 1' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-2xl ring-1 ring-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-main">
            {editCompany ? 'Редактировать компанию' : 'Новая компания'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 text-text-mute transition-colors hover:bg-surface-hover">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          {fields.map((f) => (
            <div key={f.name}>
              <label className="mb-1 block text-xs font-medium text-text-dim">{f.label}</label>
              <input
                {...register(f.name)}
                type={f.type ?? 'text'}
                placeholder={f.placeholder}
                autoFocus={f.name === 'name'}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2
                           text-sm text-text-main placeholder:text-text-mute
                           focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              {errors[f.name] && <p className="mt-0.5 text-xs text-red">{errors[f.name]?.message}</p>}
            </div>
          ))}

          {/* Notes */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">Заметки</label>
            <textarea
              {...register('notes')}
              rows={2}
              placeholder="Дополнительная информация..."
              className="w-full rounded-lg border border-border bg-surface px-3 py-2
                         text-sm text-text-main placeholder:text-text-mute
                         focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm text-text-dim transition-colors hover:bg-surface-hover">
              Отмена
            </button>
            <button type="submit" disabled={isSubmitting}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50">
              {isSubmitting ? 'Сохраняю...' : editCompany ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
