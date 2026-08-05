import { z } from 'zod';

// S-QUICK-CAPTURE-1: контракт ответа edge-функции `ai-capture`.
//
// Зеркало серверной схемы tool'а `submit_capture`
// (`supabase/functions/ai-capture/index.ts`). Держать синхронно: функция деплоится
// гейтом ОТДЕЛЬНО от фронта, поэтому ответ на клиенте всегда прогоняется через
// `safeParse` — сырой JSON из сети в состояние не попадает.
//
// Все поля со строковым дефолтом: модель обязана вернуть пустую строку вместо
// выдумки, а недостающий ключ (старая версия функции) не должен ронять разбор.

export const captureContactSchema = z.object({
  first_name: z.string().default(''),
  last_name: z.string().default(''),
  position: z.string().default(''),
  email: z.string().default(''),
  phone: z.string().default(''),
  notes: z.string().default(''),
});

export const captureCompanySchema = z.object({
  name: z.string().default(''),
  email: z.string().default(''),
  phone: z.string().default(''),
  website: z.string().default(''),
  address: z.string().default(''),
  notes: z.string().default(''),
  // ВАЖНО: `inn` здесь НЕТ и быть не должно. ИНН — факт реестра, а не догадка
  // модели: его находит клиентская чексумма (`extractInn`), а реквизиты по нему
  // отдаёт ЕГРЮЛ через `company-lookup`. Инвариант спринта.
});

// Гейт S-QUICK-CAPTURE-1 (смок живой функции): haiku на пустую ветку системно
// возвращает СТРОКУ "null" вместо null — двум прогонам из трёх. Промптом это не
// лечится (урок company-ai 1b→1c: гарантию даёт код), лечится препроцессором.
const nullBranch = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === 'null' || v === '' || v === undefined ? null : v), schema.nullable());

export const captureResultSchema = z.object({
  intent: z.enum(['contact', 'company', 'unclear']),
  contact: nullBranch(captureContactSchema),
  company: nullBranch(captureCompanySchema),
});

export type CaptureContact = z.infer<typeof captureContactSchema>;
export type CaptureCompany = z.infer<typeof captureCompanySchema>;
export type CaptureResult = z.infer<typeof captureResultSchema>;

/** Лимит вставки. Клиент режет заранее, функция проверяет сама (страховка). */
export const CAPTURE_MAX_CHARS = 2000;
