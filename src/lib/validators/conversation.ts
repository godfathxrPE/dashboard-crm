import { z } from 'zod';

/**
 * Валидация формы группы чата (S-CHAT-HUB-1c).
 *
 * Границы — зеркало БД: CHECK `conversations.title` разрешает 1..120 символов, и ту же
 * пару чисел проверяет RPC `create_group_conversation` после `btrim`. Здесь `.trim()`
 * стоит ДО `.min(1)` намеренно: строка из одних пробелов обязана падать на «Укажите
 * название», а не доезжать до БД и возвращаться оттуда 22023 без привязки к полю.
 *
 * Расходиться правилам нельзя — при правке одного править оба (тот же контракт, что
 * у webhookEndpointSchema и checkWebhookUrl).
 */
export const GROUP_TITLE_MAX = 120;

export const groupConversationSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Укажите название группы')
    .max(GROUP_TITLE_MAX, `Не длиннее ${GROUP_TITLE_MAX} символов`),
  /**
   * Состав БЕЗ автора: его добавляет RPC сама, и держать его в форме значило бы дать
   * пользователю снять галочку с самого себя при создании — то есть создать группу,
   * которую он не увидит. Пустой массив валиден: группа из одного автора.
   */
  memberIds: z.array(z.string().uuid()),
});

export type GroupConversationFormValues = z.infer<typeof groupConversationSchema>;
