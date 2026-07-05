import type { Project } from '@/lib/hooks/use-projects';
import { getDealHealth } from './deal-health';

// Быстрые пресеты фильтров раздела «Проекты» (URL ?q=)
export type ProjectQuickFilter = 'attention' | 'nobudget';

export function isQuickFilter(v: string | null): v is ProjectQuickFilter {
  return v === 'attention' || v === 'nobudget';
}

export function applyProjectQuickFilter<T extends Project>(
  list: T[],
  f: ProjectQuickFilter | null | undefined,
): T[] {
  if (!f) return list;
  const isActive = (p: Project) => p.status !== 'won' && p.status !== 'lost';
  if (f === 'attention') {
    // Гниющие: нет шага / шаг просрочен (getDealHealth сам учитывает status)
    return list.filter((p) => getDealHealth(p) !== 'ok');
  }
  return list.filter((p) => isActive(p) && (p.budget == null || p.budget === 0));
}
