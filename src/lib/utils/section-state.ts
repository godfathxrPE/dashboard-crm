/**
 * Состояние свёрнутости виджета зоны «Работа» (S-DEAL-LAYOUT-1) — per-виджет
 * per-сделка в localStorage. Ключ и разбор значения вынесены из хука отдельными
 * функциями: правило проекта — тестируемое живёт в `lib/`, чтение/запись
 * localStorage внутри React-хука тестом не накрыть.
 */

export function sectionStorageKey(projectId: string, sectionId: string): string {
  return `deal-section:${projectId}:${sectionId}`;
}

/**
 * Прочитать состояние секции. Неизвестное значение в хранилище и любой сбой
 * чтения (приватный режим Safari бросает на `localStorage.getItem`) — дефолт,
 * без падения.
 */
export function readSectionExpanded(
  projectId: string,
  sectionId: string,
  defaultExpanded: boolean,
): boolean {
  try {
    const raw = localStorage.getItem(sectionStorageKey(projectId, sectionId));
    if (raw === '1') return true;
    if (raw === '0') return false;
    return defaultExpanded;
  } catch {
    return defaultExpanded;
  }
}

/** Записать состояние секции. Сбой записи (приватный режим) — молча игнорируется. */
export function writeSectionExpanded(
  projectId: string,
  sectionId: string,
  expanded: boolean,
): void {
  try {
    localStorage.setItem(sectionStorageKey(projectId, sectionId), expanded ? '1' : '0');
  } catch {
    // приватный режим / квота — состояние остаётся только в памяти на эту сессию
  }
}
