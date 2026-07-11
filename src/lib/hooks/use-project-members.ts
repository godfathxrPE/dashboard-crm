'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSync } from './use-realtime';
import { PROJECT_MEMBER_ROLE_ORDER } from '@/lib/constants/delivery-phases';
import type { ProjectMemberRole } from '@/types/database';

/**
 * P2b: команда delivery-проекта (project_members, миграция 037).
 *
 * Ключ ['project_members', projectId] — префикс совпадает с именем таблицы,
 * поэтому useRealtimeSync('project_members') инвалидирует его автоматически
 * (публикация supabase_realtime — 037/A4). RLS write — owner/admin ∨ владелец
 * проекта; UI гейтит те же права через canManageDeliveryProject (B0).
 */

export interface ProjectMember {
  id: string;
  org_id: string;
  project_id: string;
  profile_id: string;
  role: ProjectMemberRole;
  created_at: string;
  profile: { id: string; full_name: string; avatar_url: string | null } | null;
}

const listKey = (projectId: string) => ['project_members', projectId] as const;

/** Члены по ролям в порядке PROJECT_MEMBER_ROLE_ORDER (чистый хелпер — юнит-тестится) */
export function groupMembersByRole(
  members: ReadonlyArray<ProjectMember>,
): Array<{ role: ProjectMemberRole; members: ProjectMember[] }> {
  return PROJECT_MEMBER_ROLE_ORDER.map((role) => ({
    role,
    members: members.filter((m) => m.role === role),
  })).filter((g) => g.members.length > 0);
}

export function useProjectMembers(projectId: string) {
  const supabase = createClient();
  useRealtimeSync('project_members');

  return useQuery({
    queryKey: listKey(projectId),
    queryFn: async (): Promise<ProjectMember[]> => {
      const { data, error } = await supabase
        .from('project_members')
        .select('*, profile:profiles(id, full_name, avatar_url)')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as ProjectMember[];
    },
    enabled: !!projectId,
  });
}

/** Дружелюбный текст ошибок add/update (unique violation — гонка двух вкладок) */
export function parseMemberError(err: unknown): string {
  const e = err as { code?: string; message?: string } | null;
  if (e?.code === '23505') return 'Этот сотрудник уже в команде проекта';
  if (e?.code === '42501') return 'Недостаточно прав: команду меняет владелец проекта или админ организации';
  return e?.message ?? 'Не удалось изменить команду';
}

/** Добавить члена команды — оптимистично (профиль подтянет invalidate) */
export function useAddProjectMember(projectId: string) {
  const supabase = createClient();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { profile_id: string; role: ProjectMemberRole }) => {
      const { data, error } = await supabase
        .from('project_members')
        .insert({ project_id: projectId, ...input })
        .select('*, profile:profiles(id, full_name, avatar_url)')
        .single();

      if (error) throw error;
      return data as ProjectMember;
    },
    onMutate: async (input) => {
      const key = listKey(projectId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ProjectMember[]>(key);
      const optimistic: ProjectMember = {
        id: `temp-${input.profile_id}`,
        org_id: '',
        project_id: projectId,
        profile_id: input.profile_id,
        role: input.role,
        created_at: new Date().toISOString(),
        profile: null,
      };
      qc.setQueryData<ProjectMember[]>(key, (old) => [...(old ?? []), optimistic]);
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(listKey(projectId), ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: listKey(projectId) }),
  });
}

/** Сменить роль члена команды — оптимистично */
export function useUpdateProjectMemberRole(projectId: string) {
  const supabase = createClient();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, role }: { id: string; role: ProjectMemberRole }) => {
      const { error } = await supabase.from('project_members').update({ role }).eq('id', id);
      if (error) throw error;
    },
    onMutate: async ({ id, role }) => {
      const key = listKey(projectId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ProjectMember[]>(key);
      qc.setQueryData<ProjectMember[]>(key, (old) =>
        (old ?? []).map((m) => (m.id === id ? { ...m, role } : m)),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(listKey(projectId), ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: listKey(projectId) }),
  });
}

/** Убрать члена из команды — оптимистично */
export function useRemoveProjectMember(projectId: string) {
  const supabase = createClient();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('project_members').delete().eq('id', id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      const key = listKey(projectId);
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ProjectMember[]>(key);
      qc.setQueryData<ProjectMember[]>(key, (old) => (old ?? []).filter((m) => m.id !== id));
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(listKey(projectId), ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: listKey(projectId) }),
  });
}
