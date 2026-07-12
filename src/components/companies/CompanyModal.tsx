'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle } from 'lucide-react';
import { companyFormSchema, type CompanyFormValues } from '@/lib/validators/company';
import { useCompanies, useCreateCompany, useUpdateCompany, type Company } from '@/lib/hooks/use-companies';
import { AssigneeSelect } from '@/components/shared/AssigneeSelect';
import { Modal } from '@/components/shared/Modal';

/** Нормализация названия для сравнения: без ОПФ, кавычек и регистра */
function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[«»"'“”]/g, '')
    .replace(/\b(ооо|ао|зао|пао|оао|нао|ип)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

interface CompanyModalProps {
  isOpen: boolean;
  onClose: () => void;
  editCompany: Company | null;
}

export function CompanyModal({ isOpen, onClose, editCompany }: CompanyModalProps) {
  const router = useRouter();
  const create = useCreateCompany();
  const update = useUpdateCompany();
  const { data: allCompanies = [] } = useCompanies();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<CompanyFormValues>({
    resolver: zodResolver(companyFormSchema),
  });

  // Дубль по ИНН (точно) или названию (нормализованно) — предупреждение, не блок
  const nameVal = watch('name');
  const innVal = watch('inn');
  const duplicate = useMemo(() => {
    const inn = innVal?.trim() || null;
    const norm = nameVal ? normalizeCompanyName(nameVal) : '';
    if (!inn && norm.length < 3) return null;
    return allCompanies.find((c) =>
      c.id !== editCompany?.id && (
        (inn && c.inn && c.inn.trim() === inn) ||
        (norm.length >= 3 && normalizeCompanyName(c.name) === norm)
      ),
    ) ?? null;
  }, [nameVal, innVal, allCompanies, editCompany]);

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
        owner_id: editCompany.owner_id ?? null,
      });
    } else {
      reset({ name: '', inn: null, industry: null, website: null, phone: null, email: null, address: null, notes: null, owner_id: null });
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
    } catch {
      // Ошибку показывает глобальный mutationCache.onError (toast). Модалку НЕ
      // закрываем — даём исправить и повторить.
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
    <Modal
      title={editCompany ? 'Редактировать компанию' : 'Новая компания'}
      onClose={onClose}
      isDirty={isDirty}
      footer={
        <>
          <button type="button" onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-text-dim transition-colors hover:bg-surface-hover">
            Отмена
          </button>
          <button type="submit" form="company-form" disabled={isSubmitting}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50">
            {isSubmitting ? 'Сохраняю...' : editCompany ? 'Сохранить' : 'Создать'}
          </button>
        </>
      }
    >
      <form id="company-form" onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          {fields.map((f) => (
            <div key={f.name}>
              <label className="mb-1 block text-xs font-medium text-text-dim">{f.label}</label>
              <input
                {...register(f.name)}
                type={f.type ?? 'text'}
                placeholder={f.placeholder}
                autoFocus={f.name === 'name'}
                className="w-full rounded-lg border border-input bg-surface px-3 py-2
                           text-sm text-text-main placeholder:text-text-mute
                           focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              {errors[f.name] && <p className="mt-0.5 text-xs text-red">{errors[f.name]?.message}</p>}
            </div>
          ))}

          {/* Дубль — предупреждение, не блокирует */}
          {duplicate && (
            <div className="flex items-center gap-2 rounded-lg border border-yellow/40 bg-yellow-l/40 px-3 py-2 text-xs">
              <AlertTriangle size={13} className="shrink-0" style={{ color: 'var(--yellow-text, var(--yellow))' }} />
              <span className="text-text-dim">
                Похоже на существующую компанию:{' '}
                <span className="font-medium text-text-main">{duplicate.name}</span>
                {duplicate.inn && <span className="text-text-mute"> · ИНН {duplicate.inn}</span>}
              </span>
              <button
                type="button"
                onClick={() => { onClose(); router.push(`/companies/${duplicate.id}`); }}
                className="ml-auto shrink-0 text-accent hover:underline"
              >
                Открыть
              </button>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">Заметки</label>
            <textarea
              {...register('notes')}
              rows={2}
              placeholder="Дополнительная информация..."
              className="w-full rounded-lg border border-input bg-surface px-3 py-2
                         text-sm text-text-main placeholder:text-text-mute
                         focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {/* Owner */}
          <AssigneeSelect
            label="Ответственный"
            value={watch('owner_id') ?? null}
            onChange={(v) => setValue('owner_id', v)}
          />
      </form>
    </Modal>
  );
}
