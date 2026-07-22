import { z } from 'zod';
import { taskPriorities } from './task';

// Зеркалит CHECK'и recurring_task_templates (069): weekly требует weekly_dow,
// monthly требует monthly_dom (1..28, cap безопасен для всех месяцев).
export const recurringCadences = ['daily', 'weekdays', 'weekly', 'monthly'] as const;

export const recurringTemplateFormSchema = z
  .object({
    text: z.string().min(1, 'Введи текст задачи'),
    cadence: z.enum(recurringCadences),
    weekly_dow: z.number().int().min(0).max(6).nullable().default(null),
    monthly_dom: z.number().int().min(1).max(28).nullable().default(null),
    priority: z.enum(taskPriorities).default('normal'),
    lane: z.enum(['now', 'next', 'wait']).default('now'),
    project_id: z.string().nullable().default(null),
    company_id: z.string().nullable().default(null),
    contact_id: z.string().nullable().default(null),
    assigned_to: z.string().uuid().nullable().default(null),
    is_active: z.boolean().default(true),
  })
  .refine((d) => d.cadence !== 'weekly' || d.weekly_dow !== null, {
    message: 'Выбери день недели',
    path: ['weekly_dow'],
  })
  .refine((d) => d.cadence !== 'monthly' || d.monthly_dom !== null, {
    message: 'Выбери число месяца',
    path: ['monthly_dom'],
  });

export type RecurringTemplateFormValues = z.infer<typeof recurringTemplateFormSchema>;

export const CADENCE_CONFIG = {
  daily: { label: 'Каждый день' },
  weekdays: { label: 'По будням' },
  weekly: { label: 'Раз в неделю' },
  monthly: { label: 'Раз в месяц' },
} as const;

export const WEEKDAY_LABELS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'] as const; // pg EXTRACT(dow): 0=Вс..6=Сб

/** Каденс-подпись для списка шаблонов, напр. «Раз в неделю · Пн» / «Раз в месяц · 15 числа». */
export function cadenceLabel(t: { cadence: string; weekly_dow: number | null; monthly_dom: number | null }): string {
  const base = CADENCE_CONFIG[t.cadence as keyof typeof CADENCE_CONFIG]?.label ?? t.cadence;
  if (t.cadence === 'weekly' && t.weekly_dow !== null) return `${base} · ${WEEKDAY_LABELS[t.weekly_dow]}`;
  if (t.cadence === 'monthly' && t.monthly_dom !== null) return `${base} · ${t.monthly_dom} числа`;
  return base;
}
