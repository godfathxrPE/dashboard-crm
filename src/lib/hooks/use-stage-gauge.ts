'use client';

import { useDwellThresholds, useStageTargetDays } from '@/lib/hooks/use-org-settings';
import { resolveStageNorm, stageTimeGauge, type StageTimeGauge } from '@/lib/domain/stage-norm';

/**
 * Тайм-датчик стадии для компактных поверхностей (S-PIPELINE-RING-2).
 * Та же математика, что у ячейки кокпита (ProjectStageCockpit) — один контракт:
 * норма = org-оверрайд по stage_id → порог phase_group (он же порог «залипла»).
 *
 * `stage: null` (терминал/стадия не найдена) либо пустой `stageEnteredAt` ⇒ null,
 * кольцо не рисуется.
 *
 * ⚠️ Оба хука зовутся ДО раннего выхода — порядок хуков обязан быть стабилен.
 * ⚠️ Для СПИСКОВ этот хук не годится (в ячейке-функции хук звать нельзя):
 * там `useDwellThresholds`/`useStageTargetDays` собираются один раз на таблицу,
 * а в ячейке зовутся чистые `resolveStageNorm`/`stageTimeGauge` — см. ProjectsTable.
 */
export function useStageTimeGauge(
  stageEnteredAt: string | null | undefined,
  stage: { id: string; phase_group: string | null } | null | undefined,
): StageTimeGauge | null {
  const dwell = useDwellThresholds();
  const targetDays = useStageTargetDays();
  if (!stage || !stageEnteredAt) return null;
  return stageTimeGauge(stageEnteredAt, resolveStageNorm(stage, targetDays, dwell), new Date());
}
