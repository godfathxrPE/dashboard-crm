import type { DealStage } from '@/types/database';
import type { PipelineStage } from '@/types/database';

/**
 * Backward-compat mapping: IIoT pipeline stage order_index → old DealStage enum.
 * Used to keep the legacy `stage` column populated for Kanban grouping
 * until Sprint 1.5 migrates Kanban to stage_id + phase_group.
 */
const IIOT_STAGE_MAP: Record<number, DealStage> = {
  1: 'new_lead',
  2: 'qualification',
  3: 'waiting_materials',
  4: 'preparing_kp',
  5: 'preparing_docs',
  6: 'cz_approval',
  7: 'trilateral_meeting',
  8: 'experiment_setup',
  9: 'contract_review',
  10: 'contract_signing',
  11: 'contract_signing', // "Запуск проекта" — closest old value
  12: 'won',
  13: 'lost',
};

/**
 * Given a pipeline stage and direction, return the legacy `stage` value.
 * - IIoT: maps via order_index → DealStage enum
 * - ERP: returns null (no legacy equivalent)
 */
export function mapToLegacyStage(
  pipelineStage: PipelineStage | undefined,
  direction: 'erp' | 'iiot',
): DealStage | null {
  if (direction === 'erp' || !pipelineStage) return null;
  return IIOT_STAGE_MAP[pipelineStage.order_index] ?? null;
}
