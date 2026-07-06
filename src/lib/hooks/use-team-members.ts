'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { OrgRole } from '@/types/database';

const QUERY_KEY = ['team-members'] as const;

export interface TeamMember {
  id: string;                 // profile id (= auth.uid)
  full_name: string;
  avatar_url: string | null;
  role: OrgRole | null;       // роль в текущей org (из memberships)
  membership_id: string | null;
}

/**
 * Со-члены организации текущего пользователя.
 *
 * profiles RLS (shares_org_with, S24) ограничивает выборку членами той же org.
 * Роль и id membership берём вторым запросом к memberships (RLS: is_org_member) —
 * нужны для бейджей и управления командой на Settings → Team. AssigneeSelect
 * использует только id/full_name/avatar_url, так что расширение обратно-совместимо.
 */
export function useTeamMembers() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<TeamMember[]> => {
      const supabase = createClient();
      const [{ data: profiles, error: pErr }, { data: memberships, error: mErr }] =
        await Promise.all([
          supabase.from('profiles').select('id, full_name, avatar_url').order('full_name'),
          supabase.from('memberships').select('id, profile_id, role'),
        ]);
      if (pErr) throw pErr;
      if (mErr) throw mErr;

      const byProfile = new Map(
        (memberships ?? []).map((m) => [m.profile_id, { id: m.id, role: m.role as OrgRole }]),
      );

      return (profiles ?? []).map((p) => {
        const m = byProfile.get(p.id);
        return {
          id: p.id,
          full_name: p.full_name,
          avatar_url: p.avatar_url,
          role: m?.role ?? null,
          membership_id: m?.id ?? null,
        };
      });
    },
    staleTime: 1000 * 60 * 5,
  });
}

/** Сменить роль члена. owner может назначать owner — RLS/триггер подстрахуют. */
export function useUpdateMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ membershipId, role }: { membershipId: string; role: OrgRole }) => {
      const supabase = createClient();
      const { error } = await supabase.from('memberships').update({ role }).eq('id', membershipId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      qc.invalidateQueries({ queryKey: ['org-role'] });
    },
  });
}

/** Удалить члена из команды (owner/admin; себя удалять UI не даёт). */
export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (membershipId: string) => {
      const supabase = createClient();
      const { error } = await supabase.from('memberships').delete().eq('id', membershipId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
