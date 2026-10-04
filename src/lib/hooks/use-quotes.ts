'use client';

import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { fetchInBatches } from '@/lib/utils/query-batching';
import type { Quote, QuoteInsert, QuoteUpdate } from '@/types/entities';

// ═══════════════════════════════════════════════════════
// S-QUOTE-1: quotes (КП на сделке type='client').
// org_id проставляет триггер trg_set_org_id; created_by — DEFAULT auth.uid().
// Delete — прямой hard-delete по RLS (owner/admin/manager). Каскад со сделкой —
// на стороне БД (FK ON DELETE CASCADE), UI его не инициирует.
// ═══════════════════════════════════════════════════════

const QUOTE_COLS =
  'id, org_id, project_id, status, amount, currency, document_url, notes, valid_until, sent_at, accepted_at, rejection_reason, created_by, created_at, updated_at';

const quotesKey = (projectId: string) => ['quotes', projectId] as const;
/** Префикс пакетных ключей `useDealsQuotes`. */
const QUOTES_BULK_KEY = ['quotes', 'bulk'] as const;

/**
 * Сброс после мутации КП: ключ сделки И все пакетные ключи. Одна функция на три
 * мутации — иначе экран «Сегодня» (пакет) не увидел бы нового КП до `staleTime`,
 * а четвёртая мутация когда-нибудь забыла бы второй ключ.
 */
function invalidateQuoteKeys(qc: QueryClient, projectId: string) {
  void qc.invalidateQueries({ queryKey: quotesKey(projectId) });
  void qc.invalidateQueries({ queryKey: QUOTES_BULK_KEY });
}

/** КП сделки, свежие сверху. */
export function useQuotes(projectId: string) {
  const supabase = createClient();

  return useQuery({
    queryKey: quotesKey(projectId),
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotes')
        .select(QUOTE_COLS)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Quote[];
    },
  });
}

/**
 * КП пачки сделок одним запросом: Map<projectId, Quote[]>.
 *
 * Для экрана «Сегодня»: сумма (`dealHeaderAmount`) и сигнал «КП истекло» нужны по
 * всем сделкам сразу — запрос на сделку дал бы N запросов. Порядок внутри сделки —
 * как у `useQuotes` (свежие сверху), но домен (`pickActiveQuote`) сортирует сам.
 */
export function useDealsQuotes(projectIds: readonly string[]) {
  const supabase = createClient();
  const ids = [...projectIds].sort();

  return useQuery({
    queryKey: [...QUOTES_BULK_KEY, ids.join(',')],
    enabled: ids.length > 0,
    queryFn: async () => {
      const rows = await fetchInBatches(ids, async (batch) => {
        const { data, error } = await supabase
          .from('quotes')
          .select(QUOTE_COLS)
          .in('project_id', batch)
          .order('created_at', { ascending: false });
        if (error) throw error;
        return (data ?? []) as Quote[];
      });
      const map = new Map<string, Quote[]>();
      for (const q of rows) {
        const list = map.get(q.project_id);
        if (list) list.push(q);
        else map.set(q.project_id, [q]);
      }
      return map;
    },
  });
}

/** Создать КП. amount уже в копейках (form → parseBudgetInput). */
export function useCreateQuote(projectId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Omit<QuoteInsert, 'project_id' | 'org_id' | 'created_by'>) => {
      const { data, error } = await supabase
        .from('quotes')
        .insert({ ...input, project_id: projectId })
        .select(QUOTE_COLS)
        .single();
      if (error) throw error;
      return data as Quote;
    },
    onSuccess: () => {
      invalidateQuoteKeys(queryClient, projectId);
    },
  });
}

/**
 * Обновить КП (в т.ч. смену статуса — триггер stamp_quote_status проставит
 * sent_at/accepted_at). Отдельный статус-мьютатор не нужен.
 */
export function useUpdateQuote(projectId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: QuoteUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('quotes')
        .update(updates)
        .eq('id', id)
        .select(QUOTE_COLS)
        .single();
      if (error) throw error;
      return data as Quote;
    },
    onSuccess: () => {
      invalidateQuoteKeys(queryClient, projectId);
    },
  });
}

/** Удалить КП (hard-delete по RLS). */
export function useDeleteQuote(projectId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('quotes').delete().eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      invalidateQuoteKeys(queryClient, projectId);
    },
  });
}
