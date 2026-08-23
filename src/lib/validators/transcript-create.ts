import { z } from 'zod';

// ═══════════════════════════════════════════════════════
// S-TR-CREATE-1: форма мастера «+ Транскрипт».
//
// Схема описывает ОДНУ форму на два вида родителя: звонок и встречу. Раздельных
// схем нет намеренно — шаг «привязка» у них общий на девять десятых, а разошлись
// бы они ровно в двух полях (`lead_id` только у звонка, `title` только у встречи).
// ═══════════════════════════════════════════════════════

export const transcriptParentKinds = ['call', 'meeting'] as const;
export type TranscriptParentKind = (typeof transcriptParentKinds)[number];

export const transcriptCreateSchema = z
  .object({
    kind: z.enum(transcriptParentKinds).default('call'),
    company_id: z.string().uuid().nullable().default(null),
    contact_id: z.string().uuid().nullable().default(null),
    project_id: z.string().uuid().nullable().default(null),
    /**
     * Только у звонка: `meetings` колонки `lead_id` не имеет. Ветка та же, что в
     * `CallModal` — либо лид, либо CRM-связи, двойной привязки не заводим.
     */
    lead_id: z.string().uuid().nullable().default(null),
    /** datetime-local; в ISO/дату+время его переводит уже сабмит. */
    date: z.string().min(1, 'Укажи дату'),
    /** `meetings.title` NOT NULL — у встречи обязателен, у звонка не существует. */
    title: z.string().nullable().default(null),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'meeting' && !v.title?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['title'],
        message: 'Название встречи обязательно',
      });
    }
  });

export type TranscriptCreateValues = z.infer<typeof transcriptCreateSchema>;

/**
 * Автозаголовок встречи: `meetings.title` NOT NULL, а человек, пришедший из
 * раздела расшифровок, думает про разговор, а не про название встречи. Поле
 * остаётся редактируемым — это подстановка, а не запрет.
 */
export function suggestMeetingTitle(
  companyName: string | null | undefined,
  datetimeLocal: string,
): string {
  const day = datetimeLocal.slice(0, 10);
  const human = /^\d{4}-\d{2}-\d{2}$/.test(day)
    ? `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`
    : day;
  return `Встреча · ${companyName?.trim() || 'без компании'} · ${human}`;
}
