import { z } from 'zod';
import type { PhoneEntry } from '@/types/database';

// Зеркало типа PhoneEntry (src/types/database.ts). Мультителефон, миграция 041.
export const phoneEntrySchema = z.object({
  type: z.enum(['mobile', 'work', 'other']).default('mobile'),
  value: z.string().trim().min(1, 'Введи номер'),
  is_primary: z.boolean().default(false),
});

/** Человеко-читаемый лейбл типа телефона (RU). */
export const PHONE_TYPE_LABEL: Record<PhoneEntry['type'], string> = {
  mobile: 'Мобильный',
  work: 'Рабочий',
  other: 'Другой',
};

/**
 * Primary-телефон массива → одиночная колонка `phone` (backward-compat зеркало).
 * Приоритет: явный is_primary → первый непустой. null, если валидных номеров нет.
 */
export function primaryPhone(phones: PhoneEntry[] | null | undefined): string | null {
  if (!phones?.length) return null;
  const valid = phones.filter((p) => p.value?.trim());
  if (!valid.length) return null;
  return (valid.find((p) => p.is_primary) ?? valid[0]).value.trim();
}

/**
 * Нормализация массива перед сохранением: убрать пустые строки, гарантировать
 * ровно один is_primary (первый, если ни один не помечен).
 */
export function normalizePhones(phones: PhoneEntry[] | null | undefined): PhoneEntry[] {
  const valid = (phones ?? [])
    .filter((p) => p.value?.trim())
    .map((p) => ({ ...p, value: p.value.trim() }));
  if (!valid.length) return [];
  const hasPrimary = valid.some((p) => p.is_primary);
  return valid.map((p, i) => ({ ...p, is_primary: hasPrimary ? p.is_primary : i === 0 }));
}
