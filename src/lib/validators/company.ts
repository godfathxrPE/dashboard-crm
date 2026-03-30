import { z } from 'zod';

export const companyFormSchema = z.object({
  name: z.string().min(1, 'Введи название компании'),
  inn: z.string().nullable().default(null),
  industry: z.string().nullable().default(null),
  website: z.string().nullable().default(null),
  phone: z.string().nullable().default(null),
  email: z.string().email('Некорректный email').nullable().default(null),
  address: z.string().nullable().default(null),
  notes: z.string().nullable().default(null),
});

export type CompanyFormValues = z.infer<typeof companyFormSchema>;
