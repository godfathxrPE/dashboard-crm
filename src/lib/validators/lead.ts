import { z } from 'zod';
// Только тип — `import type` стирается при компиляции, runtime-связи lib → components нет.
import type { BadgeColor } from '@/components/ui/Badge';
import type { LeadBudgetStatus, LeadTemperature } from '@/types/database';

// ═══════════════════════════════════════════════════════
// Lead statuses & sources
// ═══════════════════════════════════════════════════════

export const leadStatuses = ['new', 'contacted', 'qualified', 'disqualified', 'converted'] as const;
export const leadSources = ['call', 'website', 'referral', 'cold', 'inbound', 'event'] as const;

// Ключ — `string`, не `LeadStatus`: `lead.status` приходит из БД строкой, сужение
// сломало бы индексацию у потребителей.
export const LEAD_STATUS_CONFIG: Record<string, { label: string; color: BadgeColor }> = {
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
// Lead work fields (S-LEAD-CORE-1, миграция 117)
// ═══════════════════════════════════════════════════════

export const leadTemperatures = ['hot', 'warm', 'cold'] as const;
export const leadBudgetStatuses = ['unknown', 'none', 'estimated', 'confirmed'] as const;

/** Ключи — зеркало CHECK `leads_temperature_check`. Порядок = убывание приоритета. */
export const LEAD_TEMPERATURE_CONFIG: Record<LeadTemperature, { label: string; color: BadgeColor }> = {
  hot:  { label: 'Горячий',  color: 'red' },
  warm: { label: 'Тёплый',   color: 'yellow' },
  cold: { label: 'Холодный', color: 'blue' },
};

/** Зеркало CHECK `leads_budget_status_check`. `unknown` — состояние по умолчанию, не «пусто». */
export const LEAD_BUDGET_STATUS_CONFIG: Record<LeadBudgetStatus, { label: string }> = {
  unknown:   { label: 'Не выяснен' },
  none:      { label: 'Нет бюджета' },
  estimated: { label: 'Оценён' },
  confirmed: { label: 'Подтверждён' },
};

// ═══════════════════════════════════════════════════════
// Lead form schema
// ═══════════════════════════════════════════════════════

// Пустая строка из `<input>` — это «не заполнено», а не значение. Без этого в БД
// приезжают '' в text-полях и 22007 в date-полях (пустая строка не приводится к date).
const emptyToNull = (v: string | null | undefined) => (v == null || v.trim() === '' ? null : v);

export const leadFormSchema = z.object({
  title: z.string().min(1, 'Название обязательно'),
  source: z.enum(leadSources).nullable().default(null),
  direction: z.enum(['erp', 'iiot']).nullable().default(null),
  company_name_raw: z.string().nullable().default(null),
  contact_name_raw: z.string().nullable().default(null),
  phone: z.string().nullable().default(null),
  email: z.string().email('Некорректный email').nullable().default(null).or(z.literal('')),
  notes: z.string().nullable().default(null),

  // ═══ Работа ═══
  owner_id: z.string().nullable().default(null),
  next_step: z.string().nullable().default(null).transform(emptyToNull),
  next_action_date: z.string().nullable().default(null).transform(emptyToNull),
  temperature: z.enum(leadTemperatures).nullable().default(null),
  /** КОПЕЙКИ (ввод в рублях через parseBudgetInput — паттерн QuoteModal). */
  estimated_value: z.number().int().nonnegative().nullable().default(null),

  // ═══ Квалификация ═══
  pain: z.string().nullable().default(null).transform(emptyToNull),
  budget_status: z.enum(leadBudgetStatuses).default('unknown'),
  decision_role: z.string().nullable().default(null).transform(emptyToNull),
  chz_groups: z.array(z.string()).nullable().default(null),
  regulatory_deadline: z.string().nullable().default(null).transform(emptyToNull),
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
