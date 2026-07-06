'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useRealtimeSync } from '@/lib/hooks/use-realtime';
import type { Notification } from '@/types/database';

const QUERY_KEY = ['notifications'] as const;

/**
 * Уведомления текущего пользователя (v1: «тебе назначили»).
 * RLS отдаёт только свои (recipient_id = auth.uid()). Непрочитанные — первыми,
 * затем по свежести; лимит 30. Realtime: INSERT из definer-триггеров
 * notify_*_assigned инвалидирует кеш → колокольчик обновляется без refetch.
 */
export function useNotifications() {
  useRealtimeSync('notifications');

  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<Notification[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('read_at', { ascending: true, nullsFirst: true })
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
    staleTime: 1000 * 30,
  });
}

/** Число непрочитанных (для бейджа). Считается из того же кеша, что и список. */
export function useUnreadCount(): number {
  const { data } = useNotifications();
  return (data ?? []).filter((n) => n.read_at === null).length;
}

/** Отметить одно уведомление прочитанным. */
export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

/** Отметить все непрочитанные прочитанными. */
export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const supabase = createClient();
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .is('read_at', null);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
