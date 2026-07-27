'use client';

import { useMemo } from 'react';
import { Controller, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form';
import { Combobox, type ComboboxOption } from '@/components/shared/Combobox';
import { useCompanies } from '@/lib/hooks/use-companies';
import { useContacts } from '@/lib/hooks/use-contacts';
import { GATE_FIELD_LABEL } from '@/lib/constants/stage-gates';
import {
  LOSS_REASON_CONFIG,
  WON_REASON_CONFIG,
  lossReasons,
  wonReasons,
} from '@/lib/validators/project';
import type { TransitionFormValues } from '@/lib/validators/stage-transition';
import type { GateFieldColumn } from '@/types/database';

/**
 * During-поля перехода: рендерятся ТОЛЬКО те требования, что реально не закрыты
 * (`requiredFields` приходит из `previewTransition`). Смысл модалки — момент решения,
 * а не вторая форма сделки: показывать закрытые требования пустыми полями значило бы
 * заставлять пользователя перевводить то, что уже введено.
 *
 * Причина исхода (won/lost) рендерится, когда целевая стадия помечена `is_won`/`is_lost`.
 */

const inputClass =
  'w-full rounded-lg border border-input bg-surface px-3 py-2 text-sm text-text-main ' +
  'placeholder:text-text-mute focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent';

function FieldShell({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-text-dim">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-red">{error}</p>}
    </div>
  );
}

