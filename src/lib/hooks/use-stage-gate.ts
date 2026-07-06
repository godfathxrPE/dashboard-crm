'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { UnmetRequirement } from '@/types/database';

/**
 * Чек-лист готовности сделки к входу в стадию `targetStageId`.
 *
 * Зовёт `check_stage_requirements(project, stage)` (SECURITY DEFINER, миграция
 * 027) — та же проверка, что и enforcement-триггер. Пустой массив = все
 * требования закрыты (переход пройдёт). Enabled только при наличии обоих id.
 */
export function useStageGate(
  projectId: string | null | undefined,
  targetStageId: string | null | undefined,
) {
  return useQuery({
    queryKey: ['stage-gate', projectId ?? null, targetStageId ?? null],
    enabled: !!projectId && !!targetStageId,
    staleTime: 1000 * 30,
    queryFn: async (): Promise<UnmetRequirement[]> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('check_stage_requirements', {
        p_project_id: projectId!,
        p_target_stage_id: targetStageId!,
      });
      if (error) throw error;
      return (data ?? []) as UnmetRequirement[];
    },
  });
}
