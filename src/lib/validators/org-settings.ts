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

/** Форма секции настроек: одно поле, отдельная схема — сообщения об ошибках в RHF. */
export const orgSettingsFormSchema = z.object({
  reconnect_days: reconnectDaysSchema,
});
export type OrgSettingsFormValues = z.infer<typeof orgSettingsFormSchema>;

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
