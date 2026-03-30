import { z } from 'zod';

// ═══════════════════════════════════════════════════════
// Call statuses — из Supabase enum `call_status`
// ═══════════════════════════════════════════════════════

export const callStatuses = ['done', 'pending', 'cancelled'] as const;
export type CallStatus = (typeof callStatuses)[number];

export const CALL_STATUS_CONFIG: Record<CallStatus, { label: string; color: string; bg: string }> = {
  done:      { label: 'Выполнен',    color: 'text-green', bg: 'bg-green/10' },
  pending:   { label: 'Запланирован', color: 'text-blue',  bg: 'bg-blue/10' },
  cancelled: { label: 'Отменён',     color: 'text-red',   bg: 'bg-red/10' },
};

// ═══════════════════════════════════════════════════════
// Zod Form Schema
// ═══════════════════════════════════════════════════════

export const callFormSchema = z.object({
  company_id: z.string().uuid().nullable().default(null),
  contact_id: z.string().uuid().nullable().default(null),
  project_id: z.string().uuid().nullable().default(null),
  date: z.string().min(1, 'Укажи дату'),
  status: z.enum(callStatuses).default('done'),
  next_step: z.string().nullable().default(null),
  agreements: z.string().nullable().default(null),
  duration_s: z.number().int().nonnegative().nullable().default(null),
});

export type CallFormValues = z.infer<typeof callFormSchema>;

/** Форматировать длительность из секунд */
export function formatDuration(seconds: number | null): string {
  if (seconds == null || seconds === 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}с`;
  return s > 0 ? `${m}м ${s}с` : `${m}м`;
}
