'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type {
  StageRequirement,
  RequirementType,
  StageRequirementConfig,
} from '@/types/database';

const QUERY_KEY = ['stage-requirements'] as const;

// ═══════════════════════════════════════════════════════
// Read — требования по воронке (видят все члены org; RLS отдаёт только свою org)
// ═══════════════════════════════════════════════════════

export function useStageRequirements(pipelineId: string | null | undefined) {
  return useQuery({
    queryKey: [...QUERY_KEY, pipelineId ?? null],
    enabled: !!pipelineId,
    staleTime: 1000 * 60,
    queryFn: async (): Promise<StageRequirement[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('stage_requirements')
        .select('*')
        .eq('pipeline_id', pipelineId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as StageRequirement[];
    },
  });
}

// ═══════════════════════════════════════════════════════
// Mutations — write доступен owner/admin (RLS enforced)
// ═══════════════════════════════════════════════════════

export interface StageRequirementInput {
  pipeline_id: string;
  stage_id: string;
  requirement_type: RequirementType;
  config: StageRequirementConfig;
  error_hint: string;
  is_active?: boolean;
}

/**
 * Создать требование. org_id проставляется ЯВНО (на stage_requirements нет
 * set_org_id-триггера — паттерн invitations): берём из RPC current_org_id.
 */
export function useCreateStageRequirement() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: StageRequirementInput): Promise<StageRequirement> => {
      const supabase = createClient();
      const { data: orgId, error: orgErr } = await supabase.rpc('current_org_id');
      if (orgErr) throw orgErr;
      if (!orgId) throw new Error('Нет активной организации');

      const { data, error } = await supabase
        .from('stage_requirements')
        .insert({ ...input, org_id: orgId as string })
        .select('*')
        .single();
      if (error) throw error;
      return data as StageRequirement;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useUpdateStageRequirement() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<StageRequirementInput> & { id: string }): Promise<StageRequirement> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('stage_requirements')
        .update(updates)
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data as StageRequirement;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}

export function useDeleteStageRequirement() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const supabase = createClient();
      const { error } = await supabase.from('stage_requirements').delete().eq('id', id);
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: QUERY_KEY }),
  });
}
