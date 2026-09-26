'use client';

import { useStageNormInputs } from '@/lib/hooks/use-org-settings';
import {
  resolveStageNorm,
  stageNormDateKey,
  stageTimeGauge,
  type StageTimeGauge,
} from '@/lib/domain/stage-norm';

/**
 * Тайм-датчик стадии для компактных поверхностей (S-PIPELINE-RING-2).
 * Та же математика, что у ячейки кокпита (ProjectStageCockpit) — один контракт:
 * норма = org-оверрайд по stage_id → порог phase_group (он же порог «залипла»).
 *
 * `stage: null` (терминал/стадия не найдена) либо пустой `stageEnteredAt` ⇒ null,
 * кольцо не рисуется.
 *
 * P-6: пока настройки организации не ответили (`useStageNormInputs() === null`) —
 * тоже null: кольцо по дефолтному порогу группы показало бы неправду.
 *
 * ⚠️ Хук норм зовётся ДО раннего выхода — порядок хуков обязан быть стабилен.
 * ⚠️ Для СПИСКОВ этот хук не годится (в ячейке-функции хук звать нельзя):
 * там `useStageNormInputs` собирается один раз на таблицу, а в ячейке зовутся
 * чистые `resolveStageNorm`/`stageTimeGauge` — см. ProjectsTable.
 */
export function useStageTimeGauge(
  stageEnteredAt: string | null | undefined,
  stage: { id: string; phase_group: string | null } | null | undefined,
): StageTimeGauge | null {
  const inputs = useStageNormInputs();
  if (!inputs || !stage || !stageEnteredAt) return null;
  return stageTimeGauge(
    stageEnteredAt,
    resolveStageNorm(stage, inputs.targetDays, inputs.dwell),
    new Date(),
  );
}

/**
 * S-DEAL-DEADLINES-1 (задача 3): день нормы стадии для ОБЩЕЙ оси таймлайна и
 * кокпита. Входы норм (`useStageNormInputs`) и `resolveStageNorm` — те же, что
 * у соседа выше, поэтому пунктир «норма стадии» и заливка ячейки кокпита не
 * могут разойтись: величина одна, меняется только её проекция (проценты расхода
 * против календарного дня).
 *
 * Вынесено в хук, а не поднято пропом через `ProjectDetail`: норма к этому
 * моменту считается в четырёх местах (кокпит, `ProjectsTable`, `DealSignals`,
 * `useStageTimeGauge`), и пятый проп через два уровня добавил бы проводку,
 * а не источник истины.
 *
 * P-6: до ответа настроек организации — null, пунктира нормы нет.
 *
 * ⚠️ Хук норм зовётся ДО раннего выхода — порядок хуков обязан быть стабилен.
 */
export function useStageNormDateKey(
  stageEnteredAt: string | null | undefined,
  stage: { id: string; phase_group: string | null } | null | undefined,
): string | null {
  const inputs = useStageNormInputs();
  if (!inputs || !stage || !stageEnteredAt) return null;
  return stageNormDateKey(stageEnteredAt, resolveStageNorm(stage, inputs.targetDays, inputs.dwell));
}
