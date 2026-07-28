import { z } from 'zod';
import type { ChecklistItem, ChecklistTemplateItem } from '@/types/database';

/**
 * Валидатор sign-off чеклистов (R2-P1-G) — зеркало `Checklist*` из types/database
 * и CHECK/jsonb-формы миграций 083/084.
 *
 * Две задачи:
 *   1. форма редактора шаблона в Настройках (RHF + zodResolver);
 *   2. **толерантный разбор jsonb из БД**: items приходят как `unknown`, и мусор (пункт из
 *      будущей версии, ручная правка SQL'ем) не должен ронять карточку. Отсюда `parse*Items`,
 *      которые ОТБРАСЫВАЮТ негодный элемент, а не бросают исключение.
 */

export const checklistTypeSchema = z.enum([
  'doc_review',
  'handover_support',
  'erp_stage_accept',
  'custom',
]);

/** Пункт шаблона. key — технический slug, latin/digit/underscore. */
export const checklistTemplateItemSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, 'Пустой ключ пункта')
    .max(40, 'Ключ не длиннее 40 символов')
    .regex(/^[a-z0-9_]+$/, 'Ключ: строчные латинские, цифры, подчёркивание'),
  label: z.string().trim().min(1, 'Введи текст пункта').max(200, 'Не длиннее 200 символов'),
  required: z.boolean(),
});

/**
 * Пункт экземпляра. `checked_by`/`checked_at` ставит сервер — здесь они `.catch(null)`:
 * их отсутствие в старой строке не должна делать пункт нечитаемым.
 */
export const checklistItemSchema = checklistTemplateItemSchema.extend({
  checked: z.boolean().catch(false),
  checked_by: z.string().uuid().nullable().catch(null),
  checked_at: z.string().nullable().catch(null),
});

export const checklistTemplateFormSchema = z.object({
  checklist_type: checklistTypeSchema,
  title: z.string().trim().min(1, 'Введи название').max(120, 'Не длиннее 120 символов'),
  /** '' → NULL в БД («любое направление»). */
  direction: z.union([z.literal(''), z.literal('erp'), z.literal('iiot')]),
  /** '' → NULL в БД («любой вид»). */
  delivery_kind: z.union([z.literal(''), z.literal('launch'), z.literal('experiment')]),
  is_active: z.boolean(),
  items: z
    .array(checklistTemplateItemSchema)
    .min(1, 'Нужен хотя бы один пункт')
    .max(30, 'Не больше 30 пунктов')
    .superRefine((items, ctx) => {
      const seen = new Set<string>();
      items.forEach((it, i) => {
        if (seen.has(it.key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [i, 'key'],
            message: 'Ключ уже занят в этом чеклисте',
          });
        }
        seen.add(it.key);
      });
    }),
});
export type ChecklistTemplateFormValues = z.infer<typeof checklistTemplateFormSchema>;

/** jsonb → пункты шаблона. Негодный элемент отбрасывается, не роняет список. */
export function parseTemplateItems(raw: unknown): ChecklistTemplateItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((el) => {
    const p = checklistTemplateItemSchema.safeParse(el);
    return p.success ? [p.data] : [];
  });
}

/** jsonb → пункты экземпляра. Та же толерантность. */
export function parseChecklistItems(raw: unknown): ChecklistItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((el) => {
    const p = checklistItemSchema.safeParse(el);
    return p.success ? [p.data] : [];
  });
}

/** Все обязательные пункты отмечены. Зеркало completed_at из toggle_checklist_item (084). */
export function isChecklistComplete(items: ChecklistItem[]): boolean {
  return items.every((it) => !it.required || it.checked);
}

/** Сколько обязательных пунктов ещё не отмечено — для бейджа на карточке. */
export function openRequiredCount(items: ChecklistItem[]): number {
  return items.filter((it) => it.required && !it.checked).length;
}
