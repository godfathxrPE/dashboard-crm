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

const stringList = (maxLen: number, maxItems: number) =>
  z
    .array(z.string().trim().min(1).max(maxLen).catch(''))
    .max(maxItems)
    .default([])
    .transform((xs) => xs.filter(Boolean));

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
  tasks: z
    .array(taskSchema.nullable().catch(null))
    .max(PROGRESSION_MAX_TASKS)
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
  /** Сколько задач выброшено как некорректные. */
  droppedTasks: number;
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

  return {
    proposal: parsed.data as ProgressionProposal,
    droppedFields,
    droppedTasks: Math.max(0, rawTaskCount - parsed.data.tasks.length),
  };
}
