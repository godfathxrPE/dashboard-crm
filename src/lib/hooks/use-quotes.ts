'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { Quote, QuoteInsert, QuoteUpdate } from '@/types/entities';

// ═══════════════════════════════════════════════════════
// S-QUOTE-1: quotes (КП на сделке type='client').
// org_id проставляет триггер trg_set_org_id; created_by — DEFAULT auth.uid().
// Delete — прямой hard-delete по RLS (owner/admin/manager). Каскад со сделкой —
// на стороне БД (FK ON DELETE CASCADE), UI его не инициирует.
// ═══════════════════════════════════════════════════════

const QUOTE_COLS =
  'id, org_id, project_id, status, amount, currency, document_url, notes, valid_until, sent_at, accepted_at, created_by, created_at, updated_at';

const quotesKey = (projectId: string) => ['quotes', projectId] as const;

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
      queryClient.invalidateQueries({ queryKey: quotesKey(projectId) });
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
      queryClient.invalidateQueries({ queryKey: quotesKey(projectId) });
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
      queryClient.invalidateQueries({ queryKey: quotesKey(projectId) });
    },
  });
}
