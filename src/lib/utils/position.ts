// Схлопывание синонимов должностей в один фильтр-чип.
// Display/filter-only — стораджа contact.position НЕ переписывает.
const POSITION_ALIASES: Record<string, string> = {
  'гд': 'Генеральный директор',
  'ит-директор': 'Директор по информационным технологиям',
  'it директор': 'Директор по информационным технологиям',
  'директор it': 'Директор по информационным технологиям',
  'глав. бух.': 'Главный бухгалтер',
};

/** Каноническая должность: схлопнуть пробелы + известные синонимы. */
export function canonicalPosition(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  return POSITION_ALIASES[cleaned.toLowerCase()] ?? cleaned;
}
