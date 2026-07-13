import { z } from 'zod';
import { phoneEntrySchema } from './phone';

export const contactFormSchema = z.object({
  first_name: z.string().min(1, 'Введи имя'),
  last_name: z.string().min(1, 'Введи фамилию'),
  email: z.string().email('Некорректный email').nullable().default(null),
  // legacy primary-зеркало массива phones (backward-compat: дедуп/списки)
  phone: z.string().nullable().default(null),
  phones: z.array(phoneEntrySchema).default([]),
  position: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
  owner_id: z.string().uuid().nullable().optional(),
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;
