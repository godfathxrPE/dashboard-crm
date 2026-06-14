import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Pipeline, PipelineStage, Direction, PipelineEntityType } from '@/types/database';

/**
 * Load all pipelines. Cached long — pipelines almost never change at runtime.
 */
export function usePipelines() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['pipelines'],
    queryFn: async (): Promise<Pipeline[]> => {
      const { data, error } = await supabase
        .from('pipelines')
        .select('*')
        .order('direction', { ascending: true });
      if (error) throw error;
      return data as Pipeline[];
    },
    staleTime: 1000 * 60 * 10,
  });
}

/**
 * Load all pipeline stages. Cached long.
 */
export function usePipelineStages() {
  const supabase = createClient();

  return useQuery({
    queryKey: ['pipeline-stages'],
    queryFn: async (): Promise<PipelineStage[]> => {
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('*')
        .order('pipeline_id')
        .order('order_index');
      if (error) throw error;
      return data as PipelineStage[];
    },
    staleTime: 1000 * 60 * 10,
  });
}

/**
 * Helper: get stages for a given pipeline_id.
 */
export function useStagesForPipeline(pipelineId: string | null | undefined) {
  const { data: stages } = usePipelineStages();
  if (!pipelineId || !stages) return [];
  return stages.filter((s) => s.pipeline_id === pipelineId);
}

/**
 * Predicate factory: is a project active (not won/lost)?
 * Источник истины — stage_id → pipeline_stages.is_won/is_lost, без legacy enum `stage`.
 * Fallback (пока стадии грузятся / нет совпадения) — поле `status`.
 */
export function useIsProjectActive() {
  const { data: stages } = usePipelineStages();
  return useMemo(() => {
    const byId = new Map((stages ?? []).map((s) => [s.id, s] as const));
    return (project: { stage_id: string; status?: string | null }) => {
      const st = byId.get(project.stage_id);
      if (st) return !st.is_won && !st.is_lost;
      return project.status !== 'won' && project.status !== 'lost';
    };
  }, [stages]);
}

/**
 * Helper: find default pipeline for given direction + entity_type.
 */
export function useDefaultPipeline(
  direction: Direction,
  entityType: PipelineEntityType,
): Pipeline | undefined {
  const { data: pipelines } = usePipelines();
  return pipelines?.find(
    (p) => p.direction === direction && p.entity_type === entityType && p.is_default,
  );
}
