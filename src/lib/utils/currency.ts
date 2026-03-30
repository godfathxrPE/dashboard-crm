/**
 * Форматирует бюджет в рублях.
 * 11000000 → "11 000 000 ₽"
 * Хранение в БД: kopecks (bigint). На фронте: рубли.
 */
export function formatBudget(kopecks: number | null | undefined): string {
  if (kopecks == null || kopecks === 0) return '—';

  const rubles = kopecks / 100;
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(rubles);
}

/**
 * Парсит строку бюджета в копейки.
 * "11 000 000" → 1100000000
 */
export function parseBudget(value: string): number {
  const cleaned = value.replace(/[^\d]/g, '');
  const rubles = parseInt(cleaned, 10);
  if (isNaN(rubles)) return 0;
  return rubles * 100; // → копейки
}

/**
 * Форматирует число с разделителями тысяч.
 * 1234567 → "1 234 567"
 */
export function formatNumber(n: number): string {
  return new Intl.NumberFormat('ru-RU').format(n);
}
