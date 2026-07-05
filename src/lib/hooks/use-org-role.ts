'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { OrgRole } from '@/types/database';

const QUERY_KEY = ['org-role'] as const;

/**
 * Роль текущего пользователя в его текущей организации.
 *
 * Читает `current_org_role()` (SECURITY DEFINER, S24). Возвращает `null`,
 * если у пользователя нет membership.
 *
 * ⚠️ S24: хук создан, но к UI НЕ подключён. S25 переведёт условия видимости
 * кнопок/меню с `profiles.role` на `useOrgRole()`.
 */
export function useOrgRole() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<OrgRole | null> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('current_org_role');
      if (error) throw error;
      return (data as OrgRole | null) ?? null;
    },
    staleTime: 1000 * 60 * 5,
  });
}
