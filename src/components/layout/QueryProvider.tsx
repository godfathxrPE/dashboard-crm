'use client';

import {
  QueryClient,
  QueryClientProvider,
  MutationCache,
  QueryCache,
} from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { isAuthError, isGateError, humanizeError } from '@/lib/errors';
import { handleSessionExpired } from '@/lib/session';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => {
    const client: QueryClient = new QueryClient({
      defaultOptions: {
        queries: {
          // Данные считаются свежими 30 сек — не перезапрашиваем при каждом фокусе
          staleTime: 30 * 1000,
          // При ошибке — 1 retry с задержкой
          retry: 1,
        },
      },
      // AUDIT A1.1: единый обработчик отказов мутаций. Локальные onError хуков
      // (optimistic-rollback) продолжают работать — react-query зовёт и их, и этот.
      mutationCache: new MutationCache({
        onError: (error, _vars, _ctx, mutation) => {
          if (isAuthError(error)) return handleSessionExpired(client);
          // Мутация показывает ошибку сама (meta.silentError) или это гейт со своим UI.
          if (mutation.options.meta?.silentError) return;
          if (isGateError(error)) return;
          toast.error(humanizeError(error));
        },
      }),
      // Запросы: тостить каждый упавший fetch — шумно (у экранов свои empty/error
      // состояния). Ловим только протухшую сессию — один редирект на всех.
      queryCache: new QueryCache({
        onError: (error) => {
          if (isAuthError(error)) handleSessionExpired(client);
        },
      }),
    });
    return client;
  });

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
