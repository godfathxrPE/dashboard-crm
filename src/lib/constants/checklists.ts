import type { ChecklistType } from '@/types/database';

/**
 * Sign-off чеклисты внедрения (R2-P1-G, миграции 083/084).
 *
 * Типы зеркалят CHECK обеих таблиц. `erp_stage_accept` в CHECK заведён, но шаблона под него
 * не сидируется и поэтапная приёмка ERP не делается — это P1-I (ERP parity); в селекте
 * Настроек он присутствует, чтобы шаблон можно было завести руками, не дожидаясь миграции.
 */

export const CHECKLIST_TYPE_LABEL: Record<ChecklistType, string> = {
  doc_review: 'Проверка документов',
  handover_support: 'Передача на сопровождение',
  erp_stage_accept: 'Поэтапная приёмка ERP',
  custom: 'Свой чеклист',
};

/** Порядок = порядок в селекте редактора шаблона. */
export const CHECKLIST_TYPE_OPTIONS: readonly { value: ChecklistType; label: string }[] = [
  { value: 'doc_review', label: CHECKLIST_TYPE_LABEL.doc_review },
  { value: 'handover_support', label: CHECKLIST_TYPE_LABEL.handover_support },
  { value: 'erp_stage_accept', label: CHECKLIST_TYPE_LABEL.erp_stage_accept },
  { value: 'custom', label: CHECKLIST_TYPE_LABEL.custom },
] as const;

/** Направление шаблона: null — «любое» (в БД NULL, в индексе слота — '*'). */
export const CHECKLIST_DIRECTION_OPTIONS: readonly { value: '' | 'erp' | 'iiot'; label: string }[] = [
  { value: '', label: 'Любое направление' },
  { value: 'erp', label: 'ERP' },
  { value: 'iiot', label: 'IIoT' },
] as const;

/** Вид внедрения: null — «любой». Значения — CHECK projects.delivery_kind. */
export const CHECKLIST_KIND_OPTIONS: readonly { value: '' | 'launch' | 'experiment'; label: string }[] = [
  { value: '', label: 'Любой вид' },
  { value: 'launch', label: 'Запуск' },
  { value: 'experiment', label: 'Эксперимент' },
] as const;

export function checklistTypeLabel(type: string): string {
  return CHECKLIST_TYPE_LABEL[type as ChecklistType] ?? type;
}

/**
 * slug пункта из его текста. Транслита нет намеренно: `key` — технический
 * идентификатор, по нему идёт toggle, и русские буквы в нём читаемости не добавляют.
 * Для кириллического label остаётся пустой остаток → фолбэк на `item_N` даёт вызывающий.
 */
export function slugifyChecklistKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}
