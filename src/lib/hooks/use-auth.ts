'use client';

import { useEffect, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { handleSessionExpired } from '@/lib/session';
import type { User } from '@supabase/supabase-js';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const queryClient = useQueryClient();

  useEffect(() => {
    // Получаем текущую сессию
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      setUser(u);
      setLoading(false);
    });

    // Слушаем изменения auth state
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
        // AUDIT 2.1: сессия оборвалась (отзыв/протухший refresh/logout) — чистим
        // кеш и уводим на /login. Без тоста: добровольный logout не должен писать
        // «Сессия истекла» (для истечения по in-flight запросу тост даёт QueryProvider).
        if (event === 'SIGNED_OUT') handleSessionExpired(queryClient, false);
      },
    );

    return () => subscription.unsubscribe();
  }, [supabase, queryClient]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }, [supabase]);

  return { user, loading, signOut };
}
