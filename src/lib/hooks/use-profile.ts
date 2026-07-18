'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/types/entities';
import type { ProfileFormData } from '@/lib/validators/profile';

export const MY_PROFILE_KEY = ['profile', 'me'] as const;

/** Собственный профиль текущего пользователя (для Настроек и /welcome). */
export function useMyProfile() {
  return useQuery({
    queryKey: MY_PROFILE_KEY,
    queryFn: async (): Promise<Profile | null> => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Правка собственного профиля из Настроек — прямой update под RLS
 * (profiles_update_own: USING+CHECK id=auth.uid()). Онбординг идёт другим
 * путём — RPC complete_onboarding (серверный гард «имя обязательно» + стемп
 * onboarded_at), см. ProfileForm mode='onboarding'.
 */
export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: ProfileFormData) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: values.full_name.trim(),
          phone: values.phone?.trim() || null,
          job_title: values.job_title?.trim() || null,
        })
        .eq('id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MY_PROFILE_KEY });
      qc.invalidateQueries({ queryKey: ['team-members'] });
    },
  });
}
