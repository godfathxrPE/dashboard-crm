/**
 * Единое правило показа имени контакта.
 *
 * До S-FORMAT-1 их было два: `DealStakeholders` печатал «Наталья», а локальная
 * `shortName` в `DealSummaryCard` при пустой фамилии отдавала « Н.» — имя
 * человека со «Сводки» пропадало (F-01). Одни данные — одно правило.
 */

const clean = (value: string | null | undefined): string => (value ?? '').trim();

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
