'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { meetingFormSchema, type MeetingFormValues } from '@/lib/validators/meeting';
import { useCreateMeeting, useUpdateMeeting, type Meeting } from '@/lib/hooks/use-meetings';
import { useProjects } from '@/lib/hooks/use-projects';

interface MeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  editMeeting: Meeting | null;
  defaultProjectId?: string | null;
}

export function MeetingModal({ isOpen, onClose, editMeeting, defaultProjectId }: MeetingModalProps) {
  const create = useCreateMeeting();
  const update = useUpdateMeeting();
  const { data: projects } = useProjects();

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<MeetingFormValues>({
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
        notes: editMeeting.notes,
      });
    } else {
      reset({
        title: '', date: new Date().toISOString().slice(0, 10),
        time: null, location: null, project_id: defaultProjectId ?? null, notes: null,
      });
    }
  }, [editMeeting, defaultProjectId, reset]);

  const onSubmit = async (values: MeetingFormValues) => {
    try {
      if (editMeeting) {
        await update.mutateAsync({ id: editMeeting.id, ...values });
      } else {
        await create.mutateAsync(values);
      }
      onClose();
    } catch (err) {
      console.error('Meeting save error:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl border border-border p-6 shadow-2xl ring-1 ring-black/5"
        style={{ backgroundColor: 'var(--color-surface, #fff)' }}
        onClick={(e) => e.stopPropagation()}>

        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-main">
            {editMeeting ? 'Редактировать встречу' : 'Новая встреча'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 text-text-mute hover:bg-surface-hover"><X size={18} /></button>
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

          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">Заметки</label>
            <textarea {...register('notes')} rows={3} placeholder="Повестка, результаты..."
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
