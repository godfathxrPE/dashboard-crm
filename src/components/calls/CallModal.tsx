'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { callFormSchema, callStatuses, CALL_STATUS_CONFIG, type CallFormValues } from '@/lib/validators/call';
import { useCreateCall, useUpdateCall, type Call } from '@/lib/hooks/use-calls';
import { useCompanies } from '@/lib/hooks/use-companies';
import { useContacts } from '@/lib/hooks/use-contacts';
import { useProjects } from '@/lib/hooks/use-projects';

interface CallModalProps {
  isOpen: boolean;
  onClose: () => void;
  editCall: Call | null;
  defaultProjectId?: string | null;
}

export function CallModal({ isOpen, onClose, editCall, defaultProjectId }: CallModalProps) {
  const create = useCreateCall();
  const update = useUpdateCall();
  const { data: companies } = useCompanies();
  const { data: contacts } = useContacts();
  const { data: projects } = useProjects();

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<CallFormValues>({
    resolver: zodResolver(callFormSchema),
  });

  useEffect(() => {
    if (editCall) {
      reset({
        company_id: editCall.company_id,
        contact_id: editCall.contact_id,
        project_id: editCall.project_id,
        date: editCall.date?.slice(0, 16) ?? '',
        status: editCall.status,
        next_step: editCall.next_step,
        agreements: editCall.agreements,
        duration_s: editCall.duration_s,
      });
    } else {
      reset({
        company_id: null, contact_id: null, project_id: defaultProjectId ?? null,
        date: new Date().toISOString().slice(0, 16),
        status: 'done', next_step: null, agreements: null, duration_s: null,
      });
    }
  }, [editCall, defaultProjectId, reset]);

  const onSubmit = async (values: CallFormValues) => {
    try {
      if (editCall) {
        await update.mutateAsync({ id: editCall.id, ...values });
      } else {
        await create.mutateAsync(values);
      }
      onClose();
    } catch (err) {
      console.error('Call save error:', err);
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
            {editCall ? 'Редактировать звонок' : 'Новый звонок'}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 text-text-mute hover:bg-surface-hover"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          {/* Date + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-text-dim">Дата и время *</label>
              <input {...register('date')} type="datetime-local"
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-main focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
              {errors.date && <p className="mt-0.5 text-xs text-red">{errors.date.message}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-text-dim">Статус</label>
              <select {...register('status')}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-main focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent">
                {callStatuses.map((s) => (
                  <option key={s} value={s}>{CALL_STATUS_CONFIG[s].label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Company */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">Компания</label>
            <select {...register('company_id')}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-main focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent">
              <option value="">— не указана —</option>
              {(companies ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Contact */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">Контакт</label>
            <select {...register('contact_id')}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-main focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent">
              <option value="">— не указан —</option>
              {(contacts ?? []).map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
            </select>
          </div>

          {/* Project */}
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

          {/* Agreements */}
          <div>
            <label className="mb-1 block text-xs font-medium text-text-dim">Что обсуждали / договорённости</label>
            <textarea {...register('agreements')} rows={2} placeholder="Обсудили цены, договорились о КП..."
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent" />
          </div>

          {/* Next step */}
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
              {isSubmitting ? 'Сохраняю...' : editCall ? 'Сохранить' : 'Записать звонок'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
