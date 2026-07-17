'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  AutomationRule,
  AutomationTriggerType,
  AutomationTriggerConfig,
  AutomationActionType,
  AutomationActionConfig,
  AutomationCondition,
  TablesInsert,
  TablesUpdate,
} from '@/types/database';

const QUERY_KEY = ['automation-rules'] as const;

// ═══════════════════════════════════════════════════════
// Read — правила автоматизации (видят все члены org; RLS отдаёт только свою org)
// ═══════════════════════════════════════════════════════

export function useAutomationRules() {
  return useQuery({
    queryKey: QUERY_KEY,
    staleTime: 1000 * 60,
    queryFn: async (): Promise<AutomationRule[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('automation_rules')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as AutomationRule[];
    },
  });
}

// ═══════════════════════════════════════════════════════
// Mutations — write доступен owner/admin (RLS enforced)
// ═══════════════════════════════════════════════════════

export interface AutomationRuleInput {
  name: string;
  trigger_type: AutomationTriggerType;
  trigger_config: AutomationTriggerConfig;
  action_type: AutomationActionType;
  action_config: AutomationActionConfig;
  conditions?: AutomationCondition[];   // дефолт [] на стороне БД (050)
  is_active?: boolean;
}

/**
 * Создать правило. org_id проставляется ЯВНО (на automation_rules нет
 * set_org_id-триггера — паттерн stage_requirements): берём из RPC current_org_id.
 */
export function useCreateAutomationRule() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: AutomationRuleInput): Promise<AutomationRule> => {
      const supabase = createClient();
      const { data: orgId, error: orgErr } = await supabase.rpc('current_org_id');
      if (orgErr) throw orgErr;
      if (!orgId) throw new Error('Нет активной организации');

      const { data, error } = await supabase
        .from('automation_rules')
        .insert({ ...input, org_id: orgId as string } as unknown as TablesInsert<'automation_rules'>)
        .select('*')
        .single();
      if (error) throw error;
      return data as unknown as AutomationRule;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useUpdateAutomationRule() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<AutomationRuleInput> & { id: string }): Promise<AutomationRule> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('automation_rules')
        .update(updates as unknown as TablesUpdate<'automation_rules'>)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data as unknown as AutomationRule;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useDeleteAutomationRule() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const supabase = createClient();
      const { error } = await supabase.from('automation_rules').delete().eq('id', id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
