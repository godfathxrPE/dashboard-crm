import { z } from 'zod';

export const contactFormSchema = z.object({
  first_name: z.string().min(1, 'Введи имя'),
  last_name: z.string().min(1, 'Введи фамилию'),
  email: z.string().email('Некорректный email').nullable().default(null),
  phone: z.string().nullable().default(null),
  position: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;
