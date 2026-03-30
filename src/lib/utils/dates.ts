import { format, formatDistanceToNow, isToday, isYesterday, isTomorrow } from 'date-fns';
import { ru } from 'date-fns/locale';

/**
 * Форматирует дату в человеко-читаемый вид.
 * "Сегодня", "Вчера", "Завтра", или "15 марта 2026"
 */
export function formatDateHuman(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  if (isToday(d))     return 'Сегодня';
  if (isYesterday(d)) return 'Вчера';
  if (isTomorrow(d))  return 'Завтра';

  return format(d, 'd MMMM yyyy', { locale: ru });
}

/**
 * "3 часа назад", "вчера", "2 дня назад"
 */
export function formatRelative(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return formatDistanceToNow(d, { addSuffix: true, locale: ru });
}

/**
 * "15 мар" — короткий формат для карточек
 */
export function formatDateShort(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'd MMM', { locale: ru });
}

/**
 * "Пн, 15 мар" — с днём недели
 */
export function formatDateWithDay(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'EEEEEE, d MMM', { locale: ru });
}

/**
 * ISO week start (Monday) для KPI-недели
 */
export function getWeekStart(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return format(d, 'yyyy-MM-dd');
}
