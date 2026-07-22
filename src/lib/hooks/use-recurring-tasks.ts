'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { RecurringTaskTemplate } from '@/types/entities';
import type { RecurringCadence, TaskLane, TaskPriority } from '@/types/database';

// ═══════════════════════════════════════════════════════
// S-RECUR-1: recurring_task_templates (069 применена, типы сгенерированы).
// org_id проставляет trg_set_org_id; created_by — DEFAULT auth.uid(). Спавн
// инстансов — только spawn_recurring_tasks() (SECURITY DEFINER, cron); клиент
// шаблоны не спавнит.
// ═══════════════════════════════════════════════════════

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
  const supabase = createClient();

  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<RecurringTaskTemplate[]> => {
      const { data, error } = await supabase
        .from('recurring_task_templates')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as RecurringTaskTemplate[];
    },
  });
}

export function useCreateRecurringTemplate() {
  const supabase = createClient();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: RecurringTemplateInput): Promise<RecurringTaskTemplate> => {
      const { data, error } = await supabase
        .from('recurring_task_templates')
        .insert(input)
        .select('*')
        .single();
      if (error) throw error;
      return data as RecurringTaskTemplate;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useUpdateRecurringTemplate() {
  const supabase = createClient();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<RecurringTemplateInput> & { id: string }): Promise<RecurringTaskTemplate> => {
      const { data, error } = await supabase
        .from('recurring_task_templates')
        .update(updates)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data as RecurringTaskTemplate;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

/** Тогл is_active — отдельный мьютатор для чекбокса-переключателя в списке. */
export function useToggleRecurringTemplate() {
  const supabase = createClient();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }): Promise<void> => {
      const { error } = await supabase
        .from('recurring_task_templates')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useDeleteRecurringTemplate() {
  const supabase = createClient();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const { error } = await supabase.from('recurring_task_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
