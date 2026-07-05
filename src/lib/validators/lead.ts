import { z } from 'zod';

// ═══════════════════════════════════════════════════════
// Lead statuses & sources
// ═══════════════════════════════════════════════════════

export const leadStatuses = ['new', 'contacted', 'qualified', 'disqualified', 'converted'] as const;
export const leadSources = ['call', 'website', 'referral', 'cold', 'inbound', 'event'] as const;

export const LEAD_STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  new:            { label: 'Новый',              color: 'blue' },
  contacted:      { label: 'Контакт',            color: 'yellow' },
  qualified:      { label: 'Квалифицирован',     color: 'green' },
  disqualified:   { label: 'Дисквалифицирован',  color: 'red' },
  converted:      { label: 'Конвертирован',      color: 'accent' },
};

// Причины дисквалификации (колонка disqualify_reason из миграции 016).
// Фундамент аналитики источников: «почему теряем лидов с сайта?»
export const disqualifyReasons = ['not_our_profile', 'no_budget', 'no_response', 'competitor', 'other'] as const;
export type DisqualifyReason = (typeof disqualifyReasons)[number];

export const DISQUALIFY_REASON_CONFIG: Record<DisqualifyReason, { label: string }> = {
  not_our_profile: { label: 'Не наш профиль' },
  no_budget:       { label: 'Нет бюджета' },
  no_response:     { label: 'Не ответил' },
  competitor:      { label: 'Ушёл к конкуренту' },
  other:           { label: 'Другое' },
};

export const LEAD_SOURCE_CONFIG: Record<string, { label: string }> = {
  call:     { label: 'Звонок' },
  website:  { label: 'Сайт' },
  referral: { label: 'Рекомендация' },
  cold:     { label: 'Холодный' },
  inbound:  { label: 'Входящий' },
  event:    { label: 'Мероприятие' },
};

// ═══════════════════════════════════════════════════════
// Lead form schema
// ═══════════════════════════════════════════════════════

export const leadFormSchema = z.object({
  title: z.string().min(1, 'Название обязательно'),
  source: z.enum(leadSources).nullable().default(null),
  direction: z.enum(['erp', 'iiot']).nullable().default(null),
  company_name_raw: z.string().nullable().default(null),
  contact_name_raw: z.string().nullable().default(null),
  phone: z.string().nullable().default(null),
  email: z.string().email('Некорректный email').nullable().default(null).or(z.literal('')),
  notes: z.string().nullable().default(null),
});

export type LeadFormData = z.infer<typeof leadFormSchema>;

// ═══════════════════════════════════════════════════════
// Lead conversion form schema
// ═══════════════════════════════════════════════════════

export const leadConversionSchema = z.object({
  // Дедупликация: выбор существующей записи вместо создания новой
  company_id: z.string().nullable().default(null),
  company_name: z.string().nullable().default(null),
  contact_id: z.string().nullable().default(null),
  contact_first_name: z.string().nullable().default(null),
  contact_last_name: z.string().nullable().default(null),
  contact_phone: z.string().nullable().default(null),
  contact_email: z.string().email('Некорректный email').nullable().default(null).or(z.literal('')),
  direction: z.enum(['erp', 'iiot']),
  deal_title: z.string().nullable().default(null),
  deal_amount: z.number().positive().nullable().default(null),
}).superRefine((v, ctx) => {
  if (!v.company_id && !v.company_name?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['company_name'], message: 'Выбери компанию или введи название новой' });
  }
  if (!v.contact_id && !v.contact_first_name?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['contact_first_name'], message: 'Выбери контакт или введи имя нового' });
  }
});

export type LeadConversionFormData = z.infer<typeof leadConversionSchema>;
