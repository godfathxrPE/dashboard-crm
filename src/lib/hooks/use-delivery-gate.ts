'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';

// ═══════════════════════════════════════════════════════
// Delivery P3: гейт завершения проекта внедрения (миграция 038)
// ═══════════════════════════════════════════════════════

/** Открытая веха приёмки — элемент open_milestones из check_delivery_completion */
export interface OpenMilestone {
  id: string;
  text: string;
  /** Имя фазы (project_columns.name); null — задача без колонки */
  phase: string | null;
  lane: string;
}

export interface DeliveryGateResult {
  ready: boolean;
  open_milestones: OpenMilestone[];
}

/** Narrowing ответа RPC (jsonb приходит как unknown — образец useStageGate) */
function parseGateResult(data: unknown): DeliveryGateResult {
  if (!data || typeof data !== 'object') return { ready: false, open_milestones: [] };
  const d = data as { ready?: unknown; open_milestones?: unknown };
  return {
    ready: d.ready === true,
    open_milestones: Array.isArray(d.open_milestones)
      ? (d.open_milestones as OpenMilestone[])
      : [],
  };
}

/**
 * Чек-лист готовности delivery-проекта к завершению.
 *
 * Зовёт `check_delivery_completion(project)` (SECURITY DEFINER, миграция 038) —
 * та же проверка, что enforcement-триггер `trg_zz_delivery_completion_gate`.
 * ready=true — все is_milestone-задачи в lane='done' (или вех нет вовсе).
 * Свежесть после закрытия вехи на доске держит явная инвалидация
 * ['delivery-gate'] в useUpdateTask (НЕ refetchOnMount).
 *
 * `enabled` передаёт вызывающий: isDelivery && status === 'open'.
 */
export function useDeliveryGate(projectId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['delivery-gate', projectId ?? null],
    enabled: !!projectId && enabled,
    staleTime: 1000 * 30,
    queryFn: async (): Promise<DeliveryGateResult> => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('check_delivery_completion', {
        p_project_id: projectId!,
      });
      if (error) throw error;
      return parseGateResult(data as unknown);
    },
  });
}
