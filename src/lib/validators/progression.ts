import { z } from 'zod';
import { PROGRESSION_MAX_TASKS } from '@/lib/constants/ai-progression';
import type { ProgressionProposal } from '@/types/database';

// ═══════════════════════════════════════════════════════
// R2-P0-C (S-R2-SDP-1) — валидация того, что вернула модель, ДО показа в UI.
//
// Контракт держит edge (forced tool_choice + JSON schema), но вход недоверенный
// по определению: транскрипт мог содержать инъекцию, модель могла вернуть
// «завтра» вместо даты или 150% вероятности. Здесь — вторая линия:
//   • невалидное ПОЛЕ выбрасывается (остальное предложение показываем);
//   • невалидная ЗАДАЧА выбрасывается;
//   • сломанный каркас (нет summary/fields) → предложение не показываем вовсе.
//
// `stage_id` в схеме нет и быть не может — см. комментарий у ProgressionProposal.
// ═══════════════════════════════════════════════════════

/** Реальная календарная дата в ISO YYYY-MM-DD (не «завтра», не 2026-02-31). */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'не календарная дата');

/**
 * Поля сделки. `.catch(undefined)` на каждом: одно кривое значение не должно
 * обнулять всё предложение — оно просто не дойдёт до панели.
 */
const fieldsSchema = z.object({
  next_step: z.string().trim().min(1).max(500).optional().catch(undefined),
  next_action_date: isoDate.optional().catch(undefined),
  pinned_note: z.string().trim().min(1).max(2000).optional().catch(undefined),
  probability: z.number().int().min(0).max(100).optional().catch(undefined),
});

const taskSchema = z.object({
  text: z.string().trim().min(1).max(300),
  due_in_days: z.number().int().min(0).max(365).optional().catch(undefined),
  priority: z.enum(['normal', 'important', 'critical']).optional().catch(undefined),
  lane: z.enum(['now', 'next', 'wait', 'done']).optional().catch(undefined),
});

/**
 * D1 (S-R2-AI-HARDEN). `.max(maxItems)` ЗДЕСЬ БЫЛ БАГОМ: перебор лимита ронял
 * `safeParse` целиком, и пользователь вместо 10 нормальных рисков видел «модель
 * вернула некорректный ответ». Лишнее усекается, а не отменяет предложение.
 * Счётчика для этих списков нет намеренно — они read-only и потерять 11-й риск
 * несопоставимо дешевле, чем потерять всё предложение (у задач счётчик есть:
 * их пользователь отмечает галочками, см. truncatedTasks).
 */
const stringList = (maxLen: number, maxItems: number) =>
  z
    .array(z.string().trim().min(1).max(maxLen).catch(''))
    .default([])
    .transform((xs) => xs.filter(Boolean).slice(0, maxItems));

export const progressionProposalSchema = z.object({
  version: z.literal(1),
  source: z.object({
    entity_type: z.enum(['call', 'meeting']),
    entity_id: z.string().uuid(),
  }),
  target_project_id: z.string().uuid().nullable().catch(null),
  confidence: z.enum(['high', 'medium', 'low']).catch('low'),
  summary: z.string().trim().max(2000),
  fields: fieldsSchema,
  // Битая задача выбрасывается поштучно: `.catch(null)` + filter, а не отказ от всего списка.
  //
  // D1 (S-R2-AI-HARDEN): `.max(PROGRESSION_MAX_TASKS)` отсюда СНЯТ — 6-я задача роняла
  // safeParse, parseProposal возвращал null, и пять нормальных задач не показывались
  // вовсе. Усечение до лимита делает parseProposal, а не схема: только так можно
  // развести «выброшено как битое» (droppedTasks) и «отрезано сверх лимита»
  // (truncatedTasks) — после усечения внутри схемы разница неразличима.
  tasks: z
    .array(taskSchema.nullable().catch(null))
    .default([])
    .transform((xs) => xs.filter((t): t is z.infer<typeof taskSchema> => t !== null)),
  risks: stringList(500, 10),
  open_questions: stringList(500, 10),
  applied_at: z.string().optional(),
  applied: z.object({ fields: z.array(z.string()), tasks: z.number() }).optional(),
  meta: z.object({ truncated: z.boolean().optional() }).optional(),
});

export type ParsedProposal = {
  proposal: ProgressionProposal;
  /** Ключи полей, которые модель прислала, но они не прошли валидацию. */
  droppedFields: string[];
  /** Сколько задач выброшено как НЕКОРРЕКТНЫЕ (пустой текст, не тот тип). */
  droppedTasks: number;
  /**
   * Сколько ВАЛИДНЫХ задач отрезано сверх PROGRESSION_MAX_TASKS. Отдельно от
   * droppedTasks: это разные вещи и в UI звучат по-разному — «часть скрыта, она
   * битая» против «модель вернула 7, показаны первые 5». Молча резать нельзя —
   * это то же враньё, что и молчаливый отказ, только в другую сторону.
   */
  truncatedTasks: number;
};

/**
 * Разбор `ai_runs.result` для пресета deal_progression.
 * `null` — каркас сломан, показывать нечего (в панели одна строка про некорректный ответ).
 */
export function parseProposal(raw: unknown): ParsedProposal | null {
  const parsed = progressionProposalSchema.safeParse(raw);
  if (!parsed.success) return null;

  // Что модель прислала, но валидатор снял — чтобы честно сказать об этом в UI,
  // а не молча показать «предложений нет».
  const rawFields = (raw as { fields?: Record<string, unknown> } | null)?.fields ?? {};
  const rawTaskCount = Array.isArray((raw as { tasks?: unknown[] } | null)?.tasks)
    ? ((raw as { tasks: unknown[] }).tasks.length)
    : 0;

  const droppedFields = Object.keys(rawFields).filter((k) => {
    const kept = (parsed.data.fields as Record<string, unknown>)[k];
    const sent = rawFields[k];
    return sent !== null && sent !== undefined && sent !== '' && kept === undefined;
  });

  // Схема оставила все ВАЛИДНЫЕ задачи (сколько бы их ни было); лимит применяем здесь,
  // чтобы оба счётчика считались от разных величин и не смешивались.
  const validTasks = parsed.data.tasks;
  const keptTasks = validTasks.slice(0, PROGRESSION_MAX_TASKS);

  return {
    proposal: { ...parsed.data, tasks: keptTasks } as ProgressionProposal,
    droppedFields,
    droppedTasks: Math.max(0, rawTaskCount - validTasks.length),
    truncatedTasks: Math.max(0, validTasks.length - keptTasks.length),
  };
}
