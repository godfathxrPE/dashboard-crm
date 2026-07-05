'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X, AlertTriangle } from 'lucide-react';
import { contactFormSchema, type ContactFormValues } from '@/lib/validators/contact';
import {
  useContacts,
  useCreateContact,
  useUpdateContact,
  useLinkContactCompany,
  type Contact,
} from '@/lib/hooks/use-contacts';
import { useCompanies } from '@/lib/hooks/use-companies';
import { Combobox } from '@/components/shared/Combobox';
import { AssigneeSelect } from '@/components/shared/AssigneeSelect';
import { normalizePhone } from '@/lib/utils/phone';

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  editContact: Contact | null;
  /** Préfill компании при создании (напр. из карточки компании) */
  defaultCompanyId?: string | null;
}

export function ContactModal({ isOpen, onClose, editContact, defaultCompanyId = null }: ContactModalProps) {
  const router = useRouter();
  const create = useCreateContact();
  const update = useUpdateContact();
  const linkCompany = useLinkContactCompany();
  const { data: companies = [] } = useCompanies();
  const { data: allContacts = [] } = useContacts();

  // Компания при создании (в edit-режиме связи управляются из карточки)
  const [companyId, setCompanyId] = useState<string | null>(null);

  const companyOptions = useMemo(
    () => companies.map((c) => ({ value: c.id, label: c.name })),
    [companies],
  );

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
  });

  useEffect(() => {
    setCompanyId(editContact ? null : defaultCompanyId);
    if (editContact) {
      reset({
        first_name: editContact.first_name,
        last_name: editContact.last_name,
        email: editContact.email,
        phone: editContact.phone,
        position: editContact.position,
        notes: editContact.notes,
        owner_id: editContact.owner_id ?? null,
      });
    } else {
      reset({ first_name: '', last_name: '', email: null, phone: null, position: null, notes: null, owner_id: null });
    }
  }, [editContact, reset, isOpen, defaultCompanyId]);

  // Ненавязчивая проверка дублей: телефон (нормализованный) или email
  const phoneVal = watch('phone');
  const emailVal = watch('email');
  const duplicate = useMemo(() => {
    const ph = phoneVal ? normalizePhone(phoneVal) : null;
    const em = emailVal?.trim().toLowerCase() || null;
    if ((!ph || ph.length < 10) && !em) return null;
    return allContacts.find((c) =>
      c.id !== editContact?.id && (
        (ph && ph.length >= 10 && c.phone && normalizePhone(c.phone) === ph) ||
        (em && c.email && c.email.trim().toLowerCase() === em)
      ),
    ) ?? null;
  }, [phoneVal, emailVal, allContacts, editContact]);

  const onSubmit = async (values: ContactFormValues) => {
    try {
      if (editContact) {
        await update.mutateAsync({ id: editContact.id, ...values });
      } else {
        const created = await create.mutateAsync(values);
        if (companyId) {
          await linkCompany.mutateAsync({ contact_id: created.id, company_id: companyId });
        }
      }
      onClose();
    } catch (err) {
      console.error('Contact save error:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div data-modal-overlay className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        data-modal
        className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 elevation-3 ring-1 ring-border"
        role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-main">
            {editContact ? 'Редактировать контакт' : 'Новый контакт'}
          </h2>
          <button onClick={onClose} aria-label="Закрыть" className="rounded-lg p-1 text-text-mute transition-colors hover:bg-surface-hover">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-dim">Имя *</label>
              <input {...register('first_name')} autoFocus placeholder="Иван"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
              {errors.first_name && <p className="mt-0.5 text-xs text-red">{errors.first_name.message}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-dim">Фамилия *</label>
              <input {...register('last_name')} placeholder="Петров"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
              {errors.last_name && <p className="mt-0.5 text-xs text-red">{errors.last_name.message}</p>}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">Должность</label>
            <input {...register('position')} placeholder="Генеральный директор"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
          </div>

          {/* Компания — только при создании; в edit связи управляются из карточки */}
          {!editContact && (
            <div>
              <label className="mb-1 block text-xs font-medium text-text-dim">Компания</label>
              <Combobox
                options={companyOptions}
                value={companyId}
                onChange={setCompanyId}
                placeholder="Без компании"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-dim">Телефон</label>
              <input {...register('phone')} placeholder="+7 (999) 123-45-67"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-dim">Email</label>
              <input {...register('email')} type="email" placeholder="ivan@company.ru"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
              {errors.email && <p className="mt-0.5 text-xs text-red">{errors.email.message}</p>}
            </div>
          </div>

          {/* Дубль по телефону/email — предупреждение, не блокирует */}
          {duplicate && (
            <div className="flex items-center gap-2 rounded-lg border border-yellow/40 bg-yellow-l/40 px-3 py-2 text-xs">
              <AlertTriangle size={13} className="shrink-0" style={{ color: 'var(--yellow-text, var(--yellow))' }} />
              <span className="text-text-dim">
                Похоже на существующий контакт:{' '}
                <span className="font-medium text-text-main">
                  {duplicate.first_name} {duplicate.last_name}
                </span>
              </span>
              <button
                type="button"
                onClick={() => { onClose(); router.push(`/contacts/${duplicate.id}`); }}
                className="ml-auto shrink-0 text-accent hover:underline"
              >
                Открыть
              </button>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">Заметки</label>
            <textarea {...register('notes')} rows={2} placeholder="Дополнительная информация..."
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
          </div>

          {/* Owner */}
          <AssigneeSelect
            label="Ответственный"
            value={watch('owner_id') ?? null}
            onChange={(v) => setValue('owner_id', v)}
          />

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm text-text-dim transition-colors hover:bg-surface-hover">
              Отмена
            </button>
            <button type="submit" disabled={isSubmitting}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50">
              {isSubmitting ? 'Сохраняю...' : editContact ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