export function StageTransitionFields({
  requiredFields,
  showWon,
  showLost,
  register,
  control,
  errors,
}: {
  requiredFields: GateFieldColumn[];
  showWon: boolean;
  showLost: boolean;
  register: UseFormRegister<TransitionFormValues>;
  control: Control<TransitionFormValues>;
  errors: FieldErrors<TransitionFormValues>;
}) {
  const needs = (c: GateFieldColumn) => requiredFields.includes(c);
  const { data: companies = [] } = useCompanies();
  const { data: contacts = [] } = useContacts();

  const companyOptions: ComboboxOption[] = useMemo(
    () => companies.map((c) => ({ value: c.id, label: c.name, sub: c.inn ?? undefined })),
    [companies],
  );

  // ⚠️ Контакты НЕ фильтруются по компании сделки — в отличие от ProjectModal.
  // Там фильтр помогает при создании; здесь он превращался бы в тупик: гейт требует
  // «какой-нибудь контакт», а у компании сделки связанных контактов может не быть
  // вовсе (реальный случай на смоуке — 87 контактов в org, 0 у нужной компании), и
  // закрыть требование стало бы физически нечем.
  const contactOptions: ComboboxOption[] = useMemo(
    () =>
      contacts.map((c) => ({
        value: c.id,
        label: [c.last_name, c.first_name].filter(Boolean).join(' '),
        sub: c.position ?? undefined,
      })),
    [contacts],
  );

  const hasAnyField = requiredFields.length > 0;
  if (!hasAnyField && !showWon && !showLost) return null;

  return (
    <div className="space-y-3">
      {hasAnyField && (
        <p className="text-xs text-text-mute">
          Заполните здесь — переход и поля сохранятся одним действием.
        </p>
      )}

      {needs('budget') && (
        <FieldShell label={GATE_FIELD_LABEL.budget} error={errors.budget?.message}>
          <input
            {...register('budget')}
            inputMode="decimal"
            placeholder="Например, 1 500 000"
            className={inputClass}
          />
        </FieldShell>
      )}

      {needs('company_id') && (
        <FieldShell label={GATE_FIELD_LABEL.company_id} error={errors.company_id?.message}>
          <Controller
            name="company_id"
            control={control}
            render={({ field }) => (
              <Combobox
                options={companyOptions}
                value={field.value}
                onChange={field.onChange}
                placeholder="Выбрать компанию..."
              />
            )}
          />
        </FieldShell>
      )}

      {needs('contact_id') && (
        <FieldShell label={GATE_FIELD_LABEL.contact_id} error={errors.contact_id?.message}>
          <Controller
            name="contact_id"
            control={control}
            render={({ field }) => (
              <Combobox
                options={contactOptions}
                value={field.value}
                onChange={field.onChange}
                placeholder="Выбрать контакт..."
              />
            )}
          />
        </FieldShell>
      )}

      {needs('next_step') && (
        <FieldShell label={GATE_FIELD_LABEL.next_step} error={errors.next_step?.message}>
          <input {...register('next_step')} placeholder="Что делаем дальше" className={inputClass} />
        </FieldShell>
      )}

      {/* date-инпуты: '' → null. `''::date` невалиден в Postgres — известные грабли. */}
      {needs('deadline') && (
        <FieldShell label={GATE_FIELD_LABEL.deadline} error={errors.deadline?.message}>
          <input
            type="date"
            {...register('deadline', { setValueAs: (v) => (v === '' ? null : v) })}
            className={inputClass}
          />
        </FieldShell>
      )}

      {needs('next_action_date') && (
        <FieldShell
          label={GATE_FIELD_LABEL.next_action_date}
          error={errors.next_action_date?.message}
        >
          <input
            type="date"
            {...register('next_action_date', { setValueAs: (v) => (v === '' ? null : v) })}
            className={inputClass}
          />
        </FieldShell>
      )}

      {needs('probability') && (
        <FieldShell label={GATE_FIELD_LABEL.probability} error={errors.probability?.message}>
          <input
            {...register('probability')}
            inputMode="numeric"
            placeholder="0–100"
            className={inputClass}
          />
        </FieldShell>
      )}

      {needs('direction') && (
        <FieldShell label={GATE_FIELD_LABEL.direction} error={errors.direction?.message}>
          <select
            {...register('direction', { setValueAs: (v) => (v === '' ? null : v) })}
            className={inputClass}
          >
            <option value="">Не выбрано</option>
            <option value="iiot">IIoT / Маркировка</option>
            <option value="erp">ERP</option>
          </select>
        </FieldShell>
      )}

      {showWon && (
        <FieldShell label="Причина выигрыша" error={errors.won_reason?.message}>
          <Controller
            name="won_reason"
            control={control}
            render={({ field }) => (
              <div className="flex flex-wrap gap-1.5">
                {wonReasons.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => field.onChange(r)}
                    aria-pressed={field.value === r}
                    className={`rounded border px-2 py-0.5 text-xs transition-colors ${
                      field.value === r
                        ? 'border-green bg-green-l/40 text-green'
                        : 'border-border bg-surface text-text-dim hover:border-green hover:text-green'
                    }`}
                  >
                    {WON_REASON_CONFIG[r].label}
                  </button>
                ))}
              </div>
            )}
          />
          <textarea
            {...register('won_detail')}
            rows={2}
            placeholder="Комментарий к причине (необязательно)"
            aria-label="Комментарий к причине выигрыша"
            className={`mt-2 ${inputClass}`}
          />
        </FieldShell>
      )}

      {showLost && (
        <FieldShell label="Причина проигрыша" error={errors.loss_reason?.message}>
          <Controller
            name="loss_reason"
            control={control}
            render={({ field }) => (
              <div className="flex flex-wrap gap-1.5">
                {lossReasons.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => field.onChange(r)}
                    aria-pressed={field.value === r}
                    className={`rounded border px-2 py-0.5 text-xs transition-colors ${
                      field.value === r
                        ? 'border-red bg-red-l/40 text-red'
                        : 'border-border bg-surface text-text-dim hover:border-red hover:text-red'
                    }`}
                  >
                    {LOSS_REASON_CONFIG[r].label}
                  </button>
                ))}
              </div>
            )}
          />
          <textarea
            {...register('loss_detail')}
            rows={2}
            placeholder="Комментарий к причине (необязательно)"
            aria-label="Комментарий к причине проигрыша"
            className={`mt-2 ${inputClass}`}
          />
        </FieldShell>
      )}
    </div>
  );
}
