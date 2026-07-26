import { z } from 'zod';
import type { SegmentEntity, SegmentPredicate } from '@/types/database';
import { SEGMENT_NULLARY_OPS, segmentFieldDef } from '@/lib/constants/segments';

/**
 * Валидатор сегмента (Smart Views, R2-P0-B) — зеркало типов `Segment*` из types/database.
 *
 * Задача узкая: не пустить в БД предикат, который клиентский вычислитель заведомо
 * прочитает как «всегда ложь». Сам вычислитель к валидатору не обращается — он
 * толерантен к мусору по контракту (см. segment-eval), но заводить мусор из UI нельзя.
 */

export const segmentEntitySchema = z.enum([
  'deals', 'deliveries', 'contacts', 'companies', 'tasks', 'leads',
]);

export const segmentOpSchema = z.enum([
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
  'in', 'contains', 'is_null', 'not_null',
  'days_since_gt', 'days_since_lt',
]);

export const segmentClauseSchema = z.object({
  field: z.string().min(1),
  op: segmentOpSchema,
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]).optional(),
});

export const segmentPredicateSchema = z.object({
  version: z.literal(1),
  and: z.array(segmentClauseSchema),
});

export const segmentFormSchema = z.object({
  name: z.string().trim().min(1, 'Введи название').max(80, 'Не длиннее 80 символов'),
  is_shared: z.boolean(),
});
export type SegmentFormValues = z.infer<typeof segmentFormSchema>;

/**
 * Клауза заполнена: поле в whitelist сущности, оператор ему разрешён, значение есть
 * (кроме nullary-операторов). Возвращает текст проблемы или null.
 */
export function validateClause(entity: SegmentEntity, clause: unknown): string | null {
  const parsed = segmentClauseSchema.safeParse(clause);
  if (!parsed.success) return 'Условие заполнено не полностью';

  const { field, op, value } = parsed.data;
  const def = segmentFieldDef(entity, field);
  if (!def) return `Поле «${field}» недоступно для сегментов`;
  if (!def.ops.includes(op)) return `Оператор не применим к полю «${def.label}»`;

  if (SEGMENT_NULLARY_OPS.has(op)) return null;
  if (value === undefined || value === '') return `Заполни значение для «${def.label}»`;
  if (op === 'in' && (!Array.isArray(value) || value.length === 0)) {
    return `Выбери хотя бы одно значение для «${def.label}»`;
  }
  if ((def.kind === 'number' || op === 'days_since_gt' || op === 'days_since_lt') && typeof value !== 'number') {
    return `Значение «${def.label}» — число`;
  }
  return null;
}

/** Первая проблема в предикате или null, если все клаузы валидны. Пустой and допустим. */
export function validatePredicate(entity: SegmentEntity, predicate: SegmentPredicate): string | null {
  for (const clause of predicate.and) {
    const problem = validateClause(entity, clause);
    if (problem) return problem;
  }
  return null;
}
