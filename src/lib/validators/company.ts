import { z } from 'zod';
import { phoneEntrySchema } from './phone';

export const companyFormSchema = z.object({
  name: z.string().min(1, 'Введи название компании'),
  inn: z.string().nullable().default(null),
  industry: z.string().nullable().default(null),
  website: z.string().nullable().default(null),
  // legacy primary-зеркало массива phones (backward-compat: дедуп/списки)
  phone: z.string().nullable().default(null),
  phones: z.array(phoneEntrySchema).default([]),
  email: z.string().email('Некорректный email').nullable().default(null),
  address: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
  owner_id: z.string().uuid().nullable().optional(),
});

export type CompanyFormValues = z.infer<typeof companyFormSchema>;
