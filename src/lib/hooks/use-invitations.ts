'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { Invitation, InvitableRole } from '@/types/database';

const QUERY_KEY = ['invitations'] as const;

/**
 * Ссылка-приглашение для ручной передачи (T1a, токен-flow). Токен-uuid в URL —
 * bearer-секрет: по нему `/invite` зовёт accept_invitation(token) и создаёт membership
 * для залогиненного пользователя. Заменяет старый login-flow с матчингом по email
 * при signup (был сломан таймингом подтверждения auth.users). Авто-письмо — T1b.
 */
export function inviteLink(token: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/invite?token=${token}`;
}

/** Непринятые приглашения текущей org (RLS: только owner/admin). */
export function useInvitations() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<Invitation[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('invitations')
        .select('*')
        .is('accepted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Invitation[];
    },
    staleTime: 1000 * 60,
  });
}

/** Создать приглашение. Возвращает invite-ссылку для ручной передачи. */
export function useCreateInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, role }: { email: string; role: InvitableRole }): Promise<string> => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // invitations без set_org_id-триггера → org_id задаём явно.
      const { data: orgId, error: orgErr } = await supabase.rpc('current_org_id');
      if (orgErr) throw orgErr;
      if (!orgId) throw new Error('Нет активной организации');

      // .select('id, token').single() — токен нужен в URL ссылки (иначе copy бесполезен)
      const { data, error } = await supabase.from('invitations').insert({
        org_id: orgId as string,
        email: email.trim().toLowerCase(),
        role,
        invited_by: user.id,
      }).select('id, token').single();
      if (error) throw error;
      return inviteLink((data as { token: string }).token);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

/** Отозвать приглашение. */
export function useRevokeInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from('invitations').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
