import { z } from 'zod';

export const meetingFormSchema = z.object({
  title: z.string().min(1, 'Введи название встречи'),
  date: z.string().min(1, 'Укажи дату'),
  time: z.string().nullable().default(null),
  location: z.string().nullable().default(null),
  project_id: z.string().uuid().nullable().default(null),
  notes: z.string().nullable().default(null),
});

export type MeetingFormValues = z.infer<typeof meetingFormSchema>;
