import { z } from 'zod';

/**
 * Профиль пользователя (self-service, S-ONBOARD-1). Имя обязательно —
 * серверный гард дублирует (complete_onboarding → 23514 на пустое имя),
 * телефон/должность опциональны (паттерн HubSpot/Salesforce: Name required).
 */
export const profileSchema = z.object({
  full_name: z.string().trim().min(1, 'Укажите имя'),
  phone: z.string().trim().optional(),
  job_title: z.string().trim().optional(),
});

export type ProfileFormData = z.infer<typeof profileSchema>;
