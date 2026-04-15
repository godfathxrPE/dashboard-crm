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
  company_name: z.string().min(1, 'Название компании обязательно'),
  contact_first_name: z.string().min(1, 'Имя контакта обязательно'),
  contact_last_name: z.string().nullable().default(null),
  contact_phone: z.string().nullable().default(null),
  contact_email: z.string().email('Некорректный email').nullable().default(null).or(z.literal('')),
  direction: z.enum(['erp', 'iiot']),
  deal_title: z.string().nullable().default(null),
  deal_amount: z.number().positive().nullable().default(null),
});

export type LeadConversionFormData = z.infer<typeof leadConversionSchema>;
