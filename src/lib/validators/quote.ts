import { z } from 'zod';

// ═══════════════════════════════════════════════════════
// S-QUOTE-1: quotes (КП на сделке).
// amount — КОПЕЙКИ (та же единица, что projects.budget), поэтому accepted → budget
// прямое присвоение без конверсии. Ввод в форме — через parseBudgetInput (рубли →
// копейки), как в ProjectModal; здесь схема хранит уже копейки.
// ═══════════════════════════════════════════════════════

export const quoteStatuses = ['draft', 'sent', 'accepted', 'rejected', 'expired'] as const;
export type QuoteStatus = (typeof quoteStatuses)[number];

export const quoteFormSchema = z.object({
  status: z.enum(quoteStatuses).default('draft'),
  amount: z.number().int().nonnegative().nullable().default(null), // копейки, как budget
  currency: z.string().default('RUB'),
  // W6: безопасная цепочка — либо валидный url, либо пустая строка; всё → null.
  document_url: z
    .union([z.string().url('Некорректная ссылка'), z.literal('')])
    .nullable()
    .optional()
    .transform((v) => (v === '' || v == null ? null : v)),
  valid_until: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
});

export type QuoteFormValues = z.infer<typeof quoteFormSchema>;

export const QUOTE_STATUS_CONFIG: Record<
  QuoteStatus,
  { label: string; text: string; glyph: string }
> = {
  draft: { label: 'Черновик', text: 'text-text-mute', glyph: '○' },
  sent: { label: 'Отправлено', text: 'text-blue', glyph: '◔' },
  accepted: { label: 'Принято', text: 'text-green', glyph: '●' },
  rejected: { label: 'Отклонено', text: 'text-red', glyph: '✕' },
  expired: { label: 'Истекло', text: 'text-yellow', glyph: '◐' },
};

/** Разрешённые переходы статуса (для кнопок в строке/модалке). */
export const QUOTE_STATUS_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  draft: ['sent', 'rejected'],
  sent: ['accepted', 'rejected', 'expired'],
  accepted: ['sent'], // откат к «Отправлено» (напр. пересмотр условий)
  rejected: ['draft', 'sent'],
  expired: ['draft', 'sent'],
};
