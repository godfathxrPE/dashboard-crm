'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { meetingFormSchema, type MeetingFormValues } from '@/lib/validators/meeting';
import { useCreateMeeting, useUpdateMeeting, type Meeting } from '@/lib/hooks/use-meetings';
import { useProjects } from '@/lib/hooks/use-projects';
import { useCompanies } from '@/lib/hooks/use-companies';
import { useContacts } from '@/lib/hooks/use-contacts';
import { localDateKey } from '@/lib/utils/date-helpers';
import { AiSummaryPanel } from '@/components/shared/AiSummaryPanel';

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

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<MeetingFormValues>({
    resolver: zodResolver(meetingFormSchema),
  });

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
      <div data-modal className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 elevation-3 ring-1 ring-border"
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
            <label className="mb-1 block text-xs font-medium text-text-dim">Проект</label>
            <select {...register('project_id')}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-main focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent">
              <option value="">— не указан —</option>
              {(projects ?? []).filter((p) => p.stage !== 'won' && p.stage !== 'lost').map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Section divider */}
          <div className="modal-section-divider"><span>Связи</span></div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-dim">Компания</label>
              <select {...register('company_id')}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-main focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent">
                <option value="">— не указана —</option>
                {(companies ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-dim">Контакт</label>
              <select {...register('contact_id')}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-main focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent">
                <option value="">— не указан —</option>
                {(contacts ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">Заметки</label>
            <textarea {...register('notes')} rows={3} placeholder="Заметки о встрече..."
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
          </div>

          {/* AI-резюме (только в режиме редактирования — нужен id сущности) */}
          {editMeeting && (
            <AiSummaryPanel
              entityType="meeting"
              entityId={editMeeting.id}
              aiSummary={editMeeting.ai_summary}
              aiSummaryAt={editMeeting.ai_summary_at}
              hasNotes={!!watch('notes')?.trim()}
              onApplyNextStep={(step) => setValue('next_step', step, { shouldDirty: true })}
            />
          )}

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
