'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

const QUERY_KEY = ['team-members'] as const;

export interface TeamMember {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

/**
 * Со-члены организации текущего пользователя (для назначения записей).
 *
 * RLS на `profiles` (shares_org_with, S24) сам ограничивает выборку членами
 * той же org — здесь дополнительной фильтрации не нужно. Используется в
 * AssigneeSelect: assigned_to (задачи) и owner_id (проекты/компании/контакты).
 */
export function useTeamMembers() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<TeamMember[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .order('full_name');
      if (error) throw error;
      return (data ?? []) as TeamMember[];
    },
    staleTime: 1000 * 60 * 5,
  });
}
