'use client';

import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  quoteFormSchema,
  quoteStatuses,
  QUOTE_STATUS_CONFIG,
  type QuoteFormValues,
} from '@/lib/validators/quote';
import { parseBudgetInput, formatBudget } from '@/lib/validators/project';
import { useCreateQuote, useUpdateQuote } from '@/lib/hooks/use-quotes';
import { Modal } from '@/components/shared/Modal';
import type { Quote } from '@/types/entities';

interface QuoteModalProps {
  dealId: string;
  editQuote: Quote | null;
  onClose: () => void;
}

const BLANK: QuoteFormValues = {
  status: 'draft',
  amount: null,
  currency: 'RUB',
  document_url: null,
  valid_until: null,
  notes: null,
};

export function QuoteModal({ dealId, editQuote, onClose }: QuoteModalProps) {
  const createQuote = useCreateQuote(dealId);
  const updateQuote = useUpdateQuote(dealId);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<QuoteFormValues>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues: BLANK,
  });

  useEffect(() => {
    if (editQuote) {
      reset({
        status: editQuote.status,
        amount: editQuote.amount,
        currency: editQuote.currency,
        document_url: editQuote.document_url,
        valid_until: editQuote.valid_until,
        notes: editQuote.notes,
      });
    } else {
      reset(BLANK);
    }
  }, [editQuote, reset]);

  const onSubmit = async (values: QuoteFormValues) => {
    try {
      if (editQuote) {
        await updateQuote.mutateAsync({ id: editQuote.id, ...values });
      } else {
        await createQuote.mutateAsync(values);
      }
      onClose();
    } catch {
      // Ошибку показывает глобальный mutationCache.onError (toast). Модалку не закрываем.
    }
  };

  return (
    <Modal
      title={editQuote ? 'Редактировать КП' : 'Новое КП'}
      onClose={onClose}
      isDirty={isDirty}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-text-dim transition-colors hover:bg-surface2"
          >
            Отмена
          </button>
          <button
            type="submit"
            form="quote-form"
            disabled={isSubmitting}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isSubmitting ? 'Сохраняю...' : editQuote ? 'Сохранить' : 'Создать КП'}
          </button>
        </>
      }
    >
      <form id="quote-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Сумма — та же единица (копейки), что бюджет сделки; ввод в рублях */}
        <div>
          <label className="mb-1 block text-xs font-medium text-text-dim">Сумма (₽)</label>
          <Controller
            name="amount"
            control={control}
            render={({ field }) => (
              <input
                type="text"
                inputMode="decimal"
                placeholder="150000"
                defaultValue={field.value != null ? (field.value / 100).toString() : ''}
                onChange={(e) => field.onChange(parseBudgetInput(e.target.value))}
                className="w-full rounded-lg border border-input bg-surface px-3 py-2
                           text-sm text-text-main placeholder:text-text-mute
                           focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            )}
          />
          {watch('amount') != null && (
            <p className="mt-0.5 text-[10px] text-text-mute tabular-nums">
              = {formatBudget(watch('amount'))}
            </p>
          )}
        </div>

        {/* Валюта — v1: RUB фиксировано (W8), поле read-only */}
        <div>
          <label className="mb-1 block text-xs font-medium text-text-dim">Валюта</label>
          <input
            {...register('currency')}
            readOnly
            className="w-full cursor-not-allowed rounded-lg border border-input bg-surface2 px-3 py-2
                       text-sm text-text-mute"
          />
        </div>

        {/* Статус */}
        <div>
          <label className="mb-1 block text-xs font-medium text-text-dim">Статус</label>
          <select
            {...register('status')}
            className="w-full rounded-lg border border-input bg-surface px-3 py-2
                       text-sm text-text-main
                       focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {quoteStatuses.map((s) => (
              <option key={s} value={s}>
                {QUOTE_STATUS_CONFIG[s].label}
              </option>
            ))}
          </select>
        </div>

        {/* Действует до */}
        <div>
          <label className="mb-1 block text-xs font-medium text-text-dim">Действует до</label>
          <input
            type="date"
            {...register('valid_until', {
              setValueAs: (v) => (v === '' || v == null ? null : v),
            })}
            className="w-full rounded-lg border border-input bg-surface px-3 py-2
                       text-sm text-text-main
                       focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        {/* Ссылка на КП */}
        <div>
          <label className="mb-1 block text-xs font-medium text-text-dim">Ссылка на КП</label>
          <input
            {...register('document_url')}
            type="url"
            placeholder="https://…"
            className="w-full rounded-lg border border-input bg-surface px-3 py-2
                       text-sm text-text-main placeholder:text-text-mute
                       focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          {errors.document_url && (
            <p className="mt-1 text-xs text-red">{errors.document_url.message}</p>
          )}
        </div>

        {/* Заметки */}
        <div>
          <label className="mb-1 block text-xs font-medium text-text-dim">Заметки</label>
          <textarea
            {...register('notes', {
              setValueAs: (v) => (v === '' || v == null ? null : v),
            })}
            rows={3}
            placeholder="Комментарий к предложению…"
            className="w-full resize-y rounded-lg border border-input bg-surface px-3 py-2
                       text-sm text-text-main placeholder:text-text-mute
                       focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </form>
    </Modal>
  );
}
