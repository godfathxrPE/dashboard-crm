'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { PipelineExpectedRole, StakeholderRole } from '@/types/database';

/**
 * S-DEAL-ROLES-1: ожидаемые роли контура по воронке (`pipeline_expected_roles`, 130).
 *
 * Профиль тот же, что у `useStageRequirements`: org-scoped справочник, читается на
 * карточке, RLS отдаёт только свою org. Мутаций здесь НЕТ намеренно — состав слотов
 * правится из «Настроек организации» (owner/admin), а не из карточки сделки; UI
 * настроек — отдельным спринтом.
 *
 * ⚠️ Миграция 130 на гейте: тип строки берётся из ВРЕМЕННОГО стаба в `database.ts`.
 * После apply + `npm run db:gen-types` стаб снимается тем же заходом.
 *
 * `staleTime` 5 минут — настройка организации меняется раз в месяцы; перезапрашивать
 * её на каждом монтировании карточки незачем.
 */
export function usePipelineExpectedRoles(pipelineId: string | null | undefined) {
  return useQuery({
    queryKey: ['pipeline-expected-roles', pipelineId ?? null],
    enabled: !!pipelineId,
    staleTime: 1000 * 60 * 5,
    queryFn: async (): Promise<PipelineExpectedRole[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('pipeline_expected_roles')
        .select('id, org_id, pipeline_id, role, is_required, hint, sort_order, created_at, updated_at')
        .eq('pipeline_id', pipelineId!)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      // Сужение `role` к union на границе хука — в БД это `text` + CHECK
      // `pipeline_expected_roles_role_chk`, автогенерация честно отдаёт `string`
      // (тот же приём, что у `DealStakeholder.role`).
      return (data ?? []).map((r) => ({ ...r, role: r.role as StakeholderRole }));
    },
  });
}
