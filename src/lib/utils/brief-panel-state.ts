/**
 * S-BRIEF-IN-DEAL-1.2: состояние панели AI-брифа в шаге сделки — localStorage.
 * По образцу `section-state.ts`: ключи и разбор — чистые функции, любой сбой
 * хранилища (приватный режим Safari бросает) — дефолт, без падения.
 *
 *  · `deal-brief:open` — раскрыта ли панель; ОДИН выбор на все сделки (решение
 *    владельца 03.10), а не per-сделка, как у секций зоны «Работа»;
 *  · `deal-brief:seen:<companyId>` — id последнего увиденного прогона брифа. Одна
 *    запись на компанию: хранилище не растёт с числом брифов.
 */

export const BRIEF_PANEL_OPEN_KEY = 'deal-brief:open';

export function briefSeenKey(companyId: string): string {
  return `deal-brief:seen:${companyId}`;
}

export function readBriefPanelOpen(): boolean {
  try {
    return localStorage.getItem(BRIEF_PANEL_OPEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeBriefPanelOpen(open: boolean): void {
  try {
    localStorage.setItem(BRIEF_PANEL_OPEN_KEY, open ? '1' : '0');
  } catch {
    // приватный режим / квота — состояние живёт только в памяти до перезагрузки
  }
}

export function readBriefSeen(companyId: string): string | null {
  try {
    return localStorage.getItem(briefSeenKey(companyId)) || null;
  } catch {
    return null;
  }
}

export function writeBriefSeen(companyId: string, runId: string): void {
  try {
    localStorage.setItem(briefSeenKey(companyId), runId);
  } catch {
    // см. writeBriefPanelOpen
  }
}
