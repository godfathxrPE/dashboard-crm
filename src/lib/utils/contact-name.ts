/**
 * Единое правило показа имени контакта.
 *
 * До S-FORMAT-1 их было два: `DealStakeholders` печатал «Наталья», а локальная
 * `shortName` в `DealSummaryCard` при пустой фамилии отдавала « Н.» — имя
 * человека со «Сводки» пропадало (F-01). Одни данные — одно правило.
 */

/**
 * Заполнители, которыми импорт заменяет пустое значение. Проверено запросом к
 * проду на гейте S-FORMAT-1: у пяти контактов `last_name = '-'` (в том числе у
 * контакта, ради которого чинили F-01), ещё у 13 фамилия NULL. Для показа дефис
 * — то же отсутствие данных, что и NULL.
 *
 * Сравнение ТОЧНОЕ, не по длине и не по подстроке: в базе есть настоящие
 * трёхбуквенные фамилии («Цой», «Гук»), а дефис внутри фамилии законен
 * («Римский-Корсаков»).
 */
const PLACEHOLDERS = new Set(['-', '–', '—', '.', '_']);

const clean = (value: string | null | undefined): string => {
  const v = (value ?? '').trim();
  return PLACEHOLDERS.has(v) ? '' : v;
};

/** Полное имя: «Денис Трубачев». Нечего показать — прочерк. */
export function formatContactName(
  first: string | null | undefined,
  last: string | null | undefined,
): string {
  return [clean(first), clean(last)].filter(Boolean).join(' ') || '—';
}

/**
 * Короткое имя для узких мест (рельс 320px): «Трубачев Д.».
 * Сокращаем только когда есть обе части — иначе показываем то, что есть,
 * целиком: инициал вместо единственного известного слова теряет информацию.
 */
export function formatContactNameShort(
  first: string | null | undefined,
  last: string | null | undefined,
): string {
  const f = clean(first);
  const l = clean(last);
  if (f && l) return `${l} ${f.charAt(0)}.`;
  return f || l || '—';
}
