/**
 * Вывод связей (компания/проект) из выбранного контакта для модалок события
 * (звонок/встреча). Чистая функция: возвращает только ОДНОЗНАЧНО выводимое.
 *
 * Правило: подставляем поле, только если у контакта ровно ОДИН кандидат в этой
 * категории. 0 или >1 → поле не возвращаем (не угадываем — риск неверной атрибуции
 * при many-to-many компаниях / нескольких активных сделках).
 *
 * Применяется И на ручной выбор контакта (onChange), И на открытие модалки с
 * defaultContactId (reset не триггерит onChange). Гейт «только пустые поля» и
 * исключение edit-режима — на стороне вызова, не здесь.
 */

/** Минимальная форма контакта: привязки к компаниям через contact_company. */
export interface ContactLike {
  id: string;
  companies?: { company_id: string }[] | null;
}

/**
 * Контакт связан с компанией. Связь M:N через junction `contact_company`
 * (`contact.companies[]`), поля `company_id` на контакте НЕТ — проверять по
 * массиву. Без выбранной компании принадлежность не определена → false;
 * «показывать ли всех» решает вызывающий (см. `contactsForCompany`).
 */
export function contactBelongsToCompany(
  contact: ContactLike,
  companyId: string | null | undefined,
): boolean {
  if (!companyId) return false;
  return !!contact.companies?.some((cc) => cc.company_id === companyId);
}

/**
 * Контакты, доступные при выбранной компании: её контакты, а без компании —
 * все. Единственная точка этого правила: до S-FIX-BATCH-1 предикат был скопирован
 * в четыре места, а в `TaskModal` его не было вовсе — при выбранной компании
 * список показывал все контакты организации.
 */
export function contactsForCompany<C extends ContactLike>(
  contacts: C[] | null | undefined,
  companyId: string | null | undefined,
): C[] {
  const list = contacts ?? [];
  if (!companyId) return list;
  return list.filter((c) => contactBelongsToCompany(c, companyId));
}

/** Минимальная форма проекта: принадлежность контакту. */
interface ProjectLike {
  id: string;
  contact_id: string | null;
}

export interface DeriveLinksDeps<P extends ProjectLike> {
  contacts?: ContactLike[] | null;
  projects?: P[] | null;
  /**
   * Предикат «проект активен» — совпадает с фильтром выпадающего списка проектов
   * в конкретной модалке, чтобы выведенный проект всегда был из числа выбираемых.
   * По умолчанию — не выигранные и не проигранные по status (internal-safe).
   */
  isActiveProject?: (project: P) => boolean;
}

export interface DerivedLinks {
  company_id?: string;
  project_id?: string;
}

export function deriveFromContact<P extends ProjectLike & { status?: string | null }>(
  contactId: string | null | undefined,
  deps: DeriveLinksDeps<P>,
): DerivedLinks {
  const result: DerivedLinks = {};
  if (!contactId) return result;

  const links = deps.contacts?.find((c) => c.id === contactId)?.companies ?? [];
  if (links.length === 1) result.company_id = links[0].company_id;

  const isActive =
    deps.isActiveProject ?? ((p: P) => p.status !== 'won' && p.status !== 'lost');
  const active = (deps.projects ?? []).filter(
    (p) => p.contact_id === contactId && isActive(p),
  );
  if (active.length === 1) result.project_id = active[0].id;

  return result;
}
