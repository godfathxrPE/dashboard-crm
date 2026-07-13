'use client';

import {
  useFieldArray,
  type Control,
  type UseFormRegister,
  type UseFormWatch,
  type UseFormSetValue,
  type FieldValues,
  type Path,
  type ArrayPath,
} from 'react-hook-form';
import { Plus, X, Star } from 'lucide-react';
import type { PhoneType } from '@/types/database';
import { PHONE_TYPE_LABEL } from '@/lib/validators/phone';

// Мультителефон (Sprint UI-D1, 041). Строка = [тип] + [номер] + [основной] + [×].
// Форма-агностична: работает с любой RHF-формой, где есть поле
// `phones: PhoneEntry[]` (contact/company). is_primary управляется radio-ом
// (ровно один основной), нормализация массива/зеркало в legacy `phone` — на submit.
//
// Номер намеренно НЕ нормализуется деструктивно на blur: normalizePhone() —
// helper сравнения (цифры-only), а не форматтер; он бы стёр «+7 (999)…».
// Дедуп по телефону нормализует при сравнении, поэтому хранить можно как введено.

interface PhoneFieldsProps<T extends FieldValues> {
  control: Control<T>;
  register: UseFormRegister<T>;
  watch: UseFormWatch<T>;
  setValue: UseFormSetValue<T>;
  /** Тип по умолчанию для новой строки (контакт → mobile, компания → work). */
  defaultType?: PhoneType;
  label?: string;
}

const TYPE_OPTIONS: PhoneType[] = ['mobile', 'work', 'other'];

export function PhoneFields<T extends FieldValues>({
  control,
  register,
  watch,
  setValue,
  defaultType = 'mobile',
  label = 'Телефоны',
}: PhoneFieldsProps<T>) {
  const name = 'phones' as ArrayPath<T>;
  const { fields, append, remove } = useFieldArray({ control, name });

  const path = (i: number, key: 'type' | 'value' | 'is_primary') =>
    `phones.${i}.${key}` as Path<T>;

  // Ровно один основной: пометить i, снять с остальных.
  function setPrimary(i: number) {
    fields.forEach((_, idx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setValue(path(idx, 'is_primary'), (idx === i) as any, { shouldDirty: true });
    });
  }

  function addRow() {
    const isFirst = fields.length === 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    append({ type: defaultType, value: '', is_primary: isFirst } as any);
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="block text-xs font-medium text-text-dim">{label}</label>
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-accent transition-colors hover:bg-accent-l"
        >
          <Plus size={12} /> Телефон
        </button>
      </div>

      {fields.length === 0 ? (
        <p className="text-xs text-text-mute italic">Нет телефонов</p>
      ) : (
        <div className="space-y-2">
          {fields.map((field, i) => {
            const isPrimary = !!watch(path(i, 'is_primary'));
            return (
              <div key={field.id} className="flex items-center gap-1.5">
                <select
                  {...register(path(i, 'type'))}
                  className="shrink-0 rounded-lg border border-input bg-surface px-2 py-2 text-xs text-text-main focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>{PHONE_TYPE_LABEL[t]}</option>
                  ))}
                </select>
                <input
                  {...register(path(i, 'value'))}
                  placeholder="+7 (999) 123-45-67"
                  className="min-w-0 flex-1 rounded-lg border border-input bg-surface px-3 py-2 text-sm text-text-main placeholder:text-text-mute focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
                <button
                  type="button"
                  onClick={() => setPrimary(i)}
                  title={isPrimary ? 'Основной телефон' : 'Сделать основным'}
                  aria-pressed={isPrimary}
                  className={`shrink-0 rounded-lg border p-2 transition-colors ${
                    isPrimary
                      ? 'border-accent text-accent'
                      : 'border-input text-text-mute hover:text-text-main'
                  }`}
                >
                  <Star size={14} fill={isPrimary ? 'currentColor' : 'none'} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  title="Удалить телефон"
                  className="shrink-0 rounded-lg border border-input p-2 text-text-mute transition-colors hover:border-red/40 hover:text-red"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
