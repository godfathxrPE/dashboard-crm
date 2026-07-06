import type { GateFieldColumn } from '@/types/database';

/**
 * Whitelist полей сделки для field-требований гейтов.
 *
 * ⚠️ ДОЛЖЕН совпадать с CASE-whitelist в `check_stage_requirements()`
 * (supabase/migrations/027_stage_gates.sql). Колонка вне списка считается
 * непройденным требованием — и в SQL, и в UI.
 */
export const GATE_FIELD_COLUMNS: { value: GateFieldColumn; label: string }[] = [
  { value: 'budget', label: 'Бюджет' },
  { value: 'company_id', label: 'Компания' },
  { value: 'contact_id', label: 'Контакт' },
  { value: 'next_step', label: 'Следующий шаг' },
  { value: 'deadline', label: 'Дедлайн' },
  { value: 'probability', label: 'Вероятность' },
  { value: 'direction', label: 'Направление' },
  { value: 'next_action_date', label: 'Дата следующего действия' },
];

export const GATE_FIELD_LABEL: Record<GateFieldColumn, string> = Object.fromEntries(
  GATE_FIELD_COLUMNS.map((c) => [c.value, c.label]),
) as Record<GateFieldColumn, string>;
