'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { RecurringTaskTemplate, RecurringCadence, TaskLane, TaskPriority } from '@/types/database';

// ═══════════════════════════════════════════════════════
// S-RECUR-1: recurring_task_templates (069 — на гейте). Таблицы ещё нет в
// автогенерации supabase.gen.ts → PostgrestClient<Database>.from() не резолвит
// её ключ (Insert/Update схлопываются в `never`). `Chain` — минимальный
// структурный тип ровно под используемые методы (select/insert/update/delete/
// eq/order/single + thenable), приобретаемый через `unknown`-каст (тот же приём,
// что и SupabaseClient<Database> в lib/supabase/client.ts), БЕЗ `any`. После
// apply + `npx supabase gen types` файл возвращается на обычный createClient().
// org_id проставляет trg_set_org_id; created_by — DEFAULT auth.uid(). Спавн
// инстансов — только spawn_recurring_tasks() (SECURITY DEFINER, cron); клиент
// шаблоны не спавнит.
// ═══════════════════════════════════════════════════════

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
}

interface Chain {
  select(cols: string): Chain;
  insert(values: unknown): Chain;
  update(values: unknown): Chain;
  delete(): Chain;
  eq(col: string, value: string): Chain;
  order(col: string, opts: { ascending: boolean }): Chain;
  single(): Chain;
  then<TResult>(onfulfilled: (value: QueryResult) => TResult | PromiseLike<TResult>): Promise<TResult>;
}

function rtt(): Chain {
  return (createClient() as unknown as { from(table: string): Chain }).from('recurring_task_templates');
}

export interface RecurringTemplateInput {
  text: string;
  cadence: RecurringCadence;
  weekly_dow: number | null;
  monthly_dom: number | null;
  priority: TaskPriority;
  lane: TaskLane;
  project_id: string | null;
  company_id: string | null;
  contact_id: string | null;
  assigned_to: string | null;
  next_run_date: string;
  is_active?: boolean;
}

const QUERY_KEY = ['recurring-templates'] as const;

export function useRecurringTemplates() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<RecurringTaskTemplate[]> => {
      const { data, error } = await rtt().select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as RecurringTaskTemplate[];
    },
  });
}

export function useCreateRecurringTemplate() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: RecurringTemplateInput): Promise<RecurringTaskTemplate> => {
      const { data, error } = await rtt().insert(input).select('*').single();
      if (error) throw error;
      return data as RecurringTaskTemplate;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useUpdateRecurringTemplate() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<RecurringTemplateInput> & { id: string }): Promise<RecurringTaskTemplate> => {
      const { data, error } = await rtt().update(updates).eq('id', id).select('*').single();
      if (error) throw error;
      return data as RecurringTaskTemplate;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

/** Тогл is_active — отдельный мьютатор для чекбокса-переключателя в списке. */
export function useToggleRecurringTemplate() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }): Promise<void> => {
      const { error } = await rtt().update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useDeleteRecurringTemplate() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await rtt().delete().eq('id', id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
