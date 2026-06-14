import type { DealStage } from '@/types/database';
import type { PipelineStage } from '@/types/database';

/**
 * Backward-compat mapping: IIoT pipeline stage order_index → old DealStage enum.
 * Used to keep the legacy `stage` column populated for legacy IIoT-UI
 * (StackedPipeline order, ProjectDetail next/prev navigation).
 *
 * ⚠️ order_index в IIOT_STAGE_MAP — это порядок СТАРОГО enum `deal_stage`,
 * а НЕ текущих pipeline_stages. Они уже разошлись: напр. order_index 9 в БД =
 * «Защита КП», а map отдаёт contract_review; order_index 10 = «Договор», map →
 * contract_signing. При любом дальнейшем расхождении зеркало `stage` будет
 * семантически смещено относительно stage_id (источник истины).
 * Аналитика и фильтры won/lost уже переведены на stage_id/phase_group (Путь A).
 * TODO: полный депрекейт `stage` через Путь B (StackedPipeline + ProjectDetail
 * next/prev на pipeline_stages.order_index, затем DROP COLUMN projects.stage).
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
