// R2-P0-C (S-R2-SDP-1) — Smart Deal Progression: whitelist полей, которые
// AI-предложение вообще может тронуть в сделке.
//
// ⚠️ ИНВАРИАНТ I7. Этот whitelist обязан совпадать с whitelist действия `set_field`
// движка автоматизаций (`AUTOMATION_SET_FIELD_OPTIONS` + CASE в SQL
// `wf_apply_project_action`, миграция 079). Один и тот же набор полей в трёх местах:
// здесь, в `src/lib/constants/automation.ts` и в SQL. Расширяешь один — правь все три.
//
// Совпадение с клиентским списком автоматизаций держится НЕ комментарием, а типом:
// `ProgressionFieldKey = AutomationSetFieldName` + exhaustive-гард ниже. Разъедутся —
// упадёт tsc, а не прод.
//
// budget / owner_id / company_id / contact_id / status / type / org_id / stage_id —
// НИКОГДА. `stage_id` вдобавок физически отсутствует в контракте предложения.

import type { AutomationSetFieldName } from '@/types/database';

export type ProgressionFieldKey = AutomationSetFieldName;

export const PROGRESSION_FIELDS: {
  key: ProgressionFieldKey;
  label: string;
  /** Тип «текущего/предложенного» значения — как форматировать в диф-панели. */
  kind: 'text' | 'date' | 'percent';
  hint?: string;
}[] = [
  { key: 'next_step', label: 'Следующий шаг', kind: 'text' },
  { key: 'next_action_date', label: 'Дата следующего действия', kind: 'date' },
  { key: 'pinned_note', label: 'Закреплённая заметка', kind: 'text' },
  {
    key: 'probability',
    label: 'Вероятность, %',
    kind: 'percent',
    // Та же грабля, что у set_field: trg_sync_deal_stage_fields перезаписывает
    // probability значением из pipeline_stages на каждой смене стадии.
    hint: 'Перезапишется при следующей смене стадии — стадия задаёт свою вероятность.',
  },
];

/**
 * Exhaustive-гард: добавили значение в `AutomationSetFieldName` и забыли про SDP —
 * здесь будет ошибка компиляции (в объекте не хватит ключа).
 */
const PROGRESSION_FIELD_COVERAGE: Record<ProgressionFieldKey, true> = {
  next_step: true,
  next_action_date: true,
  pinned_note: true,
  probability: true,
};

export const PROGRESSION_FIELD_KEYS = Object.keys(
  PROGRESSION_FIELD_COVERAGE,
) as ProgressionFieldKey[];

export function isProgressionField(key: string): key is ProgressionFieldKey {
  return key in PROGRESSION_FIELD_COVERAGE;
}

export const PROGRESSION_CONFIDENCE_LABEL: Record<'high' | 'medium' | 'low', string> = {
  high: 'высокая уверенность',
  medium: 'средняя уверенность',
  low: 'низкая уверенность',
};

/** Максимум задач в предложении — совпадает с maxItems в tool-схеме edge. */
export const PROGRESSION_MAX_TASKS = 5;
