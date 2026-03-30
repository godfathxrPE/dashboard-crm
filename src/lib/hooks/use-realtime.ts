'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

/**
 * Подписка на Supabase Realtime для таблицы.
 * При любом изменении (INSERT/UPDATE/DELETE) — инвалидирует кеш React Query.
 *
 * Использование:
 *   useRealtimeSync('tasks');   // автоматически перезапросит tasks при изменениях
 *   useRealtimeSync('projects');
 */
export function useRealtimeSync(table: string, _queryKey?: readonly string[]) {
  const queryClient = useQueryClient();
  const supabase = createClient();

  useEffect(() => {
    const channel = supabase
      .channel(`realtime-${table}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          queryClient.invalidateQueries({ queryKey: [table] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, queryClient, supabase]);
}
