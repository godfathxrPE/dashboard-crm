// ═══════════════════════════════════════════════════════
// projectHref — единый резолвер detail-роута строки projects.
// Routing-контракт (спринт delivery P1):
//   client            → /deals/[id]   (раздел «Сделки»)
//   delivery/internal → /projects/[id] (раздел «Проекты»)
// Для точек без type (уведомления, timeline, joined-подзапросы) ссылаемся на
// /deals/[id] — серверный бэкстоп в deals/[id]/page.tsx перенаправит по типу.
// ═══════════════════════════════════════════════════════

export function projectHref(project: { id: string; type?: string | null }): string {
  return project.type === 'client' || project.type == null
    ? `/deals/${project.id}`
    : `/projects/${project.id}`;
}
