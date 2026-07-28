import { z } from 'zod';
import type { OrgSettings } from '@/types/database';

/**
 * Настройки организации (`organizations.settings`, миграция 076).
 *
 * Форвард-совместимость: неизвестные ключи НЕ валидируются и НЕ выбрасываются —
 * запись идёт merge'ом ({...current, ...patch}), поэтому ключ, добавленный будущей
 * версией клиента, переживёт правку порога тишины из этой. Поэтому здесь `.passthrough()`
 * и все известные поля optional — читаем то, что понимаем, остальное не трогаем.
 */

/** Порог тишины, дни. Clamp 3..90: меньше 3 — шум, больше 90 — сегмент вырождается. */
export const RECONNECT_DAYS_MIN = 3;
export const RECONNECT_DAYS_MAX = 90;

/** Норматив «дней в стадии», дни. */
export const STAGE_DWELL_MIN = 1;
export const STAGE_DWELL_MAX = 365;

const reconnectDaysSchema = z
  .number()
  .int('Дни — целое число')
  .min(RECONNECT_DAYS_MIN, `Минимум ${RECONNECT_DAYS_MIN} дня`)
  .max(RECONNECT_DAYS_MAX, `Максимум ${RECONNECT_DAYS_MAX} дней`);

const stageDwellDefaultsSchema = z.record(
  z.string(),
  z.number().int().min(STAGE_DWELL_MIN).max(STAGE_DWELL_MAX).optional(),
);

export const orgSettingsSchema = z
  .object({
    reconnect_days: reconnectDaysSchema.optional(),
    stage_dwell_defaults: stageDwellDefaultsSchema.optional(),
  })
  .passthrough();

export type OrgSettingsInput = z.input<typeof orgSettingsSchema>;

/**
 * phase_group воронки продаж — порядок и подписи как в `PipelineBoard`/`StackedPipeline`.
 * Живёт рядом со схемой: ключи формы и ключи jsonb — один список, чтобы не разъехались.
 * Групп внедрения (initiated/planning/execution/completed) здесь нет намеренно —
 * бейдж «залипла» настраивается для сделок; внедрения падают на `default`/фолбэк.
 */
export const DWELL_PHASE_GROUPS = [
  { key: 'attraction', label: 'Привлечение' },
  { key: 'working', label: 'Проработка' },
  { key: 'approval', label: 'Согласование' },
  { key: 'closing', label: 'Закрытие' },
] as const;

export type DwellPhaseGroup = (typeof DWELL_PHASE_GROUPS)[number]['key'];

/**
 * Поле норматива в форме — СТРОКА, не число: пустое значение обязано остаться пустым,
 * а `valueAsNumber` превращает '' в NaN и ломает «не заполнено ⇒ как по умолчанию».
 * Пустая строка валидна и означает «ключ не писать».
 */
const dwellFieldSchema = z
  .string()
  .trim()
  .refine((s) => s === '' || /^\d+$/.test(s), 'Только целое число дней')
  .refine(
    (s) => s === '' || (Number(s) >= STAGE_DWELL_MIN && Number(s) <= STAGE_DWELL_MAX),
    `Допустимо ${STAGE_DWELL_MIN}–${STAGE_DWELL_MAX}`,
  );

/** Форма секции настроек: порог тишины + четыре норматива дней в стадии. */
export const orgSettingsFormSchema = z.object({
  reconnect_days: reconnectDaysSchema,
  stage_dwell: z.object({
    attraction: dwellFieldSchema,
    working: dwellFieldSchema,
    approval: dwellFieldSchema,
    closing: dwellFieldSchema,
  }),
});
export type OrgSettingsFormValues = z.infer<typeof orgSettingsFormSchema>;

/** jsonb-настройки → строковые значения полей формы (отсутствие ключа ⇒ пустое поле). */
export function stageDwellToForm(
  thresholds: OrgSettings['stage_dwell_defaults'],
): OrgSettingsFormValues['stage_dwell'] {
  const read = (key: DwellPhaseGroup) => {
    const v = thresholds?.[key];
    return typeof v === 'number' ? String(v) : '';
  };
  return {
    attraction: read('attraction'),
    working: read('working'),
    approval: read('approval'),
    closing: read('closing'),
  };
}

/**
 * Значения формы → объект для `settings.stage_dwell_defaults`.
 *
 * ⚠️ Пустое поле НЕ пишется ключом со значением `null`/`undefined` — ключа просто нет.
 * Иначе `resolveDwellThreshold` получил бы `null`, `??` его не пропустил бы дальше,
 * и фолбэк `STALE_BY_PHASE` не сработал.
 *
 * Ключ `default` в форме не редактируется, но если он уже лежит в настройках (заведён
 * руками или будущей версией) — сохраняется: перезапись ключа целиком его бы стёрла.
 */
export function buildStageDwellDefaults(
  values: OrgSettingsFormValues['stage_dwell'],
  current?: OrgSettings['stage_dwell_defaults'],
): Record<string, number> {
  const out: Record<string, number> = {};
  if (typeof current?.default === 'number') out.default = current.default;

  for (const { key } of DWELL_PHASE_GROUPS) {
    const raw = values[key]?.trim() ?? '';
    if (raw === '') continue; // «как по умолчанию» — ключа нет
    const n = Number(raw);
    if (Number.isInteger(n) && n >= STAGE_DWELL_MIN && n <= STAGE_DWELL_MAX) out[key] = n;
  }
  return out;
}

/**
 * Разбор значения из БД (`unknown` — jsonb): невалидные/чужие ключи не роняют чтение.
 * Возвращает пустой объект, если значение вообще не объект.
 */
export function parseOrgSettings(raw: unknown): OrgSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const parsed = orgSettingsSchema.safeParse(raw);
  if (parsed.success) return parsed.data as OrgSettings;
  // Одно поле сломано (напр. reconnect_days пришёл строкой) — не теряем остальные:
  // отдаём объект как есть, потребители читают через `??` с дефолтом.
  const obj = raw as Record<string, unknown>;
  return {
    ...obj,
    reconnect_days:
      typeof obj.reconnect_days === 'number' && Number.isInteger(obj.reconnect_days)
        ? obj.reconnect_days
        : undefined,
  } as OrgSettings;
}
