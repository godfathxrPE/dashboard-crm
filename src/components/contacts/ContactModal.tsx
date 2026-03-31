'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { contactFormSchema, type ContactFormValues } from '@/lib/validators/contact';
import { useCreateContact, useUpdateContact, type Contact } from '@/lib/hooks/use-contacts';

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  editContact: Contact | null;
}

export function ContactModal({ isOpen, onClose, editContact }: ContactModalProps) {
  const create = useCreateContact();
  const update = useUpdateContact();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
  });

  useEffect(() => {
    if (editContact) {
      reset({
        first_name: editContact.first_name,
        last_name: editContact.last_name,
        email: editContact.email,
        phone: editContact.phone,
        position: editContact.position,
        notes: editContact.notes,
      });
    } else {
      reset({ first_name: '', last_name: '', email: null, phone: null, position: null, notes: null });
    }
  }, [editContact, reset]);

  const onSubmit = async (values: ContactFormValues) => {
    try {
      if (editContact) {
        await update.mutateAsync({ id: editContact.id, ...values });
      } else {
        await create.mutateAsync(values);
      }
      onClose();
    } catch (err) {
      console.error('Contact save error:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-2xl ring-1 ring-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-main">
            {editContact ? 'Редактировать контакт' : 'Новый контакт'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 text-text-mute transition-colors hover:bg-surface-hover">
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

          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">Заметки</label>
            <textarea {...register('notes')} rows={2} placeholder="Дополнительная информация..."
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
          </div>

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
