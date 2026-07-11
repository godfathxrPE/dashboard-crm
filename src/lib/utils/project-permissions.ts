import type { OrgRole } from '@/types/database';

/**
 * P2b (B0): контракт прав UI = RLS. Управление delivery-проектом — команда
 * (project_members), «Создать из шаблона» (apply_delivery_template), CRUD фаз —
 * разрешено org owner/admin ИЛИ владельцу проекта (owner_id/created_by).
 * Это УЖЕ, чем canEdit задач (role !== 'viewer') — тот НЕ сужаем: org-wide
 * работа с задачами остаётся (S25).
 */
export function canManageDeliveryProject(
  project: { owner_id: string | null; created_by: string | null },
  orgRole: OrgRole | null | undefined,
  userId: string | undefined,
): boolean {
  if (!userId) return false;
  if (orgRole === 'owner' || orgRole === 'admin') return true;
  return project.owner_id === userId || project.created_by === userId;
}
