'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { meetingFormSchema, type MeetingFormValues } from '@/lib/validators/meeting';
import { useCreateMeeting, useUpdateMeeting, type Meeting } from '@/lib/hooks/use-meetings';
import { useProjects } from '@/lib/hooks/use-projects';
import { useCompanies } from '@/lib/hooks/use-companies';
import { useContacts } from '@/lib/hooks/use-contacts';
import { localDateKey } from '@/lib/utils/date-helpers';
import { Combobox, type ComboboxOption } from '@/components/shared/Combobox';
import { deriveFromContact } from '@/lib/forms/derive-links';

interface MeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  editMeeting: Meeting | null;
  defaultProjectId?: string | null;
  defaultContactId?: string | null;
  defaultCompanyId?: string | null;
  /** Préfill даты при создании (напр. из календаря), YYYY-MM-DD */
  defaultDate?: string | null;
  /** Колбэк после сохранения — для toast «создать задачу?» (как у звонков) */
  onSaved?: (values: { next_step?: string | null; project_id?: string | null }) => void;
}

export function MeetingModal({ isOpen, onClose, editMeeting, defaultProjectId, defaultContactId, defaultCompanyId, defaultDate, onSaved }: MeetingModalProps) {
  const create = useCreateMeeting();
  const update = useUpdateMeeting();
  const { data: projects } = useProjects();
  const { data: companies } = useCompanies();
  const { data: contacts } = useContacts();

  const { register, handleSubmit, reset, control, setValue, getValues, formState: { errors, isSubmitting } } = useForm<MeetingFormValues>({
    resolver: zodResolver(meetingFormSchema),
  });

  const projectOptions: ComboboxOption[] = useMemo(
    () => (projects ?? []).filter((p) => p.status !== 'won' && p.status !== 'lost').map((p) => ({ value: p.id, label: p.name })),
    [projects],
  );
  const companyOptions: ComboboxOption[] = useMemo(
    () => (companies ?? []).map((c) => ({ value: c.id, label: c.name, sub: c.inn ?? undefined })),
    [companies],
  );
  const contactOptions: ComboboxOption[] = useMemo(
    () => (contacts ?? []).map((c) => ({
      value: c.id,
      label: [c.first_name, c.last_name].filter(Boolean).join(' '),
      sub: c.phone ?? c.companies?.[0]?.company.name ?? undefined,
    })),
    [contacts],
  );

  // Автоподстановка связей (компания/проект) из контакта — только пустые поля,
  // не перетирая ручной выбор/явные defaults. Общая логика для onChange и open.
  // Предикат активного проекта по умолчанию (не won/lost по legacy-стадии) совпадает
  // с фильтром projectOptions выше, поэтому не передаём его явно.
  const applyDerived = (contactId: string | null | undefined) => {
    const derived = deriveFromContact(contactId, { contacts, projects });
    if (derived.company_id && !getValues('company_id')) setValue('company_id', derived.company_id, { shouldDirty: true });
    if (derived.project_id && !getValues('project_id')) setValue('project_id', derived.project_id, { shouldDirty: true });
  };

  // Ручной выбор контакта (не на reset — onChange зовётся только пользователем).
  const handleContactChange = (val: string | null, onChange: (v: string | null) => void) => {
    onChange(val);
    if (val) applyDerived(val);
  };

  useEffect(() => {
    if (editMeeting) {
      reset({
        title: editMeeting.title,
        date: editMeeting.date,
        time: editMeeting.time,
        location: editMeeting.location,
        project_id: editMeeting.project_id,
        company_id: editMeeting.company_id,
        contact_id: editMeeting.contact_id,
        notes: editMeeting.notes,
        next_step: editMeeting.next_step,
      });
    } else {
      const now = new Date();
      const mins = Math.round(now.getMinutes() / 5) * 5;
      const defaultTime = `${String(now.getHours()).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
      reset({
        title: '', date: defaultDate ?? localDateKey(now),
        time: defaultTime, location: null, project_id: defaultProjectId ?? null,
        company_id: defaultCompanyId ?? null, contact_id: defaultContactId ?? null, notes: null,
        next_step: null,
      });
    }
  }, [editMeeting, defaultProjectId, defaultContactId, defaultCompanyId, defaultDate, reset]);

  // Автоподстановка при ОТКРЫТИИ модалки с контактом (defaultContactId → reset,
  // а reset onChange не триггерит). Только режим создания; один раз на открытие;
  // ждём загрузки contacts/projects. applyDerived сам щадит непустые поля, поэтому
  // явные defaultCompanyId/defaultProjectId не перетираются. Стоит ПОСЛЕ reset-эффекта,
  // чтобы contact_id уже был проставлен.
  const derivedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isOpen || editMeeting) { derivedForRef.current = null; return; }
    const cid = getValues('contact_id');
    if (!cid || derivedForRef.current === cid) return;
    applyDerived(cid);
    derivedForRef.current = cid;
  }, [isOpen, editMeeting, contacts, projects]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = async (values: MeetingFormValues) => {
    try {
      if (editMeeting) {
        await update.mutateAsync({ id: editMeeting.id, ...values });
      } else {
        await create.mutateAsync(values);
      }
      onSaved?.({ next_step: values.next_step, project_id: values.project_id });
      onClose();
    } catch (err) {
      console.error('Meeting save error:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div data-modal-overlay className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div data-modal className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface p-6 elevation-3 ring-1 ring-border"
        role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>

        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-main">
            {editMeeting ? 'Редактировать встречу' : 'Новая встреча'}
          </h2>
          <button onClick={onClose} aria-label="Закрыть" className="rounded-lg p-1 text-text-mute hover:bg-surface-hover"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">Название *</label>
            <input {...register('title')} autoFocus placeholder="Встреча с ООО «Рога»"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
            {errors.title && <p className="mt-0.5 text-xs text-red">{errors.title.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-dim">Дата *</label>
              <input {...register('date')} type="date"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-main focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
              {errors.date && <p className="mt-0.5 text-xs text-red">{errors.date.message}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-dim">Время</label>
              <input {...register('time')} type="time"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-main focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">Место</label>
            <input {...register('location')} placeholder="Офис, Zoom, Teams..."
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">Сделка</label>
            <Controller
              name="project_id"
              control={control}
              render={({ field }) => (
                <Combobox options={projectOptions} value={field.value ?? null} onChange={field.onChange}
                  placeholder="— не указан —" />
              )}
            />
          </div>

          {/* Section divider */}
          <div className="modal-section-divider"><span>Связи</span></div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-dim">Компания</label>
              <Controller
                name="company_id"
                control={control}
                render={({ field }) => (
                  <Combobox options={companyOptions} value={field.value ?? null} onChange={field.onChange}
                    placeholder="— не указана —" />
                )}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-dim">Контакт</label>
              <Controller
                name="contact_id"
                control={control}
                render={({ field }) => (
                  <Combobox options={contactOptions} value={field.value ?? null}
                    onChange={(val) => handleContactChange(val, field.onChange)}
                    placeholder="— не указан —" />
                )}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">Заметки</label>
            <textarea {...register('notes')} rows={3} placeholder="Заметки о встрече..."
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">Следующий шаг</label>
            <input {...register('next_step')} placeholder="Отправить КП до пятницы"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm text-text-dim hover:bg-surface-hover">
              Отмена
            </button>
            <button type="submit" disabled={isSubmitting}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {isSubmitting ? 'Сохраняю...' : editMeeting ? 'Сохранить' : 'Создать'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
