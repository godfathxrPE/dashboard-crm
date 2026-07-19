'use client';

import { useFormContext, useWatch } from 'react-hook-form';
import { Trash2 } from 'lucide-react';
import {
  AUTOMATION_OP_OPTIONS,
  AUTOMATION_NULLARY_OPS,
} from '@/lib/constants/automation';
import type { RuleFormValues } from '@/lib/validators/automation-rule';

const selectCls =
  'rounded-md border border-input bg-surface px-2 py-1.5 text-xs text-text-dim';
const inputCls =
  'min-w-0 flex-1 rounded-md border border-input bg-surface px-2 py-1.5 text-xs text-text-main placeholder:text-text-mute';

/**
 * Строка условия (AND-предикат). Выделена по правилу DS «3+ повторов».
 * Регистрируется в общей RHF-форме через useFormContext по
 * `conditions.${index}.field|op|value`. value-input скрыт для is_null/not_null.
 * fieldOptions — trigger-aware (проектные поля / поля задачи), прокидывает модалка.
 */
export function ConditionRow({
  index,
  onRemove,
  fieldOptions,
}: {
  index: number;
  onRemove: () => void;
  fieldOptions: { value: string; label: string }[];
}) {
  const { register, control } = useFormContext<RuleFormValues>();
  const op = useWatch({ control, name: `conditions.${index}.op` });
  const nullary = op ? AUTOMATION_NULLARY_OPS.includes(op) : false;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select {...register(`conditions.${index}.field`)} className={selectCls} aria-label="Поле условия">
        {fieldOptions.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <select {...register(`conditions.${index}.op`)} className={selectCls} aria-label="Оператор">
        {AUTOMATION_OP_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {!nullary && (
        <input
          type="text"
          {...register(`conditions.${index}.value`)}
          placeholder="значение"
          className={inputCls}
          aria-label="Значение условия"
        />
      )}

      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 p-1.5 text-text-mute transition-colors hover:text-text-main"
        aria-label="Удалить условие"
        title="Удалить условие"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}
