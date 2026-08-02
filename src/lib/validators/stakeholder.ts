import { z } from 'zod';
import { STAKEHOLDER_ROLES } from '@/types/database';

/**
 * S-R2-D3: валидатор строки карты стейкхолдеров (миграция 092).
 *
 * Зеркало CHECK-ограничений таблицы: `role` — закрытый словарь либо NULL,
 * `note` — до 500 символов (deal_stakeholders_note_chk).
 */

/**
 * Роль. `''` из `<select>` — это «не выбрано», а не невалидное значение: RHF/нативный
 * select не умеет отдавать `null`, поэтому пустую строку приводим к NULL до разбора.
 */
export const stakeholderRoleSchema = z.preprocess(
  (v) => (v === '' ? null : v),
  z.enum(STAKEHOLDER_ROLES).nullable(),
);

/** Заметка: пустая строка → NULL, чтобы в БД не копились '' вперемешку с NULL. */
export const stakeholderNoteSchema = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().trim().max(500, 'Заметка не длиннее 500 символов').nullable(),
);

export const stakeholderInsertSchema = z.object({
  project_id: z.string().uuid(),
  contact_id: z.string().uuid(),
  role: stakeholderRoleSchema.default(null),
  note: stakeholderNoteSchema.default(null),
});

/** Патч существующей строки: меняются только роль и заметка (project/contact — новая строка). */
export const stakeholderUpdateSchema = z.object({
  role: stakeholderRoleSchema.optional(),
  note: stakeholderNoteSchema.optional(),
});

export type StakeholderInsertInput = z.infer<typeof stakeholderInsertSchema>;
export type StakeholderUpdateInput = z.infer<typeof stakeholderUpdateSchema>;
