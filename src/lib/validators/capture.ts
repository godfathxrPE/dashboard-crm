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
  /**
   * Место работы человека ДОСЛОВНОЙ ЦИТАТОЙ — S-CONTACT-COMPANY.
   *
   * ⚠️ Не `company_id`: сопоставление с записью CRM делает детерминированный
   *    резолвер, а не модель. Тот же контракт, что у `*_hint` задачи.
   *
   * ⚠️ Поле аддитивное. Ответ ПРЕЖНЕЙ версии `ai-capture` (без ключа) обязан
   *    разбираться как раньше — за это отвечает `.default('')`: функция
   *    деплоится отдельно от фронта, и порядок деплоев не гарантирован.
   */
  company_hint: z.string().default(''),
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

/**
 * Задача — третий интент (S-TG-TASK-1).
 *
 * ⚠️ `*_hint` — ЦИТАТЫ ИЗ ТЕКСТА, А НЕ ИДЕНТИФИКАТОРЫ. Uuid'ов здесь нет и быть не
 *    может: сопоставление подсказки с записью CRM делает детерминированный
 *    резолвер (`@/lib/utils/capture-resolve`), и только при ЕДИНСТВЕННОМ
 *    совпадении. Появление здесь поля вида `assignee_id` означало бы, что модели
 *    разрешили назначать исполнителя — а `trg_notify_task_assigned` уведомляет
 *    назначенного немедленно, и отката у этого нет.
 *
 * ⚠️ Дата и время РАЗДЕЛЬНО — зеркало схемы tool'а. Слитная ISO-строка
 *    провоцирует модель дописать время, которого не было.
 */
export const captureTaskSchema = z.object({
  text: z.string().default(''),
  deadline_date: z.string().default(''),
  deadline_time: z.string().default(''),
  // Не `z.enum`: незнакомое значение от модели не должно ронять разбор целиком —
  // приоритет по умолчанию безопаснее отказа. Сужение — в `normalizeTaskPriority`.
  priority: z.string().default('normal'),
  assignee_hint: z.string().default(''),
  project_hint: z.string().default(''),
  company_hint: z.string().default(''),
});

// Гейт S-QUICK-CAPTURE-1 (смок живой функции): haiku на пустую ветку системно
// возвращает СТРОКУ "null" вместо null — двум прогонам из трёх. Промптом это не
// лечится (урок company-ai 1b→1c: гарантию даёт код), лечится препроцессором.
const nullBranch = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === 'null' || v === '' || v === undefined ? null : v), schema.nullable());

export const captureResultSchema = z.object({
  intent: z.enum(['contact', 'company', 'task', 'unclear']),
  contact: nullBranch(captureContactSchema),
  company: nullBranch(captureCompanySchema),
  // Ветка добавлена аддитивно: ответ функции ПРЕЖНЕЙ версии (без ключа `task`)
  // обязан разбираться как раньше — `nullBranch` приводит отсутствующий ключ к
  // null, ровно как у contact/company. Фронт деплоится отдельно от функции, и
  // порядок этих двух деплоев не гарантирован ни в одну сторону.
  task: nullBranch(captureTaskSchema),
});

/**
 * Телеметрия прогона — поле `run` ответа `ai-capture` (S-AI-OBS-1).
 *
 * ⚠️ ВСЁ НЕОБЯЗАТЕЛЬНО, И ЭТО НЕ НЕБРЕЖНОСТЬ. Функция деплоится отдельно от фронта:
 *    её прежняя версия ключа `run` не вернёт вовсе, а провайдер может не отдать
 *    токены (у OpenRouter это штатно). Прогон при этом СОСТОЯЛСЯ и обязан попасть
 *    в журнал — без токенов, но попасть. Отказ писать строку из-за неполноты полей
 *    воспроизвёл бы ровно то слепое пятно, ради которого затевался спринт.
 *
 * ⚠️ `model` — СЛАГ ИЗ СЕКРЕТА функции, а не имя модели глазами провайдера
 *    (S-LLM-OPENROUTER-1). По нему `RunCostMeta` ищет цену; вендорный префикс
 *    OpenRouter таблице цен незнаком, и строка про рубли просто исчезла бы.
 */
export const captureRunSchema = z.object({
  model: z.string().nullish().transform((v) => v || null),
  input_tokens: z.number().int().nullish().transform((v) => v ?? null),
  output_tokens: z.number().int().nullish().transform((v) => v ?? null),
  duration_ms: z.number().int().nullish().transform((v) => v ?? null),
});

export type CaptureRun = z.infer<typeof captureRunSchema>;

export type CaptureContact = z.infer<typeof captureContactSchema>;
export type CaptureCompany = z.infer<typeof captureCompanySchema>;
export type CaptureTask = z.infer<typeof captureTaskSchema>;
export type CaptureResult = z.infer<typeof captureResultSchema>;

/**
 * Приоритет задачи, суженный до значений enum `task_priority`.
 *
 * Незнакомая строка от модели ⇒ `normal`. Отказ разбирать здесь был бы хуже:
 * приоритет — не тот факт, ради которого стоит терять поручение целиком.
 */
export function normalizeTaskPriority(raw: string | null | undefined): 'normal' | 'important' | 'critical' {
  const v = (raw ?? '').trim().toLowerCase();
  return v === 'important' || v === 'critical' ? v : 'normal';
}

/** Лимит вставки. Клиент режет заранее, функция проверяет сама (страховка). */
export const CAPTURE_MAX_CHARS = 2000;
