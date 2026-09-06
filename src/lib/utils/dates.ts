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
 * "04.09.2026" — числовой формат для рельса сделки.
 *
 * Заведён в S-FORMAT-1: в «Сводке» соседние строки печатали дату двумя разными
 * форматами (F-02). Инлайн `toLocaleDateString` в компонентах не заводить —
 * иначе форматы снова разъедутся.
 */
export function formatDateNumeric(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'dd.MM.yyyy', { locale: ru });
}

/**
 * "03.08.2026" — КАЛЕНДАРНАЯ дата: 'YYYY-MM-DD' без момента времени.
 *
 * Отдельно от `formatDateNumeric` из-за парсинга, а не формата — формат тот же.
 * `new Date('2026-08-03')` по спеке ECMAScript — UTC-полночь, а `format` печатает
 * в ЛОКАЛЬНОЙ зоне: при отрицательном смещении дата уезжает НА СУТКИ НАЗАД
 * (замерено: America/New_York и America/Los_Angeles дают «02.08.2026», MSK и UTC —
 * «03.08.2026»). Суффикс `T00:00:00` БЕЗ `Z` парсится как локальная полночь и
 * стабилен в любой зоне.
 *
 * Звать для значений, у которых нет времени по построению: колонки `date`,
 * ввод `<input type="date">`, датированные снапшоты справочников. Для
 * `timestamptz` он не нужен — там момент есть, и сдвига по определению нет.
 */
export function formatCalendarDate(isoDate: string): string {
  return formatDateNumeric(`${isoDate}T00:00:00`);
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
