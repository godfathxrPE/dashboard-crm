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

  // S-DEAL-ORG-2 (задача 1): `rejected` НЕ предлагается в форме. Режется именно
  // здесь, при рендере списка, а НЕ в `quoteStatuses`: тип статуса остаётся полным
  // (`QUOTE_STATUS_CONFIG`, `QUOTE_STATUS_TRANSITIONS`, бейджи списка читают все
  // пять значений), а отклонение — это решение С ПРИЧИНОЙ, и у него свой поток в
  // `ActiveQuoteCard`. Ставить статус руками, минуя причину, значит нарушить CHECK
  // `quotes_rejected_needs_reason` (132) прямо в форме — 23514 без поля, куда его
  // показать.
  //
  // ⚠️ Уже отклонённое КП свой статус в списке СОХРАНЯЕТ: выбранное значение обязано
  // лежать в `options`, иначе `<select>` теряет привязку и отдаёт чужой статус первым
  // же сабмитом (тот же дефект, что чинили в FIX S-CHAT-TASK-1-BIND). Для такого КП
  // «Отклонено» означает «оставить как есть» — причина у строки уже записана.
  const statusOptions = quoteStatuses.filter(
    (s) => s !== 'rejected' || editQuote?.status === 'rejected',
  );

  const onSubmit = async (values: QuoteFormValues) => {
    try {
      if (editQuote) {
        // Выход из `rejected` уносит причину тем же апдейтом: оставшаяся на
        // черновике, она соврёт в следующей версии КП («отклонено из-за цены» под
        // статусом «Отправлено»). CHECK 132 такую строку пропускает — он требует
        // причину У ОТКЛОНЁННОГО, а не запрещает её у остальных; чистить обязан UI.
        const leavesRejected =
          editQuote.status === 'rejected' && values.status !== 'rejected';
        await updateQuote.mutateAsync({
          id: editQuote.id,
          ...values,
          ...(leavesRejected ? { rejection_reason: null } : {}),
        });
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
            <p className="mt-0.5 text-xs text-text-mute tabular-nums">
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
            {statusOptions.map((s) => (
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
